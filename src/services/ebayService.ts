import { logger } from "../logger/index.js";

const EBAY_OAUTH_URL = "https://api.ebay.com/identity/v1/oauth2/token";
const EBAY_BROWSE_URL = "https://api.ebay.com/buy/browse/v1/item_summary/search";

// Category IDs for trading cards on eBay
const CATEGORY_IDS: Record<string, string> = {
  basketball: "214",
  football:   "213",
  baseball:   "212",
  soccer:     "261328",
  pokemon:    "183454",
  other:      "212",
};

let cachedToken: { token: string; expiresAt: number } | null = null;

async function getEbayToken(): Promise<string> {
  if (cachedToken && Date.now() < cachedToken.expiresAt - 60_000) {
    return cachedToken.token;
  }

  const clientId = process.env.EBAY_CLIENT_ID;
  const clientSecret = process.env.EBAY_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error("eBay credentials not configured");

  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");

  const res = await fetch(EBAY_OAUTH_URL, {
    method: "POST",
    headers: {
      Authorization: `Basic ${credentials}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials&scope=https%3A%2F%2Fapi.ebay.com%2Foauth%2Fapi_scope",
  });

  const data = (await res.json()) as any;
  if (!res.ok) throw new Error(`eBay OAuth failed: ${data.error_description ?? res.status}`);

  cachedToken = {
    token: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  };

  logger.info("eBay OAuth token refreshed");
  return cachedToken.token;
}

export interface PriceLookupResult {
  avgPrice: number;
  minPrice: number;
  maxPrice: number;
  sampleSize: number;
  currency: string;
  listings: Array<{ title: string; price: number; url: string }>;
}

export interface PriceSearchParams {
  name: string;
  year?: string;
  setName?: string;
  cardNumber?: string;
  gradeCompany?: string;
  gradeValue?: string;
  category?: string;
}

async function fetchEbay(
  token: string,
  query: string,
  categoryId: string
): Promise<any[]> {
  const params = new URLSearchParams({ q: query, category_ids: categoryId, limit: "20" });
  const res = await fetch(`${EBAY_BROWSE_URL}?${params}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      "X-EBAY-C-MARKETPLACE-ID": "EBAY_US",
      "Content-Type": "application/json",
    },
  });
  const data = (await res.json()) as any;
  if (!res.ok) throw new Error(`eBay search failed: ${data.errors?.[0]?.message ?? res.statusText}`);
  return data.itemSummaries ?? [];
}

export async function searchCardPrices(
  query: string,
  category?: string
): Promise<PriceLookupResult> {
  const token = await getEbayToken();
  const categoryId = category ? (CATEGORY_IDS[category.toLowerCase()] ?? "212") : "212";

  // Parse the query back into parts for fallback strategy.
  // The query is built as: name year set cardNumber gradeCompany gradeValue
  // We try progressively looser queries until we get results.
  const parts = query.trim().split(/\s+/);

  // Build fallback tiers by dropping from the end one term at a time,
  // but always keep at minimum 2 terms (the name).
  let items: any[] = [];
  let usedQuery = query;

  for (let end = parts.length; end >= 2; end--) {
    const attempt = parts.slice(0, end).join(" ");
    logger.debug({ attempt, categoryId }, "eBay query attempt");
    items = await fetchEbay(token, attempt, categoryId);
    if (items.length > 0) {
      usedQuery = attempt;
      break;
    }
  }

  if (items.length > 0) {
    logger.info({ usedQuery, results: items.length }, "eBay search success");
  } else {
    logger.warn({ query }, "eBay returned no results for any fallback");
  }

  const validListings = items
    .map((item: any) => ({
      title: item.title as string,
      price: parseFloat(item.price?.value ?? "0"),
      url: item.itemWebUrl as string,
    }))
    .filter((l) => l.price > 0);

  if (validListings.length === 0) {
    return { avgPrice: 0, minPrice: 0, maxPrice: 0, sampleSize: 0, currency: "USD", listings: [] };
  }

  const prices = validListings.map((l) => l.price);
  const avg = prices.reduce((a, b) => a + b, 0) / prices.length;

  return {
    avgPrice: Math.round(avg * 100) / 100,
    minPrice: Math.min(...prices),
    maxPrice: Math.max(...prices),
    sampleSize: prices.length,
    currency: items[0]?.price?.currency ?? "USD",
    listings: validListings.slice(0, 5),
  };
}

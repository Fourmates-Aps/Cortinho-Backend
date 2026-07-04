import { logger } from "../logger/index.js";

const EBAY_OAUTH_URL  = "https://api.ebay.com/identity/v1/oauth2/token";
const EBAY_BROWSE_URL = "https://api.ebay.com/buy/browse/v1/item_summary/search";
const EBAY_ITEM_URL   = "https://api.ebay.com/buy/browse/v1/item";

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

// ── eBay listing parser ───────────────────────────────────────

export interface ListingImport {
  title:        string;
  name:         string;       // parsed card name
  year:         number | null;
  price:        number | null;
  currency:     string;
  imageUrl:     string | null;
  imageBackUrl: string | null;
  itemId:       string;
  listingUrl:   string;
  gradeCompany: string | null;
  gradeValue:   number | null;
  category:     string | null;
}

function extractItemId(url: string): string | null {
  // formats: /itm/123456789  /itm/title/123456789  /i/123456789
  const m = url.match(/\/itm\/(?:[^/]+\/)?(\d{10,14})|\/i\/(\d{10,14})/);
  return m ? (m[1] ?? m[2]) : null;
}

function inferCategory(title: string): string | null {
  const t = title.toLowerCase();
  if (/pokemon|charizard|pikachu|eevee|mewtwo/.test(t)) return "pokemon";
  if (/soccer|football uk|premier league|bundesliga|serie a|la liga/.test(t)) return "soccer";
  if (/\bnba\b|basketball/.test(t)) return "basketball";
  if (/\bnfl\b|football/.test(t)) return "football";
  return null;
}

function inferGrade(title: string): { gradeCompany: string | null; gradeValue: number | null } {
  // "PSA 9", "BGS 9.5", "CGC 8", "SGC 10"
  const m = title.match(/\b(PSA|BGS|CGC|SGC)\s+(\d+(?:\.\d)?)\b/i);
  if (!m) return { gradeCompany: null, gradeValue: null };
  return { gradeCompany: m[1].toUpperCase(), gradeValue: parseFloat(m[2]) };
}

function stripGradeAndNoise(title: string): string {
  return title
    .replace(/\b(PSA|BGS|CGC|SGC)\s+\d+(?:\.\d)?\b/gi, "")
    .replace(/\b(graded|rookie|rc|sp|ssp|holo|foil|refractor|prizm|auto|autograph|patch|rpa|numbered|\/\d+)\b/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

export async function parseEbayListing(url: string): Promise<ListingImport> {
  const itemId = extractItemId(url);
  if (!itemId) throw new Error("Could not extract eBay item ID from URL");

  const token = await getEbayToken();

  // eBay Browse API uses legacy ID format: v1|{itemId}|0
  const res = await fetch(`${EBAY_ITEM_URL}/v1%7C${itemId}%7C0`, {
    headers: {
      Authorization:             `Bearer ${token}`,
      "X-EBAY-C-MARKETPLACE-ID": "EBAY_US",
      "Content-Type":            "application/json",
    },
  });

  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as any;
    throw new Error(`eBay item fetch failed: ${err.errors?.[0]?.message ?? res.status}`);
  }

  const item = (await res.json()) as any;

  const title  = (item.title as string) ?? "";
  const price  = item.price?.value ? parseFloat(item.price.value) : null;
  const images: string[] = [
    item.image?.imageUrl,
    ...(item.additionalImages ?? []).map((i: any) => i.imageUrl),
  ].filter(Boolean);

  // Year: 4-digit number between 1950 and current year + 1
  const currentYear = new Date().getFullYear();
  const yearMatch   = title.match(/\b(19[5-9]\d|20[0-2]\d)\b/);
  const year        = yearMatch ? parseInt(yearMatch[1]) : null;

  const { gradeCompany, gradeValue } = inferGrade(title);
  const category = inferCategory(title);
  const name     = stripGradeAndNoise(title);

  logger.info({ itemId, title, year, price, gradeCompany }, "eBay listing parsed");

  return {
    title,
    name,
    year,
    price,
    currency:     item.price?.currency ?? "USD",
    imageUrl:     images[0] ?? null,
    imageBackUrl: images[1] ?? null,
    itemId,
    listingUrl:   item.itemWebUrl ?? url,
    gradeCompany,
    gradeValue,
    category,
  };
}

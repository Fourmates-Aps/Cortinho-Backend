import { db } from "../../db.js";
import { cards, priceHistory } from "../../drizzle/schema.js";
import { eq, and, isNull, desc, sql, gte } from "drizzle-orm";

export async function getCollectionSummary(userId: number) {
  const allCards = await db.query.cards.findMany({
    where: and(eq(cards.userId, userId), isNull(cards.deletedAt)),
    columns: {
      id: true, status: true, category: true,
      currentValue: true, purchasePrice: true,
      isGraded: true, isRookie: true, isAutographed: true,
    },
  });

  const active  = allCards.filter((c) => c.status === "collection");
  const sum     = (arr: typeof allCards, key: "currentValue" | "purchasePrice") =>
    arr.reduce((s, c) => s + (Number(c[key]) || 0), 0);

  const totalValue = sum(active, "currentValue");
  const totalCost  = sum(active, "purchasePrice");

  const byCategory: Record<string, { count: number; value: number }> = {};
  for (const c of active) {
    const cat = c.category ?? "other";
    if (!byCategory[cat]) byCategory[cat] = { count: 0, value: 0 };
    byCategory[cat].count++;
    byCategory[cat].value += Number(c.currentValue) || 0;
  }

  return {
    totalCards:      allCards.length,
    collectionCount: active.length,
    wishlistCount:   allCards.filter((c) => c.status === "wishlist").length,
    forSaleCount:    allCards.filter((c) => c.status === "for_sale").length,
    soldCount:       allCards.filter((c) => c.status === "sold").length,
    gradedCount:     allCards.filter((c) => c.isGraded).length,
    rookieCount:     allCards.filter((c) => c.isRookie).length,
    totalValue:      +totalValue.toFixed(2),
    totalCost:       +totalCost.toFixed(2),
    totalPl:         +(totalValue - totalCost).toFixed(2),
    plPct:           totalCost > 0 ? +((totalValue - totalCost) / totalCost * 100).toFixed(2) : null,
    byCategory,
  };
}

export async function getPortfolioTimeline(userId: number, days = 90) {
  const since = new Date();
  since.setDate(since.getDate() - days);

  const rows = await db
    .select({
      date:  sql<string>`DATE_TRUNC('day', ${priceHistory.recordedAt})::DATE`.as("date"),
      value: sql<string>`ROUND(SUM(${priceHistory.value}), 2)`.as("value"),
    })
    .from(priceHistory)
    .innerJoin(cards, eq(cards.id, priceHistory.cardId))
    .where(
      and(
        eq(cards.userId, userId),
        isNull(cards.deletedAt),
        gte(priceHistory.recordedAt, since)
      )
    )
    .groupBy(sql`DATE_TRUNC('day', ${priceHistory.recordedAt})`)
    .orderBy(sql`DATE_TRUNC('day', ${priceHistory.recordedAt})`);

  return rows.map((r) => ({ date: r.date, value: Number(r.value) }));
}

export async function getRecentCards(userId: number, limit = 6) {
  return db.query.cards.findMany({
    where:   and(eq(cards.userId, userId), isNull(cards.deletedAt), eq(cards.status, "collection")),
    orderBy: desc(cards.createdAt),
    limit,
    columns: { id: true, name: true, setName: true, category: true, currentValue: true, imageUrl: true, isRookie: true, isAutographed: true, isGraded: true, gradeValue: true },
  });
}

export async function getDashboardStats(userId: number) {
  const [summary, timeline, recent] = await Promise.all([
    getCollectionSummary(userId),
    getPortfolioTimeline(userId, 90),
    getRecentCards(userId, 6),
  ]);

  return { summary, timeline, recentCards: recent };
}

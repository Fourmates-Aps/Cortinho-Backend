import { db } from "../../db.js";
import { transactions, platforms } from "../../drizzle/schema.js";
import { eq, and, gte, lte, desc, count, SQL, inArray } from "drizzle-orm";
import { z } from "zod";

export const createTransactionSchema = z.object({
  cardId:          z.number().int().positive().optional(),
  type:            z.enum(["buy", "sell", "trade", "pull", "gift"]),
  price:           z.number().min(0).default(0),
  counterparty:    z.string().max(256).optional(),
  platformId:      z.number().int().optional(),
  platformCustom:  z.string().max(128).optional(),
  tradedFor:       z.string().max(256).optional(),
  note:            z.string().optional(),
  transactionDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Must be YYYY-MM-DD"),
});

export const updateTransactionSchema = createTransactionSchema.partial();

export const listTransactionsSchema = z.object({
  page:            z.coerce.number().int().positive().default(1),
  pageSize:        z.coerce.number().int().min(1).max(100).default(20),
  type:            z.enum(["buy", "sell", "trade", "pull", "gift", "all"]).default("all"),
  platformId:      z.coerce.number().int().optional(),
  startDate:       z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  endDate:         z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  cardId:          z.coerce.number().int().optional(),
});

export type CreateTransactionInput = z.infer<typeof createTransactionSchema>;
export type ListTransactionsInput  = z.infer<typeof listTransactionsSchema>;

export async function listTransactions(userId: number, input: ListTransactionsInput) {
  const conditions: SQL[] = [eq(transactions.userId, userId)];

  if (input.type !== "all")  conditions.push(eq(transactions.type, input.type));
  if (input.platformId)      conditions.push(eq(transactions.platformId, input.platformId));
  if (input.cardId)          conditions.push(eq(transactions.cardId, input.cardId));
  if (input.startDate)       conditions.push(gte(transactions.transactionDate, input.startDate));
  if (input.endDate)         conditions.push(lte(transactions.transactionDate, input.endDate));

  const where  = and(...conditions);
  const offset = (input.page - 1) * input.pageSize;

  const [rows, [{ total }]] = await Promise.all([
    db.query.transactions.findMany({
      where,
      limit:   input.pageSize,
      offset,
      orderBy: desc(transactions.transactionDate),
      with:    { card: { columns: { id: true, name: true, setName: true, imageUrl: true } } },
    }),
    db.select({ total: count() }).from(transactions).where(where),
  ]);

  const n = Number(total);
  return { items: rows, total: n, page: input.page, pageSize: input.pageSize, totalPages: Math.ceil(n / input.pageSize) };
}

export async function getTransaction(userId: number, txId: number) {
  return db.query.transactions.findFirst({
    where: and(eq(transactions.id, txId), eq(transactions.userId, userId)),
    with:  { card: { columns: { id: true, name: true, setName: true, imageUrl: true } } },
  });
}

export async function createTransaction(userId: number, input: CreateTransactionInput) {
  const [tx] = await db
    .insert(transactions)
    .values({ ...input, userId, price: String(input.price) } as any)
    .returning();
  return tx;
}

export async function updateTransaction(userId: number, txId: number, input: Partial<CreateTransactionInput>) {
  const [tx] = await db
    .update(transactions)
    .set({ ...input, ...(input.price !== undefined && { price: String(input.price) }), updatedAt: new Date() } as any)
    .where(and(eq(transactions.id, txId), eq(transactions.userId, userId)))
    .returning();
  return tx ?? null;
}

export async function deleteTransaction(userId: number, txId: number): Promise<boolean> {
  const [r] = await db
    .delete(transactions)
    .where(and(eq(transactions.id, txId), eq(transactions.userId, userId)))
    .returning({ id: transactions.id });
  return !!r;
}

export async function getTransactionSummary(userId: number) {
  const all = await db.query.transactions.findMany({ where: eq(transactions.userId, userId) });

  const totalSpent  = all.filter((t) => t.type === "buy").reduce((s, t)  => s + Number(t.price), 0);
  const totalEarned = all.filter((t) => t.type === "sell").reduce((s, t) => s + Number(t.price), 0);

  return {
    total:        all.length,
    totalSpent:   +totalSpent.toFixed(2),
    totalEarned:  +totalEarned.toFixed(2),
    netPl:        +(totalEarned - totalSpent).toFixed(2),
    byType: {
      buy:   all.filter((t) => t.type === "buy").length,
      sell:  all.filter((t) => t.type === "sell").length,
      trade: all.filter((t) => t.type === "trade").length,
      pull:  all.filter((t) => t.type === "pull").length,
      gift:  all.filter((t) => t.type === "gift").length,
    },
  };
}

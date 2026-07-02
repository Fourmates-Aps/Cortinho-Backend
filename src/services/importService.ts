import { db } from "../../db.js";
import { cards, priceHistory } from "../../drizzle/schema.js";
import { z } from "zod";

const rowSchema = z.object({
  name:          z.string().min(1).max(256),
  category:      z.enum(["pokemon","soccer","basketball","football","other"]).default("other"),
  player:        z.string().max(256).optional(),
  team:          z.string().max(256).optional(),
  year:          z.coerce.number().int().optional(),
  setName:       z.string().max(256).optional(),
  cardNumber:    z.string().max(64).optional(),
  isRookie:      z.preprocess((v) => v === "true" || v === true || v === 1, z.boolean()).default(false),
  isAutographed: z.preprocess((v) => v === "true" || v === true || v === 1, z.boolean()).default(false),
  isPatch:       z.preprocess((v) => v === "true" || v === true || v === 1, z.boolean()).default(false),
  isGraded:      z.preprocess((v) => v === "true" || v === true || v === 1, z.boolean()).default(false),
  gradeCompanyId:z.coerce.number().int().optional(),
  gradeValue:    z.coerce.number().min(1).max(10).optional(),
  certNumber:    z.string().max(64).optional(),
  condition:     z.enum(["poor","fair","good","very_good","excellent","near_mint","mint","gem_mint"]).optional(),
  purchasePrice: z.coerce.number().min(0).optional(),
  currentValue:  z.coerce.number().min(0).optional(),
  purchaseDate:  z.string().optional(),
  notes:         z.string().optional(),
  status:        z.enum(["collection","wishlist","for_sale","sold","traded","draft"]).default("collection"),
});

export const importBodySchema = z.object({
  rows: z.array(z.record(z.string(), z.unknown())).min(1).max(500),
});

export interface ImportResult {
  imported: number;
  skipped:  number;
  errors:   { row: number; reason: string }[];
}

export async function importCards(userId: number, rawRows: Record<string, unknown>[]): Promise<ImportResult> {
  const result: ImportResult = { imported: 0, skipped: 0, errors: [] };
  const validRows: { card: any; currentValue?: number }[] = [];

  // Validate all rows first — fail early on schema issues
  for (let i = 0; i < rawRows.length; i++) {
    const parsed = rowSchema.safeParse(rawRows[i]);
    if (!parsed.success) {
      result.errors.push({ row: i + 1, reason: parsed.error.issues.map((e) => e.message).join("; ") });
      result.skipped++;
      continue;
    }
    const { currentValue, ...cardData } = parsed.data;
    validRows.push({ card: cardData, currentValue });
  }

  if (validRows.length === 0) return result;

  // Bulk insert all valid cards in one transaction
  await db.transaction(async (tx) => {
    for (const { card, currentValue } of validRows) {
      const [inserted] = await tx
        .insert(cards)
        .values({
          ...card,
          userId,
          purchasePrice: card.purchasePrice !== undefined ? String(card.purchasePrice) : undefined,
          currentValue:  currentValue         !== undefined ? String(currentValue)       : undefined,
        } as any)
        .returning({ id: cards.id });

      if (currentValue !== undefined) {
        await tx.insert(priceHistory).values({
          cardId: inserted.id,
          value:  String(currentValue),
          source: "import",
        });
      }

      result.imported++;
    }
  });

  return result;
}

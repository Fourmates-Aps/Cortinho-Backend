import { Router } from "express";
import { asyncHandler } from "../../middleware/errorHandler.js";
import { validate, idParamSchema } from "../../middleware/validate.js";
import { sendSuccess, sendError } from "../../utils/response.js";
import { ErrorCode } from "../../types/api.js";
import {
  listCards, getCard, createCard, updateCard, softDeleteCard,
  getPriceHistory, logPrice, bulkCreateCards,
  createCardSchema, updateCardSchema, listCardsSchema,
} from "../../services/cardService.js";
import { z } from "zod";

const router = Router();

// GET /v1/cards
router.get(
  "/",
  asyncHandler(async (req, res) => {
    // Validate and parse query params (can't use validate middleware for query since req.query is read-only)
    const parsed = listCardsSchema.safeParse(req.query);
    if (!parsed.success) {
      return sendError(res, 400, ErrorCode.VALIDATION_ERROR, "Invalid query parameters", req.requestId, parsed.error.flatten().fieldErrors);
    }
    const result = await listCards(req.dbUserId!, parsed.data);
    sendSuccess(res, result, 200, req.requestId);
  })
);

// GET /v1/cards/:id
router.get(
  "/:id",
  validate(idParamSchema, "params"),
  asyncHandler(async (req, res) => {
    const card = await getCard(req.dbUserId!, (req.params as any).id);
    if (!card) return sendError(res, 404, ErrorCode.NOT_FOUND, "Card not found", req.requestId);
    sendSuccess(res, card, 200, req.requestId);
  })
);

// POST /v1/cards
router.post(
  "/",
  validate(createCardSchema),
  asyncHandler(async (req, res) => {
    const card = await createCard(req.dbUserId!, req.body);
    sendSuccess(res, card, 201, req.requestId);
  })
);

// PATCH /v1/cards/:id
router.patch(
  "/:id",
  validate(idParamSchema, "params"),
  validate(updateCardSchema),
  asyncHandler(async (req, res) => {
    const card = await updateCard(req.dbUserId!, (req.params as any).id, req.body);
    if (!card) return sendError(res, 404, ErrorCode.NOT_FOUND, "Card not found", req.requestId);
    sendSuccess(res, card, 200, req.requestId);
  })
);

// DELETE /v1/cards/:id  (soft delete)
router.delete(
  "/:id",
  validate(idParamSchema, "params"),
  asyncHandler(async (req, res) => {
    const deleted = await softDeleteCard(req.dbUserId!, (req.params as any).id);
    if (!deleted) return sendError(res, 404, ErrorCode.NOT_FOUND, "Card not found", req.requestId);
    sendSuccess(res, { deleted: true }, 200, req.requestId);
  })
);

// PATCH /v1/cards/:id/visibility
const visibilitySchema = z.object({ isPublic: z.boolean() });
router.patch(
  "/:id/visibility",
  validate(idParamSchema, "params"),
  validate(visibilitySchema),
  asyncHandler(async (req, res) => {
    const card = await updateCard(req.dbUserId!, (req.params as any).id, { isPublic: req.body.isPublic });
    if (!card) return sendError(res, 404, ErrorCode.NOT_FOUND, "Card not found", req.requestId);
    sendSuccess(res, { id: card.id, isPublic: card.isPublic }, 200, req.requestId);
  })
);

// GET /v1/cards/:id/price-history
router.get(
  "/:id/price-history",
  validate(idParamSchema, "params"),
  asyncHandler(async (req, res) => {
    const history = await getPriceHistory(req.dbUserId!, (req.params as any).id);
    if (!history) return sendError(res, 404, ErrorCode.NOT_FOUND, "Card not found", req.requestId);
    sendSuccess(res, history, 200, req.requestId);
  })
);

// POST /v1/cards/:id/price-history
const logPriceSchema = z.object({
  value:  z.number().positive(),
  source: z.enum(["manual","pricecharting","ebay_lookup","import","ai_scan"]).default("manual"),
  note:   z.string().max(256).optional(),
});

router.post(
  "/:id/price-history",
  validate(idParamSchema, "params"),
  validate(logPriceSchema),
  asyncHandler(async (req, res) => {
    const entry = await logPrice(
      req.dbUserId!, (req.params as any).id,
      req.body.value, req.body.source, req.body.note
    );
    if (!entry) return sendError(res, 404, ErrorCode.NOT_FOUND, "Card not found", req.requestId);
    sendSuccess(res, entry, 201, req.requestId);
  })
);

// POST /v1/cards/import — bulk CSV import (JSON rows, already parsed client-side)
const importSchema = z.object({
  rows: z.array(z.record(z.string(), z.unknown())).nonempty().refine((a) => a.length <= 1000, "Max 1000 rows per import"),
});

router.post(
  "/import",
  validate(importSchema),
  asyncHandler(async (req, res) => {
    const result = await bulkCreateCards(req.dbUserId!, req.body.rows);
    sendSuccess(res, result, 200, req.requestId);
  })
);

export default router;

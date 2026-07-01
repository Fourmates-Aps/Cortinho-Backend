import { Router } from "express";
import { asyncHandler } from "../../middleware/errorHandler.js";
import { validate } from "../../middleware/validate.js";
import { sendSuccess } from "../../utils/response.js";
import { importCards, importBodySchema } from "../../services/importService.js";
import { cache, CacheKey } from "../../cache/index.js";

const router = Router();

// POST /v1/import/cards
// Body: { rows: Record<string, unknown>[] }  (pre-parsed by PapaParse on client)
// Max 500 rows per request — enforce in importBodySchema
router.post(
  "/cards",
  validate(importBodySchema),
  asyncHandler(async (req, res) => {
    const result = await importCards(req.dbUserId!, req.body.rows);

    // Bust card list cache after bulk import
    await cache.del(CacheKey.userCards(req.dbUserId!));

    sendSuccess(res, result, 200, req.requestId);
  })
);

export default router;

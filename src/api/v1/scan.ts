import { Router } from "express";
import { asyncHandler } from "../../middleware/errorHandler.js";
import { validate } from "../../middleware/validate.js";
import { aiLimiter } from "../../middleware/rateLimit.js";
import { sendSuccess, sendError } from "../../utils/response.js";
import { ErrorCode } from "../../types/api.js";
import { scanCard, scanCardSchema } from "../../services/aiService.js";

const router = Router();

// POST /v1/scan
// Body: { frontImage: { data: base64, mimeType: "image/jpeg" }, backImage?: {...} }
// Rate-limited to 10 req/min per user (AI cost guard)
router.post(
  "/",
  aiLimiter,
  validate(scanCardSchema),
  asyncHandler(async (req, res) => {
    if (!process.env.GEMINI_API_KEY) {
      return sendError(res, 503, ErrorCode.INTERNAL, "AI scan not configured on this server", req.requestId);
    }

    const result = await scanCard(req.body);
    sendSuccess(res, result, 200, req.requestId);
  })
);

export default router;

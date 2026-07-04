import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../../middleware/errorHandler.js";
import { sendSuccess, sendError } from "../../utils/response.js";
import { ErrorCode } from "../../types/api.js";
import { parseEbayListing } from "../../services/ebayService.js";

const router = Router();

const parseSchema = z.object({
  url: z.string().url().includes("ebay.com"),
});

// POST /v1/ebay/parse-listing
// Body: { url: "https://www.ebay.com/itm/..." }
router.post(
  "/parse-listing",
  asyncHandler(async (req, res) => {
    const parsed = parseSchema.safeParse(req.body);
    if (!parsed.success) {
      return sendError(res, 400, ErrorCode.VALIDATION_ERROR, "Valid eBay URL required", req.requestId);
    }

    if (!process.env.EBAY_CLIENT_ID || !process.env.EBAY_CLIENT_SECRET) {
      return sendError(res, 503, ErrorCode.INTERNAL, "eBay integration not configured", req.requestId);
    }

    try {
      const result = await parseEbayListing(parsed.data.url);
      sendSuccess(res, result, 200, req.requestId);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to parse listing";
      sendError(res, 502, ErrorCode.INTERNAL, msg, req.requestId);
    }
  })
);

export default router;

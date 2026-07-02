import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../../middleware/errorHandler.js";
import { validate } from "../../middleware/validate.js";
import { sendSuccess, sendError } from "../../utils/response.js";
import { ErrorCode } from "../../types/api.js";
import { getPresignedUploadUrl } from "../../services/r2.js";

const router = Router();

const presignedUrlSchema = z.object({
  filename: z.string().min(1).max(255),
  contentType: z.enum(["image/jpeg", "image/png", "image/webp"]),
});

// POST /v1/upload/presigned
// Returns presigned URL for direct browser upload to R2
router.post(
  "/presigned",
  validate(presignedUrlSchema),
  asyncHandler(async (req, res) => {
    try {
      if (!req.dbUserId) {
        return sendError(res, 401, ErrorCode.UNAUTHORIZED, "User not authenticated", req.requestId);
      }
      const { filename, contentType } = req.body;
      const result = await getPresignedUploadUrl(req.dbUserId, filename, contentType);
      sendSuccess(res, result, 200, req.requestId);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Upload setup failed";
      sendError(res, 503, ErrorCode.INTERNAL, msg, req.requestId);
    }
  })
);

export default router;

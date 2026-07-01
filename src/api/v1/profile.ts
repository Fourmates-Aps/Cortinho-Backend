import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../../middleware/errorHandler.js";
import { validate } from "../../middleware/validate.js";
import { sendSuccess, sendError } from "../../utils/response.js";
import { ErrorCode } from "../../types/api.js";
import { cache, CacheKey } from "../../cache/index.js";
import { db } from "../../../db.js";
import { users } from "../../../drizzle/schema.js";
import { eq } from "drizzle-orm";

const router = Router();

// GET /v1/profile
router.get(
  "/",
  asyncHandler(async (req, res) => {
    const cacheKey = CacheKey.userProfile(req.dbUserId!);
    const cached = await cache.get(cacheKey);
    if (cached) return sendSuccess(res, cached, 200, req.requestId);

    const user = await db.query.users.findFirst({
      where:   eq(users.id, req.dbUserId!),
      columns: { id: true, clerkId: true, email: true, firstName: true, lastName: true, role: true, currency: true, createdAt: true },
    });

    if (!user) return sendError(res, 404, ErrorCode.NOT_FOUND, "User not found", req.requestId);
    await cache.set(cacheKey, user, 300);
    sendSuccess(res, user, 200, req.requestId);
  })
);

const updateProfileSchema = z.object({
  firstName: z.string().max(128).optional(),
  lastName:  z.string().max(128).optional(),
  currency:  z.enum(["USD", "EUR", "GBP", "DKK"]).optional(),
});

// PATCH /v1/profile
router.patch(
  "/",
  validate(updateProfileSchema),
  asyncHandler(async (req, res) => {
    const [updated] = await db
      .update(users)
      .set({ ...req.body, updatedAt: new Date() })
      .where(eq(users.id, req.dbUserId!))
      .returning();

    await cache.del(CacheKey.userProfile(req.dbUserId!));
    sendSuccess(res, updated, 200, req.requestId);
  })
);

export default router;

import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../../middleware/errorHandler.js";
import { validate } from "../../middleware/validate.js";
import { sendSuccess, sendError } from "../../utils/response.js";
import { ErrorCode } from "../../types/api.js";
import { cache, CacheKey } from "../../cache/index.js";
import { db } from "../../../db.js";
import { users } from "../../../drizzle/schema.js";
import { eq, and, ne, sql } from "drizzle-orm";

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
      columns: { id: true, clerkId: true, email: true, firstName: true, lastName: true, role: true, currency: true, username: true, profilePublic: true, showValues: true, bio: true, avatarUrl: true, createdAt: true },
    });

    if (!user) return sendError(res, 404, ErrorCode.NOT_FOUND, "User not found", req.requestId);
    await cache.set(cacheKey, user, 300);
    sendSuccess(res, user, 200, req.requestId);
  })
);

// GET /v1/profile/username/check?u=nouman
router.get(
  "/username/check",
  asyncHandler(async (req, res) => {
    const u = (req.query.u as string || "").toLowerCase().trim();
    if (!u || !/^[a-z0-9_-]{3,40}$/.test(u)) {
      return sendError(res, 400, ErrorCode.VALIDATION_ERROR, "Username must be 3–40 chars: letters, numbers, _ or -", req.requestId);
    }
    const existing = await db.query.users.findFirst({
      where: and(sql`LOWER(${users.username}) = ${u}`, ne(users.id, req.dbUserId!)),
      columns: { id: true },
    });
    sendSuccess(res, { available: !existing, username: u }, 200, req.requestId);
  })
);

const updateProfileSchema = z.object({
  firstName:     z.string().max(128).optional(),
  lastName:      z.string().max(128).optional(),
  currency:      z.enum(["USD", "EUR", "GBP", "DKK"]).optional(),
  username:      z.string().min(3).max(40).regex(/^[a-zA-Z0-9_-]+$/, "Letters, numbers, _ or - only").optional().nullable(),
  profilePublic: z.boolean().optional(),
  showValues:    z.boolean().optional(),
  bio:           z.string().max(300).optional().nullable(),
  avatarUrl:     z.string().url().max(500).optional().nullable(),
});

// PATCH /v1/profile
router.patch(
  "/",
  validate(updateProfileSchema),
  asyncHandler(async (req, res) => {
    const body = req.body as z.infer<typeof updateProfileSchema>;

    if (body.username) {
      const slug = body.username.toLowerCase();
      const conflict = await db.query.users.findFirst({
        where: and(sql`LOWER(${users.username}) = ${slug}`, ne(users.id, req.dbUserId!)),
        columns: { id: true },
      });
      if (conflict) {
        return sendError(res, 409, ErrorCode.VALIDATION_ERROR, "Username already taken", req.requestId);
      }
      body.username = slug;
    }

    const [updated] = await db
      .update(users)
      .set({ ...body, updatedAt: new Date() })
      .where(eq(users.id, req.dbUserId!))
      .returning();

    await cache.del(CacheKey.userProfile(req.dbUserId!));
    sendSuccess(res, updated, 200, req.requestId);
  })
);

export default router;

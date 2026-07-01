// Dual-mode auth middleware:
//   Web  → Bearer token from Clerk (useAuth().getToken())
//   iOS  → same Bearer token, no cookie required
//
// After verification, resolves the internal DB user ID so handlers never
// touch clerk_id directly — they use req.dbUserId for all DB queries.

import { Request, Response, NextFunction } from "express";
import jwt, { JwtPayload } from "jsonwebtoken";
import crypto from "crypto";
import { cache, CacheKey, cached } from "../cache/index.js";
import { db } from "../../db.js";
import { users } from "../../drizzle/schema.js";
import { eq } from "drizzle-orm";
import { env } from "../config/env.js";
import { logger } from "../logger/index.js";
import { sendError } from "../utils/response.js";
import { ErrorCode } from "../types/api.js";

interface ClerkJwks { keys: ClerkJwk[] }
interface ClerkJwk  { kid: string; kty: string; [k: string]: unknown }
interface ClerkPayload extends JwtPayload { sub: string }

async function fetchJwks(): Promise<ClerkJwks> {
  const url = `https://${env.CLERK_INSTANCE}/.well-known/jwks.json`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`JWKS fetch failed: ${res.status}`);
  return res.json() as Promise<ClerkJwks>;
}

function jwkToPem(jwk: ClerkJwk): string {
  const key = crypto.createPublicKey({ key: jwk as any, format: "jwk" });
  return key.export({ format: "pem", type: "spki" }).toString();
}

async function verifyClerkJwt(token: string): Promise<string> {
  const jwks = await cached<ClerkJwks>(CacheKey.jwks(), 3600, fetchJwks);
  const decoded = jwt.decode(token, { complete: true });
  if (!decoded) throw new Error("Malformed JWT");

  const kid = (decoded.header as any).kid as string;
  const jwk = jwks.keys.find((k) => k.kid === kid);
  if (!jwk) throw new Error("No matching JWK for kid");

  const pem = jwkToPem(jwk);
  const payload = jwt.verify(token, pem, {
    algorithms: ["RS256"],
    issuer:     `https://${env.CLERK_INSTANCE}`,
  }) as ClerkPayload;

  return payload.sub;
}

async function resolveDbUser(clerkId: string): Promise<number> {
  const cacheKey = `clerk:${clerkId}:dbUserId`;
  const hit = await cache.get<number>(cacheKey);
  if (hit !== null) return hit;

  let user = await db.query.users.findFirst({
    where:   eq(users.clerkId, clerkId),
    columns: { id: true },
  });

  // Fallback upsert: Clerk webhook may not have fired yet (first login, dev env).
  if (!user) {
    logger.info({ clerkId }, "DB user not found — creating via auth fallback upsert");
    const [inserted] = await db
      .insert(users)
      .values({ clerkId, email: `${clerkId}@unknown.clerk` })
      .onConflictDoUpdate({ target: users.clerkId, set: { updatedAt: new Date() } })
      .returning({ id: users.id });
    user = inserted;
  }

  await cache.set(cacheKey, user.id, 300);
  return user.id;
}

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    return sendError(res, 401, ErrorCode.UNAUTHORIZED, "Missing Bearer token", req.requestId);
  }

  const token = authHeader.slice(7);
  try {
    const clerkId = await verifyClerkJwt(token);
    const dbUserId = await resolveDbUser(clerkId);
    req.userId   = clerkId;
    req.dbUserId = dbUserId;
    next();
  } catch (err) {
    logger.warn({ err, requestId: req.requestId }, "Auth failed");
    return sendError(res, 401, ErrorCode.UNAUTHORIZED, "Invalid or expired token", req.requestId);
  }
}

// Admin-only guard — always chained after requireAuth
export async function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const user = await db.query.users.findFirst({
    where: eq(users.id, req.dbUserId!),
    columns: { role: true },
  });
  if (user?.role !== "admin") {
    return sendError(res, 403, ErrorCode.FORBIDDEN, "Admin access required", req.requestId);
  }
  next();
}

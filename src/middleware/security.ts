import helmet from "helmet";
import cors from "cors";
import { env } from "../config/env.js";
import type { Express } from "express";

const allowedOrigins = env.ALLOWED_ORIGINS.split(",").map((o) => o.trim());

export function applySecurityMiddleware(app: Express): void {
  // ── Helmet — security headers ─────────────────────────────
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc:  ["'self'"],
          scriptSrc:   ["'self'"],
          styleSrc:    ["'self'"],
          imgSrc:      ["'self'", "data:", "https:"],
          connectSrc:  ["'self'"],
          objectSrc:   ["'none'"],
          upgradeInsecureRequests: [],
        },
      },
      crossOriginEmbedderPolicy: false,  // allow card images from S3
      hsts: {
        maxAge: 31_536_000,
        includeSubDomains: true,
        preload: true,
      },
    })
  );

  // ── CORS ─────────────────────────────────────────────────
  // Web: allowed origins list (localhost dev + production domain)
  // iOS: no origin header → allowed (native mobile apps don't send Origin)
  app.use(
    cors({
      origin: (origin, cb) => {
        // Native mobile apps and server-to-server calls have no Origin
        if (!origin) return cb(null, true);
        if (allowedOrigins.includes(origin)) return cb(null, true);
        cb(new Error(`Origin ${origin} not allowed by CORS`));
      },
      credentials:     true,   // allow cookies for web
      allowedHeaders:  ["Content-Type", "Authorization", "x-request-id", "x-platform"],
      exposedHeaders:  ["x-request-id", "x-ratelimit-remaining", "x-ratelimit-reset"],
      methods:         ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
      maxAge:          600,    // preflight cache 10 min
    })
  );

  // ── Hide server fingerprint ──────────────────────────────
  app.disable("x-powered-by");
}

import { Request, Response, NextFunction } from "express";
import { z, ZodSchema } from "zod";
import { sendError } from "../utils/response.js";
import { ErrorCode } from "../types/api.js";

type Target = "body" | "query" | "params";

// Factory: returns middleware that validates req[target] against schema.
// On failure → 400 with field-level Zod issues.
// On success → attaches parsed (coerced) data back to req[target].
export function validate<T extends ZodSchema>(schema: T, target: Target = "body") {
  return (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req[target]);
    if (!result.success) {
      return sendError(
        res, 400, ErrorCode.VALIDATION_ERROR,
        "Request validation failed",
        req.requestId,
        result.error.flatten().fieldErrors
      );
    }
    if (target !== "query") {
      (req as any)[target] = result.data;
    } else {
      // req.query is read-only in Express; store parsed data for handlers that need it
      (req as any).parsedQuery = result.data;
    }
    next();
  };
}

// ── Shared query param schemas ────────────────────────────────
export const paginationSchema = z.object({
  page:     z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export const idParamSchema = z.object({
  id: z.coerce.number().int().positive(),
});

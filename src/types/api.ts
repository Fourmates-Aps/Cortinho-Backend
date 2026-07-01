// ─────────────────────────────────────────────────────────────
// Standard API response envelope
// All endpoints return this shape — enables iOS clients to handle
// success/error uniformly without inspecting HTTP status codes.
// ─────────────────────────────────────────────────────────────

export interface ApiSuccess<T> {
  ok:        true;
  data:      T;
  requestId: string;
  ts:        string;   // ISO-8601 UTC
}

export interface ApiError {
  ok:        false;
  error: {
    code:    string;   // machine-readable: "NOT_FOUND", "VALIDATION_ERROR", etc.
    message: string;   // human-readable
    details?: unknown; // Zod issues, field errors, etc.
  };
  requestId: string;
  ts:        string;
}

export type ApiResponse<T> = ApiSuccess<T> | ApiError;

// ── Pagination ────────────────────────────────────────────────
export interface Paginated<T> {
  items:      T[];
  total:      number;
  page:       number;
  pageSize:   number;
  totalPages: number;
}

// ── Error codes ───────────────────────────────────────────────
export const ErrorCode = {
  BAD_REQUEST:       "BAD_REQUEST",
  UNAUTHORIZED:      "UNAUTHORIZED",
  FORBIDDEN:         "FORBIDDEN",
  NOT_FOUND:         "NOT_FOUND",
  CONFLICT:          "CONFLICT",
  VALIDATION_ERROR:  "VALIDATION_ERROR",
  RATE_LIMITED:      "RATE_LIMITED",
  INTERNAL:          "INTERNAL_SERVER_ERROR",
} as const;

export type ErrorCodeValue = (typeof ErrorCode)[keyof typeof ErrorCode];

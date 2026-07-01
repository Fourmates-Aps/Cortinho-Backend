import { Response } from "express";
import type { ApiSuccess, ApiError, ErrorCodeValue } from "../types/api.js";

export function sendSuccess<T>(res: Response, data: T, status = 200, requestId = ""): void {
  const body: ApiSuccess<T> = {
    ok:        true,
    data,
    requestId: requestId || res.req?.requestId || "",
    ts:        new Date().toISOString(),
  };
  res.status(status).json(body);
}

export function sendError(
  res:       Response,
  status:    number,
  code:      ErrorCodeValue,
  message:   string,
  requestId: string,
  details?:  unknown
): void {
  const body: ApiError = {
    ok:    false,
    error: { code, message, ...(details !== undefined && { details }) },
    requestId,
    ts:    new Date().toISOString(),
  };
  res.status(status).json(body);
}

import { Router } from "express";
import { asyncHandler } from "../../middleware/errorHandler.js";
import { validate, idParamSchema } from "../../middleware/validate.js";
import { sendSuccess, sendError } from "../../utils/response.js";
import { ErrorCode } from "../../types/api.js";
import {
  listTransactions, getTransaction, createTransaction,
  updateTransaction, deleteTransaction, getTransactionSummary, exportTransactionsCsv,
  createTransactionSchema, updateTransactionSchema, listTransactionsSchema,
} from "../../services/transactionService.js";

const router = Router();

// GET /v1/transactions
router.get("/", asyncHandler(async (req, res) => {
  const parsed = listTransactionsSchema.safeParse(req.query);
  if (!parsed.success) {
    return sendError(res, 400, ErrorCode.VALIDATION_ERROR, "Invalid query params", req.requestId);
  }
  const result = await listTransactions(req.dbUserId!, parsed.data);
  sendSuccess(res, result, 200, req.requestId);
}));

// GET /v1/transactions/summary
router.get("/summary", asyncHandler(async (req, res) => {
  const summary = await getTransactionSummary(req.dbUserId!);
  sendSuccess(res, summary, 200, req.requestId);
}));

// GET /v1/transactions/export?year=2026
router.get("/export", asyncHandler(async (req, res) => {
  const year = parseInt(req.query.year as string) || new Date().getFullYear();
  if (year < 2000 || year > 2100) {
    return sendError(res, 400, ErrorCode.VALIDATION_ERROR, "Invalid year", req.requestId);
  }
  const csv = await exportTransactionsCsv(req.dbUserId!, year);
  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", `attachment; filename="cortinho-tax-report-${year}.csv"`);
  res.send(csv);
}));

// GET /v1/transactions/:id
router.get("/:id", validate(idParamSchema, "params"), asyncHandler(async (req, res) => {
  const tx = await getTransaction(req.dbUserId!, (req.params as any).id);
  if (!tx) return sendError(res, 404, ErrorCode.NOT_FOUND, "Transaction not found", req.requestId);
  sendSuccess(res, tx, 200, req.requestId);
}));

// POST /v1/transactions
router.post("/", validate(createTransactionSchema), asyncHandler(async (req, res) => {
  const tx = await createTransaction(req.dbUserId!, req.body);
  sendSuccess(res, tx, 201, req.requestId);
}));

// PATCH /v1/transactions/:id
router.patch("/:id",
  validate(idParamSchema, "params"),
  validate(updateTransactionSchema),
  asyncHandler(async (req, res) => {
    const tx = await updateTransaction(req.dbUserId!, (req.params as any).id, req.body);
    if (!tx) return sendError(res, 404, ErrorCode.NOT_FOUND, "Transaction not found", req.requestId);
    sendSuccess(res, tx, 200, req.requestId);
  })
);

// DELETE /v1/transactions/:id
router.delete("/:id", validate(idParamSchema, "params"), asyncHandler(async (req, res) => {
  const deleted = await deleteTransaction(req.dbUserId!, (req.params as any).id);
  if (!deleted) return sendError(res, 404, ErrorCode.NOT_FOUND, "Transaction not found", req.requestId);
  sendSuccess(res, { deleted: true }, 200, req.requestId);
}));

export default router;

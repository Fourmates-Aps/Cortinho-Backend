import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../../middleware/errorHandler.js";
import { validate } from "../../middleware/validate.js";
import { sendSuccess } from "../../utils/response.js";
import { getDashboardStats, getCollectionSummary, getPortfolioTimeline } from "../../services/statsService.js";

const router = Router();

// GET /v1/stats/dashboard  — single call for the whole Dashboard page
router.get("/dashboard", asyncHandler(async (req, res) => {
  const data = await getDashboardStats(req.dbUserId!);
  sendSuccess(res, data, 200, req.requestId);
}));

// GET /v1/stats/collection
router.get("/collection", asyncHandler(async (req, res) => {
  const data = await getCollectionSummary(req.dbUserId!);
  sendSuccess(res, data, 200, req.requestId);
}));

// GET /v1/stats/portfolio?days=90
router.get("/portfolio", validate(z.object({ days: z.coerce.number().int().min(7).max(365).default(90) }), "query"), asyncHandler(async (req, res) => {
  const data = await getPortfolioTimeline(req.dbUserId!, (req.query as any).days);
  sendSuccess(res, data, 200, req.requestId);
}));

export default router;

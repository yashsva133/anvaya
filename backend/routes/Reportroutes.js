/**
 * src/routes/reportRoutes.js
 */

import { Router } from "express";
import { body, param } from "express-validator";
import { reportLimiter } from "../middleware/rateLimiter.js";
import {
  listReportsHandler,
  getReportHandler,
  getResultsHandler,
  correctResultHandler,
  createReportHandler,
  confirmReportHandler,
} from "../controllers/Reportcontroller.js";

const router = Router();

const uuid = (name) => param(name).isUUID(4).withMessage(`${name} must be a valid UUID`);

// ── Patient reports list (My Reports screen) ──────────────────────────────────
// GET /api/patients/:patientId/reports
router.get("/patients/:patientId/reports", [uuid("patientId")], listReportsHandler);

// ── Single report (also accepts legacy_code like "aug26") ────────────────────
// GET /api/reports/:idOrCode
router.get("/reports/:idOrCode", getReportHandler);

// ── Extracted results for a report ───────────────────────────────────────────
// GET /api/reports/:reportId/results
router.get("/reports/:reportId/results", [uuid("reportId")], getResultsHandler);

// ── Edit result value (goes through anvaya.submit_value_correction) ───────────
// PATCH /api/reports/:reportId/results/:resultId/correct
router.patch(
  "/reports/:reportId/results/:resultId/correct",
  [
    uuid("reportId"),
    uuid("resultId"),
    body("value").isNumeric().withMessage("value must be numeric"),
    body("reason").notEmpty().withMessage("reason is required"),
  ],
  correctResultHandler
);

// ── Confirm report ("Looks correct" button) ────────────────────────────────────
// PATCH /api/reports/:reportId/confirm
router.patch("/reports/:reportId/confirm", [uuid("reportId")], confirmReportHandler);

// ── Create new report (pipeline entry point after OCR/parsing) ─────────────────
// POST /api/reports
router.post(
  "/reports",
  reportLimiter,
  [
    body("patient_id").isUUID(4).withMessage("patient_id must be a UUID"),
    body("collected_on").isISO8601().withMessage("collected_on must be an ISO date"),
    body("upload_channel")
      .optional()
      .isIn(["camera", "file", "manual", "sample"])
      .withMessage("upload_channel must be camera|file|manual|sample"),
    body("results").optional().isArray(),
    body("results.*.raw_name").if(body("results").exists()).notEmpty(),
    body("results.*.value").if(body("results").exists()).isNumeric(),
    body("results.*.unit").if(body("results").exists()).notEmpty(),
  ],
  createReportHandler
);

export default router;
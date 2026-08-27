/**
 * src/routes/reportRoutes.js
 *
 * WHY a separate route file?
 * Routes are just a wiring layer — HTTP verb + path → controller.
 * Keeping validation rules here (next to the path) makes it easy
 * to see at a glance what each endpoint accepts without opening the controller.
 */

import { Router } from "express";
import { body, param } from "express-validator";
import {
  createReportHandler,
  getReportHandler,
  confirmReportHandler,
  editResultHandler,
} from "../Reportcontroller.js";

const router = Router();

// ─── Shared validators ───────────────────────────────────────────────────────

const uuidParam = (name) =>
  param(name).isUUID(4).withMessage(`${name} must be a valid UUIDv4`);

// ─── Routes ──────────────────────────────────────────────────────────────────

/**
 * POST /api/reports
 * Create a report (and optionally its extracted results in one request).
 */
router.post(
  "/",
  [
    body("language")
      .optional()
      .isIn(["en", "hi"])
      .withMessage("language must be 'en' or 'hi'"),
    body("results")
      .optional()
      .isArray({ min: 1 })
      .withMessage("results must be a non-empty array"),
    body("results.*.name")
      .if(body("results").exists())
      .notEmpty()
      .withMessage("Each result must have a name"),
    body("results.*.value")
      .if(body("results").exists())
      .isNumeric()
      .withMessage("Each result.value must be numeric"),
    body("results.*.unit")
      .if(body("results").exists())
      .notEmpty()
      .withMessage("Each result must have a unit"),
    body("results.*.status")
      .if(body("results").exists())
      .isIn(["normal", "low", "high"])
      .withMessage("Each result.status must be 'normal', 'low', or 'high'"),
    body("results.*.range_label")
      .if(body("results").exists())
      .notEmpty()
      .withMessage("Each result must have a range_label"),
  ],
  createReportHandler
);

/**
 * GET /api/reports/:reportId
 * Fetch a report + all its results — drives the results confirmation page.
 */
router.get("/:reportId", [uuidParam("reportId")], getReportHandler);

/**
 * PATCH /api/reports/:reportId/confirm
 * "Looks correct" — mark a report as user-confirmed.
 */
router.patch(
  "/:reportId/confirm",
  [uuidParam("reportId")],
  confirmReportHandler
);

/**
 * PATCH /api/reports/:reportId/results/:resultId
 * "Edit result" — user corrects one extracted lab value.
 */
router.patch(
  "/:reportId/results/:resultId",
  [
    uuidParam("reportId"),
    uuidParam("resultId"),
    body("value").optional().isNumeric().withMessage("value must be numeric"),
    body("unit").optional().notEmpty().withMessage("unit cannot be blank"),
    body("status")
      .optional()
      .isIn(["normal", "low", "high"])
      .withMessage("status must be 'normal', 'low', or 'high'"),
  ],
  editResultHandler
);

export default router;
/**
 * src/controllers/reportController.js
 *
 * WHY a separate controller?
 * Controllers own req/res. They validate inputs, call the model,
 * and return shaped JSON. They never write raw SQL.
 * Keeping them separate means you can unit-test business logic
 * (e.g. "what if value is negative?") without spinning up Express.
 */

import { validationResult } from "express-validator";
import {
  createReport,
  getReportById,
  confirmReport,
  insertResults,
  updateResult,
} from "../models/reportModel.js";
import { formatReportResponse } from "../utils/formatters.js";

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/reports
// Body: { file_name?, language?, user_id?, results: [...] }
//
// Called after the AI/OCR layer extracts values from the uploaded PDF/image.
// Creates the report row + all result rows in one shot.
// ─────────────────────────────────────────────────────────────────────────────
export async function createReportHandler(req, res) {
  // 1. Check express-validator errors first
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, errors: errors.array() });
  }

  const { file_name, language, user_id, results } = req.body;

  try {
    // 2. Create the parent report row
    const report = await createReport({ file_name, language, user_id });

    // 3. If results were provided (AI already extracted them), bulk-insert
    let savedResults = [];
    if (Array.isArray(results) && results.length > 0) {
      savedResults = await insertResults(report.id, results);
    }

    return res.status(201).json({
      success: true,
      data: formatReportResponse(report, savedResults),
    });
  } catch (err) {
    console.error("[createReport]", err);
    return res.status(500).json({
      success: false,
      message: "Failed to create report.",
      detail: err.message,
    });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/reports/:reportId
// Returns the report + all its results — drives the "We found these results" page.
// ─────────────────────────────────────────────────────────────────────────────
export async function getReportHandler(req, res) {
  const { reportId } = req.params;

  try {
    const report = await getReportById(reportId);

    if (!report) {
      return res
        .status(404)
        .json({ success: false, message: "Report not found." });
    }

    return res.status(200).json({
      success: true,
      data: formatReportResponse(report, report.report_results),
    });
  } catch (err) {
    // Supabase returns PGRST116 when .single() finds no rows
    if (err.code === "PGRST116") {
      return res
        .status(404)
        .json({ success: false, message: "Report not found." });
    }
    console.error("[getReport]", err);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch report.",
      detail: err.message,
    });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /api/reports/:reportId/confirm
// "Looks correct" button — marks the report as confirmed by the user.
// ─────────────────────────────────────────────────────────────────────────────
export async function confirmReportHandler(req, res) {
  const { reportId } = req.params;

  try {
    const report = await confirmReport(reportId);
    return res.status(200).json({
      success: true,
      message: "Report confirmed.",
      data: { id: report.id, confirmed: report.confirmed, confirmed_at: report.confirmed_at },
    });
  } catch (err) {
    if (err.code === "PGRST116") {
      return res
        .status(404)
        .json({ success: false, message: "Report not found." });
    }
    console.error("[confirmReport]", err);
    return res.status(500).json({
      success: false,
      message: "Failed to confirm report.",
      detail: err.message,
    });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /api/reports/:reportId/results/:resultId
// "Edit result" button — user corrects a single extracted value.
// Body: { value?, unit?, range_label?, range_min?, range_max?, status? }
// ─────────────────────────────────────────────────────────────────────────────
export async function editResultHandler(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, errors: errors.array() });
  }

  const { reportId, resultId } = req.params;
  const patch = req.body;

  // Guard: at least one editable field must be present
  const editableFields = ["value", "unit", "range_label", "range_min", "range_max", "status"];
  const hasField = editableFields.some((f) => patch[f] !== undefined);
  if (!hasField) {
    return res.status(400).json({
      success: false,
      message: `Provide at least one of: ${editableFields.join(", ")}`,
    });
  }

  try {
    const updated = await updateResult(reportId, resultId, patch);
    return res.status(200).json({ success: true, data: updated });
  } catch (err) {
    if (err.code === "PGRST116") {
      return res.status(404).json({
        success: false,
        message: "Result not found or does not belong to this report.",
      });
    }
    console.error("[editResult]", err);
    return res.status(500).json({
      success: false,
      message: "Failed to update result.",
      detail: err.message,
    });
  }
}
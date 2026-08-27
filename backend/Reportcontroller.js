import { validationResult } from "express-validator";
import {
  createReport,
  getReportById,
  confirmReport,
  insertReportResults,
  updateReportResult,
} from "./Reportmodel.js";
import { formatReportResponse } from "./Formatters.js";

export async function createReportHandler(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, errors: errors.array() });
  }

  const { file_name, language, user_id, results } = req.body;

  try {
    const report = await createReport({ file_name, language, user_id });

    let savedResults = [];
    if (Array.isArray(results) && results.length > 0) {
      savedResults = await insertReportResults(report.id, results);
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
      data: formatReportResponse(report, report.test_results),
    });
  } catch (err) {
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

export async function confirmReportHandler(req, res) {
  const { reportId } = req.params;

  try {
    const report = await confirmReport(reportId);
    return res.status(200).json({
      success: true,
      message: "Report confirmed.",
      data: { id: report.id, status: report.status },
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

export async function editResultHandler(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, errors: errors.array() });
  }

  const { reportId, resultId } = req.params;
  const patch = req.body;

  const editableFields = ["value", "unit", "range_label", "range_min", "range_max", "status"];
  const hasField = editableFields.some((f) => patch[f] !== undefined);
  if (!hasField) {
    return res.status(400).json({
      success: false,
      message: `Provide at least one of: ${editableFields.join(", ")}`,
    });
  }

  try {
    const updated = await updateReportResult(reportId, resultId, patch);
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
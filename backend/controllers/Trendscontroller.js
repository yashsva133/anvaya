/**
 * src/controllers/trendsController.js
 * Backs: /trends screen
 */

import { getTrendSeries, getLatestResults } from "../models/Trendsmodel.js";

// GET /api/patients/:patientId/trends?tests=hgb,hba1c&limit=6
export async function getTrendsHandler(req, res) {
  const { patientId } = req.params;
  const testCodes = req.query.tests ? req.query.tests.split(",").map((t) => t.trim()) : undefined;
  const limit = req.query.limit ? parseInt(req.query.limit, 10) : undefined;

  try {
    const series = await getTrendSeries(patientId, testCodes, limit);

    // Group by test_code for the frontend chart structure
    const grouped = {};
    for (const row of series) {
      if (!grouped[row.test_code]) {
        grouped[row.test_code] = { test_code: row.test_code, name_en: row.name_en, points: [] };
      }
      grouped[row.test_code].points.push({
        report_id: row.report_id,
        legacy_code: row.legacy_code,
        collected_on: row.collected_on,
        value: Number(row.effective_value),
        unit: row.unit,
        status: row.computed_status,
        is_critical: row.is_critical,
        ref_low: row.ref_low !== null ? Number(row.ref_low) : null,
        ref_high: row.ref_high !== null ? Number(row.ref_high) : null,
        was_corrected: row.was_corrected,
      });
    }

    return res.status(200).json({ success: true, data: Object.values(grouped) });
  } catch (err) {
    console.error("[getTrends]", err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
}

// GET /api/patients/:patientId/latest
export async function getLatestHandler(req, res) {
  const { patientId } = req.params;
  const testCodes = req.query.tests ? req.query.tests.split(",").map((t) => t.trim()) : undefined;

  try {
    const results = await getLatestResults(patientId, testCodes);
    return res.status(200).json({ success: true, data: results });
  } catch (err) {
    console.error("[getLatest]", err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
}
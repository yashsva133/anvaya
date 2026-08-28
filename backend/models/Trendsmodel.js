/**
 * src/models/trendsModel.js
 *
 * Queries for the Trends screen (/trends).
 *
 * Schema alignment (from spec §3.3, §10.1):
 *  - v_test_history  — all measurements of each test per patient across reports
 *  - v_patient_latest_results — most recent measurement per test
 *
 * These views already join test_results → validation_results → lab_test_catalog
 * → lab_reports, so we query the view, not the raw tables.
 */

import { supabaseAdmin } from "../config/supabase.js";

/**
 * Get the full trend series for one patient, optionally filtered to specific tests.
 * Mirrors trendSeries() in src/lib/data.ts — same shape, backed by the real DB.
 *
 * @param {string} patientId
 * @param {string[]} [testCodes]  — e.g. ['hgb','hba1c']; omit for all tests
 * @param {number}   [limitReports] — cap on number of most-recent reports to scan
 */
export async function getTrendSeries(patientId, testCodes, limitReports) {
  let query = supabaseAdmin
    .from("v_test_history")
    .select(`
      patient_id, lab_test_id, test_code, name_en,
      report_id, legacy_code, collected_on,
      effective_value, unit,
      computed_status, is_critical,
      ref_low, ref_high, ocr_confidence, was_corrected
    `)
    .eq("patient_id", patientId)
    .order("collected_on", { ascending: true });

  if (testCodes && testCodes.length > 0) {
    query = query.in("test_code", testCodes);
  }

  const { data, error } = await query;
  if (error) throw error;

  // If limitReports requested, collect the N most-recent unique report dates
  if (limitReports && data.length > 0) {
    const dates = [...new Set(data.map((r) => r.collected_on))]
      .sort()
      .slice(-limitReports);
    return data.filter((r) => dates.includes(r.collected_on));
  }

  return data;
}

/**
 * Get the latest result for each test for a patient.
 * Mirrors latestEntry() in src/lib/data.ts.
 *
 * @param {string} patientId
 * @param {string[]} [testCodes] — filter to specific tests
 */
export async function getLatestResults(patientId, testCodes) {
  let query = supabaseAdmin
    .from("v_patient_latest_results")
    .select(`
      patient_id, lab_test_id, test_code, name_en,
      report_id, collected_on, effective_value, unit,
      computed_status, is_critical
    `)
    .eq("patient_id", patientId);

  if (testCodes && testCodes.length > 0) {
    query = query.in("test_code", testCodes);
  }

  const { data, error } = await query;
  if (error) throw error;
  return data;
}
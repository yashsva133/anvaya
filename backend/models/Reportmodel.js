/**
 * src/models/reportModel.js
 *
 * All database queries for the REPORTS / EXTRACTED-RESULTS / MY-REPORTS page cluster.
 *
 * Schema source of truth: anvaya_schema.sql (39 tables, 6 views).
 * Never re-derived here — table/column names match the schema exactly.
 *
 * Key schema facts:
 *  - lab_reports  — one row per uploaded report; legacy_code keeps feb26/apr26/… working
 *  - test_results — one row per (report, test); NO status column (status is derived)
 *  - validation_results — append-only SOURCE OF TRUTH for computed_status (immutable)
 *  - v_report_summary — derived counts; backs My Reports / Dashboard
 *  - v_test_history   — trend data; backs Trends screen
 *  - v_patient_latest_results — most recent measurement per test; backs Dashboard
 *  - anvaya.submit_value_correction() — the ONLY write path for editing a value
 */

import { supabaseAdmin, buildUserClient } from "../config/supabase.js";

// ─── My Reports list ─────────────────────────────────────────────────────────

/**
 * Fetch all reports for a patient from v_report_summary.
 * Backs: /reports screen ("My Reports")
 *
 * @param {string} patientId  — UUID from patients table
 * @returns {Promise<Array>}
 */
export async function getReportsByPatient(patientId) {
  const { data, error } = await supabaseAdmin
    .from("v_report_summary")
    .select(`
      id, legacy_code, status, collected_on, lab_name, report_number,
      upload_channel, created_at, updated_at,
      tests_count, attention_count, critical_count, borderline_count,
      normal_count, has_critical, is_released
    `)
    .eq("patient_id", patientId)
    .order("collected_on", { ascending: false });

  if (error) throw error;
  return data;
}

/**
 * Fetch a single report summary by its UUID or legacy_code (e.g. "aug26").
 * Legacy codes back the /compare?old=apr26&new=aug26 URL pattern.
 *
 * @param {string} idOrCode — UUID or legacy_code string
 */
export async function getReportByIdOrCode(idOrCode) {
  // Try UUID first; fall back to legacy_code
  const isUUID = /^[0-9a-f-]{36}$/i.test(idOrCode);

  const { data, error } = await supabaseAdmin
    .from("v_report_summary")
    .select(`
      id, patient_id, legacy_code, status, collected_on, lab_name,
      report_number, upload_channel, created_at, updated_at,
      tests_count, attention_count, critical_count, borderline_count,
      normal_count, has_critical, is_released
    `)
    .eq(isUUID ? "id" : "legacy_code", idOrCode)
    .single();

  if (error) throw error;
  return data;
}

// ─── Extracted results for a single report ───────────────────────────────────

/**
 * Fetch all test results for a report, with their current validated status.
 * Backs: /extracted page (the "We found these results" confirmation screen)
 *
 * Joins test_results → validation_results (current verdict) → lab_test_catalog.
 * Status comes from validation_results.computed_status — NEVER from test_results.
 *
 * @param {string} reportId — lab_reports.id UUID
 */
export async function getResultsByReport(reportId) {
  const { data, error } = await supabaseAdmin
    .from("test_results")
    .select(`
      id, sort_index,
      raw_name, raw_unit, raw_value_text, value_qualifier,
      value, unit, is_quantitative, qualitative_value,
      printed_ref_low, printed_ref_high, printed_ref_text,
      ocr_confidence, confidence_level, confidence_note_en, confidence_note_hi,
      value_source, original_value, corrected_value, corrected_at,
      lab_test_id,
      lab_test_catalog (
        id, code, name_en, name_hi, simple_name_en, simple_name_hi,
        default_unit, icon_key, category,
        what_med_en, what_simple_en, what_simple_hi, what_vs_en, what_vs_hi
      ),
      validation_results!current_validation_id (
        id, computed_status, is_critical, is_abnormal,
        ref_low, ref_high, critical_low, critical_high, borderline_frac,
        effective_value, unit, range_origin, rationale, computed_at
      )
    `)
    .eq("report_id", reportId)
    .order("sort_index", { ascending: true });

  if (error) throw error;
  return data;
}

// ─── Value correction ("Edit result" button) ─────────────────────────────────

/**
 * Submit a user correction for a parsed test value.
 *
 * The schema spec (§4.5, §5.2, §10.3) is explicit: this MUST go through
 * anvaya.submit_value_correction(), called with a USER-scoped client so
 * auth.uid() is set. Using supabaseAdmin would make auth.uid() null and
 * the function would correctly refuse.
 *
 * The function (defined in 0017_functions.sql):
 *   - validates the caller owns the report
 *   - writes corrected_value + corrected_by + corrected_at on test_results
 *   - inserts a new validation_results row with the corrected value
 *   - updates test_results.current_validation_id to point at the new row
 *   - writes an audit_logs entry
 *
 * @param {string} authHeader   — "Bearer <jwt>" from the request
 * @param {string} testResultId — test_results.id UUID
 * @param {number} newValue     — the corrected numeric value
 * @param {string} reason       — correction_reason (required by schema check)
 * @param {boolean} revalidate  — whether to re-run validation immediately (default true)
 */
export async function submitValueCorrection(authHeader, testResultId, newValue, reason, revalidate = true) {
  const userClient = buildUserClient(authHeader);
  const { data, error } = await userClient.rpc("submit_value_correction", {
    p_test_result_id: testResultId,
    p_corrected_value: newValue,
    p_reason: reason,
    p_revalidate: revalidate,
  });
  // Note: anvaya.submit_value_correction lives in the anvaya schema which is not
  // exposed via PostgREST's db_schemas. The spec (§10.3) says to call it over
  // a direct pg connection. Via Supabase JS client, use .rpc() which routes
  // through PostgREST's /rpc endpoint. If the project hasn't exposed anvaya,
  // the call must go through a route handler that uses a direct pg pool.
  // We surface the error clearly so the caller knows to switch approaches.
  if (error) throw error;
  return data;
}

// ─── Create a new report (upload entry point) ────────────────────────────────

/**
 * Insert a new lab_reports row and optionally seed test_results.
 * Called after OCR/parsing — this is a pipeline operation, so supabaseAdmin is correct.
 *
 * @param {{
 *   patient_id: string,
 *   collected_on: string,     // ISO date "YYYY-MM-DD"
 *   upload_channel?: string,  // 'camera'|'file'|'manual'|'sample'
 *   lab_name?: string,
 *   report_number?: string,
 *   legacy_code?: string,     // only when migrating demo data (feb26, apr26…)
 * }} reportData
 * @param {Array<{
 *   raw_name: string,
 *   raw_value_text: string,
 *   value: number,
 *   unit: string,
 *   printed_ref_low?: number,
 *   printed_ref_high?: number,
 *   printed_ref_text?: string,
 *   lab_test_id?: string,
 *   sort_index?: number,
 * }>} [results=[]]  — parsed test rows; validation is a separate pipeline step
 */
export async function createReport(reportData, results = []) {
  // 1. Insert the lab_report row
  const { data: report, error: rErr } = await supabaseAdmin
    .from("lab_reports")
    .insert({
      patient_id: reportData.patient_id,
      collected_on: reportData.collected_on,
      status: "uploaded",
      upload_channel: reportData.upload_channel ?? "manual",
      lab_name: reportData.lab_name ?? null,
      report_number: reportData.report_number ?? null,
      legacy_code: reportData.legacy_code ?? null,
    })
    .select()
    .single();

  if (rErr) throw rErr;

  // 2. Bulk-insert test_results if provided
  let savedResults = [];
  if (results.length > 0) {
    const rows = results.map((r, idx) => ({
      report_id: report.id,
      raw_name: r.raw_name,
      raw_value_text: r.raw_value_text ?? String(r.value),
      value: r.value,
      unit: r.unit,
      printed_ref_low: r.printed_ref_low ?? null,
      printed_ref_high: r.printed_ref_high ?? null,
      printed_ref_text: r.printed_ref_text ?? null,
      lab_test_id: r.lab_test_id ?? null,
      sort_index: r.sort_index ?? idx,
      value_source: "ocr",
    }));

    const { data: rData, error: tErr } = await supabaseAdmin
      .from("test_results")
      .insert(rows)
      .select();

    if (tErr) throw tErr;
    savedResults = rData;
  }

  return { report, results: savedResults };
}

// ─── Confirm report ("Looks correct" button) ─────────────────────────────────

/**
 * Mark a report as patient-confirmed.
 * Updates lab_reports.status to 'parsed' (the next stage after 'uploaded').
 * The full release workflow (doctor_reviews → report_releases) is a separate
 * pipeline step; this is just the patient's "yes this looks right" confirmation.
 *
 * @param {string} reportId
 */
export async function confirmReport(reportId) {
  const { data, error } = await supabaseAdmin
    .from("lab_reports")
    .update({ status: "parsed" })
    .eq("id", reportId)
    .select("id, status, updated_at")
    .single();

  if (error) throw error;
  return data;
}
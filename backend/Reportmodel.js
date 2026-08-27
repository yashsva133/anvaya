/**
 * backend/Reportmodel.js
 * Database operations mapped to Supabase schema:
 *   - public.lab_reports
 *   - public.test_results
 *   - public.patients
 */

import { supabaseAdmin } from "./supabase.js";

// Helper: Ensure a default patient exists for foreign key constraint
async function getOrCreatePatientId(userId) {
  if (userId) return userId;
  const { data: existing } = await supabaseAdmin
    .from("patients")
    .select("id")
    .limit(1)
    .maybeSingle();

  if (existing?.id) return existing.id;

  const { data: newPatient } = await supabaseAdmin
    .from("patients")
    .insert({
      full_name: "Rahul Singh",
      name_local_script: "राहुल सिंह",
      sex: "male",
      preferred_language: "en",
      reading_level: "standard",
    })
    .select("id")
    .single();

  return newPatient?.id;
}

/**
 * Create a new report row in public.lab_reports
 */
export async function createReport(data) {
  const patientId = await getOrCreatePatientId(data.user_id);

  const { data: report, error } = await supabaseAdmin
    .from("lab_reports")
    .insert({
      patient_id: patientId,
      collected_on: new Date().toISOString().split("T")[0],
      lab_name: data.file_name ? `Lab (${data.file_name})` : "City Diagnostics",
      status: "uploaded",
      upload_channel: "file",
      notes: data.language ? `Lang: ${data.language}` : null,
    })
    .select()
    .single();

  if (error) throw error;
  return report;
}

/**
 * Fetch a report by ID, including its test results
 */
export async function getReportById(reportId) {
  const { data: report, error } = await supabaseAdmin
    .from("lab_reports")
    .select(
      `
      *,
      test_results (
        id, raw_name, value, unit, raw_unit,
        printed_ref_low, printed_ref_high, printed_ref_text,
        value_source, original_value
      )
    `
    )
    .eq("id", reportId)
    .single();

  if (error) throw error;
  return report;
}

/**
 * Mark a report as confirmed ("Looks correct" action)
 */
export async function confirmReport(reportId) {
  const { data, error } = await supabaseAdmin
    .from("lab_reports")
    .update({ status: "verified" })
    .eq("id", reportId)
    .select()
    .single();

  if (error) throw error;
  return data;
}

/**
 * Insert extracted test results into public.test_results
 */
export async function insertReportResults(reportId, results) {
  const rows = results.map((r, index) => ({
    report_id: reportId,
    sort_index: index,
    raw_name: r.name,
    raw_unit: r.unit ?? null,
    raw_value_text: String(r.value),
    value: Number(r.value),
    unit: r.unit ?? null,
    printed_ref_low: r.range_min ?? null,
    printed_ref_high: r.range_max ?? null,
    printed_ref_text: r.range_label ?? null,
    value_source: "ocr",
    original_value: Number(r.value),
  }));

  const { data, error } = await supabaseAdmin
    .from("test_results")
    .insert(rows)
    .select();

  if (error) throw error;
  return data;
}

/**
 * Update a specific test result value (user edit in table)
 */
export async function updateReportResult(reportId, resultId, fields) {
  const patch = {};
  if (fields.value !== undefined) {
    patch.value = Number(fields.value);
    patch.raw_value_text = String(fields.value);
    patch.value_source = "manual_patient";
  }
  if (fields.unit !== undefined) patch.unit = fields.unit;

  const { data, error } = await supabaseAdmin
    .from("test_results")
    .update(patch)
    .match({ id: resultId, report_id: reportId })
    .select()
    .single();

  if (error) throw error;
  return data;
}
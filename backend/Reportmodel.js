/**
 * src/models/reportModel.js
 *
 * WHY a separate model?
 * Controllers handle HTTP concerns (req, res, status codes).
 * Models handle data concerns (queries, DB errors, row shaping).
 * If you ever switch from Supabase to Prisma / raw pg, you change
 * only this file — controllers stay untouched.
 */

import { supabaseAdmin } from "../config/supabase.js";

// ─── Reports ────────────────────────────────────────────────────────────────

/**
 * Create a new report row.
 * @param {{ file_name?: string, language?: string, user_id?: string }} data
 */
export async function createReport(data) {
  const { data: report, error } = await supabaseAdmin
    .from("reports")
    .insert({
      file_name: data.file_name ?? null,
      language: data.language ?? "en",
      user_id: data.user_id ?? null,
    })
    .select()
    .single();

  if (error) throw error;
  return report;
}

/**
 * Fetch a report by ID, including all its results ordered by sort_order.
 */
export async function getReportById(reportId) {
  const { data: report, error } = await supabaseAdmin
    .from("reports")
    .select(
      `
      *,
      report_results (
        id, name, value, unit, range_label, range_min, range_max,
        status, icon_type, sort_order, created_at, updated_at
      )
    `
    )
    .eq("id", reportId)
    .order("sort_order", { referencedTable: "report_results", ascending: true })
    .single();

  if (error) throw error;
  return report;
}

/**
 * Mark a report as confirmed by the user ("Looks correct" button).
 */
export async function confirmReport(reportId) {
  const { data: report, error } = await supabaseAdmin
    .from("reports")
    .update({ confirmed: true, confirmed_at: new Date().toISOString() })
    .eq("id", reportId)
    .select()
    .single();

  if (error) throw error;
  return report;
}

// ─── Report Results ──────────────────────────────────────────────────────────

/**
 * Bulk-insert extracted lab results for a report.
 * @param {string} reportId
 * @param {Array<{
 *   name: string,
 *   value: number,
 *   unit: string,
 *   range_label: string,
 *   range_min?: number,
 *   range_max?: number,
 *   status: 'normal'|'low'|'high',
 *   icon_type?: string,
 *   sort_order?: number
 * }>} results
 */
export async function insertResults(reportId, results) {
  const rows = results.map((r, idx) => ({
    report_id: reportId,
    name: r.name,
    value: r.value,
    unit: r.unit,
    range_label: r.range_label,
    range_min: r.range_min ?? null,
    range_max: r.range_max ?? null,
    status: r.status,
    icon_type: r.icon_type ?? "generic",
    sort_order: r.sort_order ?? idx,
  }));

  const { data, error } = await supabaseAdmin
    .from("report_results")
    .insert(rows)
    .select();

  if (error) throw error;
  return data;
}

/**
 * Update a single result — used by the "Edit result" button.
 * Only the fields the user can actually change are allowed.
 */
export async function updateResult(reportId, resultId, patch) {
  // Derive status automatically if value and range bounds are provided
  let status = patch.status;
  if (!status && patch.value !== undefined) {
    const { data: existing } = await supabaseAdmin
      .from("report_results")
      .select("range_min, range_max")
      .eq("id", resultId)
      .eq("report_id", reportId)
      .single();

    if (existing) {
      const rangeMin = patch.range_min ?? existing.range_min;
      const rangeMax = patch.range_max ?? existing.range_max;
      status = deriveStatus(patch.value, rangeMin, rangeMax);
    }
  }

  const updatePayload = {};
  if (patch.value !== undefined) updatePayload.value = patch.value;
  if (patch.unit !== undefined) updatePayload.unit = patch.unit;
  if (patch.range_label !== undefined)
    updatePayload.range_label = patch.range_label;
  if (patch.range_min !== undefined) updatePayload.range_min = patch.range_min;
  if (patch.range_max !== undefined) updatePayload.range_max = patch.range_max;
  if (status) updatePayload.status = status;

  const { data, error } = await supabaseAdmin
    .from("report_results")
    .update(updatePayload)
    .eq("id", resultId)
    .eq("report_id", reportId) // ensures the result belongs to this report
    .select()
    .single();

  if (error) throw error;
  return data;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Derive 'low' | 'normal' | 'high' from a numeric value and range bounds.
 */
function deriveStatus(value, rangeMin, rangeMax) {
  if (rangeMin !== null && value < rangeMin) return "low";
  if (rangeMax !== null && value > rangeMax) return "high";
  return "normal";
}

export { deriveStatus };
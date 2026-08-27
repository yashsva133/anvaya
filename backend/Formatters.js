/**
 * src/utils/formatters.js
 *
 * Pure functions that shape raw Supabase rows into the JSON the frontend
 * actually consumes.  Keeping this out of controllers means the frontend
 * contract is defined in one place.
 */

/**
 * Shape a single lab result for the API response.
 * Maps DB field names → camelCase for the JS/TS frontend.
 */
export function formatResult(row) {
  return {
    id: row.id,
    name: row.name,
    value: Number(row.value),
    unit: row.unit,
    rangeLabel: row.range_label,
    rangeMin: row.range_min !== null ? Number(row.range_min) : null,
    rangeMax: row.range_max !== null ? Number(row.range_max) : null,
    status: row.status,           // 'normal' | 'low' | 'high'
    iconType: row.icon_type,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Shape a full report (with nested results) for the API response.
 */
export function formatReportResponse(report, results = []) {
  return {
    id: report.id,
    fileName: report.file_name,
    language: report.language,
    confirmed: report.confirmed,
    confirmedAt: report.confirmed_at,
    createdAt: report.created_at,
    updatedAt: report.updated_at,
    results: (results ?? []).map(formatResult),
  };
}
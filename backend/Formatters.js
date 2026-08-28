/**
 * src/utils/formatters.js
 *
 * Pure functions that shape raw Supabase rows into camelCase JSON
 * matching what the Next.js frontend types expect.
 *
 * Schema alignment: column names match the Anvaya schema exactly;
 * formatters translate snake_case → camelCase and cast numeric strings.
 */

/**
 * Format a v_report_summary row.
 * The view returns computed counts (attention_count, critical_count, etc.)
 * which replace the hand-authored (and inconsistent) values in src/lib/data.ts.
 */
export function formatReport(r) {
  return {
    id: r.id,
    legacyCode: r.legacy_code,        // preserves feb26 / aug26 URL compat
    status: r.status,
    collectedOn: r.collected_on,
    labName: r.lab_name,
    reportNumber: r.report_number,
    uploadChannel: r.upload_channel,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    // Derived counts — computed from validation_results, not stored
    testsCount: r.tests_count !== undefined ? Number(r.tests_count) : undefined,
    attentionCount: r.attention_count !== undefined ? Number(r.attention_count) : undefined,
    criticalCount: r.critical_count !== undefined ? Number(r.critical_count) : undefined,
    borderlineCount: r.borderline_count !== undefined ? Number(r.borderline_count) : undefined,
    normalCount: r.normal_count !== undefined ? Number(r.normal_count) : undefined,
    hasCritical: r.has_critical,
    isReleased: r.is_released,
  };
}

/**
 * Format a test_results row with its nested validation and catalog data.
 *
 * Key points:
 * - status comes from validation_results.computed_status (NEVER from test_results)
 * - value is the corrected_value if a correction exists, else the parsed value
 * - ref_low/ref_high are the SNAPSHOT bounds from validation_results (correct
 *   even after a range update — spec §3.3 / test 15)
 */
export function formatResult(r) {
  const v = r.validation_results; // the current validation row
  const c = r.lab_test_catalog;

  return {
    id: r.id,
    sortIndex: r.sort_index,
    // What the OCR found
    rawName: r.raw_name,
    rawUnit: r.raw_unit,
    rawValueText: r.raw_value_text,
    // Effective (possibly corrected) value
    value: r.corrected_value !== null && r.corrected_value !== undefined
      ? Number(r.corrected_value)
      : r.value !== null ? Number(r.value) : null,
    unit: r.unit,
    wasCorrected: r.corrected_at !== null,
    originalValue: r.original_value !== null ? Number(r.original_value) : null,
    // Reference range — "as printed on your report"
    printedRefText: r.printed_ref_text,
    printedRefLow: r.printed_ref_low !== null ? Number(r.printed_ref_low) : null,
    printedRefHigh: r.printed_ref_high !== null ? Number(r.printed_ref_high) : null,
    // Validated status (source of truth)
    status: v?.computed_status ?? null,
    isCritical: v?.is_critical ?? false,
    isAbnormal: v?.is_abnormal ?? false,
    // Snapshot range bounds (from validation_results — stable across range changes)
    refLow: v?.ref_low !== null && v?.ref_low !== undefined ? Number(v.ref_low) : null,
    refHigh: v?.ref_high !== null && v?.ref_high !== undefined ? Number(v.ref_high) : null,
    // Parser confidence
    confidenceLevel: r.confidence_level,
    confidenceNoteEn: r.confidence_note_en,
    // Test catalog info
    test: c ? {
      id: c.id,
      code: c.code,
      nameEn: c.name_en,
      nameHi: c.name_hi,
      simpleNameEn: c.simple_name_en,
      simpleNameHi: c.simple_name_hi,
      iconKey: c.icon_key,
      category: c.category,
    } : null,
  };
}

export function formatResults(rows) {
  return (rows ?? []).map(formatResult);
}
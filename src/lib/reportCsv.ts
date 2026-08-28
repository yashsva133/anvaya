// ---------------------------------------------------------------------------
// Structured laboratory-report CSV parsing.
//
// CSV is an explicit upload format. It is intentionally kept outside the Next
// route so it can be tested without importing next/server, and so a valid CSV
// never depends on an OCR executable being installed on the host.
// ---------------------------------------------------------------------------

export interface ParsedCsvChartRow {
  parameter: string;
  value: number;
  normal_min?: number;
  normal_max?: number;
  reference_text?: string;
  unit?: string;
  status?: "low" | "high" | "normal";
}

export interface ParsedCsvReportData {
  patient_summary: string;
  flagged_issues: string[];
  chart_data: ParsedCsvChartRow[];
  audio_script: string;
}

function parseCsvRows(csvText: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  const text = csvText.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (ch === '"') {
      if (quoted && text[i + 1] === '"') {
        cell += '"';
        i += 1;
      } else {
        quoted = !quoted;
      }
    } else if (ch === "," && !quoted) {
      row.push(cell.trim());
      cell = "";
    } else if (ch === "\n" && !quoted) {
      row.push(cell.trim());
      if (row.some((value) => value !== "")) rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += ch;
    }
  }

  if (cell !== "" || row.length > 0) {
    row.push(cell.trim());
    if (row.some((value) => value !== "")) rows.push(row);
  }
  return rows;
}

function finiteNumber(raw: string): number | undefined {
  const cleaned = raw.replace(/,/g, "").replace(/[<>]/g, "").trim();
  if (!cleaned) return undefined;
  const value = Number(cleaned);
  return Number.isFinite(value) ? value : undefined;
}

/**
 * Parse the canonical OCR/report CSV shape:
 * report_date,test_name,value,unit,ref_low,ref_high,ref_text
 *
 * Common aliases are accepted for hand-authored structured uploads, but values,
 * labels, units and ranges are copied from the file. A supplied status column
 * is deliberately ignored because it is untrusted metadata.
 */
export function parseCsvToReportData(csvText: string): ParsedCsvReportData | null {
  const rows = parseCsvRows(csvText);
  if (rows.length <= 1) return null;

  const normaliseHeader = (header: string): string =>
    header.trim().toLowerCase().replace(/[\s-]+/g, "_");
  const header = rows[0].map(normaliseHeader);
  const findColumn = (...names: string[]) => {
    for (const name of names) {
      const index = header.indexOf(name);
      if (index >= 0) return index;
    }
    return -1;
  };
  const nameIdx = findColumn("test_name", "test", "parameter", "test_parameter");
  const valIdx = findColumn("value", "result", "reading");
  const unitIdx = findColumn("unit", "units");
  const lowIdx = findColumn("ref_low", "normal_min", "reference_low", "printed_ref_low");
  const highIdx = findColumn("ref_high", "normal_max", "reference_high", "printed_ref_high");
  const referenceTextIdx = findColumn(
    "ref_text",
    "reference_text",
    "reference_range",
    "printed_ref_text",
    "range"
  );

  if (nameIdx < 0 || valIdx < 0) return null;
  const valueAt = (cols: string[], index: number, fallback = -1) =>
    cols[index >= 0 ? index : fallback] ?? "";

  const chart_data: ParsedCsvChartRow[] = [];
  const flagged_issues: string[] = [];

  for (const cols of rows.slice(1)) {
    const name = valueAt(cols, nameIdx, 1).trim();
    const val = finiteNumber(valueAt(cols, valIdx, 2));
    if (!name || val === undefined) continue;

    const unit = valueAt(cols, unitIdx, 3).trim();
    const lowValue = finiteNumber(valueAt(cols, lowIdx, 4));
    const highValue = finiteNumber(valueAt(cols, highIdx, 5));
    const suppliedRangeValid =
      lowValue === undefined || highValue === undefined || lowValue <= highValue;
    const low = suppliedRangeValid ? lowValue : undefined;
    const high = suppliedRangeValid ? highValue : undefined;
    const referenceText =
      referenceTextIdx >= 0 ? valueAt(cols, referenceTextIdx).trim() || undefined : undefined;
    // Derive status only from a usable printed bound. A CSV status column is
    // untrusted metadata and cannot make a no-range result abnormal.
    const status =
      low !== undefined && val < low
        ? "low"
        : high !== undefined && val > high
          ? "high"
          : low !== undefined || high !== undefined
            ? "normal"
            : undefined;

    chart_data.push({
      parameter: name,
      value: val,
      ...(low !== undefined ? { normal_min: low } : {}),
      ...(high !== undefined ? { normal_max: high } : {}),
      ...(referenceText ? { reference_text: referenceText } : {}),
      ...(unit ? { unit } : {}),
      ...(status ? { status } : {}),
    });
    if (status && status !== "normal") {
      flagged_issues.push(`${name} (${val}${unit ? ` ${unit}` : ""}) is ${status}`);
    }
  }

  if (chart_data.length === 0) return null;

  const unknownCount = chart_data.filter(
    (row) => row.normal_min === undefined && row.normal_max === undefined
  ).length;
  const patient_summary =
    flagged_issues.length > 0
      ? `We found ${chart_data.length} test results. ${flagged_issues.length} values are outside the supplied reference ranges (${flagged_issues.slice(0, 2).join(", ")})${unknownCount ? `; ${unknownCount} have no reported range` : ""} and should be reviewed with your doctor.`
      : unknownCount > 0
        ? `We found ${chart_data.length} test results. ${unknownCount} have no reported reference range, so they were not classified. Please review the printed report with your doctor.`
        : `All ${chart_data.length} test results on your report are within the supplied reference ranges.`;

  const audio_script = `Hello. Your lab report has been read. ${patient_summary}`;

  return {
    patient_summary,
    flagged_issues,
    chart_data,
    audio_script,
  };
}

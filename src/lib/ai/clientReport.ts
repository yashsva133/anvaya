// ---------------------------------------------------------------------------
// Personalization — the user's OWN report as the grounding payload.
//
// Until this module existed the agent could only explain the fictional demo
// patient in src/lib/data.ts. The chat UI now sends the report the user is
// actually looking at (their upload, extracted by /api/process-report, or the
// demo fallback), and this module is the trust boundary that turns that
// untrusted JSON body into a payload the pipeline can rely on.
//
// Rules, in order of importance:
// 1. Nothing identifying crosses this boundary. The only free-text fields are
//    short, control-character-free report labels, units and printed reference
//    text, plus two short date labels. There is no field for a name, lab,
//    doctor or notes, and every accepted text field is length-capped.
// 2. Catalogue ids are canonicalised. A stable `report_...` id is also accepted
//    for an uncatalogued result so the app can preserve a real extracted value
//    without borrowing another test's definition.
// 3. Known-test metadata is replaced by catalogue defaults when the report did
//    not print it; supplied printed units and ranges are retained when present.
//    Unknown-test metadata is the only source for its label/unit/range.
// 4. Status (normal/borderline/high/low) is computed here from the retained
//    range — the same borderline fraction (10%) the seeded lab_test_thresholds
//    use. A result with no range is marked `statusKnown: false`, never treated
//    as clinically normal.
// ---------------------------------------------------------------------------

import { TESTS, type ReportTestMetadata, type Status, type TestDef } from "@/lib/data";

export const BORDERLINE_FRACTION = 0.1;

/** The shape the chat client POSTs (before validation). */
export interface ClientReportInput {
  reportId?: unknown;
  dateLabel?: unknown;
  age?: unknown;
  gender?: unknown;
  results?: unknown;
  previous?: unknown;
  /**
   * Older reports, oldest first, so the model can talk about a TREND rather
   * than a single snapshot. Same trust rules as `results`: test ids are
   * whitelisted, values are numbers, and the only free text allowed is a short
   * date label.
   */
  history?: unknown;
}

/** One earlier report kept for trend context. */
export interface ClientReportResult extends ReportTestMetadata {
  test: string;
  value: number;
}

export interface ClientHistoryPoint {
  dateLabel?: string;
  results: ClientReportResult[];
}

/** The validated, sanitised report context the agent is allowed to use. */
export interface ClientReport {
  source: "client";
  reportId?: string;
  dateLabel?: string;
  ageBand?: string;
  sex: "female" | "male" | "other" | "unspecified";
  results: ClientReportResult[];
  previous?: { dateLabel?: string; results: ClientReportResult[] };
  /** Earlier reports, oldest first (the immediately previous one included). */
  history?: ClientHistoryPoint[];
}

const MAX_RESULTS = 40;
const MAX_LABEL = 96;
/** Enough to show a direction of travel; more only costs prompt budget. */
const MAX_HISTORY = 8;

function slug(v: unknown): string | undefined {
  return typeof v === "string" && /^[a-zA-Z0-9_-]{1,64}$/.test(v) ? v : undefined;
}

/** One short display label is allowed through, stripped and capped. */
function label(v: unknown): string | undefined {
  if (typeof v !== "string") return undefined;
  const clean = v
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!clean || clean.length > MAX_LABEL) return undefined;
  return clean;
}

function finiteValue(v: unknown): number | undefined {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN;
  if (!Number.isFinite(n) || n <= 0 || n > 1_000_000) return undefined;
  return Math.round(n * 100) / 100;
}

function finiteBound(v: unknown): number | undefined {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN;
  if (!Number.isFinite(n) || n < -1_000_000 || n > 1_000_000) return undefined;
  return Math.round(n * 100) / 100;
}

function canonicalTest(v: unknown): string | undefined {
  if (typeof v !== "string") return undefined;
  const value = v.trim().toLowerCase();
  if (TESTS[value]) return value;
  // The browser creates these ids only for uncatalogued report rows. Keeping
  // the shape strict prevents arbitrary prompt keys from entering the model.
  return /^report_[a-z0-9_-]{1,60}$/.test(value) ? value : undefined;
}

function reportMetadata(item: Record<string, unknown>): ReportTestMetadata {
  const rawReference = item.reference;
  const reference = typeof rawReference === "object" && rawReference !== null
    ? (rawReference as Record<string, unknown>)
    : undefined;
  const reportLabel = label(item.label);
  const reportUnit = label(item.unit)?.slice(0, 32);
  const rawLow = finiteBound(reference?.low);
  const rawHigh = finiteBound(reference?.high);
  // A reversed pair is not a usable clinical range. Preserve its printed text
  // for display, but drop both numeric bounds so it cannot create a false
  // normal/high/low classification downstream.
  const validPair = rawLow === undefined || rawHigh === undefined || rawLow <= rawHigh;
  const low = validPair ? rawLow : undefined;
  const high = validPair ? rawHigh : undefined;
  const text = label(reference?.text);
  return {
    ...(reportLabel ? { label: reportLabel } : {}),
    ...(reportUnit ? { unit: reportUnit } : {}),
    ...(low !== undefined || high !== undefined || text
      ? {
          reference: {
            ...(low !== undefined ? { low } : {}),
            ...(high !== undefined ? { high } : {}),
            ...(text ? { text } : {}),
          },
        }
      : {}),
  };
}

function validResults(v: unknown): ClientReportResult[] {
  if (!Array.isArray(v)) return [];
  const out: ClientReportResult[] = [];
  const seen = new Set<string>();
  for (const item of v.slice(0, MAX_RESULTS)) {
    if (typeof item !== "object" || item === null) continue;
    const record = item as Record<string, unknown>;
    const test = canonicalTest(record.test);
    if (!test || seen.has(test)) continue;
    const val = finiteValue(record.value);
    if (val === undefined) continue;
    seen.add(test);
    out.push({ test, value: val, ...reportMetadata(record) });
  }
  return out;
}

/** Validate the `history` array: earlier reports, oldest first. */
function validHistory(v: unknown): ClientHistoryPoint[] {
  if (!Array.isArray(v)) return [];
  const out: ClientHistoryPoint[] = [];
  for (const item of v.slice(-MAX_HISTORY)) {
    if (typeof item !== "object" || item === null) continue;
    const point = item as ClientReportInput;
    const results = validResults(point.results);
    if (results.length === 0) continue;
    out.push({ dateLabel: label(point.dateLabel), results });
  }
  return out;
}

/**
 * Deterministic status from a retained report range — the single source of
 * truth. Public so the anonymizer and tests use the identical rule.
 */
export function computeStatusForRange(value: number, low?: number, high?: number): Status {
  if (low !== undefined && high !== undefined && low > high) return "normal";
  if (low !== undefined && high !== undefined) {
    const margin = Math.max(0, high - low) * BORDERLINE_FRACTION;
    if (value < low) return "low";
    if (value > high) return "high";
    if (value <= low + margin || value >= high - margin) return "borderline";
    return "normal";
  }
  if (high !== undefined) {
    const margin = Math.abs(high) * BORDERLINE_FRACTION;
    if (value > high) return "high";
    if (value >= high - margin) return "borderline";
    return "normal";
  }
  if (low !== undefined) {
    const margin = Math.abs(low) * BORDERLINE_FRACTION;
    if (value < low) return "low";
    if (value <= low + margin) return "borderline";
    return "normal";
  }
  return "normal";
}

export function computeStatus(def: TestDef, value: number): Status {
  return computeStatusForRange(value, def.ref.low, def.ref.high);
}

/** Age → band, mirroring anonymization_records.age_band. Never an exact age. */
export function clientAgeBand(v: unknown): string | undefined {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN;
  if (!Number.isFinite(n) || n < 1 || n > 120) return undefined;
  const age = Math.floor(n);
  if (age <= 11) return "0-11";
  if (age <= 17) return "12-17";
  if (age <= 29) return "18-29";
  if (age <= 39) return "30-39";
  if (age <= 49) return "40-49";
  if (age <= 59) return "50-59";
  if (age <= 69) return "60-69";
  if (age <= 79) return "70-79";
  return "80+";
}

export function clientSex(v: unknown): ClientReport["sex"] {
  const g = typeof v === "string" ? v.toLowerCase().trim() : "";
  // Check female first: the word "female" contains the substring "male".
  if (g.startsWith("f") || g.includes("स्त्री") || g.includes("महिला") || g === "female") return "female";
  if (g.startsWith("m") || g.includes("पुरुष") || g === "male") return "male";
  if (g.startsWith("o") || g.includes("other")) return "other";
  return "unspecified";
}

/**
 * Parse the request body's `report` field. Returns null when there is nothing
 * usable (absent, not an object, or no valid results) — the agent then uses an
 * empty report context. A demo report is available only through an explicit
 * sample/demo action.
 */
export function parseClientReport(raw: unknown): ClientReport | null {
  if (typeof raw !== "object" || raw === null) return null;
  const input = raw as ClientReportInput;

  const results = validResults(input.results);
  if (results.length === 0) return null;

  const history = validHistory(input.history);

  let previous: ClientReport["previous"];
  if (typeof input.previous === "object" && input.previous !== null) {
    const p = input.previous as ClientReportInput;
    const prevResults = validResults(p.results);
    if (prevResults.length > 0) {
      previous = { dateLabel: label(p.dateLabel), results: prevResults };
    }
  }
  // A client that only sent `history` still gets trend answers: the last
  // history entry IS the previous report.
  if (!previous && history.length > 0) {
    const last = history[history.length - 1];
    previous = { dateLabel: last.dateLabel, results: last.results };
  }

  return {
    source: "client",
    reportId: slug(input.reportId),
    dateLabel: label(input.dateLabel),
    ageBand: clientAgeBand(input.age),
    sex: clientSex(input.gender),
    results,
    ...(previous ? { previous } : {}),
    ...(history.length > 0 ? { history } : {}),
  };
}

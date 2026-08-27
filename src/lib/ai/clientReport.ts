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
// 1. NOTHING free-text crosses this boundary except two short display labels
//    (report date, previous report date), sanitised and length-capped. There
//    is deliberately no field for a name, lab, doctor or notes — so a client
//    cannot put PHI into the payload even by trying.
// 2. Test ids are whitelist-matched against the TESTS catalogue. Unknown ids
//    are dropped, not passed through.
// 3. Units and reference ranges come from the catalogue, never the client.
// 4. Status (normal/borderline/high/low) is computed here from the catalogue
//    range — the same borderline fraction (10%) the seeded
//    lab_test_thresholds use — because the spec (§10.4) says the LLM must
//    never be the source of truth for it, and a client's label is no better.
// ---------------------------------------------------------------------------

import { TESTS, type Status, type TestDef } from "@/lib/data";

export const BORDERLINE_FRACTION = 0.1;

/** The shape the chat client POSTs (before validation). */
export interface ClientReportInput {
  reportId?: unknown;
  dateLabel?: unknown;
  age?: unknown;
  gender?: unknown;
  results?: unknown;
  previous?: unknown;
}

/** The validated, sanitised report context the agent is allowed to use. */
export interface ClientReport {
  source: "client";
  reportId?: string;
  dateLabel?: string;
  ageBand?: string;
  sex: "female" | "male" | "other" | "unspecified";
  results: { test: string; value: number }[];
  previous?: { dateLabel?: string; results: { test: string; value: number }[] };
}

const MAX_RESULTS = 40;
const MAX_LABEL = 48;

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

function validResults(v: unknown): { test: string; value: number }[] {
  if (!Array.isArray(v)) return [];
  const out: { test: string; value: number }[] = [];
  const seen = new Set<string>();
  for (const item of v.slice(0, MAX_RESULTS)) {
    if (typeof item !== "object" || item === null) continue;
    const { test, value } = item as { test?: unknown; value?: unknown };
    if (typeof test !== "string" || !TESTS[test] || seen.has(test)) continue;
    const val = finiteValue(value);
    if (val === undefined) continue;
    seen.add(test);
    out.push({ test, value: val });
  }
  return out;
}

/**
 * Deterministic status from the catalogue range — the single source of truth.
 * Public so tests and the anonymizer use the identical rule.
 */
export function computeStatus(def: TestDef, value: number): Status {
  const { low, high } = def.ref;
  if (low !== undefined && high !== undefined) {
    const margin = (high - low) * BORDERLINE_FRACTION;
    if (value < low) return "low";
    if (value > high) return "high";
    if (value <= low + margin || value >= high - margin) return "borderline";
    return "normal";
  }
  if (high !== undefined) {
    const margin = high * BORDERLINE_FRACTION;
    if (value > high) return "high";
    if (value >= high - margin) return "borderline";
    return "normal";
  }
  if (low !== undefined) {
    const margin = low * BORDERLINE_FRACTION;
    if (value < low) return "low";
    if (value <= low + margin) return "borderline";
    return "normal";
  }
  return "normal";
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
  const g = typeof v === "string" ? v.toLowerCase() : "";
  if (g.startsWith("m") || g.includes("पुरुष") || g.includes("male")) return "male";
  if (g.startsWith("f") || g.includes("स्त्री") || g.includes("महिला") || g.includes("female"))
    return "female";
  if (g.startsWith("o") || g.includes("other")) return "other";
  return "unspecified";
}

/**
 * Parse the request body's `report` field. Returns null when there is nothing
 * usable (absent, not an object, or no valid results) — the agent then falls
 * back to the seeded demo report exactly as before.
 */
export function parseClientReport(raw: unknown): ClientReport | null {
  if (typeof raw !== "object" || raw === null) return null;
  const input = raw as ClientReportInput;

  const results = validResults(input.results);
  if (results.length === 0) return null;

  let previous: ClientReport["previous"];
  if (typeof input.previous === "object" && input.previous !== null) {
    const p = input.previous as ClientReportInput;
    const prevResults = validResults(p.results);
    if (prevResults.length > 0) {
      previous = { dateLabel: label(p.dateLabel), results: prevResults };
    }
  }

  return {
    source: "client",
    reportId: slug(input.reportId),
    dateLabel: label(input.dateLabel),
    ageBand: clientAgeBand(input.age),
    sex: clientSex(input.gender),
    results,
    ...(previous ? { previous } : {}),
  };
}

// ---------------------------------------------------------------------------
// ANONYMIZATION stage — the PII firewall in front of every model call.
//
// Implements the ANONYMIZATION stage of the pipeline in
// ANVAYA_DATABASE_SPEC.md §10.4 and produces exactly the shape that
// anonymization_records (db/migrations/0010_anonymization.sql) describes:
// a pseudonym, an age BAND, sex, and retained test values — nothing else.
//
// The structural guarantee the schema makes is preserved here: there is no
// code path that puts a name, date of birth, phone number, report number or
// lab name into the payload, because the payload type has no field for one.
// ---------------------------------------------------------------------------

import { randomUUID } from "node:crypto";
import {
  LATEST,
  PATIENT,
  PATTERNS,
  REPORTS,
  TESTS,
  type LangCode,
  type Report,
} from "@/lib/data";
import type { AnonymisedPayload, AnonymisedResult } from "./types";

export const ANON_INPUT_VERSION = "anvaya-anon-v1";

/** anonymization_records.age_band — a band, never an exact age or DOB. */
export function ageBand(age: number): string {
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

/** anonymization_records.sex. Derived from the demo patient's gender label. */
export function normaliseSex(gender: LangCode extends never ? never : string): AnonymisedPayload["sex"] {
  const g = gender.toLowerCase();
  if (g.startsWith("m") || g.includes("पुरुष") || g.includes("male")) return "male";
  if (g.startsWith("f") || g.includes("स्त्री") || g.includes("महिला") || g.includes("female"))
    return "female";
  return "unspecified";
}

function pickReport(reportId?: string): Report {
  if (!reportId) return LATEST;
  return REPORTS.find((r) => r.id === reportId) ?? LATEST;
}

/** The immediately preceding report, used to supply trend context. */
function previousReport(report: Report): Report | undefined {
  const idx = REPORTS.findIndex((r) => r.id === report.id);
  return idx > 0 ? REPORTS[idx - 1] : undefined;
}

function resultFor(
  testId: string,
  value: number,
  status: AnonymisedResult["status"],
  lang: LangCode,
  prev?: Report
): AnonymisedResult | null {
  const def = TESTS[testId];
  if (!def) return null;
  const prevValue = prev?.entries.find((e) => e.test === testId)?.value;
  return {
    test: testId,
    label: def.name[lang === "hi" ? "hi" : "en"],
    value,
    unit: def.unit,
    ref_text: def.ref.text,
    ref_low: def.ref.low,
    ref_high: def.ref.high,
    status,
    ...(prevValue !== undefined
      ? { previous_value: prevValue, previous_date: prev?.date[lang === "hi" ? "hi" : "en"] }
      : {}),
  };
}

/**
 * Build the de-identified payload for one report.
 *
 * `pseudonym` is random per call by design: nothing downstream depends on its
 * value, only on its uniqueness, so rotating it costs nothing (see the comment
 * on anonymization_records.pseudonym).
 */
export function buildAnonymisedPayload(opts: {
  lang: LangCode;
  reportId?: string;
  pseudonym?: string;
}): AnonymisedPayload {
  const { lang, reportId } = opts;
  const l2 = lang === "hi" ? "hi" : "en";
  const report = pickReport(reportId);
  const prev = previousReport(report);

  const results: AnonymisedResult[] = [];
  for (const entry of report.entries) {
    const r = resultFor(entry.test, entry.value, entry.status, lang, prev);
    if (r) results.push(r);
  }

  // Only patterns whose every member test is actually present in this report,
  // so the model cannot be handed a pattern the data does not support.
  const present = new Set(results.map((r) => r.test));
  const patterns = PATTERNS.filter((p) => p.nodes.every((n) => present.has(n.test))).map((p) => ({
    title: p.title[l2],
    summary: `${p.expl[l2]} ${p.risk[l2]}`,
    tests: p.nodes.map((n) => n.test),
  }));

  return {
    pseudonym: opts.pseudonym ?? randomUUID(),
    age_band: ageBand(PATIENT.age),
    sex: normaliseSex(PATIENT.gender.en),
    report_date: report.date[l2],
    results,
    patterns,
    removed_fields: [
      "patient_name",
      "dob",
      "phone",
      "email",
      "address",
      "report_number",
      "lab_name",
      "raw_ocr_text",
    ],
    retained_fields: ["age_band", "sex", "report_date", "test_values", "units", "reference_ranges"],
    input_version: ANON_INPUT_VERSION,
  };
}

/**
 * Render the payload as the block the model actually reads.
 *
 * Kept deliberately terse and tabular: MedGemma 4B has a limited context
 * budget and the numbers are the part it must not paraphrase.
 */
export function renderPayloadForPrompt(payload: AnonymisedPayload): string {
  const lines: string[] = [];
  lines.push(`Report date: ${payload.report_date}`);
  lines.push(`Patient: ${payload.age_band} years old, ${payload.sex}`);
  lines.push("");
  lines.push("RESULTS (test | value | unit | printed reference range | computed status)");
  for (const r of payload.results) {
    const prev =
      r.previous_value !== undefined
        ? ` | previous ${r.previous_value} on ${r.previous_date}`
        : "";
    lines.push(`- ${r.label} | ${r.value} | ${r.unit} | ${r.ref_text} | ${r.status}${prev}`);
  }
  if (payload.patterns.length > 0) {
    lines.push("");
    lines.push("PATTERNS ALREADY IDENTIFIED BY THE RULE ENGINE");
    for (const p of payload.patterns) {
      lines.push(`- ${p.title}: ${p.summary}`);
    }
  }
  return lines.join("\n");
}

/**
 * The set of numbers the model is allowed to state.
 *
 * Used by guardrails.ts to catch a model inventing a value. Includes each
 * value, its previous value, and the bounds of every printed reference range —
 * a correct explanation legitimately quotes the range as well as the result.
 */
export function allowedNumbers(payload: AnonymisedPayload): Set<string> {
  const nums = new Set<string>();
  const add = (n: number | undefined) => {
    if (n === undefined || !Number.isFinite(n)) return;
    nums.add(String(n));
    nums.add(String(Math.round(n)));
    if (!Number.isInteger(n)) nums.add(n.toFixed(1));
    if (!Number.isInteger(n)) nums.add(n.toFixed(2));
  };
  for (const r of payload.results) {
    add(r.value);
    add(r.previous_value);
    add(r.ref_low);
    add(r.ref_high);
    // "below 5.7%", "12-16", "≤150" — the digits inside the printed range text.
    for (const m of r.ref_text.match(/\d+(?:\.\d+)?/g) ?? []) nums.add(m);
  }
  // An answer that names its own report date ("your 22 Aug 2026 report") is
  // quoting the payload, not inventing a number. Without this, every answer
  // that mentions the date would be penalised for two ungrounded values.
  for (const m of payload.report_date.match(/\d+(?:\.\d+)?/g) ?? []) nums.add(m);
  // Small counts and reading-level words are not clinical claims.
  for (const n of [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 12, 24]) nums.add(String(n));
  return nums;
}

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
import {
  computeStatusForRange,
  type ClientHistoryPoint,
  type ClientReport,
  type ClientReportResult,
} from "./clientReport";
import type { AnonymisedPayload, AnonymisedResult, AnonymisedTrend } from "./types";

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
  const g = gender.toLowerCase().trim();
  // Check female first: the word "female" contains the substring "male".
  if (g.startsWith("f") || g.includes("स्त्री") || g.includes("महिला") || g === "female") return "female";
  if (g.startsWith("m") || g.includes("पुरुष") || g === "male") return "male";
  return "unspecified";
}

function pickReport(reportId?: string): Report | undefined {
  return reportId ? REPORTS.find((r) => r.id === reportId) : undefined;
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
    status_known: true,
    ...(prevValue !== undefined
      ? { previous_value: prevValue, previous_date: prev?.date[lang === "hi" ? "hi" : "en"] }
      : {}),
  };
}

function resultForClient(
  entry: ClientReportResult,
  lang: LangCode,
  previous?: ClientReportResult[],
  previousDate?: string
): AnonymisedResult {
  const def = TESTS[entry.test];
  const l2 = lang === "hi" ? "hi" : "en";
  const low = entry.reference?.low ?? def?.ref.low;
  const high = entry.reference?.high ?? def?.ref.high;
  const unit = entry.unit || def?.unit || "";
  const label = def?.name[l2] || entry.label || entry.test.replace(/^report_/, "").replace(/[_-]+/g, " ");
  const refText =
    entry.reference?.text ||
    def?.ref.text ||
    (low !== undefined && high !== undefined
      ? `${low}–${high}${unit ? ` ${unit}` : ""}`
      : low !== undefined
        ? `above ${low}${unit ? ` ${unit}` : ""}`
        : high !== undefined
          ? `below ${high}${unit ? ` ${unit}` : ""}`
          : "Reference range not reported");
  const previousValue = previous?.find((item) => item.test === entry.test)?.value;
  const statusKnown = low !== undefined || high !== undefined;
  return {
    test: entry.test,
    label,
    value: entry.value,
    unit,
    ref_text: refText,
    ...(low !== undefined ? { ref_low: low } : {}),
    ...(high !== undefined ? { ref_high: high } : {}),
    status: computeStatusForRange(entry.value, low, high),
    status_known: statusKnown,
    ...(previousValue !== undefined
      ? { previous_value: previousValue, previous_date: previousDate ?? "" }
      : {}),
  };
}

/**
 * How far a value sits OUTSIDE its reference range (0 when inside it).
 *
 * The basis for "improving" vs "worsening": a value can rise and still be
 * getting better (a low haemoglobin climbing back to normal), so a bare
 * direction of travel is not enough to describe a trend honestly.
 */
function deviationForRange(value: number, low?: number, high?: number): number {
  if (low !== undefined && value < low) return low - value;
  if (high !== undefined && value > high) return value - high;
  return 0;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Build the per-test trend series.
 *
 * Deterministic on purpose. The model is handed the finished directions and
 * deltas and told to explain them; it never computes one, so an overview
 * summary cannot claim a value "improved" when the arithmetic says otherwise.
 */
export function buildTrends(opts: {
  current: ClientReportResult[];
  /** Earlier reports, oldest first. */
  history: ClientHistoryPoint[];
  latestDate: string;
  lang: LangCode;
}): AnonymisedTrend[] {
  const { current, history, latestDate } = opts;
  const l2 = opts.lang === "hi" ? "hi" : "en";
  const trends: AnonymisedTrend[] = [];

  for (const entry of current) {
    const def = TESTS[entry.test];
    const low = entry.reference?.low ?? def?.ref.low;
    const high = entry.reference?.high ?? def?.ref.high;
    const label = def?.name[l2] || entry.label || entry.test.replace(/^report_/, "").replace(/[_-]+/g, " ");
    const unit = entry.unit || def?.unit || "";

    const points: AnonymisedTrend["points"] = [];
    history.forEach((h, i) => {
      const hit = h.results.find((r) => r.test === entry.test);
      if (!hit) return;
      const hitLow = hit.reference?.low ?? low;
      const hitHigh = hit.reference?.high ?? high;
      points.push({
        date: h.dateLabel ?? `report ${i + 1}`,
        value: hit.value,
        status: computeStatusForRange(hit.value, hitLow, hitHigh),
      });
    });
    if (points.length === 0) continue;

    const first = points[0];
    const latestStatus = computeStatusForRange(entry.value, low, high);
    const statusKnown = low !== undefined || high !== undefined;
    const change = round2(entry.value - first.value);
    const span = low !== undefined && high !== undefined
      ? high - low
      : Math.abs(first.value) || 1;
    // A wobble smaller than 5% of the reference span is noise, not a trend.
    const flat = Math.abs(change) < Math.abs(span) * 0.05;
    const devFirst = deviationForRange(first.value, low, high);
    const devNow = deviationForRange(entry.value, low, high);

    trends.push({
      test: entry.test,
      label,
      unit,
      status_known: statusKnown,
      points: [...points, { date: latestDate, value: entry.value, status: latestStatus }],
      first_value: first.value,
      first_date: first.date,
      latest_value: entry.value,
      latest_date: latestDate,
      change,
      change_pct: first.value !== 0 ? Math.round((change / first.value) * 1000) / 10 : undefined,
      direction: flat ? "flat" : change > 0 ? "up" : "down",
      worsening: statusKnown && devNow > devFirst + 1e-9,
      improving: statusKnown && devNow < devFirst - 1e-9,
      first_status: first.status,
      latest_status: latestStatus,
    });
  }

  // Most clinically interesting first: things that got worse, then things that
  // moved at all, so a truncated prompt keeps what matters.
  return trends.sort((a, b) => {
    const rank = (t: AnonymisedTrend) => (t.worsening ? 0 : t.improving ? 1 : t.direction === "flat" ? 3 : 2);
    return rank(a) - rank(b);
  });
}

/**
 * Build the de-identified payload for one report.
 *
 * Two sources, in priority order:
 *  - `report`: the user's OWN report, already validated by
 *    parseClientReport() in clientReport.ts. Units, ranges and statuses come
 *    from the catalogue and are computed here — this function re-derives
 *    everything rather than trusting a label that arrived over HTTP.
 *  - an explicitly requested demo report (`useDemo`/`reportId`), for the
 *    sample-report experience only.
 *  - otherwise an empty payload. An absent report is not permission to invent
 *    a fictional patient or results.
 *
 * `pseudonym` is random per call by design: nothing downstream depends on its
 * value, only on its uniqueness, so rotating it costs nothing (see the comment
 * on anonymization_records.pseudonym).
 */
export function buildAnonymisedPayload(opts: {
  lang: LangCode;
  reportId?: string;
  pseudonym?: string;
  report?: ClientReport;
  /** Explicit opt-in for the built-in sample report. */
  useDemo?: boolean;
}): AnonymisedPayload {
  const { lang, reportId, report, useDemo = false } = opts;
  const l2 = lang === "hi" ? "hi" : "en";

  const results: AnonymisedResult[] = [];
  /** Earlier reports, oldest first, for the trend series. */
  let history: ClientHistoryPoint[] = [];
  let reportDate = "";
  let band = "unspecified";
  let sex: AnonymisedPayload["sex"] = "unspecified";

  if (report) {
    // ---- the user's own report ------------------------------------------
    for (const entry of report.results) {
      results.push(resultForClient(entry, lang, report.previous?.results, report.previous?.dateLabel));
    }
    reportDate = report.dateLabel ?? "";
    band = report.ageBand ?? "unspecified";
    sex = report.sex;
    history =
      report.history && report.history.length > 0
        ? report.history
        : report.previous
          ? [{ dateLabel: report.previous.dateLabel, results: report.previous.results }]
          : [];
  } else if (useDemo || reportId) {
    // ---- explicit sample/demo opt-in only -------------------------------
    const demo = pickReport(reportId) ?? (useDemo ? LATEST : undefined);
    if (demo) {
      const prev = previousReport(demo);
      for (const entry of demo.entries) {
        const r = resultFor(entry.test, entry.value, entry.status, lang, prev);
        if (r) results.push(r);
      }
      reportDate = demo.date[l2];
      band = ageBand(PATIENT.age);
      sex = normaliseSex(PATIENT.gender.en);
      const demoIdx = REPORTS.findIndex((r) => r.id === demo.id);
      history = (demoIdx > 0 ? REPORTS.slice(0, demoIdx) : []).map((r) => ({
        dateLabel: r.date[l2],
        results: r.entries.map((e) => ({ test: e.test, value: e.value })),
      }));
    }
  }

  // Only patterns whose every member test is actually present in this report,
  // so the model cannot be handed a pattern the data does not support.
  const present = new Set(results.map((r) => r.test));
  const patterns = PATTERNS.filter((p) => p.nodes.every((n) => present.has(n.test))).map((p) => ({
    title: p.title[l2],
    summary: `${p.expl[l2]} ${p.risk[l2]}`,
    tests: p.nodes.map((n) => n.test),
  }));

  const trends = buildTrends({
    current: results.map((r) => ({
      test: r.test,
      value: r.value,
      label: r.label,
      unit: r.unit,
      reference: {
        ...(r.ref_low !== undefined ? { low: r.ref_low } : {}),
        ...(r.ref_high !== undefined ? { high: r.ref_high } : {}),
        ...(r.ref_text ? { text: r.ref_text } : {}),
      },
    })),
    history,
    latestDate: reportDate,
    lang,
  });

  return {
    pseudonym: opts.pseudonym ?? randomUUID(),
    age_band: band,
    sex,
    report_date: reportDate,
    results,
    trends,
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
  if (payload.results.length === 0) {
    return "NO REPORT DATA: the person has not uploaded a report. Do not infer, invent, or quote laboratory results.";
  }

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
    lines.push(
      `- ${r.label} | ${r.value} | ${r.unit} | ${r.ref_text} | ${r.status_known === false ? "not assessed" : r.status}${prev}`
    );
  }
  if (payload.trends.length > 0) {
    lines.push("");
    lines.push(
      "TREND HISTORY (test | oldest -> latest values with dates | direction | already judged as)"
    );
    for (const t of payload.trends.slice(0, 12)) {
      const series = t.points.map((p) => `${p.value} on ${p.date}`).join(" -> ");
      const verdict = t.worsening
        ? "moving further outside the range"
        : t.improving
          ? "moving back towards the range"
          : t.direction === "flat"
            ? "broadly steady"
            : "changed but still in the same relationship to the range";
      lines.push(
        `- ${t.label} (${t.unit}) | ${series} | ${t.direction} ${t.change >= 0 ? "+" : ""}${t.change} | ${verdict}`
      );
    }
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
  // Every historical value the trend section shows is quotable too, along with
  // the deltas the rule engine computed — otherwise an answer that correctly
  // says "up 1.3 since February" is penalised for inventing 1.3.
  for (const t of payload.trends) {
    for (const p of t.points) {
      add(p.value);
      for (const m of p.date.match(/\d+(?:\.\d+)?/g) ?? []) nums.add(m);
    }
    add(Math.abs(t.change));
    add(t.change);
    if (t.change_pct !== undefined) {
      add(Math.abs(t.change_pct));
      add(t.change_pct);
    }
  }
  // An answer that names its own report date ("your 22 Aug 2026 report") is
  // quoting the payload, not inventing a number. Without this, every answer
  // that mentions the date would be penalised for two ungrounded values.
  for (const m of payload.report_date.match(/\d+(?:\.\d+)?/g) ?? []) nums.add(m);
  // Small counts and reading-level words are not clinical claims.
  for (const n of [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 12, 24]) nums.add(String(n));
  return nums;
}

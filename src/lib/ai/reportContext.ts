// ---------------------------------------------------------------------------
// The personalization payload the CLIENT sends, built in one place.
//
// This used to live inside src/app/ask/page.tsx. The voice agent has to send
// exactly the same thing — same fields, same de-identification, same omission
// of anything the server re-derives itself — so a second copy was a second
// chance to drift. Both UIs now call this.
//
// The rules are the ones the server enforces in src/lib/ai/clientReport.ts;
// this module exists so the client does not have to guess them:
//   - test ids and numeric values only for catalogued tests
//   - a bounded printed label, unit and reference range may accompany an
//     uncatalogued test so the app can preserve what the report actually said;
//     the server still validates every field and re-derives the status
//   - NO name, no lab, no free text beyond those bounded report fields and the
//     two date labels
// ---------------------------------------------------------------------------

import type { LangCode, ReportTestMetadata } from "@/lib/data";

export interface ContextResult extends ReportTestMetadata {
  test: string;
  value: number;
}

export interface ContextReport {
  id: string;
  date: { en: string; hi: string };
  entries: ContextResult[];
}

export interface ContextPatient {
  /** The patients.id uuid, when the profile came from Supabase. */
  id?: string;
  age: number;
  gender: { en: string };
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The `patientId` field the AI endpoints accept, present only when the id is a
 * real `patients` uuid.
 *
 * The conversation tables (voice_sessions, qa_messages, answer_feedback) are
 * keyed to a patient, so without this the server had nothing to file a turn
 * against and skipped those writes entirely. The seeded demo profile has no id,
 * and inventing one would attach AI rows to a person who does not exist — so in
 * demo mode this deliberately sends nothing and persistence stays off.
 *
 * Spread it into the request body:  { q, ...patientRef(patient), report }
 */
export function patientRef(patient: { id?: string }): { patientId?: string } {
  return patient.id && UUID_RE.test(patient.id) ? { patientId: patient.id } : {};
}

/** The exact JSON body field `report` that /api/answer accepts. */
export interface ReportContextPayload {
  reportId: string;
  dateLabel: string;
  age: number;
  gender: string;
  results: ContextResult[];
  previous?: { dateLabel: string; results: ContextResult[] };
  /**
   * Every earlier report on file, oldest first. The server computes the trend
   * directions from these (src/lib/ai/anonymizer.ts), which is what lets the
   * Overview summary talk about where things are heading rather than only
   * where they stand today.
   */
  history?: { dateLabel: string; results: ContextResult[] }[];
}

/** How many earlier reports are worth sending. Beyond this it is prompt budget
 *  spent on a trend the person can already see on the Trends screen. */
const MAX_HISTORY = 6;

export function buildReportContext(args: {
  activeReport: ContextReport;
  reports: ContextReport[];
  patient: ContextPatient;
  lang: LangCode;
}): ReportContextPayload {
  const { activeReport, reports, patient, lang } = args;
  const hi = lang === "hi";
  const idx = reports.findIndex((r) => r.id === activeReport.id);
  const prev = idx > 0 ? reports[idx - 1] : undefined;
  const values = (entries: ContextResult[]): ContextResult[] =>
    entries.map((e) => ({
      test: e.test,
      value: e.value,
      ...(e.label ? { label: e.label } : {}),
      ...(e.unit ? { unit: e.unit } : {}),
      ...(e.reference
        ? {
            reference: {
              ...(e.reference.low !== undefined ? { low: e.reference.low } : {}),
              ...(e.reference.high !== undefined ? { high: e.reference.high } : {}),
              ...(e.reference.text ? { text: e.reference.text } : {}),
            },
          }
        : {}),
    }));
  // Everything before the active report. When the active report is not in the
  // list at all (a fresh upload that has not been filed yet) the whole list is
  // history, which is exactly right.
  const earlier = (idx >= 0 ? reports.slice(0, idx) : reports).slice(-MAX_HISTORY);
  return {
    reportId: activeReport.id,
    dateLabel: hi ? activeReport.date.hi : activeReport.date.en,
    age: patient.age,
    gender: patient.gender.en,
    results: values(activeReport.entries),
    ...(prev
      ? {
          previous: {
            dateLabel: hi ? prev.date.hi : prev.date.en,
            results: values(prev.entries),
          },
        }
      : {}),
    ...(earlier.length > 0
      ? {
          history: earlier.map((r) => ({
            dateLabel: hi ? r.date.hi : r.date.en,
            results: values(r.entries),
          })),
        }
      : {}),
  };
}

/**
 * Stable per-browser conversation id, so multi-turn memory works server-side.
 *
 * `key` separates the text chat from the voice conversation on purpose: a voice
 * turn is answered with spoken formatting rules, and mixing the two histories
 * would push half-formatted text into the other channel's context.
 */
export function conversationId(key: string): string {
  if (typeof window === "undefined") return "";
  try {
    let v = window.localStorage.getItem(key);
    if (!v || !/^[a-zA-Z0-9-]{8,64}$/.test(v)) {
      v = crypto.randomUUID();
      window.localStorage.setItem(key, v);
    }
    return v;
  } catch {
    return "";
  }
}

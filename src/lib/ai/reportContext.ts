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
//   - test ids and numeric values only
//   - NO statuses, units or reference ranges (the server re-derives them from
//     the catalogue, so a client cannot claim one)
//   - NO name, no lab, no free text beyond the two date labels
// ---------------------------------------------------------------------------

import type { LangCode } from "@/lib/data";

export interface ContextReport {
  id: string;
  date: { en: string; hi: string };
  entries: { test: string; value: number }[];
}

export interface ContextPatient {
  age: number;
  gender: { en: string };
}

/** The exact JSON body field `report` that /api/answer accepts. */
export interface ReportContextPayload {
  reportId: string;
  dateLabel: string;
  age: number;
  gender: string;
  results: { test: string; value: number }[];
  previous?: { dateLabel: string; results: { test: string; value: number }[] };
}

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
  const values = (entries: { test: string; value: number }[]) =>
    entries.map((e) => ({ test: e.test, value: e.value }));
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

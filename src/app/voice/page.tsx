"use client";

// Full-screen voice agent — the same agent as the bottom sheet, in a page.
//
// The sheet is a quick "ask one thing" surface; this is the hands-free one: the
// transcript stays on screen, the conversation can run for several turns, and
// the language picker is always visible. Both render VoiceAgentPanel, so the
// microphone behaviour, the endpoint call and the personalization payload are
// identical by construction.

import { Mic } from "lucide-react";
import { AppShell } from "@/components/shell";
import { SectionTitle } from "@/components/core";
import { VoiceAgentPanel } from "@/components/voice";
import { useI18n } from "@/lib/i18n";
import { useReportData } from "@/context/ReportDataContext";
import { LANGUAGES } from "@/lib/ai/languages";

export default function VoicePage() {
  const { t } = useI18n();
  const { activeReport } = useReportData();

  return (
    <AppShell>
      <SectionTitle icon={Mic} title={t("voice.title")} sub={t("voice.sub")} />

      <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_280px]">
        <div>
          <VoiceAgentPanel />
        </div>

        {/* What this agent is grounded in, and which languages it takes. */}
        <aside className="space-y-4">
          <div className="card-shadow rounded-3xl border border-slate-100 bg-white p-4">
            <p className="text-xs font-extrabold uppercase tracking-wide text-slate-400">
              {t("voice.groundedIn")}
            </p>
            <p className="mt-1.5 text-sm font-extrabold text-brand-900">
              {activeReport.date.en}
            </p>
            <p className="mt-1 text-xs font-semibold text-slate-500">
              {activeReport.entries.length} results · {t("common.perReport")}
            </p>
          </div>

          <div className="card-shadow rounded-3xl border border-slate-100 bg-white p-4">
            <p className="text-xs font-extrabold uppercase tracking-wide text-slate-400">
              {t("voice.language")}
            </p>
            <ul className="mt-2 flex flex-wrap gap-1.5">
              {LANGUAGES.map((l) => (
                <li
                  key={l.code}
                  className="rounded-full bg-brand-50 px-2.5 py-1 text-[11px] font-extrabold text-brand-700"
                  title={l.english}
                >
                  {l.native}
                </li>
              ))}
            </ul>
            <p className="mt-2.5 text-[11px] font-semibold leading-relaxed text-slate-500">
              {t("voice.languageHint")}
            </p>
          </div>
        </aside>
      </div>
    </AppShell>
  );
}

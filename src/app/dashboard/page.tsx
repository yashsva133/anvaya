"use client";

// Screen 5 — main AI health report. Connected to dynamic Supabase & local report data.
// Includes top upload buttons, mode switch, AI summary, priority cards, connected patterns, and all results.

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
  BadgeInfo,
  BookOpen,
  BrainCircuit,
  CalendarDays,
  Camera,
  ChevronRight,
  CloudUpload,
  FilePlus2,
  FlaskConical,
  Languages,
  Lock,
  Mic,
  Sparkles,
  Stethoscope,
  UploadCloud,
} from "lucide-react";
import { AppShell } from "@/components/shell";
import {
  ListenBtn,
  SafetyNote,
  SectionTitle,
  StatusPill,
  TestIcon,
  statusClasses,
} from "@/components/core";
import { useI18n, pick } from "@/lib/i18n";
import { useAuth } from "@/lib/auth";
import {
  PATTERNS,
  TESTS,
  fmtValue,
  type ReportEntry,
} from "@/lib/data";
import { useReportData } from "@/context/ReportDataContext";

const MODES = [
  { id: "simple", key: "mode.simple" },
  { id: "advanced", key: "mode.advanced" },
] as const;

export default function DashboardPage() {
  const { t, s, set } = useI18n();
  const { user, profile } = useAuth();
  const router = useRouter();
  const { activeReport, patient: dbPatient, catalog } = useReportData();
  const hi = s.lang === "hi";

  const [hasReports, setHasReports] = useState<boolean>(true);

  const report = activeReport;
  const entries = report?.entries || [];

  const counts = {
    normal: entries.filter((e) => e.status === "normal").length,
    borderline: entries.filter((e) => e.status === "borderline").length,
    out: entries.filter((e) => e.status === "high" || e.status === "low" || e.status === "critical").length,
  };

  // Determine top priority cards from actual report entries
  const attentionEntries = entries.filter((e) => e.status !== "normal");
  const priorityIds = attentionEntries.length > 0
    ? attentionEntries.slice(0, 3).map((e) => e.test)
    : ["hemoglobin", "hba1c", "ldl"];

  const borderline = entries.filter((e) => e.status === "borderline").map((e) => e.test);
  const fallbackBorderline = borderline.length > 0 ? borderline : ["glucose", "triglycerides"];
  const lipid = PATTERNS[0];

  const summarySpeech = hi
    ? `आपकी रिपोर्ट में ${counts.normal} परिणाम सामान्य हैं, ${counts.borderline} पर ध्यान देना है, और ${counts.out} सामान्य सीमा से बाहर हैं। कृपया अपने डॉक्टर से चर्चा करें।`
    : `In your report, ${counts.normal} results are normal, ${counts.borderline} need attention, and ${counts.out} are outside the usual range. Please discuss them with your doctor.`;

  const displayName =
    dbPatient?.name ? (hi ? dbPatient.name.hi : dbPatient.name.en) :
    profile?.full_name ||
    user?.user_metadata?.full_name ||
    (hi ? "राहुल सिंह" : "Rahul Singh");

  const displayAge = dbPatient?.age || 42;
  const displayGender = dbPatient?.gender ? (hi ? dbPatient.gender.hi : dbPatient.gender.en) : (hi ? "पुरुष" : "Male");

  const initials = displayName
    .split(" ")
    .map((n: string) => n[0])
    .slice(0, 2)
    .join("")
    .toUpperCase() || "RS";

  return (
    <AppShell>
      {/* --------------------------------- Top Header with Upload Option --------------------------------- */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-brand-950 md:text-4xl">
            {t("dash.title")}
          </h1>
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm font-bold text-slate-500">
            <span className="flex items-center gap-1.5">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-700 text-[10px] font-extrabold text-white">
                {initials}
              </span>
              {displayName} · {displayAge} yrs ({displayGender})
            </span>
            <span className="flex items-center gap-1.5">
              <CalendarDays className="h-4 w-4" />
              {report?.date ? pick(report.date, s.lang) : "27 Aug 2026"}
            </span>
            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wide text-slate-400">
              {hi ? "Rxअन्वय लाइव रिपोर्ट" : "RxAnvaya Live Report"}
            </span>
          </div>
        </div>

        {/* Top Action Controls (Upload Button + Mode Switch) */}
        <div className="flex flex-wrap items-center gap-2.5 sm:gap-3">
          <Link
            href="/upload"
            className="inline-flex min-h-11 items-center gap-2 rounded-full bg-gradient-to-r from-mint-600 to-brand-700 px-5 text-sm font-extrabold text-white shadow-md shadow-brand-900/15 transition hover:-translate-y-0.5 hover:from-mint-500 hover:to-brand-600 active:scale-95"
          >
            <UploadCloud className="h-4 w-4" />
            <span>{hi ? "रिपोर्ट अपलोड करें" : "Upload Report"}</span>
          </Link>

          {/* reading mode switch */}
          <div className="no-scrollbar flex items-center gap-1 overflow-x-auto rounded-full border border-slate-200 bg-white p-1">
            {MODES.map((m) => (
              <button
                key={m.id}
                onClick={() => set({ mode: m.id })}
                aria-pressed={s.mode === m.id}
                className={`min-h-9 whitespace-nowrap rounded-full px-3.5 text-xs font-extrabold transition ${
                  s.mode === m.id
                    ? "bg-brand-700 text-white shadow"
                    : "text-slate-500 hover:text-brand-700"
                }`}
              >
                {t(m.key)}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ------------------------------ Summary hero ------------------------------ */}
      <motion.section
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        className="card-lift mt-6 overflow-hidden rounded-[2rem] border border-amber-200 bg-gradient-to-br from-amber-50 via-white to-white"
      >
        <div className="p-6 md:p-8">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="max-w-xl">
              <span className="inline-flex items-center gap-2 rounded-full bg-amber-100 px-3 py-1.5 text-xs font-extrabold text-amber-800">
                <Sparkles className="h-4 w-4" />
                AI {hi ? "सारांश" : "summary"}
              </span>
              <h2 className="mt-3 text-balance text-2xl font-extrabold leading-tight text-brand-950 md:text-3xl">
                {counts.out > 0 || counts.borderline > 0 ? t("dash.someAttention") : t("dash.allFine")}
              </h2>
              <p className="mt-2 text-sm font-semibold leading-relaxed text-slate-500 md:text-[15px]">
                {hi
                  ? `आपकी रिपोर्ट में ${counts.normal} सामान्य और ${counts.out + counts.borderline} ध्यान देने योग्य परिणाम हैं।`
                  : `Your report contains ${counts.normal} normal results and ${counts.out + counts.borderline} results requiring review.`}
              </p>
            </div>
            <ListenBtn text={summarySpeech} />
          </div>

          {/* counts */}
          <div className="mt-6 grid grid-cols-3 gap-3">
            {[
              { n: counts.normal, label: t("dash.normal"), c: "bg-emerald-50 border-emerald-200 text-emerald-700", bar: "bg-emerald-500" },
              { n: counts.borderline, label: t("dash.borderline"), c: "bg-amber-50 border-amber-300 text-amber-700", bar: "bg-amber-500" },
              { n: counts.out, label: t("dash.out"), c: "bg-rose-50 border-rose-200 text-rose-700", bar: "bg-rose-500" },
            ].map((x) => (
              <div
                key={x.label}
                className={`rounded-3xl border p-4 text-center md:p-5 ${x.c}`}
              >
                <p className="tabular text-4xl font-extrabold md:text-5xl">{x.n}</p>
                <div className={`mx-auto mt-2 h-1.5 w-10 rounded-full ${x.bar}`} />
                <p className="mt-2 text-xs font-extrabold leading-tight md:text-sm">
                  {x.label}
                </p>
              </div>
            ))}
          </div>
        </div>
      </motion.section>

      {/* ---------------------------- What matters most ---------------------------- */}
      <section className="mt-10">
        <SectionTitle icon={Sparkles} title={t("dash.mattersMost")} sub={t("dash.mattersSub")} />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {priorityIds.map((id, i) => {
            const e = entries.find((x) => x.test === id) || { test: id, value: 0, status: "normal" as const };
            return (
              <PriorityCard key={id} entry={e} index={i} hi={hi} catalog={catalog} />
            );
          })}
        </div>
      </section>

      {/* ------------------------------ Pattern teaser ----------------------------- */}
      <motion.section className="mt-10">
        <Link
          href="/insights"
          className="card-shadow group flex flex-col gap-4 rounded-[2rem] border-2 border-violet-200 bg-gradient-to-br from-violet-50 via-white to-white p-6 transition hover:border-violet-400 md:flex-row md:items-center"
        >
          <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-violet-600 text-white shadow-lg shadow-violet-600/25">
            <BrainCircuit className="h-7 w-7" />
          </span>
          <div className="flex-1">
            <p className="text-xs font-extrabold uppercase tracking-widest text-violet-600">
              {t("insights.found")}
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {lipid.nodes.map((n, i) => (
                <span key={n.test} className="flex items-center gap-2">
                  <span className="inline-flex items-center gap-1.5 rounded-xl bg-white px-3 py-1.5 text-sm font-extrabold text-slate-700 shadow-sm ring-1 ring-slate-100">
                    <TestIcon testId={n.test} size={22} />
                    {(catalog[n.test] || TESTS[n.test] || TESTS.hemoglobin).name.en}
                    <span className="text-rose-600">
                      {n.arrow === "up" ? "↑" : n.arrow === "down" ? "↓" : "→"}
                    </span>
                  </span>
                  {i < lipid.nodes.length - 1 && (
                    <span className="text-lg font-black text-violet-400">+</span>
                  )}
                </span>
              ))}
            </div>
            <p className="mt-2 text-sm font-semibold text-slate-500">
              {pick(lipid.expl, s.lang)}
            </p>
          </div>
          <ChevronRight className="h-6 w-6 self-start text-violet-400 transition group-hover:translate-x-1 md:self-center" />
        </Link>
      </motion.section>

      {/* ------------------------------- All results ------------------------------- */}
      <section className="mt-10">
        <SectionTitle
          icon={BookOpen}
          title={t("dash.allResults")}
          sub={`${entries.length} ${t("reports.tests")} · ${report?.date ? pick(report.date, s.lang) : "27 Aug 2026"}`}
        />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {entries.map((e) => (
            <ResultCard key={e.test} entry={e} catalog={catalog} />
          ))}
        </div>
      </section>

      {/* --------------------------- Borderline section --------------------------- */}
      <section className="mt-10">
        <SectionTitle icon={BadgeInfo} title={t("dash.closeToLimit")} sub={t("dash.closeNote")} />
        <div className="grid gap-4 md:grid-cols-2">
          {fallbackBorderline.slice(0, 2).map((id) => {
            const e = entries.find((x) => x.test === id) || { test: id, value: 0, status: "borderline" as const };
            const def = catalog[id] || TESTS[id] || TESTS.hemoglobin;
            return (
              <div
                key={id}
                className="card-shadow flex items-center gap-4 rounded-3xl border-2 border-amber-300 bg-gradient-to-br from-amber-50 to-white p-5"
              >
                <TestIcon testId={id} size={54} />
                <div className="flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-lg font-extrabold text-slate-800">
                      {pick(def.name, s.lang)}
                    </p>
                    <StatusPill status="borderline" size="sm" />
                  </div>
                  <p className="mt-1 text-sm font-semibold text-slate-500">
                    {hi
                      ? "यह परिणाम पसंदीदा सीमा से थोड़ा ऊपर है, पर बहुत अधिक नहीं।"
                      : "This result is slightly outside the preferred range."}
                  </p>
                </div>
                <div className="text-right">
                  <p className="tabular text-3xl font-extrabold text-amber-700">
                    {fmtValue(e.value)}
                  </p>
                  <p className="text-[11px] font-bold text-slate-400">{def.unit}</p>
                </div>
              </div>
            );
          })}
        </div>
        <p className="mt-3 flex items-start gap-2 text-sm font-semibold text-slate-500">
          <Stethoscope className="mt-0.5 h-4 w-4 shrink-0 text-brand-500" />
          {t("dash.closeNote")}
        </p>
      </section>

      {/* ------------------------------ Action banner ------------------------------ */}
      <section className="mt-10 rounded-[2rem] bg-brand-900 p-8 text-center text-white md:p-12">
        <Mic className="mx-auto h-9 w-9 text-mint-300" />
        <h2 className="mt-3 text-balance text-3xl font-extrabold md:text-4xl">
          {t("footer.line1")}
        </h2>
        <p className="mt-1 text-lg font-bold text-mint-300 md:text-xl">
          {t("footer.line2")}
        </p>
        <p className="mx-auto mt-3 max-w-md text-sm font-medium text-white/60">
          {t("footer.sub")}
        </p>
        <div className="mt-7 flex flex-wrap justify-center gap-3">
          <button
            onClick={() => router.push("/upload")}
            className="inline-flex min-h-14 items-center gap-2 rounded-2xl bg-white px-6 text-base font-extrabold text-brand-800 shadow-lg transition hover:-translate-y-0.5 active:scale-95"
          >
            <FilePlus2 className="h-5 w-5" />
            {t("footer.cta1")}
          </button>
          <button
            onClick={() => router.push("/doctor")}
            className="inline-flex min-h-14 items-center gap-2 rounded-2xl border-2 border-white/40 px-6 text-base font-extrabold text-white transition hover:bg-white/10 active:scale-95"
          >
            <Stethoscope className="h-5 w-5" />
            {t("footer.cta2")}
          </button>
        </div>
      </section>

      {/* ------------------------------ Safety + footer ------------------------------ */}
      <div className="mt-10">
        <SafetyNote />
      </div>
    </AppShell>
  );
}

/* ------------------------------- Priority card ------------------------------- */

function PriorityCard({
  entry,
  index,
  hi,
  catalog,
}: {
  entry: ReportEntry;
  index: number;
  hi: boolean;
  catalog: any;
}) {
  const { t } = useI18n();
  const def = catalog?.[entry.test] || TESTS[entry.test] || TESTS.hemoglobin;
  const line = entry.status === "high"
    ? { en: `${def.name.en} is above the usual range.`, hi: `${def.name.hi} सामान्य सीमा से अधिक है।` }
    : entry.status === "low"
      ? { en: `${def.name.en} is lower than the usual range.`, hi: `${def.name.hi} सामान्य सीमा से कम है।` }
      : { en: `${def.name.en} is within the expected range.`, hi: `${def.name.hi} सामान्य सीमा में है।` };

  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ delay: index * 0.08 }}
      className="card-shadow flex flex-col rounded-3xl border-2 border-rose-200 bg-white p-5"
    >
      <div className="flex items-start justify-between gap-3">
        <TestIcon testId={entry.test} size={50} />
        <StatusPill status={entry.status} size="sm" />
      </div>
      <p className="mt-3 text-lg font-extrabold text-slate-800">
        {pick(def.name, hi ? "hi" : "en")}
        {entry.status === "low" && <span className="text-rose-600"> — {t("status.low")}</span>}
        {entry.status === "high" && <span className="text-rose-600"> — {t("status.high")}</span>}
      </p>
      <p className="tabular mt-1 text-3xl font-extrabold text-brand-900">
        {fmtValue(entry.value)}
        <span className="ml-1 text-sm font-bold text-slate-400">{def.unit}</span>
      </p>
      <p className="mt-2 text-sm font-semibold leading-relaxed text-slate-500">
        {pick(line, hi ? "hi" : "en")}
      </p>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <ListenBtn compact text={`${def.name.en}. ${fmtValue(entry.value)} ${def.unit}. ${line.en}`} />
        <Link
          href={`/test/${entry.test}`}
          className="inline-flex min-h-10 items-center gap-1.5 rounded-full bg-brand-700 px-4 text-sm font-extrabold text-white transition hover:bg-brand-600 active:scale-95"
        >
          {t("common.viewDetails")}
          <ChevronRight className="h-4 w-4" />
        </Link>
      </div>
      <p className="mt-3 border-t border-dashed border-slate-200 pt-3 text-xs font-bold text-slate-400">
        {t("common.whyMatter")} →
      </p>
    </motion.div>
  );
}

/* -------------------------------- Result card -------------------------------- */

function ResultCard({ entry, catalog }: { entry: ReportEntry; catalog: any }) {
  const { t, s } = useI18n();
  const def = catalog?.[entry.test] || TESTS[entry.test] || TESTS.hemoglobin;
  const simple = s.mode === "simple";
  const c = statusClasses(entry.status);
  const name = s.mode === "advanced" ? pick(def.name, s.lang) : pick(def.simple, s.lang);

  return (
    <Link
      href={`/test/${entry.test}`}
      className={`card-shadow group rounded-3xl border bg-white p-4 transition hover:-translate-y-0.5 hover:border-brand-300 ${c.border}`}
    >
      <div className="flex items-center gap-3.5">
        <TestIcon testId={entry.test} size={simple ? 56 : 44} />
        <div className="min-w-0 flex-1">
          <p className={`truncate font-extrabold text-slate-800 ${simple ? "text-lg" : "text-[15px]"}`}>
            {name}
          </p>
          {!simple && (
            <p className="text-[11px] font-bold text-slate-400">{def.ref.text}</p>
          )}
        </div>
        <ChevronRight className="h-5 w-5 shrink-0 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-brand-600" />
      </div>
      <div className="mt-3 flex items-end justify-between gap-2">
        <p className={`tabular font-extrabold text-brand-900 ${simple ? "text-3xl" : "text-2xl"}`}>
          {fmtValue(entry.value)}
          <span className="ml-1 text-xs font-bold text-slate-400">{def.unit}</span>
        </p>
        <StatusPill status={entry.status} size="sm" />
      </div>
      {simple && (
        <p className="mt-2 text-sm font-semibold text-slate-500">
          {pick({ en: def.what.vs_en, hi: def.what.vs_hi }, s.lang)}
        </p>
      )}
    </Link>
  );
}

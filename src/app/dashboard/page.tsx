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
import { PatternTeaser } from "@/components/pattern-teaser";
import { OverviewSummaryCard } from "@/components/summary-card";
import { useI18n, pick } from "@/lib/i18n";
import { useAuth } from "@/lib/auth";
import { fmtValue, reportStatusKnown, resolveTestDef, type ReportEntry } from "@/lib/data";
import { useReportData } from "@/context/ReportDataContext";

const MODES = [
  { id: "simple", key: "mode.simple" },
  { id: "advanced", key: "mode.advanced" },
] as const;

export default function DashboardPage() {
  const { t, s, set } = useI18n();
  const { user, profile } = useAuth();
  const router = useRouter();
  const { activeReport, patient: dbPatient, catalog, reports, loading } = useReportData();
  const hi = s.lang === "hi";

  const report = activeReport;
  const entries = report?.entries || [];

  if (loading || entries.length === 0) {
    return (
      <AppShell>
        <section className="card-shadow mt-8 overflow-hidden rounded-[2rem] border-2 border-dashed border-brand-200 bg-gradient-to-br from-brand-50 via-white to-mint-50 p-8 text-center md:p-12">
          {loading ? (
            <>
              <div className="mx-auto h-12 w-12 animate-pulse rounded-2xl bg-brand-100" />
              <h1 className="mt-5 text-2xl font-extrabold text-brand-950">
                {hi ? "आपकी रिपोर्ट्स लोड हो रही हैं…" : "Loading your reports…"}
              </h1>
            </>
          ) : (
            <>
              <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-mint-100 text-mint-700">
                <FilePlus2 className="h-8 w-8" />
              </span>
              <p className="mt-5 text-xs font-extrabold uppercase tracking-[0.18em] text-mint-700">
                {hi ? "आपका ओवरव्यू" : "Your overview"}
              </p>
              <h1 className="mt-2 text-2xl font-extrabold tracking-tight text-brand-950 md:text-3xl">
                {hi ? "अभी कोई रिपोर्ट नहीं है" : "No report uploaded yet"}
              </h1>
              <p className="mx-auto mt-3 max-w-md text-sm font-semibold leading-relaxed text-slate-500 md:text-base">
                {hi
                  ? "अपनी लैब रिपोर्ट अपलोड करें या कैमरे से स्कैन करें। रिपोर्ट मिलने के बाद यहाँ आपके असली परिणाम और उनका ओवरव्यू दिखेगा।"
                  : "Upload your lab report or scan it with your camera. Your overview will appear here using your own results — not sample data."}
              </p>
              <div className="mt-6 flex flex-wrap justify-center gap-3">
                <Link
                  href="/upload"
                  className="inline-flex min-h-12 items-center gap-2 rounded-2xl bg-brand-700 px-6 text-sm font-extrabold text-white shadow-md transition hover:bg-brand-600 active:scale-95"
                >
                  <UploadCloud className="h-5 w-5" />
                  {hi ? "रिपोर्ट अपलोड करें" : "Upload report"}
                </Link>
                <Link
                  href="/scan"
                  className="inline-flex min-h-12 items-center gap-2 rounded-2xl border-2 border-mint-200 bg-white px-6 text-sm font-extrabold text-mint-800 transition hover:border-mint-400 hover:bg-mint-50 active:scale-95"
                >
                  <Camera className="h-5 w-5" />
                  {hi ? "स्कैन करें" : "Scan with camera"}
                </Link>
              </div>
            </>
          )}
        </section>
      </AppShell>
    );
  }

  // Determine top priority cards from assessed report entries only. An
  // uncatalogued value without a printed range is shown below, but must not be
  // presented as normal or abnormal by borrowing another test's definition.
  const assessedEntries = entries.filter(reportStatusKnown);
  const attentionEntries = assessedEntries.filter((e) => e.status !== "normal");
  const priorityIds = (attentionEntries.length > 0 ? attentionEntries : assessedEntries)
    .slice(0, 3)
    .map((e) => e.test);

  const fallbackBorderline = assessedEntries
    .filter((e) => e.status === "borderline")
    .map((e) => e.test);

  const displayName =
    (dbPatient?.name?.en || profile?.full_name || user?.user_metadata?.full_name || "Your profile").trim();
  const displayAge = dbPatient?.age > 0 ? dbPatient.age : null;
  const displayGender = dbPatient?.gender?.en
    ? hi
      ? dbPatient.gender.hi
      : dbPatient.gender.en
    : null;

  const initials = displayName
    .split(" ")
    .map((n: string) => n[0])
    .slice(0, 2)
    .join("")
    .toUpperCase() || "U";

  if (!loading && reports.length === 0) {
    return (
      <AppShell>
        <div className="flex h-[60vh] flex-col items-center justify-center text-center">
          <div className="flex h-24 w-24 items-center justify-center rounded-full bg-brand-100 text-brand-600 mb-6">
            <FilePlus2 className="h-12 w-12" />
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight text-brand-950 md:text-4xl mb-3">
            {hi ? "कोई डेटा नहीं" : "No data available"}
          </h1>
          <p className="max-w-md text-lg font-medium text-slate-500 mb-8">
            {hi
              ? "शुरू करने के लिए अपनी पहली लैब रिपोर्ट अपलोड करें।"
              : "Upload your first lab report to get started."}
          </p>
          <Link
            href="/upload"
            className="inline-flex min-h-14 items-center gap-2 rounded-2xl bg-brand-700 px-8 text-lg font-extrabold text-white shadow-lg transition hover:-translate-y-0.5 hover:bg-brand-600 active:scale-95"
          >
            <FilePlus2 className="h-5 w-5" />
            {t("footer.cta1")}
          </Link>
        </div>
      </AppShell>
    );
  }

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
              {displayName}
              {displayAge !== null && ` · ${displayAge} yrs`}
              {displayGender && ` (${displayGender})`}
            </span>
            {report?.date && (
              <span className="flex items-center gap-1.5">
                <CalendarDays className="h-4 w-4" />
                {pick(report.date, s.lang)}
              </span>
            )}
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
      {/* MedGemma writes this box: current status + the trend across every
          earlier report. See src/components/summary-card.tsx and
          POST /api/summary. It falls back to a deterministic summary built
          from the same numbers when no model is reachable. */}
      <OverviewSummaryCard />

      {/* ---------------------------- What matters most ---------------------------- */}
      <section className="mt-10">
        <SectionTitle icon={Sparkles} title={t("dash.mattersMost")} sub={t("dash.mattersSub")} />
        {priorityIds.length > 0 ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {priorityIds.map((id, i) => {
              const e = entries.find((x) => x.test === id);
              if (!e) return null;
              return <PriorityCard key={id} entry={e} index={i} hi={hi} catalog={catalog} />;
            })}
          </div>
        ) : (
          <div className="rounded-3xl border-2 border-dashed border-slate-200 bg-white p-5 text-sm font-semibold text-slate-500">
            {hi
              ? "इन परिणामों के लिए विश्वसनीय संदर्भ सीमा उपलब्ध नहीं है। छपी हुई रिपोर्ट डॉक्टर को दिखाएँ।"
              : "These results have no trusted reference range yet. Show the printed report to your doctor."}
          </div>
        )}
      </section>

      {/* ------------------------------ Pattern teaser ----------------------------- */}
      {/* The strongest connection the rule engine found in THIS report, from the
          same /api/insights call the AI Insights page uses. */}
      <PatternTeaser />

      {/* ------------------------------- All results ------------------------------- */}
      <section className="mt-10">
        <SectionTitle
          icon={BookOpen}
          title={t("dash.allResults")}
          sub={`${entries.length} ${t("reports.tests")}${report?.date ? ` · ${pick(report.date, s.lang)}` : ""}`}
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
            const e = entries.find((x) => x.test === id);
            if (!e) return null;
            const def = resolveTestDef(id, catalog, e);
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
  const def = resolveTestDef(entry.test, catalog, entry);
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
        <StatusPill status={entry.status} known={reportStatusKnown(entry)} size="sm" />
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
  const def = resolveTestDef(entry.test, catalog, entry);
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
        <StatusPill status={entry.status} known={reportStatusKnown(entry)} size="sm" />
      </div>
      {simple && (
        <p className="mt-2 text-sm font-semibold text-slate-500">
          {pick({ en: def.what.vs_en, hi: def.what.vs_hi }, s.lang)}
        </p>
      )}
    </Link>
  );
}

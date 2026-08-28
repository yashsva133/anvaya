"use client";

// Screen — compare two reports side by side with plain-language summary.
// Connected to dynamic Supabase & local report data.

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import {
  ArrowLeftRight,
  ArrowRight,
  GitCompareArrows,
  SearchX,
  Sparkles,
  UploadCloud,
} from "lucide-react";
import { AppShell } from "@/components/shell";
import {
  ListenBtn,
  SafetyNote,
  SectionTitle,
  StatusPill,
  TestIcon,
  TrendDirIcon,
} from "@/components/core";
import { useI18n, pick } from "@/lib/i18n";
import { fmtValue, reportStatusKnown, resolveTestDef, type ReportEntry, type Status } from "@/lib/data";
import { useReportData } from "@/context/ReportDataContext";

type Verdict = "improved" | "worsened" | "stable" | "changed";

const HIGH_BAD = new Set(["hba1c", "ldl", "glucose", "triglycerides", "totalchol"]);

function verdict(testId: string, from: number, to: number, def: any): Verdict {
  const pct = Math.abs((to - from) / (from || 1));
  if (pct < 0.03) return "stable";
  if (HIGH_BAD.has(testId)) return to > from ? "worsened" : "improved";
  if (def.ref.low != null && def.ref.high != null) {
    const wasOut = from < def.ref.low || from > def.ref.high;
    const nowOut = to < def.ref.low || to > def.ref.high;
    if (wasOut && !nowOut) return "improved";
    if (!wasOut && nowOut) return "worsened";
    if (wasOut && nowOut) {
      const wasDistance = from < def.ref.low ? def.ref.low - from : from - def.ref.high;
      const nowDistance = to < def.ref.low ? def.ref.low - to : to - def.ref.high;
      if (nowDistance > wasDistance) return "worsened";
      if (nowDistance < wasDistance) return "improved";
    }
    return "stable";
  }
  if (def.ref.low != null) return to < from ? "worsened" : "improved";
  // An uncatalogued result without a range can be compared numerically, but
  // the app must not call that movement clinically better or worse.
  return "changed";
}

function compareSummary(
  rows: { test: string; from: ReportEntry; to: ReportEntry }[],
  catalog: Record<string, any>,
  hi: boolean
): string {
  const changed = rows
    .map((row) => {
      const def = resolveTestDef(row.test, catalog, row.to);
      return {
        ...row,
        def,
        result: verdict(row.test, row.from.value, row.to.value, def),
      };
    })
    .filter((row) => row.result !== "stable");
  if (changed.length === 0) {
    return hi
      ? "दोनों रिपोर्टों में साझा जाँचों के मान में कोई महत्वपूर्ण बदलाव नहीं दिखा।"
      : "No material change appears in the tests shared by these two reports.";
  }

  const describe = (row: (typeof changed)[number]) =>
    `${row.def.name.en} (${fmtValue(row.from.value)} → ${fmtValue(row.to.value)} ${row.def.unit})`;
  const worsened = changed.filter((row) => row.result === "worsened").slice(0, 2).map(describe);
  const improved = changed.filter((row) => row.result === "improved").slice(0, 2).map(describe);
  const unclassified = changed.filter((row) => row.result === "changed").slice(0, 2).map(describe);
  const parts: string[] = [];
  if (worsened.length > 0) {
    parts.push(
      hi
        ? `इन जाँचों पर अधिक ध्यान दें: ${worsened.join(", ")}`
        : `Needs a closer look: ${worsened.join(", ")}`
    );
  }
  if (improved.length > 0) {
    parts.push(
      hi
        ? `बेहतर हुए मान: ${improved.join(", ")}`
        : `Improved: ${improved.join(", ")}`
    );
  }
  if (unclassified.length > 0) {
    parts.push(
      hi
        ? `बदले हुए मान, जिनकी चिकित्सकीय दिशा तय नहीं की गई: ${unclassified.join(", ")}`
        : `Changed values without a clinical direction: ${unclassified.join(", ")}`
    );
  }
  return `${parts.join(". ")}. ${hi ? "यह निदान नहीं है; डॉक्टर के साथ चर्चा करें।" : "This is not a diagnosis; discuss the change with your doctor."}`;
}

function CompareInner() {
  const params = useSearchParams();
  const { t, s } = useI18n();
  const { reports, catalog } = useReportData();
  const hi = s.lang === "hi";

  const defaultOld = reports.length > 1 ? reports[0].id : "";
  const defaultNew = reports.length > 1 ? reports[reports.length - 1].id : "";

  const [oldId, setOldId] = useState(params.get("old") ?? defaultOld);
  const [newId, setNewId] = useState(params.get("new") ?? defaultNew);

  useEffect(() => {
    if (reports.length < 2) return;
    if (!reports.some((report) => report.id === oldId)) setOldId(defaultOld);
    if (!reports.some((report) => report.id === newId)) setNewId(defaultNew);
  }, [defaultNew, defaultOld, newId, oldId, reports]);

  if (reports.length < 2) {
    return (
      <AppShell>
        <SectionTitle icon={GitCompareArrows} title={t("compare.title")} sub={hi ? "दो रिपोर्टों की तुलना के लिए कम से कम दो saved रिपोर्ट चाहिए।" : "Save at least two reports before comparing them."} />
        <section className="card-shadow mt-5 rounded-[2rem] border-2 border-dashed border-brand-200 bg-white p-8 text-center">
          <SearchX className="mx-auto h-12 w-12 text-slate-300" />
          <h1 className="mt-4 text-2xl font-extrabold text-brand-950">{reports.length === 0 ? (hi ? "अभी कोई रिपोर्ट नहीं है" : "No reports to compare") : (hi ? "एक और रिपोर्ट चाहिए" : "One more report is needed")}</h1>
          <p className="mx-auto mt-2 max-w-md text-sm font-semibold text-slate-500">{hi ? "रिपोर्ट अपलोड या स्कैन करें।" : "Upload or scan another laboratory report to compare real readings."}</p>
          <Link href="/upload" className="mt-5 inline-flex min-h-12 items-center gap-2 rounded-2xl bg-brand-700 px-6 text-sm font-extrabold text-white hover:bg-brand-600"><UploadCloud className="h-5 w-5" />{hi ? "रिपोर्ट अपलोड करें" : "Upload report"}</Link>
        </section>
      </AppShell>
    );
  }

  const oldR = reports.find((r) => r.id === oldId) ?? reports[0];
  const newR = reports.find((r) => r.id === newId) ?? reports[reports.length - 1];

  const shared = (newR?.entries || [])
    .map((e) => {
      const prev = oldR?.entries.find((x) => x.test === e.test);
      return prev ? { test: e.test, from: prev, to: e } : null;
    })
    .filter((x): x is NonNullable<typeof x> => !!x)
    .sort((a, b) => {
      const defA = resolveTestDef(a.test, catalog, a.from);
      const defB = resolveTestDef(b.test, catalog, b.to);
      const rank = (v: Verdict) => (v === "worsened" ? 0 : v === "improved" ? 1 : 2);
      return rank(verdict(a.test, a.from.value, a.to.value, defA)) - rank(verdict(b.test, b.from.value, b.to.value, defB));
    });

  const comparisonSummary = compareSummary(shared, catalog, hi);

  const statusBadge = (st: Verdict) =>
    st === "worsened" ? (
      <span className="rounded-full bg-rose-100 px-3 py-1 text-xs font-extrabold text-rose-700">
        {t("compare.worsened")}
      </span>
    ) : st === "improved" ? (
      <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-extrabold text-emerald-700">
        {t("compare.improved")}
      </span>
    ) : st === "changed" ? (
      <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-extrabold text-slate-600">
        {t("compare.changed")}
      </span>
    ) : (
      <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-extrabold text-slate-500">
        {t("compare.stable")}
      </span>
    );

  return (
    <AppShell>
      <SectionTitle
        icon={GitCompareArrows}
        title={t("compare.title")}
        sub={hi ? "दो रिपोर्ट चुनें और बदलाव देखें।" : "Pick two reports to see what changed."}
      />

      {/* pickers */}
      <div className="grid items-center gap-4 lg:grid-cols-[1fr_auto_1fr]">
        {/* Box 1: Older Report */}
        <div className="card-shadow rounded-[2rem] border border-slate-100 bg-white p-5 sm:p-6">
          <div className="flex items-center justify-between gap-2 border-b border-slate-100 pb-3">
            <p className="text-xs font-extrabold uppercase tracking-widest text-slate-400">
              {t("compare.older")}
            </p>
            <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-extrabold text-brand-900">
              {oldR ? pick(oldR.date, s.lang) : "Previous"}
            </span>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2.5">
            {reports.map((r) => {
              const isSelected = oldId === r.id;
              const isDisabled = newId === r.id;
              return (
                <button
                  key={r.id}
                  disabled={isDisabled}
                  onClick={() => setOldId(r.id)}
                  className={`min-h-[52px] rounded-2xl border-2 px-3 text-sm font-extrabold transition active:scale-95 disabled:cursor-not-allowed disabled:opacity-30 ${
                    isSelected
                      ? "border-brand-700 bg-brand-700 text-white shadow-md shadow-brand-900/15"
                      : "border-slate-200 bg-white text-slate-700 hover:border-brand-300 hover:bg-brand-50/30"
                  }`}
                >
                  {pick(r.month, s.lang)}
                </button>
              );
            })}
          </div>
        </div>

        {/* Center Connector */}
        <div className="flex justify-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-700 text-white shadow-md shadow-brand-900/20">
            <ArrowRight className="h-5 w-5 rotate-90 lg:rotate-0" strokeWidth={2.6} />
          </span>
        </div>

        {/* Box 2: Newer Report */}
        <div className="card-shadow rounded-[2rem] border border-slate-100 bg-white p-5 sm:p-6">
          <div className="flex items-center justify-between gap-2 border-b border-slate-100 pb-3">
            <p className="text-xs font-extrabold uppercase tracking-widest text-slate-400">
              {t("compare.newer")}
            </p>
            <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-extrabold text-brand-900">
              {newR ? pick(newR.date, s.lang) : "Latest"}
            </span>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2.5">
            {reports.map((r) => {
              const isSelected = newId === r.id;
              const isDisabled = oldId === r.id;
              return (
                <button
                  key={r.id}
                  disabled={isDisabled}
                  onClick={() => setNewId(r.id)}
                  className={`min-h-[52px] rounded-2xl border-2 px-3 text-sm font-extrabold transition active:scale-95 disabled:cursor-not-allowed disabled:opacity-30 ${
                    isSelected
                      ? "border-brand-700 bg-brand-700 text-white shadow-md shadow-brand-900/15"
                      : "border-slate-200 bg-white text-slate-700 hover:border-brand-300 hover:bg-brand-50/30"
                  }`}
                >
                  {pick(r.month, s.lang)}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* AI summary */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="mt-6 flex flex-wrap items-center gap-4 rounded-3xl border-2 border-mint-200 bg-mint-50 p-5"
      >
        <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-mint-600 text-white">
          <Sparkles className="h-5 w-5" />
        </span>
        <p className="flex-1 text-[15px] font-bold leading-relaxed text-mint-900">
          {comparisonSummary}
        </p>
        <ListenBtn compact text={comparisonSummary} />
      </motion.div>

      {/* diff list */}
      <section className="mt-8">
        <SectionTitle icon={ArrowLeftRight} title={t("compare.whatChanged")} />
        <div className="space-y-2.5">
          {shared.length === 0 ? (
            <div className="rounded-3xl border-2 border-dashed border-slate-200 bg-white p-6 text-center text-sm font-semibold text-slate-500">
              {hi
                ? "इन दोनों रिपोर्टों में कोई समान जाँच नहीं मिली।"
                : "These two reports have no common tests to compare."}
            </div>
          ) : (
            shared.map((row, i) => {
            const def = resolveTestDef(row.test, catalog, row.to);
            const v = verdict(row.test, row.from.value, row.to.value, def);
            const dir = row.to.value > row.from.value ? "up" : row.to.value < row.from.value ? "down" : "flat";
            return (
              <motion.div
                key={row.test}
                initial={{ opacity: 0, y: 8 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: Math.min(i * 0.04, 0.4) }}
                className={`card-shadow flex flex-wrap items-center gap-3 rounded-3xl border bg-white p-4 ${
                  v === "worsened" ? "border-rose-200" : v === "improved" ? "border-emerald-200" : "border-slate-100"
                }`}
              >
                <TestIcon testId={row.test} size={44} />
                <div className="min-w-[130px] flex-1">
                  <p className="text-[15px] font-extrabold text-slate-800">
                    {pick(def.name, s.lang)}
                  </p>
                  <StatusPill status={row.to.status as Status} known={reportStatusKnown(row.to)} size="sm" />
                </div>
                <div className="tabular flex items-center gap-2 text-lg font-extrabold">
                  <span className="text-slate-400">{fmtValue(row.from.value)}</span>
                  <span
                    className={`flex h-8 w-8 items-center justify-center rounded-full ${
                      v === "worsened"
                        ? "bg-rose-100 text-rose-600"
                        : v === "improved"
                          ? "bg-emerald-100 text-emerald-600"
                          : "bg-slate-100 text-slate-400"
                    }`}
                  >
                    <TrendDirIcon dir={dir} className="h-4 w-4" />
                  </span>
                  <span className="text-brand-900">{fmtValue(row.to.value)}</span>
                  <span className="text-xs font-bold text-slate-400">{def.unit}</span>
                </div>
                {statusBadge(v)}
              </motion.div>
            );
            }))}
        </div>
      </section>

      <div className="mt-10">
        <SafetyNote />
      </div>
    </AppShell>
  );
}

export default function ComparePage() {
  return (
    <Suspense>
      <CompareInner />
    </Suspense>
  );
}

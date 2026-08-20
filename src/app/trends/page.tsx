"use client";

// Screen 8 — trend analysis: charts, what-changed insight, report timeline.

import { useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  CircleAlert,
  GitCommitVertical,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import { AppShell } from "@/components/shell";
import {
  ListenBtn,
  SectionTitle,
  TestIcon,
  TrendChart,
  TrendDirIcon,
} from "@/components/core";
import { useI18n, pick } from "@/lib/i18n";
import {
  REPORTS,
  TESTS,
  TREND_CARDS,
  fmtValue,
  getValue,
  trendSeries,
} from "@/lib/data";

const SELECTABLE = [
  "hemoglobin",
  "hba1c",
  "glucose",
  "ldl",
  "hdl",
  "triglycerides",
  "creatinine",
  "platelets",
];

export default function TrendsPage() {
  const { t, s } = useI18n();
  const hi = s.lang === "hi";
  const [selected, setSelected] = useState("hemoglobin");
  const def = TESTS[selected];
  const series = trendSeries(selected);
  const first = series[0];
  const last = series[series.length - 1];
  const dir: "up" | "down" | "flat" =
    last > first ? "up" : last < first ? "down" : "flat";

  const changeCopy =
    selected === "hemoglobin"
      ? { head: t("trends.hbChange"), sub: t("trends.hbSimple"), bad: true }
      : selected === "hba1c"
        ? {
            head: hi ? "HbA1c 6 महीनों में 5.9% से बढ़कर 7.2% हुआ।" : "HbA1c rose from 5.9% to 7.2% over 6 months.",
            sub: hi ? "आपकी औसत शुगर धीरे-धीरे बढ़ रही है।" : "Your average sugar has been rising steadily.",
            bad: true,
          }
        : selected === "creatinine"
          ? {
              head: hi ? "क्रिएटिनिन स्थिर है (0.9 → 1.0)।" : "Creatinine is stable (0.9 → 1.0).",
              sub: hi ? "इस मान में कोई अर्थपूर्ण बदलाव नहीं हुआ।" : "No meaningful change in this value.",
              bad: false,
            }
          : {
              head: hi ? `${pick(def.name, "hi")} 6 महीनों में ${fmtValue(first)} से ${fmtValue(last)} हुआ।` : `${def.name.en} moved from ${fmtValue(first)} to ${fmtValue(last)} over 6 months.`,
              sub: hi ? "यह जानकारी डॉक्टर के लिए उपयोगी है।" : "Useful information for your doctor.",
              bad: dir !== "flat",
            };

  return (
    <AppShell>
      <SectionTitle
        icon={TrendingUp}
        title={t("trends.title")}
        sub={t("trends.sub")}
      />

      {/* selector chips */}
      <div className="no-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
        {SELECTABLE.map((id) => {
          const d = TESTS[id];
          const active = selected === id;
          return (
            <button
              key={id}
              onClick={() => setSelected(id)}
              aria-pressed={active}
              className={`flex min-h-14 shrink-0 items-center gap-2.5 rounded-2xl border-2 px-4 text-sm font-extrabold transition active:scale-95 ${
                active
                  ? "border-brand-700 bg-brand-700 text-white shadow-md"
                  : "border-slate-200 bg-white text-slate-600 hover:border-brand-300"
              }`}
            >
              <TestIcon testId={id} size={30} />
              {pick(d.name, s.lang)}
            </button>
          );
        })}
      </div>

      {/* main chart */}
      <motion.div
        key={selected}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="card-shadow mt-5 rounded-[2rem] border border-slate-100 bg-white p-6 md:p-7"
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-lg font-extrabold text-brand-950">
              {pick(def.name, s.lang)}
            </p>
            <p className="text-xs font-bold text-slate-400">
              {hi ? "सामान्य सीमा" : "Reference"}: {def.ref.text}
            </p>
          </div>
          <span
            className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-extrabold ${
              dir === "flat"
                ? "bg-emerald-50 text-emerald-700"
                : "bg-rose-50 text-rose-700"
            }`}
          >
            <TrendDirIcon dir={dir} className="h-4 w-4" />
            {fmtValue(first)} → {fmtValue(last)} {def.unit}
          </span>
        </div>
        <div className="mt-2">
          <TrendChart testId={selected} height={280} />
        </div>
        <p className="mt-1 text-center text-[11px] font-bold text-slate-400">
          {hi ? "हरा क्षेत्र = सामान्य सीमा · फ़रवरी → अगस्त 2026" : "Green band = usual range · Feb → Aug 2026"}
        </p>

        {/* what changed */}
        <div className="mt-5 grid gap-3 md:grid-cols-2">
          <div
            className={`rounded-2xl border p-4 ${
              changeCopy.bad
                ? "border-rose-200 bg-rose-50"
                : "border-emerald-200 bg-emerald-50"
            }`}
          >
            <p className="flex items-center gap-2 text-xs font-extrabold uppercase tracking-widest text-slate-500">
              {changeCopy.bad ? (
                <CircleAlert className="h-4 w-4 text-rose-600" />
              ) : (
                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
              )}
              {t("trends.whatChanged")}
            </p>
            <p className={`mt-2 text-base font-extrabold ${changeCopy.bad ? "text-rose-800" : "text-emerald-800"}`}>
              {changeCopy.head}
            </p>
            <p className="mt-1 text-sm font-bold text-slate-600">{changeCopy.sub}</p>
            <div className="mt-3">
              <ListenBtn compact text={`${changeCopy.head} ${changeCopy.sub}`} />
            </div>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <p className="text-xs font-extrabold uppercase tracking-widest text-slate-500">
              {t("trends.whyMatters")}
            </p>
            <p className="mt-2 text-sm font-semibold leading-relaxed text-slate-600">
              {t("trends.whyText")}
            </p>
          </div>
        </div>
      </motion.div>

      {/* trend cards */}
      <section className="mt-10">
        <SectionTitle
          icon={TrendingDown}
          title={hi ? "सभी रुझान एक नज़र में" : "All trends at a glance"}
        />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {TREND_CARDS.map((c, i) => {
            const d = TESTS[c.test];
            const tone = !c.attention
              ? "border-emerald-200 bg-white"
              : c.dir === "flat"
                ? "border-emerald-200 bg-white"
                : "border-rose-200 bg-white";
            return (
              <motion.button
                key={c.test}
                initial={{ opacity: 0, y: 10 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.04 }}
                onClick={() => {
                  setSelected(c.test);
                  window.scrollTo({ top: 0, behavior: "smooth" });
                }}
                className={`card-shadow rounded-3xl border-2 p-4 text-left transition hover:-translate-y-0.5 ${tone}`}
              >
                <div className="flex items-center justify-between">
                  <TestIcon testId={c.test} size={42} />
                  <span
                    className={`flex h-9 w-9 items-center justify-center rounded-full ${
                      !c.attention
                        ? "bg-emerald-50 text-emerald-600"
                        : "bg-rose-50 text-rose-600"
                    }`}
                  >
                    <TrendDirIcon dir={c.dir} />
                  </span>
                </div>
                <p className="mt-3 text-[15px] font-extrabold text-slate-800">
                  {pick(d.name, s.lang)}
                </p>
                <p className={`text-sm font-extrabold ${!c.attention ? "text-emerald-600" : "text-rose-600"}`}>
                  {pick(c.label, s.lang)}
                </p>
                <p className="mt-0.5 text-[11px] font-bold text-slate-400">{c.delta}</p>
              </motion.button>
            );
          })}
        </div>
      </section>

      {/* report timeline compare */}
      <section className="mt-10">
        <SectionTitle icon={CalendarDays} title={t("trends.timeline")} />
        <div className="card-shadow rounded-[2rem] border border-slate-100 bg-white p-6 md:p-8">
          <div className="relative">
            <div className="absolute bottom-5 left-[22px] top-2 w-1 rounded-full bg-gradient-to-b from-mint-200 via-brand-200 to-rose-200 md:left-1/2" />
            <div className="space-y-6">
              {[...REPORTS].reverse().map((r, idx) => {
                const warn = r.attention > 0;
                const hb = getValue(r.id, "hemoglobin");
                const a1c = getValue(r.id, "hba1c");
                return (
                  <motion.div
                    key={r.id}
                    initial={{ opacity: 0, y: 12 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ delay: idx * 0.08 }}
                    className={`relative flex gap-4 md:w-1/2 ${
                      idx % 2 === 1
                        ? "md:ml-auto md:pl-10"
                        : "md:pr-10 md:text-right md:flex-row-reverse"
                    }`}
                  >
                    <span
                      className={`relative z-10 mt-1 flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-white shadow-md md:absolute md:left-1/2 md:-translate-x-1/2 ${
                        idx === 0 ? "bg-brand-700" : warn ? "bg-amber-500" : "bg-mint-500"
                      }`}
                    >
                      <GitCommitVertical className="h-5 w-5" />
                    </span>
                    <div
                      className={`card-shadow flex-1 rounded-3xl border p-4 ${
                        idx === 0 ? "border-brand-300 bg-brand-50/50" : "border-slate-100 bg-white"
                      }`}
                    >
                      <div className={`flex flex-wrap items-center gap-2 ${idx % 2 === 1 ? "" : "md:justify-end"}`}>
                        <p className="text-base font-extrabold text-brand-950">
                          {pick(r.date, s.lang)}
                        </p>
                        {idx === 0 && (
                          <span className="rounded-full bg-brand-700 px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wide text-white">
                            {t("reports.latest")}
                          </span>
                        )}
                      </div>
                      <p className="text-xs font-bold text-slate-400">
                        {r.testsCount} {t("reports.tests")} ·{" "}
                        {warn ? (
                          <span className="text-amber-600">
                            {r.attention} {t("reports.needAttention")}
                          </span>
                        ) : (
                          <span className="text-emerald-600">{t("reports.allWithin")}</span>
                        )}
                      </p>
                      <div className={`mt-2.5 flex flex-wrap gap-2 tabular text-xs font-extrabold text-slate-600 ${idx % 2 === 1 ? "" : "md:justify-end"}`}>
                        <span className="rounded-lg bg-slate-100 px-2 py-1">
                          Hb {hb}
                        </span>
                        <span className="rounded-lg bg-slate-100 px-2 py-1">
                          HbA1c {a1c}%
                        </span>
                        <Link
                          href={`/compare?old=${[...REPORTS].reverse()[idx + 1]?.id ?? REPORTS[0].id}&new=${r.id}`}
                          className="inline-flex items-center gap-1 rounded-lg bg-brand-100 px-2 py-1 text-brand-800 transition hover:bg-brand-200"
                        >
                          {t("reports.compare")}
                          <ChevronRight className="h-3 w-3" />
                        </Link>
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </div>

          {/* HbA1c steady climb line */}
          <div className="mt-8 rounded-2xl border border-violet-200 bg-violet-50 p-5">
            <p className="text-sm font-extrabold text-violet-800">HbA1c</p>
            <div className="mt-2 flex flex-wrap items-center gap-2 tabular text-lg font-extrabold text-violet-900">
              {REPORTS.map((r, i) => (
                <span key={r.id} className="flex items-center gap-2">
                  <span
                    className={`rounded-xl px-3 py-1.5 ${
                      i === REPORTS.length - 1 ? "bg-rose-600 text-white" : "bg-white shadow-sm"
                    }`}
                  >
                    {getValue(r.id, "hba1c")}
                  </span>
                  {i < REPORTS.length - 1 && <ArrowRight className="h-4 w-4 text-violet-400" />}
                </span>
              ))}
            </div>
            <p className="mt-3 text-sm font-bold text-violet-800">
              {t("trends.hba1cLine")}
            </p>
          </div>
        </div>
      </section>
    </AppShell>
  );
}

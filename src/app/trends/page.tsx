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
  Sparkles,
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
        <SectionTitle
          icon={CalendarDays}
          title={t("trends.timeline")}
          sub={hi ? "समय के साथ आपकी सभी रिपोर्ट्स का विस्तृत तुलनात्मक सफ़रनामा" : "Your chronological journey across all laboratory reports"}
        />

        <div className="card-shadow rounded-[2rem] border border-slate-100 bg-white p-5 sm:p-7 md:p-8">
          {/* Vertical Stepped Roadmap */}
          <div className="relative border-l-[3px] border-dashed border-brand-200 ml-4 sm:ml-6 pl-6 sm:pl-8 space-y-6 sm:space-y-7">
            {[...REPORTS].reverse().map((r, idx) => {
              const isLatest = idx === 0;
              const warn = r.attention > 0;
              const hb = getValue(r.id, "hemoglobin");
              const a1c = getValue(r.id, "hba1c");
              const ldl = getValue(r.id, "ldl");
              const prevReport = [...REPORTS].reverse()[idx + 1] ?? REPORTS[0];

              return (
                <motion.div
                  key={r.id}
                  initial={{ opacity: 0, x: -12 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: idx * 0.08 }}
                  className="relative"
                >
                  {/* Timeline Node Icon (centered on vertical line) */}
                  <span
                    className={`absolute -left-[39px] sm:-left-[47px] top-1.5 flex h-9 w-9 sm:h-10 sm:w-10 items-center justify-center rounded-2xl border-4 border-white text-xs font-black text-white shadow-md transition-all ${
                      isLatest
                        ? "bg-brand-700 ring-4 ring-brand-100"
                        : warn
                          ? "bg-amber-500 ring-2 ring-amber-100"
                          : "bg-emerald-500 ring-2 ring-emerald-100"
                    }`}
                  >
                    {isLatest ? (
                      <Sparkles className="h-4 w-4" />
                    ) : (
                      <GitCommitVertical className="h-4 w-4" />
                    )}
                  </span>

                  {/* Milestone Card */}
                  <div
                    className={`card-shadow group rounded-3xl border-2 p-5 sm:p-6 transition-all hover:border-brand-300 hover:shadow-md ${
                      isLatest
                        ? "border-brand-200 bg-gradient-to-br from-brand-50/50 via-white to-white"
                        : "border-slate-100 bg-white"
                    }`}
                  >
                    {/* Header row */}
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="text-base sm:text-lg font-extrabold text-brand-950">
                            {pick(r.date, s.lang)}
                          </h3>
                          {isLatest && (
                            <span className="rounded-full bg-brand-700 px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wider text-white shadow-sm">
                              {t("reports.latest")}
                            </span>
                          )}
                          <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-bold text-slate-500">
                            {r.testsCount} {t("reports.tests")}
                          </span>
                        </div>
                        <p className="mt-1 text-xs sm:text-sm font-semibold text-slate-500">
                          {warn ? (
                            <span className="text-amber-700 font-extrabold">
                              ⚠ {r.attention} {t("reports.needAttention")}
                            </span>
                          ) : (
                            <span className="text-emerald-700 font-extrabold">
                              ✓ {t("reports.allWithin")}
                            </span>
                          )}
                        </p>
                      </div>

                      {/* Compare CTA */}
                      <Link
                        href={
                          isLatest
                            ? `/compare?old=${prevReport.id}&new=${r.id}`
                            : `/compare?old=${r.id}&new=${REPORTS[REPORTS.length - 1].id}`
                        }
                        className="inline-flex min-h-10 items-center gap-1.5 rounded-full bg-brand-100/90 px-4 py-2 text-xs font-extrabold text-brand-800 transition hover:bg-brand-200 active:scale-95 shrink-0"
                      >
                        {isLatest
                          ? hi
                            ? "पिछली रिपोर्ट से तुलना"
                            : "Compare with previous"
                          : hi
                            ? "नवीनतम से तुलना"
                            : "Compare with latest"}
                        <ChevronRight className="h-3.5 w-3.5" />
                      </Link>
                    </div>

                    {/* Key Marker Chips Row */}
                    <div className="mt-4 flex flex-wrap items-center gap-2 pt-3 border-t border-slate-100">
                      <span className="text-xs font-bold text-slate-400 mr-1">
                        {hi ? "मुख्य मान:" : "Key markers:"}
                      </span>
                      {hb != null && (
                        <span className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-extrabold shadow-sm ring-1 ring-slate-100 ${
                          hb < 12.0 ? "bg-rose-50 text-rose-800" : "bg-slate-50 text-slate-700"
                        }`}>
                          <TestIcon testId="hemoglobin" size={18} />
                          Hb: <span className="tabular">{hb}</span> g/dL
                        </span>
                      )}
                      {a1c != null && (
                        <span className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-extrabold shadow-sm ring-1 ring-slate-100 ${
                          a1c >= 6.5 ? "bg-rose-50 text-rose-800" : a1c >= 5.7 ? "bg-amber-50 text-amber-800" : "bg-slate-50 text-slate-700"
                        }`}>
                          <TestIcon testId="hba1c" size={18} />
                          HbA1c: <span className="tabular">{a1c}%</span>
                        </span>
                      )}
                      {ldl != null && (
                        <span className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-extrabold shadow-sm ring-1 ring-slate-100 ${
                          ldl > 130 ? "bg-rose-50 text-rose-800" : "bg-slate-50 text-slate-700"
                        }`}>
                          <TestIcon testId="ldl" size={18} />
                          LDL: <span className="tabular">{ldl}</span> mg/dL
                        </span>
                      )}
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </div>

          {/* HbA1c Long-term Trajectory Highlight */}
          <div className="mt-8 rounded-3xl border-2 border-violet-200 bg-gradient-to-br from-violet-50/70 via-white to-white p-5 sm:p-6">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-violet-600 text-white shadow-sm">
                  <TrendingUp className="h-4 w-4" />
                </span>
                <p className="text-sm font-extrabold text-violet-950">
                  {hi ? "दीर्घकालिक रुझान: HbA1c (ब्लड शुगर औसत)" : "Long-term Trajectory: HbA1c (Average Sugar)"}
                </p>
              </div>
              <span className="rounded-full bg-rose-100 px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wide text-rose-700">
                +1.3% in 6 mo
              </span>
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-2 sm:gap-3 tabular text-base sm:text-lg font-extrabold text-violet-900">
              {REPORTS.map((r, i) => (
                <span key={r.id} className="flex items-center gap-2 sm:gap-3">
                  <div className="flex flex-col items-center">
                    <span
                      className={`rounded-2xl px-3.5 py-1.5 shadow-sm transition ${
                        i === REPORTS.length - 1
                          ? "bg-rose-600 text-white shadow-rose-600/30"
                          : "bg-white text-slate-800 ring-1 ring-slate-200/70"
                      }`}
                    >
                      {getValue(r.id, "hba1c")}%
                    </span>
                    <span className="text-[10px] font-bold text-slate-400 mt-1">
                      {pick(r.month, s.lang)}
                    </span>
                  </div>
                  {i < REPORTS.length - 1 && (
                    <ArrowRight className="h-4 w-4 text-violet-400 mb-4" strokeWidth={2.5} />
                  )}
                </span>
              ))}
            </div>

            <p className="mt-3 text-xs sm:text-sm font-semibold leading-relaxed text-slate-600">
              {t("trends.hba1cLine")}
            </p>
          </div>
        </div>
      </section>
    </AppShell>
  );
}

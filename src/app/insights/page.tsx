"use client";

// Screen 7 — AI Insights: Longitudinal Health Story + Multi-Test Clinical Patterns.

import Link from "next/link";
import { motion } from "framer-motion";
import {
  AlertTriangle,
  ArrowRight,
  ArrowUpRight,
  BookOpenCheck,
  BrainCircuit,
  CheckCircle2,
  History,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { AppShell } from "@/components/shell";
import {
  ListenBtn,
  SafetyNote,
  SectionTitle,
  TestIcon,
  statusClasses,
} from "@/components/core";
import { useI18n, pick } from "@/lib/i18n";
import { PATTERNS, SOURCES, STORY, TESTS } from "@/lib/data";

export default function InsightsPage() {
  const { t, s } = useI18n();
  const hi = s.lang === "hi";

  const storySpeech = STORY.map((x) => `${pick(x.when, s.lang)}: ${pick(x.text, s.lang)}`).join(". ");

  return (
    <AppShell>
      {/* -------------------------------- Header -------------------------------- */}
      <SectionTitle
        icon={BrainCircuit}
        title={t("insights.title")}
        sub={t("insights.sub")}
      />

      {/* --------------------------- 1. AI Health Story --------------------------- */}
      <motion.section
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        className="card-shadow overflow-hidden rounded-[2rem] border border-amber-200 bg-gradient-to-br from-amber-50/70 via-white to-white p-5 md:p-7"
      >
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-amber-100/80 pb-4">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-amber-500 text-white shadow-md shadow-amber-500/20">
              <Sparkles className="h-5 w-5" />
            </span>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-extrabold text-brand-950 md:text-xl">
                  {t("insights.story")}
                </h2>
                <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wide text-amber-800">
                  {hi ? "समय के साथ" : "Timeline"}
                </span>
              </div>
              <p className="text-xs font-semibold text-slate-500 md:text-sm">
                {t("insights.storySub")}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <ListenBtn compact text={storySpeech} />
          </div>
        </div>

        {/* 3-Step Milestone Grid */}
        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          {STORY.map((step, i) => {
            const c = statusClasses(step.status);
            return (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 10 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1 }}
                className={`relative flex flex-col justify-between rounded-2xl border p-4 transition ${c.bg} ${c.border}`}
              >
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <span
                      className={`flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-black text-white ${c.dot}`}
                    >
                      {i + 1}
                    </span>
                    <span className={`text-[11px] font-extrabold uppercase tracking-wider ${c.text}`}>
                      {pick(step.when, s.lang)}
                    </span>
                  </div>
                  <p className="mt-2.5 text-sm font-bold leading-snug text-slate-700">
                    {pick(step.text, s.lang)}
                  </p>
                </div>
                <div className="mt-3 flex items-center justify-between border-t border-slate-200/60 pt-2 text-[11px] font-bold text-slate-400">
                  <span>{step.status === "normal" ? (hi ? "सामान्य" : "Normal") : step.status === "borderline" ? (hi ? "सीमा पर" : "Borderline") : (hi ? "सीमा से बाहर" : "Out of range")}</span>
                  <span className="text-brand-600 font-extrabold">#{i + 1}</span>
                </div>
              </motion.div>
            );
          })}
        </div>

        {/* Footer actions */}
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-slate-50/90 px-4 py-2.5 text-xs font-semibold text-slate-600">
          <span className="flex items-center gap-1.5 text-slate-500">
            <History className="h-4 w-4 text-brand-600 shrink-0" />
            {hi
              ? "एक संख्या एक पल है — समय के साथ बना रुझान डॉक्टर के लिए अधिक उपयोगी है।"
              : "A single reading is a moment — the trend over time gives doctors true context."}
          </span>
          <Link
            href="/trends"
            className="inline-flex items-center gap-1 font-extrabold text-brand-700 hover:text-brand-900 transition hover:underline"
          >
            {hi ? "पूरा रुझान देखें" : "See full trend"}
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </motion.section>

      {/* ------------------------ 2. Connected Lab Patterns ------------------------ */}
      <section className="mt-10">
        <SectionTitle
          icon={BrainCircuit}
          title={t("insights.patternsTitle")}
          sub={t("insights.patternsSub")}
        />

        <div className="grid gap-5">
          {PATTERNS.map((p, pi) => {
            const src = SOURCES.find((x) => x.id === p.source);
            const fullSpeech = `${pick(p.title, s.lang)}. ${pick(p.expl, s.lang)}. ${pick(p.risk, s.lang)}`;

            return (
              <motion.article
                key={p.id}
                initial={{ opacity: 0, y: 14 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: pi * 0.08 }}
                className="card-shadow overflow-hidden rounded-[2rem] border border-slate-100 bg-white"
              >
                {/* Pattern Header */}
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 bg-gradient-to-r from-violet-50/60 via-white to-white px-5 py-3.5 sm:px-6">
                  <div className="flex items-center gap-3">
                    <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-violet-600 text-white shadow-sm shadow-violet-600/25">
                      <BrainCircuit className="h-5 w-5" />
                    </span>
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-base font-extrabold text-brand-950 sm:text-lg">
                          {pick(p.title, s.lang)}
                        </h3>
                        <span className="rounded-full bg-violet-100 px-2.5 py-0.5 text-[11px] font-extrabold text-violet-800">
                          {p.nodes.length} {t("insights.linkedTests")}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-extrabold ${
                      p.conf.level === "high" ? "bg-mint-100 text-mint-800" : "bg-amber-100 text-amber-800"
                    }`}>
                      {p.conf.level === "high" ? (
                        <ShieldCheck className="h-3.5 w-3.5 text-mint-600" />
                      ) : (
                        <ShieldAlert className="h-3.5 w-3.5 text-amber-600" />
                      )}
                      {p.conf.pct}% {t("common.confidence")}
                    </span>
                    <ListenBtn compact text={fullSpeech} />
                  </div>
                </div>

                <div className="p-5 sm:p-6 md:p-7">
                  {/* Connected Nodes Equation */}
                  <div className="rounded-2xl bg-slate-50 p-4">
                    <p className="text-[11px] font-extrabold uppercase tracking-widest text-slate-400">
                      {hi ? "संबंधित परीक्षण समीकरण" : "Connected Test Equation"}
                    </p>
                    <div className="mt-2.5 flex flex-wrap items-center gap-2">
                      {p.nodes.map((n, i) => (
                        <span key={n.test} className="flex items-center gap-2">
                          <Link
                            href={`/test/${n.test}`}
                            className="group inline-flex items-center gap-2 rounded-xl bg-white px-3 py-2 text-xs sm:text-sm font-extrabold text-slate-800 shadow-sm ring-1 ring-slate-200/70 transition hover:bg-brand-50 hover:ring-brand-300"
                          >
                            <TestIcon testId={n.test} size={26} />
                            <span className="truncate max-w-[130px] sm:max-w-none">{pick(TESTS[n.test]?.name || { en: n.test, hi: n.test }, s.lang)}</span>
                            <span className={`rounded-md px-1.5 py-0.5 text-xs font-black ${
                              n.arrow === "up" ? "bg-rose-100 text-rose-700" : n.arrow === "down" ? "bg-rose-100 text-rose-700" : "bg-slate-100 text-slate-600"
                            }`}>
                              {n.note ? pick(n.note, s.lang).split("·")[0].trim() : ""}{" "}
                              {n.arrow === "up" ? "↑" : n.arrow === "down" ? "↓" : "→"}
                            </span>
                          </Link>
                          {i < p.nodes.length - 1 && (
                            <span className="text-base font-black text-violet-400">+</span>
                          )}
                        </span>
                      ))}

                      <span className="text-base font-black text-violet-400">➔</span>

                      <span className="inline-flex items-center gap-1.5 rounded-xl bg-violet-600 px-3 py-2 text-xs sm:text-sm font-extrabold text-white shadow-sm">
                        <CheckCircle2 className="h-4 w-4" />
                        {pick(p.title, s.lang)}
                      </span>
                    </div>
                  </div>

                  {/* Clinical Synthesis & Risk Note */}
                  <div className="mt-4 space-y-3">
                    <p className="text-sm sm:text-[15px] font-semibold leading-relaxed text-slate-600">
                      {pick(p.expl, s.lang)}
                    </p>

                    <div className="flex items-start gap-2.5 rounded-2xl border border-amber-200 bg-amber-50/70 p-3.5 text-xs sm:text-sm font-bold text-amber-900">
                      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                      <span>{pick(p.risk, s.lang)}</span>
                    </div>
                  </div>

                  {/* Evidence / Source Citation Row */}
                  {src && (
                    <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-3 text-xs">
                      <div className="flex items-center gap-2 text-slate-500">
                        <BookOpenCheck className="h-4 w-4 text-brand-600 shrink-0" />
                        <span className="font-semibold">{t("insights.whyWeSay")}:</span>
                        <span className="font-bold text-slate-700">{src.publisher}</span>
                      </div>
                      <a
                        href={src.url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 font-extrabold text-brand-700 hover:text-brand-900 transition hover:underline"
                      >
                        {t("common.viewSource")}
                        <ArrowUpRight className="h-3.5 w-3.5" />
                      </a>
                    </div>
                  )}
                </div>
              </motion.article>
            );
          })}
        </div>
      </section>

      {/* ------------------------------- Safety note ------------------------------ */}
      <div className="mt-10">
        <SafetyNote />
      </div>
    </AppShell>
  );
}

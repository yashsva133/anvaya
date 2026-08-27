"use client";

// Screen 7 — AI Insights: the longitudinal health story and the multi-test
// connections found in the person's OWN report.
//
// Both come from POST /api/insights (see src/lib/ai/patterns.ts for the
// deterministic detection and src/lib/ai/insights.ts for the MedGemma prose).
// The page used to render three hard-coded patterns about the demo patient;
// it now renders what the rule engine actually found, explained by the model,
// with the seeded clinical copy as the fallback when the model is offline.

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
  RefreshCw,
  SearchX,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  TrendingUp,
} from "lucide-react";
import { AppShell } from "@/components/shell";
import { AiLines, AiStages } from "@/components/ai-loading";
import {
  ListenBtn,
  SafetyNote,
  SectionTitle,
  TestIcon,
  statusClasses,
} from "@/components/core";
import { useI18n } from "@/lib/i18n";
import { useAiInsights, type InsightPatternView } from "@/lib/ai/useAiInsights";

const CONNECTION_STAGES = ["ai.load.reading", "ai.load.connections", "ai.load.explaining"] as const;
const STORY_STAGES = ["ai.load.reading", "ai.load.comparing"] as const;

export default function InsightsPage() {
  const { t, s } = useI18n();
  const hi = s.lang === "hi";
  const { data, loading, failed, refresh } = useAiInsights();

  const story = data?.story ?? [];
  const patterns = data?.patterns ?? [];
  const storySpeech = story.map((x) => `${x.when}: ${x.text}`).join(". ");

  return (
    <AppShell>
      {/* -------------------------------- Header -------------------------------- */}
      <SectionTitle icon={BrainCircuit} title={t("insights.title")} sub={t("insights.sub")} />

      {/* --------------------------- 1. AI Health Story --------------------------- */}
      <motion.section
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        aria-busy={loading}
        className="card-shadow overflow-hidden rounded-[2rem] border border-amber-200 bg-gradient-to-br from-amber-50/70 via-white to-white p-5 md:p-7"
      >
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-amber-100/80 pb-4">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-amber-500 text-white shadow-md shadow-amber-500/20">
              <Sparkles className="h-5 w-5" />
            </span>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-lg font-extrabold text-brand-950 md:text-xl">
                  {t("insights.story")}
                </h2>
                {data && data.reports_compared > 1 && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wide text-amber-800">
                    <TrendingUp className="h-3 w-3" />
                    {data.reports_compared} {t("insights.reportsCompared")}
                  </span>
                )}
              </div>
              <p className="text-xs font-semibold text-slate-500 md:text-sm">
                {t("insights.storySub")}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {!loading && story.length > 0 && <ListenBtn compact text={storySpeech} />}
          </div>
        </div>

        {loading ? (
          <div className="mt-5">
            <AiStages keys={STORY_STAGES} />
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              {[0, 1, 2].map((i) => (
                <div key={i} className="rounded-2xl border border-slate-200 bg-white p-4">
                  <div className="h-6 w-6 animate-pulse rounded-full bg-amber-100" />
                  <AiLines className="mt-3" widths={["w-full", "w-10/12"]} />
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            {story.map((step, i) => {
              const c = statusClasses(step.status);
              return (
                <motion.div
                  key={`${step.when}-${i}`}
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
                        {step.when}
                      </span>
                    </div>
                    <p className="mt-2.5 text-sm font-bold leading-snug text-slate-700">{step.text}</p>
                  </div>
                  <div className="mt-3 flex items-center justify-between border-t border-slate-200/60 pt-2 text-[11px] font-bold text-slate-400">
                    <span>
                      {step.status === "normal"
                        ? hi
                          ? "सामान्य"
                          : "Normal"
                        : step.status === "borderline"
                          ? hi
                            ? "सीमा पर"
                            : "Borderline"
                          : hi
                            ? "सीमा से बाहर"
                            : "Out of range"}
                    </span>
                    <span className="font-extrabold text-brand-600">#{i + 1}</span>
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-slate-50/90 px-4 py-2.5 text-xs font-semibold text-slate-600">
          <span className="flex items-center gap-1.5 text-slate-500">
            <History className="h-4 w-4 shrink-0 text-brand-600" />
            {hi
              ? "एक संख्या एक पल है — समय के साथ बना रुझान डॉक्टर के लिए अधिक उपयोगी है।"
              : "A single reading is a moment — the trend over time gives doctors true context."}
          </span>
          <Link
            href="/trends"
            className="inline-flex items-center gap-1 font-extrabold text-brand-700 transition hover:text-brand-900 hover:underline"
          >
            {hi ? "पूरा रुझान देखें" : "See full trend"}
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </motion.section>

      {/* ------------------------ 2. Connected Lab Patterns ------------------------ */}
      <section className="mt-10" aria-busy={loading}>
        <SectionTitle
          icon={BrainCircuit}
          title={t("insights.patternsTitle")}
          sub={t("insights.patternsSub")}
          action={
            !loading && (
              <button
                onClick={refresh}
                className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 text-[11px] font-extrabold text-slate-600 transition hover:border-violet-300 hover:text-violet-700"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                {t("insights.retry")}
              </button>
            )
          }
        />

        {loading ? (
          <div className="grid gap-5">
            <AiStages keys={CONNECTION_STAGES} tone="violet" />
            {[0, 1].map((i) => (
              <div
                key={i}
                className="card-shadow overflow-hidden rounded-[2rem] border border-slate-100 bg-white"
              >
                <div className="flex items-center gap-3 border-b border-slate-100 bg-gradient-to-r from-violet-50/60 via-white to-white px-5 py-3.5">
                  <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-violet-200">
                    <BrainCircuit className="h-5 w-5 animate-pulse text-violet-500" />
                  </span>
                  <div className="h-4 w-52 animate-pulse rounded-full bg-violet-100" />
                </div>
                <div className="p-5 sm:p-6">
                  <div className="rounded-2xl bg-slate-50 p-4">
                    <div className="flex flex-wrap gap-2">
                      {[0, 1, 2].map((j) => (
                        <div key={j} className="h-9 w-36 animate-pulse rounded-xl bg-white" />
                      ))}
                    </div>
                  </div>
                  <AiLines className="mt-4" tone="slate" widths={["w-full", "w-11/12", "w-8/12"]} />
                </div>
              </div>
            ))}
          </div>
        ) : patterns.length === 0 ? (
          <div className="card-shadow flex flex-col items-start gap-3 rounded-[2rem] border border-slate-100 bg-white p-6 sm:flex-row sm:items-center">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-mint-100 text-mint-700">
              <SearchX className="h-6 w-6" />
            </span>
            <div className="flex-1">
              <p className="text-base font-extrabold text-brand-950">
                {failed ? t("insights.failed") : t("insights.noneFound")}
              </p>
              <p className="mt-1 text-sm font-semibold text-slate-500">
                {failed ? "" : t("insights.noneFoundSub")}
              </p>
            </div>
            <button
              onClick={refresh}
              className="inline-flex min-h-10 items-center gap-1.5 rounded-2xl border border-slate-200 bg-white px-4 text-xs font-extrabold text-slate-600 transition hover:border-violet-300 hover:text-violet-700"
            >
              <RefreshCw className="h-4 w-4" />
              {t("insights.retry")}
            </button>
          </div>
        ) : (
          <div className="grid gap-5">
            {patterns.map((p, pi) => (
              <PatternCard key={p.id} p={p} index={pi} />
            ))}
          </div>
        )}
      </section>

      {/* ------------------------------- Safety note ------------------------------ */}
      <div className="mt-10">
        <SafetyNote />
      </div>
    </AppShell>
  );
}

function PatternCard({ p, index }: { p: InsightPatternView; index: number }) {
  const { t, s } = useI18n();
  const hi = s.lang === "hi";
  const speech = [p.title, p.explanation, p.risk].filter(Boolean).join(". ").replace(/\*\*/g, "");

  return (
    <motion.article
      initial={{ opacity: 0, y: 14 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ delay: index * 0.08 }}
      className="card-shadow overflow-hidden rounded-[2rem] border border-slate-100 bg-white"
    >
      {/* Pattern header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 bg-gradient-to-r from-violet-50/60 via-white to-white px-5 py-3.5 sm:px-6">
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-violet-600 text-white shadow-sm shadow-violet-600/25">
            <BrainCircuit className="h-5 w-5" />
          </span>
          <div>
            <p className="text-[10px] font-extrabold uppercase tracking-widest text-violet-500">
              {t("insights.found")}
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-base font-extrabold text-brand-950 sm:text-lg">{p.title}</h3>
              <span className="rounded-full bg-violet-100 px-2.5 py-0.5 text-[11px] font-extrabold text-violet-800">
                {p.nodes.length} {t("insights.linkedTests")}
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span
            className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-extrabold ${
              p.confidence_level === "high" ? "bg-mint-100 text-mint-800" : "bg-amber-100 text-amber-800"
            }`}
          >
            {p.confidence_level === "high" ? (
              <ShieldCheck className="h-3.5 w-3.5 text-mint-600" />
            ) : (
              <ShieldAlert className="h-3.5 w-3.5 text-amber-600" />
            )}
            {p.confidence_pct}% {t("common.confidence")}
          </span>
          <ListenBtn compact text={speech} />
        </div>
      </div>

      <div className="p-5 sm:p-6 md:p-7">
        {/* Connected nodes — the person's own values */}
        <div className="rounded-2xl bg-slate-50 p-4">
          <p className="text-[11px] font-extrabold uppercase tracking-widest text-slate-400">
            {hi ? "संबंधित परीक्षण समीकरण" : "Connected Test Equation"}
          </p>
          <div className="mt-2.5 flex flex-wrap items-center gap-2">
            {p.nodes.map((n, i) => (
              <span key={n.test} className="flex items-center gap-2">
                <Link
                  href={`/test/${n.test}`}
                  className="group inline-flex items-center gap-2 rounded-xl bg-white px-3 py-2 text-xs font-extrabold text-slate-800 shadow-sm ring-1 ring-slate-200/70 transition hover:bg-brand-50 hover:ring-brand-300 sm:text-sm"
                >
                  <TestIcon testId={n.test} size={26} />
                  <span className="max-w-[130px] truncate sm:max-w-none">{n.label}</span>
                  <span
                    className={`rounded-md px-1.5 py-0.5 text-xs font-black ${
                      n.status === "normal"
                        ? "bg-mint-100 text-mint-700"
                        : n.status === "borderline"
                          ? "bg-amber-100 text-amber-700"
                          : "bg-rose-100 text-rose-700"
                    }`}
                  >
                    {n.value} {n.arrow === "up" ? "↑" : n.arrow === "down" ? "↓" : "→"}
                  </span>
                </Link>
                {i < p.nodes.length - 1 && <span className="text-base font-black text-violet-400">+</span>}
              </span>
            ))}

            <span className="text-base font-black text-violet-400">➔</span>

            <span className="inline-flex items-center gap-1.5 rounded-xl bg-violet-600 px-3 py-2 text-xs font-extrabold text-white shadow-sm sm:text-sm">
              <CheckCircle2 className="h-4 w-4" />
              {p.title}
            </span>
          </div>

          {/* Why the rule fired — the audit trail behind the confidence badge. */}
          <p className="mt-3 border-t border-slate-200/70 pt-2.5 text-[11px] font-bold text-slate-500">
            <span className="uppercase tracking-widest text-slate-400">{t("insights.basis")}: </span>
            {p.basis}
          </p>
        </div>

        {/* Explanation + why it matters */}
        <div className="mt-4 space-y-3">
          <p className="text-sm font-semibold leading-relaxed text-slate-600 sm:text-[15px]">
            {bold(p.explanation)}
          </p>

          {p.risk && (
            <div className="flex items-start gap-2.5 rounded-2xl border border-amber-200 bg-amber-50/70 p-3.5 text-xs font-bold text-amber-900 sm:text-sm">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
              <span>{bold(p.risk)}</span>
            </div>
          )}

          <p className="text-xs font-semibold text-slate-400">{p.disclaimer}</p>
        </div>

        {/* Evidence + provenance */}
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-3 text-xs">
          <div className="flex flex-wrap items-center gap-2 text-slate-500">
            <BookOpenCheck className="h-4 w-4 shrink-0 text-brand-600" />
            <span className="font-semibold">{t("insights.whyWeSay")}:</span>
            {p.source && <span className="font-bold text-slate-700">{p.source.publisher}</span>}
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-extrabold text-slate-500">
              {p.engine === "medgemma" ? t("insights.writtenBy") : t("insights.writtenOffline")}
            </span>
          </div>
          {p.source && (
            <a
              href={p.source.url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 font-extrabold text-brand-700 transition hover:text-brand-900 hover:underline"
            >
              {t("common.viewSource")}
              <ArrowUpRight className="h-3.5 w-3.5" />
            </a>
          )}
        </div>
      </div>
    </motion.article>
  );
}

/** Render the **bold** spans the model is allowed to emit. */
function bold(text: string) {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith("**") && part.endsWith("**") ? (
      <strong key={i} className="font-extrabold text-slate-900">
        {part.slice(2, -2)}
      </strong>
    ) : (
      <span key={i}>{part}</span>
    )
  );
}

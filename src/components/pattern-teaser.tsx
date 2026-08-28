"use client";

// ---------------------------------------------------------------------------
// The "AI found a connection" teaser on the Overview screen.
//
// It shows the strongest connection the rule engine found in THIS report —
// the same finding, from the same POST /api/insights call, that the AI Insights
// page lists in full. It used to be hard-coded to the demo patient's lipid
// pattern, which meant the teaser could advertise a connection the page below
// it did not contain.
//
// When nothing connects, the card says so plainly instead of inventing a
// pattern: "no connected pattern stands out" is a real, useful answer.
// ---------------------------------------------------------------------------

import Link from "next/link";
import { motion } from "framer-motion";
import { BrainCircuit, ChevronRight, SearchX, ShieldCheck } from "lucide-react";
import { AiLines, AiStages } from "@/components/ai-loading";
import { TestIcon } from "@/components/core";
import { useI18n } from "@/lib/i18n";
import { useReportData } from "@/context/ReportDataContext";
import { useAiInsights } from "@/lib/ai/useAiInsights";

const STAGES = ["ai.load.connections", "ai.load.explaining"] as const;

export function PatternTeaser() {
  const { t } = useI18n();
  const { activeReport, loading: reportLoading } = useReportData();
  // One connection is all the teaser shows, so only one is generated here; the
  // Insights page asks for the full set.
  const { data, loading } = useAiInsights({ max: 1 });
  const top = data?.patterns[0];

  if (!reportLoading && activeReport.entries.length === 0) {
    return (
      <section className="mt-10">
        <div className="card-shadow flex flex-col gap-3 rounded-[2rem] border-2 border-dashed border-brand-200 bg-white p-6 md:flex-row md:items-center">
          <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-mint-100 text-mint-700">
            <SearchX className="h-7 w-7" />
          </span>
          <div className="flex-1">
            <p className="text-base font-extrabold text-brand-950">{t("insights.noReport")}</p>
            <p className="mt-1 text-sm font-semibold text-slate-500">{t("insights.noReportSub")}</p>
          </div>
          <Link
            href="/upload"
            className="inline-flex min-h-10 items-center justify-center rounded-2xl bg-brand-700 px-4 text-xs font-extrabold text-white transition hover:bg-brand-600"
          >
            {t("upload.title")}
          </Link>
        </div>
      </section>
    );
  }

  if (loading) {
    return (
      <section className="mt-10" aria-busy>
        <div className="card-shadow flex flex-col gap-4 rounded-[2rem] border-2 border-violet-200 bg-gradient-to-br from-violet-50 via-white to-white p-6 md:flex-row md:items-center">
          <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-violet-200 text-violet-600">
            <BrainCircuit className="h-7 w-7 animate-pulse" />
          </span>
          <div className="flex-1">
            <AiStages keys={STAGES} tone="violet" />
            <div className="mt-3 flex flex-wrap gap-2">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-9 w-36 animate-pulse rounded-xl bg-white" />
              ))}
            </div>
            <AiLines className="mt-3" tone="violet" widths={["w-11/12", "w-7/12"]} />
          </div>
        </div>
      </section>
    );
  }

  if (!top) {
    return (
      <section className="mt-10">
        <div className="card-shadow flex flex-col gap-4 rounded-[2rem] border border-slate-200 bg-white p-6 md:flex-row md:items-center">
          <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-mint-100 text-mint-700">
            <SearchX className="h-7 w-7" />
          </span>
          <div className="flex-1">
            <p className="text-base font-extrabold text-brand-950">{t("insights.noneFound")}</p>
            <p className="mt-1 text-sm font-semibold text-slate-500">{t("insights.noneFoundSub")}</p>
          </div>
        </div>
      </section>
    );
  }

  return (
    <motion.section initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mt-10">
      <Link
        href="/insights"
        className="card-shadow group flex flex-col gap-4 rounded-[2rem] border-2 border-violet-200 bg-gradient-to-br from-violet-50 via-white to-white p-6 transition hover:border-violet-400 md:flex-row md:items-center"
      >
        <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-violet-600 text-white shadow-lg shadow-violet-600/25">
          <BrainCircuit className="h-7 w-7" />
        </span>
        <div className="flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-xs font-extrabold uppercase tracking-widest text-violet-600">
              {t("insights.found")}
            </p>
            <span className="inline-flex items-center gap-1 rounded-full bg-white px-2 py-0.5 text-[10px] font-extrabold text-violet-700 ring-1 ring-violet-100">
              <ShieldCheck className="h-3 w-3" />
              {top.confidence_pct}% {t("common.confidence")}
            </span>
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-2">
            {top.nodes.map((n, i) => (
              <span key={n.test} className="flex items-center gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-xl bg-white px-3 py-1.5 text-sm font-extrabold text-slate-700 shadow-sm ring-1 ring-slate-100">
                  <TestIcon testId={n.test} size={22} />
                  {n.label}
                  <span
                    className={
                      n.status === "normal"
                        ? "text-mint-600"
                        : n.status === "borderline"
                          ? "text-amber-600"
                          : "text-rose-600"
                    }
                  >
                    {n.arrow === "up" ? "↑" : n.arrow === "down" ? "↓" : "→"}
                  </span>
                </span>
                {i < top.nodes.length - 1 && (
                  <span className="text-lg font-black text-violet-400">+</span>
                )}
              </span>
            ))}
          </div>

          <p className="mt-2 line-clamp-2 text-sm font-semibold text-slate-500">
            {top.explanation.replace(/\*\*/g, "")}
          </p>
        </div>
        <ChevronRight className="h-6 w-6 self-start text-violet-400 transition group-hover:translate-x-1 md:self-center" />
      </Link>
    </motion.section>
  );
}

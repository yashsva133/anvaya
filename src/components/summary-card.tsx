"use client";

// ---------------------------------------------------------------------------
// The Overview summary card — the first box on /dashboard.
//
// It asks POST /api/summary for a MedGemma briefing that covers BOTH the
// current report and the trend across every earlier report on file, and renders
// it in place of the two hard-coded sentences that used to live here.
//
// Three rules shaped this component:
//
//  1. It must never be empty. The counts grid and a deterministic headline are
//     rendered immediately from local data; the generated prose replaces the
//     placeholder when it arrives. A slow or missing model degrades the card,
//     it does not break the screen.
//  2. It must never lie about its author. The footer says whether MedGemma
//     wrote the text or whether it was composed from the report data because
//     the model was unreachable — the server tells us which in `engine`.
//  3. It re-generates when the inputs change: a different report, a different
//     language, or a different reading level all produce a different summary.
// ---------------------------------------------------------------------------

import { useCallback, useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  ArrowDownRight,
  ArrowUpRight,
  Minus,
  RefreshCw,
  Sparkles,
  TrendingUp,
} from "lucide-react";
import { AiLines, AiStages } from "@/components/ai-loading";
import { ListenBtn, Md } from "@/components/core";
import { useI18n } from "@/lib/i18n";
import { useReportData } from "@/context/ReportDataContext";
import { buildReportContext } from "@/lib/ai/reportContext";
import { reportStatusKnown } from "@/lib/data";

interface TrendChip {
  test: string;
  label: string;
  direction: "up" | "down" | "flat";
  change: number;
  unit: string;
  tone: "worse" | "better" | "steady";
}

interface SummaryResponse {
  headline: string;
  body: string;
  text: string;
  speech: string;
  engine: "medgemma" | "mock" | "rules";
  model: string | null;
  confidence: "high" | "moderate";
  fallback_reason: string | null;
  counts: { total: number; normal: number; borderline: number; out: number; unknown?: number };
  trends: TrendChip[];
  reports_compared: number;
  language: string;
}

const TONE: Record<TrendChip["tone"], string> = {
  worse: "border-rose-200 bg-rose-50 text-rose-700",
  better: "border-emerald-200 bg-emerald-50 text-emerald-700",
  steady: "border-slate-200 bg-slate-50 text-slate-600",
};

export function OverviewSummaryCard({ reportId }: { reportId?: string }) {
  const { t, s } = useI18n();
  const hi = s.lang === "hi";
  const { activeReport: contextActiveReport, patient, reports: contextReports } = useReportData();
  
  // If reportId is provided, we summarize ONLY that report and provide NO history.
  const activeReport = reportId ? (contextReports.find(r => r.id === reportId) || contextActiveReport) : contextActiveReport;
  const reports = reportId ? [] : contextReports;

  const [data, setData] = useState<SummaryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  // Bumped by the "write it again" button; part of the effect's dependencies.
  const [nonce, setNonce] = useState(0);
  const abortRef = useRef<AbortController | null>(null);

  const entries = activeReport.entries ?? [];
  // Local counts, so the grid is correct before (and regardless of) the fetch.
  const local = {
    total: entries.length,
    normal: entries.filter((e) => reportStatusKnown(e) && e.status === "normal").length,
    borderline: entries.filter((e) => reportStatusKnown(e) && e.status === "borderline").length,
    out: entries.filter(
      (e) => reportStatusKnown(e) && (e.status === "high" || e.status === "low" || e.status === "critical")
    ).length,
    unknown: entries.filter((e) => !reportStatusKnown(e)).length,
  };

  // Only the parts of the report that actually change the summary are in the
  // dependency list — an object identity change from a context re-render must
  // not re-run a model call.
  const signature = entries.map((e) => `${e.test}:${e.value}`).join(",");
  const historySignature = reports.map((r) => r.id).join(",");

  const load = useCallback(async () => {
    // If nonce is 0 (i.e. on normal load, not refresh button), check cache first
    const cacheKey = `rxanvaya-summary-v2-${signature}-${historySignature}-${s.lang}-${s.mode}`;
    if (nonce === 0) {
      try {
        const cached = localStorage.getItem(cacheKey);
        if (cached) {
          setData(JSON.parse(cached));
          setLoading(false);
          return;
        }
      } catch (err) {
        // ignore cache errors
      }
    }

    abortRef.current?.abort();
    setFailed(false);
    if (entries.length === 0) {
      setData(null);
      setLoading(false);
      return;
    }

    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setLoading(true);
    try {
      const res = await fetch("/api/summary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: ctrl.signal,
        body: JSON.stringify({
          lang: s.lang,
          reading: s.mode,
          report: buildReportContext({ activeReport, reports, patient, lang: s.lang }),
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as SummaryResponse;
      if (ctrl.signal.aborted) return;
      try {
        localStorage.setItem(cacheKey, JSON.stringify(json));
      } catch (e) {
        // ignore storage errors
      }
      setData(json);
    } catch (err) {
      if ((err as Error)?.name === "AbortError") return;
      setFailed(true);
    } finally {
      if (!ctrl.signal.aborted) setLoading(false);
    }
    // activeReport/reports/patient are read through refs of the current render;
    // the signature strings below are what decide when this re-runs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.lang, s.mode, signature, historySignature, activeReport.id]);

  useEffect(() => {
    load();
    return () => abortRef.current?.abort();
  }, [load, nonce]);

  const headline =
    data?.headline ||
    (entries.length === 0
      ? hi
        ? "अभी कोई रिपोर्ट नहीं है"
        : "No report data yet"
      : local.unknown > 0
        ? hi
          ? "कुछ परिणामों की संदर्भ सीमा उपलब्ध नहीं है"
          : "Some results have no reported reference range"
        : local.out > 0 || local.borderline > 0
          ? t("dash.someAttention")
          : t("dash.allFine"));

  const counts = local;
  const unknownCount = counts.unknown;

  const speech =
    data?.speech ||
    (entries.length === 0
      ? hi
        ? "अभी कोई रिपोर्ट नहीं है। रिपोर्ट अपलोड या स्कैन करें।"
        : "There is no report data yet. Upload or scan a report."
      : hi
        ? `आपकी रिपोर्ट में ${counts.normal} परिणाम सामान्य हैं, ${counts.borderline} पर ध्यान देना है, ${counts.out} सामान्य सीमा से बाहर हैं${unknownCount ? `, और ${unknownCount} की सीमा उपलब्ध नहीं है` : ""}।`
        : `In your report, ${counts.normal} results are normal, ${counts.borderline} need attention, and ${counts.out} are outside the usual range${unknownCount ? `; ${unknownCount} have no reported range` : ""}.`);

  return (
    <motion.section
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      className="card-lift mt-6 overflow-hidden rounded-[2rem] border border-amber-200 bg-gradient-to-br from-amber-50 via-white to-white"
    >
      <div className="p-6 md:p-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-2xl">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-2 rounded-full bg-amber-100 px-3 py-1.5 text-xs font-extrabold text-amber-800">
                <Sparkles className="h-4 w-4" />
                {t("dash.aiSummary")}
              </span>
              {data && data.reports_compared > 1 && (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-white px-3 py-1.5 text-xs font-extrabold text-amber-700">
                  <TrendingUp className="h-3.5 w-3.5" />
                  {data.reports_compared} {t("dash.summaryReports")}
                </span>
              )}
            </div>

            <h2 className="mt-3 text-balance text-2xl font-extrabold leading-tight text-brand-950 md:text-3xl">
              {headline}
            </h2>

            {loading ? (
              <>
                {/* The stages are the real pipeline steps, so a slow local
                    model reads as work in progress rather than a hang. */}
                <AiStages className="mt-3" />
                <AiLines className="mt-4" widths={["w-11/12", "w-10/12", "w-8/12", "w-9/12"]} />
              </>
            ) : data?.body ? (
              <Md
                text={data.body}
                className="mt-3 text-sm font-semibold leading-relaxed text-slate-600 md:text-[15px]"
              />
            ) : (
              <p className="mt-2 text-sm font-semibold leading-relaxed text-slate-500 md:text-[15px]">
                {failed
                  ? t("dash.summaryFailed")
                  : hi
                    ? `आपकी रिपोर्ट में ${counts.normal} सामान्य और ${counts.out + counts.borderline} ध्यान देने योग्य परिणाम हैं${unknownCount ? `; ${unknownCount} की सीमा उपलब्ध नहीं है` : ""}।`
                    : `Your report contains ${counts.normal} normal results and ${counts.out + counts.borderline} results requiring review${unknownCount ? `; ${unknownCount} have no reported range` : ""}.`}
              </p>
            )}
          </div>

          <ListenBtn text={speech} />
        </div>

        {/* ---- trend chips: the direction of travel, computed server-side ---- */}
        {data && data.trends.length > 0 && (
          <div className="mt-5">
            <p className="text-[11px] font-extrabold uppercase tracking-widest text-slate-400">
              {t("dash.summaryTrend")}
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {data.trends.map((tr) => {
                const Icon =
                  tr.direction === "up" ? ArrowUpRight : tr.direction === "down" ? ArrowDownRight : Minus;
                return (
                  <span
                    key={tr.test}
                    className={`inline-flex items-center gap-1.5 rounded-2xl border px-3 py-1.5 text-xs font-extrabold ${TONE[tr.tone]}`}
                  >
                    <Icon className="h-3.5 w-3.5" strokeWidth={3} />
                    {tr.label}
                    <span className="tabular font-black">
                      {tr.change > 0 ? "+" : ""}
                      {tr.change} {tr.unit}
                    </span>
                  </span>
                );
              })}
            </div>
          </div>
        )}

        {/* ---- counts ---- */}
        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            {
              n: counts.normal,
              label: t("dash.normal"),
              c: "bg-emerald-50 border-emerald-200 text-emerald-700",
              bar: "bg-emerald-500",
            },
            {
              n: counts.borderline,
              label: t("dash.borderline"),
              c: "bg-amber-50 border-amber-300 text-amber-700",
              bar: "bg-amber-500",
            },
            {
              n: counts.out,
              label: t("dash.out"),
              c: "bg-rose-50 border-rose-200 text-rose-700",
              bar: "bg-rose-500",
            },
            {
              n: unknownCount,
              label: hi ? "सीमा उपलब्ध नहीं" : "Range not reported",
              c: "bg-slate-50 border-slate-200 text-slate-600",
              bar: "bg-slate-400",
            },
          ].map((x) => (
            <div key={x.label} className={`rounded-3xl border p-4 text-center md:p-5 ${x.c}`}>
              <p className="tabular text-4xl font-extrabold md:text-5xl">{x.n}</p>
              <div className={`mx-auto mt-2 h-1.5 w-10 rounded-full ${x.bar}`} />
              <p className="mt-2 text-xs font-extrabold leading-tight md:text-sm">{x.label}</p>
            </div>
          ))}
        </div>

        {/* ---- provenance: who actually wrote the text above ---- */}
        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-amber-100 pt-3">
          <p className="text-[11px] font-bold text-slate-400">
            {data?.engine === "medgemma"
              ? t("dash.summaryBy")
              : data?.engine === "mock"
                ? "Mock provider"
                : t("dash.summaryOffline")}
            {data?.model ? ` · ${data.model}` : ""}
          </p>
          <button
            onClick={() => setNonce((n) => n + 1)}
            disabled={loading}
            className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-amber-200 bg-white px-3 text-[11px] font-extrabold text-amber-700 transition hover:border-amber-400 disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            {t("dash.summaryRefresh")}
          </button>
        </div>
      </div>
    </motion.section>
  );
}

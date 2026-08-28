"use client";

// ---------------------------------------------------------------------------
// useAiInsights — one place that talks to POST /api/insights.
//
// Both the AI Insights screen and the "AI found a connection" teaser on the
// Overview show the same findings, so they share this hook: two surfaces, one
// request shape, and no chance of the teaser advertising a pattern the page
// below it does not list.
// ---------------------------------------------------------------------------

import { useCallback, useEffect, useRef, useState } from "react";
import { useI18n } from "@/lib/i18n";
import { useReportData } from "@/context/ReportDataContext";
import { buildReportContext } from "@/lib/ai/reportContext";
import type { Status } from "@/lib/data";

export interface InsightNode {
  test: string;
  label: string;
  value: number;
  unit: string;
  status: Status;
  arrow: "up" | "down" | "flat";
  trend?: "up" | "down" | "flat";
  note: string;
}

export interface InsightSource {
  id: string;
  title: string;
  publisher: string;
  url: string;
  excerpt: string;
}

export interface InsightPatternView {
  id: string;
  title: string;
  nodes: InsightNode[];
  confidence_pct: number;
  confidence_level: "high" | "moderate";
  basis: string;
  explanation: string;
  risk: string;
  disclaimer: string;
  source: InsightSource | null;
  missing: string[];
  engine: "medgemma" | "mock" | "rules";
  model: string | null;
  fallback_reason: string | null;
}

export interface InsightsView {
  patterns: InsightPatternView[];
  story: { when: string; text: string; status: Status; statusKnown?: boolean }[];
  engine: "medgemma" | "mock" | "rules";
  model: string | null;
  counts: { total: number; flagged: number; patterns: number };
  reports_compared: number;
  latency_ms: number;
}

export function useAiInsights(options?: { max?: number }) {
  const { s } = useI18n();
  const { activeReport, patient, reports } = useReportData();
  const [data, setData] = useState<InsightsView | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [nonce, setNonce] = useState(0);
  const abortRef = useRef<AbortController | null>(null);

  const entries = activeReport.entries ?? [];
  // Re-run only when something that changes the findings changes — not on every
  // context re-render, because each run costs one model call per connection.
  const signature = entries.map((e) => `${e.test}:${e.value}`).join(",");
  const historySignature = reports.map((r) => r.id).join(",");
  const max = options?.max;

  const load = useCallback(async () => {
    abortRef.current?.abort();
    setFailed(false);
    if (entries.length === 0) {
      setData({
        patterns: [],
        story: [],
        engine: "rules",
        model: null,
        counts: { total: 0, flagged: 0, patterns: 0 },
        reports_compared: 0,
        latency_ms: 0,
      });
      setLoading(false);
      return;
    }

    const cacheKey = `anvaya_insights_${activeReport.id}_${signature}_${historySignature}_${s.lang}_${s.mode}`;
    if (typeof window !== "undefined") {
      try {
        const cached = sessionStorage.getItem(cacheKey);
        if (cached) {
          setData(JSON.parse(cached));
          setLoading(false);
          return;
        }
      } catch (e) {
        // ignore parse error
      }
    }

    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setLoading(true);
    try {
      const res = await fetch("/api/insights", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: ctrl.signal,
        body: JSON.stringify({
          lang: s.lang,
          reading: s.mode,
          ...(max ? { max } : {}),
          report: buildReportContext({ activeReport, reports, patient, lang: s.lang }),
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as InsightsView;
      if (ctrl.signal.aborted) return;
      
      if (typeof window !== "undefined") {
        try {
          sessionStorage.setItem(cacheKey, JSON.stringify(json));
        } catch (e) {}
      }
      
      setData(json);
    } catch (err) {
      if ((err as Error)?.name === "AbortError") return;
      setFailed(true);
    } finally {
      if (!ctrl.signal.aborted) setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.lang, s.mode, signature, historySignature, activeReport.id, max]);

  useEffect(() => {
    load();
    return () => abortRef.current?.abort();
  }, [load, nonce]);

  return { data, loading, failed, refresh: () => setNonce((n) => n + 1) };
}

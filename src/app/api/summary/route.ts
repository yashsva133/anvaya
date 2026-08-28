// POST /api/summary — the MedGemma briefing shown in the first box of the
// Overview screen.
//
// Same trust boundary as /api/answer: the client sends test ids and numbers
// (current report plus its history); units, reference ranges, statuses and
// every trend direction are re-derived server-side from the catalogue. Nothing
// free-text crosses except the short date labels.
//
// Response is always 200 with a usable summary — when no model is configured,
// or the model errors, the deterministic summary is returned and labelled
// engine: "rules", so the UI can be honest about who wrote it.
//
// Pipeline: src/lib/ai/summary.ts.

import { NextResponse } from "next/server";
import { parseClientReport } from "@/lib/ai/clientReport";
import { loadAiEnv } from "@/lib/ai/env";
import { persistSummary } from "@/lib/ai/persistence";
import { generateOverviewSummary } from "@/lib/ai/summary";
import type { LangCode } from "@/lib/data";
import type { ReadingLevel } from "@/lib/ai/types";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

interface SummaryBody {
  lang?: unknown;
  reading?: unknown;
  report?: unknown;
}

export async function POST(req: Request) {
  let body: SummaryBody = {};
  try {
    body = (await req.json()) as SummaryBody;
  } catch {
    /* malformed input is handled as an empty, user-safe report */
  }

  const lang: LangCode = body.lang === "hi" || body.lang === "bn" ? body.lang : "en";
  const reading: ReadingLevel =
    body.reading === "advanced" || body.reading === "standard" || body.reading === "very"
      ? body.reading
      : "simple";

  const report = parseClientReport(body.report);
  const env = loadAiEnv();

  const summary = await generateOverviewSummary({
    lang,
    readingLevel: reading,
    report: report ?? undefined,
    env,
  });

  // Best-effort provenance: the generation, its anonymisation record, the
  // retrieval + matches, and the summary text itself as a versioned
  // ai_explanations row against this report. Never blocks the response.
  let persisted: Awaited<ReturnType<typeof persistSummary>> | undefined;
  if (env.persistence && summary.payload.results.length > 0 && report) {
    persisted = await persistSummary({
      db: env.db,
      summary,
      labReportId: report?.reportId,
      readingLevel: reading,
      temperature: env.ai.temperature,
      maxTokens: env.ai.maxTokens,
      provider: env.ai.provider,
    });
  }

  return NextResponse.json({
    headline: summary.headline,
    body: summary.body,
    text: summary.text,
    speech: summary.speech,
    engine: summary.engine,
    model: summary.model,
    confidence: summary.confidence,
    trust_score: summary.trust_score,
    fallback_reason: summary.fallback_reason ?? null,
    safety_flags: summary.safety_flags,
    language: summary.language,
    personalized: Boolean(report),
    counts: summary.counts,
    trends: summary.trend_chips,
    reports_compared: summary.payload.results.length > 0 ? summary.payload.trends[0]?.points.length ?? 1 : 0,
    sources: summary.sources,
    citations: summary.citations,
    prompt_key: summary.prompt_key,
    prompt_version: summary.prompt_version,
    latency_ms: summary.latency_ms,
    generation_id: persisted?.generation_id ?? null,
    explanation_id: persisted?.explanation_id ?? null,
    persisted: persisted ? (persisted.errors?.length ? "partial" : "ok") : "off",
    mode: env.live ? "live" : "demo",
  });
}

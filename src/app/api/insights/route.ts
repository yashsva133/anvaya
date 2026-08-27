// POST /api/insights — the "AI found a connection" cards and the health story
// on the AI Insights screen.
//
// Detection is deterministic (src/lib/ai/patterns.ts): the rule engine decides
// which of the person's results are connected, in which direction, and how
// confident that finding is. MedGemma only writes the explanation for each
// card (src/lib/ai/insights.ts), and when it cannot, the reviewed seeded copy
// in src/lib/data.ts is returned with `engine: "rules"` on that card.
//
// Same trust boundary as /api/answer and /api/summary: the client sends test
// ids, numbers and its report history; every unit, range, status and trend is
// re-derived server-side.

import { NextResponse } from "next/server";
import { parseClientReport } from "@/lib/ai/clientReport";
import { loadAiEnv } from "@/lib/ai/env";
import { generateInsights } from "@/lib/ai/insights";
import { persistInsights } from "@/lib/ai/persistence";
import type { LangCode } from "@/lib/data";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

interface InsightsBody {
  lang?: unknown;
  reading?: unknown;
  report?: unknown;
  max?: unknown;
}

export async function POST(req: Request) {
  let body: InsightsBody = {};
  try {
    body = (await req.json()) as InsightsBody;
  } catch {
    /* an empty body analyses the seeded demo report */
  }

  const lang: LangCode = body.lang === "hi" || body.lang === "bn" ? body.lang : "en";
  const simple = body.reading !== "advanced";
  const max = typeof body.max === "number" && body.max >= 1 && body.max <= 4 ? Math.floor(body.max) : 3;

  const report = parseClientReport(body.report);
  const env = loadAiEnv();

  const result = await generateInsights({
    lang,
    simple,
    report: report ?? undefined,
    env,
    maxPatterns: max,
  });

  // Best-effort: one ai_generations row per card, the findings themselves as
  // report_patterns + report_pattern_members (linked to this report's actual
  // test_results), and each narrative as an ai_explanations row against the
  // finding. Never blocks the response.
  let persisted: Awaited<ReturnType<typeof persistInsights>> | undefined;
  if (env.persistence) {
    persisted = await persistInsights({
      db: env.db,
      insights: result,
      labReportId: report?.reportId,
      readingLevel: simple ? "simple" : "advanced",
      temperature: env.ai.temperature,
      maxTokens: env.ai.maxTokens,
      provider: env.ai.provider,
    });
  }

  return NextResponse.json({
    patterns: result.patterns.map((p) => ({
      id: p.id,
      title: p.title,
      nodes: p.nodes,
      confidence_pct: p.confidence_pct,
      confidence_level: p.confidence_level,
      basis: p.basis,
      explanation: p.explanation,
      risk: p.risk,
      disclaimer: p.disclaimer,
      source: p.source ?? null,
      missing: p.missing,
      engine: p.engine,
      model: p.model,
      fallback_reason: p.fallback_reason ?? null,
    })),
    story: result.story,
    engine: result.engine,
    model: result.model,
    language: result.language,
    personalized: Boolean(report),
    counts: result.counts,
    reports_compared: result.reports_compared,
    prompt_key: result.prompt_key,
    prompt_version: result.prompt_version,
    latency_ms: result.latency_ms,
    pattern_ids: persisted?.pattern_ids ?? null,
    persisted: persisted ? (persisted.errors?.length ? "partial" : "ok") : "off",
    mode: env.live ? "live" : "demo",
  });
}

// POST /api/answer — the chatbot endpoint.
//
// Pipeline (src/lib/ai/agent.ts): anonymise -> retrieve (RAG) -> prompt ->
// MedGemma over HTTP -> guardrails -> this response. Every failure mode falls
// back to the deterministic rule answers, so the endpoint never 500s on a
// patient-facing surface.
//
// Request:  { q, lang?, reading?, session?, report? }
//   report  = the user's OWN report values (personalization). Validated and
//             re-derived server-side in src/lib/ai/clientReport.ts; units,
//             reference ranges and statuses come from the catalogue, and no
//             free text beyond two short date labels is accepted.
//
// Response: the four fields the UI contract froze —
//   { matched, answer, sources, confidence }
// plus additive provenance the UI may start using at any time (engine, model,
// citations[], personalized, session_id, generation_id, latency_ms).

import { NextResponse } from "next/server";
import { askAgent } from "@/lib/ai/agent";
import { parseClientReport } from "@/lib/ai/clientReport";
import { loadAiEnv } from "@/lib/ai/env";
import { persistTurn } from "@/lib/ai/persistence";
import type { LangCode } from "@/lib/data";
import type { ReadingLevel } from "@/lib/ai/types";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

interface AnswerBody {
  q?: unknown;
  lang?: unknown;
  reading?: unknown;
  session?: unknown;
  report?: unknown;
  patientId?: unknown;
}

export async function POST(req: Request) {
  let body: AnswerBody = {};
  try {
    body = (await req.json()) as AnswerBody;
  } catch {
    /* empty body -> the agent returns the safe redirect */
  }

  const question = typeof body.q === "string" ? body.q.trim().slice(0, 1000) : "";
  const hasDevanagari = /[\u0900-\u097F]/.test(question);
  const lang: LangCode =
    body.lang === "hi" || body.lang === "bn" ? body.lang : hasDevanagari ? "hi" : "en";
  const reading: ReadingLevel =
    body.reading === "simple" || body.reading === "advanced" || body.reading === "very"
      ? body.reading
      : "standard";
  const sessionId =
    typeof body.session === "string" && /^[a-zA-Z0-9-]{8,64}$/.test(body.session)
      ? body.session
      : crypto.randomUUID();
  const patientId =
    typeof body.patientId === "string" && /^[0-9a-fA-F-]{8,64}$/.test(body.patientId)
      ? body.patientId
      : undefined;

  // The trust boundary: anything the client claims about its report stops here.
  const report = parseClientReport(body.report);

  const answer = await askAgent({
    question,
    lang,
    readingLevel: reading,
    sessionId,
    report: report ?? undefined,
  });

  // Best-effort persistence of the full turn. Never blocks correctness: the
  // ids (or the error list) come back additively and the UI ignores them.
  let persisted: Awaited<ReturnType<typeof persistTurn>> | undefined;
  const env = loadAiEnv();
  if (env.persistence) {
    persisted = await persistTurn({
      db: env.db,
      answer,
      question,
      sessionId,
      patientId,
    });
  }

  return NextResponse.json({
    // ---- the frozen contract ----
    matched: answer.matched,
    answer: answer.answer,
    sources: answer.sources,
    confidence: answer.confidence,
    // ---- additive provenance ----
    engine: answer.engine,
    model: answer.generation?.model ?? (env.live ? env.ai.model : null),
    personalized: Boolean(report),
    language: answer.language,
    citations: answer.citations.map((c) => ({
      source: c.source_code,
      title: c.source_title,
      publisher: c.publisher,
      url: c.url,
      score: c.score,
    })),
    safety_flags: answer.guard.safety_flags,
    session_id: sessionId,
    qa_message_id: persisted?.qa_message_id ?? null,
    generation_id: persisted?.generation_id ?? null,
    latency_ms: answer.latency_ms,
    persisted: persisted ? persisted.errors?.length ? "partial" : "ok" : "off",
  });
}

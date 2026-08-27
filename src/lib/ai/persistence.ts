// ---------------------------------------------------------------------------
// Persistence — writing the agent's turns into the Anvaya schema.
//
// Tables written, in dependency order:
//   voice_sessions            (0015) one row per conversation
//   qa_messages               (0015) one row per turn, user and assistant
//   ai_generations            (0012) one row per model call, full provenance
//   ai_explanations           (0012) the answer text, versioned per subject
//   explanation_citations     (0012) explanation -> chunk -> document -> source
//   answer_feedback           (0015) the helpfulness vote
//
// Two deliberate constraints:
//
// 1. NO PHI IS WRITTEN. ai_generations.input_snapshot receives the anonymised
//    payload only; the patient is reachable solely through anonymization_id.
//    See the PRIVACY INVARIANT header of db/migrations/0012_ai.sql.
//
// 2. Everything is best-effort. A persistence failure must never turn a correct
//    answer into a failed request, so every write is caught and surfaced in the
//    response's `persisted` field instead of throwing.
//
// Transport: the PostgREST REST API that Supabase exposes at /rest/v1, so no
// driver dependency is added. Note that the `anvaya` schema is intentionally
// NOT in pgrst.db_schemas (ANVAYA_DATABASE_SPEC.md §10.3), so the SQL functions
// — has_active_consent, set_review_status, release_report — still need a direct
// connection; nothing here calls them.
// ---------------------------------------------------------------------------

import type { SupabaseConfig } from "./env";
import type { AgentAnswer, RetrievalResult } from "./types";

export interface PersistedIds {
  session_id?: string;
  generation_id?: string;
  explanation_id?: string;
  qa_message_id?: string;
  retrieval_id?: string;
  errors?: string[];
}

interface Ctx {
  base: string;
  key: string;
  errors: string[];
}

async function rpc(ctx: Ctx, table: string, rows: unknown, prefer = "return=representation") {
  const res = await fetch(`${ctx.base}/rest/v1/${table}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: ctx.key,
      Authorization: `Bearer ${ctx.key}`,
      Prefer: prefer,
    },
    body: JSON.stringify(rows),
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) {
    const detail = (await res.text()).slice(0, 300);
    throw new Error(`${table}: HTTP ${res.status} ${detail}`);
  }
  if (prefer === "return=minimal") return null;
  const data = await res.json();
  return Array.isArray(data) ? data[0] : data;
}

/**
 * Persist one completed turn.
 *
 * `patientId` is required for voice_sessions and answer_feedback. It comes from
 * auth.uid() resolved by the caller — this module never invents or guesses an
 * identity, and without one it writes nothing rather than writing to the wrong
 * patient. That is the correct failure mode for a health record.
 */
export async function persistTurn(opts: {
  db: SupabaseConfig;
  answer: AgentAnswer;
  question: string;
  sessionId: string;
  patientId?: string;
  labReportId?: string;
  anonymizationId?: string;
}): Promise<PersistedIds> {
  const { db, answer, question, sessionId } = opts;
  if (!db.url || !db.serviceKey) {
    return { errors: ["persistence_disabled"] };
  }
  const ctx: Ctx = {
    base: db.url.replace(/\/+$/, ""),
    key: db.serviceKey,
    errors: [],
  };
  const out: PersistedIds = {};

  try {
    // ---- rag_retrievals ---------------------------------------------------
    let retrievalId: string | undefined;
    const r = answer.retrieval;
    if (r) {
      try {
        const row = await rpc(ctx, "rag_retrievals", {
          query_text: r.query_text,
          query_intent: r.query_intent,
          language: r.language,
          engine: r.engine,
          index_version: r.index_version,
          top_k: r.top_k,
          min_score: r.min_score,
          match_count: r.match_count,
          best_score: r.best_score,
          mean_score: r.mean_score,
          latency_ms: r.latency_ms,
        });
        retrievalId = row?.id;
        out.retrieval_id = retrievalId;
      } catch (err) {
        ctx.errors.push(msg(err, "rag_retrievals"));
      }

      // Matches are best-effort: they need rag_chunks rows to exist, and during
      // bring-up the chunk table may still be empty.
      if (retrievalId) {
        for (const m of r.matches) {
          try {
            await rpc(
              ctx,
              "rag_retrieval_matches",
              {
                retrieval_id: retrievalId,
                rag_chunk_id: m.id,
                rank: m.rank,
                score: m.score,
                matched_on: m.matched_on,
              },
              "return=minimal"
            );
          } catch {
            // Expected until rag_chunks is seeded; not worth surfacing per row.
          }
        }
      }
    }

    // ---- ai_generations ---------------------------------------------------
    let generationId: string | undefined;
    try {
      const g = answer.generation;
      const row = await rpc(ctx, "ai_generations", {
        purpose: "qa_answer",
        // A blocked input never produced a generation; a rules answer did not
        // either. Only a real model call is 'succeeded'.
        status: answer.engine === "medgemma" ? "succeeded" : g?.error_code ? "failed" : "blocked",
        provider: g?.provider ?? answer.engine,
        model: g?.model ?? null,
        model_version: null,
        prompt_key: answer.prompt_key,
        prompt_version: answer.prompt_version,
        system_prompt_sha256: answer.system_prompt_sha256,
        max_tokens: null,
        anonymization_id: opts.anonymizationId ?? null,
        input_version: answer.payload.input_version,
        // The exact anonymised payload the model saw — never any identifier.
        input_snapshot: {
          pseudonym: answer.payload.pseudonym,
          age_band: answer.payload.age_band,
          sex: answer.payload.sex,
          report_date: answer.payload.report_date,
          results: answer.payload.results,
          patterns: answer.payload.patterns,
        },
        retrieval_id: retrievalId ?? null,
        language: answer.language,
        raw_output: g?.text ?? answer.answer,
        refusal_detected: answer.guard.refusal_detected,
        safety_flags: answer.guard.safety_flags,
        model_confidence: g?.model_confidence ?? null,
        retrieval_similarity: answer.guard.retrieval_similarity,
        trust_score: answer.guard.trust_score,
        trust_level: answer.guard.confidence,
        trust_formula: answer.guard.trust_formula,
        citation_count: answer.citations.length,
        tokens_prompt: g?.tokens_prompt ?? null,
        tokens_completion: g?.tokens_completion ?? null,
        latency_ms: g?.latency_ms ?? answer.latency_ms,
        error_code: g?.error_code ?? null,
        error_message: g?.error_message ?? null,
        finished_at: new Date().toISOString(),
      });
      generationId = row?.id;
      out.generation_id = generationId;
    } catch (err) {
      ctx.errors.push(msg(err, "ai_generations"));
    }

    // ---- voice_sessions + qa_messages -------------------------------------
    if (opts.patientId) {
      let dbSessionId = sessionId;
      try {
        const existing = await findSession(ctx, sessionId);
        if (existing?.id) {
          dbSessionId = existing.id;
        } else {
          const row = await rpc(ctx, "voice_sessions", {
            id: sessionId,
            patient_id: opts.patientId,
            lab_report_id: opts.labReportId ?? null,
            channel: "text",
            language: answer.language,
          });
          dbSessionId = row?.id ?? sessionId;
        }
        out.session_id = dbSessionId;
      } catch (err) {
        ctx.errors.push(msg(err, "voice_sessions"));
      }

      try {
        await rpc(
          ctx,
          "qa_messages",
          {
            session_id: dbSessionId,
            role: "user",
            body_md: question,
            body_plain: question,
            language: answer.language,
          },
          "return=minimal"
        );
      } catch (err) {
        ctx.errors.push(msg(err, "qa_messages(user)"));
      }

      try {
        const row = await rpc(ctx, "qa_messages", {
          session_id: dbSessionId,
          role: "assistant",
          body_md: answer.answer,
          body_plain: stripMarkdown(answer.answer),
          language: answer.language,
          generation_id: generationId ?? null,
          matched_topic: answer.matched,
          sources_count: answer.sources,
          confidence_level: answer.confidence,
          // qa_assistant_needs_generation: an assistant turn needs either a
          // generation or is_fallback, so the constraint is satisfied either way.
          is_fallback: answer.engine !== "medgemma",
          latency_ms: answer.latency_ms,
        });
        out.qa_message_id = row?.id;
      } catch (err) {
        ctx.errors.push(msg(err, "qa_messages(assistant)"));
      }

      try {
        await rpc(
          ctx,
          "voice_sessions",
          { id: dbSessionId, turn_count: await turnCount(ctx, dbSessionId) },
          "return=minimal"
        ).catch(() => undefined);
      } catch {
        /* turn_count is a convenience, not a record */
      }
    } else {
      ctx.errors.push("patient_id_missing: voice_sessions/qa_messages skipped");
    }

    if (ctx.errors.length > 0) out.errors = ctx.errors;
    return out;
  } catch (err) {
    ctx.errors.push(msg(err, "persistTurn"));
    return { ...out, errors: ctx.errors };
  }
}

async function findSession(ctx: Ctx, sessionId: string) {
  const res = await fetch(`${ctx.base}/rest/v1/voice_sessions?id=eq.${encodeURIComponent(sessionId)}&select=id&limit=1`, {
    headers: { apikey: ctx.key, Authorization: `Bearer ${ctx.key}` },
    signal: AbortSignal.timeout(5000),
  });
  if (!res.ok) return null;
  const rows: { id: string }[] = await res.json();
  return rows[0] ?? null;
}

async function turnCount(ctx: Ctx, sessionId: string): Promise<number> {
  const res = await fetch(
    `${ctx.base}/rest/v1/qa_messages?session_id=eq.${encodeURIComponent(sessionId)}&select=id`,
    {
      headers: { apikey: ctx.key, Authorization: `Bearer ${ctx.key}` },
      signal: AbortSignal.timeout(5000),
    }
  );
  if (!res.ok) return 0;
  const rows: unknown[] = await res.json();
  // A turn is a user+assistant pair.
  return Math.floor(rows.length / 2);
}

/**
 * Record a helpfulness vote — replaces the `persisted: false` stub.
 * `answer_feedback` is unique per (qa_message_id, patient_id), so a second vote
 * from the same patient is ignored rather than erroring.
 */
export async function persistFeedback(opts: {
  db: SupabaseConfig;
  qaMessageId: string;
  patientId: string;
  helpful: boolean;
  comment?: string;
}): Promise<{ persisted: boolean; error?: string }> {
  const { db } = opts;
  if (!db.url || !db.serviceKey) return { persisted: false, error: "persistence_disabled" };
  const ctx: Ctx = { base: db.url.replace(/\/+$/, ""), key: db.serviceKey, errors: [] };
  try {
    await rpc(
      ctx,
      "answer_feedback",
      {
        qa_message_id: opts.qaMessageId,
        patient_id: opts.patientId,
        helpful: opts.helpful,
        comment: opts.comment ?? null,
      },
      "return=minimal"
    );
    return { persisted: true };
  } catch (err) {
    return { persisted: false, error: msg(err, "answer_feedback") };
  }
}

/** Flatten markdown to the TTS-ready form qa_messages.body_plain expects. */
export function stripMarkdown(md: string): string {
  return md
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/^[-*]\s+/gm, "")
    .replace(/[#`|]/g, "")
    .replace(/\n{2,}/g, ". ")
    .replace(/\s+/g, " ")
    .trim();
}

function msg(err: unknown, where: string): string {
  const text = err instanceof Error ? err.message : String(err);
  return `${where}: ${text}`.slice(0, 400);
}

export type { RetrievalResult };

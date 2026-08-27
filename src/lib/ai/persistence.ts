// ---------------------------------------------------------------------------
// Persistence — writing every AI stage into the Anvaya schema.
//
// Tables written, in dependency order:
//   rag_sources / rag_documents / rag_chunks   (0011) the corpus, upserted once
//   rag_retrievals / rag_retrieval_matches     (0011) one row per retrieval
//   anonymization_records                      (0010) the PII firewall record
//   ai_generations                             (0012) one row per model call
//   ai_explanations                            (0012) the text, versioned
//   explanation_citations                      (0012) explanation -> chunk
//   pattern_templates / report_patterns /
//     report_pattern_members                   (0013) the detected connections
//   voice_sessions / qa_messages               (0015) the conversation
//   answer_feedback                            (0015) the helpfulness vote
//
// Three deliberate constraints:
//
// 1. NO PHI IS WRITTEN. ai_generations.input_snapshot receives the anonymised
//    payload only; the patient is reachable solely through anonymization_id.
//    See the PRIVACY INVARIANT header of db/migrations/0012_ai.sql.
//
// 2. Everything is best-effort. A persistence failure must never turn a correct
//    answer into a failed request, so every write is caught and surfaced in the
//    response's `persisted` field instead of throwing.
//
// 3. Ids are only used when they are real. A patient id or report id that is
//    not a uuid belongs to the local demo data, and writing an AI row against
//    an invented identifier is worse than not writing it at all.
//
// Transport: the PostgREST REST API that Supabase exposes at /rest/v1, so no
// driver dependency is added. Note that the `anvaya` schema is intentionally
// NOT in pgrst.db_schemas (ANVAYA_DATABASE_SPEC.md §10.3), so the SQL functions
// — has_active_consent, set_review_status, release_report — still need a direct
// connection; nothing here calls them.
// ---------------------------------------------------------------------------

import { createHash } from "node:crypto";
import type { LangCode } from "@/lib/data";
import type { SupabaseConfig } from "./env";
import type { InsightsResult } from "./insights";
import { RAG_INDEX_VERSION, ragCorpus } from "./rag";
import type { OverviewSummary } from "./summary";
import type {
  AgentAnswer,
  AnonymisedPayload,
  ReadingLevel,
  RetrievalResult,
  RetrievedChunk,
} from "./types";

export interface PersistedIds {
  session_id?: string;
  generation_id?: string;
  explanation_id?: string;
  qa_message_id?: string;
  retrieval_id?: string;
  anonymization_id?: string;
  citation_count?: number;
  /** report_patterns ids, for the insights writer. */
  pattern_ids?: string[];
  errors?: string[];
}

interface Ctx {
  base: string;
  key: string;
  errors: string[];
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Only a real uuid may be written into a foreign key column. */
export function asUuid(v: unknown): string | undefined {
  return typeof v === "string" && UUID_RE.test(v) ? v : undefined;
}

function sha256(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

function ctxFor(db: SupabaseConfig): Ctx | null {
  if (!db.url || !db.serviceKey) return null;
  return { base: db.url.replace(/\/+$/, ""), key: db.serviceKey, errors: [] };
}

function headers(ctx: Ctx, prefer?: string): Record<string, string> {
  return {
    "Content-Type": "application/json",
    apikey: ctx.key,
    Authorization: `Bearer ${ctx.key}`,
    ...(prefer ? { Prefer: prefer } : {}),
  };
}

async function rpc(
  ctx: Ctx,
  table: string,
  rows: unknown,
  prefer = "return=representation",
  query = ""
) {
  const res = await fetch(`${ctx.base}/rest/v1/${table}${query}`, {
    method: "POST",
    headers: headers(ctx, prefer),
    body: JSON.stringify(rows),
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) {
    const detail = (await res.text()).slice(0, 300);
    throw new Error(`${table}: HTTP ${res.status} ${detail}`);
  }
  if (prefer.includes("return=minimal")) return null;
  const data = await res.json();
  return Array.isArray(data) ? data[0] : data;
}

/** Upsert helper: PostgREST merge-duplicates on a unique constraint. */
async function upsert(ctx: Ctx, table: string, rows: unknown, onConflict: string) {
  return rpc(
    ctx,
    table,
    rows,
    "resolution=merge-duplicates,return=representation",
    `?on_conflict=${onConflict}`
  );
}

async function select<T = Record<string, unknown>>(ctx: Ctx, path: string): Promise<T[]> {
  const res = await fetch(`${ctx.base}/rest/v1/${path}`, {
    headers: headers(ctx),
    signal: AbortSignal.timeout(6000),
  });
  if (!res.ok) return [];
  return (await res.json()) as T[];
}

async function patch(ctx: Ctx, path: string, body: unknown) {
  await fetch(`${ctx.base}/rest/v1/${path}`, {
    method: "PATCH",
    headers: headers(ctx, "return=minimal"),
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(6000),
  });
}

function msg(err: unknown, where: string): string {
  const text = err instanceof Error ? err.message : String(err);
  return `${where}: ${text}`.slice(0, 400);
}

// ---------------------------------------------------------------------------
// Enum mapping
// ---------------------------------------------------------------------------

/**
 * anvaya_reading_level is ('standard','simple','very') in 0002, and migration
 * 0023 adds 'advanced' — the value the UI has used since the settings refactor.
 * A deployment that has not run 0023 yet would reject the insert, so the writer
 * falls back to 'standard' on the enum error rather than losing the row.
 */
const READING_LEVELS = new Set(["standard", "simple", "very", "advanced"]);
function readingLevel(level?: ReadingLevel): string {
  return level && READING_LEVELS.has(level) ? level : "standard";
}
function isEnumError(err: unknown, enumName: string): boolean {
  const text = err instanceof Error ? err.message : String(err);
  return text.includes("invalid input value for enum") && text.includes(enumName);
}

/** anonymization_records.age_band has a CHECK list; "unspecified" is not in it. */
const AGE_BANDS = new Set([
  "0-11",
  "12-17",
  "18-29",
  "30-39",
  "40-49",
  "50-59",
  "60-69",
  "70-79",
  "80+",
]);

// ---------------------------------------------------------------------------
// The RAG corpus. Cached per Supabase URL for the life of the process: it is a
// static catalogue, and re-upserting it on every turn would add a dozen round
// trips to every answer.
// ---------------------------------------------------------------------------

const corpusCache = new Map<string, Map<string, string>>();

/**
 * Ensure rag_sources / rag_documents / rag_chunks exist, and return a map from
 * the local chunk id (the FAISS key) to the rag_chunks uuid.
 *
 * Without this, every rag_retrieval_matches and explanation_citations insert
 * fails its foreign key — which is exactly what used to happen: the retrieval
 * row was written and its matches silently dropped, so no citation chain
 * existed in the database at all.
 */
async function ensureCorpus(ctx: Ctx): Promise<Map<string, string>> {
  const cached = corpusCache.get(ctx.base);
  if (cached) return cached;

  const map = new Map<string, string>();
  const { sources, chunks } = ragCorpus();

  try {
    // 1. sources
    await upsert(
      ctx,
      "rag_sources",
      sources.map((s) => ({
        code: s.id,
        title: s.title,
        publisher: s.publisher,
        country: s.country,
        url: s.url,
        is_clinical_authority: true,
        is_active: true,
      })),
      "code"
    );
    const sourceIds = new Map(
      (await select<{ id: string; code: string }>(ctx, "rag_sources?select=id,code")).map((r) => [
        r.code,
        r.id,
      ])
    );

    // 2. one document version per source, keyed by the index version so a
    //    rebuilt index produces a new document row rather than mutating one.
    await upsert(
      ctx,
      "rag_documents",
      sources
        .filter((s) => sourceIds.has(s.id))
        .map((s) => ({
          rag_source_id: sourceIds.get(s.id),
          version: RAG_INDEX_VERSION,
          title: s.title,
          url: s.url,
          language: "en",
          index_version: RAG_INDEX_VERSION,
          content_sha256: sha256(s.excerpt.en),
          char_count: s.excerpt.en.length,
          licence_note: "Public patient-education text, quoted for citation.",
          is_active: true,
        })),
      "rag_source_id,version"
    );
    const docIds = new Map(
      (
        await select<{ id: string; rag_source_id: string }>(
          ctx,
          `rag_documents?select=id,rag_source_id&version=eq.${encodeURIComponent(RAG_INDEX_VERSION)}`
        )
      ).map((r) => [r.rag_source_id, r.id])
    );

    // 3. chunks. seq is per document, so it is assigned here in corpus order.
    const seqBySource = new Map<string, number>();
    const chunkRows = chunks
      .map((c) => {
        const sourceId = sourceIds.get(c.source_code);
        const documentId = sourceId ? docIds.get(sourceId) : undefined;
        if (!documentId) return null;
        const seq = seqBySource.get(documentId) ?? 0;
        seqBySource.set(documentId, seq + 1);
        return {
          document_id: documentId,
          seq,
          heading: c.heading,
          content: c.content_en,
          token_count: Math.ceil(c.content_en.length / 4),
          external_vector_id: c.id,
          embedding_model: null,
          is_active: true,
        };
      })
      .filter(Boolean);

    if (chunkRows.length > 0) {
      await upsert(ctx, "rag_chunks", chunkRows, "external_vector_id");
    }

    for (const row of await select<{ id: string; external_vector_id: string }>(
      ctx,
      "rag_chunks?select=id,external_vector_id&external_vector_id=not.is.null&limit=2000"
    )) {
      map.set(row.external_vector_id, row.id);
    }
  } catch (err) {
    ctx.errors.push(msg(err, "rag_corpus"));
  }

  // Cache even a partial map: a missing chunk simply means that citation is
  // skipped, and retrying the whole corpus on every turn would be worse.
  corpusCache.set(ctx.base, map);
  return map;
}

// ---------------------------------------------------------------------------
// Shared stage writers
// ---------------------------------------------------------------------------

async function writeRetrieval(
  ctx: Ctx,
  retrieval: RetrievalResult | undefined
): Promise<{ retrievalId?: string; matchIds: Map<string, string> }> {
  const matchIds = new Map<string, string>();
  if (!retrieval) return { matchIds };

  let retrievalId: string | undefined;
  try {
    const row = await rpc(ctx, "rag_retrievals", {
      query_text: retrieval.query_text,
      query_intent: retrieval.query_intent,
      language: retrieval.language,
      engine: retrieval.engine,
      index_version: retrieval.index_version,
      top_k: retrieval.top_k,
      min_score: retrieval.min_score,
      match_count: retrieval.match_count,
      best_score: retrieval.best_score,
      mean_score: retrieval.mean_score,
      latency_ms: retrieval.latency_ms,
    });
    retrievalId = row?.id;
  } catch (err) {
    ctx.errors.push(msg(err, "rag_retrievals"));
    return { matchIds };
  }

  if (!retrievalId || retrieval.matches.length === 0) return { retrievalId, matchIds };

  const chunkIds = await ensureCorpus(ctx);
  for (const m of retrieval.matches) {
    const chunkId = chunkIds.get(m.id);
    if (!chunkId) continue;
    try {
      const row = await rpc(ctx, "rag_retrieval_matches", {
        retrieval_id: retrievalId,
        rag_chunk_id: chunkId,
        rank: m.rank,
        score: m.score,
        matched_on: m.matched_on,
      });
      if (row?.id) matchIds.set(m.id, row.id);
    } catch (err) {
      ctx.errors.push(msg(err, "rag_retrieval_matches"));
    }
  }
  return { retrievalId, matchIds };
}

/**
 * The anonymisation assertion for this call.
 *
 * Requires a real lab_reports uuid, because anonymization_records.lab_report_id
 * is NOT NULL — the record asserts "this report was de-identified", and there
 * is no meaningful version of that statement without a report.
 */
async function writeAnonymization(
  ctx: Ctx,
  payload: AnonymisedPayload,
  labReportId?: string
): Promise<string | undefined> {
  if (!labReportId) return undefined;
  try {
    const row = await rpc(ctx, "anonymization_records", {
      lab_report_id: labReportId,
      pseudonym: payload.pseudonym,
      method: "pseudonymisation",
      removed_fields: payload.removed_fields,
      retained_fields: payload.retained_fields,
      age_band: AGE_BANDS.has(payload.age_band) ? payload.age_band : null,
      sex: payload.sex,
      // Keyed digest: lets the pipeline recognise "same subject as last time"
      // without storing anything identifying. The key never leaves the env.
      subject_digest: sha256(
        `${process.env.ANVAYA_SUBJECT_DIGEST_KEY ?? "anvaya-dev"}::${labReportId}`
      ),
      payload_sha256: sha256(JSON.stringify(payload.results)),
    });
    return row?.id;
  } catch (err) {
    ctx.errors.push(msg(err, "anonymization_records"));
    return undefined;
  }
}

interface GenerationInput {
  purpose: "qa_answer" | "report_summary" | "pattern_insight" | "test_explanation" | "translation";
  status: "succeeded" | "failed" | "blocked";
  provider: string;
  model?: string | null;
  modelVersion?: string | null;
  promptKey: string;
  promptVersion: string;
  systemSha: string;
  temperature?: number;
  maxTokens?: number;
  anonymizationId?: string;
  payload: AnonymisedPayload;
  retrievalId?: string;
  language: LangCode;
  readingLevel?: ReadingLevel;
  rawOutput: string;
  refusal: boolean;
  safetyFlags: string[];
  modelConfidence?: number;
  retrievalSimilarity?: number;
  trustScore?: number;
  trustLevel?: "high" | "moderate";
  trustFormula?: string;
  citationCount: number;
  tokensPrompt?: number;
  tokensCompletion?: number;
  latencyMs: number;
  errorCode?: string;
  errorMessage?: string;
}

/** One ai_generations row, with every provenance column this pipeline knows. */
async function writeGeneration(ctx: Ctx, input: GenerationInput): Promise<string | undefined> {
  const finished = Date.now();
  const body: Record<string, unknown> = {
    purpose: input.purpose,
    status: input.status,
    provider: input.provider,
    model: input.model ?? null,
    model_version: input.modelVersion ?? null,
    prompt_key: input.promptKey,
    prompt_version: input.promptVersion,
    system_prompt_sha256: input.systemSha,
    temperature: input.temperature ?? null,
    max_tokens: input.maxTokens ?? null,
    anonymization_id: input.anonymizationId ?? null,
    input_version: input.payload.input_version,
    // The exact anonymised payload the model saw — never any identifier.
    input_snapshot: {
      pseudonym: input.payload.pseudonym,
      age_band: input.payload.age_band,
      sex: input.payload.sex,
      report_date: input.payload.report_date,
      results: input.payload.results,
      trends: input.payload.trends,
      patterns: input.payload.patterns,
      removed_fields: input.payload.removed_fields,
      retained_fields: input.payload.retained_fields,
    },
    retrieval_id: input.retrievalId ?? null,
    language: input.language,
    reading_level: readingLevel(input.readingLevel),
    raw_output: input.rawOutput,
    output_sha256: sha256(input.rawOutput),
    refusal_detected: input.refusal,
    safety_flags: input.safetyFlags,
    model_confidence: input.modelConfidence ?? null,
    retrieval_similarity: input.retrievalSimilarity ?? null,
    trust_score: input.trustScore ?? null,
    trust_level: input.trustLevel ?? null,
    trust_formula: input.trustFormula ?? null,
    citation_count: input.citationCount,
    tokens_prompt: input.tokensPrompt ?? null,
    tokens_completion: input.tokensCompletion ?? null,
    latency_ms: input.latencyMs,
    error_code: input.errorCode ?? null,
    error_message: input.errorMessage ?? null,
    started_at: new Date(finished - Math.max(0, input.latencyMs)).toISOString(),
    finished_at: new Date(finished).toISOString(),
  };

  try {
    const row = await rpc(ctx, "ai_generations", body);
    return row?.id;
  } catch (err) {
    // A deployment without migration 0023 does not know 'advanced'.
    if (isEnumError(err, "anvaya_reading_level")) {
      try {
        const row = await rpc(ctx, "ai_generations", { ...body, reading_level: "standard" });
        return row?.id;
      } catch (retryErr) {
        ctx.errors.push(msg(retryErr, "ai_generations"));
        return undefined;
      }
    }
    ctx.errors.push(msg(err, "ai_generations"));
    return undefined;
  }
}

type Subject =
  | { kind: "report"; id: string }
  | { kind: "report_pattern"; id: string }
  | { kind: "test_result"; id: string };

function subjectColumns(subject: Subject) {
  return {
    subject_report_id: subject.kind === "report" ? subject.id : null,
    subject_report_pattern_id: subject.kind === "report_pattern" ? subject.id : null,
    subject_test_result_id: subject.kind === "test_result" ? subject.id : null,
  };
}

/**
 * Write the patient-facing text.
 *
 * ai_explanations is versioned per (subject, language, reading level) with a
 * partial unique index allowing exactly one is_current row. Regenerating a
 * summary therefore retires the previous row and inserts version+1, which is
 * what the schema's guard_explanation_body trigger is designed for: the
 * original AI draft is never overwritten.
 */
async function writeExplanation(
  ctx: Ctx,
  input: {
    generationId: string;
    subject: Subject;
    language: LangCode;
    level?: ReadingLevel;
    bodyMd: string;
    heading?: string;
    disclaimer?: string;
  }
): Promise<string | undefined> {
  const cols = subjectColumns(input.subject);
  const column =
    input.subject.kind === "report"
      ? "subject_report_id"
      : input.subject.kind === "report_pattern"
        ? "subject_report_pattern_id"
        : "subject_test_result_id";

  const insert = async (level: string) => {
    // Retire the current row for this subject/language/level, then add the
    // next version.
    let version = 1;
    try {
      const existing = await select<{ id: string; version: number }>(
        ctx,
        `ai_explanations?select=id,version&${column}=eq.${input.subject.id}` +
          `&language=eq.${input.language}&reading_level=eq.${level}` +
          `&order=version.desc&limit=1`
      );
      if (existing[0]) {
        version = Number(existing[0].version ?? 1) + 1;
        await patch(
          ctx,
          `ai_explanations?${column}=eq.${input.subject.id}&language=eq.${input.language}` +
            `&reading_level=eq.${level}&is_current=eq.true`,
          { is_current: false }
        );
      }
    } catch {
      /* first write for this subject */
    }

    const row = await rpc(ctx, "ai_explanations", {
      generation_id: input.generationId,
      ...cols,
      language: input.language,
      reading_level: level,
      version,
      body_md: input.bodyMd,
      body_plain: stripMarkdown(input.bodyMd),
      heading: input.heading ?? null,
      disclaimer: input.disclaimer ?? null,
      is_current: true,
    });
    return row?.id as string | undefined;
  };

  try {
    return await insert(readingLevel(input.level));
  } catch (err) {
    if (isEnumError(err, "anvaya_reading_level")) {
      try {
        return await insert("standard");
      } catch (retryErr) {
        ctx.errors.push(msg(retryErr, "ai_explanations"));
        return undefined;
      }
    }
    ctx.errors.push(msg(err, "ai_explanations"));
    return undefined;
  }
}

/** explanation -> chunk -> document -> source: the "what supported this?" chain. */
async function writeCitations(
  ctx: Ctx,
  explanationId: string,
  matches: RetrievedChunk[],
  matchIds: Map<string, string>
): Promise<number> {
  if (matches.length === 0) return 0;
  const chunkIds = await ensureCorpus(ctx);
  let written = 0;
  let index = 1;
  for (const m of matches) {
    const chunkId = chunkIds.get(m.id);
    if (!chunkId) continue;
    try {
      await rpc(
        ctx,
        "explanation_citations",
        {
          explanation_id: explanationId,
          rag_chunk_id: chunkId,
          retrieval_match_id: matchIds.get(m.id) ?? null,
          citation_index: index,
          rank: m.rank,
          similarity: m.score,
          quoted_text: m.content.slice(0, 1000),
        },
        "return=minimal"
      );
      written += 1;
      index += 1;
    } catch (err) {
      ctx.errors.push(msg(err, "explanation_citations"));
    }
  }
  return written;
}

// ---------------------------------------------------------------------------
// 1. A chat / voice turn
// ---------------------------------------------------------------------------

export async function persistTurn(opts: {
  db: SupabaseConfig;
  answer: AgentAnswer;
  question: string;
  sessionId: string;
  patientId?: string;
  labReportId?: string;
  /** "voice" turns are recorded as a voice session, not a text one. */
  channel?: "text" | "voice";
  readingLevel?: ReadingLevel;
  temperature?: number;
  maxTokens?: number;
  /** STT transcript for a voice turn, when the client captured one. */
  transcript?: string;
  transcriptConfidence?: number;
  sttEngine?: string;
  ttsEngine?: string;
  deviceHint?: string;
}): Promise<PersistedIds> {
  const { answer, question, sessionId } = opts;
  const ctx = ctxFor(opts.db);
  if (!ctx) return { errors: ["persistence_disabled"] };

  const out: PersistedIds = {};
  const labReportId = asUuid(opts.labReportId);
  const patientId = asUuid(opts.patientId);
  const channel = opts.channel === "voice" ? "voice" : "text";

  try {
    // ---- retrieval + corpus ----------------------------------------------
    const { retrievalId, matchIds } = await writeRetrieval(ctx, answer.retrieval);
    out.retrieval_id = retrievalId;

    // ---- anonymisation ----------------------------------------------------
    const anonymizationId = await writeAnonymization(ctx, answer.payload, labReportId);
    out.anonymization_id = anonymizationId;

    // ---- generation -------------------------------------------------------
    const g = answer.generation;
    const generationId = await writeGeneration(ctx, {
      purpose: "qa_answer",
      // A blocked input never produced a generation; a rules answer did not
      // either. Only a real model call is 'succeeded'.
      status: answer.engine === "medgemma" ? "succeeded" : g?.error_code ? "failed" : "blocked",
      provider: g?.provider ?? answer.engine,
      model: g?.model ?? null,
      modelVersion: g?.model ?? null,
      promptKey: answer.prompt_key,
      promptVersion: answer.prompt_version,
      systemSha: answer.system_prompt_sha256,
      temperature: opts.temperature,
      maxTokens: opts.maxTokens,
      anonymizationId,
      payload: answer.payload,
      retrievalId,
      language: answer.language,
      readingLevel: opts.readingLevel,
      rawOutput: g?.text ?? answer.answer,
      refusal: answer.guard.refusal_detected,
      safetyFlags: answer.guard.safety_flags,
      modelConfidence: g?.model_confidence,
      retrievalSimilarity: answer.guard.retrieval_similarity,
      trustScore: answer.guard.trust_score,
      trustLevel: answer.confidence,
      trustFormula: answer.guard.trust_formula,
      citationCount: answer.citations.length,
      tokensPrompt: g?.tokens_prompt,
      tokensCompletion: g?.tokens_completion,
      latencyMs: g?.latency_ms ?? answer.latency_ms,
      errorCode: g?.error_code,
      // gen_failure_has_reason: a 'failed' row must say why.
      errorMessage:
        g?.error_message ?? (g?.error_code && !g?.error_message ? "provider error" : undefined),
    });
    out.generation_id = generationId;

    // No ai_explanations row is written for a chat turn, deliberately.
    //
    // ai_explanations is versioned per (subject, language, reading level) with
    // one is_current row, and its subject here would be the report — so every
    // question asked about a report would retire that report's summary and
    // replace it with a chat reply. A turn's text belongs to qa_messages, and
    // its evidence chain is still complete: qa_messages.generation_id ->
    // ai_generations.retrieval_id -> rag_retrieval_matches -> rag_chunks.
    out.citation_count = matchIds.size;

    // ---- voice_sessions + qa_messages -------------------------------------
    if (patientId) {
      let dbSessionId = sessionId;
      try {
        const existing = await findSession(ctx, sessionId);
        if (existing?.id) {
          dbSessionId = existing.id;
        } else {
          const row = await rpc(ctx, "voice_sessions", {
            id: sessionId,
            patient_id: patientId,
            lab_report_id: labReportId ?? null,
            channel,
            language: answer.language,
            stt_engine: opts.sttEngine ?? (channel === "voice" ? "browser-speech-recognition" : null),
            tts_engine: opts.ttsEngine ?? (channel === "voice" ? "browser-speech-synthesis" : null),
            device_hint: opts.deviceHint ?? null,
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
            transcript: opts.transcript ?? (channel === "voice" ? question : null),
            transcript_confidence: opts.transcriptConfidence ?? null,
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
        await patch(ctx, `voice_sessions?id=eq.${dbSessionId}`, {
          turn_count: await turnCount(ctx, dbSessionId),
        });
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

// ---------------------------------------------------------------------------
// 2. The Overview summary
// ---------------------------------------------------------------------------

export async function persistSummary(opts: {
  db: SupabaseConfig;
  summary: OverviewSummary;
  labReportId?: string;
  readingLevel?: ReadingLevel;
  temperature?: number;
  maxTokens?: number;
  provider: string;
}): Promise<PersistedIds> {
  const ctx = ctxFor(opts.db);
  if (!ctx) return { errors: ["persistence_disabled"] };
  const out: PersistedIds = {};
  const s = opts.summary;
  const labReportId = asUuid(opts.labReportId);

  try {
    const { retrievalId, matchIds } = await writeRetrieval(ctx, s.retrieval);
    out.retrieval_id = retrievalId;

    const anonymizationId = await writeAnonymization(ctx, s.payload, labReportId);
    out.anonymization_id = anonymizationId;

    const g = s.generation;
    const generationId = await writeGeneration(ctx, {
      purpose: "report_summary",
      status: s.engine === "medgemma" ? "succeeded" : g?.error_code ? "failed" : "blocked",
      provider: g?.provider ?? opts.provider,
      model: g?.model ?? s.model,
      modelVersion: g?.model ?? null,
      promptKey: s.prompt_key,
      promptVersion: s.prompt_version,
      systemSha: s.system_prompt_sha256,
      temperature: opts.temperature,
      maxTokens: opts.maxTokens,
      anonymizationId,
      payload: s.payload,
      retrievalId,
      language: s.language,
      readingLevel: opts.readingLevel,
      rawOutput: g?.text ?? s.text,
      refusal: s.guard?.refusal_detected ?? false,
      // The fallback reason is part of the safety record: it is why the text on
      // screen is not the model's.
      safetyFlags: [
        ...s.safety_flags,
        ...(s.fallback_reason ? [`fallback:${s.fallback_reason}`] : []),
      ],
      modelConfidence: g?.model_confidence,
      retrievalSimilarity: s.guard?.retrieval_similarity ?? s.retrieval?.mean_score,
      trustScore: s.trust_score,
      trustLevel: s.confidence,
      trustFormula: s.guard?.trust_formula,
      citationCount: s.citations.length,
      tokensPrompt: g?.tokens_prompt,
      tokensCompletion: g?.tokens_completion,
      latencyMs: s.latency_ms,
      errorCode: g?.error_code,
      errorMessage: g?.error_message ?? (g?.error_code ? "provider error" : undefined),
    });
    out.generation_id = generationId;

    if (generationId && labReportId) {
      const explanationId = await writeExplanation(ctx, {
        generationId,
        subject: { kind: "report", id: labReportId },
        language: s.language,
        level: opts.readingLevel,
        bodyMd: s.text,
        heading: s.headline,
      });
      out.explanation_id = explanationId;
      if (explanationId) {
        out.citation_count = await writeCitations(
          ctx,
          explanationId,
          s.retrieval?.matches ?? [],
          matchIds
        );
      }
    }

    if (ctx.errors.length > 0) out.errors = ctx.errors;
    return out;
  } catch (err) {
    ctx.errors.push(msg(err, "persistSummary"));
    return { ...out, errors: ctx.errors };
  }
}

// ---------------------------------------------------------------------------
// 3. The detected connections
// ---------------------------------------------------------------------------

const templateCache = new Map<string, Map<string, string>>();

/** pattern_templates is the static catalogue; the code column is the app's id. */
async function ensureTemplate(
  ctx: Ctx,
  code: string,
  titleEn: string,
  disclaimer: string
): Promise<string | undefined> {
  let cache = templateCache.get(ctx.base);
  if (!cache) {
    cache = new Map();
    templateCache.set(ctx.base, cache);
  }
  const hit = cache.get(code);
  if (hit) return hit;

  try {
    const row = await upsert(
      ctx,
      "pattern_templates",
      {
        code,
        title_en: titleEn,
        default_disclaimer_en: disclaimer,
        description: "Detected by the Anvaya rule engine (src/lib/ai/patterns.ts).",
        is_active: true,
      },
      "code"
    );
    const id = row?.id as string | undefined;
    if (id) cache.set(code, id);
    return id;
  } catch (err) {
    ctx.errors.push(msg(err, "pattern_templates"));
    return undefined;
  }
}

export async function persistInsights(opts: {
  db: SupabaseConfig;
  insights: InsightsResult;
  labReportId?: string;
  readingLevel?: ReadingLevel;
  temperature?: number;
  maxTokens?: number;
  provider: string;
}): Promise<PersistedIds> {
  const ctx = ctxFor(opts.db);
  if (!ctx) return { errors: ["persistence_disabled"] };
  const out: PersistedIds = { pattern_ids: [] };
  const labReportId = asUuid(opts.labReportId);
  const ins = opts.insights;

  if (!labReportId) {
    // report_patterns.report_id is NOT NULL: a finding belongs to a report or
    // it belongs nowhere. The generations are still recorded below.
    ctx.errors.push("lab_report_id_missing: report_patterns skipped");
  }

  try {
    const anonymizationId = await writeAnonymization(ctx, ins.payload, labReportId);
    out.anonymization_id = anonymizationId;

    // Catalogue + this report's results, for the pattern members.
    const catalog = new Map<string, string>();
    const resultByTest = new Map<string, string>();
    if (labReportId) {
      for (const row of await select<{ id: string; code: string }>(
        ctx,
        "lab_test_catalog?select=id,code&limit=500"
      )) {
        catalog.set(row.code.toLowerCase(), row.id);
      }
      for (const row of await select<{ id: string; lab_test_id: string | null }>(
        ctx,
        `test_results?select=id,lab_test_id&report_id=eq.${labReportId}&limit=200`
      )) {
        if (row.lab_test_id) resultByTest.set(row.lab_test_id, row.id);
      }
    }

    const sourceIds = new Map(
      (await select<{ id: string; code: string }>(ctx, "rag_sources?select=id,code")).map((r) => [
        r.code,
        r.id,
      ])
    );

    for (const p of ins.patterns) {
      // ---- this card's own retrieval --------------------------------------
      const { retrievalId, matchIds } = await writeRetrieval(ctx, p.retrieval);

      // ---- the generation that narrated this card -------------------------
      const g = p.generation;
      const generationId = await writeGeneration(ctx, {
        purpose: "pattern_insight",
        status:
          p.engine === "medgemma" ? "succeeded" : g?.error_code ? "failed" : "blocked",
        provider: g?.provider ?? (p.engine === "medgemma" ? opts.provider : "rules"),
        model: g?.model ?? p.model,
        modelVersion: g?.model ?? null,
        promptKey: ins.prompt_key,
        promptVersion: ins.prompt_version,
        systemSha: ins.system_prompt_sha256,
        temperature: opts.temperature,
        maxTokens: opts.maxTokens,
        anonymizationId,
        payload: ins.payload,
        retrievalId,
        language: ins.language,
        readingLevel: opts.readingLevel,
        rawOutput: g?.text ?? [p.explanation, p.risk].filter(Boolean).join("\n\n"),
        refusal: p.fallback_reason === "guard_replaced",
        safetyFlags: [
          ...p.safety_flags,
          ...(p.fallback_reason ? [`fallback:${p.fallback_reason}`] : []),
          `pattern:${p.id}`,
        ],
        modelConfidence: g?.model_confidence,
        retrievalSimilarity: p.retrieval?.mean_score,
        // The card's confidence is the RULE engine's, not the model's: the
        // detection decided it (spec §10.4). trust_score is the model-side
        // number when a generation happened.
        trustScore: p.trust_score ?? p.confidence_pct / 100,
        trustLevel: p.confidence_level,
        trustFormula: p.trust_formula,
        citationCount: p.retrieval?.match_count ?? (p.source ? 1 : 0),
        tokensPrompt: g?.tokens_prompt,
        tokensCompletion: g?.tokens_completion,
        latencyMs: g?.latency_ms ?? ins.latency_ms,
        errorCode: g?.error_code,
        errorMessage: g?.error_message ?? (g?.error_code ? "provider error" : undefined),
      });

      if (!labReportId) continue;

      // ---- the finding itself ---------------------------------------------
      const templateId = await ensureTemplate(ctx, p.id, p.title, p.disclaimer);
      if (!templateId) continue;

      let patternId: string | undefined;
      try {
        const row = await upsert(
          ctx,
          "report_patterns",
          {
            report_id: labReportId,
            template_id: templateId,
            // The rule engine found it; the model only wrote the words.
            detection: "rule",
            generation_id: generationId ?? null,
            rag_source_id: p.source ? (sourceIds.get(p.source.id) ?? null) : null,
            confidence_level: p.confidence_level,
            confidence_pct: p.confidence_pct,
            is_significant: true,
          },
          "report_id,template_id"
        );
        patternId = row?.id;
      } catch (err) {
        ctx.errors.push(msg(err, "report_patterns"));
      }
      if (!patternId) continue;
      out.pattern_ids?.push(patternId);

      // ---- its member tests -------------------------------------------------
      const members = p.nodes
        .map((n, i) => {
          const labTestId = catalog.get(n.test.toLowerCase());
          if (!labTestId) return null;
          return {
            report_pattern_id: patternId,
            lab_test_id: labTestId,
            test_result_id: resultByTest.get(labTestId) ?? null,
            direction: n.arrow,
            note_en: n.note,
            note_hi: ins.language === "hi" ? n.note : null,
            position: i,
          };
        })
        .filter(Boolean);
      if (members.length > 0) {
        try {
          await upsert(ctx, "report_pattern_members", members, "report_pattern_id,lab_test_id");
        } catch (err) {
          ctx.errors.push(msg(err, "report_pattern_members"));
        }
      }

      // ---- the narrative, filed against the finding -------------------------
      if (generationId) {
        const explanationId = await writeExplanation(ctx, {
          generationId,
          subject: { kind: "report_pattern", id: patternId },
          language: ins.language,
          level: opts.readingLevel,
          bodyMd: [p.explanation, p.risk].filter(Boolean).join("\n\n"),
          heading: p.title,
          disclaimer: p.disclaimer,
        });
        if (explanationId) {
          if (!out.explanation_id) out.explanation_id = explanationId;
          out.citation_count =
            (out.citation_count ?? 0) +
            (await writeCitations(ctx, explanationId, p.retrieval?.matches ?? [], matchIds));
        }
      }
    }

    if (ctx.errors.length > 0) out.errors = ctx.errors;
    return out;
  } catch (err) {
    ctx.errors.push(msg(err, "persistInsights"));
    return { ...out, errors: ctx.errors };
  }
}

// ---------------------------------------------------------------------------
// 4. Feedback + helpers
// ---------------------------------------------------------------------------

async function findSession(ctx: Ctx, sessionId: string) {
  const rows = await select<{ id: string }>(
    ctx,
    `voice_sessions?id=eq.${encodeURIComponent(sessionId)}&select=id&limit=1`
  );
  return rows[0] ?? null;
}

async function turnCount(ctx: Ctx, sessionId: string): Promise<number> {
  const rows = await select(
    ctx,
    `qa_messages?session_id=eq.${encodeURIComponent(sessionId)}&select=id`
  );
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
  const ctx = ctxFor(opts.db);
  if (!ctx) return { persisted: false, error: "persistence_disabled" };
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

/** Test seam: forget the cached corpus/template ids. */
export function resetPersistenceCaches() {
  corpusCache.clear();
  templateCache.clear();
}

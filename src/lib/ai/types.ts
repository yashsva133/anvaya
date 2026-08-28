// ---------------------------------------------------------------------------
// MedGemma AI backend — shared types.
//
// Field names deliberately mirror the columns of the Anvaya schema so a row in
// the database and an object in memory are the same shape:
//   anonymization_records  (db/migrations/0010_anonymization.sql)
//   rag_retrievals / rag_retrieval_matches / rag_chunks   (0011_rag.sql)
//   ai_generations / ai_explanations / explanation_citations (0012_ai.sql)
//   voice_sessions / qa_messages / answer_feedback        (0015_qa_voice.sql)
// ---------------------------------------------------------------------------

import type { LangCode, Status } from "@/lib/data";
import type { AnswerLang } from "./languages";

/**
 * Reading level for an answer.
 *
 * Kept in sync with the frontend's ReadingMode in src/lib/i18n.tsx, which is
 * "simple" | "advanced" (it was "standard" | "simple" | "very" before the
 * settings refactor). The schema's anvaya_reading_level enum accepts all four
 * spellings, so the two frontend generations both persist.
 */
export type ReadingLevel = "simple" | "advanced" | "standard" | "very";

/** anvaya_confidence_level — exactly the two badges the UI renders. */
export type ConfidenceLevel = "high" | "moderate";

/** anvaya_generation_purpose */
export type GenerationPurpose =
  | "test_explanation"
  | "pattern_insight"
  | "report_summary"
  | "qa_answer"
  | "translation";

/** A rule-engine-identified pattern, de-identified. `tests` lets a consumer
 *  tell whether the pattern is about the results it is discussing. */
export interface AnonymisedPattern {
  title: string;
  summary: string;
  tests: string[];
}

/** One de-identified test result. Values and units only — no identifiers. */
export interface AnonymisedResult {
  /** Catalogue code, e.g. "hemoglobin". Matches lab_test_catalog.code. */
  test: string;
  /** Patient-facing name in the answer language. */
  label: string;
  value: number;
  unit: string;
  /** Printed reference range as it appeared on the report. */
  ref_text: string;
  ref_low?: number;
  ref_high?: number;
  /**
   * Deterministic classification. Carried in from the report data; the model is
   * told to treat it as given. Per ANVAYA_DATABASE_SPEC.md §10.4 the LLM must
   * never be the source of truth for this value.
   */
  status: Status;
  /** False when no catalogue or printed reference bound was available. */
  status_known?: boolean;
  /** Previous report's value, when one exists — enables trend answers. */
  previous_value?: number;
  previous_date?: string;
}

/**
 * One test's movement across the reports on file — the de-identified trend the
 * overview summary is built from.
 *
 * Computed deterministically in anonymizer.ts from values the catalogue already
 * knows about, never by the model: per ANVAYA_DATABASE_SPEC.md §10.4 the LLM is
 * not allowed to be the source of truth for a direction or a status either.
 */
export interface AnonymisedTrend {
  test: string;
  label: string;
  unit: string;
  /** Oldest first. Each point is one earlier report that measured this test. */
  points: { date: string; value: number; status: Status }[];
  first_value: number;
  first_date: string;
  latest_value: number;
  latest_date: string;
  /** latest − first, rounded to two decimals. */
  change: number;
  /** Percent change from the first value, or undefined when first is 0. */
  change_pct?: number;
  direction: "up" | "down" | "flat";
  /** True when moving away from the reference range (or further outside it). */
  worsening: boolean;
  /** True when moving back towards, or into, the reference range. */
  improving: boolean;
  first_status: Status;
  latest_status: Status;
  /** False when the trend has no reference bound for clinical comparison. */
  status_known: boolean;
}

/**
 * The PII-free payload that is the ONLY thing sent to the model.
 * Mirrors anonymization_records: pseudonym, age_band (never a date of birth),
 * sex, plus retained test values. There is no field here that could hold a
 * name, phone number, report number or lab name.
 */
export interface AnonymisedPayload {
  /** Stand-in for the patient. A random uuid, carrying no meaning. */
  pseudonym: string;
  /** Age as a BAND, not a value, so the payload is not re-identifiable. */
  age_band: string;
  sex: "female" | "male" | "other" | "unspecified";
  /** Display date of the report under discussion. */
  report_date: string;
  results: AnonymisedResult[];
  /**
   * Movement of each test across the earlier reports on file, oldest first.
   * Empty when only one report exists.
   */
  trends: AnonymisedTrend[];
/** Plain-language description of a multi-test pattern, identifiers-free. */
  patterns: AnonymisedPattern[];
  removed_fields: string[];
  retained_fields: string[];
  input_version: string;
}

/** A grounded passage from rag_chunks. */
export interface RetrievedChunk {
  /** Stable identifier; rag_chunks.external_vector_id once a real index exists. */
  id: string;
  /** rag_sources.code — one of the five seeded ids. */
  source_code: string;
  source_title: string;
  publisher: string;
  url: string;
  heading: string;
  /** Public guideline text. Never patient data. */
  content: string;
  /** 0..1, matches rag_retrieval_matches.score numeric(6,5). */
  score: number;
  rank: number;
  matched_on: "keyword";
}

/** One retrieval event → rag_retrievals. */
export interface RetrievalResult {
  /** The ANONYMISED query, as stored in rag_retrievals.query_text. */
  query_text: string;
  query_intent: string;
  language: LangCode;
  engine: string;
  index_version: string;
  top_k: number;
  min_score: number;
  match_count: number;
  best_score: number;
  mean_score: number;
  latency_ms: number;
  matches: RetrievedChunk[];
}

/** What the model returned, plus how long it took. */
export interface GenerationOutput {
  text: string;
  model: string;
  provider: string;
  latency_ms: number;
  tokens_prompt?: number;
  tokens_completion?: number;
  /** Model's own confidence estimate, 0..1, when the provider supplies one. */
  model_confidence?: number;
  error_code?: string;
  error_message?: string;
}

/** Safety verdict for one answer. */
export interface GuardResult {
  /** True when the question itself was out of scope and never reached the model. */
  blocked_input: boolean;
  /** True when the model declined, or we replaced unsafe output. */
  refusal_detected: boolean;
  /** Machine-readable reasons — stored in ai_generations.safety_flags. */
  safety_flags: string[];
  /** Numbers in the answer that do not trace to the supplied payload. */
  ungrounded_numbers: string[];
  /** The text actually returned to the user (possibly a safe replacement). */
  final_text: string;
  /** 0..1 — the retrieval-similarity component of the trust score. */
  retrieval_similarity: number;
  /** 0..1 — trust_score as stored. */
  trust_score: number;
  /** The formula that produced it, recorded verbatim for auditability. */
  trust_formula: string;
  confidence: ConfidenceLevel;
}

/** The complete result of one /api/answer turn. */
export interface TranslationTrace {
  /** Name of the server-side translation adapter. */
  provider: string;
  /** Language the person requested for the answer. */
  target_language: AnswerLang;
  /** Whether the incoming question crossed the English model boundary. */
  input_translated: boolean;
  /** Whether the model's validated English answer was translated for display. */
  output_translated: boolean;
  /** Latency of the input translation, when one was needed. */
  input_latency_ms?: number;
  /** Latency of the output translation, when one was needed. */
  output_latency_ms?: number;
}

export interface AgentAnswer {
  /** Topic slug, mirroring the existing `matched` response field. */
  matched: string;
  answer: string;
  /** Count of grounding passages — the `sources` field the UI already shows. */
  sources: number;
  confidence: ConfidenceLevel;
  /** Additive: which path produced the answer. The current UI ignores it. */
  engine: "medgemma" | "mock" | "rules" | "fallback";
  /** The UI language the turn was made in. */
  language: LangCode;
  /**
   * The language the answer text is ACTUALLY written in. The English-boundary
   * bridge and localized deterministic fallbacks keep this equal to the
   * requested language; unsupported client values are normalized before here.
   */
  answer_lang: AnswerLang;
  /** Set when the requested answer language could not be honoured. */
  language_note?: string;
  /** How the English model boundary was crossed, when translation was enabled. */
  translation?: TranslationTrace;
  citations: {
    source_code: string;
    source_title: string;
    publisher: string;
    url: string;
    excerpt: string;
    score: number;
  }[];
  guard: GuardResult;
  retrieval?: RetrievalResult;
  generation?: GenerationOutput;
  payload: AnonymisedPayload;
  prompt_key: string;
  prompt_version: string;
  system_prompt_sha256: string;
  latency_ms: number;
  /** Ids written to Supabase, when persistence is configured. */
  persisted?: {
    session_id?: string;
    generation_id?: string;
    explanation_id?: string;
    qa_message_id?: string;
  };
}

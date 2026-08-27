// ---------------------------------------------------------------------------
// The chatbot agent — one /api/answer turn, end to end.
//
//   1. ANONYMIZE   PII-free payload (anonymization_records shape)
//   2. RETRIEVE    grounding passages (rag_retrievals shape)
//   3. ASSEMBLE    versioned system prompt + payload + passages
//   4. GENERATE    MedGemma over HTTP
//   5. GUARD       refusal / diagnosis / dosing / ungrounded numbers / trust
//   6. RETURN      the exact { matched, answer, sources, confidence } the UI
//                  already expects, plus additive provenance it can ignore.
//
// Persistence happens in the caller (see persistence.ts) because the caller
// owns the HTTP lifecycle and can afford to await the writes after responding.
// ---------------------------------------------------------------------------

import type { LangCode } from "@/lib/data";
import { loadAiEnv, type AiEnv } from "./env";
import { buildAnonymisedPayload } from "./anonymizer";
import type { ClientReport } from "./clientReport";
import { retrieve } from "./rag";
import { buildPrompt, type Channel } from "./prompts";
import { safeRedirect } from "./translations";
import { hasRuleText, type AnswerLang } from "./languages";
import {
  blockedGuardResult,
  guardInput,
  guardOutput,
  parseWeights,
} from "./guardrails";
import { createProvider, type ChatMessage, type Provider } from "./providers";
import { MockProvider, type MockContext } from "./mock";
import { matchRules } from "./rules";
import type {
  AgentAnswer,
  GenerationOutput,
  ReadingLevel,
  RetrievalResult,
} from "./types";

export interface AskOptions {
  question: string;
  lang: LangCode;
  readingLevel?: ReadingLevel;
  reportId?: string;
  /**
   * The user's OWN report, as validated by parseClientReport(). When present
   * the payload, the grounding numbers and the guardrail's allowed-number set
   * all come from this report instead of the seeded demo data — that is what
   * makes an answer personalized rather than about the fictional demo patient.
   */
  report?: ClientReport;
  /** Client-supplied conversation id; falls back to a generated one. */
  sessionId?: string;
  /** Reuse a caller-provided env (used by /api/ai/status and tests). */
  env?: AiEnv;
  /**
   * Language to ANSWER IN, which the voice agent sets from what the person
   * spoke. Independent of `lang` (the UI language): a person can use the app in
   * Hindi and ask a question in Tamil. Defaults to `lang`.
   */
  answerLang?: AnswerLang;
  /** "voice" turns get spoken formatting and are recorded as voice_sessions. */
  channel?: Channel;
  /** Extra safety_flags to record on this turn, e.g. the input-guard coverage note. */
  notes?: string[];
}

/**
 * In-process conversation memory.
 *
 * A Next.js route module is long-lived on a Node server but NOT on a serverless
 * deployment, so this is a convenience, not a store of record. The durable
 * history is voice_sessions + qa_messages in Postgres. Bounded so a long
 * conversation cannot grow the module's footprint without limit.
 */
interface Turn {
  role: "user" | "assistant";
  text: string;
}
const sessions = new Map<string, { turns: Turn[]; pseudonym: string; lastUsed: number }>();
const MAX_SESSIONS = 500;
const MAX_TURNS = 12;

function getSession(sessionId: string) {
  let s = sessions.get(sessionId);
  if (!s) {
    if (sessions.size >= MAX_SESSIONS) {
      // Evict the least recently used rather than refusing the turn.
      let oldest: string | null = null;
      let oldestAt = Infinity;
      for (const [k, v] of sessions) {
        if (v.lastUsed < oldestAt) {
          oldestAt = v.lastUsed;
          oldest = k;
        }
      }
      if (oldest) sessions.delete(oldest);
    }
    s = { turns: [], pseudonym: crypto.randomUUID(), lastUsed: Date.now() };
    sessions.set(sessionId, s);
  }
  s.lastUsed = Date.now();
  return s;
}

function remember(sessionId: string, role: "user" | "assistant", text: string) {
  const s = getSession(sessionId);
  s.turns.push({ role, text });
  if (s.turns.length > MAX_TURNS) s.turns.splice(0, s.turns.length - MAX_TURNS);
}

/** Stable pseudonym per conversation, so follow-ups refer to the same subject. */
export function sessionPseudonym(sessionId: string): string {
  return getSession(sessionId).pseudonym;
}

export function resetSessions() {
  sessions.clear();
}

function resolveProvider(env: AiEnv, ctx: MockContext): Provider | null {
  if (env.ai.provider === "mock") return new MockProvider(env.ai.model, ctx);
  return createProvider(env.ai);
}

function shapeAnswer(input: {
  matched: string;
  answer: string;
  engine: AgentAnswer["engine"];
  lang: LangCode;
  /** Language the answer text is actually written in. */
  answerLang: AnswerLang;
  /** Set when the requested language could not be honoured by the fallback. */
  languageNote?: string;
  retrieval?: RetrievalResult;
  generation?: GenerationOutput;
  guard: AgentAnswer["guard"];
  payload: AgentAnswer["payload"];
  promptKey: string;
  promptVersion: string;
  systemSha: string;
  startedAt: number;
}): AgentAnswer {
  const { retrieval, guard } = input;
  return {
    matched: input.matched,
    answer: input.answer,
    sources: retrieval?.match_count ?? 0,
    confidence: guard.confidence,
    engine: input.engine,
    language: input.lang,
    answer_lang: input.answerLang,
    language_note: input.languageNote,
    citations: (retrieval?.matches ?? []).map((m) => ({
      source_code: m.source_code,
      source_title: m.source_title,
      publisher: m.publisher,
      url: m.url,
      excerpt: m.content,
      score: m.score,
    })),
    guard,
    retrieval,
    generation: input.generation,
    payload: input.payload,
    prompt_key: input.promptKey,
    prompt_version: input.promptVersion,
    system_prompt_sha256: input.systemSha,
    latency_ms: Date.now() - input.startedAt,
  };
}

/**
 * Answer one question.
 *
 * Never throws: every failure mode resolves to a safe answer, because this is a
 * patient-facing health surface and an unhandled 500 in the chat is worse than
 * a conservative "please ask your doctor".
 */
export async function askAgent(opts: AskOptions): Promise<AgentAnswer> {
  const startedAt = Date.now();
  const env = opts.env ?? loadAiEnv();
  const lang: LangCode = opts.lang === "hi" ? "hi" : opts.lang === "bn" ? "bn" : "en";
  // The answer language is separate from the UI language: the voice agent sets
  // it from the language the person spoke, so a Hindi-chrome app can answer in
  // Tamil. Defaults to the UI language, which keeps text callers unchanged.
  const answerLang: AnswerLang = opts.answerLang ?? lang;
  const channel: Channel = opts.channel === "voice" ? "voice" : "text";
  const notes = opts.notes ?? [];
  const readingLevel = opts.readingLevel ?? "standard";
  const question = opts.question.trim();
  const sessionId = opts.sessionId ?? crypto.randomUUID();

  const payload = buildAnonymisedPayload({
    lang,
    reportId: opts.reportId,
    pseudonym: sessionPseudonym(sessionId),
    report: opts.report,
  });

  const prompt = buildPrompt({
    question,
    lang,
    answerLang,
    channel,
    readingLevel,
    payload,
    matches: [],
  });

  // ---- 1. Input guard: an unsafe question never reaches the model ----------
  const inputGuard = guardInput(question, answerLang);
  if (inputGuard.blocked) {
    const guard = blockedGuardResult(env.ai.trustFormula);
    guard.final_text = inputGuard.text;
    guard.safety_flags = [`input_blocked:${inputGuard.reason}`, ...notes];
    remember(sessionId, "user", question);
    remember(sessionId, "assistant", inputGuard.text);
    return shapeAnswer({
      matched: `blocked_${inputGuard.reason}`,
      answer: inputGuard.text,
      engine: "rules",
      lang,
      answerLang,
      guard,
      payload,
      promptKey: prompt.prompt_key,
      promptVersion: prompt.prompt_version,
      systemSha: prompt.system_prompt_sha256,
      startedAt,
    });
  }

  // ---- 2. Optional rules-first short circuit ------------------------------
  if (env.ai.rulesFirst) {
    const hit = matchRules(question);
    // The rule catalogue only exists in English and Hindi. Asking for a rule
    // answer in Tamil would hand back text the person cannot read, so the
    // short circuit is skipped and the turn goes to the model, which can.
    if (hit && hasRuleText(answerLang)) {
      const text = answerLang === "hi" ? hit.a.hi : hit.a.en;
      const guard = guardOutput({
        text,
        lang: answerLang,
        payload,
        retrievalSimilarity: 1,
        trustFormula: env.ai.trustFormula,
        weights: parseWeights(env.ai.trustFormula),
      });
      guard.safety_flags = [...guard.safety_flags, ...notes];
      remember(sessionId, "user", question);
      remember(sessionId, "assistant", guard.final_text);
      return shapeAnswer({
        matched: hit.matched,
        answer: guard.final_text,
        engine: "rules",
        lang,
        answerLang,
        guard,
        payload,
        promptKey: prompt.prompt_key,
        promptVersion: prompt.prompt_version,
        systemSha: prompt.system_prompt_sha256,
        startedAt,
      });
    }
  }

  // ---- 3. Retrieve grounding passages -------------------------------------
  let retrieval = retrieve({
    query: question,
    lang,
    topK: env.ai.topK,
    minScore: env.ai.minScore,
  });

  // Personalization: a question that names no test ("explain my report",
  // "what matters here?") retrieves nothing on its own. Fall back to the
  // topics of the abnormal results in THIS user's report, so even the generic
  // questions are grounded in passages about this person's flagged values.
  if (retrieval.match_count === 0) {
    const focus = payload.results
      .filter((r) => r.status !== "normal")
      .map((r) => r.test)
      .slice(0, 4);
    if (focus.length > 0) {
      retrieval = retrieve({
        query: question,
        lang,
        topK: env.ai.topK,
        minScore: env.ai.minScore,
        extraTopics: focus,
      });
    }
  }

  const fullPrompt = buildPrompt({
    question,
    lang,
    answerLang,
    channel,
    readingLevel,
    payload,
    matches: retrieval.matches,
    history: getSession(sessionId).turns,
  });

  // ---- 4. Generate --------------------------------------------------------
  const provider = resolveProvider(env, {
    payload,
    matches: retrieval.matches,
    patterns: payload.patterns,
    question,
    lang: answerLang,
  });

  if (!provider) {
    // No model configured — the deterministic rule answers keep the demo honest.
    return rulesFallback({
      question,
      lang,
      payload,
      retrieval,
      prompt,
      env,
      sessionId,
      startedAt,
      reason: "no_provider_configured",
      answerLang,
      channel,
      notes,
    });
  }

  const messages: ChatMessage[] = [
    { role: "system", content: fullPrompt.system },
    { role: "user", content: fullPrompt.user },
  ];

  const generation = await provider.generate({
    messages,
    temperature: env.ai.temperature,
    maxTokens: env.ai.maxTokens,
    timeoutMs: env.ai.timeoutMs,
  });

  if (generation.error_code || !generation.text.trim()) {
    return rulesFallback({
      question,
      lang,
      payload,
      retrieval,
      prompt,
      env,
      sessionId,
      startedAt,
      reason: generation.error_code ?? "empty_response",
      generation,
      answerLang,
      channel,
      notes,
    });
  }

  // ---- 5. Guard -----------------------------------------------------------
  const guard = guardOutput({
    text: generation.text,
    lang: answerLang,
    payload,
    retrievalSimilarity: retrieval.mean_score,
    modelConfidence: generation.model_confidence,
    trustFormula: env.ai.trustFormula,
    weights: parseWeights(env.ai.trustFormula),
  });
  guard.safety_flags = [...guard.safety_flags, ...notes];

  remember(sessionId, "user", question);
  remember(sessionId, "assistant", guard.final_text);

  return shapeAnswer({
    matched: retrieval.query_intent,
    answer: guard.final_text,
    engine: "medgemma",
    lang,
    answerLang,
    retrieval,
    generation,
    guard,
    payload,
    promptKey: fullPrompt.prompt_key,
    promptVersion: fullPrompt.prompt_version,
    systemSha: fullPrompt.system_prompt_sha256,
    startedAt,
  });
}

interface FallbackInput {
  question: string;
  lang: LangCode;
  /** Language the caller asked to be answered in. */
  answerLang: AnswerLang;
  channel: Channel;
  notes: string[];
  payload: AgentAnswer["payload"];
  retrieval: RetrievalResult;
  prompt: { prompt_key: string; prompt_version: string; system_prompt_sha256: string };
  env: AiEnv;
  sessionId: string;
  startedAt: number;
  reason: string;
  generation?: GenerationOutput;
}

/**
 * Deterministic fallback. Uses the same regex rules the prototype shipped with,
 * and if those miss too, a conservative redirect. The reason is recorded in
 * safety_flags so a run of fallbacks is visible in ai_generations rather than
 * looking like the model answered.
 */
function rulesFallback(input: FallbackInput): AgentAnswer {
  const { question, lang, answerLang, payload, retrieval, prompt, env, sessionId, startedAt } =
    input;
  const hit = matchRules(question);

  // The rule answers exist only in English and Hindi. A fallback for any other
  // language therefore cannot be delivered in that language, and pretending
  // otherwise would be worse than saying so: the closest reviewed text is used
  // and the substitution is recorded in safety_flags AND surfaced to the client
  // as `language_note`, so the UI can tell the person the answer came back in
  // English and offer the model-backed path.
  const ruleLang: "en" | "hi" = hasRuleText(answerLang) ? (answerLang as "en" | "hi") : "en";
  const substituted = ruleLang !== answerLang;
  const text = hit ? (ruleLang === "hi" ? hit.a.hi : hit.a.en) : safeRedirect(ruleLang);

  const guard = guardOutput({
    text,
    lang: ruleLang,
    payload,
    // Retrieval did run, but the answer did not come from the model, so the
    // trust score should not claim model agreement.
    retrievalSimilarity: 0,
    trustFormula: env.ai.trustFormula,
    weights: parseWeights(env.ai.trustFormula),
  });
  guard.safety_flags = [
    ...guard.safety_flags,
    `fallback:${input.reason}`,
    ...(substituted ? [`language_substituted:${answerLang}->${ruleLang}`] : []),
    ...input.notes,
  ];
  // A fallback is never presented as a high-confidence model answer.
  guard.confidence = "moderate";

  remember(sessionId, "user", question);
  remember(sessionId, "assistant", guard.final_text);

  return shapeAnswer({
    matched: hit ? hit.matched : "general",
    answer: guard.final_text,
    engine: hit ? "rules" : "fallback",
    lang,
    answerLang: ruleLang,
    languageNote: substituted
      ? `rule_answers_only_in_en_hi;requested_${answerLang}`
      : undefined,
    retrieval,
    generation: input.generation,
    guard,
    payload,
    promptKey: prompt.prompt_key,
    promptVersion: prompt.prompt_version,
    systemSha: prompt.system_prompt_sha256,
    startedAt,
  });
}

/** Live model status for /api/ai/status. */
export async function modelStatus(env: AiEnv = loadAiEnv()) {
  const pingPayload = buildAnonymisedPayload({ lang: "en" });
  const provider =
    env.ai.provider === "mock"
      ? new MockProvider(env.ai.model, {
          payload: pingPayload,
          matches: [],
          patterns: pingPayload.patterns,
          question: "ping",
          lang: "en",
        })
      : createProvider(env.ai);

  if (!provider) {
    return { reachable: false, detail: "no provider configured (AI_PROVIDER unset)" };
  }
  const ping = await provider.ping();
  return { reachable: ping.ok, detail: ping.detail ?? (ping.ok ? "ok" : "unreachable") };
}

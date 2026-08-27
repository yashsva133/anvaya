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
import { retrieve } from "./rag";
import { buildPrompt, SAFE_REDIRECT } from "./prompts";
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
  /** Client-supplied conversation id; falls back to a generated one. */
  sessionId?: string;
  /** Reuse a caller-provided env (used by /api/ai/status and tests). */
  env?: AiEnv;
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
  const readingLevel = opts.readingLevel ?? "standard";
  const question = opts.question.trim();
  const sessionId = opts.sessionId ?? crypto.randomUUID();

  const payload = buildAnonymisedPayload({
    lang,
    reportId: opts.reportId,
    pseudonym: sessionPseudonym(sessionId),
  });

  const prompt = buildPrompt({
    question,
    lang,
    readingLevel,
    payload,
    matches: [],
  });

  // ---- 1. Input guard: an unsafe question never reaches the model ----------
  const inputGuard = guardInput(question, lang);
  if (inputGuard.blocked) {
    const guard = blockedGuardResult(env.ai.trustFormula);
    guard.final_text = inputGuard.text;
    guard.safety_flags = [`input_blocked:${inputGuard.reason}`];
    remember(sessionId, "user", question);
    remember(sessionId, "assistant", inputGuard.text);
    return shapeAnswer({
      matched: `blocked_${inputGuard.reason}`,
      answer: inputGuard.text,
      engine: "rules",
      lang,
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
    if (hit) {
      const text = lang === "hi" ? hit.a.hi : hit.a.en;
      const guard = guardOutput({
        text,
        lang,
        payload,
        retrievalSimilarity: 1,
        trustFormula: env.ai.trustFormula,
        weights: parseWeights(env.ai.trustFormula),
      });
      remember(sessionId, "user", question);
      remember(sessionId, "assistant", guard.final_text);
      return shapeAnswer({
        matched: hit.matched,
        answer: guard.final_text,
        engine: "rules",
        lang,
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
  const retrieval = retrieve({
    query: question,
    lang,
    topK: env.ai.topK,
    minScore: env.ai.minScore,
  });

  const fullPrompt = buildPrompt({
    question,
    lang,
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
    lang: lang === "hi" ? "hi" : "en",
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
    });
  }

  // ---- 5. Guard -----------------------------------------------------------
  const guard = guardOutput({
    text: generation.text,
    lang,
    payload,
    retrievalSimilarity: retrieval.mean_score,
    modelConfidence: generation.model_confidence,
    trustFormula: env.ai.trustFormula,
    weights: parseWeights(env.ai.trustFormula),
  });

  remember(sessionId, "user", question);
  remember(sessionId, "assistant", guard.final_text);

  return shapeAnswer({
    matched: retrieval.query_intent,
    answer: guard.final_text,
    engine: "medgemma",
    lang,
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
  const { question, lang, payload, retrieval, prompt, env, sessionId, startedAt } = input;
  const hit = matchRules(question);
  const l2 = lang === "hi" ? "hi" : "en";
  const text = hit ? (lang === "hi" ? hit.a.hi : hit.a.en) : SAFE_REDIRECT[l2];

  const guard = guardOutput({
    text,
    lang,
    payload,
    // Retrieval did run, but the answer did not come from the model, so the
    // trust score should not claim model agreement.
    retrievalSimilarity: 0,
    trustFormula: env.ai.trustFormula,
    weights: parseWeights(env.ai.trustFormula),
  });
  guard.safety_flags = [...guard.safety_flags, `fallback:${input.reason}`];
  // A fallback is never presented as a high-confidence model answer.
  guard.confidence = "moderate";

  remember(sessionId, "user", question);
  remember(sessionId, "assistant", guard.final_text);

  return shapeAnswer({
    matched: hit ? hit.matched : "general",
    answer: guard.final_text,
    engine: hit ? "rules" : "fallback",
    lang,
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

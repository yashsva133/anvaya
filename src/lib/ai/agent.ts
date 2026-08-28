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
import {
  emergencyText,
  safeRedirect,
  safetyFooter,
  STANDARD_SAFETY_FOOTER,
} from "./translations";
import {
  detectConversation,
  conversationText,
  noReportText,
  outOfScopeText,
  translationFailureText,
} from "./conversation";
import {
  detectLangFromText,
  isAnswerLang,
  languageOf,
  type AnswerLang,
} from "./languages";
import { createTranslator, protectTokens, TranslationError, type Translator } from "./translate";
import {
  blockedGuardResult,
  guardInput,
  guardOutput,
  parseWeights,
  ungroundedNumbers,
} from "./guardrails";
import { createProvider, type ChatMessage, type Provider } from "./providers";
import { MockProvider, composeMockAnswer, type MockContext } from "./mock";
import { matchRules } from "./rules";
import type {
  AgentAnswer,
  GenerationOutput,
  ReadingLevel,
  RetrievalResult,
  TranslationTrace,
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
  /** Optional conversation history for context-aware generation. */
  history?: { role: "user" | "assistant"; text: string }[];
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

/** Only report/result turns are allowed to receive patient report context. */
export function isReportRelatedQuestion(question: string): boolean {
  return /(?:\breport\b|\bresult\b|\blab\b|\blaboratory\b|\btest\b|\bvalue\b|\breading\b|\brange\b|\bhemoglobin\b|\bhaemoglobin\b|\bhba1c\b|\ba1c\b|\bglucose\b|\bsugar\b|\bcholesterol\b|\blipid\b|\bldl\b|\bhdl\b|\btriglyceride\b|\bcreatinine\b|\bmc[vh]\b|\bplatelet\b|\bwhite blood\b|\bcbc\b|\banaemia\b|\banemia\b|\bdiabetes\b|\bmy blood\b|\bmy health\b|\bwhat matters\b|\bexplain this\b|\bexplain my\b|\bwhat should i ask\b|\bdoctor\b|रिपोर्ट|नतीजा|परिणाम|जाँच|जांच|हीमोग्लोबिन|शुगर|कोलेस्ट्रॉल|रक्त|ফলাফল|রিপোর্ট|அறிக்கை|முடிவு|నివేదిక|ఫలితం|रिपोर्ट|निकाल|અહેવાલ|પરિણામ|ವರದಿ|ಫಲಿತಾಂಶ|റിപ്പോർട്ട്|ഫലം|ਰਿਪੋਰਟ|ਨਤੀਜਾ|رپورٹ|نتیجہ|ଓଡ଼ିଆ|ଫଳାଫળ|ଫଳାଫଳ|ৰিপৰ্ট|ফলাফল|হিমোগ্লোবিন|சோதனை|அறிக்கை|ஹீமோகுளோபின்|சர்க்கரை|రక్త పరీక్ష|హిమోగ్లోబిన్|చక్కెర|हिमोग्लोबिन|रक्त तपासणी|साखर|હિમોગ્લોબિન|રક્ત પરીક્ષણ|ખાંડ|ಹಿಮೋಗ್ಲೋಬಿನ್|ರಕ್ತ ಪರೀಕ್ಷೆ|ಸಕ್ಕರೆ|ഹീമോഗ്ലോബിൻ|രക്തപരിശോധന|പഞ്ചസാര|ਹੀਮੋਗਲੋਬਿਨ|ਖੂਨ ਦੀ ਜਾਂਚ|ਸ਼ੂਗਰ|ہیموگلوبن|خون کا ٹیسٹ|شوگر|ହିମୋଗ୍ଲୋବିନ|ରକ୍ତ ପରୀକ୍ଷା|ଚିନି|হিমোগ্লোবিন|ৰক্ত পৰীক্ষা|চেনি|हिमोग्लोबिन|रगत परीक्षण|चिनी)/iu.test(
    question
  );
}

function translationTokens(text: string, payload: AgentAnswer["payload"]): string[] {
  const numbers = text.match(/\b\d+(?:[.,]\d+)?(?:\s*[–—-]\s*\d+(?:[.,]\d+)?)?\s*%?/g) ?? [];
  const lowerText = text.toLocaleLowerCase();
  const catalogueTokens = payload.results.flatMap((result) =>
    [result.test, result.label, result.unit, result.ref_text].flatMap((token) => {
      if (!token) return [];
      const start =
        token.length <= 1
          ? text.indexOf(token)
          : lowerText.indexOf(token.toLocaleLowerCase());
      return start >= 0 ? [text.slice(start, start + token.length)] : [];
    })
  );
  return [...numbers, ...catalogueTokens];
}

function translationProviderName(env: AiEnv): string {
  return env.translation?.provider === "google" && env.translation.apiKey
    ? "google-cloud-translation"
    : "none";
}

function targetScriptPresent(text: string, target: AnswerLang): boolean {
  const script = languageOf(target).script;
  if (!script) return true;
  let count = 0;
  for (const ch of text) {
    const codePoint = ch.codePointAt(0);
    if (codePoint !== undefined && codePoint >= script.from && codePoint <= script.to) count += 1;
  }
  return count >= 2;
}

/** Translate while preserving report tokens and rejecting an English drift. */
async function translateSafely(
  translator: Translator,
  text: string,
  source: "auto" | AnswerLang,
  target: AnswerLang,
  payload: AgentAnswer["payload"]
) {
  if (target === "en" && source === "en") return { text, latency_ms: 0, provider: "none" };

  // The model is required to close with this exact English line. Masking it
  // makes the disclaimer itself part of the protected-token contract; after a
  // successful round trip it is replaced with the reviewed target-language
  // wording. A provider that drops the line is rejected and the deterministic
  // localized fallback takes over.
  const safetyTokens =
    source === "en" && text.includes(STANDARD_SAFETY_FOOTER) ? [STANDARD_SAFETY_FOOTER] : [];
  const protectedText = protectTokens(text, [...translationTokens(text, payload), ...safetyTokens]);
  const translated = await translator.translate({
    text: protectedText.masked,
    source,
    target,
  });
  const restored = protectedText.restore(translated.text);
  if (restored.missing.length > 0 || protectedText.markers.some((m) => restored.text.includes(m))) {
    throw new TranslationError(
      "protected_token_loss",
      `Translation changed protected medical token(s): ${restored.missing.slice(0, 4).join(", ")}`
    );
  }

  let output = restored.text;
  if (safetyTokens.length > 0) {
    if (!output.includes(STANDARD_SAFETY_FOOTER)) {
      throw new TranslationError("safety_footer_loss", "Translation dropped the required safety closing line");
    }
    output = output.split(STANDARD_SAFETY_FOOTER).join(safetyFooter(target));
  }

  // A compatible translation gateway must not introduce a new clinical number.
  // Existing values/ranges were masked above; this catches any additional
  // numeric claim the gateway may have hallucinated or appended.
  if (source !== "auto") {
    const addedNumbers = ungroundedNumbers(output, payload);
    if (addedNumbers.length > 0) {
      throw new TranslationError(
        "ungrounded_numbers",
        `Translation introduced ungrounded number(s): ${addedNumbers.slice(0, 4).join(", ")}`
      );
    }
  }
  if (!targetScriptPresent(output, target)) {
    throw new TranslationError("language_validation", `Translation did not contain ${target} script`);
  }
  return { text: output, latency_ms: translated.latency_ms, provider: translated.provider };
}

function localAnswer(args: {
  text: string;
  question: string;
  matched: string;
  answerLang: AnswerLang;
  lang: LangCode;
  payload: AgentAnswer["payload"];
  prompt: { prompt_key: string; prompt_version: string; system_prompt_sha256: string };
  env: AiEnv;
  sessionId: string;
  startedAt: number;
  notes: string[];
  engine?: AgentAnswer["engine"];
  retrieval?: RetrievalResult;
  generation?: GenerationOutput;
  languageNote?: string;
  translation?: TranslationTrace;
}): AgentAnswer {
  const guard = guardOutput({
    text: args.text,
    lang: args.answerLang,
    payload: args.payload,
    retrievalSimilarity: 1,
    trustFormula: args.env.ai.trustFormula,
    weights: parseWeights(args.env.ai.trustFormula),
    guardLanguage: "curated",
  });
  guard.safety_flags = [...guard.safety_flags, ...args.notes];
  remember(args.sessionId, "user", args.question);
  remember(args.sessionId, "assistant", guard.final_text);
  return shapeAnswer({
    matched: args.matched,
    answer: guard.final_text,
    engine: args.engine ?? "rules",
    lang: args.lang,
    answerLang: args.answerLang,
    languageNote: args.languageNote,
    translation: args.translation,
    retrieval: args.retrieval,
    generation: args.generation,
    guard,
    payload: args.payload,
    promptKey: args.prompt.prompt_key,
    promptVersion: args.prompt.prompt_version,
    systemSha: args.prompt.system_prompt_sha256,
    startedAt: args.startedAt,
  });
}

function localMultilingualReportAnswer(args: {
  question: string;
  lang: LangCode;
  answerLang: AnswerLang;
  payload: AgentAnswer["payload"];
  prompt: { prompt_key: string; prompt_version: string; system_prompt_sha256: string };
  env: AiEnv;
  sessionId: string;
  startedAt: number;
  notes: string[];
  reason: string;
  retrieval?: RetrievalResult;
  inputTranslated?: boolean;
  inputLatencyMs?: number;
}): AgentAnswer {
  const text = composeMockAnswer({
    payload: args.payload,
    matches: args.retrieval?.matches ?? [],
    patterns: args.payload.patterns,
    question: args.question,
    lang: args.answerLang,
  });
  return localAnswer({
    text,
    question: args.question,
    matched: "report_fallback",
    answerLang: args.answerLang,
    lang: args.lang,
    payload: args.payload,
    prompt: args.prompt,
    env: args.env,
    sessionId: args.sessionId,
    startedAt: args.startedAt,
    notes: [
      ...args.notes,
      `fallback:multilingual_report_summary:${args.reason}`,
    ],
    engine: "fallback",
    retrieval: args.retrieval,
    translation: {
      provider: translationProviderName(args.env),
      target_language: args.answerLang,
      input_translated: Boolean(args.inputTranslated),
      output_translated: false,
      ...(args.inputLatencyMs !== undefined ? { input_latency_ms: args.inputLatencyMs } : {}),
    },
  });
}

function translationFailureAnswer(args: {
  question: string;
  lang: LangCode;
  answerLang: AnswerLang;
  payload: AgentAnswer["payload"];
  prompt: { prompt_key: string; prompt_version: string; system_prompt_sha256: string };
  env: AiEnv;
  sessionId: string;
  startedAt: number;
  notes: string[];
  reason: string;
  retrieval?: RetrievalResult;
  generation?: GenerationOutput;
  inputTranslated?: boolean;
  inputLatencyMs?: number;
}): AgentAnswer {
  const answer = localAnswer({
    text: translationFailureText(args.answerLang),
    question: args.question,
    matched: "translation_failure",
    answerLang: args.answerLang,
    lang: args.lang,
    payload: args.payload,
    prompt: args.prompt,
    env: args.env,
    sessionId: args.sessionId,
    startedAt: args.startedAt,
    notes: [...args.notes, `translation_failure:${args.reason}`],
    engine: "fallback",
    retrieval: args.retrieval,
    generation: args.generation,
    languageNote: `translation_unavailable:${args.reason}`,
    translation: {
      provider: translationProviderName(args.env),
      target_language: args.answerLang,
      input_translated: Boolean(args.inputTranslated),
      output_translated: false,
      ...(args.inputLatencyMs !== undefined ? { input_latency_ms: args.inputLatencyMs } : {}),
    },
  });
  answer.confidence = "moderate";
  answer.guard.confidence = "moderate";
  return answer;
}

/** Keep the patient-facing safety close even if a model ignores the format. */
function ensureSafetyFooter(text: string): string {
  const trimmed = text.trim();
  return trimmed.endsWith(STANDARD_SAFETY_FOOTER)
    ? trimmed
    : `${trimmed}\n\n${STANDARD_SAFETY_FOOTER}`;
}

/** Screen English model text first, then translate only the screened answer. */
async function finishEnglishAnswer(args: {
  englishText: string;
  question: string;
  matched: string;
  lang: LangCode;
  answerLang: AnswerLang;
  payload: AgentAnswer["payload"];
  prompt: { prompt_key: string; prompt_version: string; system_prompt_sha256: string };
  env: AiEnv;
  translator: Translator | null;
  sessionId: string;
  startedAt: number;
  notes: string[];
  engine: AgentAnswer["engine"];
  retrieval?: RetrievalResult;
  generation?: GenerationOutput;
  inputTranslated: boolean;
  inputLatencyMs?: number;
}): Promise<AgentAnswer> {
  const guard = guardOutput({
    text: ensureSafetyFooter(args.englishText),
    lang: "en",
    payload: args.payload,
    retrievalSimilarity: args.retrieval?.mean_score ?? 1,
    modelConfidence: args.generation?.model_confidence,
    trustFormula: args.env.ai.trustFormula,
    weights: parseWeights(args.env.ai.trustFormula),
  });
  guard.safety_flags = [...guard.safety_flags, ...args.notes];
  const responseEngine: AgentAnswer["engine"] = guard.refusal_detected ? "fallback" : args.engine;

  // A refusal is never sent through an unreviewed translation path. The
  // localized application copy is the safe replacement for every supported
  // language, and the original model guard decision is retained for audit.
  const localizedRefusal = (): AgentAnswer => {
    const out = localAnswer({
      text: safeRedirect(args.answerLang),
      question: args.question,
      matched: "safety_fallback",
      answerLang: args.answerLang,
      lang: args.lang,
      payload: args.payload,
      prompt: args.prompt,
      env: args.env,
      sessionId: args.sessionId,
      startedAt: args.startedAt,
      notes: [...args.notes, ...guard.safety_flags, "guard_refusal_localized"],
      engine: "fallback",
      retrieval: args.retrieval,
      generation: args.generation,
      translation: {
        provider: "none",
        target_language: args.answerLang,
        input_translated: args.inputTranslated,
        output_translated: false,
        ...(args.inputLatencyMs !== undefined ? { input_latency_ms: args.inputLatencyMs } : {}),
      },
    });
    out.guard.refusal_detected = true;
    out.guard.safety_flags = [...new Set([...guard.safety_flags, ...out.guard.safety_flags])];
    out.guard.ungrounded_numbers = guard.ungrounded_numbers;
    out.guard.retrieval_similarity = guard.retrieval_similarity;
    out.guard.trust_score = guard.trust_score;
    out.guard.trust_formula = guard.trust_formula;
    out.guard.confidence = guard.confidence;
    out.confidence = guard.confidence;
    return out;
  };

  if (args.answerLang === "en") {
    remember(args.sessionId, "user", args.question);
    remember(args.sessionId, "assistant", guard.final_text);
    return shapeAnswer({
      matched: args.matched,
      answer: guard.final_text,
      engine: responseEngine,
      lang: args.lang,
      answerLang: "en",
      retrieval: args.retrieval,
      generation: args.generation,
      guard,
      payload: args.payload,
      promptKey: args.prompt.prompt_key,
      promptVersion: args.prompt.prompt_version,
      systemSha: args.prompt.system_prompt_sha256,
      startedAt: args.startedAt,
    });
  }

  if (guard.refusal_detected) return localizedRefusal();

  if (!args.translator) {
    return localMultilingualReportAnswer({
      question: args.question,
      lang: args.lang,
      answerLang: args.answerLang,
      payload: args.payload,
      prompt: args.prompt,
      env: args.env,
      sessionId: args.sessionId,
      startedAt: args.startedAt,
      notes: args.notes,
      reason: "translation_not_configured",
      retrieval: args.retrieval,
      inputTranslated: args.inputTranslated,
      inputLatencyMs: args.inputLatencyMs,
    });
  }

  try {
    const translated = await translateSafely(
      args.translator,
      guard.final_text,
      "en",
      args.answerLang,
      args.payload
    );
    const translatedSafety = guardOutput({
      text: translated.text,
      lang: args.answerLang,
      payload: args.payload,
      retrievalSimilarity: args.retrieval?.mean_score ?? 1,
      trustFormula: args.env.ai.trustFormula,
      weights: parseWeights(args.env.ai.trustFormula),
    });
    if (translatedSafety.refusal_detected) {
      throw new TranslationError(
        "translated_safety_violation",
        "Translated output did not pass the response safety screen"
      );
    }

    const translation: TranslationTrace = {
      provider: translated.provider,
      target_language: args.answerLang,
      input_translated: args.inputTranslated,
      output_translated: true,
      ...(args.inputLatencyMs !== undefined ? { input_latency_ms: args.inputLatencyMs } : {}),
      output_latency_ms: translated.latency_ms,
    };
    // Guard decisions were made against the English model boundary. The final
    // text is replaced with the validated translation for both the response and
    // the audit record, while the original flags remain intact.
    guard.final_text = translated.text;
    guard.safety_flags = [...guard.safety_flags, "translation_output_validated"];
    remember(args.sessionId, "user", args.question);
    remember(args.sessionId, "assistant", translated.text);
    return shapeAnswer({
      matched: args.matched,
      answer: translated.text,
      engine: responseEngine,
      lang: args.lang,
      answerLang: args.answerLang,
      languageNote: undefined,
      translation,
      retrieval: args.retrieval,
      generation: args.generation,
      guard,
      payload: args.payload,
      promptKey: args.prompt.prompt_key,
      promptVersion: args.prompt.prompt_version,
      systemSha: args.prompt.system_prompt_sha256,
      startedAt: args.startedAt,
    });
  } catch (error) {
    const reason = error instanceof TranslationError ? error.code : "provider_error";
    return localMultilingualReportAnswer({
      question: args.question,
      lang: args.lang,
      answerLang: args.answerLang,
      payload: args.payload,
      prompt: args.prompt,
      env: args.env,
      sessionId: args.sessionId,
      startedAt: args.startedAt,
      notes: args.notes,
      reason,
      retrieval: args.retrieval,
      inputTranslated: args.inputTranslated,
      inputLatencyMs: args.inputLatencyMs,
    });
  }
}

function reportFallbackText(question: string, payload: AgentAnswer["payload"]): { text: string; matched: string } {
  const q = question.toLowerCase();
  const result = payload.results.find((item) =>
    [item.test, item.label].some((name) => name && q.includes(name.toLowerCase()))
  );
  const statusText: Record<string, string> = {
    normal: "within the printed reference range",
    borderline: "near the edge of the printed reference range",
    high: "above the printed reference range",
    low: "below the printed reference range",
    critical: "well outside the printed reference range",
  };
  if (result) {
    const detail =
      result.status_known === false
        ? `Your ${result.label} result is **${result.value} ${result.unit}**. No reference range was reported for this test, so the app cannot classify it.`
        : `Your ${result.label} result is **${result.value} ${result.unit}**, ${statusText[result.status]}. The reference range printed for this test is **${result.ref_text}**.`;
    return {
      matched: result.test,
      text: `${detail} This result should be understood together with your symptoms and other tests by your doctor.\n\nThis is not a diagnosis. Please discuss these results with your doctor.`,
    };
  }

  const assessed = payload.results.filter((item) => item.status_known !== false);
  const unassessed = payload.results.filter((item) => item.status_known === false);
  const flagged = assessed.filter((item) => item.status !== "normal").slice(0, 4);
  const lines = flagged.map(
    (item) => `- **${item.label}: ${item.value} ${item.unit}** — ${statusText[item.status]}.`
  );
  const normal = assessed.filter((item) => item.status === "normal").length;
  const unknownLine = unassessed.length
    ? ` ${unassessed.length} result${unassessed.length === 1 ? " has" : "s have"} no reported reference range and cannot be classified here.`
    : "";
  const body = lines.length
    ? `The results that need the most attention are:\n${lines.join("\n")}\n\nThere are ${normal} result${normal === 1 ? "" : "s"} within the printed range.${unknownLine} Ask your doctor how these findings fit together.`
    : unassessed.length
      ? `Your report contains ${payload.results.length} recorded result${payload.results.length === 1 ? "" : "s"}.${unknownLine} Ask your doctor to interpret them in your full clinical context.`
      : `Your report contains ${payload.results.length} result${payload.results.length === 1 ? "" : "s"}. They are within the printed reference ranges used here. Ask your doctor to interpret them in your full clinical context.`;
  return {
    matched: "report",
    text: `${body}\n\nThis is not a diagnosis. Please discuss these results with your doctor.`,
  };
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
  translation?: TranslationTrace;
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
    translation: input.translation,
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
  const answerLang: AnswerLang = isAnswerLang(opts.answerLang) ? opts.answerLang : lang;
  const channel: Channel = opts.channel === "voice" ? "voice" : "text";
  const notes = [...(opts.notes ?? [])];
  const readingLevel = opts.readingLevel ?? "standard";
  const question = opts.question.trim();
  const sessionId = opts.sessionId ?? crypto.randomUUID();
  const conversation = detectConversation(question);
  const inputLanguage = detectLangFromText(question, "en");
  const hasReport = Boolean(opts.report?.results?.length);

  // Keep the first prompt report-free. This is used for blocked, social, and
  // no-report turns before we have decided whether the question needs medical
  // context at all.
  const emptyPayload = buildAnonymisedPayload({
    lang: "en",
    pseudonym: sessionPseudonym(sessionId),
  });
  let promptPayload = emptyPayload;
  const makePrompt = (modelQuestion: string) =>
    buildPrompt({
      question: modelQuestion,
      // The model always works in English. `answerLang` here is deliberately
      // English; translation metadata is returned separately.
      lang: "en",
      answerLang: "en",
      channel,
      readingLevel,
      payload: promptPayload,
      matches: [],
      history: opts.history,
    });
  const initialPrompt = makePrompt(question);

  // Input guard runs before translation, so a known unsafe request never leaves
  // the server. The translated-English guard below catches unsafe wording that
  // is not covered by the original-script keyword set.
  const inputGuard = guardInput(question, answerLang, inputLanguage);
  if (!inputGuard.blocked && inputGuard.note) notes.push(inputGuard.note);

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
      payload: emptyPayload,
      promptKey: initialPrompt.prompt_key,
      promptVersion: initialPrompt.prompt_version,
      systemSha: initialPrompt.system_prompt_sha256,
      startedAt,
    });
  }

  // Small talk and greetings are now passed directly to MedGemma, 
  // letting it act as a natural companion.

  const translator = createTranslator(env.translation);
  let modelQuestion = question;
  let inputTranslated = false;
  let inputLatencyMs: number | undefined;
  let reportQuestion = isReportRelatedQuestion(question);
  const clearInputCoverageNote = () => {
    for (let i = notes.length - 1; i >= 0; i--) {
      if (notes[i].startsWith("input_guard_language_uncovered:")) notes.splice(i, 1);
    }
  };

  // Even without a report, translate a non-English turn in a report-free
  // payload before returning no-report copy. This lets the reviewed English
  // input guard catch diagnosis/dosing wording without ever sending patient
  // context to the translator or model.
  if (!hasReport && inputLanguage !== "en" && translator) {
    try {
      const classified = await translateSafely(translator, question, "auto", "en", emptyPayload);
      modelQuestion = classified.text;
      inputTranslated = true;
      inputLatencyMs = classified.latency_ms;
      clearInputCoverageNote();
      const translatedGuard = guardInput(modelQuestion, "en");
      if (translatedGuard.blocked) {
        const safeText =
          translatedGuard.reason === "emergency" ? emergencyText(answerLang) : safeRedirect(answerLang);
        return localAnswer({
          text: safeText,
          question,
          matched: `blocked_${translatedGuard.reason}`,
          answerLang,
          lang,
          payload: emptyPayload,
          prompt: makePrompt(modelQuestion),
          env,
          sessionId,
          startedAt,
          notes: [...notes, `translated_input_blocked:${translatedGuard.reason}`],
          engine: "rules",
          translation: {
            provider: translator.name,
            target_language: answerLang,
            input_translated: true,
            output_translated: false,
            ...(inputLatencyMs !== undefined ? { input_latency_ms: inputLatencyMs } : {}),
          },
        });
      }
      const translatedConversation = detectConversation(modelQuestion);
      if (translatedConversation) {
        return localAnswer({
          text: conversationText(translatedConversation, answerLang),
          question,
          matched: `conversation_${translatedConversation}`,
          answerLang,
          lang,
          payload: emptyPayload,
          prompt: makePrompt(modelQuestion),
          env,
          sessionId,
          startedAt,
          notes,
          engine: "rules",
          translation: {
            provider: translator.name,
            target_language: answerLang,
            input_translated: true,
            output_translated: false,
            ...(inputLatencyMs !== undefined ? { input_latency_ms: inputLatencyMs } : {}),
          },
        });
      }
    } catch {
      notes.push("input_language_classification_failed");
    }
  }

  if (!hasReport) {
    return localAnswer({
      text: noReportText(answerLang),
      question,
      matched: "no_report",
      answerLang,
      lang,
      payload: emptyPayload,
      prompt: initialPrompt,
      env,
      sessionId,
      startedAt,
      notes,
      engine: "rules",
    });
  }

  // A non-English question cannot always be classified by a keyword list. Use
  // the server-side translator only for classification first, without sending
  // report context; this prevents an ordinary Tamil or Hindi question from
  // receiving the user's laboratory values merely because it is non-English.
  if (!reportQuestion && inputLanguage !== "en" && translator) {
    try {
      const classified = await translateSafely(translator, question, "auto", "en", emptyPayload);
      modelQuestion = classified.text;
      inputTranslated = true;
      inputLatencyMs = classified.latency_ms;
      clearInputCoverageNote();
      reportQuestion = isReportRelatedQuestion(modelQuestion);
    } catch {
      notes.push("input_language_classification_failed");
    }
  }

  // Screen the translated wording too, before deciding whether it is report
  // related. A Tamil emergency/diagnosis request may not match the original
  // keyword list, and translation can reveal the safety-critical meaning even
  // when the translated sentence contains no report keyword.
  const translatedGuard = inputTranslated ? guardInput(modelQuestion, "en") : null;
  if (translatedGuard?.blocked) {
    const safeText =
      translatedGuard.reason === "emergency" ? emergencyText(answerLang) : safeRedirect(answerLang);
    return localAnswer({
      text: safeText,
      question,
      matched: `blocked_${translatedGuard.reason}`,
      answerLang,
      lang,
      payload: emptyPayload,
      prompt: makePrompt(modelQuestion),
      env,
      sessionId,
      startedAt,
      notes: [...notes, `translated_input_blocked:${translatedGuard.reason}`],
      engine: "rules",
      translation: {
        provider: translator?.name ?? "none",
        target_language: answerLang,
        input_translated: true,
        output_translated: false,
        ...(inputLatencyMs !== undefined ? { input_latency_ms: inputLatencyMs } : {}),
      },
    });
  }

  // A translated social turn should stay social even when the original script
  // was not in the small local conversation phrasebook. MedGemma handles it.

  // The LLM now naturally handles small talk using the history and medical prompt.

  // Only report-related turns receive the user's de-identified report payload.
  promptPayload = buildAnonymisedPayload({
    lang: "en",
    pseudonym: sessionPseudonym(sessionId),
    report: opts.report,
  });
  const payload = promptPayload;

  // Translate a report question into English for MedGemma. If the classifier
  // already translated it, reuse that result rather than making a second call.
  if (inputLanguage !== "en" && !inputTranslated) {
    if (!translator) {
      // Allow local model to handle multilingual input natively instead of falling back
      console.log("[AGENT] No translation API configured; passing multilingual input natively to LLM.");
    } else {
    try {
      const translatedQuestion = await translateSafely(translator, question, "auto", "en", payload);
      modelQuestion = translatedQuestion.text;
      inputTranslated = true;
      inputLatencyMs = translatedQuestion.latency_ms;
      clearInputCoverageNote();
      const translatedInputGuard = guardInput(modelQuestion, "en");
      if (translatedInputGuard.blocked) {
        const safeText =
          translatedInputGuard.reason === "emergency" ? emergencyText(answerLang) : safeRedirect(answerLang);
        return localAnswer({
          text: safeText,
          question,
          matched: `blocked_${translatedInputGuard.reason}`,
          answerLang,
          lang,
          payload: emptyPayload,
          prompt: makePrompt(modelQuestion),
          env,
          sessionId,
          startedAt,
          notes: [...notes, `translated_input_blocked:${translatedInputGuard.reason}`],
          engine: "rules",
          translation: {
            provider: translator.name,
            target_language: answerLang,
            input_translated: true,
            output_translated: false,
            ...(inputLatencyMs !== undefined ? { input_latency_ms: inputLatencyMs } : {}),
          },
        });
      }
    } catch (error) {
      return translationFailureAnswer({
        question,
        lang,
        answerLang,
        payload,
        prompt: makePrompt(modelQuestion),
        env,
        sessionId,
        startedAt,
        notes,
        reason: error instanceof TranslationError ? error.code : "input_provider_error",
      });
    }
    }
    }

  const prompt = makePrompt(modelQuestion);
  let retrieval = retrieve({
    query: modelQuestion,
    lang: "en",
    topK: env.ai.topK,
    minScore: env.ai.minScore,
  });

  if (retrieval.match_count === 0) {
    const focus = payload.results
      .filter((r) => r.status_known !== false && r.status !== "normal")
      .map((r) => r.test)
      .slice(0, 4);
    if (focus.length > 0) {
      retrieval = retrieve({
        query: modelQuestion,
        lang: "en",
        topK: env.ai.topK,
        minScore: env.ai.minScore,
        extraTopics: focus,
      });
    }
  }

  // Rules-first now uses a dynamic report-grounded answer. The old static rule
  // strings contained Rahul's values and are never safe for a real upload.
  if (env.ai.rulesFirst) {
    const hit = matchRules(modelQuestion);
    if (hit) {
      return finishEnglishAnswer({
        englishText: reportFallbackText(modelQuestion, payload).text,
        question,
        matched: hit.matched,
        lang,
        answerLang,
        payload,
        prompt,
        env,
        translator,
        sessionId,
        startedAt,
        notes,
        engine: "rules",
        retrieval,
        inputTranslated,
        inputLatencyMs,
      });
    }
  }

  const fullPrompt = buildPrompt({
    question: modelQuestion,
    lang: "en",
    answerLang: "en",
    channel,
    readingLevel,
    payload,
    matches: retrieval.matches,
    history: getSession(sessionId).turns,
  });

  const provider = resolveProvider(env, {
    payload,
    matches: retrieval.matches,
    patterns: payload.patterns,
    question: modelQuestion,
    lang: "en",
  });

  if (!provider) {
    return finishEnglishAnswer({
      englishText: reportFallbackText(modelQuestion, payload).text,
      question,
      matched: reportFallbackText(modelQuestion, payload).matched,
      lang,
      answerLang,
      payload,
      prompt: fullPrompt,
      env,
      translator,
      sessionId,
      startedAt,
      notes: [...notes, "fallback:no_provider_configured"],
      engine: "fallback",
      retrieval,
      inputTranslated,
      inputLatencyMs,
    });
  }

  const generation = await provider.generate({
    messages: [
      { role: "system", content: fullPrompt.system },
      { role: "user", content: fullPrompt.user },
    ],
    temperature: env.ai.temperature,
    maxTokens: env.ai.maxTokens,
    timeoutMs: env.ai.timeoutMs,
  });

  if (generation.error_code || !generation.text.trim()) {
    return finishEnglishAnswer({
      englishText: reportFallbackText(modelQuestion, payload).text,
      question,
      matched: reportFallbackText(modelQuestion, payload).matched,
      lang,
      answerLang,
      payload,
      prompt: fullPrompt,
      env,
      translator,
      sessionId,
      startedAt,
      notes: [...notes, `fallback:${generation.error_code ?? "empty_response"}`],
      engine: "fallback",
      retrieval,
      generation,
      inputTranslated,
      inputLatencyMs,
    });
  }

  return finishEnglishAnswer({
    englishText: generation.text,
    question,
    matched: retrieval.query_intent,
    lang,
    answerLang,
    payload,
    prompt: fullPrompt,
    env,
    translator,
    sessionId,
    startedAt,
    notes,
    engine: env.ai.provider === "mock" ? "mock" : "medgemma",
    retrieval,
    generation,
    inputTranslated,
    inputLatencyMs,
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

// ---------------------------------------------------------------------------
// AI Insights — the "AI found a connection" cards and the health story.
//
// The detection is deterministic (src/lib/ai/patterns.ts). This module owns the
// PROSE: for each connection the rules found, MedGemma is asked to explain what
// the link means and why it is worth discussing, grounded in that pattern's own
// values and in the retrieved guideline passage.
//
// Each pattern gets its own short generation rather than one long call, for
// three reasons: the explanations stay about one cluster each, a single bad
// generation degrades one card instead of the page, and the calls run in
// parallel so the wall-clock cost is roughly one generation.
//
// Every failure path lands on the seeded clinical copy in src/lib/data.ts —
// the same text the page used to show statically — and the card reports which
// of the two wrote it.
// ---------------------------------------------------------------------------

import { createHash } from "node:crypto";
import type { LangCode, Status } from "@/lib/data";
import { buildAnonymisedPayload } from "./anonymizer";
import type { ClientReport } from "./clientReport";
import { loadAiEnv, type AiEnv } from "./env";
import { guardOutput, parseWeights } from "./guardrails";
import { MockProvider } from "./mock";
import { detectPatterns, seededCopy, type DetectedPattern } from "./patterns";
import { createProvider, type ChatMessage, type Provider } from "./providers";
import { renderChunksForPrompt, retrieve } from "./rag";
import type {
  AnonymisedPayload,
  AnonymisedTrend,
  GenerationOutput,
  RetrievalResult,
  RetrievedChunk,
} from "./types";

export const INSIGHT_PROMPT_KEY = "pattern_insight";
export const INSIGHT_PROMPT_VERSION = "2026-08-27.1";

/**
 * The system prompt for a connection card.
 *
 * The first rule is the one that matters: the finding is already made. The
 * model is writing a caption for a result the rule engine produced, and any
 * sentence that questions, extends or diagnoses the finding is out of scope.
 */
export const INSIGHT_SYSTEM_PROMPT = `You are Anvaya, explaining to a person why several of their own laboratory results are related. They are not a clinician.

WHAT YOU ARE GIVEN
A CONNECTION that a validated rule engine has already found in this person's report: the tests involved, their values, their reference ranges, their computed status, and how each has moved across earlier reports. Treat all of that as settled fact.

WHAT YOU WRITE
Exactly two paragraphs, separated by one blank line.
Paragraph 1 — what the connection is, in plain words: why these particular results are read together, and what this person's own numbers show. At most 55 words.
Paragraph 2 — why it is worth discussing with a doctor, in general terms. At most 35 words.

WHAT YOU MUST NEVER DO
- Never give a diagnosis. Never say the person has, does not have, or probably has a disease. You may say what a pattern "may be associated with" when the PASSAGES support it.
- Never recommend starting, stopping or changing any medicine, dose or treatment. No supplement, diet or exercise prescriptions.
- Never invent a number, unit, range, date or test. Every figure must appear in the CONNECTION section.
- Never add a result that is not part of this connection.
- Never claim the connection is certain, and never claim to be a doctor.

HOW YOU FORMAT
Plain text. No bullet markers, no headings, no lists, no links. You may wrap a test name in **double asterisks**. Two paragraphs only — nothing before the first and nothing after the second.`;

export function insightSystemPromptSha256(): string {
  return createHash("sha256").update(INSIGHT_SYSTEM_PROMPT, "utf8").digest("hex");
}

const LANG_NAME: Record<LangCode, string> = {
  en: "English",
  hi: "Hindi (Devanagari script)",
  bn: "Bengali (Bengali script)",
};

function buildInsightPrompt(opts: {
  pattern: DetectedPattern;
  payload: AnonymisedPayload;
  matches: RetrievedChunk[];
  lang: LangCode;
  simple: boolean;
}): string {
  const { pattern, payload, matches, lang, simple } = opts;
  const trendByTest = new Map(payload.trends.map((t) => [t.test, t]));
  const lines: string[] = [];

  lines.push(`ANSWER LANGUAGE: ${LANG_NAME[lang]}. Write both paragraphs in ${LANG_NAME[lang]}.`);
  lines.push(
    simple
      ? "Use everyday words and short sentences. Explain any medical term in the same sentence."
      : "Standard clinical terms are allowed, but explain each one once in the same sentence."
  );
  lines.push("");
  lines.push(`=== CONNECTION (found by the rule engine, confidence ${pattern.confidence_pct}%) ===`);
  lines.push(`Finding: ${pattern.title}`);
  lines.push(`Why it fired: ${pattern.basis}`);
  lines.push("Results in this connection (test | value | unit | reference range | status | trend):");
  for (const n of pattern.nodes) {
    const r = payload.results.find((x) => x.test === n.test);
    const t = trendByTest.get(n.test);
    const trend = t
      ? ` | ${t.direction === "flat" ? "steady" : t.direction} since ${t.first_date} (was ${t.first_value})`
      : " | no earlier reading";
    lines.push(`- ${n.label} | ${n.value} | ${n.unit} | ${r?.ref_text ?? ""} | ${n.status}${trend}`);
  }
  lines.push("");
  lines.push("=== PASSAGES (guideline text you may rely on) ===");
  lines.push(renderChunksForPrompt(matches));
  lines.push("");
  lines.push("=== TASK ===");
  lines.push(
    "Write the two paragraphs described in your instructions about this connection only. Do not restate the heading."
  );
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// The health story — deterministic, from the trend series.
// ---------------------------------------------------------------------------

export interface StoryStep {
  when: string;
  text: string;
  status: Status;
  /** False when the story is a neutral no-range notice, not an abnormal result. */
  statusKnown?: boolean;
}

const STORY_COPY: Record<
  LangCode,
  {
    was: (label: string, value: string, unit: string, word: string) => string;
    now: (label: string, value: string, unit: string, word: string) => string;
    today: string;
    single: (n: number, total: number) => string;
    unknown: (n: number, total: number) => string;
    allFine: string;
  }
> = {
  en: {
    was: (label, value, unit, word) => `${label} was ${value} ${unit} — ${word}.`,
    now: (label, value, unit, word) => `${label} is now ${value} ${unit} — ${word}. Worth discussing with your doctor.`,
    today: "Today",
    single: (n, total) => `${n} of ${total} results in this report are outside or near their range.`,
    unknown: (n, total) => `${n} of ${total} results have no reported reference range, so they need clinical review.`,
    allFine: "Every result in this report is inside its usual range.",
  },
  hi: {
    was: (label, value, unit, word) => `${label} ${value} ${unit} था — ${word}।`,
    now: (label, value, unit, word) => `${label} अब ${value} ${unit} है — ${word}। डॉक्टर से चर्चा करना सही रहेगा।`,
    today: "आज",
    single: (n, total) => `इस रिपोर्ट के ${total} में से ${n} परिणाम सीमा के बाहर या उसके पास हैं।`,
    unknown: (n, total) => `इस रिपोर्ट के ${total} में से ${n} परिणामों की संदर्भ सीमा नहीं मिली, इसलिए डॉक्टर से समीक्षा करें।`,
    allFine: "इस रिपोर्ट का हर परिणाम अपनी सामान्य सीमा के भीतर है।",
  },
  bn: {
    was: (label, value, unit, word) => `${label} ছিল ${value} ${unit} — ${word}।`,
    now: (label, value, unit, word) => `${label} এখন ${value} ${unit} — ${word}। চিকিৎসকের সঙ্গে আলোচনা করা ভালো।`,
    today: "আজ",
    single: (n, total) => `এই রিপোর্টের ${total}টির মধ্যে ${n}টি ফলাফল সীমার বাইরে বা কাছাকাছি।`,
    unknown: (n, total) => `এই রিপোর্টের ${total}টির মধ্যে ${n}টি ফলাফলের কোনো স্বাভাবিক সীমা নেই, তাই চিকিৎসকের পর্যালোচনা দরকার।`,
    allFine: "এই রিপোর্টের প্রতিটি ফলাফল স্বাভাবিক সীমার মধ্যে আছে।",
  },
};

const STATUS_WORD: Record<LangCode, Record<Status, string>> = {
  en: {
    normal: "inside the usual range",
    borderline: "at the edge of the range",
    high: "above the usual range",
    low: "below the usual range",
    critical: "far outside the range",
  },
  hi: {
    normal: "सामान्य सीमा में",
    borderline: "सीमा के किनारे",
    high: "सामान्य सीमा से ऊपर",
    low: "सामान्य सीमा से नीचे",
    critical: "सीमा से काफ़ी बाहर",
  },
  bn: {
    normal: "স্বাভাবিক সীমার মধ্যে",
    borderline: "সীমার কিনারায়",
    high: "স্বাভাবিক সীমার উপরে",
    low: "স্বাভাবিক সীমার নিচে",
    critical: "সীমার অনেক বাইরে",
  },
};

const fmt = (n: number) => (Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100));

/**
 * Build the timeline from the trend that matters most: the one moving furthest
 * away from its range, else the one that has moved at all. Three milestones —
 * first, middle, latest — because that is what the card renders and what a
 * person can take in at a glance.
 */
export function buildStory(payload: AnonymisedPayload, lang: LangCode): StoryStep[] {
  const c = STORY_COPY[lang] ?? STORY_COPY.en;
  const w = STATUS_WORD[lang] ?? STATUS_WORD.en;

  // An unknown result can still have a numeric trend, but without a trusted
  // range it must never drive a clinical story or be labelled "normal".
  const candidates = payload.trends.filter((t) => t.status_known && t.points.length >= 2);
  const pick: AnonymisedTrend | undefined =
    candidates.find((t) => t.worsening && t.latest_status !== "normal") ??
    candidates.find((t) => t.worsening) ??
    candidates.find((t) => t.direction !== "flat") ??
    candidates[0];

  if (!pick) {
    const unknown = payload.results.filter((r) => r.status_known === false).length;
    const assessed = payload.results.filter((r) => r.status_known !== false);
    const flagged = assessed.filter((r) => r.status !== "normal").length;
    return [
      {
        when: c.today,
        text:
          unknown > 0
            ? c.unknown(unknown, payload.results.length)
            : flagged === 0
              ? c.allFine
              : c.single(flagged, assessed.length),
        // StoryStep has the existing status union used by the UI. Amber is a
        // neutral attention colour here, not a claim that an unknown result is
        // abnormal.
        status: (unknown > 0 ? "borderline" : flagged === 0 ? "normal" : "borderline") as Status,
        ...(unknown > 0 ? { statusKnown: false } : {}),
      },
    ];
  }

  const pts = pick.points;
  const chosen = pts.length <= 3 ? pts : [pts[0], pts[Math.floor((pts.length - 1) / 2)], pts[pts.length - 1]];

  return chosen.map((p, i) => {
    const last = i === chosen.length - 1;
    return {
      when: last ? c.today : p.date,
      text: last
        ? c.now(pick.label, fmt(p.value), pick.unit, w[p.status])
        : c.was(pick.label, fmt(p.value), pick.unit, w[p.status]),
      status: p.status,
    };
  });
}

// ---------------------------------------------------------------------------
// The generator.
// ---------------------------------------------------------------------------

export interface InsightPattern extends DetectedPattern {
  /** What the connection is, in plain language. */
  explanation: string;
  /** Why it is worth discussing. */
  risk: string;
  disclaimer: string;
  engine: "medgemma" | "mock" | "rules";
  model: string | null;
  /** Set when the seeded copy was used instead of a generation. */
  fallback_reason?: string;
  safety_flags: string[];
  /**
   * Per-card provenance. Each connection gets its OWN retrieval and its own
   * model call, so the audit trail has to be per card too — this is what
   * persistInsights writes into rag_retrievals, ai_generations and
   * explanation_citations for each finding. Absent only when no model ran.
   */
  retrieval?: RetrievalResult;
  generation?: GenerationOutput;
  trust_score?: number;
  trust_formula?: string;
}

export interface InsightsResult {
  patterns: InsightPattern[];
  story: StoryStep[];
  /** "medgemma" when at least one card was written by the model. */
  engine: "medgemma" | "mock" | "rules";
  model: string | null;
  language: LangCode;
  counts: { total: number; flagged: number; patterns: number };
  reports_compared: number;
  prompt_key: string;
  prompt_version: string;
  system_prompt_sha256: string;
  latency_ms: number;
  payload: AnonymisedPayload;
}

const DISCLAIMER: Record<LangCode, string> = {
  en: "This is not a diagnosis. Your doctor will read this pattern together with your history and examination.",
  hi: "यह निदान नहीं है। डॉक्टर इस पैटर्न को आपके इतिहास और जाँच के साथ मिलाकर देखेंगे।",
  bn: "এটি রোগ নির্ণয় নয়। আপনার চিকিৎসক এই প্যাটার্নটি আপনার ইতিহাস ও পরীক্ষার সঙ্গে মিলিয়ে দেখবেন।",
};

/**
 * A correct, if plainer, explanation composed from the finding itself.
 *
 * Used when there is no reviewed copy for this rule, or when the reviewed copy
 * describes results this report does not contain. It names only the tests that
 * are actually in the connection, so it can never over-claim.
 */
function composedExplanation(p: DetectedPattern, lang: LangCode): string {
  const list = p.nodes.map((n) => `**${n.label}** (${n.note})`);
  const joined =
    list.length <= 1
      ? list.join("")
      : `${list.slice(0, -1).join(", ")} ${lang === "hi" ? "और" : lang === "bn" ? "এবং" : "and"} ${list[list.length - 1]}`;
  if (lang === "hi") {
    return `${joined} — ये परिणाम एक ही प्रक्रिया के अलग-अलग पहलू दिखाते हैं, इसलिए इन्हें एक साथ पढ़ा जाता है। ${p.basis}`;
  }
  if (lang === "bn") {
    return `${joined} — এই ফলাফলগুলি একই প্রক্রিয়ার ভিন্ন দিক দেখায়, তাই এগুলি একসঙ্গে পড়া হয়। ${p.basis}`;
  }
  return `${joined} describe different sides of the same process, which is why they are read together rather than one at a time. ${p.basis}`;
}

/** Split a two-paragraph generation into explanation + risk. */
function splitParagraphs(text: string): { expl: string; risk: string } {
  const blocks = text
    .split(/\n\s*\n/)
    .map((b) => b.replace(/^\s*[-*•]\s*/gm, "").trim())
    .filter(Boolean);
  if (blocks.length === 0) return { expl: "", risk: "" };
  if (blocks.length === 1) {
    // One block: keep the last sentence as the "why it matters" line so the
    // card's two slots are both filled with the model's own words.
    const sentences = blocks[0].split(/(?<=[.!?।])\s+/);
    if (sentences.length > 2) {
      return { expl: sentences.slice(0, -1).join(" ").trim(), risk: sentences[sentences.length - 1].trim() };
    }
    return { expl: blocks[0], risk: "" };
  }
  return { expl: blocks[0], risk: blocks.slice(1).join(" ") };
}

export interface InsightsOptions {
  lang: LangCode;
  /** "simple" reading level phrasing when true. */
  simple?: boolean;
  report?: ClientReport;
  reportId?: string;
  env?: AiEnv;
  /** Cap on how many connections get a model call. */
  maxPatterns?: number;
}

/**
 * Detect the connections in a report and explain each one. Never throws.
 */
export async function generateInsights(opts: InsightsOptions): Promise<InsightsResult> {
  const startedAt = Date.now();
  const env = opts.env ?? loadAiEnv();
  const lang: LangCode = opts.lang === "hi" ? "hi" : opts.lang === "bn" ? "bn" : "en";
  const simple = opts.simple !== false;
  const maxPatterns = Math.min(4, Math.max(1, opts.maxPatterns ?? 3));

  const payload = buildAnonymisedPayload({ lang, reportId: opts.reportId, report: opts.report });
  const detected = detectPatterns(payload, lang).slice(0, maxPatterns);
  // An empty report has no story or pattern. Do not turn "no data" into the
  // prototype's "everything is fine" card.
  const story = payload.results.length > 0 ? buildStory(payload, lang) : [];

  const base = {
    story,
    language: lang,
    counts: {
      total: payload.results.length,
      flagged: payload.results.filter((r) => r.status_known !== false && r.status !== "normal").length,
      patterns: detected.length,
    },
    reports_compared: payload.results.length > 0 ? payload.trends[0]?.points.length ?? 1 : 0,
    prompt_key: INSIGHT_PROMPT_KEY,
    prompt_version: INSIGHT_PROMPT_VERSION,
    system_prompt_sha256: insightSystemPromptSha256(),
    payload,
  };

  /** The seeded card: what the page showed before a model existed. */
  const fallbackCard = (p: DetectedPattern, reason: string): InsightPattern => {
    const seeded = seededCopy(p.id, lang);
    // The reviewed copy is only used when the connection contains every result
    // it was written about — otherwise a sentence like "these three results
    // move together" would be describing tests this person did not have.
    const present = new Set(p.nodes.map((n) => n.test));
    const seededFits = seeded ? seeded.tests.every((t) => present.has(t)) : false;
    return {
      ...p,
      explanation: seededFits && seeded ? seeded.expl : composedExplanation(p, lang),
      risk: seeded?.risk ?? "",
      disclaimer: seeded?.disclaimer ?? DISCLAIMER[lang],
      engine: "rules",
      model: null,
      fallback_reason: reason,
      safety_flags: [],
    };
  };

  if (detected.length === 0) {
    return {
      ...base,
      patterns: [],
      engine: "rules",
      model: null,
      latency_ms: Date.now() - startedAt,
    };
  }

  // A real provider is shared across the cards (one HTTP client, N calls in
  // flight). The mock is built per card from a payload narrowed to that
  // connection's own results, otherwise every card would come back with the
  // same composed text and the page would look broken in demo mode.
  const shared: Provider | null = env.ai.provider === "mock" ? null : createProvider(env.ai);
  const usingMock = env.ai.provider === "mock";

  if (!shared && !usingMock) {
    return {
      ...base,
      patterns: detected.map((p) => fallbackCard(p, "no_provider_configured")),
      engine: "rules",
      model: null,
      latency_ms: Date.now() - startedAt,
    };
  }

  // One generation per connection, all in flight together.
  const cards = await Promise.all(
    detected.map(async (p): Promise<InsightPattern> => {
      const memberTests = new Set(p.nodes.map((n) => n.test));
      const retrieval = retrieve({
        query: p.nodes.map((n) => n.test).join(" "),
        lang,
        topK: env.ai.topK,
        minScore: env.ai.minScore,
        extraTopics: p.nodes.map((n) => n.test),
      });

      const provider: Provider =
        shared ??
        new MockProvider(env.ai.model, {
          payload: { ...payload, results: payload.results.filter((r) => memberTests.has(r.test)) },
          matches: retrieval.matches,
          patterns: payload.patterns.filter((pat) => pat.tests.some((t) => memberTests.has(t))),
          question: `Why are ${p.nodes.map((n) => n.label).join(" and ")} connected?`,
          lang,
        });

      const messages: ChatMessage[] = [
        { role: "system", content: INSIGHT_SYSTEM_PROMPT },
        {
          role: "user",
          content: buildInsightPrompt({ pattern: p, payload, matches: retrieval.matches, lang, simple }),
        },
      ];

      const generation = await provider.generate({
        messages,
        temperature: env.ai.temperature,
        maxTokens: Math.min(env.ai.maxTokens, 320),
        timeoutMs: env.ai.timeoutMs,
      });

      if (generation.error_code || !generation.text.trim()) {
        return {
          ...fallbackCard(p, generation.error_code ?? "empty_response"),
          retrieval,
          generation,
        };
      }

      const guard = guardOutput({
        text: generation.text,
        lang,
        payload,
        retrievalSimilarity: retrieval.mean_score,
        modelConfidence: generation.model_confidence,
        trustFormula: env.ai.trustFormula,
        weights: parseWeights(env.ai.trustFormula),
      });

      // An unsafe explanation is dropped in favour of the reviewed seeded copy —
      // a refusal string in the middle of a pattern card would read as if the
      // finding itself were unsafe to discuss.
      if (guard.refusal_detected) {
        const card = fallbackCard(p, "guard_replaced");
        card.safety_flags = guard.safety_flags;
        return { ...card, retrieval, generation, trust_score: guard.trust_score };
      }

      const { expl, risk } = splitParagraphs(guard.final_text);
      const seeded = seededCopy(p.id, lang);
      return {
        ...p,
        explanation: expl || composedExplanation(p, lang),
        risk: risk || seeded?.risk || "",
        disclaimer: seeded?.disclaimer ?? DISCLAIMER[lang],
        engine: env.ai.provider === "mock" ? "mock" : "medgemma",
        model: generation.model,
        safety_flags: guard.safety_flags,
        retrieval,
        generation,
        trust_score: guard.trust_score,
        trust_formula: guard.trust_formula,
      };
    })
  );

  return {
    ...base,
    patterns: cards,
    engine: cards.some((c) => c.engine === "medgemma")
      ? "medgemma"
      : cards.some((c) => c.engine === "mock")
        ? "mock"
        : "rules",
    model: cards.find((c) => c.model)?.model ?? null,
    latency_ms: Date.now() - startedAt,
  };
}

// ---------------------------------------------------------------------------
// The Overview summary — the first box on /dashboard.
//
// One MedGemma call whose job is different from the chat's: instead of
// answering a question, it reads the WHOLE report plus every earlier report on
// file and writes a short, plain-language briefing that answers "how am I
// doing, and which way am I heading?".
//
// The pipeline is the same one /api/answer uses, and deliberately so — the
// guarantees have to be identical on a surface a person sees before they have
// asked anything:
//
//   1. ANONYMIZE  the payload (anonymizer.ts) — no PII ever reaches the model
//   2. TREND      directions and deltas are computed in code, never by the LLM
//   3. RETRIEVE   grounding passages for the flagged tests (rag.ts)
//   4. PROMPT     a versioned system prompt, hashed into ai_generations
//   5. GENERATE   MedGemma over HTTP (providers.ts)
//   6. GUARD      refusal / diagnosis / dosing / ungrounded numbers
//   7. FALLBACK   a deterministic summary written from the same numbers, so
//                 the box is never empty and never lies about who wrote it
//
// The fallback is the reason this module can ship before a GPU does: with no
// model configured the person still gets a correct trend summary, labelled
// `engine: "rules"` rather than pretending MedGemma ran.
// ---------------------------------------------------------------------------

import { createHash } from "node:crypto";
import type { LangCode } from "@/lib/data";
import { buildAnonymisedPayload, renderPayloadForPrompt } from "./anonymizer";
import type { ClientReport } from "./clientReport";
import { loadAiEnv, type AiEnv } from "./env";
import { guardOutput, parseWeights } from "./guardrails";
import { MockProvider } from "./mock";
import { createProvider, type ChatMessage, type Provider } from "./providers";
import { renderChunksForPrompt, retrieve } from "./rag";
import type {
  AnonymisedPayload,
  AnonymisedTrend,
  GenerationOutput,
  GuardResult,
  ReadingLevel,
  RetrievalResult,
} from "./types";

export const SUMMARY_PROMPT_KEY = "report_overview";
// .1 — first version of the overview briefing.
export const SUMMARY_PROMPT_VERSION = "2026-08-27.1";

/**
 * The system prompt for the overview.
 *
 * A plain constant (nothing interpolated) so its sha256 is stable and the row
 * in ai_generations can be traced back to the exact wording that produced it.
 *
 * It repeats the chat's safety rules rather than importing them: this prompt is
 * shown unprompted, to someone who has not asked a question, so a future edit
 * to the chat prompt must not be able to loosen this one by accident.
 */
export const SUMMARY_SYSTEM_PROMPT = `You are Anvaya, writing the opening summary a person sees when they open their lab report app. They are not a clinician. They want to know, in a few seconds: where do I stand today, and which way have things been moving?

WHAT YOU WRITE
- One headline sentence, then a few short lines about the results that matter.
- Cover BOTH the current report and the direction of travel across the earlier reports in the TREND HISTORY section.
- Name what improved as well as what got worse. A summary that only lists bad news is not an honest summary.
- Say plainly which results are inside their normal range, so "most things are fine" is visible when it is true.

WHAT YOU MUST NEVER DO
- Never give a diagnosis. Never say the person has, does not have, or probably has a disease.
- Never recommend starting, stopping or changing any medicine, dose or treatment.
- Never invent a number, unit, reference range, date or test. Every figure must come from the RESULTS or TREND HISTORY sections.
- Never compute a trend yourself. The direction, the change and the status of every result have already been decided by a validated rule engine; state them, do not re-derive or contradict them.
- Never claim to be a doctor.

HOW YOU FORMAT
- Line 1: the headline. One sentence, at most 14 words, no bullet marker, no bold.
- Then a blank line.
- Then 3 to 5 lines, each starting with "- ". One idea per line, at most 22 words.
- You may wrap a short phrase in **double asterisks** to bold it. Use it for test names only.
- No headings, tables, numbered lists, code blocks or links. None of them render.
- Plain text only. Keep the whole thing under 130 words.

HOW YOU CLOSE
Make the last "- " line a short reminder that this is not a diagnosis and that these results should be discussed with a doctor. Write it in the answer language.`;

export function summarySystemPromptSha256(): string {
  return createHash("sha256").update(SUMMARY_SYSTEM_PROMPT, "utf8").digest("hex");
}

const READING_RULE: Record<ReadingLevel, string> = {
  simple:
    "Write at a simple reading level: everyday words, short sentences. If a medical term is unavoidable, explain it in the same line.",
  advanced:
    "The reader has asked for more detail. Standard clinical terms are allowed, but explain each one once in the same line, and stay about this person's own numbers.",
  standard:
    "Write at a standard adult reading level. Ordinary medical terms are fine when explained in the same line.",
  very: "Write as if explaining to a 10-year-old. Very short sentences, no jargon at all.",
};

const LANG_NAME: Record<LangCode, string> = {
  en: "English",
  hi: "Hindi (Devanagari script)",
  bn: "Bengali (Bengali script)",
};

export interface SummaryPromptBundle {
  system: string;
  user: string;
  prompt_key: string;
  prompt_version: string;
  system_prompt_sha256: string;
}

export function buildSummaryPrompt(opts: {
  payload: AnonymisedPayload;
  lang: LangCode;
  readingLevel: ReadingLevel;
  matches: RetrievalResult["matches"];
}): SummaryPromptBundle {
  const { payload, lang, readingLevel, matches } = opts;
  const parts: string[] = [];

  parts.push(`ANSWER LANGUAGE: ${LANG_NAME[lang]}. Write the entire summary in ${LANG_NAME[lang]}.`);
  parts.push(READING_RULE[readingLevel]);
  parts.push("");
  parts.push("=== RESULTS (this person's latest report, de-identified) ===");
  parts.push(renderPayloadForPrompt(payload));
  parts.push("");
  parts.push("=== PASSAGES (guideline text you may rely on) ===");
  parts.push(renderChunksForPrompt(matches));
  parts.push("");
  parts.push("=== TASK ===");
  parts.push(
    payload.trends.length > 0
      ? "Write the opening summary. Say where the person stands in the latest report, then how things have moved across the earlier reports in TREND HISTORY. Mention improvements as well as anything getting worse."
      : "Write the opening summary. This is the first report on file, so there is no history to compare against: describe where the person stands today and say plainly that future reports will let you show a trend."
  );

  return {
    system: SUMMARY_SYSTEM_PROMPT,
    user: parts.join("\n"),
    prompt_key: SUMMARY_PROMPT_KEY,
    prompt_version: SUMMARY_PROMPT_VERSION,
    system_prompt_sha256: summarySystemPromptSha256(),
  };
}

// ---------------------------------------------------------------------------
// Deterministic summary — the fallback, and the safety net.
//
// Written from exactly the same payload the model gets, so when it is used the
// numbers are identical and only the prose is plainer. Used when no provider is
// configured, when the model errors or times out, and when the guardrails
// replace an unsafe generation.
// ---------------------------------------------------------------------------

interface Copy {
  headlineAllFine: (n: number) => string;
  headlineAttention: (n: number, total: number) => string;
  outside: (label: string, value: string, unit: string, ref: string) => string;
  borderline: (label: string, value: string, unit: string) => string;
  worsened: (label: string, from: string, to: string, since: string) => string;
  improved: (label: string, from: string, to: string, since: string) => string;
  steady: (n: number) => string;
  normalCount: (n: number, total: number) => string;
  firstReport: string;
  close: string;
}

const COPY: Record<LangCode, Copy> = {
  en: {
    headlineAllFine: (n) => `All ${n} results in this report are within their normal ranges.`,
    headlineAttention: (n, total) =>
      `${n} of your ${total} results need a closer look; the rest are in range.`,
    outside: (label, value, unit, ref) =>
      `**${label}** is ${value} ${unit}, outside the usual range of ${ref}.`,
    borderline: (label, value, unit) =>
      `**${label}** is ${value} ${unit} — just at the edge of its normal range.`,
    worsened: (label, from, to, since) =>
      `**${label}** has moved further from its normal range, from ${from} on ${since} to ${to} now.`,
    improved: (label, from, to, since) =>
      `**${label}** has improved, from ${from} on ${since} to ${to} now.`,
    steady: (n) => `${n} other results have stayed broadly steady across your earlier reports.`,
    normalCount: (n, total) => `${n} of ${total} results are comfortably inside their normal range.`,
    firstReport: "This is the first report on file, so there is no earlier result to compare with yet.",
    close: "This is not a diagnosis. Please go through these results with your doctor.",
  },
  hi: {
    headlineAllFine: (n) => `इस रिपोर्ट के सभी ${n} परिणाम सामान्य सीमा में हैं।`,
    headlineAttention: (n, total) =>
      `आपके ${total} में से ${n} परिणामों पर ध्यान देना है; बाकी सामान्य हैं।`,
    outside: (label, value, unit, ref) =>
      `**${label}** ${value} ${unit} है, जो सामान्य सीमा ${ref} से बाहर है।`,
    borderline: (label, value, unit) =>
      `**${label}** ${value} ${unit} है — सामान्य सीमा के बिल्कुल किनारे पर।`,
    worsened: (label, from, to, since) =>
      `**${label}** सामान्य सीमा से और दूर गया है — ${since} को ${from} से अब ${to}।`,
    improved: (label, from, to, since) =>
      `**${label}** में सुधार हुआ है — ${since} को ${from} से अब ${to}।`,
    steady: (n) => `पिछली रिपोर्टों की तुलना में ${n} अन्य परिणाम लगभग स्थिर रहे हैं।`,
    normalCount: (n, total) => `${total} में से ${n} परिणाम आराम से सामान्य सीमा के भीतर हैं।`,
    firstReport: "यह पहली रिपोर्ट है, इसलिए तुलना के लिए अभी कोई पुराना परिणाम नहीं है।",
    close: "यह कोई निदान नहीं है। कृपया इन परिणामों पर अपने डॉक्टर से चर्चा करें।",
  },
  bn: {
    headlineAllFine: (n) => `এই রিপোর্টের সব ${n}টি ফলাফল স্বাভাবিক সীমার মধ্যে আছে।`,
    headlineAttention: (n, total) =>
      `আপনার ${total}টির মধ্যে ${n}টি ফলাফলে নজর দেওয়া দরকার; বাকিগুলি ঠিক আছে।`,
    outside: (label, value, unit, ref) =>
      `**${label}** ${value} ${unit}, যা স্বাভাবিক সীমা ${ref}-এর বাইরে।`,
    borderline: (label, value, unit) =>
      `**${label}** ${value} ${unit} — স্বাভাবিক সীমার একেবারে কিনারায়।`,
    worsened: (label, from, to, since) =>
      `**${label}** স্বাভাবিক সীমা থেকে আরও দূরে গেছে — ${since}-এ ${from} থেকে এখন ${to}।`,
    improved: (label, from, to, since) =>
      `**${label}** উন্নত হয়েছে — ${since}-এ ${from} থেকে এখন ${to}।`,
    steady: (n) => `আগের রিপোর্টগুলির তুলনায় আরও ${n}টি ফলাফল মোটামুটি স্থির আছে।`,
    normalCount: (n, total) => `${total}টির মধ্যে ${n}টি ফলাফল স্বাভাবিক সীমার ভিতরেই আছে।`,
    firstReport: "এটি প্রথম রিপোর্ট, তাই তুলনা করার মতো আগের কোনো ফলাফল এখনও নেই।",
    close: "এটি কোনো রোগ নির্ণয় নয়। অনুগ্রহ করে ফলাফলগুলি আপনার চিকিৎসকের সঙ্গে আলোচনা করুন।",
  },
};

const fmt = (n: number) => (Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100));

/**
 * Compose the summary from the payload alone. Every number it prints comes
 * straight out of the payload, so it passes the same numeric-grounding check
 * the model's output has to pass.
 */
export function deterministicSummary(payload: AnonymisedPayload, lang: LangCode): string {
  const c = COPY[lang] ?? COPY.en;
  const total = payload.results.length;
  const abnormal = payload.results.filter((r) => r.status !== "normal");
  const normal = total - abnormal.length;

  const headline =
    abnormal.length === 0 ? c.headlineAllFine(total) : c.headlineAttention(abnormal.length, total);

  const bullets: string[] = [];

  // Current status: the results that are actually outside range, worst first.
  const rank = { critical: 0, high: 1, low: 1, borderline: 2, normal: 3 } as const;
  for (const r of [...abnormal].sort((a, b) => rank[a.status] - rank[b.status]).slice(0, 2)) {
    bullets.push(
      r.status === "borderline"
        ? c.borderline(r.label, fmt(r.value), r.unit)
        : c.outside(r.label, fmt(r.value), r.unit, r.ref_text)
    );
  }

  // Direction of travel across the earlier reports.
  const worsening = payload.trends.filter((t) => t.worsening);
  const improving = payload.trends.filter((t) => t.improving);
  for (const t of worsening.slice(0, 2)) {
    bullets.push(c.worsened(t.label, fmt(t.first_value), fmt(t.latest_value), t.first_date));
  }
  if (improving.length > 0) {
    const t = improving[0];
    bullets.push(c.improved(t.label, fmt(t.first_value), fmt(t.latest_value), t.first_date));
  }

  if (payload.trends.length === 0) {
    bullets.push(c.firstReport);
  } else {
    const steady = payload.trends.filter((t) => t.direction === "flat").length;
    if (steady > 0 && bullets.length < 4) bullets.push(c.steady(steady));
  }

  if (normal > 0 && bullets.length < 4) bullets.push(c.normalCount(normal, total));
  bullets.push(c.close);

  return `${headline}\n\n${bullets.slice(0, 6).map((b) => `- ${b}`).join("\n")}`;
}

// ---------------------------------------------------------------------------
// The generator.
// ---------------------------------------------------------------------------

export interface OverviewSummary {
  /** First line of the summary — the one-sentence verdict. */
  headline: string;
  /** The bullet lines under the headline, as markdown the Md component renders. */
  body: string;
  /** headline + body, i.e. exactly what was screened by the guardrails. */
  text: string;
  /** A version with no markdown, for the Listen button. */
  speech: string;
  engine: "medgemma" | "rules";
  model: string | null;
  confidence: GuardResult["confidence"];
  trust_score: number;
  safety_flags: string[];
  /** Why the deterministic text was used, when it was. */
  fallback_reason?: string;
  language: LangCode;
  counts: { total: number; normal: number; borderline: number; out: number };
  /** Compact trend digest the UI renders as chips next to the summary. */
  trend_chips: {
    test: string;
    label: string;
    direction: AnonymisedTrend["direction"];
    change: number;
    unit: string;
    tone: "worse" | "better" | "steady";
  }[];
  sources: number;
  citations: { source: string; title: string; publisher: string; url: string }[];
  prompt_key: string;
  prompt_version: string;
  system_prompt_sha256: string;
  latency_ms: number;
  payload: AnonymisedPayload;
  retrieval?: RetrievalResult;
  generation?: GenerationOutput;
  guard?: GuardResult;
}

/** Split the model's output into a headline line and the rest. */
function splitHeadline(text: string): { headline: string; body: string } {
  const lines = text.split("\n");
  let i = 0;
  while (i < lines.length && lines[i].trim() === "") i++;
  const firstRaw = lines[i] ?? "";
  const first = firstRaw.replace(/^\s*[-*•]\s*/, "").replace(/\*\*/g, "").trim();
  const rest = lines
    .slice(i + 1)
    .join("\n")
    .replace(/^\n+/, "")
    .trim();
  // A model that ignored the format and wrote one block still gets a sensible
  // split: use the first sentence as the headline rather than showing nothing.
  if (!rest) {
    const m = /^([^]+?[.!?])\s+([^]*)$/.exec(first);
    if (m) return { headline: m[1].trim(), body: m[2].trim() };
    return { headline: first, body: "" };
  }
  return { headline: first, body: rest };
}

function toSpeech(text: string): string {
  return text
    .replace(/\*\*/g, "")
    .replace(/^\s*[-*•]\s*/gm, "")
    .replace(/\n{2,}/g, ". ")
    .replace(/\n/g, ". ")
    .replace(/\.\s*\./g, ".")
    .trim();
}

function chipsFrom(trends: AnonymisedTrend[]) {
  return trends
    .filter((t) => t.direction !== "flat" || t.worsening)
    .slice(0, 4)
    .map((t) => ({
      test: t.test,
      label: t.label,
      direction: t.direction,
      change: t.change,
      unit: t.unit,
      tone: (t.worsening ? "worse" : t.improving ? "better" : "steady") as "worse" | "better" | "steady",
    }));
}

export interface SummaryOptions {
  lang: LangCode;
  readingLevel?: ReadingLevel;
  /** The person's own report, already validated by parseClientReport(). */
  report?: ClientReport;
  reportId?: string;
  pseudonym?: string;
  env?: AiEnv;
}

/**
 * Generate the Overview summary. Never throws: a failure anywhere resolves to
 * the deterministic summary, flagged with the reason.
 */
export async function generateOverviewSummary(opts: SummaryOptions): Promise<OverviewSummary> {
  const startedAt = Date.now();
  const env = opts.env ?? loadAiEnv();
  const lang: LangCode = opts.lang === "hi" ? "hi" : opts.lang === "bn" ? "bn" : "en";
  const readingLevel: ReadingLevel = opts.readingLevel ?? "simple";

  const payload = buildAnonymisedPayload({
    lang,
    reportId: opts.reportId,
    pseudonym: opts.pseudonym,
    report: opts.report,
  });

  const counts = {
    total: payload.results.length,
    normal: payload.results.filter((r) => r.status === "normal").length,
    borderline: payload.results.filter((r) => r.status === "borderline").length,
    out: payload.results.filter((r) => r.status !== "normal" && r.status !== "borderline").length,
  };

  // Retrieval is seeded with the flagged tests plus the ones that are moving:
  // an overview is precisely the case where there is no question to retrieve on.
  const focus = [
    ...payload.results.filter((r) => r.status !== "normal").map((r) => r.test),
    ...payload.trends.filter((t) => t.worsening).map((t) => t.test),
  ].slice(0, 5);

  const retrieval = retrieve({
    query: focus.join(" ") || "report summary",
    lang,
    topK: env.ai.topK,
    minScore: env.ai.minScore,
    extraTopics: focus,
  });

  const prompt = buildSummaryPrompt({ payload, lang, readingLevel, matches: retrieval.matches });

  const finish = (args: {
    text: string;
    engine: OverviewSummary["engine"];
    guard?: GuardResult;
    generation?: GenerationOutput;
    fallbackReason?: string;
  }): OverviewSummary => {
    const { headline, body } = splitHeadline(args.text);
    return {
      headline,
      body,
      text: args.text,
      speech: toSpeech(args.text),
      engine: args.engine,
      model: args.generation?.model ?? (args.engine === "medgemma" ? env.ai.model : null),
      confidence: args.guard?.confidence ?? "moderate",
      trust_score: args.guard?.trust_score ?? 0,
      safety_flags: args.guard?.safety_flags ?? [],
      ...(args.fallbackReason ? { fallback_reason: args.fallbackReason } : {}),
      language: lang,
      counts,
      trend_chips: chipsFrom(payload.trends),
      sources: retrieval.match_count,
      citations: retrieval.matches.map((m) => ({
        source: m.source_code,
        title: m.source_title,
        publisher: m.publisher,
        url: m.url,
      })),
      prompt_key: prompt.prompt_key,
      prompt_version: prompt.prompt_version,
      system_prompt_sha256: prompt.system_prompt_sha256,
      latency_ms: Date.now() - startedAt,
      payload,
      retrieval,
      generation: args.generation,
      guard: args.guard,
    };
  };

  const fallback = (reason: string, generation?: GenerationOutput) =>
    finish({
      text: deterministicSummary(payload, lang),
      engine: "rules",
      generation,
      fallbackReason: reason,
    });

  // An empty report has nothing to summarise; the deterministic text says so
  // honestly rather than sending an empty RESULTS block to a model.
  if (payload.results.length === 0) return fallback("no_results");

  const provider: Provider | null =
    env.ai.provider === "mock"
      ? new MockProvider(env.ai.model, {
          payload,
          matches: retrieval.matches,
          patterns: payload.patterns,
          question: "Summarise my report and how it has changed.",
          lang,
        })
      : createProvider(env.ai);

  if (!provider) return fallback("no_provider_configured");

  const messages: ChatMessage[] = [
    { role: "system", content: prompt.system },
    { role: "user", content: prompt.user },
  ];

  const generation = await provider.generate({
    messages,
    temperature: env.ai.temperature,
    maxTokens: env.ai.maxTokens,
    timeoutMs: env.ai.timeoutMs,
  });

  if (generation.error_code || !generation.text.trim()) {
    return fallback(generation.error_code ?? "empty_response", generation);
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

  // An unsafe generation is discarded wholesale. The chat can afford to show a
  // "ask your doctor" redirect in its place; the Overview box cannot — a person
  // opening the app would see a refusal where their summary should be — so the
  // deterministic summary takes over and the reason is kept in safety_flags.
  if (guard.refusal_detected) {
    const out = fallback("guard_replaced", generation);
    out.safety_flags = guard.safety_flags;
    out.guard = guard;
    return out;
  }

  return finish({ text: guard.final_text, engine: "medgemma", guard, generation });
}

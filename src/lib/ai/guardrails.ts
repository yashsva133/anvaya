// ---------------------------------------------------------------------------
// Guardrails.
//
// The MedGemma model card states its safety evaluations "included primarily
// English language prompts", and the open-weights model is released WITHOUT
// safety filters. So the guardrail layer is not optional decoration — it is the
// safety mechanism. It runs on both sides of the model call:
//
//   guardInput()  — an out-of-scope question never reaches the model at all.
//   guardOutput() — output is screened for diagnosis/dosing claims and for
//                   numbers that do not appear in the supplied payload.
//
// Results land in ai_generations.refusal_detected / .safety_flags /
// .trust_score / .trust_level.
// ---------------------------------------------------------------------------

import type { LangCode } from "@/lib/data";
import type { AnonymisedPayload, ConfidenceLevel, GuardResult } from "./types";
import { allowedNumbers } from "./anonymizer";
import { SAFE_REDIRECT } from "./prompts";

/**
 * Questions we refuse before spending a model call.
 * Bilingual: a Hindi-only user must be refused in Hindi, not answered in English.
 */
const DIAGNOSIS_REQUESTS: RegExp[] = [
  /\bdo i have\b/i,
  /\bam i (?:diabetic|anaemic|anemic)\b/i,
  /\bdiagnos(?:e|is|ed)\b/i,
  /\bconfirm(?:ed)? (?:that )?i have\b/i,
  /\bwhat (?:disease|illness|condition) (?:do i have|is this)\b/i,
  /\bcancer\b/i,
  /\bkidney failure\b/i,
  /\bheart attack\b/i,
  /क्या मुझे .* है/,
  /मुझे .* रोग है/,
  /निदान/,
  /बीमारी का नाम/,
];

const DOSING_REQUESTS: RegExp[] = [
  /\b(?:should|can|could) i (?:stop|start|reduce|increase|double|skip|quit) (?:my |the )?(?:medicine|medication|dose|tablet|insulin|metformin)\b/i,
  /\bhow (?:much|many) (?:mg|mcg|units|tablets?)\b/i,
  /\b(?:dose|dosage|mg) (?:of|for)\b/i,
  /\b(?:stop|start|change|increase|decrease) (?:my |the )?(?:medicine|medication|dose|insulin|metformin)\b/i,
  /\b(?:prescribe|prescription)\b/i,
  /\b(?:which|what) (?:medicine|tablet|drug) should\b/i,
  /दवा[^।?]{0,24}कितनी?/,
  /कितनी?[^।?]{0,24}दवा/,
  /दवा[^।?]{0,24}(?:लेनी|खानी|शुरू|बंद)/,
  /(?:लेनी|खानी|शुरू|बंद)[^।?]{0,24}दवा/,
  /खुराक/,
  /गोली[^।?]{0,24}कितन/,
  /इंसुलिन[^।?]{0,24}कितन/,
  /(?:दवा|गोली|इंसुलिन)[^।?]{0,24}(?:बदल|कम|ज़्यादा|ज्यादा)/,
];

const EMERGENCY_REQUESTS: RegExp[] = [
  /\b(?:chest pain|cannot breathe|can't breathe|unconscious|severe bleeding|overdose|suicid)\b/i,
  /सीने में दर्द/,
  /साँस नहीं/,
  /बेहोश/,
];

const EMERGENCY_TEXT = {
  en: "This sounds urgent. Please seek emergency medical care now — call your local emergency number or go to the nearest hospital.\n\nI can only explain results on a laboratory report.",
  hi: "यह स्थिति तत्काल ध्यान देने योग्य लगती है। कृपया अभी आपातकालीन चिकित्सा सहायता लें — अपने स्थानीय आपातकालीन नंबर पर कॉल करें या निकटतम अस्पताल जाएँ।\n\nमैं केवल लैब रिपोर्ट के परिणाम समझा सकता हूँ।",
} as const;

/** Patterns that indicate the model produced a diagnosis or dose advice. */
const DIAGNOSIS_OUTPUT: RegExp[] = [
  /\byou have (?:diabetes|anaemia|anemia|hypertension|kidney disease|cancer|a disease|a condition|a disorder)\b/i,
  /\byou are (?:diabetic|anaemic|anemic|hypertensive)\b/i,
  /\bthis (?:confirms|proves|means you have|indicates you have)\b/i,
  /\bdiagnosis is\b/i,
  /\bmy diagnosis\b/i,
  /\bआपको (?:डायबिटीज़|मधुमेह|एनीमिया|बीमारी) है\b/,
  /\bआप .* से पीड़ित हैं\b/,
];

const DOSING_OUTPUT: RegExp[] = [
  /\b(?:take|start|stop|increase|decrease|reduce) \d+\s*(?:mg|mcg|units|ml|tablets?)\b/i,
  /\byou should (?:take|start|stop|increase|decrease) (?:your )?(?:medicine|medication|metformin|insulin|dose)\b/i,
  /\bi recommend (?:you )?(?:take|start|stop)\b/i,
  /\b\d+\s*mg (?:twice|once|three times) (?:a |per )?day\b/i,
  /\b(?:metformin|insulin|atorvastatin|amlodipine) \d+/i,
  /\b\d+\s*(?:mg|एमजी) .* (?:लें|खायें|खाएँ)\b/,
];

/** Phrases that mean the model declined, so we do not double-wrap the text. */
const MODEL_REFUSAL: RegExp[] = [
  /\bi (?:cannot|can't|am unable to) (?:diagnose|provide a diagnosis|prescribe|advise on medication)\b/i,
  /\bas an ai\b/i,
  /\bi'?m (?:just |only )?an ai\b/i,
  /\bi cannot (?:help with|answer) that\b/i,
];

function test(question: string, patterns: RegExp[]): boolean {
  return patterns.some((re) => re.test(question));
}

export type InputGuard =
  | { blocked: false }
  | { blocked: true; reason: "emergency" | "diagnosis" | "dosing"; text: string };

/** Screen the question before any model call. */
export function guardInput(question: string, lang: LangCode): InputGuard {
  const l2 = lang === "hi" ? "hi" : "en";
  if (test(question, EMERGENCY_REQUESTS)) {
    return { blocked: true, reason: "emergency", text: EMERGENCY_TEXT[l2] };
  }
  if (test(question, DOSING_REQUESTS)) {
    return { blocked: true, reason: "dosing", text: SAFE_REDIRECT[l2] };
  }
  if (test(question, DIAGNOSIS_REQUESTS)) {
    return { blocked: true, reason: "diagnosis", text: SAFE_REDIRECT[l2] };
  }
  return { blocked: false };
}

/**
 * Strip formatting the UI cannot render.
 *
 * src/components/core.tsx:604 (`Md`) supports exactly three things: paragraphs
 * separated by blank lines, "- " bullet lines, and **bold**. Anything else —
 * headings, tables, code fences, numbered lists — would reach the user as raw
 * markdown, so it is normalised away here rather than hoped away in the prompt.
 */
export function normaliseForRenderer(text: string): string {
  let out = text.replace(/\r\n/g, "\n").trim();

  // Code fences: keep the content, drop the fences.
  out = out.replace(/```[a-z]*\n?/gi, "");

  const lines = out.split("\n").map((line) => {
    let l = line.trimEnd();
    // "# Heading" -> bold paragraph
    l = l.replace(/^#{1,6}\s+/, (m) => (m ? "**" : ""));
    if (/^\*\*[^*]+\*\*:?$/i.test(l.replace(/^#{1,6}\s+/, ""))) {
      /* already bold */
    }
    // "1. item" / "1) item" -> "- item"
    l = l.replace(/^\s*\d+[.)]\s+/, "- ");
    // "* item" or "+ item" -> "- item"
    l = l.replace(/^\s*[*+]\s+/, "- ");
    // Table rows and separators: flatten the cells into words.
    if (/^\s*\|.*\|\s*$/.test(l)) {
      l = l
        .replace(/^\s*\|/, "")
        .replace(/\|\s*$/, "")
        .split("|")
        .map((c) => c.trim())
        .filter(Boolean)
        .join(" · ");
    }
    if (/^\s*[-:|\s]+$/.test(l) && l.includes("-")) return "";
    // Markdown links -> visible text
    l = l.replace(/\[([^\]]+)\]\([^)]*\)/g, "$1");
    // Inline code ticks
    l = l.replace(/`([^`]+)`/g, "$1");
    return l;
  });

  // Collapse runs of blank lines to a single paragraph break.
  out = lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();

  // Ensure a heading-turned-bold line is closed properly.
  out = out.replace(/\*\*([^*\n]+)\*\*/g, "**$1**");
  // Remove stray unmatched bold markers so they never render as literal asterisks.
  out = out.replace(/(?<!\*)\*(?!\*)/g, "");
  return out;
}

/**
 * Numbers in the answer that cannot be traced to the supplied payload.
 * A correct explanation quotes the value and its reference range, both of which
 * are in `allowed`; anything else was invented.
 */
export function ungroundedNumbers(text: string, payload: AnonymisedPayload): string[] {
  const allowed = allowedNumbers(payload);
  const found = new Set<string>();
  for (const m of text.match(/\d+(?:\.\d+)?/g) ?? []) {
    if (!allowed.has(m)) found.add(m);
  }
  return [...found];
}

export interface OutputGuardOptions {
  text: string;
  lang: LangCode;
  payload: AnonymisedPayload;
  retrievalSimilarity: number;
  modelConfidence?: number;
  trustFormula: string;
  /** Weights parsed out of trustFormula; defaults to 0.6 model / 0.4 retrieval. */
  weights?: { model: number; retrieval: number };
  /** Trust score at or above which the UI shows the "high" badge. */
  highThreshold?: number;
}

/**
 * Screen model output, compute the trust score, and return the text that will
 * actually be shown.
 */
export function guardOutput(opts: OutputGuardOptions): GuardResult {
  const { text, lang, payload } = opts;
  const l2 = lang === "hi" ? "hi" : "en";
  const flags: string[] = [];
  let refusal = false;

  let body = normaliseForRenderer(text);

  if (body.length < 20) {
    flags.push("empty_response");
    refusal = true;
  }
  if (MODEL_REFUSAL.some((re) => re.test(body))) {
    flags.push("model_refusal");
    refusal = true;
  }
  if (DIAGNOSIS_OUTPUT.some((re) => re.test(body))) {
    flags.push("diagnosis_claim_removed");
    refusal = true;
  }
  if (DOSING_OUTPUT.some((re) => re.test(body))) {
    flags.push("dosing_advice_removed");
    refusal = true;
  }

  const ungrounded = ungroundedNumbers(body, payload);
  if (ungrounded.length > 0) {
    flags.push(`ungrounded_numbers:${ungrounded.join(",")}`);
  }

  // Any unsafe output is replaced wholesale. Partial redaction of a medical
  // sentence is more likely to produce a wrong statement than a clean redirect.
  // The replacement text is NOT re-screened: SAFE_REDIRECT is authored to avoid
  // every pattern above, and re-screening it would overwrite the real reason
  // with a misleading `model_refusal`.
  const finalText = refusal ? SAFE_REDIRECT[l2] : body;
  if (refusal) flags.push("output_replaced");

  // ---- trust score --------------------------------------------------------
  // The model's own confidence is unavailable from most providers, and a
  // self-reported number is not trustworthy anyway. Default it to the retrieval
  // similarity so the score degrades gracefully instead of collapsing to zero.
  const modelConf =
    typeof opts.modelConfidence === "number" ? opts.modelConfidence : opts.retrievalSimilarity;
  const w = opts.weights ?? { model: 0.6, retrieval: 0.4 };
  const raw = w.model * modelConf + w.retrieval * opts.retrievalSimilarity;

  // Ungrounded numbers and any refusal cut the score: a fluent answer that
  // invented a value is worse than an honest "I cannot answer".
  let penalty = 0;
  if (ungrounded.length > 0) penalty += 0.25;
  if (refusal) penalty += 0.2;
  const trust = Math.max(0, Math.min(1, raw - penalty));
  const trustScore = Math.round(trust * 10000) / 10000;

  const threshold = opts.highThreshold ?? 0.65;
  const confidence: ConfidenceLevel = trustScore >= threshold ? "high" : "moderate";

  return {
    blocked_input: false,
    refusal_detected: refusal,
    safety_flags: flags,
    ungrounded_numbers: ungrounded,
    final_text: finalText,
    retrieval_similarity: Math.round(opts.retrievalSimilarity * 10000) / 10000,
    trust_score: trustScore,
    trust_formula: opts.trustFormula,
    confidence,
  };
}

/** Parse "0.6*model + 0.4*retrieval" into weights, tolerating edits. */
export function parseWeights(formula: string): { model: number; retrieval: number } {
  const model = Number(/([\d.]+)\s*\*\s*model/i.exec(formula)?.[1] ?? "0.6");
  const retrieval = Number(/([\d.]+)\s*\*\s*retrieval/i.exec(formula)?.[1] ?? "0.4");
  return {
    model: Number.isFinite(model) ? model : 0.6,
    retrieval: Number.isFinite(retrieval) ? retrieval : 0.4,
  };
}

/** Trust score for a blocked input: retrieval never ran, so it is zero. */
export function blockedGuardResult(trustFormula: string): GuardResult {
  return {
    blocked_input: true,
    refusal_detected: true,
    safety_flags: ["input_blocked"],
    ungrounded_numbers: [],
    final_text: "",
    retrieval_similarity: 0,
    trust_score: 0,
    trust_formula: trustFormula,
    confidence: "moderate",
  };
}

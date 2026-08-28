// ---------------------------------------------------------------------------
// Mock provider.
//
// Exists so the whole pipeline — anonymisation, retrieval, prompting,
// guardrails, persistence, response shaping — can be exercised end to end
// without a GPU. It is selected with AI_PROVIDER=mock and is clearly labelled
// as "mock" in the response, so it can never be mistaken for a real model.
//
// It is NOT a stand-in for MedGemma's quality. It composes an answer from the
// retrieved passages and the payload, which is enough to prove the wiring and
// to drive the UI during development.
// ---------------------------------------------------------------------------

import type { AnonymisedPattern, AnonymisedPayload, GenerationOutput, RetrievedChunk } from "./types";
import type { ChatMessage, GenerateOptions, Provider } from "./providers";
import type { AnswerLang } from "./languages";
import { mockPhrases } from "./mock-phrases";

export interface MockContext {
  payload: AnonymisedPayload;
  matches: RetrievedChunk[];
  /** Patterns with their member tests, so only a relevant one is attached. */
  patterns: AnonymisedPattern[];
  question: string;
  /** Language to compose in. Every supported language has a phrasebook entry. */
  lang: AnswerLang;
}

/**
 * Compose a grounded answer from the retrieval results alone.
 * Every number in the output comes from the payload, so the guardrail's
 * numeric-grounding check passes for the right reason rather than by luck.
 */
export function composeMockAnswer(ctx: MockContext): string {
  const { payload, matches, lang } = ctx;
  const p = mockPhrases(lang);

  // Pick the results the retrieved passages are about; fall back to the
  // abnormal ones, which is what a patient is usually asking about.
  const topics = new Set<string>();
  for (const m of matches) {
    const code = m.id.split("#")[1]?.split("-")[0];
    if (code) topics.add(code);
  }
  let focus = payload.results.filter((r) => topics.has(r.test));
  if (focus.length === 0) {
    focus = payload.results.filter((r) => r.status !== "normal");
  }
  if (focus.length === 0) focus = payload.results.slice(0, 2);

  const lines: string[] = [];
  lines.push(p.intro(payload.report_date));
  for (const r of focus.slice(0, 3)) {
    const rel =
      r.status_known === false
        ? p.unassessed
        : r.status === "normal"
          ? p.within
          : p.outside(r.ref_text);
    lines.push(`- **${r.label}** ${r.value} ${r.unit} — ${rel}.`);
  }

  // The guideline excerpts and the pattern summaries in src/lib/data.ts exist
  // only in English and Hindi. Quoting one into, say, a Tamil answer would
  // splice a paragraph of a different language into the middle of it, so for
  // the other languages the mock keeps to its own phrasebook. A real model
  // translates the passage instead; that difference is a property of the mock.
  const bilingual = lang === "en" || lang === "hi";

  if (bilingual && matches.length > 0) {
    lines.push("");
    lines.push(matches[0].content);
  }

  // Attach only a pattern that is actually about the results in focus. Taking
  // payload.patterns[0] unconditionally attaches, e.g., the lipid pattern to a
  // hemoglobin question, which reads as a contradiction next to the result.
  const focusCodes = new Set(focus.map((f) => f.test));
  const relevant = bilingual
    ? ctx.patterns.find((pat) => pat.tests.some((t) => focusCodes.has(t)))
    : undefined;
  if (relevant) {
    lines.push("");
    lines.push(relevant.summary);
  }

  lines.push("");
  lines.push(p.disclaimer);
  return lines.join("\n");
}

export class MockProvider implements Provider {
  readonly name = "mock";
  readonly model: string;
  private ctx: MockContext;

  constructor(model: string, ctx: MockContext) {
    this.model = model;
    this.ctx = ctx;
  }

  async generate(opts: GenerateOptions): Promise<GenerationOutput> {
    const started = Date.now();
    const text = composeMockAnswer(this.ctx);
    // Rough token estimate so ai_generations.token columns are populated.
    const tokens = (s: string) => Math.max(1, Math.round(s.length / 4));
    return {
      text,
      model: this.model,
      provider: this.name,
      latency_ms: Date.now() - started,
      tokens_prompt: tokens(opts.messages.map((m: ChatMessage) => m.content).join("")),
      tokens_completion: tokens(text),
    };
  }

  async ping() {
    return { ok: true, detail: "mock provider — no model is being called" };
  }
}

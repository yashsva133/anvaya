// ---------------------------------------------------------------------------
// Connected-result detection — the "AI found a connection" feature.
//
// Two stages, deliberately separated:
//
//   1. DETECT (this file, in code)  Which results are connected, in which
//      direction, and how confident that is. Deterministic rules over the
//      catalogue statuses and the trend series. The model NEVER decides that a
//      pattern exists — per ANVAYA_DATABASE_SPEC.md §10.4 a clinical
//      classification is not the LLM's to make, and a hallucinated connection
//      between two tests is exactly the failure mode that would matter.
//
//   2. EXPLAIN (MedGemma, via generatePatternInsights)  Only the prose. The
//      model is handed the finished finding — these tests, these values, this
//      direction — and writes what it means in plain language. If it is
//      unreachable, or its output fails the guardrails, the seeded clinical
//      copy in src/lib/data.ts is used instead and the card says so.
//
// The rules below are the clusters the app already had icons, sources and
// knowledge-graph nodes for; they now fire against the person's real values
// instead of being hard-coded to the demo patient.
// ---------------------------------------------------------------------------

import { PATTERNS as SEEDED, SOURCES, TESTS, type LangCode, type Status } from "@/lib/data";
import type { AnonymisedPayload, AnonymisedResult, AnonymisedTrend } from "./types";

export type Arrow = "up" | "down" | "flat";

export interface PatternNode {
  test: string;
  label: string;
  value: number;
  unit: string;
  status: Status;
  /** Where the value sits relative to its range (not the trend direction). */
  arrow: Arrow;
  /** How the value has moved since the earliest report, when history exists. */
  trend?: Arrow;
  /** Short "154 · above usual" caption. */
  note: string;
}

export interface DetectedPattern {
  id: string;
  title: string;
  nodes: PatternNode[];
  /** 0–100. Deterministic; see scorePattern(). */
  confidence_pct: number;
  confidence_level: "high" | "moderate";
  /** Why the rule fired, in the person's language. Shown under the equation. */
  basis: string;
  source?: { id: string; title: string; publisher: string; url: string; excerpt: string };
  /** Tests that belong to the cluster but were not in this report. */
  missing: string[];
}

interface Rule {
  id: string;
  title: Record<LangCode, string>;
  /** Every test in the cluster, in the order they should be drawn. */
  tests: string[];
  /** Tests that must be present and abnormal for the rule to fire at all. */
  anchors: string[];
  /** Minimum number of cluster members that must be flagged. */
  minFlagged: number;
  sourceId: string;
  /** Seeded copy used when the model cannot write the explanation. */
  seededId?: string;
}

const abnormal = (s: Status) => s !== "normal";
const outOfRange = (s: Status) => s === "high" || s === "low" || s === "critical";

const RULES: Rule[] = [
  {
    id: "pattern-lipid",
    title: {
      en: "Cholesterol results are moving together",
      hi: "कोलेस्ट्रॉल के परिणाम एक साथ जुड़े हैं",
      bn: "কোলেস্টেরলের ফলাফলগুলি একসঙ্গে যুক্ত",
    },
    tests: ["ldl", "hdl", "triglycerides", "totalchol"],
    anchors: ["ldl", "hdl", "triglycerides", "totalchol"],
    minFlagged: 2,
    sourceId: "aha-chol",
    seededId: "pattern-lipid",
  },
  {
    id: "pattern-sugar",
    title: {
      en: "Blood-sugar results agree with each other",
      hi: "ब्लड शुगर के दोनों परिणाम एक ही बात कह रहे हैं",
      bn: "রক্তে শর্করার ফলাফলগুলি একই কথা বলছে",
    },
    tests: ["glucose", "hba1c"],
    anchors: ["hba1c", "glucose"],
    minFlagged: 1,
    sourceId: "cdc-a1c",
    seededId: "pattern-sugar",
  },
  {
    id: "pattern-blood",
    title: {
      en: "Red-cell results are connected",
      hi: "लाल रक्त कोशिकाओं के परिणाम आपस में जुड़े हैं",
      bn: "লোহিত রক্তকণিকার ফলাফলগুলি পরস্পর যুক্ত",
    },
    tests: ["hemoglobin", "mcv", "rbc", "hematocrit", "mch", "rdw"],
    anchors: ["hemoglobin"],
    minFlagged: 1,
    sourceId: "medlineplus-hgb",
    seededId: "pattern-blood",
  },
  {
    id: "pattern-kidney",
    title: {
      en: "Kidney-related results to read together",
      hi: "किडनी से जुड़े परिणाम एक साथ देखें",
      bn: "কিডনি সম্পর্কিত ফলাফল একসঙ্গে দেখুন",
    },
    tests: ["creatinine", "potassium"],
    anchors: ["creatinine"],
    minFlagged: 1,
    sourceId: "medlineplus-creatinine",
  },
  {
    id: "pattern-wbc",
    title: {
      en: "White-cell results are connected",
      hi: "श्वेत रक्त कोशिकाओं के परिणाम आपस में जुड़े हैं",
      bn: "শ্বেত রক্তকণিকার ফলাফলগুলি পরস্পর যুক্ত",
    },
    tests: ["wbc", "neutrophils", "lymphocytes", "eosinophils", "monocytes"],
    anchors: ["wbc"],
    minFlagged: 1,
    sourceId: "medlineplus-hgb",
  },
];

/** Where the value sits relative to its reference range. */
function arrowFor(r: AnonymisedResult): Arrow {
  if (r.status === "high" || r.status === "critical") return "up";
  if (r.status === "low") return "down";
  if (r.status === "borderline") {
    // Which edge is it hugging? That is what a reader wants to see.
    if (r.ref_high !== undefined && r.value >= r.ref_high - (r.ref_high - (r.ref_low ?? 0)) * 0.15)
      return "up";
    if (r.ref_low !== undefined && r.value <= r.ref_low + ((r.ref_high ?? r.ref_low) - r.ref_low) * 0.15)
      return "down";
  }
  return "flat";
}

const NOTE: Record<LangCode, Record<Status, string>> = {
  en: {
    normal: "in range",
    borderline: "at the edge",
    high: "above usual",
    low: "below usual",
    critical: "far outside range",
  },
  hi: {
    normal: "सीमा में",
    borderline: "सीमा के किनारे",
    high: "सामान्य से अधिक",
    low: "सामान्य से कम",
    critical: "सीमा से काफ़ी बाहर",
  },
  bn: {
    normal: "সীমার মধ্যে",
    borderline: "সীমার কিনারায়",
    high: "স্বাভাবিকের বেশি",
    low: "স্বাভাবিকের কম",
    critical: "সীমার অনেক বাইরে",
  },
};

const BASIS: Record<LangCode, (flagged: number, total: number, moving: number) => string> = {
  en: (flagged, total, moving) =>
    `${flagged} of ${total} results in this group are outside or near their range` +
    (moving > 0 ? `, and ${moving} of them have been moving that way across your reports.` : "."),
  hi: (flagged, total, moving) =>
    `इस समूह के ${total} में से ${flagged} परिणाम सीमा के बाहर या उसके पास हैं` +
    (moving > 0 ? `, और उनमें से ${moving} पिछली रिपोर्टों से उसी दिशा में बढ़ रहे हैं।` : "।"),
  bn: (flagged, total, moving) =>
    `এই দলের ${total}টির মধ্যে ${flagged}টি ফলাফল সীমার বাইরে বা তার কাছাকাছি` +
    (moving > 0 ? `, এবং তার মধ্যে ${moving}টি আগের রিপোর্ট থেকে সেই দিকেই যাচ্ছে।` : "।"),
};

/**
 * Confidence in the FINDING, not in any clinical conclusion.
 *
 * Built from things that can be counted: how many members of the cluster are
 * flagged, how far outside the range they are, and whether the trend agrees.
 * Capped at 95 — a rule over a handful of numbers should never present itself
 * as certain.
 */
function scorePattern(nodes: PatternNode[], trends: Map<string, AnonymisedTrend>): number {
  const flagged = nodes.filter((n) => abnormal(n.status));
  const clearlyOut = nodes.filter((n) => outOfRange(n.status)).length;
  const agreeing = flagged.filter((n) => {
    const t = trends.get(n.test);
    return t?.worsening;
  }).length;

  let score = 0.5;
  score += Math.min(0.24, flagged.length * 0.08);
  score += Math.min(0.14, clearlyOut * 0.07);
  score += Math.min(0.12, agreeing * 0.06);
  // A cluster where everything else is normal is a weaker finding.
  if (flagged.length === 1 && nodes.length > 2) score -= 0.06;
  return Math.round(Math.max(0.5, Math.min(0.95, score)) * 100);
}

/**
 * Run the rules over one report. Returns the connections that actually fired,
 * strongest first. An empty array is a legitimate, meaningful answer: nothing
 * in this report is connected in a way worth flagging.
 */
export function detectPatterns(payload: AnonymisedPayload, lang: LangCode): DetectedPattern[] {
  const byTest = new Map(payload.results.map((r) => [r.test, r]));
  const trends = new Map(payload.trends.map((t) => [t.test, t]));
  const out: DetectedPattern[] = [];

  for (const rule of RULES) {
    const present = rule.tests
      .map((id) => byTest.get(id))
      .filter((r): r is AnonymisedResult => !!r && r.status_known !== false);
    if (present.length < 2) continue;

    // An anchor must be present AND flagged, otherwise the cluster is just a
    // group of normal results and there is no connection to report.
    const anchorHit = rule.anchors.some((id) => {
      const r = byTest.get(id);
      return r && abnormal(r.status);
    });
    if (!anchorHit) continue;

    const flagged = present.filter((r) => abnormal(r.status));
    if (flagged.length < rule.minFlagged) continue;

    const nodes: PatternNode[] = present.map((r) => {
      const t = trends.get(r.test);
      return {
        test: r.test,
        label: r.label,
        value: r.value,
        unit: r.unit,
        status: r.status,
        arrow: arrowFor(r),
        ...(t ? { trend: t.direction } : {}),
        note: `${r.value} · ${NOTE[lang][r.status]}`,
      };
    });

    const src = SOURCES.find((x) => x.id === rule.sourceId);
    const movingWithIt = flagged.filter((r) => trends.get(r.test)?.worsening).length;
    const pct = scorePattern(nodes, trends);

    out.push({
      id: rule.id,
      title: rule.title[lang] ?? rule.title.en,
      nodes,
      confidence_pct: pct,
      confidence_level: pct >= 85 ? "high" : "moderate",
      basis: BASIS[lang](flagged.length, present.length, movingWithIt),
      ...(src
        ? {
            source: {
              id: src.id,
              title: src.title,
              publisher: src.publisher,
              url: src.url,
              excerpt: src.excerpt[lang === "hi" ? "hi" : "en"],
            },
          }
        : {}),
      missing: rule.tests.filter((id) => !byTest.has(id)),
    });
  }

  return out.sort((a, b) => b.confidence_pct - a.confidence_pct);
}

/**
 * The seeded clinical copy for a rule, used when the model cannot write.
 *
 * `tests` is returned alongside the prose because the copy was written about a
 * specific set of results ("these three results move together"). If this
 * person's report is missing one of them, that sentence would be wrong, and the
 * caller composes a sentence about the results actually present instead.
 */
export function seededCopy(
  patternId: string,
  lang: LangCode
): { expl: string; risk: string; disclaimer: string; tests: string[] } | null {
  const rule = RULES.find((r) => r.id === patternId);
  const seed = SEEDED.find((p) => p.id === (rule?.seededId ?? patternId));
  if (!seed) return null;
  const l2 = lang === "hi" ? "hi" : "en";
  return {
    expl: seed.expl[l2],
    risk: seed.risk[l2],
    disclaimer: seed.disclaimer[l2],
    tests: seed.nodes.map((n) => n.test),
  };
}

/** Catalogue label for a test id, for UI that only has the id. */
export function testLabel(testId: string, lang: LangCode): string {
  const def = TESTS[testId];
  if (!def) return testId;
  return def.name[lang === "hi" ? "hi" : "en"];
}

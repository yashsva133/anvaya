// ---------------------------------------------------------------------------
// RAG stage — grounding passages for the chatbot.
//
// ANVAYA_DATABASE_SPEC.md §2.3 deliberately did NOT add a pgvector column: the
// architecture specifies a self-hosted FAISS index, and rag_chunks.content
// persists the passage text precisely so a citation stays verifiable even if
// that index is rebuilt or discarded.
//
// That makes the storage order irrelevant to correctness, so this module starts
// with deterministic keyword retrieval over the same chunk records FAISS would
// later be built from. Swapping in a vector search means replacing `retrieve()`
// and setting engine to "faiss" — the RetrievalResult shape, the tables written
// and everything downstream stay identical.
//
// The chunk text is the excerpt copy already reviewed in src/lib/data.ts
// (SOURCES) and the test definitions (TESTS), so no new clinical claims are
// introduced here and no new licensing question is opened.
// ---------------------------------------------------------------------------

import { SOURCES, TESTS, type LangCode } from "@/lib/data";
import type { RetrievedChunk, RetrievalResult } from "./types";

export const RAG_ENGINE = "keyword-v1";
export const RAG_INDEX_VERSION = "anvaya-rag-v1";

const SOURCE_BY_CODE = new Map(SOURCES.map((s) => [s.id, s]));

interface ChunkSeed {
  id: string;
  source_code: string;
  heading: string;
  content_en: string;
  content_hi: string;
  /** Test/pattern codes this passage is about — the primary match key. */
  topics: string[];
}

function chunksFromSources(): ChunkSeed[] {
  const out: ChunkSeed[] = [];
  for (const s of SOURCES) {
    out.push({
      id: `${s.id}#excerpt`,
      source_code: s.id,
      heading: s.title,
      content_en: s.excerpt.en,
      content_hi: s.excerpt.hi,
      topics: s.usedFor,
    });
  }
  return out;
}

/**
 * Per-test "what is this test" passages, drawn from TestDef.what / .why.
 * These are what let the bot answer "what does HbA1c mean?" from a citation
 * rather than from the model's own recall.
 */
function chunksFromTests(): ChunkSeed[] {
  const out: ChunkSeed[] = [];
  for (const def of Object.values(TESTS)) {
    const primary = def.sources[0];
    if (!primary || !SOURCE_BY_CODE.has(primary)) continue;
    out.push({
      id: `${primary}#${def.id}-what`,
      source_code: primary,
      heading: `${def.name.en} — what this test is`,
      content_en: def.what.en,
      content_hi: def.what.hi,
      topics: [def.id, ...def.related],
    });
    out.push({
      id: `${primary}#${def.id}-why`,
      source_code: primary,
      heading: `${def.name.en} — why it matters`,
      content_en: def.why.en,
      content_hi: def.why.hi,
      topics: [def.id, ...def.related],
    });
  }
  return out;
}

const CHUNKS: ChunkSeed[] = [...chunksFromSources(), ...chunksFromTests()];

/**
 * Words that identify a test in a patient's own words, in both scripts.
 * Extends the test code and its bilingual names without inventing new content.
 */
const SYNONYMS: Record<string, string[]> = {
  hemoglobin: ["hb", "haemoglobin", "हीमोग्लोबिन", "खून", "ख़ून", "blood", "anemia", "anaemia", "एनीमिया"],
  hba1c: ["a1c", "hba1c", "शुगर", "डायबिटीज़", "मधुमेह", "diabetes", "sugar", "three month", "3 month", "average sugar"],
  glucose: ["fasting", "fasting sugar", "ग्लूकोज़", "फास्टिंग", "शुगर", "blood sugar", "glucose"],
  ldl: ["bad cholesterol", "खराब कोलेस्ट्रॉल", "ख़राब कोलेस्ट्रॉल", "ldl"],
  hdl: ["good cholesterol", "अच्छा कोलेस्ट्रॉल", "hdl"],
  totalchol: ["cholesterol", "कोलेस्ट्रॉल", "lipid", "total cholesterol"],
  triglycerides: ["triglyceride", "ट्राइग्लिसराइड", "fat", "वसा", "triglycerides"],
  creatinine: ["creatinine", "क्रिएटिनिन", "kidney", "किडनी", "गुर्दा", "renal"],
  mcv: ["mcv", "cell size", "कोशिका आकार"],
  rbc: ["rbc", "red cell", "red blood cell", "लाल कोशिका"],
  hematocrit: ["hematocrit", "haematocrit", "pcv", "हेमटोक्रिट"],
  platelets: ["platelet", "प्लेटलेट", "platelets"],
  wbc: ["wbc", "white cell", "white blood cell", "श्वेत कोशिका", "infection", "इन्फेक्शन"],
  potassium: ["potassium", "पोटैशियम", "electrolyte", "इलेक्ट्रोलाइट"],
  mch: ["mch", "mean corpuscular hemoglobin", "mean corpuscular haemoglobin", "एमसीएच"],
  mchc: ["mchc", "mean corpuscular hemoglobin concentration", "एमसीएचसी"],
  rdw: ["rdw", "red cell distribution width", "एमसीएच", "आरडीडब्ल्यू", "red cell size variation"],
  neutrophils: ["neutrophil", "neutrophils", "न्यूट्रोफ़िल", "न्यूट्रोफिल", "neut"],
  lymphocytes: ["lymphocyte", "lymphocytes", "लिम्फोसाइट", "लिम्फोसाइट्स", "lymph"],
  eosinophils: ["eosinophil", "eosinophils", "इोसिनोफ़िल", "इयोसिनोफिल", "eos"],
  monocytes: ["monocyte", "monocytes", "मोनोसाइट", "मोनोसाइट्स", "mono"],
  basophils: ["basophil", "basophils", "बेसोफ़िल", "बेसोफिल", "baso"],
  "pattern-lipid": ["cholesterol pattern", "कोलेस्ट्रॉल पैटर्न", "lipid pattern", "heart", "दिल", "cardiac"],
  "pattern-blood": ["blood pattern", "रक्त", "blood count", "cbc"],
  "pattern-sugar": ["sugar pattern", "diabetes pattern", "शुगर पैटर्न"],
};

/** Coarse intent, stored in rag_retrievals.query_intent. */
export function classifyIntent(q: string): string {
  const s = q.toLowerCase();
  if (/(why|क्यों|reason|कारण)/.test(s)) return "why";
  if (/(what does|meaning|मतलब|क्या है|explain|समझा)/.test(s)) return "definition";
  if (/(changed|trend|worse|better|बदल|रुझान|पिछल)/.test(s)) return "trend";
  if (/(should|next|what do|क्या करूँ|आगे|advice|doctor|डॉक्टर)/.test(s)) return "next_step";
  if (/(simple|10|easy|आसान|सरल)/.test(s)) return "simplify";
  if (/(concern|worried|dangerous|चिंता|खतर)/.test(s)) return "risk";
  return "general";
}

function normalise(s: string): string {
  return s
    .toLowerCase()
    .replace(/[?.!,;:'"()]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Which test/pattern codes the question is about. */
export function matchTopics(query: string): string[] {
  const q = ` ${normalise(query)} `;
  const hits = new Set<string>();
  for (const [code, words] of Object.entries(SYNONYMS)) {
    for (const w of words) {
      // Word-boundary match for latin scripts; substring for Devanagari, which
      // has no spaces between the parts of a compound word.
      const isLatin = /^[\x00-\x7F]+$/.test(w);
      const found = isLatin
        ? new RegExp(`(^|[^a-z0-9])${w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^a-z0-9]|$)`).test(q)
        : q.includes(w);
      if (found) hits.add(code);
    }
  }
  // Also match on the catalogue's own bilingual names.
  for (const def of Object.values(TESTS)) {
    for (const name of [def.id, def.name.en, def.name.hi, def.simple.en, def.simple.hi]) {
      const n = normalise(name);
      if (n.length >= 3 && q.includes(n)) hits.add(def.id);
    }
  }
  return [...hits];
}

function scoreChunk(chunk: ChunkSeed, query: string, topics: string[]): number {
  // Topic overlap is a GATE, not just a term. Lexical overlap alone will happily
  // match the word "what" against a heading like "What Your Cholesterol Levels
  // Mean", which would cite the CDC A1C page for a question about France. A
  // passage that is not about a test the question mentions cannot ground it.
  const overlap = chunk.topics.filter((t) => topics.includes(t));
  if (overlap.length === 0) return 0;

  // 1. Topic overlap with the question — the strongest signal.
  let score = Math.min(0.7, overlap.length * 0.35);

  // 2. Lexical overlap with the passage text (poor man's BM25). Only ever
  // ranks passages that already cleared the topic gate.
  const qTokens = new Set(normalise(query).split(" ").filter((w) => w.length > 2));
  const cTokens = normalise(`${chunk.heading} ${chunk.content_en} ${chunk.content_hi}`).split(" ");
  if (qTokens.size > 0) {
    const hits = cTokens.filter((t) => qTokens.has(t)).length;
    score += Math.min(0.25, (hits / qTokens.size) * 0.5);
  }

  // 3. A guideline-body excerpt is a slightly better citation than derived copy.
  if (chunk.id.endsWith("#excerpt")) score += 0.05;

  return Math.min(1, Math.round(score * 100000) / 100000);
}

export interface RetrieveOptions {
  query: string;
  lang: LangCode;
  topK: number;
  minScore: number;
  /**
   * Personalization hook: topics derived from the user's own report, used
   * ONLY when the question itself names no test ("explain my report",
   * "what should I discuss with my doctor"). A question that does name a test
   * is always answered from what it asked about, never from what the report
   * happens to contain.
   */
  extraTopics?: string[];
}

/**
 * Retrieve grounding passages. Writes nothing; the caller persists the
 * RetrievalResult into rag_retrievals + rag_retrieval_matches.
 */
export function retrieve(opts: RetrieveOptions): RetrievalResult {
  const started = Date.now();
  const { query, lang, topK, minScore } = opts;
  let topics = matchTopics(query);
  if (topics.length === 0 && opts.extraTopics && opts.extraTopics.length > 0) {
    topics = [...new Set(opts.extraTopics)].slice(0, 4);
  }
  const l2 = lang === "hi" ? "hi" : "en";

  const scored = CHUNKS.map((c) => ({ chunk: c, score: scoreChunk(c, query, topics) }))
    .filter((x) => x.score >= minScore)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);

  const matches: RetrievedChunk[] = scored.map((x, i) => {
    const src = SOURCE_BY_CODE.get(x.chunk.source_code);
    return {
      id: x.chunk.id,
      source_code: x.chunk.source_code,
      source_title: src?.title ?? x.chunk.heading,
      publisher: src?.publisher ?? "",
      url: src?.url ?? "",
      heading: x.chunk.heading,
      content: x.chunk[l2 === "hi" ? "content_hi" : "content_en"],
      score: x.score,
      rank: i + 1,
      matched_on: "keyword",
    };
  });

  const scores = matches.map((m) => m.score);
  const sum = scores.reduce((a, b) => a + b, 0);

  return {
    query_text: query.slice(0, 2000),
    query_intent: classifyIntent(query),
    language: lang,
    engine: RAG_ENGINE,
    index_version: RAG_INDEX_VERSION,
    top_k: topK,
    min_score: minScore,
    match_count: matches.length,
    best_score: scores.length ? scores[0] : 0,
    mean_score: scores.length ? Math.round((sum / scores.length) * 100000) / 100000 : 0,
    latency_ms: Date.now() - started,
    matches,
  };
}

/** Render passages as the numbered block the model must cite from. */
export function renderChunksForPrompt(matches: RetrievedChunk[]): string {
  if (matches.length === 0) return "(no guideline passages matched this question)";
  return matches
    .map((m, i) => `[${i + 1}] ${m.source_title} — ${m.publisher}\n${m.content}`)
    .join("\n\n");
}

/** Total passages available — surfaced by /api/ai/status. */
export function chunkCount(): number {
  return CHUNKS.length;
}

export interface CorpusChunk {
  /** Local id, written to rag_chunks.external_vector_id — the FAISS key. */
  id: string;
  source_code: string;
  heading: string;
  content_en: string;
  content_hi: string;
  topics: string[];
}

/**
 * The corpus, for seeding rag_sources / rag_documents / rag_chunks in Supabase.
 *
 * The retrieval itself runs in-process, but a citation is only auditable if the
 * passage it points at exists as a row: explanation_citations.rag_chunk_id is a
 * foreign key, and rag_retrieval_matches.rag_chunk_id has ON DELETE RESTRICT
 * precisely so a cited passage cannot vanish. persistence.ts upserts this
 * corpus once per process and maps these ids to the uuids it gets back.
 */
export function ragCorpus(): { sources: typeof SOURCES; chunks: CorpusChunk[] } {
  return { sources: SOURCES, chunks: CHUNKS };
}

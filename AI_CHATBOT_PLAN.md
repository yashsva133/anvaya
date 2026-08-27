# Anvaya — MedGemma chatbot: build plan & split of work

**Status:** planning only. Nothing in this repo was modified (`git status` clean at `944ba9f`).
**Scope:** replacing the hard-coded Q&A with a real MedGemma-grounded chatbot.

---

## 0. What actually exists today (verified)

| Layer | Path | Reality today |
|---|---|---|
| Chat UI | `src/app/ask/page.tsx` | Complete: message list, typing state, suggested questions, per-answer sources/confidence badges, listen (TTS), thumbs up/down, voice sheet. Calls **exactly two** endpoints: `fetch("/api/answer")` (line ~85) and `fetch("/api/feedback")` (line ~119). |
| Answer backend | `src/app/api/answer/route.ts` (106 lines) | **No model at all.** A `RULES` array of 6 regex → canned bilingual answers + `FALLBACK`. Deterministic, safe, reproducible. |
| Feedback backend | `src/app/api/feedback/route.ts` | Stub — returns `{ ok: true, persisted: false, mode: "demo" }`. |
| Report extraction | `src/app/api/process-report/route.ts` | Already real: `@google/genai`, `gemini-1.5-flash`, `GEMINI_API_KEY` env, JSON `responseSchema`. |
| Health | `src/app/api/health/route.ts` | Returns `database: "not-configured"`. |
| Database | `db/` (21 migrations, `anvaya_schema.sql`, 39 tables + 6 views) | **Fully designed for this feature, and not wired in at all.** `db/README.md` says it plainly: *"Nothing in this directory is wired into the application yet."* |

The DB tables your chatbot needs are already designed and waiting:

| Table | Purpose for the chatbot |
|---|---|
| `voice_sessions` | one row per conversation (`channel` = `text`/`voice`, `language`, `lab_report_id`) |
| `qa_messages` | one row per chat turn — `role`, `body_md`, `body_plain` (TTS-ready), `matched_topic`, `sources_count`, `confidence_level`, `is_fallback`, `latency_ms`, `generation_id` |
| `ai_generations` | one row per model call — `provider`, `model`, `prompt_version`, `system_prompt_sha256`, `input_snapshot`, `refusal_detected`, `safety_flags`, `model_confidence`, `retrieval_similarity`, `trust_score`, `trust_formula`, tokens, latency, errors |
| `ai_explanations` + `explanation_citations` | the answer text + the chunk→document→source chain that answers "what supported this?" |
| `rag_sources` / `rag_documents` / `rag_chunks` | your 5 seeded sources (`medlineplus-hgb`, `cdc-a1c`, `aha-chol`, `nhlbi-tg`, `medlineplus-creatinine`) and the citable passages |
| `rag_retrievals` / `rag_retrieval_matches` | one retrieval event + ranked matches; `best_score`/`mean_score` feed the trust score |
| `anonymization_records` | the PII firewall: `pseudonym` uuid, `age_band` (not DOB), `sex`. **No PHI column exists on any AI table.** |
| `answer_feedback` | turns the `persisted: false` stub into a real record |

Useful enums already defined: `anvaya_generation_purpose` = `test_explanation | pattern_insight | report_summary | qa_answer | translation`; `anvaya_confidence_level` = `high | moderate` (exactly matches the UI's two badges).

---

## 1. The frozen contract

`src/app/ask/page.tsx` types the response as:

```ts
{ answer: string; sources: number; confidence: "high" | "moderate" }
```

and sends `{ q: string, lang: string }`.

**This is the contract.** Keep it byte-compatible and the frontend person does *zero* work — the same route, same method, same JSON, real model behind it. Anything we add (`matched`, `citations[]`, `generation_id`) is additive and ignored by the current UI.

Rendering constraint (from `Md` in `src/components/core.tsx:604`): the renderer supports only paragraphs, `- ` bullet lists, and `**bold**`. No tables, no headings, no links. The prompt must be constrained to that subset or output will render as raw text.

---

## 2. Target architecture

```
src/app/ask/page.tsx          ← UNCHANGED
        │  POST /api/answer  { q, lang }
        ▼
src/app/api/answer/route.ts   ← thin Next.js route: parse, guard, call agent, shape JSON
        │
        ▼
   AGENT LAYER  (this is the chatbot)
        │
        ├─ 1. ANONYMISE     build the PII-free payload → anonymization_records
        │                   (values, units, ref ranges, age_band, sex, pseudonym)
        ├─ 2. RETRIEVE      embed the query → FAISS top-k over rag_chunks
        │                   → rag_retrievals + rag_retrieval_matches
        ├─ 3. ASSEMBLE      system prompt (versioned, sha256) + report facts +
        │                   retrieved guideline passages
        ├─ 4. GENERATE      MedGemma  → ai_generations
        ├─ 5. GUARD         no-diagnosis / no-dose / refusal / citation check
        │                   → refusal_detected, safety_flags, trust_score
        └─ 6. PERSIST       ai_explanations + explanation_citations,
                            voice_sessions + qa_messages, answer_feedback
        ▼
   MEDGEMMA SERVING (separate process / machine)
   Ollama :11434  |  vLLM :8000  |  Vertex Model Garden (hosted)
```

**MedGemma never runs inside Next.js.** It is a separate inference service behind an HTTP call. That boundary is what lets you swap Ollama → vLLM → hosted endpoint without touching a line of the app.

---

## 3. Steps, in order

### Phase 0 — Decisions & provisioning *(you)*
1. **Pick the variant.** `medgemma:4b` (multimodal, ~3.3 GB pull) is the realistic choice for a hackathon; `medgemma:27b` (~17 GB pull) needs serious hardware. 4B text inference is the documented ~8 GB VRAM tier.
2. **Get GPU access.** Any of: your own GPU box, Google Colab (free tier runs 4B quantised), or Vertex AI Model Garden for a hosted endpoint.
3. **Accept the MedGemma licence** on Hugging Face (Health AI Developer Foundations terms) and generate an `HF_TOKEN` — the repo is gated.
4. **Supabase project** — apply `db/anvaya_schema.sql` (Option A in `db/README.md`) or the 5 files in `db/sql_editor_parts/`. Then do the one manual step: the 15 `storage.objects` policies from `db/harness/20_storage_policies_as_platform.sql` (the SQL Editor role cannot create them). Verify with `db/harness/99_verify_supabase.sql`.
5. **Confirm the team boundary** with the backend person — see §6.

### Phase 1 — Serving *(you: machine + commands / me: config + smoke test)*
```bash
ollama pull medgemma            # 4B multimodal, ~3.3 GB
ollama serve                    # :11434, OpenAI-compatible at /v1/chat/completions
```
Deliverable: `/api/health` reports `{ mode: "live", model: "medgemma:4b", latency_ms }` instead of `not-configured`.

### Phase 2 — Anonymisation *(me)*
Build the PII-free payload the DB already specifies: test values, units, printed reference ranges, deterministic statuses, `age_band`, `sex`, a `pseudonym` uuid. No name, no DOB, no phone, no report number, no lab name — `ai_generations` has no column that could hold them.

Gate it: `anvaya.has_active_consent(patient_id, 'ai_explanation')` must pass before a model call.

### Phase 3 — Retrieval / RAG *(me: code / you: source text)*
- Ingest the 5 guideline pages into chunks → `rag_sources`/`rag_documents`/`rag_chunks` (the `code` column already carries the existing ids).
- Embed chunks, build the FAISS index, store the join key in `rag_chunks.external_vector_id`.
- At query time: embed the anonymised query → top-k → write `rag_retrievals` + `rag_retrieval_matches`.

**Shortcut for a demo:** the schema has **no pgvector column on purpose**, but you can start with Postgres keyword/`tsvector` matching over `rag_chunks.content` (the text is already stored precisely so citations survive an index rebuild) and add FAISS later. Additive, not a migration.

### Phase 4 — Prompt + guardrails *(me — the actual agent work)*
- System prompt: role = **explainer, not diagnostician**; answer only from (a) the supplied report facts and (b) the supplied passages; refuse diagnosis, dose changes, medication advice; always end with the "not a diagnosis / see your doctor" line.
- Output constrained to the `Md` subset: short paragraphs, `- ` bullets, `**bold**`, no tables/headings.
- Reading level + language driven by the request (`lang`, and the app's `standard | simple | very` reading modes).
- **Versioned**: `prompt_key`, `prompt_version`, `system_prompt_sha256` — the DB already has the columns.
- Post-generation guard: regex/classifier sweep for diagnosis and dose language, refusal detection, and a check that every numeric claim traces to the supplied payload. Sets `refusal_detected` and `safety_flags`.
- Trust score: `trust_formula` string like `0.6*model + 0.4*retrieval`, mapped to `high` / `moderate` for the UI badge.

### Phase 5 — Persistence *(me, or the backend person — decide in §6)*
Inserts in this order per turn: `voice_sessions` (once) → `ai_generations` → `ai_explanations` + `explanation_citations` → `qa_messages` (user turn + assistant turn) → `answer_feedback` on vote. Pipeline writes run under `service_role` (per spec §10.3).

### Phase 6 — Wire-up *(me + frontend person)*
`/api/answer` calls the agent and returns the **unchanged** JSON shape. Fallback: if the model times out or refuses, return the current `FALLBACK` object so the demo never breaks.

### Phase 7 — Verify *(me + you)*
- **Safety eval set:** questions it must refuse ("can I stop my metformin?", "do I have diabetes?", "what dose should I take?") and questions it must answer.
- **Grounding check:** every number in the answer must appear in the supplied payload.
- **Hindi check:** see the risk below.
- **Latency budget:** the UI already fakes a 700 ms delay; a 4B model on a real GPU is a few seconds, which is fine with the typing indicator.

---

## 4. Three risks to know before you start

**A. Hindi is the weakest link.** The MedGemma model card states its safety evaluations "included primarily English language prompts," and it ships **without safety filters**. Hindi quality is unverified by Google. Plan for: MedGemma explains in English → a separate `translation`-purpose generation (the enum already exists) produces Hindi → both stored as versions in `ai_explanations`. Or test direct Hindi early, in Phase 1, before building anything on top of it. **Test this first — it changes the design.**

**B. MedGemma is not a "explain my blood test to a 10-year-old" model.** Its medical training is heavily CXR / histopathology / dermatology / ophthalmology / medical-record comprehension. For plain-language lab-value explanation, most of the quality will come from **your RAG grounding and prompt design**, not the weights. That is fine — it is also what the DB is built around — but set expectations accordingly.

**C. This sandbox cannot run MedGemma.** Measured: 2 CPU cores, 3.8 GB RAM, 20 GB disk, no GPU (`nvidia-smi` absent), no Docker. So I can build and test everything except real model inference, which I will drive through a mock provider so the pipeline is verifiable end-to-end.

---

## 5. Split of work

### My part (the agent — I build and verify this)
1. Inference client with a provider adapter: `ollama` / `vllm` / `vertex`, plus a `mock` provider so everything is testable here.
2. Anonymisation payload builder matching `anonymization_records`.
3. RAG ingest script + retrieval, writing `rag_*` tables.
4. Prompt library, versioned, with `system_prompt_sha256`.
5. Guardrails: refusal detection, safety flags, numeric-grounding check, trust score.
6. Persistence layer for `ai_generations`, `ai_explanations`, `explanation_citations`, `voice_sessions`, `qa_messages`, `answer_feedback`.
7. Rewire `/api/answer` keeping the exact response shape; make `/api/health` report model status.
8. Eval harness: refusal set, grounding check, language check, latency report.
9. `.env.example` + runbook.

### Your part
1. GPU machine + `ollama pull medgemma` (or Colab / Vertex) — **I cannot do this here.**
2. Hugging Face account + accept the MedGemma terms + `HF_TOKEN`.
3. Supabase project, apply the schema, add the 15 storage policies, run the verify SQL.
4. Secrets in `.env.local`: `GEMINI_API_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `OLLAMA_BASE_URL`. **Never commit them** — `.gitignore` already covers `.env.local`.
5. Real guideline text for the 5 sources (licensing) — or approve using the excerpts already in `src/lib/data.ts`.
6. Clinical sign-off on the two seeded placeholders flagged in `db/README.md`: `borderline_frac = 0.10` for every test, and `critical_low` / `critical_high` all `NULL`.
7. Tell the frontend person: **nothing changes** for them. Optionally they add streaming + a citation list later, both additive.
8. Agree the DB-write boundary with the backend person (§6).

### Backend person's part (existing `db/` work)
- Supabase provisioning, RLS verification, the storage policies, auth (email/phone OTP), `/api/reports` upload + OCR + validation pipeline.
- **Decide who owns the AI-table writes.** Cleanest: backend owns the upload→OCR→validation pipeline; I own the agent-layer writes. Both run under `service_role`, so the boundary is a code boundary, not a permissions one — just make sure exactly one of us writes `ai_generations`.

### Frontend person's part
- Nothing, if the contract holds. Later, optional: stream tokens, render citations, show the trust breakdown.

---

## 6. The one decision that unblocks everything

**Who writes the AI tables — me or the backend person?** Everything else can proceed in parallel; this is the only place two people can collide.

Second decision, smaller: **direct Hindi generation, or English-then-translate?** Test it in Phase 1 with five prompts before committing.

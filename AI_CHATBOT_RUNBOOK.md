# MedGemma chatbot — backend runbook

What was built, how it wires into the existing frontend and database, and what
is still required to run it against a real model.

**Scope:** the AI backend only. PaddleOCR / report ingestion is untouched, and
`src/app/api/process-report/route.ts` was not modified.

---

## 1. What is new

```
src/lib/ai/
  env.ts          configuration from the environment; no secret has a default
  types.ts        shapes mirroring the ai_* / rag_* / qa_* columns
  anonymizer.ts   ANONYMIZATION stage — the PII-free payload
  rag.ts          retrieval over the 5 seeded guideline sources
  prompts.ts      versioned system prompt + sha256
  guardrails.ts   input screening, output screening, trust score, renderer normalisation
  providers.ts    ollama / openai-compatible / vertex clients (no SDK, just fetch)
  mock.ts         provider for pipeline testing without a GPU
  rules.ts        the prototype's rule answers, extracted verbatim — now the fallback
  agent.ts        the pipeline: anonymise -> retrieve -> prompt -> generate -> guard
  persistence.ts  writes voice_sessions / qa_messages / ai_generations /
                  ai_explanations / explanation_citations / answer_feedback

src/app/api/
  answer/route.ts     rewired to the agent; response shape UNCHANGED
  ai/status/route.ts  new — is the model reachable, what prompt, what config
  feedback/route.ts   now writes answer_feedback when Supabase is configured
  health/route.ts     reports AI provider + model alongside the original fields
```

Nothing else changed. `src/app/ask/page.tsx`, `src/components/*`, `src/lib/data.ts`
and the whole `db/` directory are as they were.

---

## 2. The frontend contract was preserved

`src/app/ask/page.tsx` sends `{ q, lang }` and reads:

```ts
{ answer: string; sources: number; confidence: "high" | "moderate" }
```

`/api/answer` still returns exactly those four fields (`matched`, `answer`,
`sources`, `confidence`) with the same types — verified over HTTP. Everything
else in the response (`engine`, `model`, `citations`, `trust_score`,
`safety_flags`, `generation_id`, `session_id`, `latency_ms`) is additive and is
ignored by the current UI.

**So the frontend requires no change to work.** Optional later additions, all
additive: render `citations[]`, show `engine`/`model`, send a stable
`x-anvaya-session` header for multi-turn memory, and pass `qa_message_id` to
`/api/feedback` so votes persist.

---

## 3. Running it

### 3.1 Without a model (works today)

```bash
npm install
npm run dev
curl -s localhost:3000/api/health
# {"ok":true,"mode":"demo",...}
```

`/api/answer` answers from `src/lib/ai/rules.ts`, flagged
`safety_flags: ["fallback:no_provider_configured"]` so it never looks like the
model answered.

### 3.2 Against MedGemma

```bash
# On the GPU machine:
ollama pull medgemma            # 4B multimodal, ~3.3 GB
ollama serve                    # :11434
```

```bash
# In .env.local
AI_PROVIDER=ollama
AI_BASE_URL=http://127.0.0.1:11434
AI_MODEL=medgemma:4b
```

```bash
curl -s localhost:3000/api/ai/status
```

`model.reachable` tells you whether the provider answered, and `model.detail`
says whether `medgemma:4b` is actually pulled. That request is the fastest way
to answer "is it really using the model?".

### 3.3 vLLM instead of Ollama

```bash
vllm serve google/medgemma-4b-it
```
```
AI_PROVIDER=vllm
AI_BASE_URL=http://127.0.0.1:8000/v1
AI_MODEL=google/medgemma-4b-it
```

---

## 4. Safety design

MedGemma's model card states its safety evaluations "included primarily English
language prompts", and the open-weights model is released **without safety
filters**. The guardrail layer is therefore the safety mechanism, not a nicety:

| Layer | Behaviour |
|---|---|
| `guardInput()` | A diagnosis / dosing / emergency question never reaches the model. Bilingual patterns, so a Hindi question is refused in Hindi. |
| System prompt | Explainer role; no diagnosis, no dose changes; may only use the supplied RESULTS and PASSAGES. |
| `guardOutput()` | Screens for diagnosis and dosing claims, model refusals, and numbers that do not appear in the supplied payload. Any hit replaces the whole answer — partial redaction of a medical sentence is more likely to produce a wrong statement than a clean redirect. |
| Trust score | `0.6*model + 0.4*retrieval`, minus penalties for ungrounded numbers and refusals. Mapped to the UI's `high` / `moderate`. The formula is stored verbatim in `ai_generations.trust_formula`. |
| Renderer normalisation | `Md` in `src/components/core.tsx:604` renders only paragraphs, `- ` bullets and `**bold**`. Headings, tables, code fences and numbered lists are normalised away so the model cannot emit raw markdown at a patient. |
| Fallback | No provider, unreachable provider, timeout, empty output or refusal → the deterministic rule answers, flagged as a fallback. |

`AI_RULES_FIRST=1` answers from the rules when they match and only calls the
model otherwise — useful for a demo with limited GPU.

---

## 5. Privacy

`ai_generations.input_snapshot` receives the anonymised payload only. It
contains `pseudonym` (a random uuid), `age_band` (a band, never a date of
birth), `sex`, the report's display date, and test values with units and printed
ranges. There is no field in `AnonymisedPayload` that could hold a name, phone
number, report number or lab name — the constraint is structural, matching the
PRIVACY INVARIANT header of `db/migrations/0012_ai.sql`.

Verified by test: the patient name from `PATIENT` does not appear anywhere in
the assembled prompt, and the exact age appears only as the band `40-49`.

---

## 6. Database writes

`persistence.ts` writes over Supabase's PostgREST REST API (`/rest/v1`), so no
driver dependency was added. Writes are best-effort: a persistence failure
never turns a correct answer into a failed request; it is reported in the
response's `persist_errors` instead.

**Two things are required before rows land:**

1. `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` set. The schema is applied per
   `db/README.md`.
2. **A `patient_id`.** `voice_sessions.patient_id` is `NOT NULL`, and
   `answer_feedback.patient_id` is too. There is no auth in this repository yet,
   so no identity can be resolved. Rather than guess one, persistence skips those
   two tables and reports `patient_id_missing`. Wiring auth (`auth.uid()` →
   `patients.id`) is the remaining step; `persistTurn()` already accepts
   `patientId` and `labReportId` arguments.

Until then, `ai_generations`, `rag_retrievals` and `rag_retrieval_matches` are
the tables that can be written without an identity, and they are.

The `anvaya` schema is deliberately not in `pgrst.db_schemas`
(`ANVAYA_DATABASE_SPEC.md` §10.3), so the SQL functions —
`has_active_consent()`, `set_review_status()`, `release_report()` — still need a
direct connection. Nothing in the AI backend calls them yet; the consent gate
(`has_active_consent(patient_id, 'ai_explanation')`) belongs with the auth work.

---

## 7. Retrieval, and the swap to FAISS

`rag.ts` does deterministic keyword retrieval with a **topic-overlap gate**: a
passage that is not about a test the question mentions scores zero, so an
unrelated question cites nothing rather than citing whatever shares a common
word.

The chunk text is the excerpt copy already in `src/lib/data.ts` (`SOURCES`
and `TESTS`), so no new clinical claim is introduced and no new licensing
question is opened. 27 chunks across the 5 seeded sources.

`ANVAYA_DATABASE_SPEC.md` §2.3 deliberately added no pgvector column, because the
architecture specifies a self-hosted FAISS index. To move to vectors: replace
`retrieve()` in `rag.ts`, set `engine` to `"faiss"`, and populate
`rag_chunks.external_vector_id`. The `RetrievalResult` shape, the tables written
and everything downstream stay identical.

---

## 8. Verification performed

| Check | Command | Result |
|---|---|---|
| Types (whole repo) | `npx tsc --noEmit` | clean except 3 pre-existing errors in `process-report/route.ts` (see §9) |
| Pipeline, 74 assertions | compiled `src/lib/ai/*` and ran against the real modules | 74 passed, 0 failed |
| Ollama protocol path | stub server speaking `/api/chat` + `/api/tags` | system prompt + payload transmitted, tokens parsed, `engine=medgemma` |
| Unreachable provider | stub pointed at a dead port | falls back to rules, flagged `fallback:unreachable` |
| Live HTTP | `curl -X POST /api/answer` | HTTP 200, contract fields intact, citations populated |
| Blocked inputs over HTTP | diagnosis (en) and dosing (hi) | `blocked_diagnosis` / `blocked_dosing`, refused in the question's language |
| `/api/ask` page | `curl /ask` | HTTP 200, renders |

The pipeline assertions cover: PHI absence, age-banding, retrieval correctness
in both scripts, prompt hashing, input and output guardrails, renderer
normalisation, the full `askAgent()` path, fallback behaviour, TTS-ready plain
text, and `data.ts` integration.

Four real bugs were found and fixed by that suite:

1. The Ollama provider computed the system prompt but never sent it.
2. `SAFE_REDIRECT` contained "I cannot diagnose", which its own `MODEL_REFUSAL`
   pattern matched — so a refused answer was re-flagged as a model refusal and
   `safety_flags` misreported the reason.
3. The report date's digits (`22`, `2026`) were not in the allowed-number set, so
   any answer naming its own report date was penalised for hallucinating.
4. Lexical overlap alone could cite a guideline for an unrelated question.

---

## 9. Pre-existing blockers found (not caused by this work)

**a. `package.json` pinned a `@google/genai` version that does not exist.**
It pinned `^0.1.2`; the registry has no such version (latest is `2.19.0`). `npm
install` therefore failed outright with `ETARGET`. Two changes were made so the
project can install and build:

- `@google/genai` bumped to `^2.19.0`.
- `react-is` added, which `recharts@3.10.1` imports but the manifest did not
  declare (`Can't resolve 'react-is'`).

Consequence: `src/app/api/process-report/route.ts:123` calls `response.text()`,
which is a *getter* in `@google/genai` 2.x, not a method. That produces the 3
remaining typecheck errors. The fix is one character —
`const responseText = response.text;` — but it is the PaddleOCR/Gemini route,
which was out of scope, so it was left for you to confirm.

**b. `next build` cannot complete in a sandbox without outbound access to
`fonts.googleapis.com`.** `src/app/layout.tsx` uses `next/font/google`, which
fetches at build time. `next dev` degrades to a fallback font and serves pages
fine; `next build` treats it as fatal. This is environmental, not a code defect —
it will build normally on a machine with internet access.

---

## 10. Next steps

1. **You:** GPU + `ollama pull medgemma`, then confirm with `/api/ai/status`.
2. **You:** test Hindi quality directly — it is the biggest risk, since
   Google's MedGemma safety evaluations were primarily English. If Hindi output
   is weak, the fallback is generate-in-English then translate, which the
   `translation` value of `anvaya_generation_purpose` already anticipates.
3. **Backend:** auth, so `patient_id` exists and `voice_sessions` /
   `qa_messages` / `answer_feedback` start receiving rows; plus the
   `has_active_consent(patient_id, 'ai_explanation')` gate before a model call.
4. **Backend:** seed `rag_documents` / `rag_chunks` so `rag_retrieval_matches`
   can reference real chunk rows, and point `external_vector_id` at the FAISS
   index.
5. **You:** fine-tuning, as planned — the prompt is versioned
   (`prompt_version` + `system_prompt_sha256`), so a tuned model can be compared
   against the untuned one on the same stored inputs.

---

## 11. Integrating PaddleOCR (`lab_ocr_paddleocr.py`, on `main`)

Added after reviewing the OCR pipeline and its real output (`result1.csv`,
`result3.csv`). The OCR side is in good shape — 676 lines with deskewing,
row grouping, a name whitelist, unit normalisation and date extraction. Three
gaps stand between it and the chatbot.

### 11.1 The CSV contract already matches the schema

```
report_date,test_name,value,unit,ref_low,ref_high,status,ocr_confidence
```

That maps almost 1:1 onto `test_results` (`raw_name`, `original_value`, unit,
`printed_ref_low`, `printed_ref_high`, `ocr_confidence`). No reshaping needed.

### 11.2 Test-name coverage is the real gap — 4 of 21

The OCR emits **21 distinct test names**; the `TESTS` catalogue in
`src/lib/data.ts` recognises **4** of them.

| | |
|---|---|
| Covered | Hemoglobin, MCV, RBC Count, WBC Count |
| Not covered (17) | Neutrophils, Lymphocytes, Eosinophils, Monocytes, Basophils, Absolute Lymphocytes, Absolute Eosinophils, Absolute Monocytes, Packed Cell Volume, MCH, MCHC, RDW-CV, RDW-SD, Platelet Count, PCT, MPV, PDW |

The anonymiser drops any row whose test is not in `TESTS`, because that is where
the unit, the bilingual label and the reference range come from. So a real CBC
would currently reach the chatbot with 4 of its 21 results.

This is exactly what the schema anticipated: `lab_test_aliases` exists to resolve
`raw_name` → `lab_test_catalog` (spec §10.4 step 3). Two ways forward:

- **Proper fix:** seed `lab_test_catalog` + `lab_test_aliases` with the 17
  missing tests (ICMR reference ranges), and read the catalogue from the database
  instead of the `TESTS` constant.
- **Quick fix for a demo:** add the missing entries to `TESTS`. Faster, but it
  puts clinical reference ranges in a frontend constant.

Until one of these happens, expect the chatbot to answer only about hemoglobin,
MCV, RBC and WBC from a scanned report.

### 11.3 The OCR's `status` must not be trusted

`validate_value()` in the OCR script computes `Normal` / `Low` / `High`. Two
problems:

1. **Casing and vocabulary** — the schema's `anvaya_test_status` is lowercase and
   has five values (`normal | borderline | high | low | critical`).
2. **Authority** — `ANVAYA_DATABASE_SPEC.md` §10.4 is explicit that the LLM must
   never be the source of truth for status, and by the same argument neither
   should the OCR layer. The validator owns it: `anvaya.classify_value()` over the
   resolved reference range, written to `validation_results`.

So the OCR's `status` column should be treated as a hint for the human review
screen, not persisted as the classification.

Also note the OCR's own output is internally inconsistent in the same way
`ANVAYA_DATABASE_SPEC.md` §2.2 Conflict A describes for the demo data — e.g. in
`result1.csv`, MCV `80.0` against `83-101` is `Low`, while Packed Cell Volume
`40.0` against `40-50` is `Normal` at the exact lower bound. Recomputing status
in the validator makes those reproducible.

### 11.4 Suggested seam

The cleanest boundary keeps Python doing OCR and TypeScript doing the agent:

```
lab_ocr_paddleocr.py  --csv-->  POST /api/reports (backend person)
                                   |
                                   +-> lab_test_aliases  -> lab_test_catalog
                                   +-> anvaya.classify_value() -> validation_results
                                   +-> anonymization_records
                                   |
                              /api/answer (this backend) reads the validated rows
```

`buildAnonymisedPayload()` in `src/lib/ai/anonymizer.ts` currently reads the
`REPORTS` / `TESTS` constants from `src/lib/data.ts`. Swapping that one function
to read `v_patient_latest_results` is the whole integration — nothing downstream
changes, because the payload shape is already the de-identified form the model
consumes.

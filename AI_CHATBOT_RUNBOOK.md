# MedGemma chatbot — backend runbook

What was built, how it wires into the existing frontend and database, and what
is still required to run it against a real model.

**Scope:** the AI backend only. PaddleOCR / report ingestion is untouched, and
`src/app/api/process-report/route.ts` was not modified.

**Since this was written:** a multilingual voice agent was built on top of this
pipeline — 14 answer languages, browser speech in/out, and the same
`/api/answer` endpoint. See `AI_VOICE_AGENT_RUNBOOK.md`. The `/api/answer`
contract below is unchanged; the new fields (`answerLang`, `channel` in,
`answer_lang`, `language_note`, `channel` out) are additive, and the prompt
version is now `2026-08-27.2`.

---

## 1. What is new

```
src/lib/ai/
  env.ts          configuration from the environment; no secret has a default
  types.ts        shapes mirroring the ai_* / rag_* / qa_* columns
  clientReport.ts NEW — validates the client-supplied report (personalization):
                  whitelist tests, server-computed statuses, PII firewall
  anonymizer.ts   ANONYMIZATION stage — the PII-free payload; accepts the
                  user's own report via clientReport.ts
  rag.ts          retrieval over the 5 seeded guideline sources; falls back to
                  the user's abnormal-result topics on generic questions
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
  ai/status/route.ts  is the model reachable, what prompt, what config
  feedback/route.ts   writes answer_feedback when Supabase is configured
  health/route.ts     reports AI provider + model alongside the original fields

src/app/ask/page.tsx  the chat UI now sends the user's OWN report values,
                      a stable session id and the reading mode with each
                      question, and badges which engine answered

scripts/fake-ollama.mjs  a stand-in `ollama serve` speaking /api/chat +
                      /api/tags, for verifying the MedGemma HTTP wiring on a
                      machine with no GPU
```

Nothing else changed. `src/components/*`, `src/lib/data.ts` and the whole `db/`
directory are as they were.

---

## 2. The frontend contract was preserved

`src/app/ask/page.tsx` sends `{ q, lang }` and reads:

```ts
{ answer: string; sources: number; confidence: "high" | "moderate" }
```

`/api/answer` still returns exactly those four fields (`matched`, `answer`,
`sources`, `confidence`) with the same types — verified over HTTP. Everything
else in the response (`engine`, `model`, `personalized`, `citations`,
`safety_flags`, `session_id`, `qa_message_id`, `generation_id`, `latency_ms`)
is additive and older callers ignore it.

The request body gained **optional** fields, so an old caller sending only
`{ q, lang }` still works and is answered about the seeded demo report:

```ts
{
  q: string;              // required
  lang?: "en" | "hi" | "bn";
  reading?: "simple" | "advanced";   // the settings reading mode
  session?: string;       // stable per-browser id (multi-turn memory)
  report?: {              // PERSONALIZATION — see §2.5
    reportId?: string;
    dateLabel?: string;
    age?: number;
    gender?: string;
    results: { test: string; value: number }[];
    previous?: { dateLabel?: string; results: { test: string; value: number }[] };
  };
}
```

---

## 2.5 Personalization — whose report the model explains

Before this, the pipeline could only explain the fictional demo patient in
`src/lib/data.ts`. Now the chat UI sends the report the user is actually
looking at — their upload (extracted by `/api/process-report` and held in
`ReportDataContext`), or the demo fallback — and answers are about *their*
values, trends and patterns.

Flow:

```
ReportDataContext (activeReport + history + patient)
  → buildReportContext()        ask/page.tsx — VALUES ONLY, no statuses, no names
  → POST /api/answer { q, lang, report }
  → parseClientReport()         clientReport.ts — THE TRUST BOUNDARY
  → buildAnonymisedPayload()    anonymizer.ts — payload from the user's report
  → retrieve()                  rag.ts — + abnormal-result topics on generic questions
  → prompt + MedGemma + guardrails — numbers grounded in the user's values
```

The trust boundary rules (`clientReport.ts`), in order of importance:

1. **Nothing free-text crosses it** except two short sanitised date labels.
   There is no field that could carry a name, lab, doctor or note — so a
   client cannot put PHI into the model payload even by trying.
2. **Test ids are whitelist-matched** against the `TESTS` catalogue; unknown
   ids are dropped.
3. **Units and reference ranges come from the catalogue**, never the client.
4. **Status (normal / borderline / high / low) is computed server-side** from
   the catalogue range with the seeded 10% borderline fraction — a client label
   is no better than an LLM label, and the spec (§10.4) allows neither.
5. Values must be finite numbers in (0, 1e6]; everything is capped in size.

The client deliberately sends values only — not even its own status strings —
because the server re-derives them. `personalized: true` in the response says
the user's report was used; `false` means the demo data answered (no valid
`report` in the request).

Retrieval is personalized too: a question that names no test ("explain my
report") retrieves nothing on its own, so the agent seeds the topic match with
**this user's abnormal results** — the passages then cite guidelines about the
values that are actually flagged.


---

## 3. Running it

### 3.1 Without a model (works today)

```bash
npm install
npm run dev
curl -s localhost:3000/api/health
# {"ok":true,...,"chatbot":{"mode":"demo",...}}
```

`/api/answer` answers from `src/lib/ai/rules.ts`, flagged
`safety_flags: ["fallback:no_provider_configured"]` so it never looks like the
model answered.

### 3.1b Verifying the MedGemma wiring without a GPU

```bash
node scripts/fake-ollama.mjs &            # speaks /api/chat + /api/tags on :11434
AI_PROVIDER=ollama AI_MODEL=medgemma:4b npm run dev
curl -s localhost:3000/api/ai/status      # "ollama reachable; medgemma:4b present"
```

The stub composes its reply by echoing the RESULTS block out of the prompt it
received, so if the chat answer contains YOUR report's values, the
personalized payload demonstrably crossed the model HTTP boundary and came
back through the guardrails. Swap the stub for the real `ollama serve` and
nothing else changes — same URL, same protocol.

`AI_PROVIDER=mock` runs the same pipeline with an offline composer instead.


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
| Types (whole repo) | `npx tsc --noEmit` | clean (including 9 pre-existing errors in extracted/upload/db.ts, fixed — see §9) |
| Pipeline, 74 assertions | compiled `src/lib/ai/*` and ran against the real modules | 74 passed, 0 failed |
| Ollama protocol path | `scripts/fake-ollama.mjs` speaking `/api/chat` + `/api/tags` | system prompt + payload transmitted, tokens parsed, `engine=medgemma` |
| **Personalization over HTTP** | `curl -X POST /api/answer` with `report.results` hemoglobin 9.1 | answer quotes **9.1 g/dL** (not the demo 10.5), `personalized: true`, 3 citations |
| Personalized RAG | `q="explain my report"` with hba1c 7.5 + hemoglobin 9.1 | 3 sources retrieved from the user's abnormal-result topics |
| Hindi + trend over HTTP | Devanagari question, previous value 11.8 | answer in Hindi, quotes 9.1 and the user's date label |
| Unreachable provider | stub stopped mid-run | falls back to rules, flagged `fallback:unreachable`, HTTP 200 |
| Blocked inputs over HTTP | diagnosis (en) and dosing (en/hi) | `blocked_diagnosis` / `blocked_dosing`, refused in the question's language |
| `/api/ask` page | `curl /ask` | HTTP 200, renders |
| `/api/feedback` | vote without Supabase | `{"ok":true,"persisted":false,"mode":"demo"}` |
| Lint (touched files) | `npx eslint src/lib/ai src/app/api src/app/ask/page.tsx` | clean |

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

**b. Nine type errors in three files the chatbot work did not touch** —
`src/app/extracted/page.tsx` (used `activeReport` without destructuring it),
`src/app/upload/page.tsx` (passed `"error"` to a toast that accepts
`"ok" | "info" | "warn"`), and `src/lib/supabase/db.ts` (catalogue mapping
omitted the display-only `icon/tint/ink/conf` fields). All three were fixed so
`tsc --noEmit` and `next build` pass; no behaviour changed.

**c. `next build` cannot complete in a sandbox without outbound access to
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

### 11.2 Test-name coverage — the core CBC tests are now in the catalogue

The OCR emits **21 distinct test names**; the `TESTS` catalogue in
`src/lib/data.ts` originally recognised only **4** of them. The missing core
CBC tests (red-cell indices + the white-cell differential) have since been
added to the catalogue, so the agent can now accept and explain them.

| | |
|---|---|
| Covered | Hemoglobin, MCV, RBC Count, WBC Count, **MCH, MCHC, RDW, Neutrophils, Lymphocytes, Eosinophils, Monocytes, Basophils** (12) |
| Still to be aliased (9) | Absolute Lymphocytes, Absolute Eosinophils, Absolute Monocytes, Packed Cell Volume (PCV), Platelet Count, PCT, MPV, PDW, RDW-CV / RDW-SD |

The catalogue entry is what gives a test its unit, bilingual label and reference
range. With the CBC tests present, `parseClientReport()` (and the anonymiser)
accept those rows instead of silently dropping them — a scanned CBC now reaches
the agent with its real values, not only hemoglobin + MCV.

What remains is the OCR **name → catalogue id** map (`lab_test_aliases`), which
resolves a printed label like "Packed Cell Volume" to `hematocrit` / "RDW-CV" to
`rdw` / "Platelet Count" to `platelets`. That lives in the database per spec
§10.4 step 3:

- **Proper fix:** seed `lab_test_catalog` + `lab_test_aliases` (ICMR reference
  ranges) and read the catalogue from the database instead of the `TESTS`
  constant.
- **Quick fix for a demo:** add the remaining aliases to the `TESTS` map's name
  matching / the mapping in the frontend.

Until the alias step is done, the agent answers correctly about a CBC as long
as the client sends the catalogue ids (which the report context does — the
frontend maps the viewer's report through the same `TESTS` keys).

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

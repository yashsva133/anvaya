# MedGemma chatbot — backend runbook

What was built, how it wires into the existing frontend and database, and what
is still required to run it against a real model.

**Scope:** the AI backend, the report-aware dashboard callers, and the explicit
structured-upload boundary. Image/PDF ingestion still uses PaddleOCR, while
`src/lib/reportCsv.ts` parses an explicitly uploaded CSV before OCR is invoked.

**Current release:** the multilingual bridge and empty-account behavior are part
of the same pipeline. See `AI_VOICE_AGENT_RUNBOOK.md` for browser speech. The
`/api/answer` contract remains additive; the new fields (`answerLang`, `channel`
in, `answer_lang`, `translation`, `language_note`, `channel` out) do not expose
server credentials. The prompt version is `2026-08-28.3`.

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
  prompts.ts      versioned English-boundary system prompt + sha256
  guardrails.ts   input screening, output screening, trust score, renderer normalisation
  conversation.ts localized greetings, capability replies, no-report and out-of-scope copy
  languages.ts    supported answer languages, script detection and request parsing
  translate.ts    server-only translation adapter + protected-token round trips
  providers.ts    ollama / openai-compatible / vertex clients (no SDK, just fetch)
  mock.ts         provider for pipeline testing without a GPU
  rules.ts        the prototype's static rules, not a source of patient values
  agent.ts        the pipeline: classify -> anonymise -> retrieve -> English model -> guard -> translate
  persistence.ts  writes voice_sessions / qa_messages / ai_generations /
                  ai_explanations / explanation_citations / answer_feedback

src/lib/reportCsv.ts explicit CSV parser; never calls OCR and never trusts a CSV status column

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

The existing dashboard, report store and auth boundaries now consume the
empty/report-scoped state and expose engine provenance; database migrations are
unchanged. Browser components still never receive provider credentials.

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
`{ q, lang }` still works. It receives a conversational/no-report response when
it sends no report; seeded demo values are never an implicit fallback. A sample
report is available only from the explicit demo action:

```ts
{
  q: string;              // required
  lang?: "en" | "hi" | "bn";       // UI language
  answerLang?: AnswerLang;            // requested output language, e.g. "ta"
  channel?: "text" | "voice";
  reading?: "simple" | "advanced" | "very"; // the settings reading mode
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

The chat UI sends the report the user is actually looking at — an upload or
scan held in `ReportDataContext` — and answers are about *their* values, trends
and patterns. A new account sends an empty report. The fictional report in
`src/lib/data.ts` is reachable only through the explicit “Try sample report”
demo action; it is never a fallback for OCR failure, a missing account report,
or an ordinary chat turn.

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
the user's report was used; `false` means the answer used an empty report
context. No valid `report` means no patient values, not demo data.

Retrieval is personalized too: a question that names no test ("explain my
report") retrieves nothing on its own, so the agent seeds the topic match with
**this user's abnormal results** — the passages then cite guidelines about the
values that are actually flagged.


---

## 2.6 The Overview summary — `POST /api/summary`

The first box on **Overview** (`/dashboard`) is no longer two hard-coded
sentences. It is a MedGemma briefing that answers the question a person
actually opens the app with: *where do I stand today, and which way am I
heading?*

```
ReportDataContext (activeReport + every earlier report + patient)
  → buildReportContext()          reportContext.ts — now also sends `history[]`
  → POST /api/summary { lang, reading, report }
  → parseClientReport()           clientReport.ts — same trust boundary as chat
  → buildAnonymisedPayload()      anonymizer.ts — + buildTrends()
  → retrieve()                    rag.ts — seeded with the flagged/worsening tests
  → buildSummaryPrompt()          summary.ts — prompt_key "report_overview"
  → MedGemma → guardOutput()      unsafe output is discarded, not shown
  → deterministicSummary()        the fallback, from the same numbers
```

Three properties are worth knowing before changing it:

1. **Trends are computed in code, never by the model.** `buildTrends()` in
   `anonymizer.ts` produces the direction, the delta and — importantly —
   whether a value moved *towards* or *away from* its reference range, because
   a rising value can be an improvement (a low haemoglobin recovering). The
   model is handed the finished verdicts in a `TREND HISTORY` block and told to
   explain them, matching the §10.4 rule that the LLM is never the source of
   truth for a status. Those historical values are added to the guardrail's
   allowed-number set, so a correct "up 1.3 since February" is not penalised as
   an invented figure.
2. **The box is never empty and never misattributed.** With no provider, a
   model error, a timeout, or a generation the guardrails reject, the response
   is the deterministic summary composed from the same payload — returned with
   `engine: "rules"` and a `fallback_reason`, and the card's footer says the
   text came from the report data rather than from MedGemma. `AI_PROVIDER=mock`
   is a separate `engine: "mock"` provenance when its generation is returned;
   it is not marked live. The chat can show a "please ask your doctor" redirect
   in place of an unsafe answer; an opening summary cannot, so it falls back
   instead of refusing.
3. **It regenerates on the inputs that change it** — report, language, reading
   level — and only on those: an object-identity change from a context
   re-render must not spend a model call.

Response fields: `headline`, `body` (the markdown bullets), `text`, `speech`
(markdown stripped, for the Listen button), `engine`, `model`, `confidence`,
`fallback_reason`, `counts`, `trends[]` (the chips), `reports_compared`,
`citations[]`.

```bash
curl -sX POST localhost:3000/api/summary -H 'content-type: application/json' \
  -d '{"lang":"en","report":{"results":[{"test":"hba1c","value":7.2}],
       "history":[{"dateLabel":"12 Feb 2026","results":[{"test":"hba1c","value":5.9}]}]}}'
```

---

## 2.7 "AI found a connection" — `POST /api/insights`

The AI Insights screen used to render three connections hard-coded to the demo
patient, and the Overview teaser advertised one of them regardless of what was
in the report. Both now come from the person's own results.

The split is the important part:

| Stage | Where | Who decides |
| --- | --- | --- |
| **Detect** the connection | `src/lib/ai/patterns.ts` | Deterministic rules over catalogue statuses + the trend series |
| **Score** the confidence | `scorePattern()` | Counted evidence: flagged members, how far out of range, whether the trend agrees. Capped at 95 |
| **Explain** it | `src/lib/ai/insights.ts` → MedGemma | Prose only, from the finished finding |

The model is never allowed to decide that a connection *exists* — a
hallucinated link between two tests is the failure mode that would matter most
here, and §10.4 already says a clinical classification is not the LLM's to
make. It receives the finding (these tests, these values, this direction, this
confidence) and writes exactly two paragraphs: what the link is, and why it is
worth raising with a doctor.

Each card is generated separately, all in parallel: one bad or slow generation
degrades one card, not the page. Anything that fails — no provider, an error, a
guardrail rejection — falls back to the reviewed clinical copy in
`src/lib/data.ts`, and the card's footer says "explained from reviewed clinical
guidance" instead of "explained by MedGemma". If the seeded copy was written
about a test this report does not contain, a sentence composed from the actual
member results is used instead, so a card can never describe results the person
did not have.

**No connection found is a real answer.** When nothing groups into a pattern the
page says so and the teaser says so, rather than promoting the least normal
result into a "pattern".

The **health story** timeline on the same screen is also derived now: it picks
the trend moving furthest away from its range and renders first / middle /
latest milestones from the actual values and dates. It is deterministic — no
model call — because it is pure arithmetic over the report history.

`useAiInsights()` (`src/lib/ai/useAiInsights.ts`) is the single client for this
endpoint, shared by the Insights page and the Overview teaser, so the teaser can
never advertise a connection the page below it does not list.

### Loading

`src/components/ai-loading.tsx` provides `AiStages` and `AiLines`, used by the
summary card, the insights cards and the teaser. `AiStages` cycles the real
pipeline steps ("reading your report", "comparing it with your earlier
reports", "checking the guideline sources", "writing it in simple language")
and stops on the last one rather than looping, so a slow local model reads as
progress instead of a hang; `AiLines` renders shimmer placeholders shaped like
the text that will land, so nothing jumps when it arrives. Both honour the
app's reduce-motion setting.

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
driver dependency was added. Writes are best-effort: a persistence failure never
turns a correct answer into a failed request; the response carries
`persisted: "ok" | "partial" | "off"` and the failing table names come back in
the `errors` list of the internal result.

Set `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` (schema applied per
`db/README.md`) and every AI surface files its own audit trail:

| Surface | Tables written |
| --- | --- |
| `POST /api/summary` | `rag_retrievals` + `rag_retrieval_matches`, `anonymization_records`, `ai_generations` (`report_summary`), `ai_explanations` (subject = the report), `explanation_citations` |
| `POST /api/insights` | the above per card (`pattern_insight`), plus `pattern_templates`, `report_patterns`, `report_pattern_members`, and one `ai_explanations` row per finding |
| `POST /api/answer` | `rag_retrievals` + matches, `anonymization_records`, `ai_generations` (`qa_answer`), `voice_sessions`, `qa_messages` ×2 |
| `POST /api/feedback` | `answer_feedback` |

### The corpus is seeded on first write

`rag_retrieval_matches.rag_chunk_id` and `explanation_citations.rag_chunk_id`
are foreign keys to `rag_chunks`, and retrieval runs in-process over the
constants in `src/lib/ai/rag.ts`. Those two facts used to be irreconcilable: the
writer sent the local chunk id (`"cdc-a1c#excerpt"`) into a uuid column, so
every match insert failed silently and no citation chain existed in the
database at all.

`ensureCorpus()` now upserts `rag_sources` → `rag_documents` (version =
`RAG_INDEX_VERSION`) → `rag_chunks` once per process, storing the local id in
`rag_chunks.external_vector_id` — the same column a FAISS index would key on
(§7) — and keeps an in-memory map from it to the uuid. Citations resolve, and
the chain `ai_explanations → explanation_citations → rag_chunks → rag_documents
→ rag_sources` answers "what did this sentence stand on?" from SQL alone.

### Identity

The client sends `patientId` only when the profile came from Supabase
(`patientRef()` in `src/lib/ai/reportContext.ts`) and `report.reportId` is used
as `lab_report_id` only when it is a real uuid. In demo mode both are absent, so
the conversation and pattern tables are skipped with `patient_id_missing` /
`lab_report_id_missing` rather than being filled with invented keys — the
generation rows are still written, because they contain no identity.

### Explanations are versioned, not overwritten

`ai_explanations` is unique per (subject, language, reading level) with one
`is_current` row, so a regenerated summary retires the previous row and inserts
`version + 1`. Chat turns deliberately do **not** write an explanation: their
subject would be the report, so every question asked would retire that report's
summary. A turn's text lives in `qa_messages`, and its evidence is still
reachable through `qa_messages.generation_id → ai_generations.retrieval_id →
rag_retrieval_matches`.

### Still no PHI

`ai_generations.input_snapshot` receives the anonymised payload only (results,
trends, patterns, age band, sex, pseudonym). The link back to a person is
`anonymization_id` — one `anonymization_records` row per generation, carrying
the removed/retained field lists, a keyed `subject_digest` and the payload hash.
That record needs a real `lab_report_id`, since asserting "this report was
de-identified" is meaningless without the report.

### Reading level

Migration `0023_reading_level_advanced.sql` adds `'advanced'` to
`anvaya_reading_level`, which the UI has been sending since the Simple/Advanced
picker landed. On a deployment that has not run 0023, the writer catches the
enum error and retries as `standard` rather than dropping the row.

The `anvaya` schema is deliberately not in `pgrst.db_schemas`
(`ANVAYA_DATABASE_SPEC.md` §10.3), so the SQL functions —
`has_active_consent()`, `set_review_status()`, `release_report()` — still need a
direct connection. Nothing in the AI backend calls them yet; the consent gate
(`has_active_consent(patient_id, 'ai_explanation')`) belongs with the auth work.

### Seeing the writes without a Supabase project

`scripts/fake-supabase.mjs` is a ~150-line stand-in for PostgREST (same idea as
`fake-ollama.mjs`): POST returns the row with a generated uuid, GET filters on
`eq`, `on_conflict` upserts merge, and everything is dumped on request.

```bash
node scripts/fake-supabase.mjs &
SUPABASE_URL=http://127.0.0.1:54999 SUPABASE_SERVICE_ROLE_KEY=fake \
  AI_PROVIDER=mock npm run dev

curl -s localhost:3000/api/summary -H 'content-type: application/json' -d @report.json
curl -s localhost:54999/__counts            # rows per table
curl -s localhost:54999/__dump | jq '.ai_generations[0]'
```

It enforces no constraints and no types — it shows what the app *sends*; what
must be true of the schema still lives in `db/migrations`.

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
| Types (whole repo) | `npm run typecheck` | clean |
| Pipeline tests | `npm test` through `scripts/test-loader.mjs` | 16 passed, 0 failed, including multilingual safety, CSV parsing, protected-token/footer loss, translation failure, refusal fallback, no-report isolation and mock provenance |
| Ollama protocol path | `scripts/fake-ollama.mjs` speaking `/api/chat` + `/api/tags` | system prompt + payload transmitted, tokens parsed, `engine=medgemma` |
| **Personalization over HTTP** | `curl -X POST /api/answer` with `report.results` hemoglobin 9.1 | answer quotes **9.1 g/dL** (not the demo 10.5), `personalized: true`, 3 citations |
| Personalized RAG | `q="explain my report"` with hba1c 7.5 + hemoglobin 9.1 | 3 sources retrieved from the user's abnormal-result topics |
| Hindi + trend over HTTP | Devanagari question, previous value 11.8 | answer in Hindi, quotes 9.1 and the user's date label |
| Unreachable provider | stub stopped mid-run | falls back to rules, flagged `fallback:unreachable`, HTTP 200 |
| Blocked inputs over HTTP | diagnosis (en) and dosing (en/hi) | `blocked_diagnosis` / `blocked_dosing`, refused in the question's language |
| `/api/ask` page | `curl /ask` | HTTP 200, renders |
| `/api/feedback` | vote without Supabase | `{"ok":true,"persisted":false,"mode":"demo"}` |
| Lint (touched files) | `npx eslint src/lib/ai src/app/api src/app/ask/page.tsx` | clean |
| **Every AI table written** | `scripts/fake-supabase.mjs` + `/api/summary`, `/api/insights`, `/api/answer`, `/api/feedback` | 17 tables populated: 5 `rag_sources`, 5 `rag_documents`, 43 `rag_chunks`, 5 `rag_retrievals`, 15 `rag_retrieval_matches`, 3 `anonymization_records`, 5 `ai_generations`, 4 `ai_explanations`, 12 `explanation_citations`, 3 `pattern_templates`, 3 `report_patterns`, 8 `report_pattern_members`, `voice_sessions`, 2 `qa_messages`, `answer_feedback` |
| Column coverage | dump of `ai_generations` | only `model_confidence` and the two error columns null — the mock provider returns no confidence and nothing failed |
| No PHI in `input_snapshot` | same dump | pseudonym, age band, sex, dates, results only; the identity link is `anonymization_id` |
| Idempotency | ran `/api/summary` and `/api/insights` twice | corpus, templates, patterns and members unchanged; the summary explanation became v2 `is_current`, v1 retired |
| Demo mode (no uuids) | same call without `patientId` / with `reportId: "r1"` | `persisted: "partial"`, generation written, conversation + pattern tables skipped by design |

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

**c. The current validation environment:** `next build` now completes
successfully, including route compilation and static page generation. A live
browser still needs to exercise microphone capture, speech synthesis and browser
speech recognition; those device APIs are not covered by the headless test
suite.

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

### 11.5 Explicit CSV uploads and the empty-account path

`POST /api/process-report` now checks an explicitly uploaded `.csv` (or a
`text/csv` file with the canonical header) immediately after reading the bytes.
`src/lib/reportCsv.ts` accepts the canonical columns
`report_date,test_name,value,unit,ref_low,ref_high,ref_text`, handles quoted
commas and CRLF, copies the real value/unit/range, and derives only a status
that follows from a usable supplied bound. A CSV `status` column is ignored.
A malformed explicit CSV returns HTTP 422; it is never sent to OCR and never
becomes the sample report. Image/PDF files continue to the PaddleOCR path, and
OCR failure returns HTTP 422 rather than fictional values.

The upload/scan confirmation page writes the extracted values to the scoped
browser report store and then attempts the database save. The Overview reads
that same active report after refresh. On a new account, the store and Supabase
provider return an empty report/history; Overview, Trends, Compare and Insights
show a no-data/upload-or-scan state. `getDefaultActiveReport()` and the sample
button are demo-only opt-in actions.

---

## 12. Multilingual English-boundary pipeline and failure modes

For a requested language `L` other than English, `/api/answer` follows:

```
question in L → server Translation API → English classification/model boundary
             → MedGemma (or mock) → English guardrails
             → protected-token server translation → answer in L
```

`GOOGLE_TRANSLATE_API_KEY` is read only by `src/lib/ai/env.ts` and used only in
`src/lib/ai/translate.ts`; the browser receives no key. Set
`TRANSLATION_PROVIDER=google` when using the bridge. If no translation provider
is configured, the deterministic report fallback still uses the requested
language's phrasebook rather than silently returning seeded data or an English
lab template.

Before output translation, the server masks every report value, unit, test name,
reference range and the exact English safety footer. Missing markers, an
English/script mismatch, a dropped footer, or a newly introduced number rejects
the translation. The output then restores the original tokens and swaps the
canonical footer for the reviewed localized equivalent. A model refusal is
handled even more strictly: it bypasses translation and returns the curated
localized safe redirect, preserving `refusal_detected` and its safety flags.

Failure behavior is intentional:

| Failure | Patient-facing result |
| --- | --- |
| Input translation unavailable | localized safe translation-failure or report fallback; no model call with untranslated context |
| Output translation unavailable/invalid | localized, report-grounded deterministic summary; never a translated refusal or unrelated sample |
| Model refuses or violates diagnosis/dosing guardrails | localized safe redirect; refusal flag retained |
| Ordinary “hi”, “how are you?”, “can you help me” | natural localized conversation copy; no report payload/context |
| No report and report question | localized no-report upload/scan guidance; no patient values |
| `AI_PROVIDER=mock` | engine `mock` only when its generated answer is returned; `mode` remains `demo`, not `live` |
| `AI_PROVIDER=none` / missing provider | engine `rules`/`fallback`; model metadata is `null` |

Run the focused checks with:

```bash
npm test       # 16 tests: language requests, CSV, token/footer loss, refusals, fallbacks
npm run typecheck
```

The authoritative model/pipeline provenance is in `engine`, `model`,
`translation`, and `safety_flags`. In particular, `/api/answer` does not report
`env.ai.model` for a rules/conversation/fallback answer unless a mock or real
model generation actually occurred.

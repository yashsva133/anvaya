# Anvaya / Rxanvaya — Supabase Database Specification

**Scope:** database/schema design and implementation analysis only. No application code was modified.
**Repository inspected at:** commit `21fd2c4` on branch `arena/01a04056-anvaya` (34 tracked files, 7,981 lines under `src/`).

**Verification performed:** the complete migration set was executed against a real PostgreSQL 16.2 server three times on a fresh database (idempotency), followed by 31 behavioural security tests. Result: 0 migration failures, all 31 tests passed. See [§9 Validation checklist](#9-validation-checklist).

---

## 1. Repository database contract discovered

### 1.1 The headline finding

**The current application has no database contract at all.** There is nothing to preserve compatibility with, and nothing that can be broken.

Evidence — an exhaustive search of the whole repository:

| What I searched for | Command | Result |
|---|---|---|
| Supabase client | `grep -rniE "supabase\|createClient\|\.from(\|rpc(\|upsert\|storage\.from\|bucket"` | **0 matches** |
| SQL / Postgres / ORMs | `grep -rniE "postgres\|\bsql\b\|pg_\|knex\|prisma\|drizzle"` | **0 matches** |
| Environment variables | `grep -rniE "process\.env\|NEXT_PUBLIC\|DATABASE_URL\|API_KEY"` | **0 matches** |
| Auth / sessions | `grep -rniE "login\|signin\|signup\|auth\.\|session\|getUser\|middleware"` | **0 matches** (only `tint:` matching "int") |
| `package.json` dependencies | read in full | `framer-motion`, `lucide-react`, `next`, `react`, `react-dom`, `recharts` — **no data layer** |

The only network calls in the entire application are two, both from `src/app/ask/page.tsx`:

* line 85 → `fetch("/api/answer")`
* line 119 → `fetch("/api/feedback")`

And the code states its own position explicitly:

* `src/app/api/health/route.ts` returns `{ ok: true, mode: "demo", database: "not-configured" }`
* `src/app/api/feedback/route.ts` returns `{ ok: true, persisted: false, mode: "demo" }`
* `src/lib/data.ts` header: *"ALL patient data below is FICTIONAL sample data created for the SIH 2026 prototype demonstration."*

### 1.2 What the code *does* define: the de-facto contract

Although there is no database, the TypeScript types in `src/lib/data.ts` are a precise specification of the entities the UI needs. Any schema that does not serve these shapes would force application changes, so they are treated as the contract.

#### Tables the application implicitly expects

| Implied table | Source | Columns referenced | Inferred types |
|---|---|---|---|
| `profiles` / `patients` | `src/lib/data.ts:1160` `PATIENT` | `name:L2`, `nameShort`, `age:number`, `gender:L2` | `patients.full_name text`, `name_local_script text`, `date_of_birth date` (age derived), `sex text` |
| `lab_test_catalog` | `src/lib/data.ts:15-33` `TestDef`, 14 records | `id`, `unit`, `name:L2`, `simple:L2`, `icon`, `tint`, `ink`, `ref{low?,high?,text}`, `what{med,en,hi,vs_en,vs_hi}`, `why`, `causes`, `todo`, `conf`, `sources[]`, `related[]` | `code text` **PK-equivalent**, `default_unit text`, bilingual text columns, `icon_key text` |
| `test_results` | `src/lib/data.ts:704-708` `ReportEntry` | `test:string`, `value:number`, `status:Status` | `lab_test_id uuid FK`, `value numeric`, status **derived** (see §2.2) |
| `lab_reports` | `src/lib/data.ts:710-723` `Report`, 4 records | `id`, `date:L2`, `month:L2`, `testsCount`, `attention`, `entries[]` | `uuid PK`, `collected_on date`, `legacy_code text`, counts **derived** (see §2.2) |
| `rag_sources` | `src/lib/data.ts:629-637` `Source`, 5 records | `id`, `title`, `publisher`, `country`, `url`, `excerpt:L2`, `usedFor:string[]` | `code text unique`, text columns; `usedFor` is the inverse of `lab_test_catalog.sources` |
| `reference_ranges` | `TestDef.ref` | `low?`, `high?`, `text` | nullable numeric bounds + display text; **open-ended ranges exist** (`hba1c` has only `high`) |
| `report_patterns` + members | `src/lib/data.ts:901-910` `Pattern`, 3 records | `id`, `title:L2`, `nodes[{test, arrow, note?}]`, `expl:L2`, `risk:L2`, `disclaimer:L2`, `source`, `conf{level,pct}` | template + instance + member tables; `arrow` → `anvaya_trend_dir` |

#### Enumerations (verbatim from source — these are the contract)

| Enum | Definition | Location |
|---|---|---|
| `LangCode` | `en \| hi \| bn` | `src/lib/data.ts:7`, `src/lib/i18n.tsx:15` |
| `Status` | `normal \| borderline \| high \| low \| critical` | `src/lib/data.ts:8` |
| `ReadingMode` | `standard \| simple \| very` | `src/lib/i18n.tsx:16` |
| `conf.level` | `high \| moderate` (16 × high, 3 × moderate, **0 × low**) | `src/lib/data.ts` |
| `trend dir` | `up \| down \| flat` | `src/lib/data.ts:903`, `:827` |
| upload channel | `camera`, `file` (PDF/JPG/PNG/CSV), `manual`, `sample` | `src/app/upload/page.tsx` |
| pipeline stages (UI) | 5 friendly labels `process.s1..s5` | `src/lib/i18n.tsx:123-127` |

#### API request/response contracts

`POST /api/answer` (`src/app/api/answer/route.ts`):
```ts
request:  { q: string, lang?: string }
response: { matched: string, answer: string, sources: number, confidence: "high" | "moderate" }
```
`POST /api/feedback` (`src/app/api/feedback/route.ts`):
```ts
request:  { helpful: boolean }
response: { ok: true, persisted: false, mode: "demo" }
```

#### Client-side persistence that is *not* a database concern

`src/lib/i18n.tsx:552` and `:563` read/write `AppSettings` (`lang`, `mode`, `font`, `voice`, `contrast`, `reduceMotion`) to `localStorage`. This is mirrored into `patients` for cross-device continuity, but the client may keep treating `localStorage` as the fast path.

### 1.3 Storage buckets the application expects

**None.** `src/app/upload/page.tsx` has a file input with `accept="image/*,application/pdf"` whose handler (`readFile`) fires a toast and routes to `/processing` — the file is never read or uploaded. `src/components/voice.tsx` simulates STT with timers and plays audio through the browser's `SpeechSynthesis`; no audio is captured. Bucket design in [§6](#6-supabase-storage-model) is therefore greenfield.

### 1.4 RLS assumptions

**None.** There is no auth, no `auth.uid()` reference, and no row-scoping anywhere. Every screen reads module-level constants.

---

## 2. Gap analysis

### 2.1 Required by the architecture, entirely absent from the code

| # | Missing capability | Architectural driver | Tables introduced |
|---|---|---|---|
| 1 | Any identity at all | "Patient accounts/profile", "Doctor accounts" | `profiles`, `patients`, `doctors` |
| 2 | Reviewer authorisation | "Doctor… cannot arbitrarily access unrelated patients" | `doctor_patient_access` |
| 3 | Consent of any kind | "Explicit patient consent"; `src/app/how/page.tsx:117-120` claims privacy but stores nothing | `consent_policies`, `patient_consents` |
| 4 | Report persistence | UPLOAD stage | `lab_reports`, `report_files` |
| 5 | Job/stage tracking | OCR/PARSING stages; `src/app/processing/page.tsx` fakes progress with `requestAnimationFrame` | `report_processing_jobs`, `ocr_results` |
| 6 | **Deterministic validation** | "The LLM must never be the source of truth for… Low/Normal/High/Critical" | `validation_results`, `clinical_rules`, `reference_ranges`, `reference_range_sources` |
| 7 | Anonymisation record | ANONYMIZATION stage; "identifiable patient information must not reach external LLM providers" | `anonymization_records` |
| 8 | RAG provenance | RAG stage; "What source supported this statement?" | `rag_documents`, `rag_chunks`, `rag_retrievals`, `rag_retrieval_matches`, `explanation_citations` |
| 9 | AI generation provenance | LLM EXPLANATION stage | `ai_generations`, `ai_explanations` |
| 10 | **Doctor review workflow** | DOCTOR REVIEW stage | `doctor_reviews`, `report_versions`, `report_translations`, `report_releases` |
| 11 | Voice/Q&A persistence | "Voice questions / responses"; `/api/feedback` returns `persisted: false` | `voice_sessions`, `qa_messages`, `answer_feedback` |
| 12 | Audit trail | "Auditability" | `audit_logs` |
| 13 | Erasure workflow | "patients can request deletion of their reports" | `deletion_requests` |
| 14 | Failure persistence | "System errors/failures where persistence is required" | `system_errors` |
| 15 | Unit/synonym normalisation | PIPELINE: *"test names, synonyms and units are standardised (e.g. 'Hb', 'Haemoglobin', 'हेमोग्लोबिन')"* | `lab_test_aliases` |
| 16 | OCR-value correction audit | `src/app/extracted/page.tsx` lets a patient edit a value, but stores it in React state only | columns on `test_results` + `anvaya.submit_value_correction()` |

### 2.2 Conflicts between the codebase and the architecture

These are called out rather than silently resolved.

**Conflict A — `status` in the demo data is not reproducible, and not even self-consistent.**

The brief's extracted schema is `{test_name, value, unit, ref_low, ref_high, status}`. I tested whether the shipped `status` values follow from `value` + `ref_low/ref_high`. They do not:

| Test | Value | Printed ref | Labelled status | Naive rule says |
|---|---|---|---|---|
| glucose | 104 | 70–99 | `borderline` | high |
| glucose | 116 | 70–99 | `borderline` | high |
| glucose | 126 | 70–99 | `borderline` | high |
| triglycerides | 158 | ≤150 | `borderline` | high |
| triglycerides | 170 | ≤150 | `high` | high |
| triglycerides | 188 | ≤150 | `high` | high |
| triglycerides | **205** | ≤150 | **`borderline`** | high |
| ldl | 138 | ≤100 | `borderline` | high |
| ldl | 142 | ≤100 | `high` | high |

Triglycerides 205 is labelled `borderline` while 170 and 188 are `high`, against the same bound. **No deterministic function of `(value, ref_low, ref_high)` reproduces the demo data.**

*Resolution:* `status` is **not** stored on `test_results`. It exists only as `validation_results.computed_status` — the recorded output of a versioned rule (`clinical_rules`) over a snapshot of the inputs (`ref_low`, `ref_high`, `critical_*`, `borderline_frac`, `rule_version`, `engine_version`). The demo's hand-authored labels are treated as UI mock data, not as a rule specification. A `borderline_frac` column makes the "Needs attention" band an explicit, clinically-reviewable parameter instead of an invisible magic number.

**Conflict B — the brief says four states; the code has five.**

The brief specifies "Low/Normal/High/Critical". `src/lib/data.ts:8` defines **five**: `normal | borderline | high | low | critical`, and `src/lib/i18n.tsx` renders `borderline` as "Needs attention".
*Resolution:* the enum keeps all five (`anvaya_test_status`). Dropping `borderline` would break the shipped UI.

**Conflict C — `testsCount` and `attention` are stored in the demo but not derivable from it.**

`testsCount` is exactly `entries.length + 1` in all four demo reports (10→11, 11→12, 12→13, 13→14). `attention` matches a count of `high|low|critical` in two reports and not the other two:

| Report | entries | `testsCount` | `attention` | count(high\|low\|critical) | count(≠normal) |
|---|---|---|---|---|---|
| feb26 | 10 | 11 | 0 | 0 | 2 |
| apr26 | 11 | 12 | 2 | 2 | 4 |
| jun26 | 12 | 13 | **3** | **6** | 7 |
| aug26 | 13 | 14 | **4** | **3** | 5 |

*Resolution:* neither is persisted. Both are computed in `v_report_summary` from `validation_results` (`attention_count`, `critical_count`, `borderline_count`, `normal_count`). A stored copy would drift from the deterministic source of truth, which is precisely the failure mode the architecture forbids.

**Conflict D — `/doctor` is not a doctor surface.**

`src/app/doctor/page.tsx` is a **patient-facing** printable summary ("A clinician-style view to share with your doctor"); its Download/Share buttons call `window.print()` and a toast. There is no clinician login anywhere.
*Resolution:* the page keeps working unchanged. The review workflow is added server-side (`doctor_reviews`, `report_versions`, `report_releases`) and will back a *new* clinician surface; nothing about `/doctor` is renamed or repurposed.

**Conflict E — `bn` is declared but has no content.**

`LangCode` includes `bn`, and `src/lib/i18n.tsx:571,587` wire it into `document.documentElement.lang` and the TTS voice (`bn-IN`), but `L2` is `{en, hi}` only and `grep -c "bn:" src/lib/data.ts` returns **0**.
*Resolution:* `anvaya_lang_code` includes all three so no identifier changes, and `report_translations` can hold a Bengali narrative as soon as one exists. Documented as a content gap, not a schema gap.

### 2.3 Things deliberately *not* tabled

To avoid inventing structure the code does not need:

| Candidate | Decision | Reason |
|---|---|---|
| `KG_CLUSTERS` (knowledge-graph graphic) | **No table** | Static visual layout constants (`src/lib/data.ts:1026`) with x/y coordinates. Presentation, not data. |
| `PIPELINE`, `COMPARE_ROWS` | **No table** | Marketing copy for `/how` and `/why`. |
| `user_preferences` | **No table** | Already in `localStorage`; mirrored onto `patients` instead of adding a join for six scalar columns. |
| pgvector column | **Not added** | The architecture specifies self-hosted FAISS and no code performs a vector search in Postgres. `rag_chunks.external_vector_id` is the join key; adding pgvector later is additive. |
| Per-test `related[]` table | **No table** | `TestDef.related` is a static authoring hint; multi-test reasoning is modelled properly via `report_patterns`. |
| Binary audio/image columns | **No table** | Storage buckets + path references ([§6](#6-supabase-storage-model)). |

---

## 3. Final ER/data model

### 3.1 The primary spine

```
                        ┌──────────────┐
                        │   profiles   │  1:1 auth.users
                        │ role: patient│
                        │  doctor/admin│
                        └──────┬───────┘
                 ┌─────────────┴──────────────┐
            1:1  │                            │ 1:1
        ┌────────▼───────┐            ┌───────▼────────┐
        │    patients    │◄───┐       │     doctors    │
        │   (PHI zone)   │    │       └───────┬────────┘
        └───┬────┬───┬───┘    │               │
            │    │   │        │        ┌──────▼──────────────────┐
            │    │   │        └────────┤ doctor_patient_access   │  time-boxed grant
            │    │   │                 │ (deny-by-default)       │
            │    │   └──────────────┐  └─────────────────────────┘
            │    │                  │
  ┌─────────▼──┐ │        ┌─────────▼──────────┐
  │  patient_  │ │        │    lab_reports     │◄── report_files (storage refs)
  │  consents  │ │        │  soft-deletable    │
  └────────────┘ │        └────┬──────┬───┬────┘
  (append-only,  │             │      │   │
   policy-       │   ┌─────────▼──┐   │   └────────────┐
   versioned)    │   │  report_   │   │                │
                 │   │ processing_│   │       ┌────────▼─────────┐
                 │   │   jobs     │   │       │ anonymization_   │
                 │   └─────┬──────┘   │       │    records       │ PII firewall
                 │         │          │       │  (pseudonym only)│
                 │   ┌─────▼──────┐   │       └────────┬─────────┘
                 │   │ ocr_results│   │                │
                 │   │ (PHI zone) │   │                │
                 │   └─────┬──────┘   │                │
                 │         │          │                │
                 │   ┌─────▼──────────▼─────┐           │
                 │   │     test_results     │           │
                 │   │ value·unit·printed   │           │
                 │   │ ref·OCR conf·correct │           │
                 │   └─────┬────────────────┘           │
                 │         │ 1:N (append-only)          │
                 │   ┌─────▼────────────────┐           │
                 │   │  validation_results  │ ★ SOURCE OF TRUTH
                 │   │  IMMUTABLE           │   for Low/Normal/
                 │   │  rule+range snapshot │   Borderline/High/
                 │   └──────────────────────┘   Critical
                 │
                 │   ┌──────────────────────────────────────────────┐
                 └──►│  ai_generations ◄── rag_retrievals           │
                     │   (no PHI columns)      │                    │
                     │        │            rag_retrieval_matches    │
                     │        ▼                │                    │
                     │  ai_explanations        ▼                    │
                     │        │            rag_chunks               │
                     │        ▼                │                    │
                     │  explanation_citations──┘                    │
                     │                         │                    │
                     │                    rag_documents             │
                     │                         │                    │
                     │                     rag_sources              │
                     └──────────────────────────────────────────────┘
```

### 3.2 The review and release path

```
lab_reports
   │ 1:N
   ▼
report_versions ──── v1 origin=ai_draft ──── v2 origin=doctor_edit (based_on v1)
   │                      │                        │
   │ 1:N                  └── doctor_reviews ──────┘
   ▼                              draft
report_translations               → pending_review
 (en / hi / bn of the             → needs_edit ──┐
  SAME validated facts)           → approved  ◄──┘
   │                              → released
   ▼
report_releases  ◄── the ONLY thing that makes a report patient-facing
 (one active per report; partial unique index)
```

Only `anvaya.release_report()` can create a `report_releases` row, and it refuses unless the version carries an **approved** review by a clinician — and refuses again unless the caller *is* that clinician.

### 3.3 Longitudinal model (one patient, many reports, repeated tests)

```
patients 1 ──── N lab_reports 1 ──── N test_results N ──── 1 lab_test_catalog
                                     (unique per report+test)
```

`v_test_history` flattens this to `(patient_id, test_code, collected_on, effective_value, computed_status, ref_low, ref_high)`, which is exactly the shape `trendSeries()` / `getValue()` in `src/lib/data.ts` consume. Because each measurement pins the reference range that was in force, a trend line stays interpretable across a range change. Indexed by `test_results_trend_idx` + `reports_patient_history_idx`.

### 3.4 RAG modelled independently of any one explanation

```
rag_sources 1─N rag_documents 1─N rag_chunks 1─N explanation_citations N─1 ai_explanations
                                       ▲
                                       └── N rag_retrieval_matches N─1 rag_retrievals
```

One guideline passage supports many explanations, and one explanation cites many passages. `rag_chunks.content` is persisted (public guideline text, never PHI), so a citation remains verifiable **even if the FAISS index is rebuilt or discarded**. `ON DELETE RESTRICT` on `explanation_citations.rag_chunk_id` means a cited passage cannot silently disappear.

### 3.5 Why the two circular references are safe

There are exactly two, both intentional and one deferred:

1. `test_results.current_validation_id → validation_results.id` — `DEFERRABLE INITIALLY DEFERRED`, so the pair commits atomically. It is a **read cache**; `validation_results` remains the source of truth.
2. `report_versions.based_on_version_id → report_versions.id` — a self-reference forming a DAG. Version 1 has `NULL`, so there is no cycle, and `report_versions` is immutable so `based_on` can never be repointed.

No cascade cycle exists: every `ON DELETE CASCADE` points strictly "downward" (patient→consents is the single exception, and it is `RESTRICT` for exactly that reason — see §5.5).

---

## 4. Table-by-table schema specification

39 tables. Every table has RLS enabled, at least one index, and a `COMMENT`. Full DDL is in [§8](#8-complete-sql-migration); this section gives the specification and the reasoning.

### 4.1 Identity

**`profiles`** — 1:1 with `auth.users`.
`id uuid PK (= auth.users.id)`, `role anvaya_role`, `status anvaya_account_status`, `full_name`, `email`, `preferred_language`, `last_seen_at`, `created_at`, `updated_at`.
*PK:* `id`. *Unique:* `lower(email)` where not null. *FK:* none.
*Why separate from `patients`:* this is the only row the auth layer touches. Keeping clinical/PII data out of it means a session lookup never reads PHI.
*Write path:* none for clients. Created by `handle_new_auth_user()` (SECURITY DEFINER trigger on `auth.users`, installed only `if to_regclass('auth.users') is not null` so the file also runs on bare Postgres).

**`patients`** — **PHI zone.**
`id uuid PK`, `profile_id uuid UNIQUE NULL → profiles ON DELETE SET NULL`, `full_name NOT NULL`, `name_local_script`, `date_of_birth`, `sex CHECK`, `phone`, `email`, `city`, `state`, `preferred_language`, `reading_level`, `voice_enabled`, `high_contrast`, `reduce_motion`, `font_scale CHECK 0..2`, `deleted_at`.
*Required:* `full_name`. *Everything else nullable* — a clinic-entered patient may have no login yet.
`name_local_script` backs the `L2 {en, hi}` name pattern in `PATIENT`.
Accessibility columns mirror `AppSettings` from `src/lib/i18n.tsx` for cross-device continuity; the client may still treat `localStorage` as the fast path.

**`doctors`**
`id uuid PK`, `profile_id uuid UNIQUE NOT NULL → profiles ON DELETE CASCADE`, `full_name NOT NULL`, `registration_no`, `registration_body`, `specialty`, `institution`, `verified`, `verified_at`.
*Unique:* `(registration_body, registration_no)` where `registration_no` is not null.
Registration details are what make a sign-off attributable.

**`doctor_patient_access`** — the authorisation predicate.
`doctor_id → doctors CASCADE`, `patient_id → patients CASCADE`, `status CHECK in (active, revoked)`, `reason`, `granted_by → profiles`, `granted_at`, `expires_at`, `revoked_at`, `revoked_by`.
*Unique:* `(doctor_id, patient_id) WHERE status = 'active'` — one live grant per pair, revoked history retained.
*Checks:* revoked ⇒ `revoked_at` set; `expires_at > granted_at`.
**Deny-by-default:** no row, no visibility. This single table is the predicate behind every doctor-facing policy.

### 4.2 Consent

**`consent_policies`** — the versioned text actually shown.
`code`, `version`, `purpose anvaya_consent_purpose`, `title_en/hi`, `summary_en/hi`, `full_text_en/hi`, `doc_hash NOT NULL`, `effective_from/to`, `is_active`.
*Unique:* `(code, version, purpose)`; partial unique `(code, purpose) WHERE is_active`.
`doc_hash` = `sha256` of the canonical text, so "what did they agree to?" is answerable years later.

**`patient_consents`** — append-only decision ledger.
`patient_id → patients` **`ON DELETE RESTRICT`**, `policy_id → consent_policies RESTRICT`, `purpose`, `status anvaya_consent_status`, `channel`, `granted_at`, `expires_at`, `revoked_at`, `revoked_by`, `revocation_reason`, `evidence jsonb`, `ip_address inet`, `user_agent`.
*Checks:* `withdrawn` ⇒ `revoked_at` set; `declined` ⇒ no `revoked_at`.
*Trigger:* `guard_immutable_row` — no UPDATE, no DELETE.

**Design note — a boolean `consent = true` is not sufficient, and neither is a status flip.** Because the table is append-only, a withdrawal is a **new row** and authority is *"the most recent decision for this purpose wins"* (`anvaya.has_active_consent()`). Consequently there is deliberately **no** unique index on `(patient_id, purpose) WHERE status = 'granted'` — that index would make lawful re-consent after withdrawal impossible. Verified by test 14: grant → withdraw → re-grant leaves 3 rows and the correct answer at each step.

### 4.3 Laboratory catalogue

**`lab_test_catalog`** — `code text UNIQUE` is the same string the frontend already uses (`TESTS` keys, `/test/[id]` route param), so no client identifier changes. Also `name_en/hi`, `simple_name_en/hi` (`TestDef.simple`), `default_unit`, `loinc_code`, `category`, four description levels (`what.med/en/hi/vs_en/vs_hi`), `icon_key` (a rendering hint only — never used in any clinical decision).
*Index:* unique on `lower(code)` — case-insensitive lookup **without the citext extension**.

**`lab_test_aliases`** — the normalisation dictionary behind the "Data normalisation" pipeline stage. `lab_test_id → CASCADE`, `alias`, `language`, `source CHECK in (manual, ocr_observed, lab_dictionary, loinc)`. *Unique:* `(lab_test_id, lower(alias), language)`.

**`reference_range_sources`** — `code UNIQUE`, `name`, `country`, `url`, `authority_rank smallint > 0`. ICMR = 1, WHO = 2, LAB = 3, so Indian/ICMR/WHO ranges win ties, as the architecture requires.

**`reference_ranges`** — versioned, demographically scoped.
`lab_test_id → RESTRICT`, `source_id → RESTRICT`, `unit NOT NULL`, `ref_low`, `ref_high`, `critical_low`, `critical_high`, `borderline_frac numeric(6,4) DEFAULT 0 CHECK 0 ≤ x < 1`, `applicable_sex`, `age_min_years`, `age_max_years`, `population`, `version`, `effective_from NOT NULL`, `effective_to`, `is_active`.
*Checks:* at least one bound exists; `ref_low < ref_high`; `critical_low < ref_low`; `critical_high > ref_high`; age window ordered.
*Unique:* `(lab_test_id, source_id, version, unit, coalesce(sex,'any'), coalesce(population,'all'), effective_from)`.
Both bounds are nullable because **open-ended ranges are real** — `hba1c` is "below 5.7%" in the source data.

**`clinical_rules`** — `rule_key`, `version`, `description`, `engine_version`, `params jsonb`, `applies_to` (optional per-test), effective window.
*Unique:* `(rule_key, version, coalesce(applies_to, nil-uuid))` — this **must be a unique index, not a table UNIQUE constraint**: PostgreSQL does not allow expressions inside a UNIQUE constraint. (Caught during verification.)

### 4.4 Reports and processing

**`lab_reports`** — `patient_id → patients` **`ON DELETE RESTRICT`**, `legacy_code text UNIQUE` (preserves `feb26`/`apr26`/`jun26`/`aug26` so `/compare?old=apr26&new=aug26` keeps resolving), `status anvaya_report_status`, `upload_channel`, `lab_name`, `lab_location`, `report_number`, `collected_on date NOT NULL`, `reported_test_count`, `report_language`, `deleted_at`, `deleted_by`, `deletion_request_id`.
*Checks:* `collected_on <= current_date + 1`; `reported_test_count >= 0`.
`RESTRICT` on `patient_id` is deliberate: **deleting a patient must never silently cascade away medical records.** Verified by test 23.

**`report_files`** — storage references only, never bytes. `report_id → RESTRICT`, `kind anvaya_file_kind`, `bucket`, `storage_path`, `mime_type`, `byte_size`, `checksum_sha256`, `page_count`, `is_current`. *Unique:* `(bucket, storage_path)`.

**`report_processing_jobs`** — `report_id → CASCADE`, `stage anvaya_job_stage`, `status anvaya_job_status`, `attempt`, `progress_pct CHECK 0..100`, `idempotency_key UNIQUE`, `retry_of` (self-FK), `started_at`, `finished_at`, `error_code`, `error_message`.
*Checks:* `finished_at >= started_at`; terminal status ⇒ `finished_at` set.
The `anvaya_job_stage` enum is a **superset** of the 5 friendly labels in `src/lib/i18n.tsx:123-127`, extended with the stages the architecture requires (`normalisation`, `anonymisation`, `rag`, `review`, `release`). The progress screen renders a projection.

**`ocr_results`** — **PHI zone.** `report_id → CASCADE`, `job_id`, `page_no`, `engine`, `engine_version`, `raw_text`, `layout jsonb`, `confidence CHECK 0..1`, `word_count`, `artifact_path`. *Unique:* `(report_id, page_no, engine)`.
Raw OCR text can contain the patient's printed name, so this table is explicitly excluded from anything the LLM path reads.

### 4.5 Test results and deterministic validation

**`test_results`** — one row per (report, test). **No status column** (see Conflict A).

| Group | Columns |
|---|---|
| Provenance (immutable) | `raw_name NOT NULL`, `raw_unit`, `raw_value_text`, `value_qualifier CHECK (<,>,<=,>=,~,+,negative,positive,trace)` |
| Parsed | `value numeric(14,5)`, `unit`, `is_quantitative`, `qualitative_value` |
| Printed range | `printed_ref_low`, `printed_ref_high`, `printed_ref_text` |
| Catalogue range | `reference_range_id → reference_ranges` |
| Confidence | `ocr_confidence CHECK 0..1`, `field_confidence jsonb`, `confidence_level`, `confidence_note_en/hi` |
| Correction | `value_source`, `original_value`, `corrected_value`, `corrected_by`, `corrected_at`, `correction_reason` |
| Verdict pointer | `current_validation_id` (deferred FK) |

*Unique:* `(report_id, lab_test_id) WHERE lab_test_id IS NOT NULL` — **prevents duplicate test results** (test 2). Plus `(report_id, lower(raw_name)) WHERE lab_test_id IS NULL` for unmapped rows.
*Checks:* quantitative ⇒ `value` set, qualitative ⇒ `qualitative_value` set; a correction requires `corrected_by` **and** `corrected_at`; a `*_correction` source requires `corrected_value`.
*Trigger:* `guard_test_result_provenance` refuses changes to `report_id`, `lab_test_id`, `raw_name`, `raw_value_text`, `original_value`, `created_at` — while still permitting legitimate correction and confidence backfill.

`printed_ref_text` exists because the UI labels the range *"as printed on your report"* (`src/lib/i18n.tsx` `common.perReport`) and the architecture requires the lab's own printed range to win over generic values. `original_value` is never overwritten, so a correction cannot erase what the document said.

**`validation_results`** — ★ **the source of truth. Append-only.**
`test_result_id → RESTRICT`, `validation_seq`, `rule_id → RESTRICT`, `rule_version`, `engine_version`, `effective_value NOT NULL`, `unit NOT NULL`, `range_origin anvaya_range_origin`, `reference_range_id`, **`ref_low`, `ref_high`, `critical_low`, `critical_high`, `borderline_frac`** (all *copies*, not joins), `inputs_hash NOT NULL`, `computed_status anvaya_test_status NOT NULL`, `is_critical`, `is_abnormal`, `distance_from_range`, `rationale`, `computed_at`, `computed_by`.

*Unique:* `(test_result_id, validation_seq)`.
*Checks:* `is_critical = (computed_status = 'critical')`; critical ⇒ abnormal; `catalogue` origin ⇒ `reference_range_id` set; at least one bound present.
*Trigger:* `guard_immutable_row` blocks UPDATE **and** DELETE.
*RLS:* SELECT only. **No write policy exists, and no INSERT/UPDATE grant is given to `authenticated`.**

Three independent layers protect this table (verified by tests 04, 04b, 10, 11):
1. no INSERT/UPDATE grant to `authenticated`;
2. no INSERT/UPDATE RLS policy;
3. an immutability trigger that fires even for the table owner.

Storing copies of the bounds rather than joining is what makes **historical reports reproducible**: changing `reference_ranges` later cannot alter a past verdict (test 15 changes the hemoglobin lower bound from 12 to 10.0 and confirms the stored verdict and snapshot are unchanged).

**`anvaya.classify_value()`** — pure, `IMMUTABLE`, no I/O, so identical inputs always yield an identical status. Lives in the non-exposed `anvaya` schema and has `EXECUTE` **revoked** from `authenticated`, so a client cannot compute or claim a verdict.

### 4.6 Anonymisation

**`anonymization_records`** — the only bridge between PHI and the AI tables.
`lab_report_id → CASCADE`, `pseudonym uuid NOT NULL UNIQUE`, `method CHECK`, `removed_fields jsonb`, `retained_fields jsonb`, `age_band CHECK (0-11 … 80+)`, `sex`, `subject_digest`, `payload_ref`, `payload_sha256`.
Contains **no** name, phone, email, date of birth or report number. Age travels as a **band**, not a value, so the payload is not re-identifiable by combining a precise DOB with other facts. `subject_digest` is a keyed one-way digest, enabling "this patient has prior reports" without transmitting identity; the key lives in Vault/env, never in a table. Append-only.

### 4.7 RAG

**`rag_sources`** — `code UNIQUE` preserves the five existing `Source.id` strings (`medlineplus-hgb`, `cdc-a1c`, `aha-chol`, `nhlbi-tg`, `medlineplus-creatinine`) plus `title`, `publisher`, `country`, `url`, `is_clinical_authority`.
**`rag_documents`** — `rag_source_id → CASCADE`, `version`, `title`, `url`, `language`, `retrieved_at`, `content_sha256`, `index_version`, `is_active`. *Unique:* `(rag_source_id, version)`. A revised guideline does not invalidate citations issued against the older version.
**`rag_chunks`** — `document_id → CASCADE`, `seq`, `heading`, **`content NOT NULL`**, `token_count`, `external_vector_id UNIQUE` (the FAISS key), `embedding_model`, `embedding_dim`. *Unique:* `(document_id, seq)`.
**`rag_retrievals`** — `query_text` (anonymised), `engine DEFAULT 'faiss'`, `index_version`, `top_k`, `min_score`, `match_count`, `best_score`, `mean_score`, `latency_ms`.
**`rag_retrieval_matches`** — `retrieval_id → CASCADE`, `rag_chunk_id →` **`RESTRICT`**, `rank`, `score CHECK 0..1`, `matched_on`. *Unique:* `(retrieval_id, rank)`.

### 4.8 AI generation

**`ai_generations`** — **no `patient_id`, no `report_id`, no identifier column of any kind.**
`purpose`, `status`, `provider`, `model`, `model_version`, `prompt_key`, `prompt_version`, `system_prompt_sha256`, `temperature`, `max_tokens`, `anonymization_id → SET NULL`, `input_version`, `input_snapshot jsonb`, `retrieval_id`, `language`, `reading_level`, `raw_output`, `output_sha256`, `refusal_detected`, `safety_flags jsonb`, **`model_confidence`, `retrieval_similarity`, `trust_score`, `trust_level`, `trust_formula`**, `citation_count`, `tokens_prompt`, `tokens_completion`, `latency_ms`, `error_code`, `error_message`, timings.

*Checks:* terminal status ⇒ `finished_at`; `succeeded` ⇒ `raw_output`; `failed` ⇒ `error_message` (test 21).
The trust score is stored as **components and** combined verdict, with `trust_formula` recording the weighting (e.g. `0.6*model + 0.4*retrieval`) so a later change in weighting does not silently reinterpret old scores.
`provider` is a **name only** — API keys and secrets belong in Supabase Vault or environment variables, never in a table. Append-only.

**`ai_explanations`** — `generation_id → RESTRICT`, and **exactly one** subject via three nullable FKs plus `CHECK (anvaya.num_nonnulls(...) = 1)` (test 21b). Explicit FKs rather than a `(type, id)` pair so the database can actually enforce integrity.
`language`, `reading_level`, `version`, `body_md`, `body_plain` (TTS-ready — the app already builds such a string client-side as `speakAll` in `/test/[id]`), `heading`, `disclaimer`, `is_current`, `superseded_by`.
*Unique:* `(subject…, language, reading_level, version)`, plus a partial unique enforcing **exactly one `is_current`** per subject/language/level.
*Triggers:* DELETE blocked; UPDATE permitted only for `is_current`/`superseded_by` — the text itself is immutable, so an edit creates a new version and **the original AI draft is never destroyed**.

**`explanation_citations`** — `explanation_id → CASCADE`, `rag_chunk_id →` **`RESTRICT`**, `retrieval_match_id`, `citation_index`, `rank`, `similarity`, `quoted_text`. *Unique:* `(explanation_id, rag_chunk_id)`. Append-only.

### 4.9 Patterns

**`pattern_templates`** — static catalogue; `code UNIQUE` preserves `pattern-lipid` / `pattern-blood` / `pattern-sugar`.
**`report_patterns`** — `report_id → CASCADE`, `template_id → RESTRICT`, `detection CHECK in (rule, model, clinician)`, `generation_id`, `rag_source_id`, `confidence_level`, `confidence_pct CHECK 0..100`, `is_significant`. *Unique:* `(report_id, template_id)`.
**`report_pattern_members`** — `report_pattern_id → CASCADE`, `lab_test_id → RESTRICT`, `test_result_id → SET NULL`, `direction anvaya_trend_dir`, `note_en/hi`, `position`. *Unique:* `(report_pattern_id, lab_test_id)`.
`direction` is a **trend descriptor**, never a re-classification of the deterministic status. Narrative text is not duplicated here — it lives in `ai_explanations` with `subject_report_pattern_id`, so patterns get the same language × reading-level versioning as everything else.

### 4.10 Review and release

**`report_versions`** — `report_id → RESTRICT`, `version_no`, `origin anvaya_version_origin`, `based_on_version_id` (self-FK), `edited_by`, `change_summary`, `content_snapshot jsonb`, `doctor_notes`, `is_locked`.
*Unique:* `(report_id, version_no)`. *Check:* `doctor_edit` ⇒ `edited_by` set (test 13c).
Immutable. `content_snapshot` is the **only** jsonb blob in the review path — it is a frozen document artefact (section order, included explanation ids), not queryable state; every fact the app queries lives in its own table.

**`report_translations`** — `report_version_id → CASCADE`, `language`, `narrative_md`, `narrative_plain`, `authored_by anvaya_text_author`, `generation_id`, `reviewed_by`, `is_current`. *Unique:* `(report_version_id, language)`.
Only the **narrative** is per-language; the validated facts are not duplicated, so a translation can never disagree with the deterministic classification.

**`doctor_reviews`** — `report_id → RESTRICT`, `report_version_id → RESTRICT`, `doctor_id → doctors` **`RESTRICT`**, `status anvaya_review_status`, `assigned_at/by`, `opened_at`, `decision_at`, `signed_at`, `signature_ref`, `comments`, `rejection_reason`, `previous_status`.
*Unique:* `(report_version_id, doctor_id) WHERE status IN (draft, pending_review, needs_edit)` — one open review per clinician per version.
*Checks:* decision states ⇒ `decision_at`; `signed_at` ⇒ approved/released; `needs_edit` ⇒ `rejection_reason`.
Reviewer identity is a hard FK to `doctors`, so **no review can exist without an attributable clinician**.

**`report_releases`** — `report_id → RESTRICT`, `report_version_id → RESTRICT`, `review_id → SET NULL`, `released_by → profiles RESTRICT`, `released_at`, `release_channel`, `is_active`, `superseded_at/by`, `revoked_at`, `revoked_reason`, `pdf_path`, `tts_path`.
*Unique:* `(report_id) WHERE is_active` — **exactly one patient-facing version**.

### 4.11 Voice / Q&A

**`voice_sessions`** — `patient_id → CASCADE`, `lab_report_id → SET NULL`, `channel`, `language`, `stt_engine`, `tts_engine`, `device_hint`, `started_at`, `ended_at`, `turn_count`.
**`qa_messages`** — `session_id → CASCADE`, `parent_message_id` (self-FK), `role anvaya_message_role`, `body_md`, `body_plain`, `language`, `transcript`, `transcript_confidence`, `audio_bucket`, `audio_path`, `audio_duration_ms`, `generation_id`, `matched_topic`, **`sources_count`**, **`confidence_level`**, `is_fallback`, `latency_ms`.
`sources_count` and `confidence_level` are the direct persistence of the two `/api/answer` response fields; `is_fallback` records the `FALLBACK` answer. *Checks:* audio bucket and path are set together; an assistant message needs a generation or the fallback flag. Append-only. **Audio bytes are never in Postgres** — only a private-bucket key.
**`answer_feedback`** — `qa_message_id → CASCADE`, `patient_id → CASCADE`, `helpful`, `comment`. *Unique:* `(qa_message_id, patient_id)`. This is what turns the current `persisted: false` stub into a real record.

### 4.12 Audit, erasure, errors

**`audit_logs`** — `id bigint GENERATED ALWAYS AS IDENTITY`, `occurred_at`, `actor_id`, `actor_role`, `action` (**CHECK against a closed list of 39 actions**, from `consent.granted` through `admin.reference_range_updated`), `entity_type`, `entity_id text`, `patient_id` (nullable on purpose), `report_id`, `outcome CHECK (success, failure, denied)`, `metadata jsonb`, `ip_address`, `user_agent`, **`prev_hash`, `row_hash`**.
*Trigger `audit_seal_row`:* computes `prev_hash` from the previous row and `row_hash = sha256(prev_hash|…all fields…)` on INSERT — a hash chain, so silent deletion or editing of history is detectable.
*Trigger `guard_audit_row`:* DELETE **always** refused. UPDATE refused **unless** the session is inside a sanctioned erasure and the *only* change is clearing `patient_id` — de-linking the record from the person while preserving the fact that the action happened.
`patient_id` is nullable precisely so erasure can de-link without destroying the compliance record. `metadata` must never hold a clinical value, a report body, or a credential.
`write_audit()` has `EXECUTE` **revoked** from `authenticated`, so a client cannot forge an audit entry.

**`deletion_requests`** — `patient_id → CASCADE`, `scope`, `lab_report_id`, `reason`, `status`, `requested_at`, `started_at`, `completed_at`, `verified_by`, `items_deleted jsonb`, **`retained_audit boolean DEFAULT true`**, `notes`.
*Checks:* `single_report` ⇒ `lab_report_id`; `completed` ⇒ `completed_at`.
The request row survives completion and records what was destroyed, so "the patient asked and we did it" remains provable after the PHI is gone.

**`system_errors`** — `component`, `severity`, `error_code`, `message`, `stack_trace`, **`context jsonb` (must be anonymised)**, `lab_report_id/job_id/generation_id → SET NULL`, `fingerprint`, `occurrence_count`, `first_seen_at`, `last_seen_at`, `resolved_at/by`, `resolution`. *Checks:* resolved ⇒ resolution; `last_seen_at >= first_seen_at`.

---

## 5. RLS/security model

### 5.1 Roles

| Role | Kind | Capability |
|---|---|---|
| `anon` | Supabase | **Nothing.** No SELECT grant on any `public` table; `EXECUTE` revoked on every function in `public` and `anvaya`. Verified by test 20. |
| `authenticated` | Supabase | Reads gated per-row by `profiles.role` and ownership; narrow INSERT/UPDATE where a patient legitimately creates their own rows. |
| `service_role` | Supabase | Bypasses RLS. **Server-side only** — the service key must never be shipped to the browser. |
| `patient` / `doctor` / `admin` | Application (`profiles.role`) | Drives every policy. Set by `handle_new_auth_user()` from server-set user metadata, never from client input, and changeable only by an admin (trigger `guard_profile_privileges`, test 07). |

### 5.2 Patient

| Can | Cannot |
|---|---|
| Read own reports, test results, validations, explanations, citations, patterns, versions, translations, releases | Read any other patient's data (test 03) |
| Insert own report, files, consent decision, voice session, Q&A message, deletion request, feedback | Read `audit_logs` or `system_errors` (test 08) |
| Correct a parsed value **via `anvaya.submit_value_correction()`** | Write to `test_results` directly — no INSERT/UPDATE policy exists |
| Update own accessibility preferences | **Modify deterministic validation** — three independent layers (test 04, 04b) |
| | **Approve or release own report** — `set_review_status` verifies `current_doctor_id() = review.doctor_id` (test 05) |
| | Change report `status` or `deleted_at` — `guard_lab_report_core` (test 06) |
| | Reassign a report to another patient (test 06) |
| | Escalate own role (test 07) |

### 5.3 Doctor

| Can | Cannot |
|---|---|
| See only patients with an unexpired, unrevoked `doctor_patient_access` row (test 09) | See any patient without a grant (test 09) |
| Create/edit review records and sign off, via `anvaya.set_review_status()` | Write to `validation_results` — SELECT only (test 10) |
| Release, **only** the version they approved, via `anvaya.release_report()` | Skip the workflow: `draft → approved` is refused (test 12) |
| Read the audit trail? **No** — admin only | Approve without a reason when returning for edit (test 12) |

### 5.4 Admin and service role

`anvaya.is_admin()` reads `profiles.role`. Admin gets read access to `audit_logs`, `system_errors`, `anonymization_records`, `rag_retrievals`/`matches`, and may update `deletion_requests`. Admin is **not** omnipotent: the immutability triggers on `validation_results`, `ai_generations`, `ai_explanations`, `explanation_citations`, `patient_consents` and `audit_logs` fire for the table owner too (test 11).

`service_role` bypasses RLS and is the only writer for OCR, validation, RAG and LLM pipeline tables.

### 5.5 Two defence layers RLS alone cannot provide

RLS is row-level, so privilege escalation *through a column* needs triggers:

* `guard_profile_privileges` — non-privileged callers cannot change `role` or `status`.
* `guard_lab_report_core` — `patient_id` and `created_at` are immutable for everyone; `status` and `deleted_at` require privilege.
* `guard_patient_identity` / `guard_doctor_identity` — profile linkage is admin-only; ids immutable.
* `guard_test_result_provenance` — what the document said can never be rewritten.

These use `anvaya.is_definer_context(tg_relid)`, which is true when the statement runs inside a SECURITY DEFINER function owned by the table owner (so `current_user` has become the owner). A client session is `authenticated` or `anon` and can never be the table owner, so it cannot be spoofed — but the sanctioned review/release/erasure functions can still do their job. This distinction was found by verification: without it, `set_review_status()` could not move a report into review.

### 5.6 Function exposure

The `anvaya` schema is **not** in `pgrst.db_schemas`, so PostgREST exposes none of it as RPC endpoints. `authenticated` holds `USAGE` (needed to resolve a qualified call) and `EXECUTE` on the read-only helpers — which RLS policies require, since a policy expression runs as the querying user.

`EXECUTE` is **revoked** from `public`/`anon`/`authenticated` on:
* `anvaya.write_audit` — a client cannot forge an audit entry;
* `anvaya.classify_value` — a client cannot compute or claim a verdict.

Both remain callable by the SECURITY DEFINER functions and by `service_role`.

The five user-initiated operations (`submit_value_correction`, `set_review_status`, `release_report`, `hard_delete_report`, `hard_delete_patient`) stay callable by `authenticated` **on purpose**: each authorises against `auth.uid()`, so the real caller's identity is what is checked. **Call them from a Next.js route handler using a user-scoped Supabase client built from the request's access token — never with the service key** (with the service key `auth.uid()` is null and every authorisation check correctly fails).

### 5.7 One referential subtlety worth knowing

Row triggers fire **before** FK enforcement. `patient_consents → patients` was therefore made `ON DELETE RESTRICT` rather than `CASCADE`: with `CASCADE`, deleting a patient would surface the append-only consent error instead of the referential one, which is the wrong diagnostic for the same correct outcome. Found by verification.

---

## 6. Supabase Storage model

**All five buckets are private.** A public bucket serving lab reports would defeat the entire RLS model, because a signed URL is not required to read a public object. Verified: `select count(*) from storage.buckets where public` → **0**.

| Bucket | Contents | Size limit | Allowed MIME |
|---|---|---|---|
| `report-originals` | The uploaded photo / PDF, untouched | 25 MB | jpeg, png, webp, heic, pdf, csv |
| `report-processed` | Deskewed / contrast-fixed render; OCR artefacts | 25 MB | jpeg, png, webp, json |
| `report-exports` | Patient and doctor PDF exports | 15 MB | pdf, png |
| `voice-audio` | Captured question audio + generated TTS | 10 MB | webm, mpeg, mp4, ogg, wav |
| `consent-evidence` | Voice-consent recordings, signature images | 10 MB | webm, mpeg, wav, png, jpeg, pdf |

### 6.1 Key convention

```
{patient_id}/{report_id}/{kind}-{n}.{ext}
```

Prefixing with `patient_id` makes per-patient erasure a **single prefix delete**, which `anvaya.hard_delete_report()` relies on. Test 22 confirms the object disappears, and test 24 confirms a *different* patient's object is untouched.

### 6.2 Ownership and policies

Ownership is expressed by the path prefix, not by `storage.objects.owner`, because a report may be uploaded by the patient and exported by a clinician. One predicate, `anvaya.may_access_patient_prefix(name)`, backs every policy and reuses the **same** `doctor_patient_access` table as the database RLS — so storage ACLs and row-level security can never disagree.

For each bucket: `SELECT` / `INSERT` / `DELETE` policies `to authenticated` gated on that predicate (owner, authorised clinician, or admin).

### 6.2.1 The migration does **not** touch anything Supabase owns

`storage.buckets` and `storage.objects` are owned by `supabase_storage_admin`. Since Supabase platform migration `20250421084701_revoke_admin_roles_from_postgres` the role the SQL Editor connects as (`postgres`) is no longer a member of that role, so it is no longer treated as the owner of those tables — and PostgreSQL requires **ownership**, not a table grant, for `ALTER TABLE`, `CREATE INDEX`, `CREATE POLICY`, `DROP POLICY` and `COMMENT ON POLICY`. Every one of those therefore fails from the SQL Editor with `ERROR 42501: must be owner of table objects`.

`0019_storage.sql` was written before that change landed and assumed ownership. It now:

* **creates the five private buckets** — DML on `storage.buckets` is explicitly granted to `postgres`, so this always runs;
* **fails the migration if any of the five is public**, rather than shipping a public medical bucket;
* **creates `anvaya.may_access_patient_prefix()`** in our own schema, where we do own things;
* **creates the 15 object policies only behind a capability probe** — `pg_has_role(current_user, <owner of storage.objects>, 'USAGE')`, which is the SQL-visible form of the check PostgreSQL itself runs. When the probe is false it skips the policies, emits a `NOTICE` naming the dashboard step, and exits 0.

It no longer contains `alter table storage.objects enable row level security`. Supabase's own storage migrations already enable RLS on both `storage.objects` (storage tenant `0002`) and `storage.buckets` (tenant `0007`); re-asserting it is not ours to do and is the statement that produced the 42501.

**Direction of failure.** If the policies are not created, `storage.objects` RLS is on with no policy for our buckets, so `authenticated` can read, upload and delete *nothing*. Storage is closed by default; adding the policies in the dashboard is what opens the narrow, prefix-scoped path. It is never the step that closes a hole.

### 6.2.2 What must be done in the dashboard

The 15 object policies. `Storage → Policies → storage.objects → For full customization`, one policy per bucket per command, `authenticated`, with `USING` / `WITH CHECK`:

```
bucket_id = '<bucket>' and anvaya.may_access_patient_prefix(name)
```

`db/harness/20_storage_policies_as_platform.sql` contains the same 15 statements as copy-pasteable SQL, and `db/harness/99_verify_supabase.sql` checks afterwards that all 15 are present, all five buckets are private, and `storage.objects` RLS is on.

### 6.2.3 Direct deletes from `storage.objects` are refused by default

Supabase Storage tenant migration `0055-prevent-direct-deletes` attaches a statement-level `BEFORE DELETE` trigger to `storage.objects` (and `storage.buckets`) that raises `42501: Direct deletion from storage tables is not allowed. Use the Storage API instead.` unless the transaction sets `storage.allow_delete_query = 'true'`.

`anvaya.hard_delete_report()` therefore sets that GUC transaction-locally around its prefix delete and restores it immediately after. That is the platform's sanctioned override, scoped as tightly as it can be: transaction-local, inside a `SECURITY DEFINER` function that has already authorised against `auth.uid()`, and for one report prefix only. The alternative — dropping the delete — would leave a patient's original scan, OCR dump and exports in a bucket after they had exercised their right to erasure. Test 22 covers it, and a plain `delete from storage.objects` in the same session immediately afterwards is still refused.

### 6.3 What stays out of storage

Nothing that the app queries. `report_files`, `qa_messages.audio_path`, `report_releases.pdf_path` / `tts_path` and `doctors.signature_ref` hold bucket + key; the bytes never enter PostgreSQL.

---

## 7. Migration ordering

Run in filename order. Every file states its purpose, dependencies, freshness and contract impact in its header.

| File | Purpose | Depends on | Fresh-safe | Changes an existing contract? |
|---|---|---|---|---|
| `0001_schemas_and_helpers.sql` | `anvaya` schema; `set_updated_at`, `guard_immutable_row`, `num_nonnulls` | — | Yes | No — additive |
| `0002_enums.sql` | 28 enum types, guarded by `pg_type` lookups | 0001 | Yes | No — members copied verbatim from the TS unions |
| `0003_identity.sql` | `profiles`, `patients`, `doctors`, auth trigger | 0001-0002 | Yes | No — no auth exists today |
| `0004_doctor_access.sql` | `doctor_patient_access` | 0003 | Yes | No |
| `0005_consent.sql` | `consent_policies`, `patient_consents` | 0002-0003 | Yes | No |
| `0006_lab_catalog.sql` | `lab_test_catalog`, `lab_test_aliases`, `reference_range_sources`, `reference_ranges`, `clinical_rules` | 0001-0002 | Yes | No — `code` preserves existing test ids |
| `0007_reports.sql` | `lab_reports`, `report_files`, `report_processing_jobs`, `ocr_results` | 0002-0003 | Yes | No — `legacy_code` preserves `feb26`…`aug26` |
| `0008_test_results.sql` | `test_results` + provenance guard | 0006-0007 | Yes | No |
| `0009_validation.sql` | `validation_results`, deferred FK back to `test_results`, `anvaya.classify_value` | 0006, 0008 | Yes | No |
| `0010_anonymization.sql` | `anonymization_records` | 0007 | Yes | No |
| `0011_rag.sql` | `rag_sources`, `rag_documents`, `rag_chunks`, `rag_retrievals`, `rag_retrieval_matches` | 0001-0002 | Yes | No — `code` preserves existing source ids |
| `0012_ai.sql` | `ai_generations`, `ai_explanations`, `explanation_citations` | 0008, 0010, 0011 | Yes | No |
| `0013_patterns.sql` | `pattern_templates`, `report_patterns`, `report_pattern_members`, FK back to `ai_explanations` | 0006-0007, 0012 | Yes | No |
| `0014_review_release.sql` | `report_versions`, `report_translations`, `doctor_reviews`, `report_releases` | 0003-0004, 0007, 0012 | Yes | No |
| `0015_qa_voice.sql` | `voice_sessions`, `qa_messages`, `answer_feedback` | 0003, 0007, 0012 | Yes | No — makes `/api/feedback` persistable |
| `0016_audit_deletion_errors.sql` | `audit_logs` + hash chain, `deletion_requests`, `system_errors` | 0001-0003 | Yes | No |
| `0017_functions.sql` | 21 `anvaya.*` functions: identity, consent gate, audit writer, correction, review transitions, release, erasure | 0003-0016 | Yes | No |
| `0018_rls.sql` | RLS on all 39 tables, 4 column-guard triggers, grants, 69 policies | 0003-0017 | Yes | No |
| `0019_storage.sql` | 5 private buckets (+ public-bucket guard), prefix predicate, 15 object policies **behind an ownership capability probe** — the dashboard creates them on a stock project | 0004, 0017, 0018 | Yes | No |
| `0020_views.sql` | 6 read models | 0006-0016 | Yes | No — shapes match the TS interfaces |
| `0021_seed_catalog.sql` | 14 tests, 30 aliases, 14 ranges, 4 range sources, 5 RAG sources, 3 pattern templates, 1 rule, 6 consent policies | 0005-0006, 0013 | Yes — `ON CONFLICT DO NOTHING` throughout | No |

Ordering is driven by FK dependencies; the two back-references (0009 → 0008, 0013 → 0012) are added with guarded `ALTER TABLE` inside `DO` blocks.

**Nothing is dropped, renamed or destructively altered anywhere in the set.**

---

## 8. Complete SQL migration

Two equivalent artefacts, both in this repository:

| Path | Use |
|---|---|
| **`db/anvaya_schema.sql`** | **Single file, 4,433 lines. Paste this into the Supabase SQL Editor and run it.** |
| `db/migrations/0001…0021_*.sql` | The same content split for migration tooling; run in filename order. |

Properties, all verified:

* **Requires no extensions.** No `pgcrypto` (`gen_random_uuid()` is built in since PG13), no `citext` (`lower()` unique indexes instead), no `pgvector` (FAISS holds the vectors). Nothing to provision, no superuser action.
* **Safe on a fresh Supabase project** — applied cleanly to an empty PostgreSQL 16.2 database.
* **Idempotent** — applied three times consecutively with zero failures; re-running is a no-op.
* **No pseudo-SQL** — every statement was executed.

### 8.1 What the run produced

| Object | Count |
|---|---|
| Tables (`public`) | 39 |
| Tables with RLS enabled | **39 (0 missing)** |
| Views | 6 |
| RLS + storage policies | 69 |
| Indexes | 173 |
| Triggers | 33 |
| Functions (`public` + `anvaya`) | 32 |
| Enum types | 28 |
| Tables missing a `COMMENT` | **0** |
| Storage buckets | 5 |
| Public buckets | **0** |
| Foreign keys | 84 (39 SET NULL, 23 CASCADE, 22 RESTRICT) |

### 8.2 Re-running the verification yourself

```bash
python3 -m venv .venv && .venv/bin/pip install pgserver
PATH=.venv/bin:$PATH ./db/harness/verify.sh
```

`db/harness/verify.sh` boots a throwaway PostgreSQL and recreates the slice of the Supabase platform the migrations depend on — `auth.uid()`/`auth.role()`, `storage.buckets`/`storage.objects`, the platform roles **and their permission model**: the storage tables are owned by `supabase_storage_admin`, RLS is on, the `0055-prevent-direct-deletes` triggers are attached, and the migrations run as `postgres_editor`, a `NOSUPERUSER BYPASSRLS` role that is deliberately *not* a member of `supabase_storage_admin`. That is what the `postgres` role is on a real project since 2025-04-21, so anything that assumes ownership of a Supabase-managed table fails here with the same `SQLSTATE 42501` it fails with in the SQL Editor.

The run then:

1. asserts `anvaya_schema.sql` is byte-for-byte in sync with `db/migrations/` (`resplice_schema.py --check`);
2. applies all 21 migrations **three times** as `postgres_editor`;
3. runs `0019` on a policy-free project to prove the skip-and-`NOTICE` path exits 0;
4. performs the dashboard step (`20_storage_policies_as_platform.sql`) as the platform admin and re-runs `0019` to prove it is still idempotent with the policies already present;
5. runs the 31 behavioural tests;
6. applies `anvaya_schema.sql` as **one single paste** to a second database and diffs the resulting schema against the migrations build;
7. runs `99_verify_supabase.sql` against both builds.

Last run: exit 0, 63 migration applications OK, 0 failures, `ALL BEHAVIOUR TESTS PASSED`, both builds → 39 base tables + 6 views, verification 11/11 PASS on the migrations build and the expected single FAIL on check 6 for the not-yet-configured single-file build.

The harness files are test scaffolding only — `00_supabase_stubs.sql` is not part of the migration set, and none of it is needed on a real Supabase project.

### 8.3 Indexing rationale (not "index every column")

| Query pattern | Index |
|---|---|
| Patient report history (My Reports / Trends) | `reports_patient_history_idx (patient_id, collected_on DESC) WHERE deleted_at IS NULL` |
| Report status board | `reports_status_idx (status) WHERE deleted_at IS NULL` |
| Doctor review queue | `dr_queue_idx (doctor_id, assigned_at) WHERE status='pending_review'` |
| Processing queue drain | `jobs_queue_idx (stage, created_at) WHERE status='queued'` |
| Stuck jobs | `jobs_running_idx (status, started_at) WHERE status='running'` |
| Test history / trends | `tr_trend_idx (lab_test_id, report_id)` + `reports_patient_history_idx` |
| Low-confidence extraction review | `tr_low_confidence_idx (report_id) WHERE ocr_confidence < 0.85` |
| Consent lookup | `consents_active_lookup_idx (patient_id, purpose, granted_at DESC)` |
| Audit by patient / action / entity | `audit_patient_idx`, `audit_action_idx`, `audit_entity_idx`, `audit_denied_idx` |
| Citations both directions | `cit_explanation_idx (explanation_id, citation_index)`, `cit_chunk_idx` |
| Latest verdict per measurement | `vr_latest_idx (test_result_id, validation_seq DESC)` |
| Applicable range today | `rr_applicability_idx (lab_test_id, effective_from DESC) WHERE is_active` |
| One active release | `rel_one_active_per_report (report_id) WHERE is_active` |

---

## 9. Validation checklist

### 9.1 The §20 safety checks

| Risk | Status | How it is prevented | Verified by |
|---|---|---|---|
| Orphan records | ✅ | Every FK declared; no polymorphic `(type, id)` pairs anywhere | Schema inspection |
| Circular foreign keys | ✅ | Exactly 2 cycles, both intentional: the deferred `test_results ↔ validation_results`, and the `report_versions` self-DAG (v1 is NULL) | 0009, 0014 |
| Accidental cascading deletion of medical records | ✅ | `patients → lab_reports`, `→ patient_consents`, `→ test_results`, `→ report_files/versions/releases/reviews` are all `RESTRICT` | **Test 23** |
| Duplicate test results | ✅ | Unique `(report_id, lab_test_id)`; unique `(report_id, lower(raw_name))` for unmapped | **Test 02** |
| Inability to preserve historical reference ranges | ✅ | `validation_results` snapshots `ref_low/high`, `critical_*`, `borderline_frac`, `rule_version`, `engine_version`, `inputs_hash` | **Test 15** |
| Frontend can alter deterministic validation | ✅ | No grant + no policy + immutable trigger | **Tests 04, 04b, 11** |
| Patients can approve their own reports | ✅ | `set_review_status` requires `current_doctor_id() = review.doctor_id`; `release_report` requires the approving clinician | **Test 05** |
| Exposure of private reports | ✅ | `anvaya.can_access_report()` on every clinical table; `anon` has no SELECT at all; 0 public buckets | **Tests 03, 09, 19, 20** |
| Exposure of PII to AI tables | ✅ | `ai_generations` / `ai_explanations` have **no identifier column**; the only outward link is `anonymization_id` | Schema inspection |
| Missing report versioning | ✅ | `report_versions` immutable, `based_on_version_id` chain; explanation text immutable with `is_current` flips | **Test 13d** |
| Missing consent linkage | ✅ | `patient_consents.patient_id`; `anvaya.has_active_consent()` is the pipeline gate | **Test 14** |
| Missing auditability | ✅ | Hash-chained, append-only `audit_logs`; 39-action closed vocabulary | **Tests 17, 25** |
| Missing doctor identity | ✅ | `doctor_reviews.doctor_id → doctors RESTRICT` (a review cannot exist without one) | **Test 12** |
| Missing provenance / citations | ✅ | `v_citation_trail`: explanation → chunk → document → publisher, with rank and similarity | **Test 21b** |
| Missing trend-query support | ✅ | `v_test_history` + `tr_trend_idx` | **Test 18** |

### 9.2 Bugs found and fixed *by* running the SQL

These were not visible by reading the SQL. Each would have failed in production.

| # | Bug | Impact if shipped | Found by |
|---|---|---|---|
| 1 | Expressions (`coalesce`) inside a table-level `UNIQUE` constraint | `0006` would not run at all | Pass 1 |
| 2 | `comment on policy report_originals_read` vs generated name `report-originals_read` | `0019` aborts | Pass 1 |
| 3 | Missing `::anvaya_lang_code` cast in the alias seed | `0021` aborts | Pass 1 |
| 4 | Two `ALTER TABLE ADD CONSTRAINT` statements unguarded | Second run aborts — not idempotent | Pass 2 |
| 5 | **`sha256(text)`** — the function takes `bytea` | **Every audit write would fail**, breaking `set_review_status`, `submit_value_correction`, `release_report` and both erasure functions | Test 05 |
| 6 | **`new ->> 'id'`** in a row trigger — `NEW`/`OLD` are composite records, not jsonb | Every immutability guard raised the *wrong* error | Test 11 |
| 7 | Column guards blocked legitimate writes from inside the SECURITY DEFINER review function | `set_review_status` could not move a report into review | Test 12 |
| 8 | Immutability guards made erasure impossible | A patient's right to erasure could not be honoured | Test 22 |
| 9 | `patient_consents → patients CASCADE` + trigger ordering | Wrong diagnostic on patient delete | Test 23 |
| 10 | `authenticated` lacked `USAGE` on `anvaya` (RLS worked only because policy expressions store resolved OIDs) | Any direct function call failed | Test 05 |
| 11 | Storage policies inert without RLS on `storage.objects` | `0019` ran `alter table storage.objects enable row level security` — **the statement that produces `42501: must be owner of table objects` on a real project**. Removed; Supabase enables it itself | Reproduced: `0019:82` |
| 12 | `0019` also ran 15 `create policy`, 5 `drop policy` and 1 `comment on policy` against `storage.objects` | Same `42501`. Worse, `drop policy if exists` only fails when the policy **exists**, so the migration passed on a fresh project and broke on every re-run after the dashboard step | Reproduced per-statement |
| 13 | `hard_delete_report()` deleted from `storage.objects` directly | Supabase's `protect_objects_delete` trigger raises `42501: Direct deletion from storage tables is not allowed`, so **a patient's right to erasure could not be honoured** — the clinical rows would be gone while the scan, OCR dump and exports stayed in the bucket | Test 22 against the real triggers |

### 9.3 Test inventory (31 assertions, all passing)

```
TEST 01  classify_value: five-state deterministic classification
TEST 02  duplicate test results are rejected
TEST 03  RLS: a patient sees only their own report
TEST 04  patient cannot modify deterministic validation results (grant layer)
TEST 04b even WITH an UPDATE grant, RLS still blocks the patient (0 rows)
TEST 05  RLS: patient cannot approve or release their own report
TEST 06  RLS: patient cannot flip report status or reassign ownership
TEST 07  RLS: patient cannot escalate their own role
TEST 08  RLS: patient cannot read the audit trail or other patients' data
TEST 09  RLS: a doctor without a grant sees nothing; with a grant, sees the report
TEST 10  A doctor cannot overwrite a deterministic validation either
TEST 11  validation_results is immutable even for the table owner
TEST 12  review workflow: illegal transitions refused, legal ones accepted
TEST 13  release: blocked without approval, succeeds with it, single active release
TEST 13b release of an unapproved version is refused
TEST 13c a doctor_edit version with no author is rejected
TEST 13d the AI draft version still exists after a doctor edit
TEST 14  consent: latest decision wins (grant -> withdraw -> re-grant)
TEST 14b consent rows are immutable
TEST 15  reference range versioning: a past verdict survives a range change
TEST 16  test_results provenance is immutable; corrections go via the function
TEST 17  audit trail exists, is hash-chained, and is append-only
TEST 18  derived views: attention_count is computed, not stored
TEST 19  storage: buckets are private and objects are prefix-scoped
TEST 20  anon sees nothing at all
TEST 21  ai_generations invariants hold
TEST 21b an explanation must have exactly one subject
TEST 22  hard delete: clinical rows destroyed, audit survives
TEST 23  deleting a patient cannot cascade away medical records
TEST 24  account erasure: data destroyed, audit de-linked but preserved
TEST 25  audit hash chain still verifies after erasure
```

### 9.4 Two seeded values that need clinical sign-off before go-live

Flagged in `0021_seed_catalog.sql` itself, and restated here because they are **data**, not schema:

1. **`reference_ranges.borderline_frac = 0.10`** for every test. The app renders a fifth status ("Needs attention") but defines no band width anywhere, and the demo data is inconsistent about it (Conflict A). 0.10 (10% of the reference span beyond the bound) is a reasonable starting default, **not a clinical decision**.
2. **`critical_low` / `critical_high` are `NULL` for every test.** Panic values must come from an authoritative source (ICMR or the reporting laboratory). `CRITICAL_DEMO` in `src/lib/data.ts` shows potassium 6.4 mmol/L flagged as urgent, but that is fictional demo content and is not a citable threshold. The mechanism is fully wired — `anvaya.classify_value()` honours critical bounds and `validation_results` records them — so enabling it is a data change, not a schema change.

The seeded ranges are the ones printed in the demo app, attributed to source code `APP_DEMO` (`authority_rank 90`) so ICMR/WHO rows supersede them automatically.

---

## 10. Application integration notes

### 10.1 Wiring the existing screens

| Screen | Reads today | Reads from |
|---|---|---|
| `/dashboard` | `LATEST`, `PATTERNS`, `STORY`, `CRITICAL_DEMO` | `v_report_summary` + `v_patient_latest_results` + `report_patterns` |
| `/reports` | `REPORTS` | `v_report_summary` ordered by `collected_on DESC` |
| `/trends` | `trendSeries()`, `getValue()`, `TREND_CARDS` | `v_test_history` |
| `/compare?old=&new=` | `REPORTS.find(r => r.id === …)` | `lab_reports.legacy_code` still resolves `feb26`…`aug26` |
| `/test/[id]` | `TESTS[params.id]`, `latestEntry()` | `lab_test_catalog.code` — **the route param is unchanged** |
| `/extracted` | `LATEST.entries`, local `fixed` map | `test_results` + `anvaya.submit_value_correction()` |
| `/sources` | `SOURCES` | `rag_sources` |
| `/insights` | `PATTERNS`, `KG_CLUSTERS` | `report_patterns` + members; `KG_CLUSTERS` stays a client constant |
| `/processing` | `requestAnimationFrame` | `v_report_pipeline WHERE attempt_rank = 1` |
| `/doctor` | `LATEST`, `PATIENT`, `SOURCES` | Unchanged in purpose — a patient-facing printable summary; add `report_releases.pdf_path` for the Download button |
| `/ask` | `POST /api/answer` | `qa_messages`; persist `sources_count` and `confidence_level` from the response |

**No client identifier changes.** `TestDef.id` → `lab_test_catalog.code`, `Source.id` → `rag_sources.code`, `Report.id` → `lab_reports.legacy_code`, `Pattern.id` → `pattern_templates.code`.

### 10.2 Client setup

```ts
import { createClient } from "@supabase/supabase-js";

// Browser: anon key. RLS does all the work.
export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);

// Server (route handlers / pipeline workers): service key. NEVER imported
// into a client component.
export const serviceClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);
```

Add `@supabase/supabase-js` to `package.json` — it is not currently a dependency. Keys go in `.env.local` and Vercel env vars, **never in a database table**.

### 10.3 Calling the privileged operations

```ts
// app/api/reports/[id]/correct/route.ts  — user-scoped client, NOT the service key
import { createClient } from "@supabase/supabase-js";

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const auth = req.headers.get("authorization");
  const user = createClient(url, anonKey, { global: { headers: { authorization: auth! } } });

  // `anvaya` is not in pgrst.db_schemas, so this must run over a direct
  // connection (e.g. `pg` with DATABASE_URL) rather than through PostgREST.
  await pool.query("select anvaya.submit_value_correction($1, $2, $3, false)", [
    params.id, body.value, body.reason,
  ]);
}
```

The five user-initiated operations authorise against `auth.uid()`, so they **must** be invoked with the caller's own JWT. With the service key, `auth.uid()` is null and every check correctly fails.

The pipeline (OCR → validation → anonymisation → RAG → LLM) runs under `service_role` and writes the tables directly.

### 10.4 The processing pipeline, stage by stage

```
1. POST /api/reports        insert lab_reports (status='uploaded')
                            upload to report-originals → insert report_files
                            insert report_processing_jobs (stage='ocr')

2. OCR worker               insert ocr_results; job stage='parsing'
   ⚠ MUST call anvaya.has_active_consent(patient_id, 'report_parsing') first

3. Parser                   insert test_results (raw_name/raw_value_text/original_value
                            + printed_ref_* + ocr_confidence); job stage='normalisation'
                            resolve raw_name → lab_test_catalog via lab_test_aliases

4. Validator                for each test_result:
                              pick the range (lab_printed wins; else catalogue by
                                authority_rank, sex, age band, effective date)
                              status := anvaya.classify_value(...)
                              insert validation_results (snapshot the inputs!)
                              update test_results.current_validation_id
                            job stage='validation'

5. Anonymiser               insert anonymization_records (pseudonym, age_band, sex)
                            build the PII-free payload  →  job stage='anonymisation'
   ⚠ MUST call anvaya.has_active_consent(patient_id, 'ai_explanation') first

6. RAG                      insert rag_retrievals + rag_retrieval_matches from FAISS
                            job stage='rag'

7. LLM                      insert ai_generations (model, prompt_version,
                              model_confidence, retrieval_similarity, trust_score,
                              trust_formula)
                            insert ai_explanations + explanation_citations
                            job stage='explanation'

8. Review                   insert report_versions (origin='ai_draft')
                            insert doctor_reviews (status='draft')
                            select anvaya.set_review_status(review_id, 'pending_review')
                            … doctor approves …

9. Release                  select anvaya.release_report(report_id, version_id)
```

Two hard rules for step 4 and step 7:

* **Never write `computed_status` from the LLM path.** The validator owns it; `validation_results` has no client write path at all.
* **Never put a name, phone, DOB, report number or lab name into `ai_generations.input_snapshot`.** Only `anonymization_records` links a generation back to a person.

### 10.5 Suggested next steps (not done here — application code is out of scope)

1. Add `@supabase/supabase-js`; create a `src/lib/supabase.ts` with the browser and server clients.
2. Add auth (email OTP or phone OTP — phone suits the low-literacy, camera-first audience).
3. Replace the `src/lib/data.ts` constants with queries against the six views, keeping the constants as a storybook/demo fallback so the prototype still runs offline.
4. Implement `/api/reports`, `/api/ocr`, `/api/validate`, `/api/explain` route handlers.
5. Replace the `/api/feedback` stub body with an insert into `answer_feedback`, and drop `persisted: false`.
6. Build a real `/review` surface for clinicians backed by `v_review_queue`. The existing `/doctor` page stays as the patient-facing printable summary.
7. Populate `critical_low` / `critical_high` and review `borderline_frac` with a clinician (§9.4).
8. Replace the `APP_DEMO` reference ranges with ICMR/WHO rows — they supersede automatically via `authority_rank`.

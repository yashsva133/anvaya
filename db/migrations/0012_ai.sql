-- ============================================================================
-- Anvaya / RxAnvaya — Supabase migration 0012
-- AI generation + explanations + citations
-- ----------------------------------------------------------------------------
-- Purpose   : Persist the LLM EXPLANATION stage with full provenance (model,
--             prompt version, input version) and a decomposed trust score, and
--             link every explanation to the passages that grounded it.
-- Depends on: 0008, 0010, 0011
-- Fresh safe: YES
--
-- PRIVACY INVARIANT
--   Neither table has a patient_id, report_id or any identifier column. The only
--   outward links are anonymization_id (a pseudonym record) and the subject FKs
--   to test_results / report_patterns, which the RLS layer resolves to an owner.
--   There is therefore no column through which PHI could be written into the AI
--   tables, which is the structural form of "do not design the database in a way
--   that requires sending PII to the LLM".
-- ============================================================================

-- ---------------------------------------------------------------------------
-- ai_generations — one model call
-- ---------------------------------------------------------------------------
create table if not exists public.ai_generations (
  id                uuid primary key default gen_random_uuid(),
  purpose           anvaya_generation_purpose not null,
  status            anvaya_generation_status not null default 'queued',

  -- model / provider provenance (names and versions only, never credentials)
  provider          text,
  model             text,
  model_version     text,
  prompt_key        text,                               -- e.g. 'test_explanation'
  prompt_version    text,                               -- prompts are versioned like code
  system_prompt_sha256 text,
  temperature       numeric(4,3) check (temperature is null or (temperature >= 0 and temperature <= 2)),
  max_tokens        int check (max_tokens is null or max_tokens > 0),

  -- inputs: referenced, not inlined -------------------------------------------
  anonymization_id  uuid,                               -- the PII-free view of the patient/report
  input_version     text,                               -- version of the anonymised payload
  input_snapshot    jsonb,                              -- ANONYMISED inputs only (values, units, statuses)
  retrieval_id      uuid,                               -- the retrieval that grounded this call

  -- outputs ------------------------------------------------------------------
  language          anvaya_lang_code not null default 'en',
  reading_level     anvaya_reading_level,
  raw_output        text,
  output_sha256     text,
  refusal_detected  boolean not null default false,     -- model declined / produced unsafe content
  safety_flags      jsonb not null default '[]'::jsonb,

  -- trust score, stored as components AND as the combined verdict --------------
  model_confidence     numeric(5,4) check (model_confidence is null or (model_confidence >= 0 and model_confidence <= 1)),
  retrieval_similarity numeric(5,4) check (retrieval_similarity is null or (retrieval_similarity >= 0 and retrieval_similarity <= 1)),
  trust_score          numeric(5,4) check (trust_score is null or (trust_score >= 0 and trust_score <= 1)),
  trust_level          anvaya_confidence_level,
  trust_formula        text,                            -- e.g. '0.6*model + 0.4*retrieval' — makes the number auditable
  citation_count    smallint not null default 0 check (citation_count >= 0),

  -- ops ---------------------------------------------------------------------
  tokens_prompt     int check (tokens_prompt is null or tokens_prompt >= 0),
  tokens_completion int check (tokens_completion is null or tokens_completion >= 0),
  latency_ms        int check (latency_ms is null or latency_ms >= 0),
  error_code        text,
  error_message     text,
  started_at        timestamptz,
  finished_at       timestamptz,
  created_at        timestamptz not null default now(),

  constraint gen_fk_anon      foreign key (anonymization_id) references public.anonymization_records (id) on delete set null,
  constraint gen_fk_retrieval foreign key (retrieval_id)     references public.rag_retrievals (id) on delete set null,
  -- a finished generation must have ended
  constraint gen_terminal_needs_finish check (
    status not in ('succeeded', 'failed', 'blocked') or finished_at is not null
  ),
  -- a successful generation produced something
  constraint gen_success_has_output check (status <> 'succeeded' or raw_output is not null),
  -- a failed generation says why
  constraint gen_failure_has_reason check (status <> 'failed' or error_message is not null)
);

comment on table public.ai_generations is
  'One LLM call, with its full provenance. NO PHI: the patient is reachable only via anonymization_id.';
comment on column public.ai_generations.provider is
  'Provider/model NAME only. API keys and secrets must live in Supabase Vault or environment variables — never in a table.';
comment on column public.ai_generations.input_snapshot is
  'The exact anonymised payload sent to the model. Storing it (rather than just a hash) is what lets a reviewer reproduce what the model actually saw.';
comment on column public.ai_generations.trust_formula is
  'The trust score is a blend of model_confidence and retrieval_similarity; recording the formula means a later change in weighting does not silently reinterpret old scores.';

create index if not exists gen_purpose_idx on public.ai_generations (purpose, created_at desc);
create index if not exists gen_status_idx on public.ai_generations (status, created_at desc) where status in ('queued', 'running');
create index if not exists gen_failed_idx on public.ai_generations (created_at desc) where status = 'failed';
create index if not exists gen_anon_idx on public.ai_generations (anonymization_id) where anonymization_id is not null;
create index if not exists gen_retrieval_idx on public.ai_generations (retrieval_id) where retrieval_id is not null;
create index if not exists gen_model_idx on public.ai_generations (provider, model, created_at desc);
create index if not exists gen_lang_idx on public.ai_generations (language, created_at desc);

drop trigger if exists gen_immutable on public.ai_generations;
create trigger gen_immutable
  before update or delete on public.ai_generations
  for each row execute function public.guard_immutable_row();

-- ---------------------------------------------------------------------------
-- ai_explanations — the patient-facing text produced by a generation
-- ---------------------------------------------------------------------------
create table if not exists public.ai_explanations (
  id             uuid primary key default gen_random_uuid(),
  generation_id  uuid not null,
  -- exactly one subject; explicit FKs rather than a (type, id) pair so the
  -- database can actually enforce referential integrity
  subject_test_result_id   uuid,
  subject_report_pattern_id uuid,                       -- FK added in 0013
  subject_report_id        uuid,                        -- report-level summary
  language       anvaya_lang_code not null default 'en',
  reading_level  anvaya_reading_level not null default 'standard',
  version        smallint not null default 1 check (version > 0),
  body_md        text not null,                         -- markdown; the UI already renders Md (src/components/core.tsx)
  body_plain     text,                                  -- flattened text for TTS (speakAll in /test/[id])
  heading        text,
  disclaimer     text,                                  -- the "this is not a diagnosis" line
  is_current     boolean not null default true,
  superseded_by  uuid,
  created_at     timestamptz not null default now(),

  constraint expl_fk_generation foreign key (generation_id) references public.ai_generations (id) on delete restrict,
  constraint expl_fk_test_result foreign key (subject_test_result_id) references public.test_results (id) on delete cascade,
  constraint expl_fk_report foreign key (subject_report_id) references public.lab_reports (id) on delete cascade,
  constraint expl_fk_superseded foreign key (superseded_by) references public.ai_explanations (id) on delete set null,
  constraint expl_exactly_one_subject check (
    anvaya.num_nonnulls(
      subject_test_result_id, subject_report_pattern_id, subject_report_id
    ) = 1
  )
);

comment on table public.ai_explanations is
  'Generated explanation text, versioned per (subject, language, reading level). Editing produces a new version and flips is_current, so the original AI draft is never destroyed.';
comment on column public.ai_explanations.body_plain is
  'Plain-text form used for speech synthesis. The app already builds such a string client-side (speakAll in src/app/test/[id]/page.tsx).';

create unique index if not exists expl_subject_lang_level_version
  on public.ai_explanations (
    coalesce(subject_test_result_id,   '00000000-0000-0000-0000-000000000000'::uuid),
    coalesce(subject_report_pattern_id,'00000000-0000-0000-0000-000000000000'::uuid),
    coalesce(subject_report_id,        '00000000-0000-0000-0000-000000000000'::uuid),
    language, reading_level, version
  );

-- Exactly one current row per subject/language/level.
create unique index if not exists expl_one_current
  on public.ai_explanations (
    coalesce(subject_test_result_id,   '00000000-0000-0000-0000-000000000000'::uuid),
    coalesce(subject_report_pattern_id,'00000000-0000-0000-0000-000000000000'::uuid),
    coalesce(subject_report_id,        '00000000-0000-0000-0000-000000000000'::uuid),
    language, reading_level
  )
  where is_current;

create index if not exists expl_generation_idx on public.ai_explanations (generation_id);
create index if not exists expl_test_result_idx on public.ai_explanations (subject_test_result_id) where subject_test_result_id is not null;
create index if not exists expl_report_idx on public.ai_explanations (subject_report_id) where subject_report_id is not null;

drop trigger if exists expl_immutable on public.ai_explanations;
create trigger expl_immutable
  before delete on public.ai_explanations
  for each row execute function public.guard_immutable_row();

-- is_current flips are legitimate updates, but the text of an existing
-- explanation must not be rewritten in place.
create or replace function public.guard_explanation_body()
returns trigger
language plpgsql
as $$
begin
  if new.body_md      is distinct from old.body_md
  or new.language     is distinct from old.language
  or new.reading_level is distinct from old.reading_level
  or new.generation_id is distinct from old.generation_id
  or new.version      is distinct from old.version then
    raise exception 'anvaya: ai_explanations content is immutable; insert a new version instead (explanation %)', old.id;
  end if;
  return new;
end;
$$;

drop trigger if exists expl_body_guard on public.ai_explanations;
create trigger expl_body_guard
  before update on public.ai_explanations
  for each row execute function public.guard_explanation_body();

-- ---------------------------------------------------------------------------
-- explanation_citations — "what source supported this statement?"
-- ---------------------------------------------------------------------------
create table if not exists public.explanation_citations (
  id                uuid primary key default gen_random_uuid(),
  explanation_id    uuid not null,
  rag_chunk_id      uuid not null,
  retrieval_match_id uuid,
  citation_index    smallint not null check (citation_index > 0),
  rank              smallint check (rank is null or rank > 0),
  similarity        numeric(6,5) check (similarity is null or (similarity >= 0 and similarity <= 1)),
  quoted_text       text,                               -- the exact span relied upon
  created_at        timestamptz not null default now(),

  constraint cit_fk_explanation foreign key (explanation_id) references public.ai_explanations (id) on delete cascade,
  constraint cit_fk_chunk       foreign key (rag_chunk_id)   references public.rag_chunks (id) on delete restrict,
  constraint cit_fk_match       foreign key (retrieval_match_id) references public.rag_retrieval_matches (id) on delete set null,
  constraint cit_unique_chunk   unique (explanation_id, rag_chunk_id)
);

comment on table public.explanation_citations is
  'Explanation -> chunk -> document -> source. This chain is what answers "what source supported this statement?" and it survives FAISS index rebuilds because the chunk text is persisted.';
comment on column public.explanation_citations.rag_chunk_id is
  'ON DELETE RESTRICT: a passage behind a published explanation cannot be deleted without first dealing with the explanation that cites it.';

create index if not exists cit_explanation_idx on public.explanation_citations (explanation_id, citation_index);
create index if not exists cit_chunk_idx on public.explanation_citations (rag_chunk_id);

drop trigger if exists cit_immutable on public.explanation_citations;
create trigger cit_immutable
  before update or delete on public.explanation_citations
  for each row execute function public.guard_immutable_row();

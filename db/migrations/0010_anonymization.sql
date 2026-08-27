-- ============================================================================
-- Anvaya / Rxanvaya — Supabase migration 0010
-- anonymization_records — the PII firewall in front of every model call
-- ----------------------------------------------------------------------------
-- Purpose   : Record, per report, that de-identification happened, what was
--             stripped, and the pseudonym that was substituted. Downstream AI
--             tables reference THIS row and nothing else, which is how the
--             schema makes "identifiable patient information must not reach
--             external LLM providers" structurally true rather than a policy
--             someone has to remember.
-- Depends on: 0007
-- Fresh safe: YES
-- Contract  : NEW. Required by the ANONYMIZATION stage in
--             UPLOAD -> OCR/PARSING -> STRUCTURED TESTS -> DETERMINISTIC
--             VALIDATION -> ANONYMIZATION -> RAG -> LLM EXPLANATION -> ...
-- ============================================================================

create table if not exists public.anonymization_records (
  id              uuid primary key default gen_random_uuid(),
  lab_report_id   uuid not null,
  job_id          uuid,
  -- The token that stands in for the patient in everything sent to the model.
  -- It is a random uuid: carrying no name, no date of birth, no report number.
  pseudonym       uuid not null unique,
  method          text not null default 'direct_removal'
                  check (method in ('direct_removal', 'pseudonymisation', 'tokenisation')),
  removed_fields  jsonb not null default '[]'::jsonb,   -- ["patient_name","dob","phone","report_number","lab_name","address"]
  retained_fields jsonb not null default '[]'::jsonb,   -- ["age_band","sex","test_values","units","reference_ranges"]
  -- Age is passed as a BAND, not a value, so the payload is not re-identifiable
  -- by combining a precise DOB with other facts.
  age_band        text check (age_band is null or age_band in ('0-11','12-17','18-29','30-39','40-49','50-59','60-69','70-79','80+')),
  sex             text check (sex is null or sex in ('female', 'male', 'other', 'unspecified')),
  -- A keyed digest, NOT the data. Lets the pipeline recognise "same patient as
  -- last time" for longitudinal context without retaining identity.
  subject_digest  text,
  payload_ref     text,                                 -- storage key of the anonymised JSON, if persisted
  payload_sha256  text,
  created_by      uuid,
  created_at      timestamptz not null default now(),

  constraint anon_fk_report foreign key (lab_report_id) references public.lab_reports (id) on delete cascade,
  constraint anon_fk_job    foreign key (job_id)        references public.report_processing_jobs (id) on delete set null,
  constraint anon_fk_created_by foreign key (created_by) references public.profiles (id) on delete set null
);

comment on table public.anonymization_records is
  'The only bridge between PHI and the AI tables. Contains NO direct identifiers: no name, no phone, no email, no date of birth, no report number.';
comment on column public.anonymization_records.pseudonym is
  'This uuid is what appears in prompts and model logs. Rotating it costs nothing because nothing downstream depends on its value, only on its uniqueness per report.';
comment on column public.anonymization_records.subject_digest is
  'Keyed one-way digest. Enables "this patient has prior reports" without transmitting identity. The key lives in Vault/env, never in a table.';

create index if not exists anon_report_idx on public.anonymization_records (lab_report_id);
create index if not exists anon_job_idx on public.anonymization_records (job_id) where job_id is not null;

-- Append-only: an anonymisation assertion must not be editable after the fact.
drop trigger if exists anon_immutable on public.anonymization_records;
create trigger anon_immutable
  before update or delete on public.anonymization_records
  for each row execute function public.guard_immutable_row();

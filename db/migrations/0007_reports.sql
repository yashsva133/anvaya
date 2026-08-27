-- ============================================================================
-- Anvaya / RxAnvaya — Supabase migration 0007
-- Reports: lab_reports, report_files, report_processing_jobs, ocr_results
-- ----------------------------------------------------------------------------
-- Purpose   : The upload side of UPLOAD -> OCR/PARSING -> ... -> PATIENT.
--             Files themselves live in Supabase Storage; these tables hold
--             metadata and the storage key.
-- Depends on: 0002, 0003
-- Fresh safe: YES
-- Contract  : Maps onto the Report interface in src/lib/data.ts:710-723
--               { id, date:L2, month:L2, testsCount, attention, entries[] }
--             and the four demo reports feb26/apr26/jun26/aug26.
--             `legacy_code` preserves those string ids so /compare?old=apr26&new=aug26
--             (src/app/compare/page.tsx:51-52) keeps resolving.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- lab_reports
-- ---------------------------------------------------------------------------
create table if not exists public.lab_reports (
  id             uuid primary key default gen_random_uuid(),
  patient_id     uuid not null,
  legacy_code    text,                                  -- 'feb26' | 'apr26' | ... existing app identifiers
  status         anvaya_report_status not null default 'uploaded',
  upload_channel anvaya_upload_channel not null default 'file',
  lab_name       text,
  lab_location   text,
  report_number  text,                                  -- the lab's own accession/report no
  collected_on   date not null,                         -- the clinical date that drives trends
  received_at    timestamptz not null default now(),
  -- Printed-on-report header fields captured by OCR; kept OUTSIDE the
  -- anonymised payload that is sent to the LLM.
  reported_test_count smallint,
  report_language anvaya_lang_code not null default 'en',
  notes          text,
  created_by     uuid,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  deleted_at     timestamptz,
  deleted_by     uuid,
  deletion_request_id uuid,

  constraint reports_fk_patient foreign key (patient_id) references public.patients (id) on delete restrict,
  constraint reports_fk_created_by foreign key (created_by) references public.profiles (id) on delete set null,
  constraint reports_not_future check (collected_on <= current_date + 1),
  constraint reports_test_count_chk check (reported_test_count is null or reported_test_count >= 0)
);

comment on table public.lab_reports is
  'One row per uploaded laboratory report. Soft-deleted (deleted_at) rather than removed; erasure happens only through anvaya.hard_delete_report() so the act is auditable.';
comment on column public.lab_reports.patient_id is
  'ON DELETE RESTRICT by design: deleting a patient row must never silently cascade away medical records. Account erasure is an explicit, audited function call.';
comment on column public.lab_reports.legacy_code is
  'Compatibility shim for the hardcoded report ids in src/lib/data.ts (feb26/apr26/jun26/aug26) used by the /compare route.';

create unique index if not exists reports_legacy_code_key
  on public.lab_reports (legacy_code) where legacy_code is not null;

-- Patient history: the single hottest query in the app (My Reports / Trends).
create index if not exists reports_patient_history_idx
  on public.lab_reports (patient_id, collected_on desc)
  where deleted_at is null;

create index if not exists reports_status_idx on public.lab_reports (status) where deleted_at is null;
create index if not exists reports_collected_idx on public.lab_reports (collected_on desc);
create index if not exists reports_pending_review_idx on public.lab_reports (status, created_at)
  where deleted_at is null and status in ('analysed', 'in_review');

drop trigger if exists reports_set_updated_at on public.lab_reports;
create trigger reports_set_updated_at
  before update on public.lab_reports
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- report_files — storage references (never the bytes themselves)
-- ---------------------------------------------------------------------------
create table if not exists public.report_files (
  id            uuid primary key default gen_random_uuid(),
  report_id     uuid not null,
  kind          anvaya_file_kind not null,
  bucket        text not null,                          -- storage bucket id, e.g. 'report-originals'
  storage_path  text not null,                          -- object key inside the bucket
  mime_type     text,
  byte_size     bigint check (byte_size is null or byte_size >= 0),
  checksum_sha256 text,
  page_count    smallint check (page_count is null or page_count > 0),
  language      anvaya_lang_code,
  is_current    boolean not null default true,
  created_at    timestamptz not null default now(),

  constraint files_fk_report foreign key (report_id) references public.lab_reports (id) on delete restrict,
  constraint files_bucket_key unique (bucket, storage_path)
);

comment on table public.report_files is
  'Pointers into Supabase Storage. Buckets holding medical data are PRIVATE; access goes through signed URLs so storage ACLs and database RLS agree.';
comment on column public.report_files.storage_path is
  'Convention: {patient_id}/{report_id}/{kind}-{n}.{ext}. Prefixing with patient_id makes per-patient erasure a single prefix delete.';

create index if not exists files_report_idx on public.report_files (report_id, kind) where is_current;

-- ---------------------------------------------------------------------------
-- report_processing_jobs
-- ---------------------------------------------------------------------------
create table if not exists public.report_processing_jobs (
  id             uuid primary key default gen_random_uuid(),
  report_id      uuid not null,
  stage          anvaya_job_stage not null default 'ocr',
  status         anvaya_job_status not null default 'queued',
  attempt        smallint not null default 1 check (attempt > 0),
  progress_pct   smallint not null default 0 check (progress_pct between 0 and 100),
  idempotency_key text,
  input_ref      text,                                  -- storage path the job consumes
  output_ref     text,
  error_code     text,
  error_message  text,
  retry_of       uuid,
  started_at     timestamptz,
  finished_at    timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),

  constraint jobs_fk_report foreign key (report_id) references public.lab_reports (id) on delete cascade,
  constraint jobs_fk_retry_of foreign key (retry_of) references public.report_processing_jobs (id) on delete set null,
  constraint jobs_finished_after_start check (finished_at is null or started_at is null or finished_at >= started_at),
  constraint jobs_terminal_needs_finish check (
    status not in ('succeeded', 'failed', 'cancelled') or finished_at is not null
  )
);

comment on table public.report_processing_jobs is
  'One row per pipeline stage execution. The UI progress screen (src/app/processing/page.tsx, 5 friendly labels) reads a projection of these rows; the enum is the fuller architecture stage set.';
comment on column public.report_processing_jobs.idempotency_key is
  'Lets a retrying worker re-submit safely without double-processing a report.';

create unique index if not exists jobs_idempotency_key
  on public.report_processing_jobs (idempotency_key) where idempotency_key is not null;

-- Worker queue drain: "give me the oldest queued job for this stage".
create index if not exists jobs_queue_idx
  on public.report_processing_jobs (stage, created_at)
  where status = 'queued';

create index if not exists jobs_report_idx on public.report_processing_jobs (report_id, stage, attempt);
create index if not exists jobs_running_idx on public.report_processing_jobs (status, started_at) where status = 'running';
create index if not exists jobs_failed_idx on public.report_processing_jobs (finished_at desc) where status = 'failed';

drop trigger if exists jobs_set_updated_at on public.report_processing_jobs;
create trigger jobs_set_updated_at
  before update on public.report_processing_jobs
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- ocr_results
-- ---------------------------------------------------------------------------
create table if not exists public.ocr_results (
  id            uuid primary key default gen_random_uuid(),
  report_id     uuid not null,
  job_id        uuid,
  page_no       smallint not null default 1 check (page_no > 0),
  engine        text not null,                          -- 'vision-model-x', 'tesseract', ...
  engine_version text,
  -- Raw OCR text is retained because it is the provenance for every parsed
  -- value. It CAN contain the patient name printed on the report, so this table
  -- is in the PHI zone and is never read by the LLM path.
  raw_text      text,
  layout        jsonb,                                  -- boxes/lines for highlight-in-source UI
  confidence    numeric(5,4) check (confidence is null or (confidence >= 0 and confidence <= 1)),
  word_count    int check (word_count is null or word_count >= 0),
  status        anvaya_job_status not null default 'succeeded',
  artifact_path text,                                   -- optional storage key for a full OCR dump
  created_at    timestamptz not null default now(),

  constraint ocr_fk_report foreign key (report_id) references public.lab_reports (id) on delete cascade,
  constraint ocr_fk_job    foreign key (job_id)    references public.report_processing_jobs (id) on delete set null
);

comment on table public.ocr_results is
  'PHI ZONE. Verbatim OCR output. Provenance for parsed values; explicitly excluded from anything sent to an external model.';

create unique index if not exists ocr_page_key on public.ocr_results (report_id, page_no, engine);
create index if not exists ocr_job_idx on public.ocr_results (job_id) where job_id is not null;

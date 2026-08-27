-- ============================================================================
-- Anvaya / RxAnvaya — Supabase migration 0014
-- Doctor review workflow, report versions, translations, releases
-- ----------------------------------------------------------------------------
-- Purpose   : The DOCTOR REVIEW -> FINAL REPORT -> PATIENT stages as a real
--             state machine with reviewer identity, version history and an
--             explicit release, instead of an `approved boolean`.
-- Depends on: 0003, 0004, 0007, 0012
-- Fresh safe: YES
-- Contract  : NEW. The shipped app has no reviewer at all: src/app/doctor/page.tsx
--             is a patient-facing printable summary ("A clinician-style view to
--             share with your doctor") whose Download/Share buttons only call
--             window.print() and a toast. That page keeps working unchanged;
--             this migration adds the server-side workflow behind a real review.
--
--             draft -> pending_review -> needs_edit -> approved -> released
--             Only an `approved` version can be released, and only a released
--             version is patient-facing (see the RLS policies in 0018 and
--             anvaya.release_report in 0017).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- report_versions — immutable content snapshots
-- ---------------------------------------------------------------------------
create table if not exists public.report_versions (
  id                uuid primary key default gen_random_uuid(),
  report_id         uuid not null,
  version_no        smallint not null check (version_no > 0),
  origin            anvaya_version_origin not null,
  based_on_version_id uuid,
  edited_by         uuid,                               -- profiles.id of the doctor who made this edit
  change_summary    text,
  -- Frozen document structure for this version: which explanations are
  -- included, section order, doctor's clinical notes. This is an immutable
  -- document artefact rather than queryable application state, which is why it
  -- is jsonb; every fact the app QUERIES (results, statuses, reviews, releases)
  -- lives in its own table.
  content_snapshot  jsonb not null default '{}'::jsonb,
  doctor_notes      text,
  is_locked         boolean not null default false,
  created_by        uuid,
  created_at        timestamptz not null default now(),

  constraint rv_fk_report foreign key (report_id) references public.lab_reports (id) on delete restrict,
  constraint rv_fk_based_on foreign key (based_on_version_id) references public.report_versions (id) on delete set null,
  constraint rv_fk_edited_by foreign key (edited_by) references public.profiles (id) on delete set null,
  constraint rv_fk_created_by foreign key (created_by) references public.profiles (id) on delete set null,
  constraint rv_version_key unique (report_id, version_no),
  constraint rv_doctor_edits_have_author check (
    origin <> 'doctor_edit' or edited_by is not null
  )
);

comment on table public.report_versions is
  'Version history of a report''s narrative content. The AI draft is version 1 with origin ai_draft; a doctor edit creates version 2 rather than overwriting version 1, so the original draft is always recoverable.';
comment on column public.report_versions.content_snapshot is
  'Immutable document artefact (section order, included explanation ids, doctor notes). Deliberately the ONLY jsonb blob in the review path — queryable state is relational.';

create index if not exists rv_report_idx on public.report_versions (report_id, version_no desc);
create index if not exists rv_editor_idx on public.report_versions (edited_by) where edited_by is not null;

-- Versions are immutable once created.
drop trigger if exists rv_immutable on public.report_versions;
create trigger rv_immutable
  before update or delete on public.report_versions
  for each row execute function public.guard_immutable_row();

-- ---------------------------------------------------------------------------
-- report_translations — the same validated facts, other languages
-- ---------------------------------------------------------------------------
create table if not exists public.report_translations (
  id               uuid primary key default gen_random_uuid(),
  report_version_id uuid not null,
  language         anvaya_lang_code not null,
  narrative_md     text not null,
  narrative_plain  text,                                -- TTS-ready
  authored_by      anvaya_text_author not null default 'ai',
  generation_id    uuid,
  reviewed_by      uuid,
  is_current       boolean not null default true,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),

  constraint rt_fk_version foreign key (report_version_id) references public.report_versions (id) on delete cascade,
  constraint rt_fk_generation foreign key (generation_id) references public.ai_generations (id) on delete set null,
  constraint rt_fk_reviewed_by foreign key (reviewed_by) references public.profiles (id) on delete set null,
  constraint rt_unique_lang unique (report_version_id, language)
);

comment on table public.report_translations is
  'Language variants of one report version. The underlying validated facts are NOT duplicated per language — only the narrative is — so a translation can never disagree with the deterministic classification.';
comment on column public.report_translations.authored_by is
  'Distinguishes machine translation from a human/clinician-reviewed translation, which matters before a translation is released to a patient.';

create index if not exists rt_version_idx on public.report_translations (report_version_id, language) where is_current;
create index if not exists rt_lang_idx on public.report_translations (language);

drop trigger if exists rt_set_updated_at on public.report_translations;
create trigger rt_set_updated_at
  before update on public.report_translations
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- doctor_reviews — the workflow record
-- ---------------------------------------------------------------------------
create table if not exists public.doctor_reviews (
  id                uuid primary key default gen_random_uuid(),
  report_id         uuid not null,
  report_version_id uuid not null,
  doctor_id         uuid not null,
  status            anvaya_review_status not null default 'draft',
  assigned_at       timestamptz not null default now(),
  assigned_by       uuid,
  opened_at         timestamptz,
  decision_at       timestamptz,
  signed_at         timestamptz,
  signature_ref     text,                               -- storage key of a signature image, if captured
  comments          text,
  rejection_reason  text,
  edits_summary     text,
  previous_status   anvaya_review_status,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  constraint dr_fk_report  foreign key (report_id) references public.lab_reports (id) on delete restrict,
  constraint dr_fk_version foreign key (report_version_id) references public.report_versions (id) on delete restrict,
  constraint dr_fk_doctor  foreign key (doctor_id) references public.doctors (id) on delete restrict,
  constraint dr_fk_assigned_by foreign key (assigned_by) references public.profiles (id) on delete set null,

  -- workflow integrity ------------------------------------------------------
  constraint dr_decision_requires_decision_at check (
    status not in ('approved', 'needs_edit', 'withdrawn') or decision_at is not null
  ),
  constraint dr_signed_requires_approval check (
    signed_at is null or status in ('approved', 'released')
  ),
  constraint dr_rejection_requires_reason check (
    status <> 'needs_edit' or rejection_reason is not null
  )
);

comment on table public.doctor_reviews is
  'One review record per (report, version, doctor). Reviewer identity is a hard FK to doctors, so no review can exist without an attributable clinician.';
comment on column public.doctor_reviews.status is
  'draft -> pending_review -> needs_edit -> approved -> released. Transitions are validated in anvaya.set_review_status (0017); this column is never written directly by the client.';

-- A doctor holds at most one open review per report version.
create unique index if not exists dr_one_open_per_version
  on public.doctor_reviews (report_version_id, doctor_id)
  where status in ('draft', 'pending_review', 'needs_edit');

-- Doctor review queue: "what is waiting for me, oldest first".
create index if not exists dr_queue_idx
  on public.doctor_reviews (doctor_id, assigned_at)
  where status = 'pending_review';

create index if not exists dr_report_idx on public.doctor_reviews (report_id, created_at desc);
create index if not exists dr_status_idx on public.doctor_reviews (status, assigned_at);
create index if not exists dr_signed_idx on public.doctor_reviews (signed_at desc) where signed_at is not null;

drop trigger if exists dr_set_updated_at on public.doctor_reviews;
create trigger dr_set_updated_at
  before update on public.doctor_reviews
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- report_releases — the patient-facing final report
-- ---------------------------------------------------------------------------
create table if not exists public.report_releases (
  id                uuid primary key default gen_random_uuid(),
  report_id         uuid not null,
  report_version_id uuid not null,
  review_id         uuid,
  released_by       uuid not null,                      -- the clinician who signed
  released_at       timestamptz not null default now(),
  release_channel   text check (release_channel is null or release_channel in ('app', 'email', 'sms', 'clinic', 'api')),
  is_active         boolean not null default true,
  superseded_at     timestamptz,
  superseded_by     uuid,
  revoked_at        timestamptz,
  revoked_reason    text,
  pdf_path          text,                               -- storage key of the exported PDF
  tts_path          text,                               -- storage key of narrated audio, if produced
  created_at        timestamptz not null default now(),

  constraint rel_fk_report  foreign key (report_id) references public.lab_reports (id) on delete restrict,
  constraint rel_fk_version foreign key (report_version_id) references public.report_versions (id) on delete restrict,
  constraint rel_fk_review  foreign key (review_id) references public.doctor_reviews (id) on delete set null,
  constraint rel_fk_released_by foreign key (released_by) references public.profiles (id) on delete restrict,
  constraint rel_fk_superseded_by foreign key (superseded_by) references public.report_releases (id) on delete set null,
  constraint rel_revoked_needs_ts check (revoked_at is null or is_active = false)
);

comment on table public.report_releases is
  'The FINAL REPORT stage. A row here is the only thing that makes a report patient-facing. Only a version whose review is `approved` may be released — enforced by anvaya.release_report (0017).';

-- Exactly one active release per report.
create unique index if not exists rel_one_active_per_report
  on public.report_releases (report_id)
  where is_active;

create index if not exists rel_report_idx on public.report_releases (report_id, released_at desc);
create index if not exists rel_active_idx on public.report_releases (released_at desc) where is_active;
create index if not exists rel_review_idx on public.report_releases (review_id) where review_id is not null;

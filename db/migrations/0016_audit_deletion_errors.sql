-- ============================================================================
-- Anvaya / Rxanvaya — Supabase migration 0016
-- Audit trail, deletion requests, persisted errors
-- ----------------------------------------------------------------------------
-- Purpose   : Append-only, hash-chained audit records; an explicit erasure
--             workflow; and durable failure records for pipeline components.
-- Depends on: 0001, 0002, 0003
-- Fresh safe: YES
-- Contract  : NEW. Nothing in the current codebase writes an audit record —
--             src/app/how/page.tsx:117-120 merely asserts "Reports can be
--             deleted after processing; data encrypted in transit and at rest."
--             These tables are what make that assertion checkable.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- audit_logs — append-only, hash-chained
-- ---------------------------------------------------------------------------
create table if not exists public.audit_logs (
  id            bigint generated always as identity primary key,
  occurred_at   timestamptz not null default now(),
  actor_id      uuid,                                   -- profiles.id; NULL for system jobs
  actor_role    anvaya_role,
  action        text not null,                          -- see the check constraint below
  entity_type   text not null,                          -- 'lab_report' | 'test_result' | 'doctor_review' | ...
  entity_id     text,                                   -- text so any PK type fits
  patient_id    uuid,                                   -- NULL-able so erasure can de-link without destroying the record
  report_id     uuid,
  outcome       text not null default 'success'
                check (outcome in ('success', 'failure', 'denied')),
  metadata      jsonb not null default '{}'::jsonb,
  ip_address    inet,
  user_agent    text,
  prev_hash     text,                                   -- row_hash of the preceding record
  row_hash      text not null,                          -- sha256 over this row + prev_hash

  -- audit rows must never carry the payload of a clinical value or a report body
  constraint audit_action_known check (action in (
    -- consent
    'consent.granted', 'consent.withdrawn', 'consent.expired', 'consent.policy_published',
    -- report lifecycle
    'report.uploaded', 'report.created', 'report.deleted', 'report.restored',
    'report.processing_started', 'report.processing_failed', 'report.processing_completed',
    -- results & determinism
    'result.extracted', 'result.corrected', 'result.validated', 'result.revalidated',
    -- privacy
    'anonymization.performed', 'pii.accessed',
    -- AI
    'ai.generation_requested', 'ai.generation_failed', 'ai.explanation_created',
    -- review & release
    'review.assigned', 'review.opened', 'review.edit_made', 'review.approved',
    'review.rejected', 'review.signed', 'report.released', 'release.revoked',
    -- access control & erasure
    'access.granted', 'access.revoked', 'access.denied', 'auth.login', 'auth.logout',
    'deletion.requested', 'deletion.completed', 'deletion.rejected', 'deletion.failed',
    -- admin
    'admin.config_changed', 'admin.reference_range_updated'
  ))
);

comment on table public.audit_logs is
  'Append-only security audit trail. Hash-chained: each row commits to the previous row''s hash, so silent deletion or editing of history is detectable. No UPDATE or DELETE path exists.';
comment on column public.audit_logs.patient_id is
  'Nullable on purpose. On erasure the link can be cleared while the FACT of the action is retained, which is how "minimal compliance information" survives without retaining PHI.';
comment on column public.audit_logs.metadata is
  'Non-sensitive context only. Never store a clinical value, a report body, or a credential here.';

create index if not exists audit_occurred_idx on public.audit_logs (occurred_at desc);
create index if not exists audit_patient_idx on public.audit_logs (patient_id, occurred_at desc) where patient_id is not null;
create index if not exists audit_report_idx on public.audit_logs (report_id, occurred_at desc) where report_id is not null;
create index if not exists audit_actor_idx on public.audit_logs (actor_id, occurred_at desc) where actor_id is not null;
create index if not exists audit_action_idx on public.audit_logs (action, occurred_at desc);
create index if not exists audit_entity_idx on public.audit_logs (entity_type, entity_id);
create index if not exists audit_denied_idx on public.audit_logs (occurred_at desc) where outcome = 'denied';

-- Hash chain + immutability --------------------------------------------------
create or replace function public.audit_seal_row()
returns trigger
language plpgsql
as $$
declare
  v_prev text;
begin
  select row_hash into v_prev from public.audit_logs order by id desc limit 1;
  new.prev_hash := v_prev;
  -- sha256() takes bytea, not text: the explicit cast is required.
  new.row_hash := encode(sha256((
    coalesce(v_prev, 'genesis') || '|' ||
    new.occurred_at::text || '|' ||
    coalesce(new.actor_id::text, '-') || '|' ||
    coalesce(new.actor_role::text, '-') || '|' ||
    new.action || '|' ||
    new.entity_type || '|' ||
    coalesce(new.entity_id, '-') || '|' ||
    coalesce(new.patient_id::text, '-') || '|' ||
    coalesce(new.report_id::text, '-') || '|' ||
    new.outcome || '|' ||
    new.metadata::text
  )::bytea), 'hex');
  return new;
end;
$$;

comment on function public.audit_seal_row() is
  'Computes prev_hash and row_hash on insert. Because audit_logs has no UPDATE/DELETE trigger allowance and no client policy, the chain can only grow.';

drop trigger if exists audit_seal on public.audit_logs;
create trigger audit_seal
  before insert on public.audit_logs
  for each row execute function public.audit_seal_row();

-- The one legitimate mutation of an audit row is DE-LINKING it from a patient
-- during erasure (see anvaya.hard_delete_patient in 0017). Everything else —
-- editing content, or any delete — is refused.
create or replace function public.guard_audit_row()
returns trigger
language plpgsql
as $$
declare
  v_erasure text;
  v_same    boolean;
begin
  if tg_op = 'DELETE' then
    raise exception 'anvaya: audit_logs is append-only; DELETE is never permitted';
  end if;

  v_erasure := current_setting('anvaya.erasure_in_progress', true);

  v_same :=
        new.occurred_at = old.occurred_at
    and new.actor_id    is not distinct from old.actor_id
    and new.actor_role  is not distinct from old.actor_role
    and new.action      = old.action
    and new.entity_type = old.entity_type
    and new.entity_id   is not distinct from old.entity_id
    and new.report_id   is not distinct from old.report_id
    and new.outcome     = old.outcome
    and new.metadata    = old.metadata
    and new.prev_hash   is not distinct from old.prev_hash
    and new.row_hash    = old.row_hash;

  if v_erasure = 'on' and v_same and old.patient_id is not null and new.patient_id is null then
    return new;   -- sanctioned de-link during erasure
  end if;

  raise exception 'anvaya: audit_logs row % is immutable', old.id;
end;
$$;

comment on function public.guard_audit_row() is
  'DELETE always refused. UPDATE refused unless the session is inside a sanctioned erasure (anvaya.erasure_in_progress = on) and the ONLY change is clearing patient_id, which de-links the record from the person while preserving the fact that the action happened.';

drop trigger if exists audit_immutable on public.audit_logs;
create trigger audit_immutable
  before update or delete on public.audit_logs
  for each row execute function public.guard_audit_row();

-- ---------------------------------------------------------------------------
-- deletion_requests — the erasure workflow
-- ---------------------------------------------------------------------------
create table if not exists public.deletion_requests (
  id            uuid primary key default gen_random_uuid(),
  patient_id    uuid not null,
  requested_by  uuid,                                   -- profiles.id (self-service or staff on behalf)
  scope         anvaya_deletion_scope not null,
  lab_report_id uuid,                                   -- set when scope = single_report
  reason        text,
  status        anvaya_deletion_status not null default 'requested',
  requested_at  timestamptz not null default now(),
  started_at    timestamptz,
  completed_at  timestamptz,
  verified_by   uuid,
  -- What was destroyed vs. what was legitimately kept.
  items_deleted jsonb not null default '{}'::jsonb,
  retained_audit boolean not null default true,
  notes         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  constraint delreq_fk_patient foreign key (patient_id) references public.patients (id) on delete cascade,
  constraint delreq_fk_report  foreign key (lab_report_id) references public.lab_reports (id) on delete set null,
  constraint delreq_fk_requested_by foreign key (requested_by) references public.profiles (id) on delete set null,
  constraint delreq_fk_verified_by foreign key (verified_by) references public.profiles (id) on delete set null,
  constraint delreq_single_needs_report check (scope <> 'single_report' or lab_report_id is not null),
  constraint delreq_completed_needs_ts check (status <> 'completed' or completed_at is not null)
);

comment on table public.deletion_requests is
  'Erasure is a workflow, not a DELETE statement. The request row survives completion and records what was destroyed, so "the patient asked and we did it" remains provable after the PHI is gone.';
comment on column public.deletion_requests.retained_audit is
  'TRUE by default: the audit_logs entries survive erasure (with patient_id cleared), because a record that a deletion happened is compliance information, not PHI.';

create index if not exists delreq_patient_idx on public.deletion_requests (patient_id, requested_at desc);
create index if not exists delreq_open_idx on public.deletion_requests (requested_at)
  where status in ('requested', 'in_progress');
create index if not exists delreq_report_idx on public.deletion_requests (lab_report_id) where lab_report_id is not null;

drop trigger if exists delreq_set_updated_at on public.deletion_requests;
create trigger delreq_set_updated_at
  before update on public.deletion_requests
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- system_errors — persisted failures
-- ---------------------------------------------------------------------------
create table if not exists public.system_errors (
  id            uuid primary key default gen_random_uuid(),
  occurred_at   timestamptz not null default now(),
  component     anvaya_component not null,
  severity      anvaya_severity not null default 'error',
  error_code    text not null,
  message       text not null,
  stack_trace   text,
  context       jsonb not null default '{}'::jsonb,     -- ANONYMISED context only
  lab_report_id uuid,
  job_id        uuid,
  generation_id uuid,
  fingerprint   text,                                   -- groups repeats of the same failure
  occurrence_count int not null default 1 check (occurrence_count > 0),
  first_seen_at timestamptz not null default now(),
  last_seen_at  timestamptz not null default now(),
  resolved_at   timestamptz,
  resolved_by   uuid,
  resolution    text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  constraint err_fk_report foreign key (lab_report_id) references public.lab_reports (id) on delete set null,
  constraint err_fk_job    foreign key (job_id) references public.report_processing_jobs (id) on delete set null,
  constraint err_fk_generation foreign key (generation_id) references public.ai_generations (id) on delete set null,
  constraint err_fk_resolved_by foreign key (resolved_by) references public.profiles (id) on delete set null,
  constraint err_resolved_needs_ts check (resolved_at is null or resolution is not null),
  constraint err_window check (last_seen_at >= first_seen_at)
);

comment on table public.system_errors is
  'Durable failure records for OCR, parsing, validation, RAG and LLM stages. `context` must be anonymised — an error payload is a classic accidental PHI leak.';
comment on column public.system_errors.generation_id is
  'ON DELETE SET NULL: ai_generations is immutable, so this link is only ever dropped by an explicit administrative purge.';

create index if not exists err_recent_idx on public.system_errors (occurred_at desc);
create index if not exists err_open_idx on public.system_errors (severity, occurred_at desc) where resolved_at is null;
create index if not exists err_fingerprint_idx on public.system_errors (fingerprint, last_seen_at desc) where fingerprint is not null;
create index if not exists err_component_idx on public.system_errors (component, occurred_at desc);
create index if not exists err_report_idx on public.system_errors (lab_report_id) where lab_report_id is not null;

drop trigger if exists err_set_updated_at on public.system_errors;
create trigger err_set_updated_at
  before update on public.system_errors
  for each row execute function public.set_updated_at();

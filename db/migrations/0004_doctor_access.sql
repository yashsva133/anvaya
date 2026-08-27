-- ============================================================================
-- Anvaya / Rxanvaya — Supabase migration 0004
-- Doctor ↔ patient authorisation grants
-- ----------------------------------------------------------------------------
-- Purpose   : A clinician may only see reports for patients they have been
--             explicitly granted. This table is the single predicate behind
--             every doctor-facing RLS policy, so "cannot arbitrarily access
--             unrelated patients" is enforced in the database rather than in
--             application code.
-- Depends on: 0003
-- Fresh safe: YES
-- Contract  : NEW. The current app has no doctor login at all — /doctor is a
--             patient-facing printable summary (src/app/doctor/page.tsx renders
--             "A clinician-style view to share with your doctor"). Introducing a
--             real reviewer identity does not change that page's contract.
-- ============================================================================

create table if not exists public.doctor_patient_access (
  id          uuid primary key default gen_random_uuid(),
  doctor_id   uuid not null,
  patient_id  uuid not null,
  status      text not null default 'active'
              check (status in ('active', 'revoked')),
  reason      text,                                     -- why access was granted (audit narrative)
  granted_by  uuid,                                     -- profiles.id of whoever authorised it
  granted_at  timestamptz not null default now(),
  expires_at  timestamptz,
  revoked_at  timestamptz,
  revoked_by  uuid,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  constraint dpa_fk_doctor  foreign key (doctor_id)  references public.doctors (id) on delete cascade,
  constraint dpa_fk_patient foreign key (patient_id) references public.patients (id) on delete cascade,
  constraint dpa_fk_granted_by foreign key (granted_by) references public.profiles (id) on delete set null,
  constraint dpa_revoked_consistency check (
    (status <> 'revoked') or (revoked_at is not null)
  ),
  constraint dpa_expiry_after_grant check (expires_at is null or expires_at > granted_at)
);

comment on table public.doctor_patient_access is
  'Time-boxed reviewer authorisation. Access is deny-by-default: no row, no visibility.';

-- One ACTIVE grant per (doctor, patient); history of revoked grants is kept.
create unique index if not exists dpa_one_active_per_pair
  on public.doctor_patient_access (doctor_id, patient_id)
  where status = 'active';

create index if not exists dpa_patient_idx on public.doctor_patient_access (patient_id, status);
create index if not exists dpa_doctor_active_idx on public.doctor_patient_access (doctor_id) where status = 'active';

drop trigger if exists dpa_set_updated_at on public.doctor_patient_access;
create trigger dpa_set_updated_at
  before update on public.doctor_patient_access
  for each row execute function public.set_updated_at();

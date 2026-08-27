-- ============================================================================
-- Anvaya / Rxanvaya — Supabase migration 0003
-- Identity: profiles, patients, doctors
-- ----------------------------------------------------------------------------
-- Purpose   : Separate the *auth-facing* row (profiles) from the two
--             role-specific records. Patient PII is confined to `patients`;
--             everything downstream that is read by the UI joins through
--             `patients` only when identity is genuinely needed.
-- Depends on: 0001 schemas/helpers, 0002 enums
-- Fresh safe: YES
-- Contract  : NEW. The current codebase has no auth at all — src/lib/data.ts
--             hardcodes a single fictional PATIENT object and there is no
--             login/middleware/session code anywhere in src/. This migration
--             introduces the identity model the architecture requires; it
--             removes nothing.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- profiles — 1:1 with auth.users
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id            uuid primary key,                       -- == auth.users.id
  role          anvaya_role        not null default 'patient',
  status        anvaya_account_status not null default 'active',
  full_name     text,
  email         text,
  preferred_language anvaya_lang_code not null default 'en',
  last_seen_at  timestamptz,
  created_at    timestamptz        not null default now(),
  updated_at    timestamptz        not null default now(),

  constraint profiles_email_lower_chk check (email is null or email = lower(email))
);

comment on table public.profiles is
  'One row per auth.users row. Holds ONLY routing/identity metadata — no clinical data and no PII beyond name/email needed for sign-in display.';
comment on column public.profiles.role is
  'Drives every RLS policy. patient | doctor | admin. Set by the backend/service role, never by the client.';

create unique index if not exists profiles_email_key on public.profiles (lower(email)) where email is not null;
create index if not exists profiles_role_idx on public.profiles (role) where status = 'active';

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- patients — the PII record
-- ---------------------------------------------------------------------------
create table if not exists public.patients (
  id                uuid primary key default gen_random_uuid(),
  profile_id        uuid unique,                        -- nullable: clinic-entered patients may not have a login yet
  full_name         text        not null,
  name_local_script text,                               -- e.g. Devanagari rendering, mirrors data.ts PATIENT.name.hi
  date_of_birth     date,
  sex               text        check (sex is null or sex in ('female', 'male', 'other', 'unspecified')),
  phone             text,
  email             text,
  city              text,
  state             text,
  preferred_language anvaya_lang_code not null default 'en',
  -- Accessibility settings. NOTE: the shipped app keeps these in localStorage
  -- (src/lib/i18n.tsx:552-563 under LS_KEY). They are mirrored here so a
  -- returning patient keeps them across devices; the client may still treat
  -- localStorage as the fast path.
  reading_level     anvaya_reading_level not null default 'standard',
  voice_enabled     boolean     not null default true,
  high_contrast     boolean     not null default false,
  reduce_motion     boolean     not null default false,
  font_scale        smallint    not null default 0 check (font_scale between 0 and 2),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  deleted_at        timestamptz,

  constraint patients_fk_profile foreign key (profile_id)
    references public.profiles (id) on delete set null,
  constraint patients_font_scale_chk check (font_scale >= 0 and font_scale <= 2)
);

comment on table public.patients is
  'PHI ZONE. Identifiable demographics. Never referenced by any AI/RAG table; the pipeline reaches the model only through public.anonymization_records.';
comment on column public.patients.name_local_script is
  'Backs the L2 {en, hi} name pattern in src/lib/data.ts (PATIENT.name).';

create index if not exists patients_profile_idx on public.patients (profile_id);
create index if not exists patients_active_idx on public.patients (full_name) where deleted_at is null;

drop trigger if exists patients_set_updated_at on public.patients;
create trigger patients_set_updated_at
  before update on public.patients
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- doctors
-- ---------------------------------------------------------------------------
create table if not exists public.doctors (
  id              uuid primary key default gen_random_uuid(),
  profile_id      uuid unique not null,
  full_name       text        not null,
  registration_no text,                                 -- medical council registration
  registration_body text,
  specialty       text,
  institution     text,
  verified        boolean     not null default false,
  verified_at     timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  constraint doctors_fk_profile foreign key (profile_id)
    references public.profiles (id) on delete cascade
);

comment on table public.doctors is
  'Reviewer identity. Registration details are what make a sign-off attributable and auditable.';

create unique index if not exists doctors_registration_key
  on public.doctors (registration_body, registration_no)
  where registration_no is not null;

drop trigger if exists doctors_set_updated_at on public.doctors;
create trigger doctors_set_updated_at
  before update on public.doctors
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Keep profiles in sync with auth.users
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.profiles (id, role, full_name, email)
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data ->> 'role', ''), 'patient')::anvaya_role,
    new.raw_user_meta_data ->> 'full_name',
    new.email
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

comment on function public.handle_new_auth_user() is
  'Creates the profile row on signup. SECURITY DEFINER so it can write profiles despite the no-client-INSERT policy. Role is taken from server-set user metadata, never from client-controlled input.';

-- Installed only when auth.users exists (always true on Supabase; skipped in
-- bare-Postgres test harnesses) so the file stays runnable in both.
do $do$
begin
  if to_regclass('auth.users') is not null then
    drop trigger if exists on_auth_user_created on auth.users;
    create trigger on_auth_user_created
      after insert on auth.users
      for each row execute function public.handle_new_auth_user();
  end if;
end
$do$;

-- ============================================================================
-- Anvaya / RxAnvaya — Supabase migration 0005
-- Consent: policy catalogue + patient consent records
-- ----------------------------------------------------------------------------
-- Purpose   : Auditable, purpose-scoped, versioned consent. A boolean
--             consent=true is NOT sufficient: the record must say which policy
--             text was shown, for what purpose, when, via what channel, and
--             when it was withdrawn.
-- Depends on: 0002, 0003
-- Fresh safe: YES
-- Contract  : NEW. The shipped app has no consent UI and no consent storage —
--             src/app/settings/page.tsx has language/reading-mode/font/voice/
--             contrast/motion controls only, and the only privacy text is
--             src/app/how/page.tsx:117-120 ("Reports can be deleted after
--             processing"). This table is what turns that claim into a record.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- consent_policies — the versioned text a patient actually agreed to
-- ---------------------------------------------------------------------------
create table if not exists public.consent_policies (
  id             uuid primary key default gen_random_uuid(),
  code           text        not null,                  -- stable policy family, e.g. 'anvaya_processing'
  version        text        not null,                  -- e.g. '1.0.0'
  purpose        anvaya_consent_purpose not null,
  title_en       text        not null,
  title_hi       text,
  summary_en     text        not null,
  summary_hi     text,
  full_text_en   text        not null,
  full_text_hi   text,
  doc_hash       text        not null,                  -- sha256 of the canonical text shown
  effective_from timestamptz not null default now(),
  effective_to   timestamptz,
  is_active      boolean     not null default true,

  constraint consent_policies_version_key unique (code, version, purpose),
  constraint consent_policies_window_chk check (effective_to is null or effective_to > effective_from)
);

comment on table public.consent_policies is
  'Immutable catalogue of consent texts. Versioning here is what lets an old consent remain valid under the policy that was current when it was given.';
comment on column public.consent_policies.doc_hash is
  'sha256 of the exact text rendered to the patient. Makes "what did they actually agree to?" answerable years later.';

-- Exactly one active version per (code, purpose).
create unique index if not exists consent_policies_one_active
  on public.consent_policies (code, purpose)
  where is_active;

create index if not exists consent_policies_purpose_idx on public.consent_policies (purpose) where is_active;

-- ---------------------------------------------------------------------------
-- patient_consents — one row per decision (append-oriented)
-- ---------------------------------------------------------------------------
create table if not exists public.patient_consents (
  id            uuid primary key default gen_random_uuid(),
  patient_id    uuid not null,
  policy_id     uuid not null,
  purpose       anvaya_consent_purpose not null,
  status        anvaya_consent_status not null,
  channel       anvaya_consent_channel not null default 'in_app',
  granted_at    timestamptz not null default now(),
  expires_at    timestamptz,
  revoked_at    timestamptz,
  revoked_by    uuid,
  revocation_reason text,
  -- Evidence bundle: ip, user agent, UI version, STT transcript reference for
  -- voice consent. Deliberately jsonb (free-form evidence) — the *queryable*
  -- facts (who/what/when) are proper columns above.
  evidence      jsonb not null default '{}'::jsonb,
  ip_address    inet,
  user_agent    text,
  created_at    timestamptz not null default now(),

  constraint consents_fk_patient foreign key (patient_id) references public.patients (id) on delete restrict,
  constraint consents_fk_policy  foreign key (policy_id)  references public.consent_policies (id) on delete restrict,
  constraint consents_fk_revoked_by foreign key (revoked_by) references public.profiles (id) on delete set null,
  -- A consent can only be "revoked" with a timestamp, and only if it was granted.
  constraint consents_revoked_needs_ts check (status <> 'withdrawn' or revoked_at is not null),
  constraint consents_declined_not_granted check (status <> 'declined' or revoked_at is null)
);

comment on table public.patient_consents is
  'Append-oriented consent ledger. A withdrawal is a NEW row (status withdrawn, with revoked_at), never a delete or an edit, so the original grant stays provable.';
comment on constraint consents_fk_patient on public.patient_consents is
  'ON DELETE RESTRICT, deliberately not CASCADE. A patient row must never silently take the consent ledger with it: erasure goes through anvaya.hard_delete_patient(), which deletes consents explicitly inside a sanctioned-erasure window and keeps an audit record that it did so. RESTRICT also avoids a confusing failure mode — because row triggers fire before FK enforcement, a CASCADE here would surface the append-only error instead of the referential one.';
comment on column public.patient_consents.purpose is
  'Denormalised from consent_policies.purpose so the common "is purpose X consented right now?" query is a single indexed lookup.';

-- NOTE: deliberately NO unique index on (patient_id, purpose) WHERE status =
-- 'granted'. Because this table is append-only (the immutable trigger below
-- forbids flipping an old row to 'withdrawn'), a patient who withdraws and later
-- re-consents would legitimately hold two 'granted' rows. Authority is therefore
-- "the most recent row for this purpose wins" — implemented in
-- anvaya.has_active_consent() (0017). A unique index here would make lawful
-- re-consent impossible.
create index if not exists consents_active_lookup_idx
  on public.patient_consents (patient_id, purpose, granted_at desc);

create index if not exists consents_patient_idx on public.patient_consents (patient_id, granted_at desc);
create index if not exists consents_policy_idx on public.patient_consents (policy_id);

-- Append-only: no UPDATE, no DELETE. Corrections are new rows.
drop trigger if exists consents_immutable on public.patient_consents;
create trigger consents_immutable
  before update or delete on public.patient_consents
  for each row execute function public.guard_immutable_row();

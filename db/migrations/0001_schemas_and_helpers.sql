-- ============================================================================
-- Anvaya / RxAnvaya — Supabase migration 0001
-- Schemas, shared helper functions, updated_at / immutability triggers
-- ----------------------------------------------------------------------------
-- Purpose   : Create the `anvaya` schema for privileged (non-PostgREST-exposed)
--             helpers, and the generic trigger functions reused by later
--             migrations.
-- Depends on: nothing
-- Fresh safe: YES (all objects created IF NOT EXISTS / OR REPLACE)
-- Contract  : adds new objects only; changes no existing application contract
--
-- SECURITY NOTE
--   Supabase's PostgREST exposes the schemas listed in `pgrst.db_schemas`
--   (default: `public, graphql_public`). All data tables live in `public` so the
--   Next.js app can reach them with the anon key + RLS. Every *privileged*
--   function (hard delete, audit writer, deterministic classification,
--   correction submission) lives in `anvaya`, which is NOT exposed, so the
--   browser can never RPC into it directly.
--
-- EXTENSIONS
--   Deliberately NONE. This schema needs no pgcrypto / citext / pgvector:
--     * gen_random_uuid()  -> built in since PostgreSQL 13
--     * sha256()           -> built in since PostgreSQL 11
--   That keeps the migration runnable on a brand-new Supabase project with no
--   extension provisioning step and no superuser action.
-- ============================================================================

create schema if not exists anvaya;

comment on schema anvaya is
  'Privileged helper functions for the Anvaya pipeline. Intentionally NOT added to pgrst.db_schemas so the frontend cannot invoke these directly.';

-- ---------------------------------------------------------------------------
-- updated_at maintenance
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

comment on function public.set_updated_at() is
  'Generic BEFORE UPDATE trigger: keeps updated_at truthful. Applied only to mutable tables.';

-- ---------------------------------------------------------------------------
-- Append-only / immutable guard
-- ---------------------------------------------------------------------------
create or replace function public.guard_immutable_row()
returns trigger
language plpgsql
as $$
declare
  v_id text;
begin
  -- In a row-level trigger NEW/OLD are composite records, not jsonb, so the
  -- record has to be converted before a field can be read by name.
  if tg_op = 'DELETE' then
    v_id := to_jsonb(old) ->> 'id';
  else
    v_id := to_jsonb(new) ->> 'id';
  end if;

  -- UPDATE is refused unconditionally: history is never rewritten.
  -- DELETE is refused too, with one narrow exception — a sanctioned erasure.
  -- anvaya.hard_delete_report() / hard_delete_patient() set this
  -- transaction-local flag, which is how a patient's right to erasure can be
  -- honoured without making these tables editable in normal operation.
  -- The flag can only be set by a SECURITY DEFINER function; a client session
  -- has no way to set another backend's GUC.
  if tg_op = 'DELETE' and current_setting('anvaya.erasure_in_progress', true) = 'on' then
    return old;
  end if;

  raise exception 'anvaya: % is append-only and cannot be % (row %)',
    tg_table_name, lower(tg_op), coalesce(v_id, '?');
end;
$$;

comment on function public.guard_immutable_row() is
  'BEFORE UPDATE OR DELETE trigger that hard-blocks mutation. Used on deterministic validation output, AI generations and audit records so no client (and no LLM write-back path) can rewrite history.';

-- ---------------------------------------------------------------------------
-- Small numeric helpers used by checks / classification
-- ---------------------------------------------------------------------------
create or replace function anvaya.num_nonnulls(variadic anyarray)
returns int
language sql
immutable
as $$
  select count(*)::int from unnest($1) as v(x) where x is not null;
$$;

comment on function anvaya.num_nonnulls(anyarray) is
  'Portable "exactly one of these FKs is set" helper for polymorphic subject columns.';

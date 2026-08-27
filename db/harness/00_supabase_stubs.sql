-- ============================================================================
-- TEST HARNESS ONLY — not part of the shipped migration set.
--
-- Recreates the slice of the Supabase PLATFORM the migrations legitimately
-- depend on (the auth and storage schemas and the platform roles) so the real
-- migration files can be executed against bare PostgreSQL.
--
-- WHAT CHANGED, AND WHY IT MATTERS
--   An earlier version of this file stubbed `storage.objects` as an ordinary
--   table owned by whoever ran the harness. That let migration 0019 pass
--   locally and then fail on a real project with:
--
--       ERROR: 42501: must be owner of table objects
--
--   This version therefore reproduces the platform's PERMISSION MODEL, not just
--   its object names. Everything below mirrors, statement for statement, the
--   migrations Supabase itself applies:
--
--     supabase/postgres  migrations/db/init-scripts/00000000000000-initial-schema.sql
--     supabase/postgres  migrations/db/migrations/10000000000000_demote-postgres.sql
--     supabase/postgres  migrations/db/migrations/20220609081115_grant-...-to-postgres.sql
--     supabase/postgres  migrations/db/migrations/20250421084701_revoke_admin_roles_from_postgres.sql
--     supabase/postgres  migrations/db/migrations/20250623125453_tmp_grant_storage_tables_to_postgres_with_grant_option.sql
--     supabase/postgres  migrations/db/migrations/20250605172253_grant_with_admin_to_postgres_16_and_above.sql
--     supabase/storage   migrations/tenant/0002-storage-schema.sql
--     supabase/storage   migrations/tenant/0007-add-rls-to-buckets.sql
--     supabase/storage   migrations/tenant/0008-add-public-to-buckets.sql
--     supabase/storage   migrations/tenant/0013-add-bucket-custom-limits.sql
--     supabase/storage   migrations/tenant/0014-use-bytes-for-max-size.sql
--     supabase/storage   migrations/tenant/0049-buckets-objects-grants-postgres.sql
--     supabase/storage   migrations/tenant/0055-prevent-direct-deletes.sql
--
-- The three facts that decide what a SQL-Editor migration may and may not do:
--
--   1. `storage.objects` / `storage.buckets` are owned by supabase_storage_admin.
--   2. The role the SQL Editor runs as is NOT a superuser and, since
--      2025-04-21, is NOT a member of supabase_storage_admin. It therefore
--      fails every ownership check on those tables — ALTER TABLE, CREATE INDEX,
--      CREATE/DROP POLICY, COMMENT ON POLICY — with SQLSTATE 42501.
--   3. That role does hold table-level GRANT ALL (with BYPASSRLS), so DML on
--      storage.objects / storage.buckets is fine.
--
-- Nothing here is shipped; on a real Supabase project all of it already exists.
-- Run this file as the cluster superuser, before the migrations.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Platform roles
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin noinherit bypassrls;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticator') then
    create role authenticator noinherit nologin;
  end if;
  -- Platform admin that owns the storage service objects.
  if not exists (select 1 from pg_roles where rolname = 'supabase_storage_admin') then
    create role supabase_storage_admin nologin noinherit createrole;
  end if;
  -- The role the Supabase SQL Editor / postgres client connects as.
  -- Mirrors:  ALTER ROLE postgres NOSUPERUSER CREATEDB CREATEROLE LOGIN
  --           REPLICATION BYPASSRLS;
  if not exists (select 1 from pg_roles where rolname = 'postgres_editor') then
    create role postgres_editor nosuperuser createdb createrole login replication bypassrls;
  end if;
end
$$;

-- Supabase: grant anon, authenticated, service_role, authenticator ... to postgres
grant anon, authenticated, service_role, authenticator to postgres_editor;
grant anon, authenticated, service_role to authenticator;

-- ---------------------------------------------------------------------------
-- auth schema
-- ---------------------------------------------------------------------------
create schema if not exists auth;

-- Mutable session state so tests can impersonate different users.
create table if not exists auth._session (
  uid  uuid,
  role text
);

alter table auth._session owner to postgres_editor;

create or replace function auth.uid()
returns uuid
language sql
stable
as $$ select uid from auth._session limit 1 $$;

create or replace function auth.role()
returns text
language sql
stable
as $$ select coalesce((select role from auth._session limit 1), 'authenticated') $$;

create or replace function auth.jwt()
returns jsonb
language sql
stable
as $$ select jsonb_build_object('sub', auth.uid(), 'role', auth.role()) $$;

alter function auth.uid()       owner to postgres_editor;
alter function auth.role()      owner to postgres_editor;
alter function auth.jwt()       owner to postgres_editor;

grant usage on schema auth to postgres_editor, anon, authenticated, service_role;
grant select on auth._session to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- storage schema — owned by supabase_storage_admin, exactly as on Supabase
-- ---------------------------------------------------------------------------
create schema if not exists storage;
alter schema storage owner to supabase_storage_admin;

create table if not exists storage.migrations (
  id          integer primary key,
  name        varchar(100) unique not null,
  hash        varchar(40) not null,
  executed_at timestamp default current_timestamp
);

create table if not exists storage.buckets (
  id                 text not null,
  name               text not null,
  owner              uuid,
  public             boolean default false,
  avif_autodetection boolean default false,
  file_size_limit    bigint,
  allowed_mime_types text[],
  created_at         timestamptz default now(),
  updated_at         timestamptz default now(),
  constraint buckets_pkey primary key (id)
);
create unique index if not exists bname on storage.buckets using btree (name);

create table if not exists storage.objects (
  id                uuid not null default gen_random_uuid(),
  bucket_id         text,
  name              text,
  owner             uuid,
  created_at        timestamptz default now(),
  updated_at        timestamptz default now(),
  last_accessed_at  timestamptz default now(),
  metadata          jsonb,
  path_tokens       text[],
  constraint objects_pkey primary key (id),
  constraint objects_bucketId_fkey foreign key (bucket_id) references storage.buckets (id)
);
create unique index if not exists bucketid_objname on storage.objects using btree (bucket_id, name);

-- Supabase owns these tables; the SQL Editor role does not.
alter table storage.migrations owner to supabase_storage_admin;
alter table storage.buckets    owner to supabase_storage_admin;
alter table storage.objects    owner to supabase_storage_admin;

-- Supabase's own storage migrations enable RLS on both tables out of the box
-- (tenant/0002 for objects, tenant/0007 for buckets). An application migration
-- must NOT try to re-assert it: that statement requires ownership.
alter table storage.objects enable row level security;
alter table storage.buckets enable row level security;

create or replace function storage.foldername(name text)
returns text[]
language plpgsql
as $function$
declare _parts text[];
begin
  select string_to_array(name, '/') into _parts;
  return _parts[1:array_length(_parts, 1) - 1];
end
$function$;

create or replace function storage.filename(name text)
returns text
language plpgsql
as $function$
declare _parts text[];
begin
  select string_to_array(name, '/') into _parts;
  return _parts[array_length(_parts, 1)];
end
$function$;

alter function storage.foldername(text) owner to supabase_storage_admin;
alter function storage.filename(text)   owner to supabase_storage_admin;

-- storage/tenant/0055 — direct deletes from the storage tables are refused
-- unless the caller opts in for the duration of its transaction. Any erasure
-- path that deletes from storage.objects has to deal with this.
create or replace function storage.protect_delete()
returns trigger
language plpgsql
as $$
begin
  if coalesce(current_setting('storage.allow_delete_query', true), 'false') <> 'true' then
    raise exception 'Direct deletion from storage tables is not allowed. Use the Storage API instead.'
      using hint = 'This prevents accidental data loss from orphaned objects.',
            errcode = '42501';
  end if;
  return null;
end;
$$;
alter function storage.protect_delete() owner to supabase_storage_admin;

drop trigger if exists protect_buckets_delete on storage.buckets;
create trigger protect_buckets_delete
  before delete on storage.buckets
  for each statement
  execute function storage.protect_delete();

drop trigger if exists protect_objects_delete on storage.objects;
create trigger protect_objects_delete
  before delete on storage.objects
  for each statement
  execute function storage.protect_delete();

-- ---------------------------------------------------------------------------
-- Privileges, as Supabase grants them
-- ---------------------------------------------------------------------------
grant usage on schema storage to postgres_editor, anon, authenticated, service_role;

-- storage/tenant/0049 — table-level rights WITHOUT ownership. This is the whole
-- point: DML is allowed, DDL is not.
grant all on storage.buckets, storage.objects to postgres_editor with grant option;
grant all on storage.buckets, storage.objects to service_role, authenticated, anon;

-- supabase/postgres 20250421084701 — the line that causes the 42501:
--     revoke supabase_storage_admin from postgres;
-- Asserted explicitly so the harness cannot silently drift back into a
-- configuration where the migrations only pass because of inherited ownership.
do $$
begin
  if pg_has_role('postgres_editor', 'supabase_storage_admin', 'USAGE') then
    raise exception 'harness drift: postgres_editor must NOT be a member of supabase_storage_admin';
  end if;
  if (select pg_has_role('postgres_editor'::name, c.relowner, 'USAGE')
        from pg_class c where c.oid = 'storage.objects'::regclass) then
    raise exception 'harness drift: postgres_editor must NOT own storage.objects';
  end if;
end
$$;

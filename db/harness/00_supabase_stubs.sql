-- ============================================================================
-- TEST HARNESS ONLY — not part of the shipped migration set.
-- Recreates the small pieces of the Supabase platform that the migrations
-- legitimately depend on (the auth and storage schemas, and the three platform
-- roles) so the real migration files can be executed against bare PostgreSQL.
-- Nothing here is shipped; on a real Supabase project all of this already exists.
-- ============================================================================

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
end
$$;

create schema if not exists auth;

-- Mutable session state so tests can impersonate different users.
create table if not exists auth._session (
  uid  uuid,
  role text
);

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

create schema if not exists storage;

create table if not exists storage.buckets (
  id                 text primary key,
  name               text not null unique,
  owner              uuid,
  public             boolean default false,
  avif_autodetection boolean default false,
  file_size_limit    bigint,
  allowed_mime_types text[],
  created_at         timestamptz default now(),
  updated_at         timestamptz default now()
);

create table if not exists storage.objects (
  id                 uuid primary key default gen_random_uuid(),
  bucket_id          text references storage.buckets (id),
  name               text,
  owner              uuid,
  storage_path_tokens text[],
  created_at         timestamptz default now(),
  unique (bucket_id, name)
);

create or replace function storage.foldername(p_name text)
returns text[]
language sql
immutable
as $$
  select (string_to_array(p_name, '/'))[1 : greatest(array_length(string_to_array(p_name, '/'), 1) - 1, 0)]
$$;

grant usage on schema auth to anon, authenticated, service_role;
grant usage on schema storage to anon, authenticated, service_role;
grant select on auth._session to anon, authenticated, service_role;

-- Supabase grants these to the platform roles by default; the RLS policies in
-- migration 0019 are what actually decide visibility.
grant select on storage.objects to anon, authenticated, service_role;
grant select on storage.buckets to anon, authenticated, service_role;
grant insert, update, delete on storage.objects to authenticated, service_role;

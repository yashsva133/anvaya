-- ============================================================================
-- Anvaya / Rxanvaya — Supabase migration 0019
-- Supabase Storage buckets, the access predicate, and the object policies
-- ----------------------------------------------------------------------------
-- Purpose   : Keep every byte of medical data in PRIVATE buckets, addressed by
--             a predictable key convention, with object-level policies that
--             agree with the database RLS in 0018.
-- Depends on: 0004, 0017, 0018 (anvaya.current_patient_id / has_active_grant /
--             grants on the anvaya schema)
-- Fresh safe: YES (bucket inserts are ON CONFLICT DO NOTHING; the policy block
--             drops before it creates and is skipped entirely when the caller
--             is not allowed to touch storage.objects)
--
-- ---------------------------------------------------------------------------
-- THE REAL-SUPABASE CONSTRAINT THIS FILE IS BUILT AROUND — READ BEFORE EDITING
-- ---------------------------------------------------------------------------
-- storage.buckets and storage.objects are OWNED BY supabase_storage_admin, and
-- since Supabase platform migration 20250421084701_revoke_admin_roles_from_postgres
-- the role the SQL Editor connects as (`postgres`) is NO LONGER A MEMBER of that
-- role. It is therefore not treated as the owner of those tables.
--
-- PostgreSQL requires OWNERSHIP — not merely a table-level GRANT — for each of:
--
--   alter table storage.objects enable row level security
--       -> ERROR 42501: must be owner of table objects
--   alter table storage.objects force  row level security
--       -> ERROR 42501: must be owner of table objects
--   create index ... on storage.objects
--       -> ERROR 42501: must be owner of table objects
--   create policy ... on storage.objects
--       -> ERROR 42501: must be owner of table objects
--   drop policy ... on storage.objects            (when the policy exists)
--       -> ERROR 42501: must be owner of relation objects
--   comment on policy ... on storage.objects
--       -> ERROR 42501: must be owner of relation objects
--
-- Supabase DOES grant `grant all on storage.buckets, storage.objects to postgres
-- with grant option`, which is why DML works — but GRANT ALL covers DML only,
-- never DDL. Every ownership-requiring statement is gone from this file or sits
-- behind the capability probe in the policy block.
--
-- WHAT THIS FILE DOES
--   1. Creates the five PRIVATE buckets            (DML — always permitted)
--   2. Asserts none of them is public              (fails the migration if so)
--   3. Creates anvaya.may_access_patient_prefix()  (our schema — always permitted)
--   4. Creates the 15 object policies, but ONLY if the current role actually
--      owns storage.objects; otherwise it says so and prints what to do instead
--
-- WHAT THIS FILE DELIBERATELY DOES NOT DO
--   * It never runs ALTER TABLE against storage.objects or storage.buckets.
--     Supabase's own storage migrations already enable RLS on both
--     (supabase/storage tenant 0002 for objects, tenant 0007 for buckets), and
--     re-asserting it is not ours to do.
--   * It never disables, replaces or rewrites Supabase's storage RLS.
--   * It never creates indexes, columns or triggers on Supabase's tables.
--
-- SECURITY DIRECTION OF FAILURE
--   If the policies cannot be created here, storage.objects RLS is still ON and
--   has no policy for our buckets — so `authenticated` can read, upload and
--   delete NOTHING. The app cannot use storage yet, but nothing is exposed.
--   Adding the policies in the dashboard is the step that OPENS the narrow,
--   prefix-scoped path; it is never the step that closes a hole.
--
-- KEY CONVENTION
--   {patient_id}/{report_id}/{kind}-{n}.{ext}
--   Prefixing with patient_id makes per-patient erasure a single prefix delete,
--   which anvaya.hard_delete_report() relies on.
--
-- WHAT BELONGS IN STORAGE, NOT IN POSTGRES
--   * the original photo / PDF as uploaded
--   * the processed (deskewed, contrast-fixed) image
--   * full OCR dumps, if retained
--   * exported patient and doctor PDFs
--   * generated TTS audio and captured question audio
--   * consent evidence recordings and signature images
--   PostgreSQL keeps only bucket + path + checksum + size (report_files).
--
-- NOTHING HERE IS PUBLIC. A public bucket serving lab reports would defeat the
-- entire RLS model, because a signed URL is not required to read a public object.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Buckets
-- ---------------------------------------------------------------------------
-- DML on storage.buckets is explicitly granted to the SQL Editor role, so this
-- is the one part of storage setup that always runs from the SQL Editor.
-- `on conflict do nothing` (not `on conflict (id)`) so a pre-existing bucket
-- that happens to collide on the unique `name` index is skipped rather than
-- aborting the whole migration.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('report-originals', 'report-originals', false, 26214400,
    array['image/jpeg','image/png','image/webp','image/heic','application/pdf','text/csv']),
  ('report-processed', 'report-processed', false, 26214400,
    array['image/jpeg','image/png','image/webp','application/json']),
  ('report-exports',   'report-exports',   false, 15728640,
    array['application/pdf','image/png']),
  ('voice-audio',      'voice-audio',      false, 10485760,
    array['audio/webm','audio/mpeg','audio/mp4','audio/ogg','audio/wav']),
  ('consent-evidence', 'consent-evidence', false, 10485760,
    array['audio/webm','audio/mpeg','audio/wav','image/png','image/jpeg','application/pdf'])
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- 2. Fail loudly rather than ship a public medical bucket
-- ---------------------------------------------------------------------------
do $do$
declare
  v_ids   text[] := array['report-originals','report-processed','report-exports',
                          'voice-audio','consent-evidence'];
  v_bad   text;
  v_found int;
begin
  select string_agg(id, ', ' order by id) into v_bad
    from storage.buckets
   where id = any (v_ids)
     and public is true;
  if v_bad is not null then
    raise exception
      'anvaya 0019: refusing to continue — these Anvaya buckets are PUBLIC: %. A public bucket serving lab reports defeats the RLS model, because reading a public object needs no signed URL.', v_bad;
  end if;

  select count(*) into v_found from storage.buckets where id = any (v_ids);
  if v_found <> 5 then
    raise exception 'anvaya 0019: expected 5 Anvaya buckets, found %', v_found;
  end if;
end
$do$;

-- ---------------------------------------------------------------------------
-- 3. Shared predicate: may the caller touch objects under this patient prefix?
-- ---------------------------------------------------------------------------
-- Created in OUR schema, so it never touches the ownership of a Supabase table.
create or replace function anvaya.may_access_patient_prefix(p_object_name text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select (
    (storage.foldername(p_object_name))[1] = anvaya.current_patient_id()::text
    or anvaya.is_admin()
    or exists (
      select 1
      from public.patients p
      where p.id::text = (storage.foldername(p_object_name))[1]
        and exists (
          select 1 from public.doctors d
          where d.profile_id = auth.uid()
            and anvaya.has_active_grant(d.id, p.id)
        )
    )
  );
$$;

comment on function anvaya.may_access_patient_prefix(text) is
  'One predicate behind every storage policy: the owning patient, an authorised clinician, or an admin. Uses the same grant table as the database RLS so the two can never disagree.';

-- 0018 revokes EXECUTE on the anvaya schema from anon for every function that
-- existed at the time. This one is created later, so the revocation is repeated
-- explicitly and `authenticated` / `service_role` are granted it outright,
-- because a storage.objects policy is evaluated as the querying role.
grant  execute on function anvaya.may_access_patient_prefix(text) to authenticated, service_role;
revoke execute on function anvaya.may_access_patient_prefix(text) from anon, public;

-- ---------------------------------------------------------------------------
-- 4. Object policies — behind a capability probe
-- ---------------------------------------------------------------------------
-- pg_has_role(current_user, <table owner>, 'USAGE') is the SQL-visible form of
-- the exact test PostgreSQL runs before CREATE POLICY / ALTER TABLE
-- (object_ownercheck -> has_privs_of_role). When it is false, every policy
-- statement below would abort with SQLSTATE 42501, so we do not run them and we
-- say exactly what to do instead.
do $do$
declare
  r         record;
  v_owner   text;
  v_can_ddl boolean;
  v_created int := 0;
begin
  select c.relowner::regrole::text into v_owner
    from pg_class c
   where c.oid = 'storage.objects'::regclass;

  v_can_ddl := pg_has_role(
    current_user,
    (select relowner from pg_class where oid = 'storage.objects'::regclass),
    'USAGE');

  if not v_can_ddl then
    raise notice
      'anvaya 0019: current_user "%" does not own storage.objects (owner: %), so CREATE POLICY / DROP POLICY would fail with SQLSTATE 42501. Skipping all 15 object policies. The 5 buckets are private and storage.objects RLS is ON, so storage is CLOSED BY DEFAULT — nothing can be read, uploaded or deleted yet. Create the policies in the dashboard: Storage -> Policies -> storage.objects -> For full customization, one policy per bucket per command, USING / WITH CHECK: bucket_id = ''<bucket>'' and anvaya.may_access_patient_prefix(name).',
      current_user, v_owner;
    return;
  end if;

  for r in
    select b.bucket, k.cmd, k.suffix
      from (values ('report-originals'), ('report-processed'), ('report-exports'),
                   ('voice-audio'),     ('consent-evidence')) as b(bucket)
     cross join (values ('select', 'read'),
                        ('insert', 'insert'),
                        ('delete', 'delete'))                as k(cmd, suffix)
  loop
    execute format('drop policy if exists %I on storage.objects',
                   r.bucket || '_' || r.suffix);

    if r.cmd = 'insert' then
      execute format($f$
        create policy %I on storage.objects
          for insert to authenticated
          with check (bucket_id = %L and anvaya.may_access_patient_prefix(name))
      $f$, r.bucket || '_' || r.suffix, r.bucket);
    else
      execute format($f$
        create policy %I on storage.objects
          for %s to authenticated
          using (bucket_id = %L and anvaya.may_access_patient_prefix(name))
      $f$, r.bucket || '_' || r.suffix, r.cmd, r.bucket);
    end if;

    v_created := v_created + 1;
  end loop;

  raise notice 'anvaya 0019: created % object policies on storage.objects.', v_created;
end
$do$;

-- ---------------------------------------------------------------------------
-- 5. Self-check, so the run tells you where storage ended up either way
-- ---------------------------------------------------------------------------
-- Reads pg_policies only — no DDL, so it is always permitted. A count below 15
-- means the policies still have to be added in the dashboard (see the NOTICE
-- above). It is a NOTICE, not an exception, because a zero here is the expected
-- and SAFE state on a stock Supabase project.
do $do$
declare
  v_present int;
begin
  select count(*) into v_present
    from pg_policies
   where schemaname = 'storage'
     and tablename  = 'objects'
     and policyname in ('report-originals_read','report-originals_insert','report-originals_delete',
                        'report-processed_read','report-processed_insert','report-processed_delete',
                        'report-exports_read',  'report-exports_insert',  'report-exports_delete',
                        'voice-audio_read',     'voice-audio_insert',     'voice-audio_delete',
                        'consent-evidence_read','consent-evidence_insert','consent-evidence_delete');

  if v_present < 15 then
    raise notice
      'anvaya 0019: % of 15 storage.objects policies present. Storage stays closed until the rest are added (Storage -> Policies -> storage.objects).',
      v_present;
  else
    raise notice 'anvaya 0019: all 15 storage.objects policies present.';
  end if;
end
$do$;

-- NOTE ON COMMENT ON POLICY
--   An earlier revision of this migration ended with
--       comment on policy "report-originals_read" on storage.objects is '...';
--   COMMENT ON POLICY is a table-ownership operation, so on a real project it
--   fails with 42501 and — worse — it only fails when the policy exists, which
--   makes the migration pass on a fresh project and break on re-run. It is
--   removed; the same sentence lives in the comment on
--   anvaya.may_access_patient_prefix() above, which we do own.

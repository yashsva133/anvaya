-- ============================================================================
-- TEST HARNESS ONLY — not part of the shipped migration set.
--
-- THE DASHBOARD STEP, AS SQL.
--
-- On a real Supabase project the SQL Editor connects as `postgres`, which is
-- not the owner of storage.objects and has not been since Supabase platform
-- migration 20250421084701_revoke_admin_roles_from_postgres. CREATE POLICY
-- against storage.objects therefore fails there with SQLSTATE 42501, so
-- migration 0019 skips the policy block and prints a NOTICE instead.
--
-- This file performs the step the dashboard performs on your behalf: it creates
-- the 15 object policies AS A ROLE THAT OWNS storage.objects. In the harness
-- that is the cluster superuser, which stands in for Supabase's `supabase_admin`
-- — the role Studio / pg-meta connects with, and the reason a policy created
-- through Storage -> Policies succeeds while the identical statement run as
-- `postgres` in the SQL Editor does not.
--
-- The 15 statements below are exactly what to reproduce in
-- Storage -> Policies -> storage.objects -> "For full customization".
--
-- NOTE: a policy expression is evaluated as the QUERYING role, not as the role
-- that created it, so nothing here needs a grant on the anvaya schema for
-- supabase_admin. `authenticated` gets EXECUTE on
-- anvaya.may_access_patient_prefix() from migration 0019 itself.
-- ============================================================================

-- report-originals -----------------------------------------------------------
drop policy if exists "report-originals_read" on storage.objects;
create policy "report-originals_read" on storage.objects
  for select to authenticated
  using (bucket_id = 'report-originals' and anvaya.may_access_patient_prefix(name));

drop policy if exists "report-originals_insert" on storage.objects;
create policy "report-originals_insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'report-originals' and anvaya.may_access_patient_prefix(name));

drop policy if exists "report-originals_delete" on storage.objects;
create policy "report-originals_delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'report-originals' and anvaya.may_access_patient_prefix(name));

-- report-processed -----------------------------------------------------------
drop policy if exists "report-processed_read" on storage.objects;
create policy "report-processed_read" on storage.objects
  for select to authenticated
  using (bucket_id = 'report-processed' and anvaya.may_access_patient_prefix(name));

drop policy if exists "report-processed_insert" on storage.objects;
create policy "report-processed_insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'report-processed' and anvaya.may_access_patient_prefix(name));

drop policy if exists "report-processed_delete" on storage.objects;
create policy "report-processed_delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'report-processed' and anvaya.may_access_patient_prefix(name));

-- report-exports -------------------------------------------------------------
drop policy if exists "report-exports_read" on storage.objects;
create policy "report-exports_read" on storage.objects
  for select to authenticated
  using (bucket_id = 'report-exports' and anvaya.may_access_patient_prefix(name));

drop policy if exists "report-exports_insert" on storage.objects;
create policy "report-exports_insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'report-exports' and anvaya.may_access_patient_prefix(name));

drop policy if exists "report-exports_delete" on storage.objects;
create policy "report-exports_delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'report-exports' and anvaya.may_access_patient_prefix(name));

-- voice-audio ----------------------------------------------------------------
drop policy if exists "voice-audio_read" on storage.objects;
create policy "voice-audio_read" on storage.objects
  for select to authenticated
  using (bucket_id = 'voice-audio' and anvaya.may_access_patient_prefix(name));

drop policy if exists "voice-audio_insert" on storage.objects;
create policy "voice-audio_insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'voice-audio' and anvaya.may_access_patient_prefix(name));

drop policy if exists "voice-audio_delete" on storage.objects;
create policy "voice-audio_delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'voice-audio' and anvaya.may_access_patient_prefix(name));

-- consent-evidence -----------------------------------------------------------
drop policy if exists "consent-evidence_read" on storage.objects;
create policy "consent-evidence_read" on storage.objects
  for select to authenticated
  using (bucket_id = 'consent-evidence' and anvaya.may_access_patient_prefix(name));

drop policy if exists "consent-evidence_insert" on storage.objects;
create policy "consent-evidence_insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'consent-evidence' and anvaya.may_access_patient_prefix(name));

drop policy if exists "consent-evidence_delete" on storage.objects;
create policy "consent-evidence_delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'consent-evidence' and anvaya.may_access_patient_prefix(name));

-- Prove the platform side is now complete, and prove we did not touch anything
-- Supabase owns beyond adding policies.
do $$
declare n int; rls boolean;
begin
  select count(*) into n from pg_policies
   where schemaname = 'storage' and tablename = 'objects'
     and policyname ~ '^(report-originals|report-processed|report-exports|voice-audio|consent-evidence)_(read|insert|delete)$';
  if n <> 15 then raise exception 'expected 15 Anvaya storage policies, found %', n; end if;

  select relrowsecurity into rls from pg_class where oid = 'storage.objects'::regclass;
  if rls is not true then raise exception 'storage.objects RLS is off'; end if;
end
$$;

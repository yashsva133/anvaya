-- ============================================================================
-- Anvaya / Rxanvaya — Supabase migration 0019
-- Supabase Storage buckets and object policies
-- ----------------------------------------------------------------------------
-- Purpose   : Keep every byte of medical data in PRIVATE buckets, addressed by a
--             predictable key convention, with object-level policies that agree
--             with the database RLS in 0018.
-- Depends on: 0004, 0017 (anvaya.current_patient_id / has_active_grant)
-- Fresh safe: YES (bucket inserts are ON CONFLICT DO NOTHING; policies are
--             dropped before creation)
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
-- KEY CONVENTION
--   {patient_id}/{report_id}/{kind}-{n}.{ext}
--   Prefixing with patient_id makes per-patient erasure a single prefix delete,
--   which anvaya.hard_delete_report() relies on.
--
-- NOTHING HERE IS PUBLIC. A public bucket serving lab reports would defeat the
-- entire RLS model, because a signed URL is not required to read a public object.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Buckets
-- ---------------------------------------------------------------------------
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
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Shared predicate: may the caller touch objects under this patient prefix?
-- ---------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------
-- Defensive: the object policies below are worthless if RLS is disabled on
-- storage.objects. Supabase enables it by default, but re-asserting it here is
-- idempotent and means a misconfigured project cannot silently expose every
-- uploaded lab report.
-- ---------------------------------------------------------------------------
alter table storage.objects enable row level security;

-- ---------------------------------------------------------------------------
-- Object policies
-- ---------------------------------------------------------------------------
do $do$
declare
  b text;
  buckets text[] := array['report-originals','report-processed','report-exports','voice-audio','consent-evidence'];
begin
  foreach b in array buckets loop
    execute format('drop policy if exists %I on storage.objects', b || '_read');
    execute format($f$
      create policy %I on storage.objects
        for select to authenticated
        using (bucket_id = %L and anvaya.may_access_patient_prefix(name))
    $f$, b || '_read', b);

    execute format('drop policy if exists %I on storage.objects', b || '_insert');
    execute format($f$
      create policy %I on storage.objects
        for insert to authenticated
        with check (bucket_id = %L and anvaya.may_access_patient_prefix(name))
    $f$, b || '_insert', b);

    execute format('drop policy if exists %I on storage.objects', b || '_delete');
    execute format($f$
      create policy %I on storage.objects
        for delete to authenticated
        using (bucket_id = %L and anvaya.may_access_patient_prefix(name))
    $f$, b || '_delete', b);
  end loop;
end
$do$;

comment on policy "report-originals_read" on storage.objects is
  'Reads require a matching patient prefix; in practice the app should still hand out short-lived signed URLs rather than exposing the object list.';

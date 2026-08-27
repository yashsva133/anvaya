-- ============================================================================
-- Anvaya / Rxanvaya — post-apply verification
-- ----------------------------------------------------------------------------
-- Paste this into the Supabase SQL Editor after applying anvaya_schema.sql (or
-- the migrations) and after creating the 15 storage policies in the dashboard.
-- It is read-only: one SELECT, no DDL, no writes, nothing that touches a
-- Supabase-managed table's ownership.
--
-- Every row reports expected vs actual and a pass flag. A row that reads FAIL
-- tells you which dashboard step is still outstanding.
-- ============================================================================

with checks as (
  -- 1. The 39-table Anvaya schema is intact --------------------------------
  select 1 as ord,
         '39 public Anvaya tables exist'                      as check,
         '39'                                                 as expected,
         count(*)::text                                       as actual
    from information_schema.tables
   where table_schema = 'public' and table_type = 'BASE TABLE'

  union all
  -- 2. The five buckets exist ----------------------------------------------
  select 2,
         '5 Anvaya storage buckets exist',
         '5',
         count(*)::text
    from storage.buckets
   where id in ('report-originals','report-processed','report-exports',
                'voice-audio','consent-evidence')

  union all
  -- 3. ... and every one of them is PRIVATE --------------------------------
  select 3,
         '0 of those buckets are public',
         '0',
         count(*)::text
    from storage.buckets
   where id in ('report-originals','report-processed','report-exports',
                'voice-audio','consent-evidence')
     and public is true

  union all
  -- 4. Supabase still owns its own table — we took nothing over -------------
  select 4,
         'storage.objects is still owned by supabase_storage_admin',
         'supabase_storage_admin',
         (select c.relowner::regrole::text
            from pg_class c where c.oid = 'storage.objects'::regclass)

  union all
  -- 5. Supabase's own storage RLS is untouched and ON -----------------------
  select 5,
         'storage.objects row level security is enabled',
         'true',
         (select relrowsecurity::text
            from pg_class where oid = 'storage.objects'::regclass)

  union all
  -- 6. The dashboard step: all 15 object policies present -------------------
  select 6,
         '15 Anvaya policies on storage.objects',
         '15',
         count(*)::text
    from pg_policies
   where schemaname = 'storage'
     and tablename  = 'objects'
     and policyname in ('report-originals_read','report-originals_insert','report-originals_delete',
                        'report-processed_read','report-processed_insert','report-processed_delete',
                        'report-exports_read',  'report-exports_insert',  'report-exports_delete',
                        'voice-audio_read',     'voice-audio_insert',     'voice-audio_delete',
                        'consent-evidence_read','consent-evidence_insert','consent-evidence_delete')

  union all
  -- 7. No Anvaya policy was ever written for the anon role ------------------
  select 7,
         '0 storage.objects policies granted to anon',
         '0',
         (select count(*)::text
            from pg_policies
           where schemaname = 'storage' and tablename = 'objects'
             and 'anon' = any (roles))

  union all
  -- 8. The shared predicate exists and is callable by the right roles -------
  select 8,
         'anvaya.may_access_patient_prefix(text) exists',
         'true',
         (select (count(*) > 0)::text
            from pg_proc p
            join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'anvaya' and p.proname = 'may_access_patient_prefix')

  union all
  select 9,
         'authenticated may EXECUTE the predicate',
         'true',
         has_function_privilege('authenticated',
                                to_regprocedure('anvaya.may_access_patient_prefix(text)'), 'EXECUTE')::text

  union all
  select 10,
         'anon may NOT execute the predicate',
         'false',
         has_function_privilege('anon',
                                to_regprocedure('anvaya.may_access_patient_prefix(text)'), 'EXECUTE')::text

  union all
  -- 9. None of the policies is a blanket allow -----------------------------
  --    (The SQL Editor role has BYPASSRLS, so counting storage.objects here
  --     would prove nothing. What does matter is that no policy we asked for
  --     was ever reduced to `true`.)
  select 11,
         'no Anvaya storage policy is a blanket true predicate',
         '0',
         (select count(*)::text
            from pg_policies
           where schemaname = 'storage' and tablename = 'objects'
             and (policyname like 'report-%' or policyname like 'voice-%'
                  or policyname like 'consent-%')
             and (qual = 'true' or with_check = 'true'))
)
select c.ord                                                        as "#",
       c.check,
       c.expected,
       c.actual,
       case when c.expected = c.actual then 'PASS' else 'FAIL' end  as result
  from checks c
 order by c.ord;

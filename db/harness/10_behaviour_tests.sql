-- ============================================================================
-- TEST HARNESS ONLY — behavioural tests for the Anvaya schema.
-- Runs with ON_ERROR_STOP=1: any failed assertion aborts the run and names the
-- test. Executed after the full migration set on a fresh database.
-- ============================================================================

\set ON_ERROR_STOP on
set client_min_messages = warning;

-- ---------------------------------------------------------------------------
-- Fixture data (written as the table owner, which bypasses RLS)
-- ---------------------------------------------------------------------------
insert into public.profiles (id, role, full_name, email) values
  ('11111111-1111-1111-1111-111111111111', 'patient', 'Rahul Singh',  'p1@example.test'),
  ('22222222-2222-2222-2222-222222222222', 'patient', 'Other Person', 'p2@example.test'),
  ('33333333-3333-3333-3333-333333333333', 'doctor',  'Dr Mehta',     'd1@example.test'),
  ('44444444-4444-4444-4444-444444444444', 'admin',   'Admin One',    'a1@example.test');

insert into public.patients (id, profile_id, full_name, date_of_birth, sex) values
  ('aaaaaaaa-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'Rahul Singh',  date '1984-03-02', 'male'),
  ('aaaaaaaa-0000-0000-0000-000000000002', '22222222-2222-2222-2222-222222222222', 'Other Person', date '1990-07-19', 'female');

insert into public.doctors (id, profile_id, full_name, registration_no, registration_body, verified) values
  ('bbbbbbbb-0000-0000-0000-000000000001', '33333333-3333-3333-3333-333333333333', 'Dr Mehta', 'MCI-12345', 'NMC', true);

insert into public.lab_reports (id, patient_id, legacy_code, status, collected_on, lab_name) values
  ('cccccccc-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'aug26', 'analysed', date '2026-08-20', 'City Diagnostics'),
  ('cccccccc-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000002', 'aug26b', 'analysed', date '2026-08-20', 'Other Lab');

-- ---------------------------------------------------------------------------
\echo 'TEST 01  classify_value: five-state deterministic classification'
do $$
declare v anvaya_test_status;
begin
  -- hemoglobin 12-16, no critical bounds, 10% borderline band
  if anvaya.classify_value(13.0, 12, 16, null, null, 0) <> 'normal'    then raise exception 'T01 normal failed'; end if;
  if anvaya.classify_value(10.5, 12, 16, null, null, 0) <> 'low'       then raise exception 'T01 low failed'; end if;
  if anvaya.classify_value(17.0, 12, 16, null, null, 0) <> 'high'      then raise exception 'T01 high failed'; end if;
  -- band = (16-12)*0.10 = 0.4  ->  11.6..12 is borderline, below 11.6 is low
  if anvaya.classify_value(11.8, 12, 16, null, null, 0.10) <> 'borderline' then raise exception 'T01 borderline low failed'; end if;
  if anvaya.classify_value(11.0, 12, 16, null, null, 0.10) <> 'low'         then raise exception 'T01 low past band failed'; end if;
  if anvaya.classify_value(16.2, 12, 16, null, null, 0.10) <> 'borderline' then raise exception 'T01 borderline high failed'; end if;
  -- critical bounds dominate
  if anvaya.classify_value(6.4, 3.5, 5.0, 2.5, 6.0, 0.10) <> 'critical' then raise exception 'T01 critical high failed'; end if;
  if anvaya.classify_value(2.1, 3.5, 5.0, 2.5, 6.0, 0.10) <> 'critical' then raise exception 'T01 critical low failed'; end if;
  if anvaya.classify_value(5.5, 3.5, 5.0, 2.5, 6.0, 0.10) <> 'high'     then raise exception 'T01 high inside critical failed'; end if;
  -- open-ended range (HbA1c: ref_high only, as seeded)
  if anvaya.classify_value(7.2, null, 5.7, null, null, 0.10) <> 'high'  then raise exception 'T01 open-ended high failed'; end if;
  if anvaya.classify_value(5.9, null, 5.7, null, null, 0.10) <> 'borderline' then raise exception 'T01 open-ended borderline failed'; end if;
  -- determinism: same inputs, same answer
  select into v anvaya.classify_value(10.5, 12, 16, null, null, 0);
  if v <> anvaya.classify_value(10.5, 12, 16, null, null, 0) then raise exception 'T01 not deterministic'; end if;
  if anvaya.classify_value(null, 12, 16, null, null, 0) is not null then raise exception 'T01 null value should be null'; end if;
end $$;

-- ---------------------------------------------------------------------------
\echo 'TEST 02  duplicate test results are rejected'
insert into public.test_results (report_id, lab_test_id, raw_name, value, unit, printed_ref_low, printed_ref_high, printed_ref_text)
select 'cccccccc-0000-0000-0000-000000000001', id, 'Hb', 10.5, 'g/dL', 12, 16, '12-16 g/dL'
from public.lab_test_catalog where code = 'hemoglobin';

do $$
begin
  begin
    insert into public.test_results (report_id, lab_test_id, raw_name, value, unit)
    select 'cccccccc-0000-0000-0000-000000000001', id, 'Haemoglobin', 11.0, 'g/dL'
    from public.lab_test_catalog where code = 'hemoglobin';
    raise exception 'T02 duplicate test result was accepted';
  exception when unique_violation then
    null; -- expected
  end;
end $$;

-- ---------------------------------------------------------------------------
-- Validation row for the hemoglobin result (written by the owner = pipeline)
-- ---------------------------------------------------------------------------
do $$
declare
  v_tr  uuid; v_rr uuid; v_rule uuid; v_st anvaya_test_status; v_vr uuid;
begin
  select id into v_tr from public.test_results where report_id = 'cccccccc-0000-0000-0000-000000000001';
  select rr.id into v_rr from public.reference_ranges rr
    join public.lab_test_catalog c on c.id = rr.lab_test_id
   where c.code = 'hemoglobin' and rr.is_active limit 1;
  select id into v_rule from public.clinical_rules where rule_key = 'range_threshold' and is_active limit 1;

  v_st := anvaya.classify_value(10.5, 12, 16, null, null, 0.10);
  if v_st <> 'low' then raise exception 'T02b expected low, got %', v_st; end if;

  insert into public.validation_results
    (test_result_id, validation_seq, rule_id, rule_version, engine_version,
     effective_value, unit, range_origin, reference_range_id, ref_low, ref_high,
     borderline_frac, inputs_hash, computed_status, is_critical, is_abnormal, rationale)
  values
    (v_tr, 1, v_rule, '1.0.0', 'anvaya-validator-1.0.0',
     10.5, 'g/dL', 'lab_printed', v_rr, 12, 16,
     0.10, encode(sha256('range_threshold|1.0.0|10.5|g/dL|12|16'::bytea), 'hex'),
     v_st, false, true, '10.5 < ref_low 12 (band 0.4) -> low')
  returning id into v_vr;

  update public.test_results set current_validation_id = v_vr where id = v_tr;
end $$;

-- ---------------------------------------------------------------------------
-- Review fixture, created by the owner before we drop privileges.
insert into public.report_versions (id, report_id, version_no, origin, created_by)
values ('dddddddd-0000-0000-0000-000000000001', 'cccccccc-0000-0000-0000-000000000001', 1, 'ai_draft',
        '33333333-3333-3333-3333-333333333333');

insert into public.doctor_reviews (id, report_id, report_version_id, doctor_id, status)
values ('eeeeeeee-0000-0000-0000-000000000001', 'cccccccc-0000-0000-0000-000000000001',
        'dddddddd-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000001', 'draft');

\echo 'TEST 03  RLS: a patient sees only their own report'
truncate auth._session;
insert into auth._session values ('11111111-1111-1111-1111-111111111111', 'authenticated');
set role authenticated;

do $$
declare n int; begin
  select count(*) into n from public.lab_reports;
  if n <> 1 then raise exception 'T03 patient saw % reports, expected 1', n; end if;
  select count(*) into n from public.lab_reports where id = 'cccccccc-0000-0000-0000-000000000001';
  if n <> 1 then raise exception 'T03 patient cannot see their own report'; end if;
  select count(*) into n from public.lab_reports where id = 'cccccccc-0000-0000-0000-000000000002';
  if n <> 0 then raise exception 'T03 patient can see another patient''s report'; end if;
  select count(*) into n from public.test_results;
  if n <> 1 then raise exception 'T03 patient saw % test_results, expected 1', n; end if;
  select count(*) into n from public.patients;
  if n <> 1 then raise exception 'T03 patient saw % patients, expected 1', n; end if;
end $$;

-- ---------------------------------------------------------------------------
\echo 'TEST 04  patient cannot modify deterministic validation results (grant layer)'
do $$
begin
  -- Layer 1: the patient holds no UPDATE grant on validation_results at all.
  begin
    update public.validation_results set computed_status = 'normal';
    raise exception 'T04-FAIL patient updated validation_results';
  exception when insufficient_privilege then
    null; -- expected
  end;

  -- Layer 2: no INSERT policy and no INSERT grant.
  begin
    insert into public.validation_results
      (test_result_id, validation_seq, rule_id, rule_version, engine_version,
       effective_value, unit, range_origin, ref_low, ref_high, inputs_hash, computed_status)
    values ((select id from public.test_results limit 1), 99,
            (select id from public.clinical_rules limit 1), 'x', 'x', 99, 'g/dL', 'lab_printed', 12, 16, 'x', 'normal');
    raise exception 'T04-FAIL patient inserted a validation row';
  exception when insufficient_privilege then
    null; -- expected
  end;
end $$;

-- ---------------------------------------------------------------------------
\echo 'TEST 05  RLS: patient cannot approve or release their own report'
do $$
begin
  -- The patient is signed in (auth._session = patient 1). They must not be able
  -- to drive a review that belongs to a clinician.
  begin
    perform anvaya.set_review_status('eeeeeeee-0000-0000-0000-000000000001', 'approved', null);
    raise exception 'T05-FAIL patient approved their own report';
  exception when others then
    if sqlerrm like '%T05-FAIL%' then raise; end if;
    if sqlerrm not like '%only the assigned doctor%' then
      raise exception 'T05 unexpected error: %', sqlerrm;
    end if;
  end;

  begin
    perform anvaya.release_report('cccccccc-0000-0000-0000-000000000001',
                                  'dddddddd-0000-0000-0000-000000000001');
    raise exception 'T05-FAIL patient released their own report';
  exception when others then
    if sqlerrm like '%T05-FAIL%' then raise; end if;
    if sqlerrm not like '%no approved review%' and sqlerrm not like '%only the approving clinician%' then
      raise exception 'T05 unexpected error: %', sqlerrm;
    end if;
  end;

  -- and the review must still be sitting in draft, untouched
  if (select status::text from public.doctor_reviews
       where id = 'eeeeeeee-0000-0000-0000-000000000001') <> 'draft' then
    raise exception 'T05-FAIL review status changed despite the refusal';
  end if;
end $$;

-- ---------------------------------------------------------------------------
\echo 'TEST 06  RLS: patient cannot flip report status or reassign ownership'
do $$
declare n int; begin
  begin
    update public.lab_reports set status = 'released' where id = 'cccccccc-0000-0000-0000-000000000001';
    raise exception 'T06 patient changed report status';
  exception when others then
    if sqlerrm like '%T06%' then raise; end if;
  end;
  begin
    update public.lab_reports set patient_id = 'aaaaaaaa-0000-0000-0000-000000000002'
     where id = 'cccccccc-0000-0000-0000-000000000001';
    raise exception 'T06 patient reassigned their report';
  exception when others then
    if sqlerrm like '%T06%' then raise; end if;
  end;
  begin
    update public.lab_reports set deleted_at = now() where id = 'cccccccc-0000-0000-0000-000000000001';
    raise exception 'T06 patient soft-deleted outside the erasure function';
  exception when others then
    if sqlerrm like '%T06%' then raise; end if;
  end;
end $$;

-- ---------------------------------------------------------------------------
\echo 'TEST 07  RLS: patient cannot escalate their own role'
do $$
begin
  begin
    update public.profiles set role = 'admin' where id = '11111111-1111-1111-1111-111111111111';
    raise exception 'T07 patient escalated their own role';
  exception when others then
    if sqlerrm like '%T07%' then raise; end if;
  end;
end $$;

-- ---------------------------------------------------------------------------
\echo 'TEST 08  RLS: patient cannot read the audit trail or other patients'' data'
do $$
declare n int; begin
  select count(*) into n from public.audit_logs;
  if n <> 0 then raise exception 'T08 patient can read audit_logs (% rows)', n; end if;
  select count(*) into n from public.system_errors;
  if n <> 0 then raise exception 'T08 patient can read system_errors'; end if;
end $$;

reset role;

-- ---------------------------------------------------------------------------
\echo 'TEST 04b even WITH an UPDATE grant, RLS still blocks the patient (0 rows)'
grant update on public.validation_results to authenticated;
set role authenticated;
do $$
declare n int;
begin
  update public.validation_results set computed_status = 'normal';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'T04b-FAIL RLS let the patient update % validation rows', n; end if;
end $$;
reset role;
revoke update on public.validation_results from authenticated;

-- Confirm the layer is back in place and that the verdict is unchanged.
do $$
begin
  if (select computed_status::text from public.validation_results limit 1) <> 'low' then
    raise exception 'T04b-FAIL the stored verdict changed';
  end if;
  if has_table_privilege('authenticated', 'public.validation_results', 'UPDATE') then
    raise exception 'T04b-FAIL the UPDATE grant was not revoked';
  end if;
end $$;

-- ---------------------------------------------------------------------------
\echo 'TEST 09  RLS: a doctor without a grant sees nothing; with a grant, sees the report'
truncate auth._session;
insert into auth._session values ('33333333-3333-3333-3333-333333333333', 'authenticated');
set role authenticated;

do $$
declare n int; begin
  select count(*) into n from public.lab_reports;
  if n <> 0 then raise exception 'T09 unauthorised doctor saw % reports', n; end if;
  select count(*) into n from public.patients;
  if n <> 0 then raise exception 'T09 unauthorised doctor saw % patients', n; end if;
end $$;

reset role;
insert into public.doctor_patient_access (doctor_id, patient_id, status, granted_by, reason)
values ('bbbbbbbb-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'active',
        '44444444-4444-4444-4444-444444444444', 'Follow-up review');

set role authenticated;
do $$
declare n int; begin
  select count(*) into n from public.lab_reports;
  if n <> 1 then raise exception 'T09 authorised doctor saw % reports, expected 1', n; end if;
  select count(*) into n from public.lab_reports where id = 'cccccccc-0000-0000-0000-000000000002';
  if n <> 0 then raise exception 'T09 doctor can still see an ungranted patient'; end if;
  select count(*) into n from public.test_results;
  if n <> 1 then raise exception 'T09 doctor saw % test_results, expected 1', n; end if;
end $$;

-- ---------------------------------------------------------------------------
\echo 'TEST 10  A doctor cannot overwrite a deterministic validation either'
do $$
begin
  begin
    update public.validation_results set computed_status = 'normal';
    raise exception 'T10-FAIL doctor updated validation_results';
  exception when insufficient_privilege then
    null; -- expected: clinicians hold SELECT only on validation_results
  end;
  begin
    delete from public.validation_results;
    raise exception 'T10-FAIL doctor deleted validation_results';
  exception when insufficient_privilege then
    null;
  end;
end $$;

reset role;

-- ---------------------------------------------------------------------------
\echo 'TEST 11  validation_results is immutable even for the table owner'
do $$
begin
  begin
    update public.validation_results set computed_status = 'normal';
    raise exception 'T11 validation_results was updated';
  exception when others then
    if sqlerrm like '%T11%' then raise; end if;
    if sqlerrm not like '%append-only%' then raise; end if;
  end;
  begin
    delete from public.validation_results;
    raise exception 'T11 validation_results was deleted';
  exception when others then
    if sqlerrm like '%T11%' then raise; end if;
    if sqlerrm not like '%append-only%' then raise; end if;
  end;
end $$;

-- ---------------------------------------------------------------------------
\echo 'TEST 12  review workflow: illegal transitions refused, legal ones accepted'
truncate auth._session;
insert into auth._session values ('33333333-3333-3333-3333-333333333333', 'authenticated');
set role authenticated;

do $$
declare s anvaya_review_status;
begin
  -- draft -> approved is not a legal transition (must pass through pending_review)
  begin
    perform anvaya.set_review_status('eeeeeeee-0000-0000-0000-000000000001', 'approved', null);
    raise exception 'T12 draft -> approved was allowed';
  exception when others then
    if sqlerrm like '%T12%' then raise; end if;
    if sqlerrm not like '%illegal review transition%' then raise; end if;
  end;

  perform anvaya.set_review_status('eeeeeeee-0000-0000-0000-000000000001', 'pending_review', null);
  select status into s from public.doctor_reviews where id = 'eeeeeeee-0000-0000-0000-000000000001';
  if s <> 'pending_review' then raise exception 'T12 expected pending_review, got %', s; end if;

  -- needs_edit requires a reason
  begin
    perform anvaya.set_review_status('eeeeeeee-0000-0000-0000-000000000001', 'needs_edit', null);
    raise exception 'T12 needs_edit accepted without a reason';
  exception when others then
    if sqlerrm like '%T12%' then raise; end if;
    if sqlerrm not like '%requires a reason%' then raise; end if;
  end;

  perform anvaya.set_review_status('eeeeeeee-0000-0000-0000-000000000001', 'approved', 'Reviewed');
  select status, signed_at is not null into s from public.doctor_reviews where id = 'eeeeeeee-0000-0000-0000-000000000001';
  if s <> 'approved' then raise exception 'T12 expected approved, got %', s; end if;
end $$;

-- ---------------------------------------------------------------------------
\echo 'TEST 13  release: blocked without approval, succeeds with it, single active release'
do $$
declare v_rel uuid; n int; v_status text;
begin
  perform anvaya.release_report('cccccccc-0000-0000-0000-000000000001',
                                'dddddddd-0000-0000-0000-000000000001');
  select id into v_rel from public.report_releases where is_active;
  if v_rel is null then raise exception 'T13-FAIL no active release created'; end if;
  select count(*) into n from public.report_releases where is_active;
  if n <> 1 then raise exception 'T13-FAIL % active releases, expected 1', n; end if;
  select status::text into v_status from public.lab_reports where id = 'cccccccc-0000-0000-0000-000000000001';
  if v_status <> 'released' then raise exception 'T13-FAIL report status is %, expected released', v_status; end if;
  if (select status::text from public.doctor_reviews where id = 'eeeeeeee-0000-0000-0000-000000000001') <> 'released' then
    raise exception 'T13-FAIL review not marked released';
  end if;
end $$;

reset role;

\echo 'TEST 13b release of an unapproved version is refused'
-- Note: the doctor_edit version deliberately supplies edited_by, because
-- rv_doctor_edits_have_author rejects an attributed edit with no author.
insert into public.report_versions (id, report_id, version_no, origin, edited_by, created_by, change_summary)
values ('dddddddd-0000-0000-0000-000000000002', 'cccccccc-0000-0000-0000-000000000001', 2, 'doctor_edit',
        '33333333-3333-3333-3333-333333333333', '33333333-3333-3333-3333-333333333333',
        'Clinician tightened the wording of the HbA1c paragraph');

\echo 'TEST 13c a doctor_edit version with no author is rejected'
do $$
begin
  begin
    insert into public.report_versions (report_id, version_no, origin)
    values ('cccccccc-0000-0000-0000-000000000001', 3, 'doctor_edit');
    raise exception 'T13c-FAIL anonymous doctor edit accepted';
  exception when check_violation then
    null; -- expected
  end;
end $$;

do $$
begin
  begin
    perform anvaya.release_report('cccccccc-0000-0000-0000-000000000001',
                                  'dddddddd-0000-0000-0000-000000000002');
    raise exception 'T13b-FAIL released an unapproved version';
  exception when others then
    if sqlerrm like '%T13b-FAIL%' then raise; end if;
    if sqlerrm not like '%no approved review%' then raise; end if;
  end;
end $$;

\echo 'TEST 13d the AI draft version still exists after a doctor edit'
do $$
begin
  if not exists (select 1 from public.report_versions
                  where id = 'dddddddd-0000-0000-0000-000000000001' and origin = 'ai_draft') then
    raise exception 'T13d-FAIL the original AI draft was destroyed by a doctor edit';
  end if;
  if (select count(*) from public.report_versions
       where report_id = 'cccccccc-0000-0000-0000-000000000001') < 2 then
    raise exception 'T13d-FAIL version history was not preserved';
  end if;
end $$;

-- ---------------------------------------------------------------------------
\echo 'TEST 14  consent: latest decision wins (grant -> withdraw -> re-grant)'
do $$
declare pol uuid; p uuid := 'aaaaaaaa-0000-0000-0000-000000000001';
begin
  select id into pol from public.consent_policies where purpose = 'ai_explanation' limit 1;

  if anvaya.has_active_consent(p, 'ai_explanation') then
    raise exception 'T14 consent present before any grant';
  end if;

  insert into public.patient_consents (patient_id, policy_id, purpose, status, channel, granted_at)
  values (p, pol, 'ai_explanation', 'granted', 'in_app', now() - interval '3 hours');
  if not anvaya.has_active_consent(p, 'ai_explanation') then raise exception 'T14 grant not honoured'; end if;

  insert into public.patient_consents (patient_id, policy_id, purpose, status, channel, granted_at, revoked_at, revocation_reason)
  values (p, pol, 'ai_explanation', 'withdrawn', 'in_app', now() - interval '2 hours', now() - interval '2 hours', 'Patient opted out');
  if anvaya.has_active_consent(p, 'ai_explanation') then raise exception 'T14 withdrawal not honoured'; end if;

  insert into public.patient_consents (patient_id, policy_id, purpose, status, channel, granted_at)
  values (p, pol, 'ai_explanation', 'granted', 'in_app', now() - interval '1 hour');
  if not anvaya.has_active_consent(p, 'ai_explanation') then raise exception 'T14 re-consent not honoured'; end if;

  -- the original grant row must still exist: history was not rewritten
  if (select count(*) from public.patient_consents where patient_id = p and purpose = 'ai_explanation') <> 3 then
    raise exception 'T14 consent history was not append-only';
  end if;
end $$;

\echo 'TEST 14b consent rows are immutable'
do $$
begin
  begin
    update public.patient_consents set status = 'withdrawn';
    raise exception 'T14b consent row was updated';
  exception when others then
    if sqlerrm like '%T14b%' then raise; end if;
    if sqlerrm not like '%append-only%' then raise; end if;
  end;
end $$;

-- ---------------------------------------------------------------------------
\echo 'TEST 15  reference range versioning: a past verdict survives a range change'
do $$
declare v_before anvaya_test_status; v_after anvaya_test_status; v_rr uuid;
begin
  select computed_status into v_before from public.validation_results limit 1;

  -- the catalogue moves: hemoglobin lower bound becomes 10.0
  select rr.id into v_rr from public.reference_ranges rr
    join public.lab_test_catalog c on c.id = rr.lab_test_id
   where c.code = 'hemoglobin' limit 1;
  update public.reference_ranges set ref_low = 10.0, effective_to = date '2026-08-25' where id = v_rr;
  insert into public.reference_ranges
    (lab_test_id, source_id, unit, ref_low, ref_high, borderline_frac, applicable_sex, population, version, effective_from)
  select lab_test_id, source_id, unit, 10.0, 16.0, 0.10, 'any', 'adult', '2.0.0', date '2026-08-25'
  from public.reference_ranges where id = v_rr;

  select computed_status into v_after from public.validation_results limit 1;
  if v_before <> v_after then
    raise exception 'T15 historical verdict changed from % to % after a range update', v_before, v_after;
  end if;
  if (select ref_low from public.validation_results limit 1) <> 12 then
    raise exception 'T15 snapshotted ref_low was rewritten';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Switch the session to patient 1 so the user-initiated privileged functions
-- authorise against the right identity.
truncate auth._session;
insert into auth._session values ('11111111-1111-1111-1111-111111111111', 'authenticated');

\echo 'TEST 16  test_results provenance is immutable; corrections go via the function'
do $$
declare v_tr uuid;
begin
  select id into v_tr from public.test_results limit 1;

  begin
    update public.test_results set raw_value_text = '99.9' where id = v_tr;
    raise exception 'T16 raw_value_text was rewritten';
  exception when others then
    if sqlerrm like '%T16%' then raise; end if;
    if sqlerrm not like '%immutable%' then raise; end if;
  end;

  perform anvaya.submit_value_correction(v_tr, 11.2, 'Patient re-read the report', false);

  if (select corrected_value from public.test_results where id = v_tr) <> 11.2 then
    raise exception 'T16 correction not recorded';
  end if;
  if (select original_value from public.test_results where id = v_tr) is not null
     and (select original_value from public.test_results where id = v_tr) <> 10.5 then
    raise exception 'T16 original_value was overwritten';
  end if;
  if (select value_source::text from public.test_results where id = v_tr) <> 'patient_correction' then
    raise exception 'T16 value_source not set';
  end if;
  -- the stored verdict must NOT have changed: re-validation is a separate act
  if (select computed_status::text from public.validation_results where test_result_id = v_tr and validation_seq = 1) <> 'low' then
    raise exception 'T16 a correction silently changed the deterministic status';
  end if;
end $$;

-- ---------------------------------------------------------------------------
\echo 'TEST 17  audit trail exists, is hash-chained, and is append-only'
do $$
declare n int; bad int;
begin
  select count(*) into n from public.audit_logs;
  if n < 3 then raise exception 'T17 expected several audit rows, got %', n; end if;

  with x as (select id, prev_hash, row_hash, lag(row_hash) over (order by id) as calc_prev from public.audit_logs)
  select count(*) into bad from x where prev_hash is distinct from calc_prev;
  if bad <> 0 then raise exception 'T17 % audit rows have a broken hash chain', bad; end if;

  if (select count(*) from public.audit_logs where row_hash is null or row_hash = '') <> 0 then
    raise exception 'T17 an audit row is unsealed';
  end if;

  begin
    delete from public.audit_logs;
    raise exception 'T17 audit row was deleted';
  exception when others then
    if sqlerrm like '%T17%' then raise; end if;
    if sqlerrm not like '%append-only%' then raise; end if;
  end;

  begin
    update public.audit_logs set action = 'report.created';
    raise exception 'T17 audit row was edited';
  exception when others then
    if sqlerrm like '%T17%' then raise; end if;
    if sqlerrm not like '%immutable%' then raise; end if;
  end;
end $$;

-- ---------------------------------------------------------------------------
\echo 'TEST 18  derived views: attention_count is computed, not stored'
do $$
declare n int;
begin
  select attention_count into n from public.v_report_summary
   where id = 'cccccccc-0000-0000-0000-000000000001';
  if n <> 1 then raise exception 'T18 attention_count = %, expected 1 (hemoglobin low)', n; end if;
  if (select is_released from public.v_report_summary where id = 'cccccccc-0000-0000-0000-000000000001') is not true then
    raise exception 'T18 released report not flagged';
  end if;
  if (select count(*) from public.v_test_history where test_code = 'hemoglobin') <> 1 then
    raise exception 'T18 trend view missing the measurement';
  end if;
  if (select effective_value from public.v_test_history where test_code = 'hemoglobin') <> 11.2 then
    raise exception 'T18 trend view not using the corrected value';
  end if;
end $$;

-- ---------------------------------------------------------------------------
\echo 'TEST 19  storage: buckets are private and objects are prefix-scoped'
do $$
declare n int;
begin
  select count(*) into n from storage.buckets where public;
  if n <> 0 then raise exception 'T19 % buckets are public', n; end if;
  if (select count(*) from storage.buckets) <> 5 then raise exception 'T19 expected 5 buckets'; end if;
end $$;

insert into storage.objects (bucket_id, name, owner) values
  ('report-originals', 'aaaaaaaa-0000-0000-0000-000000000001/cccccccc-0000-0000-0000-000000000001/original-1.jpg',
   '11111111-1111-1111-1111-111111111111'),
  ('report-originals', 'aaaaaaaa-0000-0000-0000-000000000002/cccccccc-0000-0000-0000-000000000002/original-1.jpg',
   '22222222-2222-2222-2222-222222222222');

truncate auth._session;
insert into auth._session values ('11111111-1111-1111-1111-111111111111', 'authenticated');
set role authenticated;
do $$
declare n int; begin
  select count(*) into n from storage.objects where bucket_id = 'report-originals';
  if n <> 1 then raise exception 'T19 patient saw % storage objects, expected 1', n; end if;
end $$;
reset role;

-- ---------------------------------------------------------------------------
\echo 'TEST 20  anon sees nothing at all'
truncate auth._session;
insert into auth._session values (null, 'anon');
set role anon;
do $$
declare n int;
begin
  begin
    select count(*) into n from public.lab_reports;
    raise exception 'T20-FAIL anon could query lab_reports (% rows)', n;
  exception when insufficient_privilege then
    null; -- expected: anon holds no SELECT grant on clinical tables
  end;
  begin
    select count(*) into n from public.rag_sources;
    raise exception 'T20-FAIL anon could query rag_sources (% rows)', n;
  exception when insufficient_privilege then
    null; -- expected: even the non-PHI catalogue requires a session
  end;
  begin
    select count(*) into n from public.profiles;
    raise exception 'T20-FAIL anon could query profiles (% rows)', n;
  exception when insufficient_privilege then
    null;
  end;
end $$;
reset role;

-- ---------------------------------------------------------------------------
\echo 'TEST 21  ai_generations invariants hold'
do $$
declare g uuid;
begin
  -- a succeeded generation without finished_at must be refused
  begin
    insert into public.ai_generations (purpose, status, raw_output)
    values ('test_explanation', 'succeeded', 'x');
    raise exception 'T21-FAIL succeeded generation accepted without finished_at';
  exception when check_violation then
    null; -- expected
  end;

  -- a failed generation must say why
  begin
    insert into public.ai_generations (purpose, status, finished_at)
    values ('test_explanation', 'failed', now());
    raise exception 'T21-FAIL failed generation accepted without an error message';
  exception when check_violation then
    null; -- expected
  end;

  -- a well-formed one is accepted
  insert into public.ai_generations
    (purpose, status, provider, model, model_version, prompt_key, prompt_version,
     raw_output, finished_at, model_confidence, retrieval_similarity, trust_score,
     trust_level, trust_formula)
  values
    ('test_explanation', 'succeeded', 'local-llm', 'anvaya-7b', '2026-06-01',
     'test_explanation', 'v3', 'Your hemoglobin is low...', now(), 0.91, 0.84, 0.88,
     'high', '0.6*model + 0.4*retrieval')
  returning id into g;
  if g is null then raise exception 'T21-FAIL generation not inserted'; end if;

  -- and it is immutable thereafter
  begin
    update public.ai_generations set raw_output = 'tampered' where id = g;
    raise exception 'T21-FAIL ai_generations was updated';
  exception when others then
    if sqlerrm like '%T21-FAIL%' then raise; end if;
    if sqlerrm not like '%append-only%' then raise; end if;
  end;
end $$;

\echo 'TEST 21b an explanation must have exactly one subject'
do $$
declare g uuid; tr uuid;
begin
  select id into g  from public.ai_generations limit 1;
  select id into tr from public.test_results  limit 1;

  begin
    insert into public.ai_explanations (generation_id, language, reading_level, body_md)
    values (g, 'en', 'standard', 'no subject at all');
    raise exception 'T21b-FAIL explanation accepted with no subject';
  exception when check_violation then
    null; -- expected
  end;

  begin
    insert into public.ai_explanations
      (generation_id, subject_test_result_id, subject_report_id, language, reading_level, body_md)
    values (g, tr, 'cccccccc-0000-0000-0000-000000000001', 'en', 'standard', 'two subjects');
    raise exception 'T21b-FAIL explanation accepted with two subjects';
  exception when check_violation then
    null; -- expected
  end;

  insert into public.ai_explanations
    (generation_id, subject_test_result_id, language, reading_level, body_md, body_plain)
  values (g, tr, 'en', 'standard', '**Your hemoglobin is low.**', 'Your hemoglobin is low.');
end $$;

-- ---------------------------------------------------------------------------
truncate auth._session;
insert into auth._session values ('11111111-1111-1111-1111-111111111111', 'authenticated');

\echo 'TEST 22  hard delete: clinical rows destroyed, audit survives'
do $$
declare n_audit_before int; n_audit_after int; n int;
begin
  select count(*) into n_audit_before from public.audit_logs;

  perform anvaya.hard_delete_report('cccccccc-0000-0000-0000-000000000001', 'Patient request');

  select count(*) into n from public.lab_reports  where id = 'cccccccc-0000-0000-0000-000000000001';
  if n <> 0 then raise exception 'T22 report still present'; end if;
  select count(*) into n from public.test_results where report_id = 'cccccccc-0000-0000-0000-000000000001';
  if n <> 0 then raise exception 'T22 test_results still present'; end if;
  select count(*) into n from public.validation_results;
  if n <> 0 then raise exception 'T22 validation_results still present'; end if;
  select count(*) into n from public.report_releases where report_id = 'cccccccc-0000-0000-0000-000000000001';
  if n <> 0 then raise exception 'T22 releases still present'; end if;
  select count(*) into n from storage.objects where name like 'aaaaaaaa-0000-0000-0000-000000000001/%';
  if n <> 0 then raise exception 'T22 storage object survived erasure'; end if;

  select count(*) into n_audit_after from public.audit_logs;
  if n_audit_after <= n_audit_before then raise exception 'T22 erasure was not audited'; end if;
  if not exists (select 1 from public.audit_logs where action = 'report.deleted') then
    raise exception 'T22 no report.deleted audit entry';
  end if;
  -- the OTHER patient's storage object must be untouched
  select count(*) into n from storage.objects where name like 'aaaaaaaa-0000-0000-0000-000000000002/%';
  if n <> 1 then raise exception 'T22 erasure touched another patient''s files'; end if;
end $$;

-- ---------------------------------------------------------------------------
\echo 'TEST 23  deleting a patient cannot cascade away medical records'
do $$
begin
  insert into public.lab_reports (id, patient_id, legacy_code, collected_on)
  values ('cccccccc-0000-0000-0000-000000000003', 'aaaaaaaa-0000-0000-0000-000000000001', 'sep26', date '2026-08-21');
  begin
    delete from public.patients where id = 'aaaaaaaa-0000-0000-0000-000000000001';
    raise exception 'T23-FAIL patient delete cascaded over medical records';
  exception when foreign_key_violation then
    null; -- expected: RESTRICT on lab_reports and patient_consents
  end;
  if (select count(*) from public.lab_reports
       where patient_id = 'aaaaaaaa-0000-0000-0000-000000000001') <> 1 then
    raise exception 'T23-FAIL a report was lost';
  end if;
end $$;

\echo 'TEST 24  account erasure: data destroyed, audit de-linked but preserved'
do $$
declare n int; n_audit int;
begin
  select count(*) into n_audit from public.audit_logs;
  if n_audit = 0 then raise exception 'T24-FAIL no audit history to preserve'; end if;

  perform anvaya.hard_delete_patient('aaaaaaaa-0000-0000-0000-000000000001', 'Right to erasure');

  select count(*) into n from public.patients where id = 'aaaaaaaa-0000-0000-0000-000000000001';
  if n <> 0 then raise exception 'T24-FAIL patient row survived'; end if;
  select count(*) into n from public.lab_reports where patient_id = 'aaaaaaaa-0000-0000-0000-000000000001';
  if n <> 0 then raise exception 'T24-FAIL reports survived'; end if;
  select count(*) into n from public.patient_consents where patient_id = 'aaaaaaaa-0000-0000-0000-000000000001';
  if n <> 0 then raise exception 'T24-FAIL consents survived'; end if;
  select count(*) into n from public.voice_sessions where patient_id = 'aaaaaaaa-0000-0000-0000-000000000001';
  if n <> 0 then raise exception 'T24-FAIL voice sessions survived'; end if;

  -- the audit trail must still exist, but must no longer point at the person
  select count(*) into n from public.audit_logs;
  if n < n_audit then raise exception 'T24-FAIL audit rows were deleted (% -> %)', n_audit, n; end if;
  select count(*) into n from public.audit_logs where patient_id = 'aaaaaaaa-0000-0000-0000-000000000001';
  if n <> 0 then raise exception 'T24-FAIL % audit rows still identify the erased patient', n; end if;
  if not exists (select 1 from public.audit_logs where action = 'deletion.completed') then
    raise exception 'T24-FAIL no record that the erasure happened';
  end if;

  -- the OTHER patient must be untouched
  select count(*) into n from public.patients where id = 'aaaaaaaa-0000-0000-0000-000000000002';
  if n <> 1 then raise exception 'T24-FAIL erasure touched another patient'; end if;
  select count(*) into n from storage.objects where name like 'aaaaaaaa-0000-0000-0000-000000000002/%';
  if n <> 1 then raise exception 'T24-FAIL erasure touched another patient''s files'; end if;
end $$;

\echo 'TEST 25  audit hash chain still verifies after erasure'
do $$
declare bad int;
begin
  with x as (select id, prev_hash, row_hash, lag(row_hash) over (order by id) as calc_prev from public.audit_logs)
  select count(*) into bad from x where prev_hash is distinct from calc_prev;
  if bad <> 0 then raise exception 'T25-FAIL % audit rows have a broken chain after erasure', bad; end if;
end $$;

\echo ''
\echo 'ALL BEHAVIOUR TESTS PASSED'

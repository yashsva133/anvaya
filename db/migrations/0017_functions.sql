-- ============================================================================
-- Anvaya / RxAnvaya — Supabase migration 0017
-- Privileged functions: identity helpers, audit writer, corrections,
-- review transitions, release, erasure
-- ----------------------------------------------------------------------------
-- Purpose   : Put every state transition that must not be client-controlled
--             behind a SECURITY DEFINER function in the non-exposed `anvaya`
--             schema. The browser gets no direct write policy on any of these
--             tables; it calls a function, and the function enforces the rule
--             and writes the audit row in the same transaction.
-- Depends on: 0003-0016 (all tables)
-- Fresh safe: YES
--
-- SECURITY MODEL
--   * SECURITY DEFINER functions run as the table owner, so they can write
--     despite RLS. That is exactly why they must contain the authorisation
--     check themselves — every function below does.
--   * `set search_path` is pinned on every one of them. Without it a
--     SECURITY DEFINER function is vulnerable to search_path hijacking.
--   * None of these are added to pgrst.db_schemas, so PostgREST will not expose
--     them as RPC endpoints. The Next.js server (service role or a thin API
--     route) invokes them; the browser cannot.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Identity helpers
-- ---------------------------------------------------------------------------
create or replace function anvaya.current_role()
returns anvaya_role
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select role from public.profiles where id = auth.uid();
$$;

comment on function anvaya.current_role() is
  'Role of the signed-in user. SECURITY DEFINER so an RLS policy can read profiles without needing a recursive policy on profiles itself.';

create or replace function anvaya.current_patient_id()
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select id from public.patients where profile_id = auth.uid();
$$;

create or replace function anvaya.current_doctor_id()
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select id from public.doctors where profile_id = auth.uid();
$$;

create or replace function anvaya.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce((select role = 'admin' from public.profiles where id = auth.uid()), false);
$$;

create or replace function anvaya.is_service_role()
returns boolean
language sql
stable
as $$
  select coalesce(auth.role(), '') = 'service_role';
$$;

create or replace function anvaya.is_privileged()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select anvaya.is_service_role() or anvaya.is_admin();
$$;

comment on function anvaya.is_privileged() is
  'True for the backend service role and for admins. Used by the column guards that stop a browser session from moving a report through its lifecycle by hand.';

create or replace function anvaya.is_definer_context(p_relid oid)
returns boolean
language sql
stable
as $$
  select current_user = (
    select r.rolname
    from pg_class c
    join pg_roles r on r.oid = c.relowner
    where c.oid = p_relid
  );
$$;

comment on function anvaya.is_definer_context(oid) is
  'True when the statement is executing inside a SECURITY DEFINER function owned by the table owner (so current_user has become the owner), rather than as a direct client write. A client session is `authenticated` or `anon` and can never be the table owner, so this cannot be spoofed from the browser. Lets the sanctioned functions in this file update guarded columns while the column guards still refuse direct client writes.';

create or replace function anvaya.has_active_grant(p_doctor uuid, p_patient uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.doctor_patient_access a
    where a.doctor_id  = p_doctor
      and a.patient_id = p_patient
      and a.status     = 'active'
      and (a.expires_at is null or a.expires_at > now())
  );
$$;

comment on function anvaya.has_active_grant(uuid, uuid) is
  'The single predicate behind every doctor-facing policy: an unexpired, unrevoked grant must exist.';

create or replace function anvaya.can_access_report(p_report uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.lab_reports r
    join public.patients   p  on p.id = r.patient_id
    left join public.profiles pf on pf.id = p.profile_id
    where r.id = p_report
      and r.deleted_at is null
      and (
            pf.id = auth.uid()                                        -- owning patient
         or anvaya.is_admin()                                         -- administrator
         or exists (                                                  -- authorised clinician
              select 1
              from public.doctors d
              where d.profile_id = auth.uid()
                and anvaya.has_active_grant(d.id, p.id)
            )
      )
  );
$$;

comment on function anvaya.can_access_report(uuid) is
  'Owner, authorised reviewer, or admin — and never for a soft-deleted report. Used by the RLS policies in 0018.';

create or replace function anvaya.report_patient(p_report uuid)
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select patient_id from public.lab_reports where id = p_report;
$$;

create or replace function anvaya.test_result_report(p_test_result uuid)
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select report_id from public.test_results where id = p_test_result;
$$;

create or replace function anvaya.has_active_consent(p_patient uuid, p_purpose anvaya_consent_purpose)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  -- Append-only semantics: the MOST RECENT decision for this purpose is the one
  -- in force. A withdrawal is a newer row with status 'withdrawn', so it
  -- supersedes the earlier grant without anyone having to edit history.
  select exists (
    select 1
    from (
      select c.status, c.expires_at
      from public.patient_consents c
      where c.patient_id = p_patient
        and c.purpose    = p_purpose
      order by c.granted_at desc, c.id desc
      limit 1
    ) latest
    where latest.status = 'granted'
      and (latest.expires_at is null or latest.expires_at > now())
  );
$$;

comment on function anvaya.has_active_consent(uuid, anvaya_consent_purpose) is
  'Consent gate for the pipeline. The processing worker MUST call this before any stage that touches the model; a report whose patient has withdrawn ai_explanation consent is not eligible for generation.';

-- ---------------------------------------------------------------------------
-- Audit writer
-- ---------------------------------------------------------------------------
create or replace function anvaya.write_audit(
  p_action      text,
  p_entity_type text,
  p_entity_id   text   default null,
  p_patient_id  uuid   default null,
  p_report_id   uuid   default null,
  p_outcome     text   default 'success',
  p_metadata    jsonb  default '{}'::jsonb
)
returns bigint
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id   bigint;
  v_ip   inet;
  v_ua   text;
begin
  begin
    v_ip := public.inet_client_addr();
  exception when others then
    v_ip := null;
  end;

  begin
    v_ua := nullif(current_setting('request.headers', true), '')::jsonb ->> 'user-agent';
  exception when others then
    v_ua := null;
  end;

  insert into public.audit_logs
    (actor_id, actor_role, action, entity_type, entity_id, patient_id, report_id, outcome, metadata, ip_address, user_agent)
  values
    (auth.uid(), anvaya.current_role(), p_action, p_entity_type, p_entity_id,
     p_patient_id, p_report_id, p_outcome, p_metadata, v_ip, v_ua)
  returning id into v_id;
  return v_id;
end;
$$;

comment on function anvaya.write_audit(text, text, text, uuid, uuid, text, jsonb) is
  'The ONLY supported way to write an audit row. The audit_seal trigger computes the hash chain; callers never touch prev_hash/row_hash.';

-- ---------------------------------------------------------------------------
-- Patient/clinician correction of a parsed value
-- ---------------------------------------------------------------------------
create or replace function anvaya.submit_value_correction(
  p_test_result_id uuid,
  p_new_value      numeric,
  p_reason         text,
  p_as_doctor      boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_tr       public.test_results%rowtype;
  v_report   uuid;
  v_patient  uuid;
  v_doctor   uuid;
  v_source   anvaya_value_source;
  v_new_id   uuid;
begin
  select * into v_tr from public.test_results where id = p_test_result_id for update;
  if not found then
    raise exception 'anvaya: test_result % not found', p_test_result_id;
  end if;

  v_report  := v_tr.report_id;
  v_patient := anvaya.report_patient(v_report);

  -- authorisation: the owning patient (self-correction of their own upload) or
  -- an authorised clinician. Nobody else.
  if p_as_doctor then
    v_doctor := anvaya.current_doctor_id();
    if v_doctor is null or not anvaya.has_active_grant(v_doctor, v_patient) then
      perform anvaya.write_audit('access.denied', 'test_result', p_test_result_id::text, v_patient, v_report, 'denied',
                                 jsonb_build_object('reason', 'no active grant for correction'));
      raise exception 'anvaya: not authorised to correct this result';
    end if;
    v_source := 'doctor_correction';
  else
    if anvaya.current_patient_id() is distinct from v_patient and not anvaya.is_admin() then
      perform anvaya.write_audit('access.denied', 'test_result', p_test_result_id::text, v_patient, v_report, 'denied',
                                 jsonb_build_object('reason', 'not the owning patient'));
      raise exception 'anvaya: not authorised to correct this result';
    end if;
    v_source := 'patient_correction';
  end if;

  if p_new_value is null then
    raise exception 'anvaya: a correction requires a value';
  end if;

  update public.test_results
     set corrected_value   = p_new_value,
         corrected_by      = auth.uid(),
         corrected_at      = now(),
         correction_reason = p_reason,
         value_source      = v_source
   where id = p_test_result_id;

  perform anvaya.write_audit('result.corrected', 'test_result', p_test_result_id::text, v_patient, v_report, 'success',
                             jsonb_build_object(
                               'from', v_tr.original_value,
                               'to',   p_new_value,
                               'by',   v_source));

  -- Return the CURRENT authoritative validation, so the caller can re-run the
  -- deterministic engine against the corrected value. Note what this function
  -- does NOT do: it never writes a status. Classification stays with
  -- validation_results.
  v_new_id := v_tr.current_validation_id;
  return v_new_id;
end;
$$;

comment on function anvaya.submit_value_correction(uuid, numeric, text, boolean) is
  'The only write path onto test_results correction columns. Writes the audit row in the same transaction. Deliberately does NOT set any status — the caller must re-run the deterministic engine, which appends a new validation_results row.';

-- ---------------------------------------------------------------------------
-- Review state machine
-- ---------------------------------------------------------------------------
create or replace function anvaya.set_review_status(
  p_review_id uuid,
  p_new_status anvaya_review_status,
  p_reason text default null
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_rev     public.doctor_reviews%rowtype;
  v_doctor  uuid;
  v_patient uuid;
  v_action  text;
  v_ok      boolean;
begin
  select * into v_rev from public.doctor_reviews where id = p_review_id for update;
  if not found then
    raise exception 'anvaya: review % not found', p_review_id;
  end if;

  v_doctor  := anvaya.current_doctor_id();
  v_patient := anvaya.report_patient(v_rev.report_id);

  -- A patient must never be able to drive a review transition.
  if v_doctor is null or v_doctor <> v_rev.doctor_id then
    perform anvaya.write_audit('access.denied', 'doctor_review', p_review_id::text, v_patient, v_rev.report_id, 'denied',
                               jsonb_build_object('attempted_status', p_new_status));
    raise exception 'anvaya: only the assigned doctor may change this review';
  end if;
  if not anvaya.has_active_grant(v_doctor, v_patient) then
    raise exception 'anvaya: reviewer no longer has access to this patient';
  end if;

  -- permitted transitions
  v_ok := case
    when v_rev.status = 'draft'          and p_new_status in ('pending_review', 'withdrawn')             then true
    when v_rev.status = 'pending_review' and p_new_status in ('approved', 'needs_edit', 'withdrawn')     then true
    when v_rev.status = 'needs_edit'     and p_new_status in ('pending_review', 'withdrawn')             then true
    when v_rev.status = 'approved'       and p_new_status = 'withdrawn'                                  then true
    else false
  end;

  if not v_ok then
    raise exception 'anvaya: illegal review transition % -> %', v_rev.status, p_new_status;
  end if;

  if p_new_status = 'needs_edit' and p_reason is null then
    raise exception 'anvaya: needs_edit requires a reason';
  end if;

  update public.doctor_reviews
     set previous_status  = v_rev.status,
         status           = p_new_status,
         opened_at        = coalesce(opened_at, now()),
         decision_at      = case when p_new_status in ('approved', 'needs_edit', 'withdrawn') then now() else decision_at end,
         signed_at        = case when p_new_status = 'approved' then coalesce(signed_at, now()) else signed_at end,
         rejection_reason = case when p_new_status = 'needs_edit' then p_reason else rejection_reason end
   where id = p_review_id;

  v_action := case p_new_status
                when 'approved'     then 'review.approved'
                when 'needs_edit'   then 'review.rejected'
                when 'pending_review' then 'review.opened'
                when 'withdrawn'    then 'review.rejected'
                else 'review.opened'
              end;

  perform anvaya.write_audit(v_action, 'doctor_review', p_review_id::text, v_patient, v_rev.report_id, 'success',
                             jsonb_build_object('from', v_rev.status, 'to', p_new_status));

  update public.lab_reports
     set status = case when p_new_status = 'pending_review' then 'in_review'::anvaya_report_status else status end
   where id = v_rev.report_id and status = 'analysed';
end;
$$;

comment on function anvaya.set_review_status(uuid, anvaya_review_status, text) is
  'Enforces draft -> pending_review -> (approved | needs_edit) and refuses everything else, including any attempt by the owning patient. `released` is NOT reachable here: release is a separate, explicitly audited act (anvaya.release_report).';

-- ---------------------------------------------------------------------------
-- Release: the only path to a patient-facing report
-- ---------------------------------------------------------------------------
create or replace function anvaya.release_report(
  p_report_id  uuid,
  p_version_id uuid,
  p_review_id  uuid default null,
  p_channel    text default 'app'
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_review  public.doctor_reviews%rowtype;
  v_patient uuid;
  v_doctor  uuid;
  v_prev    public.report_releases%rowtype;
  v_new     uuid;
begin
  select patient_id into v_patient from public.lab_reports where id = p_report_id and deleted_at is null;
  if v_patient is null then
    raise exception 'anvaya: report % not found or deleted', p_report_id;
  end if;

  if not exists (select 1 from public.report_versions where id = p_version_id and report_id = p_report_id) then
    raise exception 'anvaya: version % does not belong to report %', p_version_id, p_report_id;
  end if;

  -- the version must carry an APPROVED review by a clinician
  if p_review_id is null then
    select * into v_review
    from public.doctor_reviews
    where report_id = p_report_id and report_version_id = p_version_id and status = 'approved'
    order by decision_at desc nulls last
    limit 1;
    if not found then
      raise exception 'anvaya: no approved review exists for this report version — cannot release';
    end if;
  else
    select * into v_review from public.doctor_reviews where id = p_review_id;
    if not found or v_review.report_version_id <> p_version_id or v_review.status <> 'approved' then
      raise exception 'anvaya: review % is not an approved review of this version', p_review_id;
    end if;
  end if;

  -- only that clinician (or an admin) may release
  v_doctor := anvaya.current_doctor_id();
  if v_doctor is distinct from v_review.doctor_id and not anvaya.is_admin() then
    perform anvaya.write_audit('access.denied', 'report_release', p_report_id::text, v_patient, p_report_id, 'denied',
                               jsonb_build_object('reason', 'releaser is not the approving clinician'));
    raise exception 'anvaya: only the approving clinician may release this report';
  end if;

  -- retire any previous active release
  select * into v_prev from public.report_releases
   where report_id = p_report_id and is_active for update;
  if found then
    update public.report_releases
       set is_active = false, superseded_at = now(), superseded_by = null
     where id = v_prev.id;
  end if;

  insert into public.report_releases
    (report_id, report_version_id, review_id, released_by, release_channel)
  values
    (p_report_id, p_version_id, v_review.id, coalesce(auth.uid(), v_review.doctor_id), p_channel)
  returning id into v_new;

  update public.doctor_reviews set status = 'released' where id = v_review.id and status = 'approved';
  update public.lab_reports set status = 'released' where id = p_report_id;

  perform anvaya.write_audit('report.released', 'report_release', v_new::text, v_patient, p_report_id, 'success',
                             jsonb_build_object('version_id', p_version_id, 'review_id', v_review.id));

  return v_new;
end;
$$;

comment on function anvaya.release_report(uuid, uuid, uuid, text) is
  'The ONLY way a report becomes patient-facing. Refuses to run unless the version has an approved clinician review, and refuses to run for anyone other than that clinician. Supersedes the previous active release rather than deleting it.';

-- ---------------------------------------------------------------------------
-- Erasure
-- ---------------------------------------------------------------------------
create or replace function anvaya.hard_delete_report(
  p_report_id uuid,
  p_reason    text default null
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_patient      uuid;
  v_allow_delete text;
begin
  select patient_id into v_patient from public.lab_reports where id = p_report_id;
  if v_patient is null then
    raise exception 'anvaya: report % not found', p_report_id;
  end if;

  -- Authorisation: the owning patient, or an admin acting on a deletion request.
  if anvaya.current_patient_id() is distinct from v_patient and not anvaya.is_admin() then
    perform anvaya.write_audit('access.denied', 'lab_report', p_report_id::text, v_patient, p_report_id, 'denied',
                               jsonb_build_object('reason', 'erasure attempted by non-owner'));
    raise exception 'anvaya: not authorised to erase this report';
  end if;

  -- Audit BEFORE destruction, so the fact survives the data.
  perform anvaya.write_audit('report.deleted', 'lab_report', p_report_id::text, v_patient, p_report_id, 'success',
                             jsonb_build_object('mode', 'hard_delete', 'reason', p_reason));

  -- Open the sanctioned-erasure window for the remainder of this transaction.
  -- Without it the append-only guards would (correctly) refuse the deletes
  -- below. It is transaction-local, so it cannot outlive this call.
  perform set_config('anvaya.erasure_in_progress', 'on', true);

  -- Dependency-ordered destruction. Nothing here relies on a blind CASCADE from
  -- patients: medical rows are RESTRICT-linked precisely so this ordering is
  -- explicit and reviewable.
  delete from public.report_releases      where report_id = p_report_id;
  delete from public.doctor_reviews       where report_id = p_report_id;
  delete from public.report_versions      where report_id = p_report_id;
  delete from public.ai_explanations      where subject_report_id = p_report_id;
  delete from public.report_patterns      where report_id = p_report_id;
  delete from public.report_files         where report_id = p_report_id;
  delete from public.anonymization_records where lab_report_id = p_report_id;
  delete from public.ocr_results          where report_id = p_report_id;
  delete from public.report_processing_jobs where report_id = p_report_id;

  -- validation_results is RESTRICT-linked to test_results, so it goes first;
  -- deleting test_results then cascades to its ai_explanations and citations.
  delete from public.validation_results
   where test_result_id in (select id from public.test_results where report_id = p_report_id);
  delete from public.test_results         where report_id = p_report_id;

  delete from public.lab_reports          where id = p_report_id;

  -- Storage objects live outside the database; remove them by prefix so no
  -- orphaned PHI remains in a bucket. Same {patient_id}/{report_id}/ convention
  -- the storage policies in 0019 rely on.
  --
  -- Supabase Storage attaches a statement-level BEFORE DELETE trigger to
  -- storage.objects (supabase/storage tenant migration 0055-prevent-direct-deletes)
  -- that refuses any direct delete unless the transaction sets
  -- storage.allow_delete_query = 'true'. That is the platform's sanctioned
  -- override for precisely this case — a deliberate, authorised, audited
  -- erasure — and it is the only way to make GDPR erasure actually reach the
  -- object store from the database. It is scoped as narrowly as the platform
  -- allows:
  --   * transaction-local (is_local => true), so it cannot outlive this call;
  --   * set inside a SECURITY DEFINER function that already authorises against
  --     auth.uid(), so a caller can only open it for its own report;
  --   * restored immediately after the delete, so nothing else in the same
  --     transaction inherits it.
  -- The alternative — dropping this delete — would leave the report's original
  -- scan, its OCR dump and its exports sitting in a bucket after the patient
  -- had exercised their right to erasure. That is the worse failure.
  if to_regclass('storage.objects') is not null then
    v_allow_delete := current_setting('storage.allow_delete_query', true);
    perform set_config('storage.allow_delete_query', 'true', true);

    delete from storage.objects
     where bucket_id in ('report-originals', 'report-processed', 'report-exports', 'voice-audio', 'consent-evidence')
       and (storage.foldername(name))[1] = v_patient::text
       and (storage.foldername(name))[2] = p_report_id::text;

    perform set_config('storage.allow_delete_query', coalesce(v_allow_delete, 'false'), true);
  end if;
end;
$$;

comment on function anvaya.hard_delete_report(uuid, text) is
  'True erasure of one report: writes the audit record first, then destroys clinical rows in explicit dependency order and removes the storage objects. Audit rows survive (they are compliance records, not PHI).';

create or replace function anvaya.hard_delete_patient(
  p_patient_id uuid,
  p_reason     text default null
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_report record;
begin
  if anvaya.current_patient_id() is distinct from p_patient_id and not anvaya.is_admin() then
    perform anvaya.write_audit('access.denied', 'patients', p_patient_id::text, p_patient_id, null, 'denied',
                               jsonb_build_object('reason', 'account erasure attempted by non-owner'));
    raise exception 'anvaya: not authorised to erase this account';
  end if;

  perform set_config('anvaya.erasure_in_progress', 'on', true);

  for v_report in select id from public.lab_reports where patient_id = p_patient_id
  loop
    perform anvaya.hard_delete_report(v_report.id, p_reason);
  end loop;

  delete from public.voice_sessions    where patient_id = p_patient_id;
  delete from public.answer_feedback   where patient_id = p_patient_id;
  delete from public.patient_consents  where patient_id = p_patient_id;
  delete from public.doctor_patient_access where patient_id = p_patient_id;

  -- De-link (do not delete) the audit history: the fact that actions occurred is
  -- compliance information; the identity attached to them is not.
  update public.audit_logs set patient_id = null where patient_id = p_patient_id;

  delete from public.patients where id = p_patient_id;

  -- Written last, with no patient identifier attached, so the record that an
  -- erasure happened survives without re-identifying the person.
  perform anvaya.write_audit('deletion.completed', 'patients', null, null, null, 'success',
                             jsonb_build_object('mode', 'account_erasure', 'reason', p_reason));

  perform set_config('anvaya.erasure_in_progress', 'off', true);
end;
$$;

comment on function anvaya.hard_delete_patient(uuid, text) is
  'Account erasure. Destroys clinical data and consents, de-links the audit trail rather than deleting it, and removes the patient row. Retains exactly the minimal compliance record.';

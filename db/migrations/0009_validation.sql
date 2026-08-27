-- ============================================================================
-- Anvaya / Rxanvaya — Supabase migration 0009
-- validation_results — deterministic rule-engine output (SOURCE OF TRUTH)
-- ----------------------------------------------------------------------------
-- Purpose   : The DETERMINISTIC VALIDATION stage. Low / Normal / High /
--             Borderline / Critical is decided HERE, by a versioned rule over
--             snapshotted inputs, and then frozen.
-- Depends on: 0006, 0008
-- Fresh safe: YES
-- Contract  : This is the table that satisfies the hard requirement
--             "The LLM must never be the source of truth for whether a
--             laboratory value is Low/Normal/High/Critical."
--
--             It is append-only (guard_immutable_row) and has NO write policy
--             for anon/authenticated in migration 0018 — only service_role can
--             insert. There is no UPDATE path at all, so neither a doctor edit
--             nor an LLM write-back can restate a classification. A re-run of
--             the engine creates a new row with a higher validation_seq and
--             repoints test_results.current_validation_id.
-- ============================================================================

create table if not exists public.validation_results (
  id                uuid primary key default gen_random_uuid(),
  test_result_id    uuid not null,
  validation_seq    smallint not null default 1 check (validation_seq > 0),

  -- rule that ran ------------------------------------------------------------
  rule_id           uuid not null,
  rule_version      text not null,                      -- denormalised so the verdict is readable without a join
  engine_version    text not null,

  -- inputs, snapshotted so later catalogue edits cannot rewrite history ------
  effective_value   numeric(14,5) not null,
  unit              text not null,
  range_origin      anvaya_range_origin not null,
  reference_range_id uuid,                              -- NULL when the decision used the lab-printed range
  ref_low           numeric(14,5),
  ref_high          numeric(14,5),
  critical_low      numeric(14,5),
  critical_high     numeric(14,5),
  borderline_frac   numeric(6,4) not null default 0,
  inputs_hash       text not null,                      -- sha256 over the snapshot: tamper-evidence

  -- verdict ------------------------------------------------------------------
  computed_status   anvaya_test_status not null,
  is_critical       boolean not null default false,
  is_abnormal       boolean not null default false,
  distance_from_range numeric(14,5),                    -- signed distance outside the ref bound, in `unit`
  rationale         text,                               -- human-readable trace: "7.2 > ref_high 5.7 (band 0.10) -> high"

  computed_at       timestamptz not null default now(),
  computed_by       uuid,                               -- NULL for automated runs; set for a clinician-initiated re-run

  constraint vr_fk_test_result foreign key (test_result_id) references public.test_results (id) on delete restrict,
  constraint vr_fk_rule        foreign key (rule_id)        references public.clinical_rules (id) on delete restrict,
  constraint vr_fk_range       foreign key (reference_range_id) references public.reference_ranges (id) on delete set null,
  constraint vr_fk_computed_by foreign key (computed_by)    references public.profiles (id) on delete set null,

  constraint vr_unique_seq unique (test_result_id, validation_seq),
  -- critical is a subset of abnormal
  constraint vr_critical_implies_abnormal check (not is_critical or is_abnormal),
  constraint vr_critical_matches_status check (
    is_critical = (computed_status = 'critical')
  ),
  constraint vr_range_needed_for_catalogue check (
    range_origin <> 'catalogue' or reference_range_id is not null
  ),
  -- the engine must have had at least one bound to work with
  constraint vr_needs_a_bound check (ref_low is not null or ref_high is not null)
);

comment on table public.validation_results is
  'IMMUTABLE deterministic classification. Append-only; no UPDATE, no DELETE, no client write policy. The single authoritative answer to "is this value low, normal, borderline, high or critical?"';
comment on column public.validation_results.ref_low is
  'A COPY of the bound that was in force at computed_at, not a live join. Editing reference_ranges later cannot change a past verdict — this is what makes historical reports reproducible.';
comment on column public.validation_results.inputs_hash is
  'sha256(rule_key|rule_version|engine_version|value|unit|ref_low|ref_high|critical_low|critical_high|borderline_frac). Any tampering with the snapshot is detectable.';
comment on column public.validation_results.rationale is
  'Machine-written explanation of the arithmetic. Deliberately NOT free text from a language model.';

-- Latest verdict per result: what every read path joins to.
create index if not exists vr_latest_idx
  on public.validation_results (test_result_id, validation_seq desc);
create index if not exists vr_rule_idx on public.validation_results (rule_id, computed_at desc);
create index if not exists vr_range_idx on public.validation_results (reference_range_id) where reference_range_id is not null;
create index if not exists vr_critical_idx on public.validation_results (computed_at desc) where is_critical;
create index if not exists vr_abnormal_idx on public.validation_results (computed_at desc) where is_abnormal;
create index if not exists vr_computed_at_idx on public.validation_results (computed_at desc);

drop trigger if exists vr_immutable on public.validation_results;
create trigger vr_immutable
  before update or delete on public.validation_results
  for each row execute function public.guard_immutable_row();

-- ---------------------------------------------------------------------------
-- Close the test_results <-> validation_results loop
-- ---------------------------------------------------------------------------
do $do$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'tr_fk_current_validation'
      and conrelid = 'public.test_results'::regclass
  ) then
    alter table public.test_results
      add constraint tr_fk_current_validation
      foreign key (current_validation_id)
      references public.validation_results (id)
      on delete set null
      deferrable initially deferred;
  end if;
end
$do$;

comment on column public.test_results.current_validation_id is
  'Denormalised pointer to the newest validation_results row for this measurement. Deferred FK: the pair is written in one transaction (validation first, then repoint). It is a cache for reads — validation_results remains the source of truth.';

-- ---------------------------------------------------------------------------
-- Deterministic classification function
-- ---------------------------------------------------------------------------
create or replace function anvaya.classify_value(
  p_value           numeric,
  p_ref_low         numeric,
  p_ref_high        numeric,
  p_critical_low    numeric default null,
  p_critical_high   numeric default null,
  p_borderline_frac numeric default 0
)
returns anvaya_test_status
language sql
immutable
as $$
  with bounds as (
    select
      p_value                                                   as v,
      p_ref_low                                                 as lo,
      p_ref_high                                                as hi,
      -- reference span, used to size the borderline band. Falls back to the
      -- single available bound when the source defines an open-ended range
      -- (e.g. HbA1c "below 5.7%", where only ref_high exists).
      coalesce(p_ref_high - p_ref_low,
               p_ref_high,
               p_ref_low,
               0)                                               as span,
      p_borderline_frac                                         as bf
  )
  select case
    when b.v is null                                                  then null
    when p_critical_low  is not null and b.v < p_critical_low         then 'critical'::anvaya_test_status
    when p_critical_high is not null and b.v > p_critical_high        then 'critical'::anvaya_test_status
    when b.lo is not null and b.v < b.lo then
      case when b.bf > 0 and b.v >= b.lo - (b.span * b.bf)
           then 'borderline'::anvaya_test_status else 'low'::anvaya_test_status end
    when b.hi is not null and b.v > b.hi then
      case when b.bf > 0 and b.v <= b.hi + (b.span * b.bf)
           then 'borderline'::anvaya_test_status else 'high'::anvaya_test_status end
    else 'normal'::anvaya_test_status
  end
  from bounds b;
$$;

comment on function anvaya.classify_value(numeric, numeric, numeric, numeric, numeric, numeric) is
  'The deterministic rule. Pure, immutable, no I/O: identical inputs always yield an identical status, which is the reproducibility guarantee. Lives in the non-exposed `anvaya` schema so the browser cannot call it and fabricate a verdict.';

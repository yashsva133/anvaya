-- ============================================================================
-- Anvaya / RxAnvaya — Supabase migration 0008
-- test_results — parsed / structured laboratory results
-- ----------------------------------------------------------------------------
-- Purpose   : One row per (report, test). Holds the parsed value, its unit, the
--             reference range printed on the report, OCR confidence and the
--             correction history. Holds NO classification of its own: the
--             deterministic status lives in validation_results (migration 0009).
-- Depends on: 0006, 0007
-- Fresh safe: YES
-- Contract  : Mirrors the extracted schema in the architecture doc and the
--             ReportEntry interface (src/lib/data.ts:704-708):
--               { test_name, value, unit, ref_low, ref_high, status }
--             `test`  -> lab_test_id (normalised)
--             `value` -> value / original_value
--             `status`-> resolved through validation_results, NOT stored here
--
-- WHY STATUS IS NOT A COLUMN HERE
--   src/lib/data.ts hardcodes `status` per entry, but those values are not
--   reproducible from (value, ref_low, ref_high): triglycerides 205 mg/dL is
--   marked "borderline" while 170 mg/dL is "high" against ref_high 150, and
--   glucose 126 mg/dL is "borderline" against ref 70-99. No single deterministic
--   rule over the demo data reproduces them. Treating status as *rule output
--   that is persisted* (0009) instead of a stored display column is what makes
--   classification reproducible and un-editable by the LLM.
-- ============================================================================

create table if not exists public.test_results (
  id              uuid primary key default gen_random_uuid(),
  report_id       uuid not null,
  lab_test_id     uuid,                                 -- NULL only when the parser could not map the name
  ocr_result_id   uuid,
  job_id          uuid,
  sort_index      smallint not null default 0,

  -- what the document literally said (provenance) -----------------------------
  raw_name        text not null,                        -- exactly as printed, e.g. "Hb"
  raw_unit        text,
  raw_value_text  text,                                 -- "10.5", "<0.5", "Trace"
  value_qualifier text check (value_qualifier is null or value_qualifier in ('<', '>', '<=', '>=', '~', '+', 'negative', 'positive', 'trace')),

  -- parsed, unit-normalised value -------------------------------------------
  value           numeric(14,5),
  unit            text,
  is_quantitative boolean not null default true,
  qualitative_value text,                               -- for non-numeric results ("Negative")

  -- reference range printed on THIS report ----------------------------------
  printed_ref_low  numeric(14,5),
  printed_ref_high numeric(14,5),
  printed_ref_text text,                                -- TestDef.ref.text, e.g. "12–16 g/dL"
  reference_range_id uuid,                              -- catalogue range, when one matched

  -- parser confidence --------------------------------------------------------
  ocr_confidence  numeric(5,4) check (ocr_confidence is null or (ocr_confidence >= 0 and ocr_confidence <= 1)),
  field_confidence jsonb not null default '{}'::jsonb,  -- per-field: {name:0.99,value:0.91,unit:0.95}
  confidence_level anvaya_confidence_level,             -- TestDef.conf.level
  confidence_note_en text,                              -- TestDef.conf.note.en
  confidence_note_hi text,

  -- correction audit trail ---------------------------------------------------
  value_source    anvaya_value_source not null default 'ocr',
  original_value  numeric(14,5),                        -- immutable: what the parser first produced
  corrected_value numeric(14,5),
  corrected_by    uuid,
  corrected_at    timestamptz,
  correction_reason text,

  -- pointer to the authoritative deterministic verdict -----------------------
  current_validation_id uuid,                           -- FK added in 0009 (circular, deferred)

  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  constraint tr_fk_report  foreign key (report_id)   references public.lab_reports (id) on delete restrict,
  constraint tr_fk_test    foreign key (lab_test_id) references public.lab_test_catalog (id) on delete restrict,
  constraint tr_fk_ocr     foreign key (ocr_result_id) references public.ocr_results (id) on delete set null,
  constraint tr_fk_job     foreign key (job_id)      references public.report_processing_jobs (id) on delete set null,
  constraint tr_fk_corrected_by foreign key (corrected_by) references public.profiles (id) on delete set null,
  -- a numeric result must have a value; a qualitative one must have text
  constraint tr_value_shape check (
    (is_quantitative and value is not null) or
    (not is_quantitative and qualitative_value is not null)
  ),
  -- a correction requires the audit fields that justify it
  constraint tr_correction_audit check (
    corrected_value is null or (corrected_by is not null and corrected_at is not null)
  ),
  constraint tr_printed_range_chk check (
    printed_ref_low is null or printed_ref_high is null or printed_ref_low < printed_ref_high
  ),
  constraint tr_source_matches_correction check (
    (value_source not in ('patient_correction', 'doctor_correction')) or corrected_value is not null
  )
);

comment on table public.test_results is
  'Structured laboratory results — the STRUCTURED TESTS stage output. The effective value is coalesce(corrected_value, value).';
comment on column public.test_results.printed_ref_text is
  'The range exactly as printed on the lab report. The UI shows this with the label "as printed on your report" (src/lib/i18n.tsx "common.perReport"), and the architecture requires the lab''s own printed range to win over generic values.';
comment on column public.test_results.original_value is
  'Never overwritten. A correction writes corrected_value, so the OCR reading stays provable — this is what stops a later edit (human or AI) from erasing provenance.';
comment on column public.test_results.field_confidence is
  'Per-field OCR confidence. Free-form by nature; the scalar ocr_confidence above is the queryable rollup.';

-- One measurement of a given test per report: prevents duplicate test results.
create unique index if not exists tr_one_per_test_per_report
  on public.test_results (report_id, lab_test_id)
  where lab_test_id is not null;

-- Unmapped rows are still unique per raw label.
create unique index if not exists tr_one_per_raw_name
  on public.test_results (report_id, lower(raw_name))
  where lab_test_id is null;

-- Trend queries: all values of one test for one patient across time.
create index if not exists tr_trend_idx
  on public.test_results (lab_test_id, report_id);

create index if not exists tr_report_order_idx on public.test_results (report_id, sort_index);
create index if not exists tr_low_confidence_idx on public.test_results (report_id)
  where ocr_confidence is not null and ocr_confidence < 0.85;
create index if not exists tr_corrected_idx on public.test_results (corrected_at desc)
  where corrected_value is not null;
create index if not exists tr_range_idx on public.test_results (reference_range_id)
  where reference_range_id is not null;

drop trigger if exists tr_set_updated_at on public.test_results;
create trigger tr_set_updated_at
  before update on public.test_results
  for each row execute function public.set_updated_at();

-- Block direct mutation of the provenance fields. Corrections must go through
-- anvaya.submit_value_correction(), which writes the audit columns and an
-- audit_logs row in one transaction.
create or replace function public.guard_test_result_provenance()
returns trigger
language plpgsql
as $$
begin
  if new.report_id      is distinct from old.report_id
  or new.lab_test_id    is distinct from old.lab_test_id
  or new.raw_name       is distinct from old.raw_name
  or new.raw_value_text is distinct from old.raw_value_text
  or new.original_value is distinct from old.original_value
  or new.created_at     is distinct from old.created_at then
    raise exception 'anvaya: test_results provenance columns are immutable (report %, test %)',
      new.report_id, coalesce(new.lab_test_id::text, new.raw_name);
  end if;
  return new;
end;
$$;

comment on function public.guard_test_result_provenance() is
  'Allows legitimate updates (corrections, confidence backfill) but refuses to rewrite what the document said or when the row was created.';

drop trigger if exists tr_provenance_guard on public.test_results;
create trigger tr_provenance_guard
  before update on public.test_results
  for each row execute function public.guard_test_result_provenance();

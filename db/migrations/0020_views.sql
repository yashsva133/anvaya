-- ============================================================================
-- Anvaya / Rxanvaya — Supabase migration 0020
-- Read models (views) for the app's actual query patterns
-- ----------------------------------------------------------------------------
-- Purpose   : Give the UI stable, RLS-respecting read shapes that mirror the
--             TypeScript interfaces it already renders, so wiring the app to the
--             database is a change of data source rather than a redesign.
-- Depends on: 0006-0016
-- Fresh safe: YES (create or replace / drop if exists)
--
-- These are plain views, not materialised: they inherit the RLS of the tables
-- underneath, so they cannot become a side channel around 0018.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Report list / summary  ->  src/lib/data.ts Report { id, date, testsCount,
--                                                     attention, entries[] }
-- ---------------------------------------------------------------------------
create or replace view public.v_report_summary as
select
  r.id,
  r.patient_id,
  r.legacy_code,
  r.status,
  r.collected_on,
  r.lab_name,
  r.report_number,
  r.upload_channel,
  r.created_at,
  r.updated_at,
  count(t.id)                                                        as tests_count,
  -- "needs attention" = anything the deterministic engine called high, low or
  -- critical. This is a DERIVED number, not a stored one: the hardcoded
  -- `attention` values in src/lib/data.ts do not agree with their own entries
  -- (jun26 says 3 but has 6 high/low rows; aug26 says 4 but has 3), so the
  -- schema recomputes it from the source of truth instead of persisting it.
  count(*) filter (where v.computed_status in ('high', 'low', 'critical'))  as attention_count,
  count(*) filter (where v.computed_status = 'critical')                    as critical_count,
  count(*) filter (where v.computed_status = 'borderline')                  as borderline_count,
  count(*) filter (where v.computed_status = 'normal')                      as normal_count,
  bool_or(v.is_critical)                                                    as has_critical,
  exists (select 1 from public.report_releases rel
           where rel.report_id = r.id and rel.is_active)                    as is_released
from public.lab_reports r
left join public.test_results t on t.report_id = r.id
left join public.validation_results v on v.id = t.current_validation_id
where r.deleted_at is null
group by r.id;

comment on view public.v_report_summary is
  'One row per live report with derived counts. Backs the My Reports / Trends / Dashboard screens.';

-- ---------------------------------------------------------------------------
-- Longitudinal history  ->  trendSeries() / getValue() in src/lib/data.ts
-- ---------------------------------------------------------------------------
create or replace view public.v_test_history as
select
  r.patient_id,
  t.lab_test_id,
  c.code                              as test_code,
  c.name_en,
  r.id                                as report_id,
  r.legacy_code,
  r.collected_on,
  coalesce(t.corrected_value, t.value) as effective_value,
  t.unit,
  v.computed_status,
  v.is_critical,
  v.ref_low,
  v.ref_high,
  t.ocr_confidence,
  t.corrected_at is not null          as was_corrected
from public.test_results t
join public.lab_reports r       on r.id = t.report_id and r.deleted_at is null
left join public.lab_test_catalog c on c.id = t.lab_test_id
left join public.validation_results v on v.id = t.current_validation_id
where t.lab_test_id is not null;

comment on view public.v_test_history is
  'The trend query: every measurement of one test for one patient across all their reports, newest-last when ordered by collected_on. Indexed by test_results_trend_idx + reports_patient_history_idx.';

-- ---------------------------------------------------------------------------
-- Latest result per test for a patient  ->  latestEntry() in src/lib/data.ts
-- ---------------------------------------------------------------------------
create or replace view public.v_patient_latest_results as
select distinct on (h.patient_id, h.lab_test_id)
  h.patient_id, h.lab_test_id, h.test_code, h.name_en, h.report_id,
  h.collected_on, h.effective_value, h.unit, h.computed_status, h.is_critical
from public.v_test_history h
order by h.patient_id, h.lab_test_id, h.collected_on desc;

comment on view public.v_patient_latest_results is
  'DISTINCT ON gives the most recent measurement of each test per patient without a correlated subquery.';

-- ---------------------------------------------------------------------------
-- Doctor review queue
-- ---------------------------------------------------------------------------
create or replace view public.v_review_queue as
select
  dr.id                as review_id,
  dr.report_id,
  dr.report_version_id,
  rv.version_no,
  dr.doctor_id,
  d.full_name          as doctor_name,
  dr.status,
  dr.assigned_at,
  dr.opened_at,
  dr.decision_at,
  r.patient_id,
  p.full_name          as patient_name,
  r.collected_on,
  r.status             as report_status,
  s.attention_count,
  s.has_critical
from public.doctor_reviews dr
join public.doctors d        on d.id = dr.doctor_id
join public.lab_reports r    on r.id = dr.report_id
join public.patients p       on p.id = r.patient_id
join public.report_versions rv on rv.id = dr.report_version_id
left join public.v_report_summary s on s.id = r.id
where r.deleted_at is null;

comment on view public.v_review_queue is
  'The clinician worklist. Filter on status = ''pending_review'' and order by assigned_at for the queue; RLS on doctor_reviews already limits rows to the assigned doctor.';

-- ---------------------------------------------------------------------------
-- Citation trail  ->  "what source supported this statement?"
-- ---------------------------------------------------------------------------
create or replace view public.v_citation_trail as
select
  e.id                 as explanation_id,
  e.language,
  e.reading_level,
  e.subject_test_result_id,
  e.subject_report_pattern_id,
  e.subject_report_id,
  g.model,
  g.model_version,
  g.trust_score,
  g.trust_level,
  g.model_confidence,
  g.retrieval_similarity,
  ec.citation_index,
  ec.rank,
  ec.similarity,
  ec.quoted_text,
  ch.id                as chunk_id,
  ch.seq               as chunk_seq,
  ch.heading           as chunk_heading,
  ch.content           as chunk_content,
  doc.version          as document_version,
  doc.retrieved_at,
  src.code             as source_code,
  src.title            as source_title,
  src.publisher,
  src.country,
  src.url              as source_url
from public.explanation_citations ec
join public.ai_explanations e on e.id = ec.explanation_id
join public.rag_chunks ch     on ch.id = ec.rag_chunk_id
join public.rag_documents doc on doc.id = ch.document_id
join public.rag_sources src   on src.id = doc.rag_source_id
left join public.ai_generations g on g.id = e.generation_id;

comment on view public.v_citation_trail is
  'Full provenance chain for any statement shown to a patient: explanation -> chunk -> document -> publisher, with the retrieval rank and similarity that earned the citation.';

-- ---------------------------------------------------------------------------
-- Processing status  ->  src/app/processing/page.tsx stage list
-- ---------------------------------------------------------------------------
create or replace view public.v_report_pipeline as
select
  j.report_id,
  j.stage,
  j.status,
  j.attempt,
  j.progress_pct,
  j.started_at,
  j.finished_at,
  j.error_code,
  j.error_message,
  row_number() over (partition by j.report_id, j.stage order by j.attempt desc) as attempt_rank
from public.report_processing_jobs j;

comment on view public.v_report_pipeline is
  'Per-report stage progress. attempt_rank = 1 is the latest attempt for each stage, which is what the progress screen should render.';

grant select on public.v_report_summary,
                public.v_test_history,
                public.v_patient_latest_results,
                public.v_review_queue,
                public.v_citation_trail,
                public.v_report_pipeline
  to authenticated, service_role;

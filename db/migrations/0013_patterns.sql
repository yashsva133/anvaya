-- ============================================================================
-- Anvaya / RxAnvaya — Supabase migration 0013
-- Multi-test patterns (the clinical knowledge graph findings)
-- ----------------------------------------------------------------------------
-- Purpose   : Model the "Multi-test reasoning" pipeline stage: related results
--             grouped into a finding with a direction per member.
-- Depends on: 0006, 0007, 0012
-- Fresh safe: YES
-- Contract  : Maps onto the Pattern interface in src/lib/data.ts:901-910
--               { id, title:L2, nodes:[{test, arrow:"up"|"down"|"flat", note?}],
--                 expl:L2, risk:L2, disclaimer:L2, source:string, conf }
--             and the three seeded ids pattern-lipid / pattern-blood /
--             pattern-sugar rendered by src/app/insights/page.tsx and
--             src/app/dashboard/page.tsx.
--
--             pattern_templates holds the STATIC catalogue (the three known
--             pattern shapes, whose titles/risks are fixed clinical content).
--             report_patterns is the per-report INSTANCE. The narrative text
--             (expl/risk/disclaimer) is NOT duplicated here — it lives in
--             ai_explanations with subject_report_pattern_id set, so patterns
--             get the same language x reading-level versioning as every other
--             explanation.
--
--             KG_CLUSTERS (src/lib/data.ts:1026) is a static visual layout for
--             the knowledge-graph graphic, not patient data, so it is
--             deliberately NOT given a table.
-- ============================================================================

create table if not exists public.pattern_templates (
  id             uuid primary key default gen_random_uuid(),
  code           text not null unique,                  -- 'pattern-lipid' | 'pattern-blood' | 'pattern-sugar'
  title_en       text not null,
  title_hi       text,
  default_risk_en text,
  default_risk_hi text,
  default_disclaimer_en text,
  default_disclaimer_hi text,
  description    text,
  is_active      boolean not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

comment on table public.pattern_templates is
  'Static catalogue of multi-test pattern shapes. `code` preserves the existing Pattern.id strings from src/lib/data.ts.';

drop trigger if exists pt_set_updated_at on public.pattern_templates;
create trigger pt_set_updated_at
  before update on public.pattern_templates
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- report_patterns — a pattern instance detected in one report
-- ---------------------------------------------------------------------------
create table if not exists public.report_patterns (
  id             uuid primary key default gen_random_uuid(),
  report_id      uuid not null,
  template_id    uuid not null,
  detection      text not null default 'rule'
                 check (detection in ('rule', 'model', 'clinician')),
  generation_id  uuid,                                  -- the AI call that narrated it, if any
  rag_source_id  uuid,                                  -- Pattern.source
  confidence_level anvaya_confidence_level,             -- Pattern.conf.level
  confidence_pct smallint check (confidence_pct is null or (confidence_pct >= 0 and confidence_pct <= 100)),
  is_significant boolean not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),

  constraint rp_fk_report   foreign key (report_id)   references public.lab_reports (id) on delete cascade,
  constraint rp_fk_template foreign key (template_id) references public.pattern_templates (id) on delete restrict,
  constraint rp_fk_generation foreign key (generation_id) references public.ai_generations (id) on delete set null,
  constraint rp_fk_source   foreign key (rag_source_id) references public.rag_sources (id) on delete set null
);

comment on table public.report_patterns is
  'A multi-test finding for a specific report. `detection` records whether a rule or a model spotted the pattern — the pattern itself never changes a deterministic test status.';

create unique index if not exists rp_one_per_template_per_report
  on public.report_patterns (report_id, template_id);
create index if not exists rp_report_idx on public.report_patterns (report_id) where is_significant;

drop trigger if exists rp_set_updated_at on public.report_patterns;
create trigger rp_set_updated_at
  before update on public.report_patterns
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- report_pattern_members — Pattern.nodes
-- ---------------------------------------------------------------------------
create table if not exists public.report_pattern_members (
  id              uuid primary key default gen_random_uuid(),
  report_pattern_id uuid not null,
  lab_test_id     uuid not null,
  test_result_id  uuid,
  direction       anvaya_trend_dir not null default 'flat',   -- Pattern.nodes[].arrow
  note_en         text,
  note_hi         text,
  position        smallint not null default 0,
  created_at      timestamptz not null default now(),

  constraint rpm_fk_pattern foreign key (report_pattern_id) references public.report_patterns (id) on delete cascade,
  constraint rpm_fk_test    foreign key (lab_test_id)  references public.lab_test_catalog (id) on delete restrict,
  constraint rpm_fk_result  foreign key (test_result_id) references public.test_results (id) on delete set null,
  constraint rpm_unique_test unique (report_pattern_id, lab_test_id)
);

comment on table public.report_pattern_members is
  'Pattern.nodes: which tests participate and which way each is moving. `direction` is a trend descriptor, not a re-classification of the deterministic status.';

create index if not exists rpm_pattern_idx on public.report_pattern_members (report_pattern_id, position);
create index if not exists rpm_test_idx on public.report_pattern_members (lab_test_id);

-- ---------------------------------------------------------------------------
-- Close the ai_explanations -> report_patterns loop
-- ---------------------------------------------------------------------------
do $do$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'expl_fk_report_pattern'
      and conrelid = 'public.ai_explanations'::regclass
  ) then
    alter table public.ai_explanations
      add constraint expl_fk_report_pattern
      foreign key (subject_report_pattern_id)
      references public.report_patterns (id)
      on delete cascade;
  end if;
end
$do$;

create index if not exists expl_pattern_idx
  on public.ai_explanations (subject_report_pattern_id)
  where subject_report_pattern_id is not null;

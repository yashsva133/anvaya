-- ============================================================================
-- Anvaya / Rxanvaya — Supabase migration 0006
-- Laboratory catalogue: test definitions, aliases, reference ranges, rules
-- ----------------------------------------------------------------------------
-- Purpose   : Normalise test identity and make reference ranges versioned and
--             demographically scoped, so a historical report can be re-explained
--             against the range that was in force on its collection date.
-- Depends on: 0001, 0002
-- Fresh safe: YES
-- Contract  : NEW tables, but the *codes and ranges are taken verbatim* from
--             the TestDef records in src/lib/data.ts (14 tests) so the existing
--             UI identifiers (test ids used as route params at /test/[id]) keep
--             working unchanged.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- lab_test_catalog
-- ---------------------------------------------------------------------------
create table if not exists public.lab_test_catalog (
  id           uuid primary key default gen_random_uuid(),
  code         text        not null,                    -- 'hemoglobin', 'hba1c', ... == TestDef.id in src/lib/data.ts
  name_en      text        not null,
  name_hi      text,
  simple_name_en text,                                  -- TestDef.simple.en ("Bad cholesterol")
  simple_name_hi text,
  default_unit text,                                    -- TestDef.unit
  loinc_code   text,
  category     text,                                    -- 'haematology' | 'lipid' | 'glycaemia' | 'renal' | 'electrolyte'
  description_medical text,                             -- TestDef.what.med
  description_plain_en text,                            -- TestDef.what.en
  description_plain_hi text,
  description_very_simple_en text,                      -- TestDef.what.vs_en
  description_very_simple_hi text,
  icon_key     text,                                    -- TestDef.icon (lucide name) — UI hint, no clinical meaning
  sort_order   int         not null default 0,
  is_active    boolean     not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),

  constraint lab_test_code_key unique (code)
);

comment on table public.lab_test_catalog is
  'Canonical test identity. `code` is the same string the frontend already uses (TESTS keys / /test/[id] route param), so no client identifier changes.';
comment on column public.lab_test_catalog.icon_key is
  'Purely a rendering hint (TestIcon in src/components/core.tsx). Never used in any clinical decision.';

-- Case-insensitive lookup without needing the citext extension.
create unique index if not exists lab_test_code_lower_key on public.lab_test_catalog (lower(code));
create index if not exists lab_test_category_idx on public.lab_test_catalog (category) where is_active;

drop trigger if exists lab_test_set_updated_at on public.lab_test_catalog;
create trigger lab_test_set_updated_at
  before update on public.lab_test_catalog
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- lab_test_aliases — the normalisation dictionary
-- ---------------------------------------------------------------------------
create table if not exists public.lab_test_aliases (
  id           uuid primary key default gen_random_uuid(),
  lab_test_id  uuid not null,
  alias        text not null,                           -- 'Hb', 'Haemoglobin', 'हीमोग्लोबिन', 'GLU'
  language     anvaya_lang_code not null default 'en',
  source       text not null default 'manual'
               check (source in ('manual', 'ocr_observed', 'lab_dictionary', 'loinc')),
  created_at   timestamptz not null default now(),

  constraint aliases_fk_test foreign key (lab_test_id) references public.lab_test_catalog (id) on delete cascade
);

comment on table public.lab_test_aliases is
  'Synonym dictionary behind the "Data normalisation" pipeline stage (src/lib/data.ts PIPELINE: test names, synonyms and units are standardised — e.g. "Hb", "Haemoglobin", "हेमोग्लोबिन").';

create unique index if not exists aliases_unique on public.lab_test_aliases (lab_test_id, lower(alias), language);
create index if not exists aliases_lookup_idx on public.lab_test_aliases (lower(alias));

-- ---------------------------------------------------------------------------
-- reference_range_sources
-- ---------------------------------------------------------------------------
create table if not exists public.reference_range_sources (
  id           uuid primary key default gen_random_uuid(),
  code         text not null unique,                    -- 'ICMR' | 'WHO' | 'AHA' | 'CDC' | 'MEDLINEPLUS' | 'LAB'
  name         text not null,
  country      text,
  url          text,
  authority_rank smallint not null default 100
               check (authority_rank > 0),              -- 1 = most authoritative; used to pick between candidate ranges
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

comment on table public.reference_range_sources is
  'Who published a reference range. ICMR/WHO carry the lowest authority_rank so they win ties, matching the architecture requirement to prefer Indian/ICMR/WHO ranges.';

drop trigger if exists rrs_set_updated_at on public.reference_range_sources;
create trigger rrs_set_updated_at
  before update on public.reference_range_sources
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- reference_ranges — versioned, demographically scoped
-- ---------------------------------------------------------------------------
create table if not exists public.reference_ranges (
  id             uuid primary key default gen_random_uuid(),
  lab_test_id    uuid not null,
  source_id      uuid not null,
  unit           text not null,                         -- a range is meaningless without its unit
  ref_low        numeric(14,5),
  ref_high       numeric(14,5),
  critical_low   numeric(14,5),                         -- panic value, where the source defines one
  critical_high  numeric(14,5),
  -- Width of the "borderline" band, as a fraction beyond the ref bound.
  -- The shipped UI has a 5th status ("borderline" / "Needs attention") that a
  -- plain low/high comparison cannot produce, so the band is explicit config
  -- rather than a magic number buried in code.
  borderline_frac numeric(6,4) not null default 0
               check (borderline_frac >= 0 and borderline_frac < 1),
  applicable_sex text check (applicable_sex is null or applicable_sex in ('female', 'male', 'any')),
  age_min_years  smallint check (age_min_years is null or age_min_years >= 0),
  age_max_years  smallint check (age_max_years is null or age_max_years <= 150),
  population     text,                                  -- e.g. 'adult', 'paediatric', 'pregnancy', 'indian_adult'
  version        text not null,
  effective_from date not null,
  effective_to   date,                                  -- NULL = current
  is_active      boolean not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),

  constraint rr_fk_test   foreign key (lab_test_id) references public.lab_test_catalog (id) on delete restrict,
  constraint rr_fk_source foreign key (source_id)   references public.reference_range_sources (id) on delete restrict,
  -- At least one bound must exist, otherwise the range cannot classify anything.
  constraint rr_needs_a_bound check (ref_low is not null or ref_high is not null),
  constraint rr_low_lt_high check (ref_low is null or ref_high is null or ref_low < ref_high),
  constraint rr_critical_low_below check (critical_low is null or ref_low is null or critical_low < ref_low),
  constraint rr_critical_high_above check (critical_high is null or ref_high is null or critical_high > ref_high),
  constraint rr_age_window check (age_min_years is null or age_max_years is null or age_min_years <= age_max_years),
  constraint rr_window check (effective_to is null or effective_to >= effective_from)
);

comment on table public.reference_ranges is
  'Versioned, effective-dated reference ranges. Rows are never edited in place to change a bound: a new version row is inserted and the old row gets effective_to set, so any past validation stays reproducible.';
comment on column public.reference_ranges.effective_to is
  'NULL means "currently in force". A validation row pins the exact range id it used, so setting effective_to does not rewrite history.';

create unique index if not exists rr_version_key
  on public.reference_ranges (lab_test_id, source_id, version, unit,
                              coalesce(applicable_sex, 'any'),
                              coalesce(population, 'all'),
                              effective_from);

-- Fast "which range applies to this test/sex/age today?" lookup.
create index if not exists rr_applicability_idx
  on public.reference_ranges (lab_test_id, effective_from desc)
  where is_active;

create index if not exists rr_source_idx on public.reference_ranges (source_id);
create index if not exists rr_effective_idx on public.reference_ranges (effective_from, effective_to);

drop trigger if exists rr_set_updated_at on public.reference_ranges;
create trigger rr_set_updated_at
  before update on public.reference_ranges
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- clinical_rules — versioned validation rule definitions
-- ---------------------------------------------------------------------------
create table if not exists public.clinical_rules (
  id             uuid primary key default gen_random_uuid(),
  rule_key       text not null,                         -- e.g. 'range_threshold_v1'
  version        text not null,
  description    text not null,
  engine_version text not null,                         -- deterministic engine build id
  params         jsonb not null default '{}'::jsonb,    -- non-secret rule parameters (band widths, rounding mode)
  applies_to     uuid,                                  -- optional: restrict to one lab_test_catalog row
  effective_from timestamptz not null default now(),
  effective_to   timestamptz,
  is_active      boolean not null default true,
  created_at     timestamptz not null default now(),

  constraint rules_fk_test foreign key (applies_to) references public.lab_test_catalog (id) on delete cascade,
  constraint rules_window check (effective_to is null or effective_to > effective_from)
);

-- NOTE: this must be a unique INDEX, not a table-level UNIQUE constraint —
-- PostgreSQL does not permit expressions (here, coalesce) inside a UNIQUE
-- constraint, only inside an index.
create unique index if not exists rules_version_key
  on public.clinical_rules (rule_key, version,
                            coalesce(applies_to, '00000000-0000-0000-0000-000000000000'::uuid));

comment on table public.clinical_rules is
  'Rule catalogue. A validation row records the rule id + version that produced it, so re-running the engine later yields the identical classification.';
comment on column public.clinical_rules.params is
  'Rule tuning parameters ONLY. Never store credentials, API keys or secrets in this or any other table — those belong in Supabase Vault / environment variables.';

create index if not exists rules_active_idx on public.clinical_rules (rule_key, effective_from desc) where is_active;
create index if not exists rules_test_idx on public.clinical_rules (applies_to) where applies_to is not null;

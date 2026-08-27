# Anvaya — database

Schema design and implementation for the Anvaya Supabase/PostgreSQL backend.

**Nothing in this directory is wired into the application yet.** The Next.js app
under `src/` is untouched; it still runs entirely off the sample constants in
`src/lib/data.ts`.

## What is here

| Path | What it is |
|---|---|
| `ANVAYA_DATABASE_SPEC.md` | The full specification: repository contract discovered, gap analysis, ER model, table-by-table spec, RLS model, storage model, migration ordering, validation checklist, integration notes. **Start here.** |
| `anvaya_schema.sql` | Single-file build (4,606 lines). Paste into the Supabase SQL Editor and run. |
| `sql_editor_parts/01…05_*.sql` | SQL Editor friendly build split into 5 ordered paste/run files for projects where the single file is too large. |
| `migrations/0001…0021_*.sql` | The same content split into 21 ordered migrations, for migration tooling. |
| `harness/` | Local verification only — not part of the migration set. |

`anvaya_schema.sql` and `migrations/` are byte-for-byte equivalent: the
single file *is* the migrations, spliced together by
`harness/resplice_schema.py`. `verify.sh` runs `resplice_schema.py --check`
first and refuses to continue if they have drifted, and it then applies both
builds and diffs the resulting schemas.

## Applying it

**Option A — one paste.** Open the Supabase SQL Editor, paste `anvaya_schema.sql`, run.

**Option B — five smaller SQL Editor runs.** Run the files in `sql_editor_parts/` in filename order:

1. `01_foundation_identity_access.sql`
2. `02_catalog_reports_results_validation.sql`
3. `03_ai_patterns_review_audit_functions.sql`
4. `04_rls_policies.sql`
5. `05_storage_views_seed.sql`

**Option C — ordered migrations.** Run the files in `migrations/` in filename order.

Either way:

* No extensions to install (no pgcrypto, citext or pgvector).
* Safe on a fresh Supabase project.
* Idempotent — re-running is a no-op.
* Drops nothing, renames nothing.
* **Never takes ownership of, alters, or re-configures a Supabase-managed table.**
  `storage.buckets` and `storage.objects` are owned by `supabase_storage_admin`,
  and the SQL Editor role has not been a member of that role since
  2025-04-21 — so every `ALTER TABLE` / `CREATE POLICY` / `DROP POLICY` /
  `COMMENT ON POLICY` against them fails with `42501: must be owner of table
  objects`. See §6.2 of the spec.

## The one manual step: storage policies

`0019_storage.sql` creates the five **private** buckets and the access predicate
`anvaya.may_access_patient_prefix(name)`, but it **cannot create the 15 object
policies from the SQL Editor** — `CREATE POLICY` on `storage.objects` requires
ownership of that table, and the SQL Editor role does not have it. The migration
detects this, skips the policies, prints a `NOTICE`, and exits 0.

Storage is **closed by default** until you add them: `storage.objects` RLS is on
with no policy for our buckets, so `authenticated` can read, upload and delete
nothing.

**Storage → Policies → `storage.objects` → For full customization** — 15
policies, 3 per bucket (`SELECT`, `INSERT`, `DELETE`), role `authenticated`, each
with `USING` / `WITH CHECK` set to:

```
bucket_id = '<bucket-id>' and anvaya.may_access_patient_prefix(name)
```

`harness/20_storage_policies_as_platform.sql` holds those 15 statements as
copy-pasteable SQL. Nothing else in Storage needs changing: do **not** disable
storage RLS, do not make a bucket public, and do not delete Supabase's own
policies.

## Verifying

After applying the schema *and* the policies, paste `harness/99_verify_supabase.sql`
into the SQL Editor. It is a single read-only `SELECT` that reports 11 checks:
39 tables, 5 private buckets, `storage.objects` still owned by
`supabase_storage_admin` with RLS on, all 15 policies present, nothing granted to
`anon`, and no blanket `true` predicate.

## Verifying locally

```bash
python3 -m venv .venv && .venv/bin/pip install pgserver
PATH=.venv/bin:$PATH ./db/harness/verify.sh
```

This boots a throwaway PostgreSQL and stubs the slice of the Supabase platform
the migrations depend on — **including its permission model**. `storage.buckets`
and `storage.objects` are owned by `supabase_storage_admin` with RLS enabled and
the `protect_*_delete` triggers attached, and the migrations are applied as
`postgres_editor`: a `NOSUPERUSER BYPASSRLS` role that is deliberately *not* a
member of `supabase_storage_admin`, exactly like `postgres` on a real project
since 2025-04-21. An earlier harness stubbed `storage.objects` as an ordinary
locally-owned table, which is precisely why this migration set passed locally and
then failed in the SQL Editor with `42501`.

The run applies all 21 migrations **three times** as that role, exercises both
sides of `0019`'s capability probe, performs the dashboard step as the platform
admin and re-runs `0019`, runs the 31 behavioural tests, applies
`anvaya_schema.sql` as one single paste to a second database and diffs the
result, then runs `99_verify_supabase.sql` against both.

Last run: exit 0, 63 migration applications OK, 0 failures,
`ALL BEHAVIOUR TESTS PASSED`, both builds → 39 base tables + 6 views.

The harness never touches a real Supabase project and needs no credentials.

## Before go-live

Two seeded values in `migrations/0021_seed_catalog.sql` are placeholders that need
clinical sign-off — see §9.4 of the spec:

1. `reference_ranges.borderline_frac = 0.10` for every test.
2. `critical_low` / `critical_high` are `NULL` for every test.

Both are data, not schema: changing them requires no migration.

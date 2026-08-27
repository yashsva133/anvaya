# Anvaya — database

Schema design and implementation for the Anvaya Supabase/PostgreSQL backend.

**Nothing in this directory is wired into the application yet.** The Next.js app
under `src/` is untouched; it still runs entirely off the sample constants in
`src/lib/data.ts`.

## What is here

| Path | What it is |
|---|---|
| `ANVAYA_DATABASE_SPEC.md` | The full specification: repository contract discovered, gap analysis, ER model, table-by-table spec, RLS model, storage model, migration ordering, validation checklist, integration notes. **Start here.** |
| `anvaya_schema.sql` | Single-file build (4,433 lines). Paste into the Supabase SQL Editor and run. |
| `migrations/0001…0021_*.sql` | The same content split into 21 ordered migrations, for migration tooling. |
| `harness/` | Local verification only — not part of the migration set. |

`anvaya_schema.sql` and `migrations/` are byte-for-byte equivalent: applying
either produces an identical schema (verified by diffing `pg_dump --schema-only`
output from databases built both ways).

## Applying it

**Option A — one paste.** Open the Supabase SQL Editor, paste `anvaya_schema.sql`, run.

**Option B — ordered migrations.** Run the files in `migrations/` in filename order.

Either way:

* No extensions to install (no pgcrypto, citext or pgvector).
* Safe on a fresh Supabase project.
* Idempotent — re-running is a no-op.
* Drops nothing, renames nothing.

## Verifying locally

```bash
python3 -m venv .venv && .venv/bin/pip install pgserver
PATH=.venv/bin:$PATH ./db/harness/verify.sh
```

This boots a throwaway PostgreSQL, stubs the small slice of the Supabase platform
the migrations depend on (`auth.uid()`/`auth.role()`, `storage.buckets` /
`storage.objects`, the `anon` / `authenticated` / `service_role` roles), applies
all 21 migrations **three times** to prove idempotency, then runs 31 behavioural
security tests covering RLS isolation, the immutability of deterministic
validation, the doctor review and release workflow, consent semantics, reference
range versioning, the audit hash chain, and erasure.

Last run: exit 0, 63 migration applications OK, 0 failures,
`ALL BEHAVIOUR TESTS PASSED`.

The harness never touches a real Supabase project and needs no credentials.

## Before go-live

Two seeded values in `migrations/0021_seed_catalog.sql` are placeholders that need
clinical sign-off — see §9.4 of the spec:

1. `reference_ranges.borderline_frac = 0.10` for every test.
2. `critical_low` / `critical_high` are `NULL` for every test.

Both are data, not schema: changing them requires no migration.

# Supabase SQL Editor run order

Use these files when `db/anvaya_schema.sql` is too large for one SQL Editor run.

Run **one file at a time**, in this exact order:

1. `01_foundation_identity_access.sql`
2. `02_catalog_reports_results_validation.sql`
3. `03_ai_patterns_review_audit_functions.sql`
4. `04_rls_policies.sql`
5. `05_storage_views_seed.sql`

Notes:

- Paste the whole content of one file into the Supabase SQL Editor, run it, wait for success, then continue with the next numbered file.
- Do not skip a file. Later files depend on tables/functions created by earlier files.
- The SQL is idempotent. If a part fails after partially running, fix the reported issue and re-run the same part before moving forward.
- Part 5 may print a `NOTICE` that `storage.objects` policies were skipped because the SQL Editor role does not own Supabase's storage table. That is expected and safe: buckets remain private/closed. Add the 15 storage policies from `db/harness/20_storage_policies_as_platform.sql` in the Supabase Storage dashboard afterward.
- After all five parts, run `db/harness/99_verify_supabase.sql` to check the installation.

## If a part fails with `ERROR: 42P01: relation "X" does not exist`

**First, check what X is.**

1. **X is an Anvaya table** (`lab_reports`, `patients`, `test_results`, …):
   an earlier part did not finish on this project. Re-run the parts from the
   number whose object is missing, in order, one at a time. Nothing here needs
   a destructive fix.

2. **X is not in any Anvaya file** — the real-world case that produced this
   section: `ERROR: 42P01: relation "structured" does not exist`. It has been
   verified that **no version of these files ever referenced a relation named
   `structured`**: every migration, every part, the single-file build, and
   every historical branch and PR of this repository were searched — the word
   only occurs inside string literals and comments. So the error came from
   outside the file you pasted. Two known sources:

   - **The SQL Editor runs every statement currently in the pane**, not just
     what you last pasted. Leftover text from earlier debugging (a snippet
     like `select * from structured ...` suggested during an earlier session)
     re-runs with your part, and its error looks like it came from the part.
     **Open a fresh tab per part.** This alone fixes most occurrences.
   - **A leftover object inside the project** from an earlier schema
     iteration. When a table is dropped, PostgreSQL's dependency system drops
     dependent views/policies/constraints with it — but the *body text* of a
     PL/pgSQL function (and, for superusers, event triggers) is kept verbatim
     and never validated, so it keeps raising 42P01 every time anything calls
     it. `information_schema.triggers` cannot see these.

   To find out if your project carries such leftovers, paste
   `../harness/90_diagnose_dangling_references.sql` into a **fresh** tab
   (optionally set `v_needle` at the top to the name from your error) and run
   it. It is read-only. It scans function bodies, event triggers, trigger
   definitions, views, materialised views, rules, RLS policy expressions,
   defaults, generated columns, constraints and indexes; live-probes every
   table and view with a `LIMIT 0` select; and prints the exact
   `DROP FUNCTION …` / `DROP EVENT TRIGGER …` statement for each finding.

   If it reports **nothing**, the database is clean and the error was in the
   SQL that was executed — see the fresh-tab point above, and make sure the
   file you paste is the one from this repository (an older copy from a
   previous iteration may still reference dropped tables).

   One red herring to ignore: grepping PostgreSQL's built-in view definitions
   for `%STRUCTURED%` matches `information_schema.user_defined_types`, where
   `'STRUCTURED'` is the SQL standard's type-category constant — a string, not
   a table.

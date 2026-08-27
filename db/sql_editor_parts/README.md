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

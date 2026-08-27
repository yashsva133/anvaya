#!/usr/bin/env bash
# Local verification harness for the Anvaya schema.
#
# NOT part of the migration set. It boots a throwaway PostgreSQL, recreates the
# slice of the Supabase platform the migrations legitimately depend on
# (auth.uid()/auth.role(), storage.buckets/storage.objects, the anon /
# authenticated / service_role roles), applies every migration, then runs the
# behavioural security tests.
#
# FIDELITY: the platform stubs reproduce Supabase's PERMISSION MODEL, not just
# its object names. storage.objects / storage.buckets are owned by
# supabase_storage_admin, and the migrations are applied as `postgres_editor` —
# a NOSUPERUSER BYPASSRLS role that is deliberately NOT a member of
# supabase_storage_admin, exactly like the `postgres` role on a real project
# since 2025-04-21. Anything that assumes ownership of a Supabase-managed table
# therefore fails here with the same SQLSTATE 42501 it fails with in the SQL
# Editor, instead of quietly passing.
#
# Usage:
#   python3 -m venv .venv && .venv/bin/pip install pgserver
#   PGUSER=postgres ./db/harness/verify.sh
set -euo pipefail

PSQL="$(python3 -c 'import pgserver,os;print(os.path.join(os.path.dirname(pgserver.__file__),"pginstall","bin","psql"))')"
PGDATA_DIR="${PGDATA_DIR:-$HOME/.pgdata-anvaya}"
DB="${DB:-anvaya_verify}"
EDITOR_ROLE="${EDITOR_ROLE:-postgres_editor}"
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"

python3 - "$PGDATA_DIR" <<'PY'
import sys, pgserver
pgserver.get_server(sys.argv[1], cleanup_mode=None)
PY

export PGHOST="$PGDATA_DIR"
export PGUSER="${PGUSER:-postgres}"
export PGOPTIONS="-c client_min_messages=warning"

# Fail fast if the single-file build and the migrations have diverged: the two
# are supposed to be byte-for-byte equivalent.
echo "== schema / migration equivalence =="
python3 "$HERE/resplice_schema.py" --check
# Same guarantee for the paste-and-run build: every sql_editor_part must be an
# exact concatenation of the migrations its header lists.
python3 "$HERE/resplice_parts.py" --check

"$PSQL" -d postgres -q \
  -c "drop database if exists $DB;" \
  -c "create database $DB;"
export PGDATABASE="$DB"

echo "== applying Supabase platform stubs (as $PGUSER) =="
"$PSQL" -v ON_ERROR_STOP=1 -q -f "$HERE/00_supabase_stubs.sql"

# The stubs create the platform roles; now hand the database to the SQL Editor
# role so every object the migrations create is owned by the same non-superuser
# role that owns them on a real Supabase project.
"$PSQL" -d postgres -q -c "alter database $DB owner to $EDITOR_ROLE;"

echo "== migrations run as '$EDITOR_ROLE' (NOSUPERUSER, not a member of supabase_storage_admin) =="
for pass in 1 2 3; do
  echo "== migration pass $pass =="
  for f in "$ROOT"/db/migrations/*.sql; do
    printf '  %-42s' "$(basename "$f")"
    if out=$("$PSQL" -U "$EDITOR_ROLE" -v ON_ERROR_STOP=1 -q -f "$f" 2>&1); then
      echo "OK"
    else
      echo "FAIL"; echo "$out" | head -20; exit 1
    fi
  done
done

# ---------------------------------------------------------------------------
# Storage: both sides of the capability probe, made visible.
# ---------------------------------------------------------------------------
# (a) Fresh project — no storage.objects policies exist and the SQL Editor role
#     does not own the table, so 0019 must skip the policy block, say so, and
#     still exit 0.
echo "== 0019 as '$EDITOR_ROLE' on a fresh project (expect: skip + NOTICE, exit 0) =="
PGOPTIONS="-c client_min_messages=notice" \
  "$PSQL" -U "$EDITOR_ROLE" -v ON_ERROR_STOP=1 -q -f "$ROOT/db/migrations/0019_storage.sql"

# (b) The dashboard step, performed by the table owner.
echo "== dashboard step: 15 storage.objects policies, created as the platform admin (superuser == supabase_admin) =="
"$PSQL" -v ON_ERROR_STOP=1 -q -f "$HERE/20_storage_policies_as_platform.sql"

# (c) Re-run 0019 with the policies already present. Before the fix, its
#     unconditional `drop policy if exists ... on storage.objects` aborted here
#     with 42501 — the migration passed on a fresh project and broke on re-run.
echo "== 0019 as '$EDITOR_ROLE' with the policies present (expect: exit 0) =="
PGOPTIONS="-c client_min_messages=notice" \
  "$PSQL" -U "$EDITOR_ROLE" -v ON_ERROR_STOP=1 -q -f "$ROOT/db/migrations/0019_storage.sql"

echo "== behavioural tests (as $EDITOR_ROLE) =="
"$PSQL" -U "$EDITOR_ROLE" -v ON_ERROR_STOP=1 -f "$HERE/10_behaviour_tests.sql"

# ---------------------------------------------------------------------------
# The single-file build, applied exactly the way an operator applies it:
# one paste of db/anvaya_schema.sql into the SQL Editor, as the SQL Editor role.
# ---------------------------------------------------------------------------
SINGLE_DB="${SINGLE_DB:-anvaya_single_file}"
echo "== single-file build: one paste of anvaya_schema.sql as '$EDITOR_ROLE' =="
"$PSQL" -d postgres -q \
  -c "drop database if exists $SINGLE_DB;" \
  -c "create database $SINGLE_DB;"
PGDATABASE="$SINGLE_DB" "$PSQL" -v ON_ERROR_STOP=1 -q -f "$HERE/00_supabase_stubs.sql"
"$PSQL" -d postgres -q -c "alter database $SINGLE_DB owner to $EDITOR_ROLE;"
if out=$(PGDATABASE="$SINGLE_DB" "$PSQL" -U "$EDITOR_ROLE" -v ON_ERROR_STOP=1 -q \
         -f "$ROOT/db/anvaya_schema.sql" 2>&1); then
  echo "  anvaya_schema.sql applied as a single paste: OK"
else
  echo "  anvaya_schema.sql FAILED"; echo "$out" | head -20; exit 1
fi

# Both builds must land on the same schema.
dump_migrations() {
  "$PSQL" -d "$1" -U postgres -At -c "
    select table_schema||'.'||table_name from information_schema.tables
     where table_schema in ('public','anvaya') order by 1;"
}
if [ "$(dump_migrations "$DB")" = "$(dump_migrations "$SINGLE_DB")" ]; then
  echo "  both builds produced the same $(dump_migrations "$SINGLE_DB" | wc -l) relations (39 base tables + 6 views)"
else
  echo "  DIVERGENCE between migrations/ and anvaya_schema.sql"; exit 1
fi

# ---------------------------------------------------------------------------
# The SQL-Editor parts build: exactly what an operator does with
# db/sql_editor_parts — five pastes, one at a time, in order, as the SQL
# Editor role. This is the documented operator path, so it is applied and
# schema-diffed here just like the single-file build.
# ---------------------------------------------------------------------------
PARTS_DB="${PARTS_DB:-anvaya_sql_editor_parts}"
echo "== parts build: five pastes of sql_editor_parts as '$EDITOR_ROLE' =="
"$PSQL" -d postgres -q \
  -c "drop database if exists $PARTS_DB;" \
  -c "create database $PARTS_DB;"
PGDATABASE="$PARTS_DB" "$PSQL" -v ON_ERROR_STOP=1 -q -f "$HERE/00_supabase_stubs.sql"
"$PSQL" -d postgres -q -c "alter database $PARTS_DB owner to $EDITOR_ROLE;"
for f in "$ROOT"/db/sql_editor_parts/0*.sql; do
  printf '  %-52s' "$(basename "$f")"
  if out=$(PGDATABASE="$PARTS_DB" "$PSQL" -U "$EDITOR_ROLE" -v ON_ERROR_STOP=1 -q -f "$f" 2>&1); then
    echo "OK"
  else
    echo "FAILED"; echo "$out" | head -20; exit 1
  fi
done
if [ "$(dump_migrations "$DB")" = "$(dump_migrations "$PARTS_DB")" ]; then
  echo "  parts build produced the same $(dump_migrations "$PARTS_DB" | wc -l) relations as the migrations"
else
  echo "  DIVERGENCE between migrations/ and sql_editor_parts/"; exit 1
fi

# ---------------------------------------------------------------------------
# The same read-only verification an operator runs in the Supabase SQL Editor.
# Run against the migrations build (policies present) and the single-file build
# (policies deliberately absent), so both a full PASS and the expected
# "dashboard step outstanding" FAIL are exercised.
# ---------------------------------------------------------------------------
echo "== post-apply verification: migrations build (expect 11 PASS) =="
"$PSQL" -d "$DB"         -U "$EDITOR_ROLE" -v ON_ERROR_STOP=1 -f "$HERE/99_verify_supabase.sql"

echo "== post-apply verification: single-file build (expect check 6 FAIL until the dashboard step) =="
"$PSQL" -d "$SINGLE_DB"  -U "$EDITOR_ROLE" -v ON_ERROR_STOP=1 -f "$HERE/99_verify_supabase.sql"

echo "== post-apply verification: parts build (expect check 6 FAIL until the dashboard step) =="
"$PSQL" -d "$PARTS_DB"   -U "$EDITOR_ROLE" -v ON_ERROR_STOP=1 -f "$HERE/99_verify_supabase.sql"

# ---------------------------------------------------------------------------
# The dangling-reference diagnostic must run clean on a build that only ever
# contained Anvaya objects: catalog scans, the live probe, and the
# "nothing found" verdict. If Anvaya's own SQL ever grows a reference to a
# relation it does not create, this catches it.
# ---------------------------------------------------------------------------
echo "== dangling-reference diagnostic on the finished build (expect 0 findings) =="
# (verify.sh exports client_min_messages=warning; the diagnostic reports through
#  NOTICEs, so re-enable them for these two runs.)
out=$(PGOPTIONS="-c client_min_messages=notice" "$PSQL" -d "$DB" -U "$EDITOR_ROLE" -v ON_ERROR_STOP=1 -f "$HERE/90_diagnose_dangling_references.sql" 2>&1)
echo "$out" | grep -E 'diag: (NOTHING|[0-9]+ finding)' || { echo "  diagnostic produced no verdict"; exit 1; }
echo "$out" | grep -q 'diag: NOTHING' || { echo "  UNEXPECTED findings:"; echo "$out" | grep 'diag \[' | head -20; exit 1; }

# The self-test: plant the one carrier class that survives a table drop (a
# PL/pgSQL body — bodies are free text with no dependency tracking, and the
# body text mentions "structured" although no such table exists), confirm the
# diagnostic names it, then remove it.
echo "== diagnostic self-test: planted stale function body must be found =="
PGDATABASE="$DB" "$PSQL" -U "$EDITOR_ROLE" -q -c \
  "create function public.__diag_selftest_fn() returns int language plpgsql
     as \$\$ begin perform 1 from structured; return 0; end \$\$;"
out=$(PGOPTIONS="-c client_min_messages=notice" "$PSQL" -d "$DB" -U "$EDITOR_ROLE" -v ON_ERROR_STOP=1 -f "$HERE/90_diagnose_dangling_references.sql" 2>&1)
echo "$out" | grep -q '__diag_selftest_fn' && echo "  planted stale body was found: OK" || { echo "  diagnostic MISSED the planted stale body"; exit 1; }
PGDATABASE="$DB" "$PSQL" -U "$EDITOR_ROLE" -q -c "drop function public.__diag_selftest_fn();"

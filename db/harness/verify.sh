#!/usr/bin/env bash
# Local verification harness for the Anvaya schema.
#
# NOT part of the migration set. It boots a throwaway PostgreSQL, recreates the
# small slice of the Supabase platform the migrations legitimately depend on
# (auth.uid()/auth.role(), storage.buckets/storage.objects, the anon /
# authenticated / service_role roles), applies every migration, then runs the
# behavioural security tests.
#
# Usage:
#   python3 -m venv .venv && .venv/bin/pip install pgserver
#   PGUSER=postgres ./db/harness/verify.sh
set -euo pipefail

PSQL="$(python3 -c 'import pgserver,os;print(os.path.join(os.path.dirname(pgserver.__file__),"pginstall","bin","psql"))')"
PGDATA_DIR="${PGDATA_DIR:-$HOME/.pgdata-anvaya}"
DB="${DB:-anvaya_verify}"
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"

python3 - "$PGDATA_DIR" <<'PY'
import sys, pgserver
pgserver.get_server(sys.argv[1], cleanup_mode=None)
PY

export PGHOST="$PGDATA_DIR"
export PGUSER="${PGUSER:-postgres}"
export PGOPTIONS="-c client_min_messages=warning"

"$PSQL" -d postgres -q -c "drop database if exists $DB;" -c "create database $DB;"
export PGDATABASE="$DB"

echo "== applying Supabase platform stubs =="
"$PSQL" -v ON_ERROR_STOP=1 -q -f "$HERE/00_supabase_stubs.sql"

for pass in 1 2 3; do
  echo "== migration pass $pass =="
  for f in "$ROOT"/db/migrations/*.sql; do
    printf '  %-42s' "$(basename "$f")"
    if out=$("$PSQL" -v ON_ERROR_STOP=1 -q -f "$f" 2>&1); then echo "OK"; else echo "FAIL"; echo "$out" | head -20; exit 1; fi
  done
done

echo "== behavioural tests =="
"$PSQL" -v ON_ERROR_STOP=1 -f "$HERE/10_behaviour_tests.sql"

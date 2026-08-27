-- ============================================================================
-- Anvaya / Rxanvaya — dangling-reference diagnostic (Supabase SQL Editor)
-- ----------------------------------------------------------------------------
-- WHEN TO USE
--   The SQL Editor reports something like
--
--       ERROR: 42P01: relation "structured" does not exist
--
--   for a relation name that appears NOWHERE in the file you just ran. Two
--   verified facts about this repository, so you do not have to re-derive them:
--
--   1. No version of the Anvaya SQL ever referenced a relation named
--      `structured`. Every migration, every sql_editor_part, the single-file
--      build, and every historical branch/PR on GitHub were searched: the word
--      only occurs inside string literals and comments, never as SQL.
--   2. All five parts apply cleanly, in order, on a stock PostgreSQL that
--      reproduces the Supabase permission model (harness/verify.sh proves this
--      on every run).
--
--   So the name in the error came from OUTSIDE the file: either from an object
--   left inside the project by an EARLIER schema iteration (this file's job is
--   to find those), or from SQL that was executed without being part of any
--   file (a stale SQL Editor pane, an ad-hoc snippet, an old local file — see
--   "If nothing is found" at the bottom).
--
-- WHY YOUR TRIGGER SEARCH WAS NOT ENOUGH
--   `information_schema.triggers` only covers ordinary triggers. A table named
--   `structured` that was dropped long ago can still survive, and still raise
--   42P01 today, in exactly one durable place: the BODY of a PL/pgSQL function
--   (or a superuser-only event trigger). Function bodies are free text — they
--   are not parsed at CREATE time, they carry no dependency on the tables they
--   mention, so PostgreSQL will happily keep them for years and raise
--   `relation "structured" does not exist` the moment anything calls them.
--   (Views, RLS policies, rules, indexes and constraints CANNOT dangle this
--   way: dropping the referenced table with CASCADE drops them with it.)
--
--   One red herring to ignore: grepping PostgreSQL's built-in view definitions
--   for '%STRUCTURED%' matches information_schema.user_defined_types, where
--   'STRUCTURED' is just the SQL standard's type-category constant — a string,
--   not a table.
--
-- HOW TO USE
--   1. Paste this whole file into a FRESH SQL Editor tab.
--   2. Set v_needle below to the relation name from your error (no quotes,
--      no schema).
--   3. Run. Read the NOTICES in the Messages panel. Every finding comes with
--      the exact DROP/ALTER statement that removes it.
--   4. The file is read-only: catalog queries and `SELECT ... LIMIT 0` probes
--      only. Nothing is created, altered or dropped by running it.
-- ============================================================================

do $diag$
declare
  -- ==========================================================================
  -- EDIT THIS: the relation name from your 42P01 error, without quotes.
  -- ==========================================================================
  v_needle text := 'structured';

  -- The same name as a wildcard-safe ILIKE pattern, so a needle that happens
  -- to contain % or _ (order_items, 100%) cannot distort the text scans.
  v_pat    text := '%' || replace(replace(replace(v_needle, '\', '\\'),
                                           '%', '\%'),
                                   '_', '\_%') || '%';

  -- Platform schemas that ship with Supabase and cannot contain leftovers of
  -- an Anvaya iteration. Text scans and the live probe skip them to keep the
  -- output readable.
  c_skip text[] := array['pg_catalog', 'information_schema', 'pg_toast',
                         'auth', 'storage', 'supabase_functions',
                         'supabase_realtime', 'realtime', 'graphql',
                         'graphql_public', 'net', 'cron', 'pgsodium', 'vault'];

  v_found int := 0;
  v_fix   text;
  r       record;
begin
  raise notice 'diag: searching % for dangling references to "%" ...', current_database(), v_needle;

  ---------------------------------------------------------------------------
  -- 1. An object literally NAMED like the missing relation?
  --    (an earlier iteration may still have a table/view/sequence of that name)
  ---------------------------------------------------------------------------
  for r in
    select n.nspname, c.relname, c.relkind
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where c.relname = v_needle
       and n.nspname <> all (c_skip)
  loop
    v_found := v_found + 1;
    raise notice 'diag [1 name   ] %.% exists (kind: %). If it is a leftover, DROP it once nothing depends on it.',
      r.nspname, r.relname, r.relkind;
  end loop;

  ---------------------------------------------------------------------------
  -- 2. Event triggers, and the functions they call
  --    Only a superuser can create these, so on a stock Supabase project this
  --    is usually empty — but it is the one object class that fires on EVERY
  --    DDL statement, so it is checked first for a reason. NOTE:
  --    information_schema.triggers does NOT list event triggers; they live in
  --    pg_event_trigger. This is the check your earlier search could not do.
  ---------------------------------------------------------------------------
  for r in
    select e.evtname, n.nspname, p.proname
      from pg_event_trigger e
      join pg_proc p      on p.oid = e.evtfoid
      join pg_namespace n on n.oid = p.pronamespace
  loop
    v_found := v_found + 1;
    raise notice 'diag [2 event  ] event trigger "%" -> %.%( )', r.etname, r.nspname, r.proname;
    raise notice 'diag           fix: DROP EVENT TRIGGER %;', r.etname;
  end loop;

  ---------------------------------------------------------------------------
  -- 3. THE BIG ONE: user-defined function/procedure bodies that mention the
  --    name. A PL/pgSQL body is stored verbatim and never validated against
  --    the catalog at CREATE time, so this is where a dropped table's name
  --    survives, invisible to information_schema.triggers, until something
  --    calls the function.
  ---------------------------------------------------------------------------
  for r in
    select n.nspname, p.proname,
           pg_get_function_identity_arguments(p.oid) as args,
           case p.prokind when 'p' then 'PROCEDURE'
                          when 'a' then 'AGGREGATE'
                          else 'FUNCTION' end      as kind
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname <> all (c_skip)
       and coalesce(p.prosrc, '') ilike v_pat
  loop
    v_found := v_found + 1;
    raise notice 'diag [3 body   ] %.%( %) — % body mentions "%"',
      r.nspname, r.proname, r.args, r.kind, v_needle;
    raise notice 'diag           fix: DROP % %.%(%); (or CREATE OR REPLACE it with a body that no longer references %)',
      r.kind, r.nspname, r.proname, r.args, v_needle;
  end loop;

  ---------------------------------------------------------------------------
  -- 4. Ordinary triggers whose definition mentions the name
  ---------------------------------------------------------------------------
  for r in
    select t.tgname, n.nspname, c.relname, pg_get_triggerdef(t.oid) as def
      from pg_trigger t
      join pg_class c      on c.oid = t.tgrelid
      join pg_namespace n  on n.oid = c.relnamespace
     where not t.tgisinternal
       and n.nspname <> all (c_skip)
       and pg_get_triggerdef(t.oid) ilike v_pat
  loop
    v_found := v_found + 1;
    raise notice 'diag [4 trigger] %.% trigger "%": %', r.nspname, r.relname, r.tgname, r.def;
    raise notice 'diag           fix: DROP TRIGGER % ON %.%;', r.tgname, r.nspname, r.relname;
  end loop;

  ---------------------------------------------------------------------------
  -- 5. Views, materialised views and rules
  ---------------------------------------------------------------------------
  for r in
    select schemaname, viewname from pg_views
     where schemaname <> all (c_skip)
       and definition ilike v_pat
  loop
    v_found := v_found + 1;
    raise notice 'diag [5 view   ] %.%', r.schemaname, r.viewname;
    raise notice 'diag           fix: DROP VIEW %.%;', r.schemaname, r.viewname;
  end loop;

  for r in
    select schemaname, matviewname from pg_matviews
     where schemaname <> all (c_skip)
       and definition ilike v_pat
  loop
    v_found := v_found + 1;
    raise notice 'diag [5 matview] %.%', r.schemaname, r.matviewname;
    raise notice 'diag           fix: DROP MATERIALIZED VIEW %.%;', r.schemaname, r.matviewname;
  end loop;

  ---------------------------------------------------------------------------
  -- 6. RLS policy expressions (pg_get_expr decodes the stored expression tree;
  --    pg_policies shows the same text if you prefer a plain SELECT)
  ---------------------------------------------------------------------------
  for r in
    select pol.polname, n.nspname, c.relname,
           coalesce(pg_get_expr(pol.polqual,      pol.polrelid), '') as using_expr,
           coalesce(pg_get_expr(pol.polwithcheck, pol.polrelid), '') as check_expr
      from pg_policy pol
      join pg_class c     on c.oid = pol.polrelid
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname <> all (c_skip)
       and (pg_get_expr(pol.polqual,      pol.polrelid, true) ilike v_pat
         or pg_get_expr(pol.polwithcheck, pol.polrelid, true) ilike v_pat)
  loop
    v_found := v_found + 1;
    raise notice 'diag [6 policy ] %.% policy "%": using [%s] check [%s]',
      r.nspname, r.relname, r.polname, r.using_expr, r.check_expr;
    raise notice 'diag           fix: DROP POLICY % ON %.%;', r.polname, r.nspname, r.relname;
  end loop;

  ---------------------------------------------------------------------------
  -- 7. Column defaults and generated columns
  ---------------------------------------------------------------------------
  for r in
    select n.nspname, c.relname, a.attname, pg_get_expr(d.adbin, d.adrelid, true) as expr
      from pg_attrdef d
      join pg_class c     on c.oid = d.adrelid
      join pg_namespace n on n.oid = c.relnamespace
      join pg_attribute a on a.attrelid = d.adrelid and a.attnum = d.adnum
     where n.nspname <> all (c_skip)
       and pg_get_expr(d.adbin, d.adrelid, true) ilike v_pat
  loop
    v_found := v_found + 1;
    raise notice 'diag [7 default] %.%.% DEFAULT %', r.nspname, r.relname, r.attname, r.expr;
    raise notice 'diag           fix: ALTER TABLE %.% ALTER COLUMN % DROP DEFAULT;', r.nspname, r.relname, r.attname;
  end loop;

  ---------------------------------------------------------------------------
  -- 8. Check constraints and index predicates
  ---------------------------------------------------------------------------
  for r in
    select n.nspname, c.relname, con.conname, pg_get_constraintdef(con.oid, true) as def
      from pg_constraint con
      join pg_class c     on c.oid = con.conrelid
      join pg_namespace n on n.oid = c.relnamespace
     where con.contype = 'c'
       and n.nspname <> all (c_skip)
       and pg_get_constraintdef(con.oid, true) ilike v_pat
  loop
    v_found := v_found + 1;
    raise notice 'diag [8 con    ] %.% constraint "%": %', r.nspname, r.relname, r.conname, r.def;
    raise notice 'diag           fix: ALTER TABLE %.% DROP CONSTRAINT %;', r.nspname, r.relname, r.conname;
  end loop;

  ---------------------------------------------------------------------------
  -- 9. LIVE PROBE — the catch-all. For every table-like relation in the user
  --    schemas, actually plan a `SELECT * ... LIMIT 0` and catch SQLSTATE
  --    42P01. This finds objects that are broken TODAY even when the missing
  --    name is buried inside an expression the text scans above cannot see.
  --    LIMIT 0 means nothing is read beyond planning; the file stays read-only.
  ---------------------------------------------------------------------------
  for r in
    select n.nspname, c.relname
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where c.relkind in ('r', 'v', 'm', 'p', 'f')
       and n.nspname <> all (c_skip)
     order by 1, 2
  loop
    begin
      execute format('select * from %I.%I limit 0', r.nspname, r.relname);
    exception
      when undefined_table then
        v_found := v_found + 1;
        get stacked diagnostics v_fix = MESSAGE_TEXT;
        raise notice 'diag [9 probe  ] %.% raises 42P01 right now: %', r.nspname, r.relname, v_fix;
      when others then
        null;  -- permission/other errors are not our target; the scans above report those
    end;
  end loop;

  ---------------------------------------------------------------------------
  -- Verdict
  ---------------------------------------------------------------------------
  if v_found = 0 then
    raise notice 'diag: NOTHING in this database references "%".', v_needle;
    raise notice 'diag: The 42P01 therefore came from the SQL that was EXECUTED, not from the database and not from the Anvaya files.';
    raise notice 'diag: Checklist:';
    raise notice 'diag:  (a) The SQL Editor runs EVERY statement currently in the pane, not just what you last pasted. Open a FRESH tab per part.';
    raise notice 'diag:  (b) Re-check the file you are running is the one from this repository — an older local copy from a previous iteration may still say "from <table>";';
    raise notice 'diag:  (c) If the error names one of OUR tables (e.g. public.lab_reports), a previous part did not finish: re-run the parts in order, one at a time.';
  else
    raise notice 'diag: % finding(s). Apply the fix lines above, then re-run the Anvaya part that was failing.', v_found;
  end if;
end
$diag$;

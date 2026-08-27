-- ===========================================================================
-- 0023 — reading level: add 'advanced'
--
-- anvaya_reading_level was created in 0002 as ('standard','simple','very'),
-- from the original three-way reading-level picker. The app now offers a
-- Simple / Advanced choice (src/lib/i18n.tsx, the Settings screen), and every
-- AI surface passes that choice down to ai_generations.reading_level and
-- ai_explanations.reading_level.
--
-- Without this value the persistence layer has to silently rewrite 'advanced'
-- to 'standard', which makes the stored provenance a lie: the row would claim
-- the text was written for a different reading level than the one requested.
--
-- 'standard' is kept — existing rows use it, and it remains the default for
-- server-initiated generations that have no user preference attached.
--
-- Note: ALTER TYPE ... ADD VALUE cannot run inside a transaction block in
-- PostgreSQL versions before 12, and the new value cannot be used in the same
-- transaction that adds it. Run this migration on its own.
-- ===========================================================================

alter type anvaya_reading_level add value if not exists 'advanced';

comment on type anvaya_reading_level is
  'Reading level of generated text. simple/advanced are the two the UI offers; standard is the server default; very is the extra-simple voice register.';

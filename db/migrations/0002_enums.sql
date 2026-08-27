-- ============================================================================
-- Anvaya / RxAnvaya — Supabase migration 0002
-- Enum types
-- ----------------------------------------------------------------------------
-- Purpose   : Every closed vocabulary used by the application, defined once.
-- Depends on: 0001
-- Fresh safe: YES (guarded by pg_type lookups; PostgreSQL has no
--             "CREATE TYPE IF NOT EXISTS")
-- Contract  : Enum members are copied VERBATIM from src/lib/data.ts and
--             src/lib/i18n.tsx. Do not silently add or remove members — the
--             TypeScript unions are the existing contract.
--
--   src/lib/data.ts:7   type LangCode = "en" | "hi" | "bn"
--   src/lib/data.ts:8   type Status   = "normal" | "borderline" | "high" | "low" | "critical"
--   src/lib/i18n.tsx:16 type ReadingMode = "standard" | "simple" | "very"
--   src/lib/data.ts     conf.level: "high" | "moderate"   (only these two occur)
--   src/app/api/answer/route.ts  confidence: "high" | "moderate"
--   src/components/voice.tsx / api/answer  direction: "up" | "down" | "flat"
-- ============================================================================

do $do$
begin
  -- language -----------------------------------------------------------------
  if not exists (select 1 from pg_type where typname = 'anvaya_lang_code') then
    create type anvaya_lang_code as enum ('en', 'hi', 'bn');
  end if;

  -- deterministic result classification --------------------------------------
  -- NOTE: the task brief mentions Low/Normal/High/Critical, but the shipped
  -- application has FIVE states and renders "borderline" as "Needs attention"
  -- (src/lib/i18n.tsx "status.borderline"). The enum therefore keeps all five.
  if not exists (select 1 from pg_type where typname = 'anvaya_test_status') then
    create type anvaya_test_status as enum ('normal', 'borderline', 'high', 'low', 'critical');
  end if;

  -- reading level ------------------------------------------------------------
  if not exists (select 1 from pg_type where typname = 'anvaya_reading_level') then
    create type anvaya_reading_level as enum ('standard', 'simple', 'very');
  end if;

  -- confidence / trust -------------------------------------------------------
  if not exists (select 1 from pg_type where typname = 'anvaya_confidence_level') then
    create type anvaya_confidence_level as enum ('high', 'moderate');
  end if;

  -- trend direction ----------------------------------------------------------
  if not exists (select 1 from pg_type where typname = 'anvaya_trend_dir') then
    create type anvaya_trend_dir as enum ('up', 'down', 'flat');
  end if;

  -- roles --------------------------------------------------------------------
  if not exists (select 1 from pg_type where typname = 'anvaya_role') then
    create type anvaya_role as enum ('patient', 'doctor', 'admin');
  end if;

  if not exists (select 1 from pg_type where typname = 'anvaya_account_status') then
    create type anvaya_account_status as enum ('active', 'suspended', 'closed');
  end if;

  -- consent ------------------------------------------------------------------
  if not exists (select 1 from pg_type where typname = 'anvaya_consent_status') then
    create type anvaya_consent_status as enum ('granted', 'withdrawn', 'expired', 'declined');
  end if;

  if not exists (select 1 from pg_type where typname = 'anvaya_consent_purpose') then
    create type anvaya_consent_purpose as enum (
      'report_parsing',      -- OCR + structured extraction of the uploaded report
      'ai_explanation',      -- anonymised data sent to the LLM for plain-language text
      'rag_grounding',       -- retrieval over the guideline corpus
      'voice_interaction',   -- STT/TTS and voice Q&A
      'longitudinal_trends', -- comparing against the patient's own earlier reports
      'doctor_review'        -- sharing with a reviewing clinician
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'anvaya_consent_channel') then
    create type anvaya_consent_channel as enum ('in_app', 'voice', 'clinic', 'paper', 'imported');
  end if;

  -- report lifecycle ---------------------------------------------------------
  if not exists (select 1 from pg_type where typname = 'anvaya_report_status') then
    create type anvaya_report_status as enum (
      'uploaded',        -- file received, nothing run yet
      'processing',      -- a job is running
      'extracted',       -- structured results present, awaiting patient confirmation
      'analysed',        -- validated + explained
      'in_review',       -- with a clinician
      'released',        -- doctor-signed and patient-facing
      'failed'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'anvaya_upload_channel') then
    -- src/app/upload/page.tsx offers: camera (/scan), file (PDF/JPG/PNG/CSV) and
    -- a "manual entry" sheet. "sample" is the bundled demo report.
    create type anvaya_upload_channel as enum ('camera', 'file', 'csv', 'manual', 'sample');
  end if;

  -- processing jobs ----------------------------------------------------------
  if not exists (select 1 from pg_type where typname = 'anvaya_job_status') then
    create type anvaya_job_status as enum ('queued', 'running', 'succeeded', 'failed', 'cancelled');
  end if;

  if not exists (select 1 from pg_type where typname = 'anvaya_job_stage') then
    -- Superset of the 5 friendly labels in src/lib/i18n.tsx (process.s1..s5),
    -- extended with the stages the architecture document requires.
    create type anvaya_job_stage as enum (
      'ocr',            -- process.s1 "Reading the report"
      'parsing',        -- process.s2 "Identifying your test results"
      'normalisation',  -- unit/synonym standardisation
      'validation',     -- process.s3 "Checking normal ranges"
      'anonymisation',  -- PII strip before any external call
      'rag',            -- retrieval
      'explanation',    -- process.s4 + s5 "Finding patterns" / "Preparing a simple explanation"
      'review',
      'release'
    );
  end if;

  -- provenance ---------------------------------------------------------------
  if not exists (select 1 from pg_type where typname = 'anvaya_value_source') then
    create type anvaya_value_source as enum (
      'ocr',
      'csv_import',
      'manual_entry',
      'patient_correction',
      'doctor_correction'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'anvaya_range_origin') then
    -- PIPELINE in src/lib/data.ts: "Your lab's own printed ranges are used —
    -- not generic internet numbers." So the printed range is a first-class
    -- origin alongside the curated ICMR/WHO catalogue.
    create type anvaya_range_origin as enum ('lab_printed', 'catalogue');
  end if;

  -- review workflow ----------------------------------------------------------
  if not exists (select 1 from pg_type where typname = 'anvaya_review_status') then
    create type anvaya_review_status as enum (
      'draft',
      'pending_review',
      'needs_edit',
      'approved',
      'released',
      'withdrawn'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'anvaya_version_origin') then
    create type anvaya_version_origin as enum ('ai_draft', 'doctor_edit', 'reissue');
  end if;

  if not exists (select 1 from pg_type where typname = 'anvaya_text_author') then
    create type anvaya_text_author as enum ('ai', 'doctor', 'human_editor');
  end if;

  -- AI generation ------------------------------------------------------------
  if not exists (select 1 from pg_type where typname = 'anvaya_generation_purpose') then
    create type anvaya_generation_purpose as enum (
      'test_explanation',
      'pattern_insight',
      'report_summary',
      'qa_answer',
      'translation'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'anvaya_generation_status') then
    create type anvaya_generation_status as enum ('queued', 'running', 'succeeded', 'failed', 'blocked');
  end if;

  -- Q&A ----------------------------------------------------------------------
  if not exists (select 1 from pg_type where typname = 'anvaya_message_role') then
    create type anvaya_message_role as enum ('user', 'assistant');
  end if;

  if not exists (select 1 from pg_type where typname = 'anvaya_qa_channel') then
    -- src/app/ask/page.tsx has a text input and a voice sheet.
    create type anvaya_qa_channel as enum ('text', 'voice');
  end if;

  -- storage / files ----------------------------------------------------------
  if not exists (select 1 from pg_type where typname = 'anvaya_file_kind') then
    create type anvaya_file_kind as enum (
      'original',        -- as-uploaded photo / PDF
      'processed_image', -- deskewed / contrast-fixed render
      'ocr_artifact',    -- OCR engine output blob, if retained
      'pdf_export',      -- patient or doctor PDF
      'tts_audio'        -- generated narration
    );
  end if;

  -- deletion -----------------------------------------------------------------
  if not exists (select 1 from pg_type where typname = 'anvaya_deletion_scope') then
    create type anvaya_deletion_scope as enum ('single_report', 'all_reports', 'account');
  end if;

  if not exists (select 1 from pg_type where typname = 'anvaya_deletion_status') then
    create type anvaya_deletion_status as enum ('requested', 'in_progress', 'completed', 'rejected', 'failed');
  end if;

  -- errors -------------------------------------------------------------------
  if not exists (select 1 from pg_type where typname = 'anvaya_severity') then
    create type anvaya_severity as enum ('debug', 'info', 'warning', 'error', 'critical');
  end if;

  if not exists (select 1 from pg_type where typname = 'anvaya_component') then
    create type anvaya_component as enum (
      'api', 'storage', 'ocr', 'parser', 'validator', 'anonymiser', 'rag', 'llm', 'tts', 'stt', 'database', 'other'
    );
  end if;

end
$do$;

comment on type anvaya_test_status is
  'Deterministic rule-engine output only. NEVER written by the LLM. Source of truth lives in public.validation_results; this enum is reused for denormalised display copies.';

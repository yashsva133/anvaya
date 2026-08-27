-- ============================================================================
-- Anvaya / RxAnvaya — Supabase migration 0015
-- Voice sessions, Q&A messages, answer feedback
-- ----------------------------------------------------------------------------
-- Purpose   : Persist only what the voice/Q&A feature actually needs: a session,
--             the question, its transcript, the grounded answer, a reference to
--             any audio, the language, and the sources/confidence the UI shows.
-- Depends on: 0003, 0007, 0012
-- Fresh safe: YES
-- Contract  : Maps onto the two API routes that already exist:
--               POST /api/answer   request  { q: string, lang: string }
--                                  response { matched, answer, sources: number,
--                                               confidence: "high" | "moderate" }
--                                  (src/app/api/answer/route.ts)
--               POST /api/feedback request  { helpful: boolean }
--                                  response { ok, persisted: false, mode: "demo" }
--                                  (src/app/api/feedback/route.ts)
--             `sources_count` and `confidence_level` are the persistence of the
--             two response fields; `answer_feedback` is what turns the current
--             `persisted: false` stub into a real record.
--
--             Audio is NOT stored in PostgreSQL. src/components/voice.tsx
--             simulates STT and uses the browser's SpeechSynthesis for playback,
--             so there is no audio payload today; when real STT/TTS is wired up
--             the bytes go to Supabase Storage and these columns hold the key.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- voice_sessions
-- ---------------------------------------------------------------------------
create table if not exists public.voice_sessions (
  id           uuid primary key default gen_random_uuid(),
  patient_id   uuid not null,
  lab_report_id uuid,                                   -- the report the conversation is about
  channel      anvaya_qa_channel not null default 'voice',
  language     anvaya_lang_code not null default 'en',
  stt_engine   text,
  tts_engine   text,
  device_hint  text,                                    -- coarse device/locale info, never an identifier
  started_at   timestamptz not null default now(),
  ended_at     timestamptz,
  turn_count   smallint not null default 0 check (turn_count >= 0),
  created_at   timestamptz not null default now(),

  constraint vs_fk_patient foreign key (patient_id) references public.patients (id) on delete cascade,
  constraint vs_fk_report  foreign key (lab_report_id) references public.lab_reports (id) on delete set null,
  constraint vs_ended_after_start check (ended_at is null or ended_at >= started_at)
);

comment on table public.voice_sessions is
  'A conversation container. Scoped to the patient and, optionally, to the report being discussed, so answers can be constrained to that report''s results.';

create index if not exists vs_patient_idx on public.voice_sessions (patient_id, started_at desc);
create index if not exists vs_report_idx on public.voice_sessions (lab_report_id) where lab_report_id is not null;
create index if not exists vs_open_idx on public.voice_sessions (started_at desc) where ended_at is null;

-- ---------------------------------------------------------------------------
-- qa_messages
-- ---------------------------------------------------------------------------
create table if not exists public.qa_messages (
  id                uuid primary key default gen_random_uuid(),
  session_id        uuid not null,
  parent_message_id uuid,
  role              anvaya_message_role not null,
  body_md           text not null,
  body_plain        text,                               -- TTS-ready form
  language          anvaya_lang_code not null default 'en',
  -- voice specifics
  transcript        text,                               -- STT output for a user turn
  transcript_confidence numeric(5,4) check (transcript_confidence is null or (transcript_confidence >= 0 and transcript_confidence <= 1)),
  audio_bucket      text,
  audio_path        text,                               -- storage key; the audio itself is never in PostgreSQL
  audio_duration_ms int check (audio_duration_ms is null or audio_duration_ms >= 0),
  -- grounding, mirroring the /api/answer response shape
  generation_id     uuid,
  matched_topic     text,                               -- response field `matched`
  sources_count     smallint not null default 0 check (sources_count >= 0),
  confidence_level  anvaya_confidence_level,            -- response field `confidence`
  is_fallback       boolean not null default false,     -- the FALLBACK answer in /api/answer
  latency_ms        int check (latency_ms is null or latency_ms >= 0),
  created_at        timestamptz not null default now(),

  constraint qa_fk_session foreign key (session_id) references public.voice_sessions (id) on delete cascade,
  constraint qa_fk_parent  foreign key (parent_message_id) references public.qa_messages (id) on delete set null,
  constraint qa_fk_generation foreign key (generation_id) references public.ai_generations (id) on delete set null,
  constraint qa_audio_pair check (
    (audio_bucket is null and audio_path is null) or
    (audio_bucket is not null and audio_path is not null)
  ),
  constraint qa_assistant_needs_generation check (
    role <> 'assistant' or generation_id is not null or is_fallback
  )
);

comment on table public.qa_messages is
  'One row per chat turn. The app already models messages as { role: "user" | "assistant", text, sources?, confidence? } (src/app/ask/page.tsx), so this shape is a direct persistence of that structure.';
comment on column public.qa_messages.audio_path is
  'Reference into a PRIVATE storage bucket. Raw audio is health data and must not be served from a public bucket.';

create index if not exists qa_session_idx on public.qa_messages (session_id, created_at);
create index if not exists qa_parent_idx on public.qa_messages (parent_message_id) where parent_message_id is not null;
create index if not exists qa_generation_idx on public.qa_messages (generation_id) where generation_id is not null;
create index if not exists qa_created_idx on public.qa_messages (created_at desc);

drop trigger if exists qa_immutable on public.qa_messages;
create trigger qa_immutable
  before update or delete on public.qa_messages
  for each row execute function public.guard_immutable_row();

-- ---------------------------------------------------------------------------
-- answer_feedback
-- ---------------------------------------------------------------------------
create table if not exists public.answer_feedback (
  id            uuid primary key default gen_random_uuid(),
  qa_message_id uuid not null,
  patient_id    uuid not null,
  helpful       boolean not null,
  comment       text,
  created_at    timestamptz not null default now(),

  constraint fb_fk_message foreign key (qa_message_id) references public.qa_messages (id) on delete cascade,
  constraint fb_fk_patient foreign key (patient_id) references public.patients (id) on delete cascade,
  constraint fb_one_per_patient unique (qa_message_id, patient_id)
);

comment on table public.answer_feedback is
  'Helpfulness votes from the Ask AI screen. Replaces the current no-op endpoint that returns { persisted: false, mode: "demo" }.';

create index if not exists fb_message_idx on public.answer_feedback (qa_message_id);
create index if not exists fb_patient_idx on public.answer_feedback (patient_id, created_at desc);

-- Votes are append-only; a changed mind is a new row in a real design, but the
-- unique constraint above means one vote per patient per answer, so we allow the
-- client to revoke by deleting its own row (policy in 0018) rather than editing.

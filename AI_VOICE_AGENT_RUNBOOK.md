# Multilingual voice agent — runbook

What was built, how it reuses the chatbot pipeline, and what is still required
to run it in production.

**Scope:** the voice agent and the multilingual answer path. Report ingestion
(PaddleOCR) is untouched.

---

## 1. What is new

```
src/lib/ai/
  languages.ts      NEW — the language registry: 14 languages, BCP-47 tags,
                    script ranges for detection, server-side validation
  translations.ts   NEW — curated safety text (refusal + emergency) in all 14
                    languages, plus the spoken greeting
  mock-phrases.ts   NEW — mock-provider phrasebook in all 14 languages, so the
                    multilingual path is testable without a GPU
  prompts.ts        ANSWER LANGUAGE now comes from the registry; new `channel`
                    (text|voice) formatting rules; prompt 2026-08-27.2
  guardrails.ts     refusals and escalations are returned IN the answer
                    language; emergency keywords for 12 more languages;
                    coverage flags recorded in safety_flags
  agent.ts          `answerLang` + `channel` options; language substitution is
                    recorded instead of happening silently
  types.ts          AgentAnswer.answer_lang / .language_note
  reportContext.ts  NEW — the personalization payload, extracted from the chat
                    page so both UIs send the identical thing

src/lib/voice/
  types.ts          Web Speech API typings + error mapping
  recognition.ts    STT controller: endpointing, restart, error normalisation
  micLevel.ts       real microphone level via AnalyserNode
  synthesis.ts      TTS: voice selection, unit/markdown rewriting, chunking
  recorder.ts       MediaRecorder + /api/stt path (Firefox has no STT API)
  useVoiceAgent.ts  the state machine: listen → ask → speak → listen

src/app/api/
  stt/route.ts      NEW — server-side transcription (OpenAI-compatible)
  tts/route.ts      NEW — server-side speech (OpenAI-compatible)
  answer/route.ts   accepts `answerLang` + `channel`; returns `answer_lang`,
                    `language_note`, `channel`
  ai/status/route.ts reports supported languages + voice provider config
  health/route.ts    reports language count + whether server STT/TTS are set

src/app/voice/page.tsx   NEW — full-screen voice agent
src/components/voice.tsx rewritten — was a scripted animation, now the real agent
src/app/ask/page.tsx     uses the shared reportContext builder
scripts/fake-voice.mjs   NEW — stand-in speech provider, for verifying wiring
```

---

## 2. It is the chatbot pipeline, not a parallel one

A voice turn is:

```
microphone → transcript → POST /api/answer → guardrails → speechSynthesis
                              │
                              └── the SAME endpoint the chat uses, with the
                                  SAME report payload
```

`useVoiceAgent` sends:

```ts
{
  q:          "<transcript>",
  lang:       "en",          // the app's UI language
  answerLang: "ta",          // the language the person SPOKE
  channel:    "voice",       // spoken formatting: no bullets, no **
  reading:    "simple",
  session:    "<per-browser id>",
  report:     { reportId, dateLabel, age, gender, results[], previous? }
}
```

`report` is built by `src/lib/ai/reportContext.ts`, which the chat page also
calls, so the two surfaces cannot drift into different personalization. The
rules that apply are the server's, not the client's: test ids are whitelisted
against the catalogue, statuses and reference ranges are re-derived server-side,
and no free text beyond two date labels crosses the boundary.

Consequence: a voice answer is grounded in the same numbers, carries the same
citations, is screened by the same guardrails and lands in the same `qa_messages`
/ `ai_generations` rows as a typed one.

---

## 3. What "multilingual" covers, precisely

Fourteen languages: `en hi bn mr te ta gu ur kn or ml pa ne as`.

| Capability | Coverage |
| --- | --- |
| Ask (browser STT) | whatever the browser supports for that BCP-47 tag |
| Ask (server STT) | any language Whisper supports, when `STT_BASE_URL` is set |
| Answer language | all 14, via the model |
| Answer language, no model | English or Hindi only — see §4 |
| Refusal / escalation text | all 14, curated |
| UI chrome | en / hi / bn (the rest fall back to English) |
| Read aloud | any language the device has a voice for, else `TTS_BASE_URL` |

`answer_lang` in the response is the language the text is *actually* written in.
It equals what was requested except in the substitution case, which also sets
`language_note`.

---

## 4. The honest limitation: rule fallback is English + Hindi

`src/lib/ai/rules.ts` — the deterministic answers used when no model is
configured, or a model call fails — exists only in English and Hindi. A Tamil
turn with no model therefore cannot be answered in Tamil. Rather than pretend,
the pipeline:

1. answers in English,
2. records `language_substituted:ta->en` in `safety_flags`,
3. returns `language_note: "rule_answers_only_in_en_hi;requested_ta"`,
4. and the UI shows which language the answer arrived in.

With a real model configured (`AI_PROVIDER=ollama|openai|vertex`), or with
`AI_PROVIDER=mock` for development, all 14 languages answer in their own
language.

---

## 5. Safety in a language you may not read

Two changes matter here:

**Refusals are localized.** If the model is refused or its output is replaced,
the replacement text is `safeRedirect(answerLang)`. A Tamil speaker whose
question triggered a refusal now reads Tamil, not English.

**Emergency keywords were extended.** `guardInput()` escalates "chest pain /
cannot breathe / unconscious / poison" without a model in the loop. Those
patterns were English + Hindi only, so a Tamil speaker describing chest pain
would previously have received a polite answer instead of "go to a hospital
now". Twelve more languages now have those keywords
(`EMERGENCY_REQUESTS_MULTILINGUAL` in `guardrails.ts`).

Two limits, stated rather than hidden:

* The keywords are keywords, not a classifier. They use the specific
  multi-word forms a person says, not bare body-part words, to keep false
  positives down. A miss is possible.
* The *output* patterns (diagnosis claims, dosing advice) are still English +
  Hindi. For another language, every turn is flagged
  `output_guard_language_uncovered:<lang>` so a reviewer can see exactly which
  answers went through the weaker screening. Numeric grounding and the refusal
  check are language-independent and still apply.
* Only the English and Hindi safety strings have been through clinical review;
  the other twelve are new translations pending native-speaker review.
  `/api/ai/status` reports this under `languages.safety_review`.

---

## 6. Browser support, and the fallbacks

| Browser | Speech-to-text | Text-to-speech |
| --- | --- | --- |
| Chrome / Edge | Web Speech API | device voices |
| Safari | Web Speech API | device voices |
| Firefox | **not available** → `/api/stt` | device voices |

`capabilities.stt` reports which path is in use, and the panel says so on
screen: "This browser cannot listen on its own, so your voice is transcribed on
the server." When neither is available, the typed input is always present — a
voice agent that silently does nothing is the worst outcome.

TTS falls back in this order: exact BCP-47 voice → same language subtag → a
language sharing the script (Hindi↔Marathi↔Nepali, Bengali↔Assamese) →
`/api/tts` → tell the user, and never play an English voice over Tamil script.

---

## 7. Running it

### 7.1 Development, no model and no keys

```bash
AI_PROVIDER=mock npm run dev
```

Open `/voice`, pick a language, press the microphone. `AI_PROVIDER=mock`
composes answers from the report values in the requested language, so the whole
multilingual path — retrieval, prompt, guardrails, response shaping — is
exercised without a GPU. With no `AI_PROVIDER` at all, English and Hindi still
answer from the rules and the other languages hit the §4 substitution.

### 7.2 Verifying the server speech routes without a key

```bash
node scripts/fake-voice.mjs          # OpenAI-compatible endpoints on :8788

STT_BASE_URL=http://127.0.0.1:8788/v1 \
TTS_BASE_URL=http://127.0.0.1:8788/v1 \
AI_PROVIDER=mock npm run dev
```

```bash
curl -s localhost:3000/api/stt -F "audio=@question.webm" -F "lang=ta"
# {"ok":true,"text":"Why is my hemoglobin low?","detected_language":"ta",
#  "engine":"whisper:whisper-fake", ...}

curl -s -D- localhost:3000/api/tts -H 'Content-Type: application/json' \
  -d '{"text":"உங்கள் ஹீமோகுளோபின் 10.5 g/dL உள்ளது.","lang":"ta"}' -o out.wav
# HTTP/1.1 200 OK / content-type: audio/wav / x-anvaya-lang: ta
```

The fake provider does not transcribe or synthesise real audio — it proves the
request construction, response handling and byte streaming.

### 7.3 Production

`.env.local`:

```bash
AI_PROVIDER=ollama
AI_BASE_URL=http://127.0.0.1:11434
AI_MODEL=medgemma:4b
STT_BASE_URL=...        # optional; needed for Firefox
TTS_BASE_URL=...        # optional; needed where voices are missing
SUPABASE_URL=...        # optional; enables writing the AI tables
```

---

## 8. Verification performed

Against `next dev` with `AI_PROVIDER=mock` (2026-08-27):

| Check | Result |
| --- | --- |
| Tamil voice turn, own report values | `answer_lang: ta`, answer in Tamil quoting 10.5 / 7.2 / 154 |
| Telugu / Marathi / Bengali / Urdu turns | `answer_lang` matches, answer in that script |
| `answerLang: "fr"` (unsupported) | resolves to `en`, no error |
| Tamil "chest pain" | `input_blocked:emergency`, escalation text in Tamil |
| English "do I have diabetes?" | `input_blocked:diagnosis`, refusal in English |
| No model configured, Tamil question | English answer + `language_substituted:ta->en` + `language_note` |
| `POST /api/stt` against fake provider | `ok:true`, `detected_language: ta`, `engine: whisper:whisper-fake` |
| `POST /api/tts` against fake provider | 98,710 bytes, `content-type: audio/wav`, `x-anvaya-lang: ta` |
| `/api/stt`, `/api/tts` unconfigured | 503 `not_configured` with a hint |
| `GET /api/ai/status` | 14 languages, prompt `2026-08-27.2`, voice config |
| `/voice`, `/ask`, `/dashboard` | 200; `/voice` renders all 14 language options |
| `tsc --noEmit`, `eslint .` | clean (4 pre-existing warnings in untouched files) |

**Not verified here, and why:** `next build` cannot complete in this sandbox
because `src/app/layout.tsx` fetches Inter and Noto Sans Devanagari from
`fonts.googleapis.com`, which is unreachable (curl returns 000). This is
pre-existing and unrelated to the voice work — `next dev` runs fine and warns
that it used a fallback font. Microphone capture, `speechSynthesis` playback and
browser speech recognition cannot be exercised from a headless sandbox either;
those paths are exercised in a browser.

---

## 9. Next steps

1. **Native-speaker review** of the twelve new safety strings and greetings in
   `src/lib/ai/translations.ts`, then add those languages to
   `REVIEWED_LANGUAGES`.
2. **Output guardrails per script.** The `output_guard_language_uncovered` flag
   marks every turn that needs it; extending `DIAGNOSIS_OUTPUT` /
   `DOSING_OUTPUT` to the major scripts removes it.
3. **Rule answers in more languages**, which would remove the §4 substitution
   for the offline path.
4. **Voice sessions in Postgres.** `voice_sessions` already exists in the schema
   (`db/migrations/0015_qa_voice.sql`); `persistTurn` writes `qa_messages` today,
   and the voice session row is the natural place to record the spoken language
   and the STT engine.
5. **Streaming TTS.** Answers are spoken after the full response; chunked
   streaming would cut the perceived latency roughly in half.

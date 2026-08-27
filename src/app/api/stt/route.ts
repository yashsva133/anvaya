// ---------------------------------------------------------------------------
// POST /api/stt — server-side speech-to-text.
//
// WHY THIS EXISTS
// The browser's SpeechRecognition API does not exist in Firefox. The voice
// agent records audio there (src/lib/voice/recorder.ts) and posts it here, so
// the same voice conversation works in every browser instead of only three.
//
// It forwards to any OpenAI-compatible /audio/transcriptions endpoint —
// OpenAI, Groq, Together, or a self-hosted faster-whisper server — and is
// switched on entirely by STT_BASE_URL. With nothing configured it returns
// 503 { ok:false, reason:"not_configured" } rather than an HTML error page,
// because the client branches on that field to decide whether to offer typing.
//
// PRIVACY
// The audio is a few seconds of a person's voice about their health. It is
// forwarded to the configured provider and never written to disk, never logged
// and never persisted to the database. The transcript that comes back is passed
// to /api/answer, which applies the same de-identification as a typed question.
// ---------------------------------------------------------------------------

import { NextResponse } from "next/server";
import { describeVoiceEnv, loadVoiceEnv } from "@/lib/ai/voiceEnv";
import { toAnswerLang } from "@/lib/ai/languages";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** GET — is server-side transcription available? No secrets in the response. */
export async function GET() {
  const env = loadVoiceEnv();
  return NextResponse.json({ ok: env.sttConfigured, stt: describeVoiceEnv(env).stt });
}

export async function POST(req: Request) {
  const env = loadVoiceEnv();
  const started = Date.now();

  if (!env.sttConfigured || !env.stt.baseUrl) {
    return NextResponse.json(
      {
        ok: false,
        reason: "not_configured",
        hint: "Set STT_BASE_URL (and STT_API_KEY if the provider needs one) to enable server-side transcription.",
      },
      { status: 503 }
    );
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ ok: false, reason: "empty" }, { status: 400 });
  }

  const audio = form.get("audio");
  if (!(audio instanceof Blob) || audio.size === 0) {
    return NextResponse.json({ ok: false, reason: "empty" }, { status: 400 });
  }
  if (audio.size > env.stt.maxBytes) {
    return NextResponse.json(
      { ok: false, reason: "too_large", max_bytes: env.stt.maxBytes },
      { status: 413 }
    );
  }

  // Validated, not trusted: an unknown code falls back to letting the model
  // detect the language itself rather than forcing a wrong one.
  const requested = toAnswerLang(form.get("lang"), "en");
  const explicitLang = typeof form.get("lang") === "string" && form.get("lang") !== "";

  const upstream = new FormData();
  upstream.append("model", env.stt.model);
  upstream.append("file", audio, "question.webm");
  // Whisper wants an ISO 639-1 code; our language codes already are. Passing it
  // when the user picked a language improves accuracy on short utterances,
  // where auto-detection is weakest.
  if (explicitLang) upstream.append("language", requested);
  upstream.append("response_format", "verbose_json");
  upstream.append("temperature", "0");

  try {
    const res = await fetch(`${env.stt.baseUrl}/audio/transcriptions`, {
      method: "POST",
      headers: env.stt.apiKey ? { Authorization: `Bearer ${env.stt.apiKey}` } : undefined,
      body: upstream,
      signal: AbortSignal.timeout(env.stt.timeoutMs),
    });

    if (!res.ok) {
      return NextResponse.json(
        { ok: false, reason: "upstream", status: res.status },
        { status: 502 }
      );
    }

    // verbose_json gives { text, language, duration }; some self-hosted servers
    // answer with { text } only, so every field is read defensively.
    const data = (await res.json()) as {
      text?: unknown;
      language?: unknown;
      duration?: unknown;
    };
    const text = typeof data.text === "string" ? data.text.trim() : "";
    if (!text) {
      return NextResponse.json({ ok: false, reason: "empty" }, { status: 422 });
    }

    return NextResponse.json({
      ok: true,
      // Capped for the same reason a typed question is: it becomes a prompt.
      text: text.slice(0, 1000),
      detected_language: typeof data.language === "string" ? data.language : undefined,
      duration_s: typeof data.duration === "number" ? data.duration : undefined,
      engine: `whisper:${env.stt.model}`,
      latency_ms: Date.now() - started,
    });
  } catch (e) {
    const timedOut = e instanceof Error && e.name === "TimeoutError";
    return NextResponse.json(
      { ok: false, reason: "upstream", detail: timedOut ? "timeout" : "unreachable" },
      { status: 502 }
    );
  }
}

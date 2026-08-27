// ---------------------------------------------------------------------------
// POST /api/tts — server-side text-to-speech.
//
// WHY THIS EXISTS
// `speechSynthesis` can only speak a language the device has a voice for, and
// most desktop Linux installations ship English alone. For a product whose
// entire promise is "ask in your own language", a Tamil answer that cannot be
// spoken is a broken feature, not a missing nicety. This route is the fallback:
// the browser tries its own voices first (free, instant, offline) and only
// comes here when it has nothing for the language.
//
// It forwards to any OpenAI-compatible /audio/speech endpoint and is switched
// on entirely by TTS_BASE_URL. With nothing configured it returns 503 JSON,
// which is what lets the client say "no voice installed for Tamil" instead of
// playing an English voice over Tamil script.
//
// NOTE ON LANGUAGE: the OpenAI-compatible protocol has no `language` field —
// the language is carried by the text itself and by the voice. So only the
// standard fields are sent; providers that reject unknown fields keep working.
// ---------------------------------------------------------------------------

import { NextResponse } from "next/server";
import { describeVoiceEnv, loadVoiceEnv } from "@/lib/ai/voiceEnv";
import { toAnswerLang } from "@/lib/ai/languages";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

interface TtsBody {
  text?: unknown;
  lang?: unknown;
  voice?: unknown;
}

/** GET — is server-side speech available? */
export async function GET() {
  const env = loadVoiceEnv();
  return NextResponse.json({ ok: env.ttsConfigured, tts: describeVoiceEnv(env).tts });
}

export async function POST(req: Request) {
  const env = loadVoiceEnv();

  if (!env.ttsConfigured || !env.tts.baseUrl) {
    return NextResponse.json(
      {
        ok: false,
        reason: "not_configured",
        hint: "Set TTS_BASE_URL (and TTS_API_KEY if required) to enable server-side speech.",
      },
      { status: 503 }
    );
  }

  let body: TtsBody = {};
  try {
    body = (await req.json()) as TtsBody;
  } catch {
    return NextResponse.json({ ok: false, reason: "empty" }, { status: 400 });
  }

  const text = typeof body.text === "string" ? body.text.trim().slice(0, env.tts.maxChars) : "";
  if (!text) {
    return NextResponse.json({ ok: false, reason: "empty" }, { status: 400 });
  }

  // Validated rather than trusted; the language is echoed back so the client can
  // confirm what it got.
  const lang = toAnswerLang(body.lang, "en");
  const voice =
    typeof body.voice === "string" && /^[a-zA-Z0-9_.-]{1,64}$/.test(body.voice)
      ? body.voice
      : env.tts.voice;

  try {
    const res = await fetch(`${env.tts.baseUrl}/audio/speech`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(env.tts.apiKey ? { Authorization: `Bearer ${env.tts.apiKey}` } : {}),
      },
      body: JSON.stringify({
        model: env.tts.model,
        input: text,
        voice,
        response_format: env.tts.format,
      }),
      signal: AbortSignal.timeout(env.tts.timeoutMs),
    });

    if (!res.ok) {
      return NextResponse.json(
        { ok: false, reason: "upstream", status: res.status },
        { status: 502 }
      );
    }

    const audio = await res.arrayBuffer();
    if (audio.byteLength === 0) {
      return NextResponse.json({ ok: false, reason: "empty" }, { status: 502 });
    }

    return new NextResponse(audio, {
      status: 200,
      headers: {
        // The upstream content type is authoritative; default to the configured
        // format so a provider that omits the header still plays.
        "Content-Type": res.headers.get("content-type") ?? `audio/${env.tts.format}`,
        "Content-Length": String(audio.byteLength),
        "Cache-Control": "no-store",
        "X-Anvaya-Lang": lang,
        "X-Anvaya-Voice": voice,
      },
    });
  } catch (e) {
    const timedOut = e instanceof Error && e.name === "TimeoutError";
    return NextResponse.json(
      { ok: false, reason: "upstream", detail: timedOut ? "timeout" : "unreachable" },
      { status: 502 }
    );
  }
}

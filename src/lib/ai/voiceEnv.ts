// ---------------------------------------------------------------------------
// Voice provider configuration (server side).
//
// The browser's own Web Speech API covers speech-to-text on Chrome/Edge/Safari
// and text-to-speech wherever a voice is installed. Both have holes this config
// fills:
//
//   STT  Firefox has no SpeechRecognition at all.
//   TTS  Desktop Linux typically ships English voices only, so a Tamil or
//        Bengali answer has nothing to play it with.
//
// Both routes speak the OpenAI-compatible protocol (/audio/transcriptions and
// /audio/speech), which means Ollama-free self-hosted Whisper servers, Groq,
// Together, OpenAI and vLLM-adjacent stacks all work without a code change.
//
// As everywhere else in this codebase: no secret has a default, and when a
// provider is not configured the route says so instead of pretending.
// ---------------------------------------------------------------------------

export interface SttConfig {
  /** Base URL of an OpenAI-compatible server, e.g. http://127.0.0.1:8000/v1 */
  baseUrl?: string;
  apiKey?: string;
  /** Model id, e.g. "whisper-1" or "whisper-large-v3-turbo". */
  model: string;
  timeoutMs: number;
  /** Upload cap; a voice question never needs more than a few hundred KB. */
  maxBytes: number;
}

export interface TtsConfig {
  baseUrl?: string;
  apiKey?: string;
  model: string;
  /** Default voice; a per-request `voice` overrides it. */
  voice: string;
  /** mp3 | opus | aac | flac | wav — whatever the upstream accepts. */
  format: string;
  timeoutMs: number;
  /** Characters accepted per request. */
  maxChars: number;
}

export interface VoiceEnv {
  stt: SttConfig;
  tts: TtsConfig;
  /** True when the credentials for a real call are present. */
  sttConfigured: boolean;
  ttsConfigured: boolean;
}

function str(name: string): string | undefined {
  const v = process.env[name];
  if (!v || v.trim() === "") return undefined;
  const t = v.trim();
  if (/^(your[_-]|change[_-]?me|xxx+|placeholder|todo)$/i.test(t)) return undefined;
  return t;
}

function num(name: string, fallback: number): number {
  const raw = str(name);
  if (raw === undefined) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

function withTrailingSlash(url: string): string {
  return url.endsWith("/") ? url.slice(0, -1) : url;
}

export function loadVoiceEnv(): VoiceEnv {
  const sttBaseUrl = str("STT_BASE_URL") ?? str("WHISPER_BASE_URL");
  const ttsBaseUrl = str("TTS_BASE_URL");

  return {
    stt: {
      baseUrl: sttBaseUrl ? withTrailingSlash(sttBaseUrl) : undefined,
      apiKey: str("STT_API_KEY") ?? str("WHISPER_API_KEY") ?? str("OPENAI_API_KEY"),
      model: str("STT_MODEL") ?? str("WHISPER_MODEL") ?? "whisper-1",
      timeoutMs: Math.max(2000, Math.floor(num("STT_TIMEOUT_MS", 30000))),
      maxBytes: Math.max(64_000, Math.floor(num("STT_MAX_BYTES", 8_000_000))),
    },
    tts: {
      baseUrl: ttsBaseUrl ? withTrailingSlash(ttsBaseUrl) : undefined,
      apiKey: str("TTS_API_KEY") ?? str("OPENAI_API_KEY"),
      model: str("TTS_MODEL") ?? "gpt-4o-mini-tts",
      voice: str("TTS_VOICE") ?? "alloy",
      format: str("TTS_FORMAT") ?? "mp3",
      timeoutMs: Math.max(2000, Math.floor(num("TTS_TIMEOUT_MS", 20000))),
      maxChars: Math.max(200, Math.floor(num("TTS_MAX_CHARS", 2000))),
    },
    sttConfigured: Boolean(sttBaseUrl),
    ttsConfigured: Boolean(ttsBaseUrl),
  };
}

/** Non-secret description, safe to return from /api/ai/status. */
export function describeVoiceEnv(env: VoiceEnv) {
  return {
    stt: {
      configured: env.sttConfigured,
      base_url: env.stt.baseUrl ?? null,
      model: env.sttConfigured ? env.stt.model : null,
      max_bytes: env.stt.maxBytes,
      note: env.sttConfigured
        ? "OpenAI-compatible /audio/transcriptions"
        : "set STT_BASE_URL to enable server-side transcription (needed for Firefox)",
    },
    tts: {
      configured: env.ttsConfigured,
      base_url: env.tts.baseUrl ?? null,
      model: env.ttsConfigured ? env.tts.model : null,
      voice: env.ttsConfigured ? env.tts.voice : null,
      format: env.tts.format,
      note: env.ttsConfigured
        ? "OpenAI-compatible /audio/speech"
        : "set TTS_BASE_URL to enable server-side speech for languages with no installed voice",
    },
  };
}

// ---------------------------------------------------------------------------
// Record-and-upload speech-to-text — the fallback path.
//
// The Web Speech API is Chrome/Edge/Safari only; Firefox has never shipped it.
// Without this path the voice agent would simply not work there, so audio is
// recorded with MediaRecorder and transcribed by /api/stt (any OpenAI-compatible
// Whisper endpoint). When that route is not configured either, the UI falls back
// to typing — a voice agent that silently does nothing is the worst outcome.
// ---------------------------------------------------------------------------

import type { AnswerLang } from "@/lib/ai/languages";

export interface RecorderHandle {
  /** Stop and resolve with the recorded audio, or null if nothing was captured. */
  stop(): Promise<Blob | null>;
  /** Stop and discard. */
  cancel(): void;
  /** True while capturing. */
  active(): boolean;
}

/** Best audio format this browser can record. */
export function pickMimeType(): string {
  if (typeof MediaRecorder === "undefined") return "";
  const candidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/ogg;codecs=opus",
    "audio/mp4",
  ];
  for (const c of candidates) {
    if (MediaRecorder.isTypeSupported(c)) return c;
  }
  return "";
}

export function recorderSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof MediaRecorder !== "undefined" &&
    Boolean(navigator.mediaDevices?.getUserMedia)
  );
}

export async function startRecorder(): Promise<RecorderHandle | null> {
  if (!recorderSupported()) return null;
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true },
    });
    const mimeType = pickMimeType();
    const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
    const parts: BlobPart[] = [];
    let stopped = false;

    recorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) parts.push(e.data);
    };

    const cleanup = () => stream.getTracks().forEach((t) => t.stop());

    recorder.onstop = cleanup;
    recorder.onerror = cleanup;
    recorder.start(250); // chunked so a long question is not one opaque blob

    return {
      stop() {
        if (stopped) return Promise.resolve(null);
        stopped = true;
        return new Promise<Blob | null>((resolve) => {
          recorder.onstop = () => {
            cleanup();
            const blob = new Blob(parts, { type: mimeType || recorder.mimeType || "audio/webm" });
            resolve(blob.size > 0 ? blob : null);
          };
          try {
            recorder.stop();
          } catch {
            cleanup();
            resolve(null);
          }
        });
      },
      cancel() {
        if (stopped) return;
        stopped = true;
        parts.length = 0;
        try {
          recorder.stop();
        } catch {
          cleanup();
        }
      },
      active() {
        return recorder.state === "recording";
      },
    };
  } catch {
    return null;
  }
}

export type TranscribeResult =
  | { ok: true; text: string; engine: string; detected_language?: string }
  | { ok: false; reason: "not_configured" | "empty" | "too_large" | "upstream" | "network" };

/** Send recorded audio to /api/stt. */
export async function transcribeAudio(
  blob: Blob,
  lang: AnswerLang
): Promise<TranscribeResult> {
  const form = new FormData();
  form.append("lang", lang);
  form.append("audio", blob, `question.${blob.type.split("/")[1]?.split(";")[0] ?? "webm"}`);
  try {
    const res = await fetch("/api/stt", { method: "POST", body: form });
    const data = (await res.json()) as {
      ok?: boolean;
      text?: string;
      engine?: string;
      detected_language?: string;
      reason?: TranscribeResult extends { ok: false; reason: infer R } ? R : never;
    };
    if (res.ok && data.ok && typeof data.text === "string") {
      return {
        ok: true,
        text: data.text,
        engine: data.engine ?? "unknown",
        detected_language: data.detected_language,
      };
    }
    const reason = data.reason;
    return {
      ok: false,
      reason:
        reason === "not_configured" ||
        reason === "empty" ||
        reason === "too_large" ||
        reason === "upstream"
          ? reason
          : "network",
    };
  } catch {
    return { ok: false, reason: "network" };
  }
}

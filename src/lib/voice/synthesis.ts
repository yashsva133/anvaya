// ---------------------------------------------------------------------------
// Text-to-speech for the voice agent.
//
// Three problems this module actually solves, each of which is audible:
//
//  1. VOICE SELECTION. `utterance.lang = "ta-IN"` only produces Tamil if the
//     device has a Tamil voice installed; otherwise most engines silently fall
//     back to a default voice that reads Tamil script as gibberish. So the
//     voice is chosen explicitly, and when none matches, the caller is told —
//     which is what lets the UI offer the server-side TTS path instead of
//     playing nonsense.
//  2. MARKDOWN. Answers contain ** and "- " bullets for the on-screen renderer.
//     Read aloud those become "asterisk asterisk" and "dash". Stripped here.
//  3. UNITS. "10.5 g/dL" is spoken by most engines as "ten point five g slash d
//     l". Rewritten to "10.5 grams per decilitre" (and the Hindi equivalent),
//     so the one sentence the whole product exists to deliver is intelligible.
//
// Chrome also stops synthesis after roughly 15 seconds of a single utterance,
// which is shorter than some answers; the keep-alive resume below is the
// documented workaround, and sentence chunking means a long answer degrades to
// "plays in parts" rather than "cuts off".
// ---------------------------------------------------------------------------

import { bcp47Of, languageOf, type AnswerLang } from "@/lib/ai/languages";

export interface SpeakHandle {
  cancel(): void;
}

export interface SpeakOptions {
  text: string;
  lang: AnswerLang;
  /** 1.0 is normal; the app's listening default is slightly slower. */
  rate?: number;
  voice?: SpeechSynthesisVoice | null;
  onStart?: () => void;
  /** Fires once, after the last chunk ends (or after cancel). */
  onEnd?: () => void;
  onError?: (reason: string) => void;
}

export function synthesisSupported(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

/**
 * The installed voices.
 *
 * Chrome populates this list asynchronously: the first synchronous read after
 * page load is often empty, and `voiceschanged` fires later. Callers that need
 * certainty should await `loadVoices()`.
 */
export function currentVoices(): SpeechSynthesisVoice[] {
  if (!synthesisSupported()) return [];
  try {
    return window.speechSynthesis.getVoices() ?? [];
  } catch {
    return [];
  }
}

export function loadVoices(timeoutMs = 2500): Promise<SpeechSynthesisVoice[]> {
  return new Promise((resolve) => {
    if (!synthesisSupported()) {
      resolve([]);
      return;
    }
    const existing = currentVoices();
    if (existing.length > 0) {
      resolve(existing);
      return;
    }
    let settled = false;
    const done = (voices: SpeechSynthesisVoice[]) => {
      if (settled) return;
      settled = true;
      window.speechSynthesis.removeEventListener("voiceschanged", onChange);
      clearTimeout(timer);
      resolve(voices);
    };
    const onChange = () => done(currentVoices());
    const timer = setTimeout(() => done(currentVoices()), timeoutMs);
    window.speechSynthesis.addEventListener("voiceschanged", onChange);
  });
}

/**
 * Best installed voice for a language, or null.
 *
 * Matching order matters: an exact tag match is what you want, then any voice
 * for the same language subtag, then a voice for a language that shares the
 * script (a Hindi voice reading Marathi is imperfect but legible, where an
 * English voice reading Devanagari is not). Returns null rather than guessing
 * across scripts.
 */
export function pickVoice(
  voices: SpeechSynthesisVoice[],
  lang: AnswerLang
): SpeechSynthesisVoice | null {
  if (voices.length === 0) return null;
  const tag = bcp47Of(lang).toLowerCase();
  const subtag = tag.split("-")[0];

  const exact = voices.find((v) => v.lang?.toLowerCase() === tag);
  if (exact) return exact;

  const sameLang = voices.find((v) => v.lang?.toLowerCase().startsWith(`${subtag}-`));
  if (sameLang) return sameLang;

  const bare = voices.find((v) => v.lang?.toLowerCase() === subtag);
  if (bare) return bare;

  const scriptPeers = SCRIPT_FAMILY[lang] ?? [];
  for (const peer of scriptPeers) {
    const peerSubtag = bcp47Of(peer).split("-")[0];
    const v = voices.find((x) => x.lang?.toLowerCase().startsWith(peerSubtag));
    if (v) return v;
  }
  return null;
}

/** Languages that share a script, so a voice is at least legible. */
const SCRIPT_FAMILY: Partial<Record<AnswerLang, AnswerLang[]>> = {
  hi: ["mr", "ne"],
  mr: ["hi", "ne"],
  ne: ["hi", "mr"],
  bn: ["as"],
  as: ["bn"],
};

/** True when this device can speak the language at all. */
export function hasVoiceFor(voices: SpeechSynthesisVoice[], lang: AnswerLang): boolean {
  return pickVoice(voices, lang) !== null;
}

/* ---------------------------------- text prep -------------------------------- */

/** Unit abbreviations a TTS engine would otherwise spell out letter by letter. */
const SPOKEN_UNITS_EN: [RegExp, string][] = [
  [/\bg\/dL\b/gi, "grams per decilitre"],
  [/\bmg\/dL\b/gi, "milligrams per decilitre"],
  [/\bng\/mL\b/gi, "nanograms per millilitre"],
  [/\bµIU\/mL\b/gi, "micro international units per millilitre"],
  [/\bIU\/L\b/gi, "international units per litre"],
  [/\bU\/L\b/gi, "units per litre"],
  [/\bmEq\/L\b/gi, "milliequivalents per litre"],
  [/\bmm\/hr\b/gi, "millimetres per hour"],
  [/\bmm\/h\b/gi, "millimetres per hour"],
  [/\bfL\b/g, "femtolitres"],
  [/\bpg\b/g, "picograms"],
  [/\b×10³\/µL\b/g, "thousand per microlitre"],
  [/\b10\^3\/µL\b/g, "thousand per microlitre"],
  [/\bMCHC\b/g, "M C H C"],
  [/\bHbA1c\b/g, "Hb A one c"],
  [/\bHDL\b/g, "H D L"],
  [/\bLDL\b/g, "L D L"],
  [/\bTSH\b/g, "T S H"],
  [/\bMCV\b/g, "M C V"],
];

const SPOKEN_UNITS_HI: [RegExp, string][] = [
  [/\bg\/dL\b/gi, "ग्राम प्रति डेसीलीटर"],
  [/\bmg\/dL\b/gi, "मिलीग्राम प्रति डेसीलीटर"],
  [/\bng\/mL\b/gi, "नैनोग्राम प्रति मिलीलीटर"],
  [/\bfL\b/g, "फेम्टोलीटर"],
  [/\bpg\b/g, "पिकोग्राम"],
  [/\bmm\/hr\b/gi, "मिलीमीटर प्रति घंटा"],
  [/\bU\/L\b/gi, "यूनिट प्रति लीटर"],
  [/\b×10³\/µL\b/g, "हज़ार प्रति माइक्रोलीटर"],
  [/\bHbA1c\b/g, "एच बी ए वन सी"],
  [/\bHDL\b/g, "एच डी एल"],
  [/\bLDL\b/g, "एल डी एल"],
  [/\bTSH\b/g, "टी एस एच"],
  [/\bMCV\b/g, "एम सी वी"],
];

/**
 * Turn answer text into something a voice can read.
 *
 * Idempotent and side-effect free, so it is safe to call on every playback.
 */
export function prepareForSpeech(text: string, lang: AnswerLang): string {
  let out = text.replace(/\r\n/g, "\n");

  // Markdown the on-screen renderer needs and a voice does not.
  out = out.replace(/\*\*([^*]+)\*\*/g, "$1");
  out = out.replace(/(?<!\*)\*(?!\*)/g, "");
  out = out.replace(/`([^`]+)`/g, "$1");
  out = out.replace(/^#{1,6}\s+/gm, "");
  out = out.replace(/^\s*[-*+]\s+/gm, "");
  out = out.replace(/\[([^\]]+)\]\([^)]*\)/g, "$1");

  // Ranges: "12–16" must be read as "12 to 16", not "12 dash 16".
  const rangeJoin =
    lang === "hi" ? " से " : lang === "bn" ? " থেকে " : lang === "ta" ? " முதல் " : " to ";
  out = out.replace(/(\d(?:\.\d+)?)\s*[–—-]\s*(\d(?:\.\d+)?)/g, `$1${rangeJoin}$2`);

  // Sentence punctuation a voice pauses on.
  out = out.replace(/[—–]/g, ", ");
  out = out.replace(/•/g, ", ");
  out = out.replace(/[|]/g, ", ");
  out = out.replace(/\s*\n+\s*/g, ". ");
  out = out.replace(/\.{2,}/g, ".");

  const units = lang === "hi" ? SPOKEN_UNITS_HI : lang === "en" ? SPOKEN_UNITS_EN : [];
  for (const [re, to] of units) out = out.replace(re, to);

  return out.replace(/\s+/g, " ").trim();
}

/**
 * Split into speakable chunks.
 *
 * Chunked at sentence boundaries rather than sent as one long utterance for two
 * reasons: playback starts sooner, and an engine that gives up mid-utterance
 * loses one sentence instead of the whole answer.
 */
export function chunkForSpeech(text: string, maxLen = 220): string[] {
  const sentences = text.match(/[^.!?।।]+[.!?।]?/g)?.map((s) => s.trim()).filter(Boolean) ?? [];
  const out: string[] = [];
  let buf = "";
  for (const s of sentences) {
    if (!buf) {
      buf = s;
      continue;
    }
    if (buf.length + s.length + 1 > maxLen) {
      out.push(buf);
      buf = s;
    } else {
      buf = `${buf} ${s}`;
    }
  }
  if (buf) out.push(buf);
  return out.length > 0 ? out : [text];
}

/* --------------------------------- speaking ---------------------------------- */

/**
 * Speak text in a language, using the device's voices.
 *
 * Returns a handle whose cancel() stops playback immediately — used for
 * barge-in, so a person who starts talking over the agent is heard instead of
 * waiting for it to finish.
 */
export function speak(opts: SpeakOptions): SpeakHandle {
  const { text, lang } = opts;
  const rate = opts.rate ?? 0.95;
  const speech = window.speechSynthesis;

  if (!synthesisSupported() || !text.trim()) {
    opts.onEnd?.();
    return { cancel() {} };
  }

  const chunks = chunkForSpeech(prepareForSpeech(text, lang));
  const voice = opts.voice !== undefined ? opts.voice : pickVoice(currentVoices(), lang);
  let cancelled = false;
  let finished = 0;
  let keepAlive: ReturnType<typeof setInterval> | null = null;

  const finish = () => {
    if (cancelled) return;
    cancelled = true;
    if (keepAlive) clearInterval(keepAlive);
    opts.onEnd?.();
  };

  speech.cancel();
  for (const chunk of chunks) {
    const u = new SpeechSynthesisUtterance(chunk);
    u.lang = bcp47Of(lang);
    if (voice) u.voice = voice;
    u.rate = rate;
    u.pitch = 1;
    u.onstart = () => {
      opts.onStart?.();
      // Chrome's 15-second cutoff workaround: a periodic resume keeps a long
      // queue alive without audibly affecting playback.
      if (!keepAlive) keepAlive = setInterval(() => speech.resume(), 8000);
    };
    u.onend = () => {
      finished += 1;
      if (finished >= chunks.length) {
        if (keepAlive) clearInterval(keepAlive);
        keepAlive = null;
        finish();
      }
    };
    u.onerror = (e) => {
      // "interrupted" and "canceled" are what cancel() produces, not failures.
      const err = (e as SpeechSynthesisErrorEvent).error;
      if (err === "interrupted" || err === "canceled" || cancelled) {
        if (keepAlive) clearInterval(keepAlive);
        return;
      }
      if (keepAlive) clearInterval(keepAlive);
      opts.onError?.(err ?? "unknown");
      finish();
    };
    speech.speak(u);
  }

  return {
    cancel() {
      if (cancelled) return;
      cancelled = true;
      if (keepAlive) clearInterval(keepAlive);
      try {
        speech.cancel();
      } catch {
        /* already stopped */
      }
    },
  };
}

/**
 * Speak via /api/tts (server-side synthesis), falling back to the device.
 *
 * Used when the device has no voice for the language — the common case for
 * Indian languages on desktop Linux, where speech-dispatcher usually ships
 * English only. Returns the handle, or null when the server route is not
 * configured, so the caller can decide what to tell the user.
 */
export async function speakViaServer(opts: SpeakOptions): Promise<SpeakHandle | null> {
  let blobUrl: string | null = null;
  let audio: HTMLAudioElement | null = null;
  let cancelled = false;

  try {
    const res = await fetch("/api/tts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text: prepareForSpeech(opts.text, opts.lang),
        lang: opts.lang,
      }),
    });
    if (!res.ok) return null;
    const blob = await res.blob();
    if (blob.size === 0) return null;
    blobUrl = URL.createObjectURL(blob);
    audio = new Audio(blobUrl);
    audio.playbackRate = opts.rate ?? 1;
    await new Promise<void>((resolve, reject) => {
      if (!audio) return reject(new Error("no audio"));
      audio.oncanplaythrough = () => resolve();
      audio.onerror = () => reject(new Error("audio decode failed"));
      void audio.load();
    });
    await audio.play();
    opts.onStart?.();
    audio.onended = () => {
      if (blobUrl) URL.revokeObjectURL(blobUrl);
      opts.onEnd?.();
    };
    audio.onerror = () => {
      if (blobUrl) URL.revokeObjectURL(blobUrl);
      opts.onError?.("playback");
    };
    return {
      cancel() {
        if (cancelled) return;
        cancelled = true;
        audio?.pause();
        if (blobUrl) URL.revokeObjectURL(blobUrl);
      },
    };
  } catch {
    if (blobUrl) URL.revokeObjectURL(blobUrl);
    return null;
  }
}

/** Human-readable name of a language, for the "no voice installed" message. */
export function languageLabel(lang: AnswerLang): string {
  const def = languageOf(lang);
  return `${def.native} (${def.english})`;
}

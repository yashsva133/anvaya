// ---------------------------------------------------------------------------
// Minimal typings for the Web Speech API.
//
// TypeScript's DOM lib does not ship SpeechRecognition (it never left the
// "experimental" list), so the parts this app uses are declared here — once,
// instead of `any`-cast at every call site. Only the surface actually used is
// declared; the browser's real object has more.
// ---------------------------------------------------------------------------

export interface SpeechRecognitionAlternativeLike {
  readonly transcript: string;
  readonly confidence: number;
}

export interface SpeechRecognitionResultLike {
  readonly isFinal: boolean;
  readonly length: number;
  item(index: number): SpeechRecognitionAlternativeLike;
}

export interface SpeechRecognitionResultListLike {
  readonly length: number;
  item(index: number): SpeechRecognitionResultLike;
}

export interface SpeechRecognitionEventLike {
  readonly resultIndex: number;
  readonly results: SpeechRecognitionResultListLike;
}

export interface SpeechRecognitionErrorEventLike {
  readonly error: string;
  readonly message?: string;
}

export interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start(): void;
  stop(): void;
  abort(): void;
  onstart: (() => void) | null;
  onaudiostart: (() => void) | null;
  onspeechstart: (() => void) | null;
  onspeechend: (() => void) | null;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null;
  onend: (() => void) | null;
}

export type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

/**
 * The SpeechRecognition constructor this browser exposes, or null.
 *
 * Chrome, Edge and Safari have it (Safari and Chrome behind the webkit prefix);
 * Firefox does not, which is why the voice agent also has a record-and-upload
 * path. Checked as a function call rather than a property read so a getter that
 * throws in a locked-down browser cannot take the component down.
 */
export function getSpeechRecognitionCtor(): SpeechRecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  const ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
  return typeof ctor === "function" ? ctor : null;
}

export function speechRecognitionSupported(): boolean {
  return getSpeechRecognitionCtor() !== null;
}

/** Reasons a recognition attempt can fail, mapped to something the UI can say. */
export type RecognitionErrorCode =
  | "unsupported"
  | "not-allowed"
  | "service-not-allowed"
  | "audio-capture"
  | "no-speech"
  | "network"
  | "aborted"
  | "language-unsupported"
  | "unknown";

/**
 * Browser error strings → our codes.
 *
 * `not-allowed` (permission denied) and `audio-capture` (no microphone) are the
 * two a real user hits; both need a different instruction, which is why they
 * are kept distinct rather than collapsed into one "failed" bucket.
 */
export function mapRecognitionError(error: string): RecognitionErrorCode {
  switch (error) {
    case "not-allowed":
      return "not-allowed";
    case "service-not-allowed":
      return "service-not-allowed";
    case "audio-capture":
      return "audio-capture";
    case "no-speech":
      return "no-speech";
    case "network":
      return "network";
    case "aborted":
      return "aborted";
    case "language-not-supported":
      return "language-unsupported";
    default:
      return "unknown";
  }
}

// ---------------------------------------------------------------------------
// Speech-to-text controller over the Web Speech API.
//
// Wrapping the raw API is not ceremony — it has three behaviours that break a
// naive implementation:
//
//  1. `start()` throws InvalidStateError if called while already started (which
//     happens whenever a component re-renders mid-listen), so intent and
//     lifecycle are tracked separately here.
//  2. With `continuous = false` the recogniser stops itself at the end of an
//     utterance and fires `onend` — that is the endpointing signal, and it is
//     also the signal that a hands-free conversation should reopen the mic.
//     Both mean the same event, so the distinction has to live in this class.
//  3. Results arrive in pieces, some final and some interim, addressed by
//     `resultIndex`. Concatenating every event produces doubled text; only the
//     finals are committed and the interim tail is shown live.
// ---------------------------------------------------------------------------

import {
  getSpeechRecognitionCtor,
  mapRecognitionError,
  type RecognitionErrorCode,
  type SpeechRecognitionLike,
} from "./types";

export interface RecognizerCallbacks {
  onStart?: () => void;
  /** Live, not-yet-final transcript — the caption under the mic. */
  onPartial?: (text: string) => void;
  /** Called once per completed utterance, after the recogniser has stopped. */
  onFinal?: (text: string) => void;
  /** The recogniser stopped on its own and will not restart. */
  onEnd?: () => void;
  onError?: (code: RecognitionErrorCode) => void;
  /** Restarted automatically for the next turn in hands-free mode. */
  onAutoRestart?: () => void;
}

export class Recognizer {
  private rec: SpeechRecognitionLike | null = null;
  private finals = "";
  private partial = "";
  private listening = false;
  /** What the user asked for; survives the recogniser's own auto-stops. */
  private wantListening = false;
  private lang = "en-IN";
  private autoRestart = false;
  private restartTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly cb: RecognizerCallbacks) {}

  static get supported(): boolean {
    return getSpeechRecognitionCtor() !== null;
  }

  isListening(): boolean {
    return this.listening;
  }

  /**
   * Begin listening.
   *
   * `autoRestart` keeps the mic open across turns: when the recogniser stops at
   * the end of an utterance it is started again, which is what makes a
   * hands-free back-and-forth possible without the user pressing a button
   * between every question.
   */
  start(lang: string, autoRestart = false): void {
    const Ctor = getSpeechRecognitionCtor();
    if (!Ctor) {
      this.cb.onError?.("unsupported");
      return;
    }
    this.wantListening = true;
    this.lang = lang;
    this.autoRestart = autoRestart;
    this.attach(Ctor);
  }

  private attach(Ctor: new () => SpeechRecognitionLike) {
    if (this.rec) return;
    let rec: SpeechRecognitionLike;
    try {
      rec = new Ctor();
    } catch {
      this.cb.onError?.("unsupported");
      return;
    }
    rec.lang = this.lang;
    // false: the recogniser stops at the end of the utterance, which is the
    // endpointing signal this class commits the transcript on.
    rec.continuous = false;
    rec.interimResults = true;
    rec.maxAlternatives = 1;

    rec.onstart = () => {
      this.listening = true;
      this.finals = "";
      this.partial = "";
      this.cb.onStart?.();
    };

    rec.onresult = (event) => {
      let interim = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results.item(i);
        const transcript = result.item(0)?.transcript ?? "";
        if (result.isFinal) this.finals = `${this.finals}${transcript}`.trim();
        else interim += transcript;
      }
      this.partial = interim;
      this.cb.onPartial?.([this.finals, interim].filter(Boolean).join(" ").trim());
    };

    rec.onerror = (event) => {
      const code = mapRecognitionError(event.error ?? "unknown");
      // "aborted" is our own stop(); it is not an error the user should see.
      if (code !== "aborted") this.cb.onError?.(code);
    };

    rec.onend = () => {
      this.listening = false;
      this.rec = null;
      const text = this.finals.trim();
      if (text) {
        this.finals = "";
        this.partial = "";
        this.cb.onFinal?.(text);
      }
      if (!this.wantListening) {
        this.cb.onEnd?.();
        return;
      }
      // Hands-free: reopen the mic for the next question. The delay lets the
      // agent's spoken answer start before the mic goes live again, which
      // reduces the chance of the agent transcribing its own voice.
      if (this.autoRestart) {
        this.restartTimer = setTimeout(() => {
          this.restartTimer = null;
          if (!this.wantListening || this.rec) return;
          const Ctor2 = getSpeechRecognitionCtor();
          if (!Ctor2) return;
          this.cb.onAutoRestart?.();
          this.attach(Ctor2);
        }, 1200);
        return;
      }
      this.cb.onEnd?.();
    };

    this.rec = rec;
    try {
      rec.start();
    } catch {
      // Already started, or the browser refused the session. Treat as a
      // transient failure rather than letting the exception escape into React.
      this.rec = null;
      this.listening = false;
      this.cb.onError?.("unknown");
    }
  }

  /** Stop and commit nothing further. */
  stop(): void {
    this.wantListening = false;
    if (this.restartTimer) {
      clearTimeout(this.restartTimer);
      this.restartTimer = null;
    }
    const rec = this.rec;
    this.rec = null;
    this.listening = false;
    if (rec) {
      try {
        rec.stop();
      } catch {
        /* already stopped */
      }
    }
  }

  /** Hard stop used on unmount; discards the recogniser without callbacks. */
  dispose(): void {
    this.wantListening = false;
    if (this.restartTimer) {
      clearTimeout(this.restartTimer);
      this.restartTimer = null;
    }
    const rec = this.rec;
    this.rec = null;
    this.listening = false;
    if (rec) {
      rec.onresult = null;
      rec.onerror = null;
      rec.onend = null;
      rec.onstart = null;
      try {
        rec.abort();
      } catch {
        /* already stopped */
      }
    }
  }
}

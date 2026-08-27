"use client";

// ---------------------------------------------------------------------------
// useVoiceAgent — the state machine behind the voice agent.
//
// One turn is:  listen → transcribe → POST /api/answer (with the user's own
// report, exactly as the chat does) → speak the answer → listen again.
//
// The pipeline is the chatbot's. Nothing here re-implements retrieval,
// guardrails or answering: the transcript goes to the same endpoint with the
// same personalization payload, so a voice answer is grounded in the same
// numbers, carries the same citations and is screened by the same rules. What
// this hook adds is the parts a chat does not have:
//
//   - the language the person SPOKE, sent as `answerLang` so the answer comes
//     back in that language rather than in the app's UI language
//   - `channel: "voice"`, which switches the answer to spoken formatting
//   - microphone lifecycle, endpointing, barge-in, and speaking the reply
//
// The UI (src/components/voice.tsx, src/app/voice/page.tsx) renders state; all
// of the sequencing lives here so both surfaces behave identically.
// ---------------------------------------------------------------------------

import { useCallback, useEffect, useRef, useState } from "react";
import type { LangCode } from "@/lib/data";
import {
  bcp47Of,
  detectLangFromText,
  languageOf,
  type AnswerLang,
} from "@/lib/ai/languages";
import {
  buildReportContext,
  conversationId,
  type ContextPatient,
  type ContextReport,
} from "@/lib/ai/reportContext";
import { Recognizer } from "./recognition";
import { startMicMeter, type MicMeter } from "./micLevel";
import {
  recorderSupported,
  startRecorder,
  transcribeAudio,
  type RecorderHandle,
} from "./recorder";
import {
  currentVoices,
  hasVoiceFor,
  loadVoices,
  pickVoice,
  speak,
  speakViaServer,
  synthesisSupported,
  type SpeakHandle,
} from "./synthesis";
import { speechRecognitionSupported, type RecognitionErrorCode } from "./types";

export type VoiceStatus =
  | "idle"
  | "listening"
  | "recording"
  | "thinking"
  | "speaking"
  | "error";

export interface VoiceCitation {
  source: string;
  title: string;
  publisher: string;
  url: string;
}

export interface VoiceTurn {
  id: string;
  question: string;
  /** Language the question was asked in. */
  askedIn: AnswerLang;
  answer?: string;
  /** Language the answer text is actually written in. */
  answerLang?: AnswerLang;
  /** Present when the requested language could not be honoured. */
  languageNote?: string | null;
  sources?: number;
  confidence?: "high" | "moderate";
  engine?: "medgemma" | "rules" | "fallback";
  model?: string | null;
  citations?: VoiceCitation[];
  /** True once this answer has been played aloud. */
  spoken?: boolean;
  /** True when the answer was spoken by the server because the device had no voice. */
  serverVoice?: boolean;
  latencyMs?: number;
  error?: string;
}

interface AnswerResponse {
  answer: string;
  sources: number;
  confidence: "high" | "moderate";
  engine?: "medgemma" | "rules" | "fallback";
  model?: string | null;
  answer_lang?: AnswerLang;
  language_note?: string | null;
  citations?: { source: string; title: string; publisher: string; url: string }[];
  latency_ms?: number;
}

export interface UseVoiceAgentOptions {
  activeReport: ContextReport;
  reports: ContextReport[];
  patient: ContextPatient;
  /** The app's UI language — kept separate from the language being spoken. */
  uiLang: LangCode;
  reading: "simple" | "advanced";
  /** Language to start in; defaults to the UI language when it is supported. */
  initialLang?: AnswerLang;
  /** localStorage key for the conversation id. */
  sessionKey?: string;
}

export interface VoiceCapabilities {
  /** How speech-to-text works in this browser. */
  stt: "browser" | "record" | "none";
  /** How text-to-speech works in this browser. */
  tts: "browser" | "none";
  micPermission: "unknown" | "granted" | "denied";
}

export interface VoiceAgent {
  status: VoiceStatus;
  /** Live transcript while listening. */
  partial: string;
  turns: VoiceTurn[];
  /** 0..1 input level for the visualiser; -1 when metering is unavailable. */
  level: number;
  lang: AnswerLang;
  setLang: (l: AnswerLang) => void;
  handsFree: boolean;
  setHandsFree: (v: boolean) => void;
  autoSpeak: boolean;
  setAutoSpeak: (v: boolean) => void;
  capabilities: VoiceCapabilities;
  /** Machine-readable error; the UI maps it to a localized sentence. */
  error: { code: RecognitionErrorCode | "answer_failed" | "no_voice" | "mic_denied"; detail?: string } | null;
  dismissError: () => void;
  startListening: () => void;
  stopListening: () => void;
  /** Ask in text — the fallback when speech input is unavailable. */
  ask: (text: string) => Promise<void>;
  speakTurn: (turn: VoiceTurn) => void;
  stopSpeaking: () => void;
  reset: () => void;
}

/** How long to wait for speech before assuming nobody spoke. */
const SILENCE_TIMEOUT_MS = 14000;

function uiLangToAnswerLang(lang: LangCode): AnswerLang {
  return lang === "hi" ? "hi" : lang === "bn" ? "bn" : "en";
}

export function useVoiceAgent(opts: UseVoiceAgentOptions): VoiceAgent {
  const { activeReport, reports, patient, uiLang, reading } = opts;

  const [status, setStatus] = useState<VoiceStatus>("idle");
  const [partial, setPartial] = useState("");
  const [turns, setTurns] = useState<VoiceTurn[]>([]);
  const [level, setLevel] = useState(-1);
  const [lang, setLangState] = useState<AnswerLang>(
    opts.initialLang ?? uiLangToAnswerLang(uiLang)
  );
  const [handsFree, setHandsFree] = useState(true);
  const [autoSpeak, setAutoSpeak] = useState(true);
  const [error, setError] = useState<VoiceAgent["error"]>(null);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [micPermission, setMicPermission] =
    useState<VoiceCapabilities["micPermission"]>("unknown");

  // Refs mirror the state the callbacks need, because the Recognizer and the
  // recognition callbacks are long-lived and would otherwise close over stale
  // values from the render that created them.
  const langRef = useRef(lang);
  const handsFreeRef = useRef(handsFree);
  const autoSpeakRef = useRef(autoSpeak);
  const statusRef = useRef(status);
  const recognizerRef = useRef<Recognizer | null>(null);
  const recorderRef = useRef<RecorderHandle | null>(null);
  const meterRef = useRef<MicMeter | null>(null);
  const speechRef = useRef<SpeakHandle | null>(null);
  const silenceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const levelTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const sessionIdRef = useRef<string>("");
  /**
   * Consecutive turns where nothing was heard. Bounded on purpose: restarting
   * the microphone forever on a quiet room would burn battery and, on a
   * metered connection, quota, while the person is not even looking at the
   * screen. After two silent turns the agent waits for a tap.
   */
  const noSpeechStreak = useRef(0);
  /**
   * startListening is defined below the callbacks that need it, so it is reached
   * through a ref. That is not just declaration order: reading it directly would
   * freeze whichever version of the callback existed when the memo was built,
   * and a stale close over `lang`/`handsFree` is exactly the bug that makes a
   * voice agent answer in the previous language.
   */
  const startListeningRef = useRef<() => void>(() => {});

  langRef.current = lang;
  handsFreeRef.current = handsFree;
  autoSpeakRef.current = autoSpeak;
  statusRef.current = status;

  const sttMode: VoiceCapabilities["stt"] = speechRecognitionSupported()
    ? "browser"
    : recorderSupported()
      ? "record"
      : "none";

  const capabilities: VoiceCapabilities = {
    stt: sttMode,
    tts: synthesisSupported() ? "browser" : "none",
    micPermission,
  };

  /* ------------------------------ session id ------------------------------ */

  useEffect(() => {
    sessionIdRef.current = conversationId(opts.sessionKey ?? "anvaya_voice_session_v1");
  }, [opts.sessionKey]);

  /* -------------------------------- voices -------------------------------- */

  useEffect(() => {
    let alive = true;
    setVoices(currentVoices());
    void loadVoices().then((v) => {
      if (alive) setVoices(v);
    });
    const onChange = () => setVoices(currentVoices());
    if (synthesisSupported()) {
      window.speechSynthesis.addEventListener("voiceschanged", onChange);
    }
    return () => {
      alive = false;
      if (synthesisSupported()) {
        window.speechSynthesis.removeEventListener("voiceschanged", onChange);
      }
    };
  }, []);

  /* ------------------------------ teardown -------------------------------- */

  useEffect(() => {
    return () => {
      recognizerRef.current?.dispose();
      recorderRef.current?.cancel();
      speechRef.current?.cancel();
      meterRef.current?.stop();
      if (silenceTimer.current) clearTimeout(silenceTimer.current);
      if (levelTimer.current) clearInterval(levelTimer.current);
    };
  }, []);

  /* ------------------------------- helpers -------------------------------- */

  const stopSpeech = useCallback(() => {
    speechRef.current?.cancel();
    speechRef.current = null;
  }, []);

  const stopMeter = useCallback(() => {
    if (levelTimer.current) {
      clearInterval(levelTimer.current);
      levelTimer.current = null;
    }
    meterRef.current?.stop();
    meterRef.current = null;
    setLevel(-1);
  }, []);

  const clearSilenceTimer = useCallback(() => {
    if (silenceTimer.current) {
      clearTimeout(silenceTimer.current);
      silenceTimer.current = null;
    }
  }, []);

  const armSilenceTimer = useCallback(
    (ms: number) => {
      clearSilenceTimer();
      silenceTimer.current = setTimeout(() => {
        silenceTimer.current = null;
        // Only fire if we are still waiting on the same listening turn.
        if (statusRef.current !== "listening") return;
        recognizerRef.current?.stop();
        recorderRef.current?.cancel();
        recorderRef.current = null;
        stopMeter();
        setStatus("idle");
        setError({ code: "no-speech" });
      }, ms);
    },
    [clearSilenceTimer, stopMeter]
  );

  /** Speak one answer, preferring a device voice and falling back to the server. */
  const playAnswer = useCallback(
    async (turn: VoiceTurn, answerLang: AnswerLang) => {
      if (!turn.answer) return;
      setStatus("speaking");
      const installed = currentVoices().length > 0 ? currentVoices() : voices;

      const markSpoken = (serverVoice: boolean) => {
        setTurns((prev) =>
          prev.map((t) => (t.id === turn.id ? { ...t, spoken: true, serverVoice } : t))
        );
      };

      const onEnd = () => {
        speechRef.current = null;
        setStatus("idle");
        if (handsFreeRef.current) {
          // Small pause so the agent's own voice has finished draining through
          // the speaker before the microphone reopens.
          setTimeout(() => {
            if (statusRef.current === "idle") startListeningRef.current();
          }, 600);
        }
      };

      if (synthesisSupported() && hasVoiceFor(installed, answerLang)) {
        speechRef.current = speak({
          text: turn.answer,
          lang: answerLang,
          voice: pickVoice(installed, answerLang),
          onEnd,
          onError: () => {
            setStatus("idle");
          },
        });
        markSpoken(false);
        return;
      }

      // No installed voice for this language: try server-side TTS, and if that
      // is not configured, say so instead of playing an English voice over
      // Tamil text — which is worse than silence.
      const handle = await speakViaServer({
        text: turn.answer,
        lang: answerLang,
        onEnd,
        onError: () => setStatus("idle"),
      });
      if (handle) {
        speechRef.current = handle;
        markSpoken(true);
        return;
      }
      if (synthesisSupported()) {
        // Last resort: a default voice is better than nothing for Latin-script
        // languages, but for Indic scripts it produces noise, so refuse.
        const def = languageOf(answerLang);
        if (!def.script || answerLang === "en") {
          speechRef.current = speak({ text: turn.answer, lang: answerLang, onEnd });
          markSpoken(false);
          return;
        }
      }
      setStatus("idle");
      setError({ code: "no_voice", detail: answerLang });
      if (handsFreeRef.current) startListeningRef.current();
    },
    [voices]
  );

  /** Send one question to the agent pipeline. */
  const askInternal = useCallback(
    async (question: string, askedIn: AnswerLang) => {
      const q = question.trim();
      if (!q) return;
      clearSilenceTimer();
      stopMeter();
      stopSpeech();
      setStatus("thinking");
      setError(null);

      const turnId = `t${Date.now()}${Math.random().toString(36).slice(2, 6)}`;
      setTurns((prev) => [...prev, { id: turnId, question: q, askedIn }]);

      const body = {
        q,
        lang: uiLang,
        answerLang: askedIn,
        channel: "voice",
        reading,
        ...(sessionIdRef.current ? { session: sessionIdRef.current } : {}),
        report: buildReportContext({ activeReport, reports, patient, lang: uiLang }),
      };

      let data: AnswerResponse;
      try {
        const res = await fetch("/api/answer", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        if (!res.ok) throw new Error(`answer_${res.status}`);
        data = (await res.json()) as AnswerResponse;
      } catch (e) {
        setTurns((prev) =>
          prev.map((t) =>
            t.id === turnId ? { ...t, error: e instanceof Error ? e.message : "answer_failed" } : t
          )
        );
        setStatus("error");
        setError({ code: "answer_failed" });
        if (handsFreeRef.current) {
          setTimeout(() => {
            if (statusRef.current === "error") setStatus("idle");
            startListeningRef.current();
          }, 1500);
        }
        return;
      }

      // The model may have answered in a different language than the one asked
      // for. Trust the text over the request for playback, so the voice matches
      // what is actually on screen.
      const answerLang: AnswerLang =
        data.answer_lang ?? detectLangFromText(data.answer, askedIn);

      const finished: VoiceTurn = {
        id: turnId,
        question: q,
        askedIn,
        answer: data.answer,
        answerLang,
        languageNote: data.language_note ?? null,
        sources: data.sources,
        confidence: data.confidence,
        engine: data.engine,
        model: data.model ?? null,
        citations: data.citations,
        latencyMs: data.latency_ms,
      };
      setTurns((prev) => prev.map((t) => (t.id === turnId ? finished : t)));

      if (autoSpeakRef.current) {
        await playAnswer(finished, answerLang);
      } else {
        setStatus("idle");
        if (handsFreeRef.current) startListeningRef.current();
      }
    },
    [activeReport, reports, patient, uiLang, reading, clearSilenceTimer, stopMeter, stopSpeech, playAnswer]
  );

  /* --------------------------- listening (browser) ------------------------ */

  const getRecognizer = useCallback(() => {
    if (recognizerRef.current) return recognizerRef.current;
    const rec = new Recognizer({
      onStart: () => {
        setStatus("listening");
        setPartial("");
        armSilenceTimer(SILENCE_TIMEOUT_MS);
      },
      onPartial: (text) => {
        setPartial(text);
        // Speech is arriving, so the silence deadline moves out.
        if (text.trim()) armSilenceTimer(SILENCE_TIMEOUT_MS);
      },
      onFinal: (text) => {
        setPartial("");
        noSpeechStreak.current = 0;
        void askInternal(text, langRef.current);
      },
      onEnd: () => {
        if (statusRef.current === "listening") {
          stopMeter();
          setStatus("idle");
        }
      },
      onError: (code) => {
        clearSilenceTimer();
        stopMeter();
        if (code === "not-allowed" || code === "service-not-allowed") {
          setMicPermission("denied");
          setStatus("error");
          setError({ code });
          return;
        }
        if (code === "no-speech") {
          setStatus("idle");
          setError({ code });
          noSpeechStreak.current += 1;
          if (handsFreeRef.current && noSpeechStreak.current < 2) {
            startListeningRef.current();
          }
          return;
        }
        setStatus("error");
        setError({ code });
      },
    });
    recognizerRef.current = rec;
    return rec;
  }, [armSilenceTimer, askInternal, clearSilenceTimer, stopMeter]);

  /** Open the microphone and start listening. */
  const startListening = useCallback(() => {
    // Barge-in: a person who starts talking over the agent is heard, not
    // made to wait for the sentence to finish.
    stopSpeech();
    clearSilenceTimer();
    setError(null);
    setPartial("");

    const begin = async () => {
      if (!meterRef.current) {
        const meter = await startMicMeter();
        if (meter) {
          meterRef.current = meter;
          setMicPermission("granted");
          if (!levelTimer.current) {
            levelTimer.current = setInterval(() => {
              const l = meterRef.current?.level() ?? -1;
              setLevel((prev) => (Math.abs(prev - l) > 0.02 ? l : prev));
            }, 90);
          }
        } else if (micPermission !== "denied") {
          // No meter is not fatal — the recogniser asks for the mic itself.
          setLevel(-1);
        }
      }

      if (sttMode === "browser") {
        setStatus("listening");
        getRecognizer().start(bcp47Of(langRef.current), false);
        return;
      }
      if (sttMode === "record") {
        setStatus("recording");
        const handle = await startRecorder();
        if (!handle) {
          setMicPermission("denied");
          setStatus("error");
          setError({ code: "mic_denied" });
          return;
        }
        setMicPermission("granted");
        recorderRef.current = handle;
        armSilenceTimer(30000);
      }
    };
    void begin();
  }, [sttMode, getRecognizer, stopSpeech, clearSilenceTimer, armSilenceTimer, micPermission]);

  startListeningRef.current = startListening;

  /** Stop listening and, for the record path, transcribe what was captured. */
  const stopListening = useCallback(() => {
    clearSilenceTimer();
    if (recognizerRef.current) recognizerRef.current.stop();
    const rec = recorderRef.current;
    recorderRef.current = null;
    stopMeter();
    setPartial("");
    if (rec) {
      setStatus("thinking");
      void (async () => {
        const blob = await rec.stop();
        if (!blob) {
          setStatus("idle");
          setError({ code: "no-speech" });
          return;
        }
        const result = await transcribeAudio(blob, langRef.current);
        if (!result.ok) {
          setStatus("error");
          setError({
            code: result.reason === "not_configured" ? "unsupported" : "network",
            detail: result.reason,
          });
          return;
        }
        await askInternal(result.text, langRef.current);
      })();
      return;
    }
    setStatus("idle");
  }, [askInternal, clearSilenceTimer, stopMeter]);

  /* --------------------------------- API ---------------------------------- */

  const setLang = useCallback(
    (next: AnswerLang) => {
      setLangState(next);
      langRef.current = next;
      // A language change mid-turn applies to the NEXT utterance; restarting
      // the recogniser would drop whatever is being said.
      if (statusRef.current === "listening" && recognizerRef.current) {
        recognizerRef.current.stop();
        setTimeout(() => {
          if (statusRef.current !== "idle") return;
          startListeningRef.current();
        }, 150);
      }
    },
    []
  );

  const ask = useCallback(
    async (text: string) => {
      const q = text.trim();
      if (!q) return;
      recognizerRef.current?.stop();
      // Typed questions keep the language the person is set to, unless the text
      // is clearly in another script — then that language wins, which is what
      // makes pasting a Hindi question into an English session work.
      const detected = detectLangFromText(q, langRef.current);
      await askInternal(q, detected);
    },
    [askInternal]
  );

  const speakTurn = useCallback(
    (turn: VoiceTurn) => {
      if (!turn.answer) return;
      stopSpeech();
      const l = turn.answerLang ?? langRef.current;
      void playAnswer(turn, l);
    },
    [playAnswer, stopSpeech]
  );

  const reset = useCallback(() => {
    recognizerRef.current?.stop();
    recorderRef.current?.cancel();
    recorderRef.current = null;
    stopSpeech();
    stopMeter();
    clearSilenceTimer();
    setTurns([]);
    setPartial("");
    setError(null);
    setStatus("idle");
    // A fresh conversation should not inherit the server-side memory either.
    sessionIdRef.current = "";
    try {
      window.localStorage.removeItem(opts.sessionKey ?? "anvaya_voice_session_v1");
    } catch {
      /* storage unavailable */
    }
    sessionIdRef.current = conversationId(opts.sessionKey ?? "anvaya_voice_session_v1");
  }, [clearSilenceTimer, opts.sessionKey, stopMeter, stopSpeech]);

  const dismissError = useCallback(() => {
    setError(null);
    if (status === "error") setStatus("idle");
  }, [status]);

  return {
    status,
    partial,
    turns,
    level,
    lang,
    setLang,
    handsFree,
    setHandsFree,
    autoSpeak,
    setAutoSpeak,
    capabilities,
    error,
    dismissError,
    startListening,
    stopListening,
    ask,
    speakTurn,
    stopSpeaking: stopSpeech,
    reset,
  };
}

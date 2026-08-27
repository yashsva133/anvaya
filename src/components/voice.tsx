"use client";

// ---------------------------------------------------------------------------
// The voice agent UI.
//
// microphone → transcript → /api/answer (the user's own report) → speech
// Everything that sequences that loop lives in src/lib/voice/useVoiceAgent.ts,
// so the sheet below and the full-page agent at /voice are the same agent in
// two containers rather than two implementations that can drift.
// ---------------------------------------------------------------------------

import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  BookOpen,
  Keyboard,
  Languages,
  Mic,
  RotateCcw,
  Send,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Square,
  Volume2,
  VolumeX,
} from "lucide-react";
import { LANGUAGES, languageOf, type AnswerLang } from "@/lib/ai/languages";
import { greeting } from "@/lib/ai/translations";
import { useI18n } from "@/lib/i18n";
import { useReportData } from "@/context/ReportDataContext";
import { Md, SafetyNote, Sheet, useToast } from "@/components/core";
import {
  useVoiceAgent,
  type VoiceAgent,
  type VoiceTurn,
} from "@/lib/voice/useVoiceAgent";

/* ------------------------------ level visualiser ---------------------------- */

/**
 * Bars driven by the actual microphone signal.
 *
 * When metering is unavailable (`level < 0`) the bars animate, because an
 * indicator that never moves reads as "broken". When it is available they track
 * the input, so a silent microphone is visible instead of guessed at.
 */
function Eq({ level, active }: { level: number; active: boolean }) {
  const bars = 14;
  return (
    <div className="flex h-14 items-center justify-center gap-1.5" aria-hidden="true">
      {Array.from({ length: bars }).map((_, i) => {
        // Each bar takes a different fixed share of the same level, so the
        // shape moves with speech instead of every bar being an identical
        // column. Deliberately pure: the motion comes from `level`, which the
        // agent refreshes ~11x/second from the microphone signal.
        const wobble = 0.45 + 0.55 * Math.abs(Math.sin(((i + 1) / bars) * Math.PI * 1.5));
        const h = level >= 0 ? Math.max(0.08, level * wobble) : 0;
        return (
          <span
            key={i}
            className={`w-2 origin-center rounded-full transition-[height] duration-100 ${
              active ? "bg-mint-500" : "bg-slate-200"
            } ${level < 0 && active ? "animate-eq" : ""}`}
            style={
              level >= 0
                ? { height: `${Math.round(h * 56)}px` }
                : {
                    height: "100%",
                    animationDuration: `${0.7 + (i % 5) * 0.13}s`,
                    animationDelay: `${i * 0.06}s`,
                  }
            }
          />
        );
      })}
    </div>
  );
}

/* --------------------------------- controls --------------------------------- */

function Toggle({
  on,
  onChange,
  label,
  hint,
}: {
  on: boolean;
  onChange: (v: boolean) => void;
  label: string;
  hint?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={() => onChange(!on)}
      title={hint}
      className="inline-flex min-h-10 items-center gap-2 rounded-full border border-slate-200 bg-white px-3 text-xs font-extrabold text-slate-600 transition hover:bg-slate-50 active:scale-95"
    >
      <span
        className={`relative h-5 w-9 rounded-full transition ${on ? "bg-mint-500" : "bg-slate-300"}`}
      >
        <span
          className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all ${
            on ? "left-[18px]" : "left-0.5"
          }`}
        />
      </span>
      {label}
    </button>
  );
}

function LanguageSelect({
  value,
  onChange,
  label,
}: {
  value: AnswerLang;
  onChange: (l: AnswerLang) => void;
  label: string;
}) {
  return (
    <label className="inline-flex min-h-10 items-center gap-2 rounded-full border border-brand-200 bg-white px-3 text-xs font-extrabold text-brand-700">
      <Languages className="h-4 w-4" />
      <span className="sr-only">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as AnswerLang)}
        aria-label={label}
        className="min-h-8 cursor-pointer bg-transparent pr-1 text-xs font-extrabold text-brand-700 outline-none"
      >
        {LANGUAGES.map((l) => (
          <option key={l.code} value={l.code}>
            {l.native} · {l.english}
          </option>
        ))}
      </select>
    </label>
  );
}

/* ---------------------------------- errors ---------------------------------- */

const ERROR_KEYS: Record<string, string> = {
  "not-allowed": "voice.errNotAllowed",
  "service-not-allowed": "voice.errNotAllowed",
  "audio-capture": "voice.errAudioCapture",
  "no-speech": "voice.errNoSpeech",
  network: "voice.errNetwork",
  unsupported: "voice.errUnsupported",
  "language-unsupported": "voice.errUnsupported",
  answer_failed: "voice.errAnswerFailed",
  mic_denied: "voice.errMicDenied",
  no_voice: "voice.noVoiceFor",
};

/* ----------------------------------- turn ----------------------------------- */

function TurnCard({
  turn,
  agent,
  t,
}: {
  turn: VoiceTurn;
  agent: VoiceAgent;
  t: (k: string) => string;
}) {
  const langName = languageOf(turn.answerLang ?? turn.askedIn).native;
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-2"
    >
      <div className="flex justify-end">
        <div className="max-w-[85%] rounded-3xl rounded-br-md bg-brand-700 px-4 py-3 text-[15px] font-bold text-white shadow-md">
          {turn.question}
        </div>
      </div>

      {turn.error ? (
        <div className="rounded-3xl rounded-tl-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-bold text-rose-700">
          {t("voice.errAnswerFailed")}
        </div>
      ) : turn.answer ? (
        <div className="card-shadow rounded-3xl rounded-tl-md border border-slate-100 bg-white p-4">
          <Md
            text={turn.answer}
            className="text-[15px] font-medium leading-relaxed text-slate-700"
          />
          <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-dashed border-slate-200 pt-2.5">
            {turn.engine && (
              <span
                className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-extrabold ${
                  turn.engine === "medgemma" ? "bg-violet-50 text-violet-700" : "bg-slate-50 text-slate-500"
                }`}
              >
                <Sparkles className="h-3 w-3" />
                {turn.engine === "medgemma" ? `MedGemma · ${turn.model ?? "local"}` : turn.engine}
              </span>
            )}
            {(turn.sources ?? 0) > 0 && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-50 px-2.5 py-1 text-[11px] font-extrabold text-brand-700">
                <BookOpen className="h-3 w-3" />
                {t("common.sources")}: {turn.sources}
              </span>
            )}
            {turn.confidence && (
              <span
                className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-extrabold ${
                  turn.confidence === "high" ? "bg-mint-50 text-mint-700" : "bg-amber-50 text-amber-700"
                }`}
              >
                {turn.confidence === "high" ? (
                  <ShieldCheck className="h-3 w-3" />
                ) : (
                  <ShieldAlert className="h-3 w-3" />
                )}
                {turn.confidence === "high" ? t("common.high") : t("common.moderate")}
              </span>
            )}
            <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-50 px-2.5 py-1 text-[11px] font-extrabold text-slate-500">
              <Languages className="h-3 w-3" />
              {langName}
            </span>
            {turn.serverVoice && (
              <span className="rounded-full bg-sky-50 px-2.5 py-1 text-[11px] font-extrabold text-sky-700">
                {t("voice.serverVoice")}
              </span>
            )}
            <button
              type="button"
              onClick={() => agent.speakTurn(turn)}
              className="ml-auto inline-flex min-h-9 items-center gap-1.5 rounded-full border border-brand-200 bg-white px-3 text-[11px] font-extrabold text-brand-700 transition hover:bg-brand-50 active:scale-95"
            >
              <Volume2 className="h-3.5 w-3.5" />
              {t("voice.replay")}
            </button>
          </div>
          {turn.languageNote && (
            <p className="mt-2 rounded-2xl bg-amber-50 px-3 py-2 text-[11px] font-bold text-amber-800">
              {t("voice.answeredIn").replace("{lang}", languageOf(turn.answerLang ?? "en").native)}
            </p>
          )}
          {(turn.citations?.length ?? 0) > 0 && (
            <details className="mt-2">
              <summary className="cursor-pointer text-[11px] font-extrabold text-slate-500 hover:text-brand-700">
                {t("common.sources")}: {turn.citations?.length}
              </summary>
              <ul className="mt-1.5 space-y-1">
                {turn.citations?.map((c) => (
                  <li key={`${c.source}-${c.title}`} className="text-[11px] font-semibold text-slate-500">
                    <a
                      href={c.url}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="underline decoration-dotted hover:text-brand-700"
                    >
                      {c.title}
                    </a>{" "}
                    — {c.publisher}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      ) : (
        <div className="rounded-3xl rounded-tl-md border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-400">
          {t("voice.thinking")}
        </div>
      )}
    </motion.div>
  );
}

/* ---------------------------------- panel ----------------------------------- */

export function VoiceAgentPanel({ compact = false }: { compact?: boolean }) {
  const { t, s } = useI18n();
  const toast = useToast();
  const { activeReport, reports, patient } = useReportData();
  const [typed, setTyped] = useState("");
  const endRef = useRef<HTMLDivElement>(null);

  const agent = useVoiceAgent({
    activeReport,
    reports,
    patient,
    uiLang: s.lang,
    reading: s.mode,
  });

  const uiLangName = languageOf(agent.lang);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [agent.turns, agent.partial, agent.status]);

  const statusLabel = useMemo(() => {
    switch (agent.status) {
      case "listening":
        return t("voice.listening");
      case "recording":
        return t("voice.listening");
      case "thinking":
        return t("voice.thinking");
      case "speaking":
        return t("voice.speaking");
      case "error":
        return t("voice.errUnsupported");
      default:
        return t("voice.start");
    }
  }, [agent.status, t]);

  const micActive = agent.status === "listening" || agent.status === "recording";
  const sttHint =
    agent.capabilities.stt === "none"
      ? t("voice.noSttHint")
      : agent.capabilities.stt === "record"
        ? t("voice.serverStt")
        : null;

  const errorMessage = agent.error
    ? agent.error.code === "no_voice"
      ? t("voice.noVoiceFor").replace("{lang}", uiLangName.native)
      : t(ERROR_KEYS[agent.error.code] ?? "voice.errUnsupported")
    : null;

  const onMic = () => {
    if (micActive) {
      agent.stopListening();
      return;
    }
    if (agent.status === "speaking") agent.stopSpeaking();
    agent.startListening();
  };

  const submitTyped = (e: React.FormEvent) => {
    e.preventDefault();
    const q = typed.trim();
    if (!q) return;
    setTyped("");
    void agent.ask(q);
  };

  return (
    <div className={compact ? "" : "pb-2"}>
      {/* --------------------------- controls --------------------------- */}
      <div className="no-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1 pb-3">
        <LanguageSelect value={agent.lang} onChange={agent.setLang} label={t("voice.language")} />
        <Toggle
          on={agent.handsFree}
          onChange={agent.setHandsFree}
          label={t("voice.handsFree")}
          hint={t("voice.handsFreeHint")}
        />
        <Toggle
          on={agent.autoSpeak}
          onChange={(v) => {
            agent.setAutoSpeak(v);
            if (!v) agent.stopSpeaking();
          }}
          label={t("voice.autoSpeak")}
        />
        <button
          type="button"
          onClick={() => {
            agent.reset();
            toast(t("common.saved"));
          }}
          className="inline-flex min-h-10 items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 text-xs font-extrabold text-slate-600 transition hover:bg-slate-50 active:scale-95"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          {t("voice.reset")}
        </button>
      </div>

      {/* ---------------------------- mic stage --------------------------- */}
      <div className="flex flex-col items-center rounded-3xl border border-slate-100 bg-gradient-to-b from-white to-mint-50/40 px-4 py-5">
        <button
          type="button"
          onClick={onMic}
          aria-label={micActive ? t("voice.stopListening") : t("voice.start")}
          className={`relative flex h-20 w-20 items-center justify-center rounded-full text-white shadow-lg transition active:scale-95 ${
            micActive ? "bg-rose-500 shadow-rose-500/30" : "bg-mint-600 shadow-mint-600/30 hover:bg-mint-500"
          }`}
        >
          {micActive ? (
            <span className="absolute inline-flex h-full w-full animate-pulse-ring rounded-full bg-rose-400/50" />
          ) : null}
          {micActive ? <Square className="relative h-7 w-7" /> : <Mic className="relative h-8 w-8" />}
        </button>

        <p className="mt-3 text-sm font-extrabold text-brand-900">{statusLabel}</p>
        <p className="mt-0.5 text-xs font-bold text-slate-500">
          {uiLangName.native} · {uiLangName.english}
        </p>

        <div className="mt-2 w-full">
          <Eq level={agent.level} active={micActive} />
        </div>

        <AnimatePresence mode="wait">
          {agent.partial && (
            <motion.p
              key="partial"
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="mt-1 max-h-24 w-full overflow-y-auto rounded-2xl border border-slate-200 bg-white px-3 py-2 text-center text-sm font-bold text-slate-700"
            >
              “{agent.partial}”
            </motion.p>
          )}
        </AnimatePresence>

        {sttHint && (
          <p className="mt-2 flex items-start gap-1.5 text-[11px] font-bold text-slate-500">
            <Keyboard className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            {sttHint}
          </p>
        )}
      </div>

      {/* ------------------------------ error ----------------------------- */}
      {errorMessage && (
        <div className="mt-3 flex items-start gap-2 rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2.5">
          <VolumeX className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
          <p className="text-[12px] font-bold text-amber-900">{errorMessage}</p>
          <button
            type="button"
            onClick={agent.dismissError}
            aria-label={t("common.close")}
            className="ml-auto text-amber-700 transition hover:text-amber-900"
          >
            ✕
          </button>
        </div>
      )}

      {/* --------------------------- transcript --------------------------- */}
      <div className="mt-4 space-y-4">
        {agent.turns.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-brand-200 bg-brand-50/50 px-4 py-4 text-center">
            <p className="text-sm font-extrabold text-brand-900">{greeting(agent.lang)}</p>
            <p className="mt-1.5 text-[12px] font-bold text-slate-500">{t("voice.empty")}</p>
            <p className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1 text-[11px] font-extrabold text-brand-700">
              <BookOpen className="h-3 w-3" />
              {t("voice.groundedIn")}
            </p>
          </div>
        ) : (
          agent.turns.map((turn) => (
            <TurnCard key={turn.id} turn={turn} agent={agent} t={t} />
          ))
        )}
        <div ref={endRef} />
      </div>

      {/* ------------------------- typed fallback ------------------------- */}
      <form
        onSubmit={submitTyped}
        className="sticky bottom-[76px] z-30 mt-4 flex items-center gap-2 rounded-3xl border border-slate-200 bg-white p-2 shadow-lg md:bottom-4"
      >
        <input
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          placeholder={t("voice.typePlaceholder")}
          aria-label={t("voice.typeInstead")}
          className="min-h-11 min-w-0 flex-1 bg-transparent px-3 text-[15px] font-bold text-slate-700 outline-none placeholder:text-slate-400"
        />
        <button
          type="submit"
          disabled={!typed.trim() || agent.status === "thinking"}
          aria-label="Send"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-brand-700 text-white transition hover:bg-brand-600 active:scale-90 disabled:opacity-40"
        >
          <Send className="h-5 w-5" />
        </button>
      </form>

      <div className="mt-3">
        <SafetyNote />
      </div>
    </div>
  );
}

/* ----------------------------------- sheet ---------------------------------- */

/**
 * The bottom-sheet container the app shell and the chat page open.
 *
 * The agent instance lives inside VoiceAgentPanel, so closing the sheet ends the
 * microphone and any playback — which is the behaviour a person expects when
 * they dismiss a dialog.
 */
export function VoiceSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useI18n();
  return (
    <Sheet open={open} onClose={onClose} title={t("voice.title")}>
      {open ? <VoiceAgentPanel /> : null}
    </Sheet>
  );
}

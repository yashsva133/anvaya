"use client";

// Screen 9 — "Ask About My Report" chat with suggested questions, typing
// state, citations, confidence, listen + feedback. Answers via /api/answer.

import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  BookOpen,
  Languages,
  MessageCircleHeart,
  Mic,
  Send,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  ThumbsDown,
  ThumbsUp,
} from "lucide-react";
import { AppShell } from "@/components/shell";
import {
  Dots,
  ListenBtn,
  LogoMark,
  Md,
  SafetyNote,
  SectionTitle,
  useToast,
} from "@/components/core";
import { VoiceSheet } from "@/components/voice";
import { useI18n } from "@/lib/i18n";
import { useReportData } from "@/context/ReportDataContext";

interface Msg {
  role: "user" | "ai";
  text: string;
  sources?: number;
  confidence?: "high" | "moderate";
  /** Which path produced this answer (additive; undefined on the welcome card). */
  engine?: "medgemma" | "rules" | "fallback";
  model?: string | null;
  qaMessageId?: string | null;
}

interface AnswerResponse {
  answer: string;
  sources: number;
  confidence: "high" | "moderate";
  engine?: "medgemma" | "rules" | "fallback";
  model?: string | null;
  personalized?: boolean;
  qa_message_id?: string | null;
}

/**
 * The personalized context sent with every question: the report the user is
 * actually looking at (their upload via /api/process-report, or the demo
 * fallback), reduced to de-identified values. Only test ids and numbers cross
 * the wire — the client deliberately does NOT send statuses, units or ranges
 * (the server re-derives those from its catalogue) and never sends a name.
 */
function buildReportContext(args: {
  activeReport: { id: string; date: { en: string; hi: string }; entries: { test: string; value: number }[] };
  reports: { id: string; date: { en: string; hi: string }; entries: { test: string; value: number }[] }[];
  patient: { age: number; gender: { en: string } };
  hi: boolean;
}) {
  const { activeReport, reports, patient, hi } = args;
  const idx = reports.findIndex((r) => r.id === activeReport.id);
  const prev = idx > 0 ? reports[idx - 1] : undefined;
  const values = (entries: { test: string; value: number }[]) =>
    entries.map((e) => ({ test: e.test, value: e.value }));
  return {
    reportId: activeReport.id,
    dateLabel: hi ? activeReport.date.hi : activeReport.date.en,
    age: patient.age,
    gender: patient.gender.en,
    results: values(activeReport.entries),
    ...(prev
      ? {
          previous: {
            dateLabel: hi ? prev.date.hi : prev.date.en,
            results: values(prev.entries),
          },
        }
      : {}),
  };
}

/** Stable per-browser conversation id, so multi-turn memory works server-side. */
function chatSessionId(): string {
  if (typeof window === "undefined") return "";
  try {
    const key = "anvaya_chat_session_v1";
    let v = window.localStorage.getItem(key);
    if (!v || !/^[a-zA-Z0-9-]{8,64}$/.test(v)) {
      v = crypto.randomUUID();
      window.localStorage.setItem(key, v);
    }
    return v;
  } catch {
    return "";
  }
}

const SUGGESTED: { en: string; hi: string }[] = [
  { en: "Why is my hemoglobin low?", hi: "मेरा हीमोग्लोबिन कम क्यों है?" },
  { en: "What does HbA1c mean?", hi: "HbA1c का क्या मतलब है?" },
  { en: "Which results changed the most?", hi: "कौन से परिणाम सबसे ज़्यादा बदले?" },
  { en: "Is my cholesterol pattern concerning?", hi: "क्या मेरा कोलेस्ट्रॉल पैटर्न चिंताजनक है?" },
  { en: "Explain this like I'm 10.", hi: "इसे बहुत आसान भाषा में समझाएँ।" },
  { en: "Explain this in Hindi.", hi: "मुझे हिन्दी में समझाएँ।" },
];

export default function AskPage() {
  const { t, s } = useI18n();
  const { activeReport, patient, reports } = useReportData();
  // Lazy useState (not a ref write in render): computed once, never displayed,
  // so the SSR/client difference cannot cause a hydration mismatch.
  const [sessionId] = useState(() => chatSessionId());
  const hi = s.lang === "hi";
  const toast = useToast();
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [typing, setTyping] = useState(false);
  const [input, setInput] = useState("");
  const [voiceOpen, setVoiceOpen] = useState(false);
  const [voted, setVoted] = useState<Record<number, "up" | "down">>({});
  const endRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const reportDate = hi ? activeReport.date.hi : activeReport.date.en;
    setMsgs([
      {
        role: "ai",
        text: hi
          ? `नमस्ते! मैंने आपकी **${reportDate}** की रिपोर्ट पढ़ ली है। आप अपने परिणामों के बारे में कुछ भी पूछ सकते हैं — सरल भाषा में, या बोलकर।`
          : `Hello! I've read your **${reportDate}** report. Ask anything about your results — in simple words, or by voice.`,
        sources: 0,
      },
    ]);
  }, [hi, activeReport.date.en, activeReport.date.hi]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [msgs, typing]);

  const ask = async (q: string) => {
    const query = q.trim();
    if (!query || typing) return;
    setMsgs((m) => [...m, { role: "user", text: query }]);
    setInput("");
    setTyping(true);
    try {
      const res = await fetch("/api/answer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          q: query,
          lang: s.lang,
          reading: s.mode,
          ...(sessionId ? { session: sessionId } : {}),
          report: buildReportContext({ activeReport, reports, patient, hi }),
        }),
      });
      const data = (await res.json()) as AnswerResponse;
      await new Promise((r) => setTimeout(r, 700));
      setMsgs((m) => [
        ...m,
        {
          role: "ai",
          text: data.answer,
          sources: data.sources,
          confidence: data.confidence,
          engine: data.engine,
          model: data.model,
          qaMessageId: data.qa_message_id,
        },
      ]);
    } catch {
      setMsgs((m) => [
        ...m,
        {
          role: "ai",
          text: hi
            ? "अभी उत्तर उपलब्ध नहीं है। कृपया फिर प्रयास करें।"
            : "I could not answer right now. Please try again.",
        },
      ]);
    } finally {
      setTyping(false);
    }
  };

  const vote = async (i: number, dir: "up" | "down") => {
    if (voted[i]) return;
    setVoted((v) => ({ ...v, [i]: dir }));
    try {
      await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          helpful: dir === "up",
          qa_message_id: msgs[i]?.qaMessageId ?? undefined,
          ...(sessionId ? { session: sessionId } : {}),
        }),
      });
    } catch {
      /* demo */
    }
    toast(t("ask.thanks"));
  };

  const suggested = SUGGESTED.filter((q) => !msgs.some((m) => m.role === "user" && m.text === (hi ? q.hi : q.en)));

  return (
    <AppShell>
      <div className="flex min-h-[calc(100dvh-220px)] flex-col">
        <SectionTitle icon={MessageCircleHeart} title={t("ask.title")} sub={t("ask.sub")} />

        {/* voice entry */}
        <button
          onClick={() => setVoiceOpen(true)}
          className="card-shadow mb-4 flex min-h-14 w-full items-center justify-center gap-2.5 rounded-3xl border-2 border-mint-600 bg-mint-600 px-4 text-base font-extrabold text-white shadow-mint-600/25 transition hover:bg-mint-500 active:scale-[0.99]"
        >
          <Mic className="h-5 w-5" />
          {t("ask.tapMic")} — {hi ? "हिन्दी में बोलें" : "speak in Hindi"}
        </button>

        {/* messages */}
        <div ref={scrollRef} className="flex-1 space-y-4">
          {msgs.map((m, i) =>
            m.role === "user" ? (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex justify-end"
              >
                <div className="max-w-[85%] rounded-3xl rounded-br-md bg-brand-700 px-5 py-3.5 text-[15px] font-bold text-white shadow-md md:max-w-[70%]">
                  {m.text}
                </div>
              </motion.div>
            ) : (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex gap-3"
              >
                <span className="mt-1 hidden shrink-0 sm:block">
                  <LogoMark size={36} />
                </span>
                <div className="card-shadow max-w-[92%] rounded-3xl rounded-tl-md border border-slate-100 bg-white p-5 md:max-w-[78%]">
                  <Md text={m.text} className="text-[15px] font-medium leading-relaxed text-slate-700" />
                  {i > 0 && (
                    <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-dashed border-slate-200 pt-3">
                      {m.engine && (
                        <span
                          className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-extrabold ${
                            m.engine === "medgemma"
                              ? "bg-violet-50 text-violet-700"
                              : "bg-slate-50 text-slate-500"
                          }`}
                          title={m.engine === "medgemma" ? (m.model ?? "medgemma") : undefined}
                        >
                          <Sparkles className="h-3.5 w-3.5" />
                          {m.engine === "medgemma"
                            ? `MedGemma · ${m.model ?? "local"}`
                            : m.engine === "rules"
                              ? hi
                                ? "सुरक्षित उत्तर"
                                : "Saved answer"
                              : hi
                                ? "डेमो उत्तर"
                                : "Demo answer"}
                        </span>
                      )}
                      {(m.sources ?? 0) > 0 && (
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-50 px-3 py-1.5 text-xs font-extrabold text-brand-700">
                          <BookOpen className="h-3.5 w-3.5" />
                          {t("common.sources")}: {m.sources}
                        </span>
                      )}
                      {m.confidence && (
                        <span
                          className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-extrabold ${
                            m.confidence === "high"
                              ? "bg-mint-50 text-mint-700"
                              : "bg-amber-50 text-amber-700"
                          }`}
                        >
                          {m.confidence === "high" ? (
                            <ShieldCheck className="h-3.5 w-3.5" />
                          ) : (
                            <ShieldAlert className="h-3.5 w-3.5" />
                          )}
                          {m.confidence === "high" ? t("common.high") : t("common.moderate")}
                        </span>
                      )}
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-50 px-3 py-1.5 text-xs font-extrabold text-slate-500">
                        <Languages className="h-3.5 w-3.5" />
                        {/[\u0900-\u097F]/.test(m.text) ? "हिन्दी" : "English"}
                      </span>
                      <ListenBtn compact text={m.text} />
                      <span className="ml-auto flex items-center gap-1">
                        <button
                          onClick={() => vote(i, "up")}
                          aria-label={t("ask.helpful")}
                          className={`inline-flex h-10 w-10 items-center justify-center rounded-full border transition active:scale-90 ${
                            voted[i] === "up"
                              ? "border-mint-500 bg-mint-50 text-mint-700"
                              : "border-slate-200 text-slate-400 hover:text-mint-700"
                          }`}
                        >
                          <ThumbsUp className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => vote(i, "down")}
                          aria-label={t("ask.notHelpful")}
                          className={`inline-flex h-10 w-10 items-center justify-center rounded-full border transition active:scale-90 ${
                            voted[i] === "down"
                              ? "border-rose-400 bg-rose-50 text-rose-600"
                              : "border-slate-200 text-slate-400 hover:text-rose-600"
                          }`}
                        >
                          <ThumbsDown className="h-4 w-4" />
                        </button>
                      </span>
                    </div>
                  )}
                </div>
              </motion.div>
            )
          )}
          {typing && (
            <div className="flex gap-3">
              <span className="hidden shrink-0 sm:block">
                <LogoMark size={36} />
              </span>
              <div className="card-shadow flex items-center gap-3 rounded-3xl rounded-tl-md border border-slate-100 bg-white px-5 py-4 text-sm font-bold text-slate-400">
                <Sparkles className="h-4 w-4 text-mint-600" />
                {t("ask.typing")}
                <Dots />
              </div>
            </div>
          )}
          <div ref={endRef} />
        </div>

        {/* suggestions */}
        {suggested.length > 0 && (
          <div className="no-scrollbar -mx-1 mt-3 flex gap-2 overflow-x-auto px-1 py-1">
            {suggested.map((q) => (
              <button
                key={q.en}
                onClick={() => ask(hi ? q.hi : q.en)}
                className="min-h-11 shrink-0 rounded-full border border-brand-200 bg-white px-4 text-sm font-bold text-brand-700 transition hover:bg-brand-50 active:scale-95"
              >
                {hi ? q.hi : q.en}
              </button>
            ))}
          </div>
        )}

        {/* input */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            ask(input);
          }}
          className="sticky bottom-[76px] z-30 mt-3 flex items-center gap-2 rounded-3xl border border-slate-200 bg-white p-2 shadow-lg md:bottom-4"
        >
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={t("ask.placeholder")}
            className="min-h-12 min-w-0 flex-1 bg-transparent px-3 text-[15px] font-bold text-slate-700 outline-none placeholder:text-slate-400"
          />
          <button
            type="button"
            onClick={() => setVoiceOpen(true)}
            aria-label={t("ask.tapMic")}
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-mint-100 text-mint-700 transition hover:bg-mint-200 active:scale-90"
          >
            <Mic className="h-5 w-5" />
          </button>
          <button
            type="submit"
            disabled={!input.trim()}
            aria-label="Send"
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-brand-700 text-white transition hover:bg-brand-600 active:scale-90 disabled:opacity-40"
          >
            <Send className="h-5 w-5" />
          </button>
        </form>

        <div className="mt-3">
          <SafetyNote />
        </div>
      </div>

      <VoiceSheet open={voiceOpen} onClose={() => setVoiceOpen(false)} />
    </AppShell>
  );
}

"use client";

// Screen 9 ΓÇö "Ask About My Report" chat with suggested questions, typing
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
import { buildReportContext, conversationId, patientRef } from "@/lib/ai/reportContext";
import { LANGUAGES, languageOf, type AnswerLang } from "@/lib/ai/languages";

interface Msg {
  role: "user" | "ai";
  text: string;
  sources?: number;
  confidence?: "high" | "moderate";
  /** Which path produced this answer (additive; undefined on the welcome card). */
  engine?: "medgemma" | "mock" | "rules" | "fallback";
  model?: string | null;
  answerLang?: AnswerLang;
  qaMessageId?: string | null;
}

interface AnswerResponse {
  answer: string;
  sources: number;
  confidence: "high" | "moderate";
  engine?: "medgemma" | "mock" | "rules" | "fallback";
  model?: string | null;
  personalized?: boolean;
  answer_lang?: AnswerLang;
  qa_message_id?: string | null;
}

// The report context and the session id are built by src/lib/ai/reportContext.ts,
// which the voice agent uses too ΓÇö one definition, so the two surfaces cannot
// drift into sending different personalization payloads.

const SUGGESTED: { en: string; hi: string }[] = [
  { en: "Why is my hemoglobin low?", hi: "αñ«αÑçαñ░αñ╛ αñ╣αÑÇαñ«αÑïαñùαÑìαñ▓αÑïαñ¼αñ┐αñ¿ αñòαñ« αñòαÑìαñ»αÑïαñé αñ╣αÑê?" },
  { en: "What does HbA1c mean?", hi: "HbA1c αñòαñ╛ αñòαÑìαñ»αñ╛ αñ«αññαñ▓αñ¼ αñ╣αÑê?" },
  { en: "Which results changed the most?", hi: "αñòαÑîαñ¿ αñ╕αÑç αñ¬αñ░αñ┐αñúαñ╛αñ« αñ╕αñ¼αñ╕αÑç αñ£αñ╝αÑìαñ»αñ╛αñªαñ╛ αñ¼αñªαñ▓αÑç?" },
  { en: "Is my cholesterol pattern concerning?", hi: "αñòαÑìαñ»αñ╛ αñ«αÑçαñ░αñ╛ αñòαÑïαñ▓αÑçαñ╕αÑìαñƒαÑìαñ░αÑëαñ▓ αñ¬αÑêαñƒαñ░αÑìαñ¿ αñÜαñ┐αñéαññαñ╛αñ£αñ¿αñò αñ╣αÑê?" },
  { en: "Explain this like I'm 10.", hi: "αñçαñ╕αÑç αñ¼αñ╣αÑüαññ αñåαñ╕αñ╛αñ¿ αñ¡αñ╛αñ╖αñ╛ αñ«αÑçαñé αñ╕αñ«αñ¥αñ╛αñÅαñüαÑñ" },
  { en: "Explain this in Hindi.", hi: "αñ«αÑüαñ¥αÑç αñ╣αñ┐αñ¿αÑìαñªαÑÇ αñ«αÑçαñé αñ╕αñ«αñ¥αñ╛αñÅαñüαÑñ" },
];

export default function AskPage() {
  const { t, s } = useI18n();
  const { activeReport, patient, reports } = useReportData();
  // Lazy useState (not a ref write in render): computed once, never displayed,
  // so the SSR/client difference cannot cause a hydration mismatch.
  const [sessionId] = useState(() => conversationId("anvaya_chat_session_v1"));
  const hi = s.lang === "hi";
  const toast = useToast();
  const [answerLang, setAnswerLang] = useState<AnswerLang>(s.lang);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [typing, setTyping] = useState(false);
  const [input, setInput] = useState("");
  const [voiceOpen, setVoiceOpen] = useState(false);
  const [voted, setVoted] = useState<Record<number, "up" | "down">>({});
  const endRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const hasReport = activeReport.entries.length > 0;
    const reportDate = hi ? activeReport.date.hi : activeReport.date.en;
    setMsgs([
      {
        role: "ai",
        text: hi
          ? `αñ¿αñ«αñ╕αÑìαññαÑç! αñ«αÑêαñéαñ¿αÑç αñåαñ¬αñòαÑÇ **${reportDate}** αñòαÑÇ αñ░αñ┐αñ¬αÑïαñ░αÑìαñƒ αñ¬αñóαñ╝ αñ▓αÑÇ αñ╣αÑêαÑñ αñåαñ¬ αñàαñ¬αñ¿αÑç αñ¬αñ░αñ┐αñúαñ╛αñ«αÑïαñé αñòαÑç αñ¼αñ╛αñ░αÑç αñ«αÑçαñé αñòαÑüαñ¢ αñ¡αÑÇ αñ¬αÑéαñ¢ αñ╕αñòαññαÑç αñ╣αÑêαñé ΓÇö αñ╕αñ░αñ▓ αñ¡αñ╛αñ╖αñ╛ αñ«αÑçαñé, αñ»αñ╛ αñ¼αÑïαñ▓αñòαñ░αÑñ`
          : `Hello! I've read your **${reportDate}** report. Ask anything about your results ΓÇö in simple words, or by voice.`,
        sources: 0,
      },
    ]);
  }, [hi, activeReport.entries.length, activeReport.date.en, activeReport.date.hi]);

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
          answerLang,
          reading: s.mode,
          ...(sessionId ? { session: sessionId } : {}),
          ...patientRef(patient),
          report: buildReportContext({ activeReport, reports, patient, lang: s.lang }),
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
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
          answerLang: data.answer_lang ?? answerLang,
          qaMessageId: data.qa_message_id,
        },
      ]);
    } catch {
      setMsgs((m) => [
        ...m,
        {
          role: "ai",
          text: hi
            ? "αñàαñ¡αÑÇ αñëαññαÑìαññαñ░ αñëαñ¬αñ▓αñ¼αÑìαñº αñ¿αñ╣αÑÇαñé αñ╣αÑêαÑñ αñòαÑâαñ¬αñ»αñ╛ αñ½αñ┐αñ░ αñ¬αÑìαñ░αñ»αñ╛αñ╕ αñòαñ░αÑçαñéαÑñ"
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
          // Without the patient id the vote cannot be filed ΓÇö answer_feedback
          // is unique per (message, patient) so it knows who voted.
          ...patientRef(patient),
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
          {t("ask.tapMic")} ΓÇö {hi ? "αñ╣αñ┐αñ¿αÑìαñªαÑÇ αñ«αÑçαñé αñ¼αÑïαñ▓αÑçαñé" : "speak in Hindi"}
        </button>

        <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-brand-100 bg-brand-50/60 px-4 py-3">
          <div>
            <p className="text-sm font-extrabold text-brand-900">{hi ? "जवाब की भाषा" : "Answer language"}</p>
            <p className="text-xs font-medium text-brand-700/80">
              {hi ? "आप किसी भी उपलब्ध भाषा में पूछ सकते हैं।" : "Choose the language for this answer, or ask in your message."}
            </p>
          </div>
          <label className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-brand-200 bg-white px-3 text-xs font-extrabold text-brand-700">
            <Languages className="h-4 w-4" />
            <span className="sr-only">{hi ? "जवाब की भाषा" : "Answer language"}</span>
            <select
              value={answerLang}
              onChange={(e) => setAnswerLang(e.target.value as AnswerLang)}
              aria-label={hi ? "जवाब की भाषा" : "Answer language"}
              className="min-h-8 cursor-pointer bg-transparent pr-1 text-xs font-extrabold text-brand-700 outline-none"
            >
              {LANGUAGES.map((language) => (
                <option key={language.code} value={language.code}>
                  {language.native} · {language.english}
                </option>
              ))}
            </select>
          </label>
        </div>

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
                            m.engine === "medgemma" || m.engine === "mock"
                              ? "bg-violet-50 text-violet-700"
                              : "bg-slate-50 text-slate-500"
                          }`}
                          title={
                            m.engine === "medgemma" || m.engine === "mock"
                              ? (m.model ?? m.engine)
                              : undefined
                          }
                        >
                          <Sparkles className="h-3.5 w-3.5" />
                          {m.engine === "medgemma"
                            ? `MedGemma ┬╖ ${m.model ?? "local"}`
                            : m.engine === "rules"
                              ? hi
                                ? "αñ╕αÑüαñ░αñòαÑìαñ╖αñ┐αññ αñëαññαÑìαññαñ░"
                                : "Saved answer"
                              : hi
                                ? "αñíαÑçαñ«αÑï αñëαññαÑìαññαñ░"
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
                        {/[\u0900-\u097F]/.test(m.text) ? "αñ╣αñ┐αñ¿αÑìαñªαÑÇ" : "English"}
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

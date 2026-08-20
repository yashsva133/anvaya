"use client";

// Rxanvaya — voice interaction sheet: Listening → transcript → grounded answer.
// Simulated STT for the prototype; playback uses real Web Speech synthesis.

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { BookOpen, Languages, Mic, RotateCcw, Volume2 } from "lucide-react";
import Link from "next/link";
import { useI18n } from "@/lib/i18n";
import { Sheet, useToast } from "@/components/core";

type Stage = "listening" | "thinking" | "answer";

const HI_Q = "मेरा हीमोग्लोबिन कम क्यों है?";
const EN_Q = "Why is my hemoglobin low?";

const HI_A =
  "आपका हीमोग्लोबिन 10.5 ग्राम प्रति डेसिलीटर है, जो रिपोर्ट की सामान्य सीमा — 12 से 16 — से कम है।\n\nइसके कई कारण हो सकते हैं, जैसे आयरन की कमी, शरीर से ख़ून की कमी, या विटामिन की कमी। आपके रिपोर्ट में MCV भी सीमा के निचले हिस्से में है — यह जानकारी डॉक्टर के लिए उपयोगी है, लेकिन अकेले कारण नहीं बताती।\n\nकृपया इस परिणाम पर अपने डॉक्टर से सलाह लें — ख़ासकर यदि थकान, कमज़ोरी या चक्कर महसूस हों।";

const EN_A =
  "Your hemoglobin is 10.5 g/dL — below the reference range of 12–16 printed on your report.\n\nThere can be several reasons, such as low iron, blood loss, or vitamin deficiencies. Your MCV is also at the lower end of its range — useful information for your doctor, but it cannot identify the cause by itself.\n\nPlease discuss this result with your doctor — especially if you feel tired, weak or dizzy.";

function Eq() {
  return (
    <div className="flex h-12 items-end justify-center gap-1.5" aria-hidden="true">
      {[0.9, 0.5, 1.1, 0.7, 1.3, 0.6, 1.0, 0.8].map((d, i) => (
        <span
          key={i}
          className="w-2.5 origin-bottom animate-eq rounded-full bg-mint-500"
          style={{ height: "100%", animationDuration: `${d}s`, animationDelay: `${i * 0.08}s` }}
        />
      ))}
    </div>
  );
}

export function VoiceSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useI18n();
  const toast = useToast();
  const [stage, setStage] = useState<Stage>("listening");
  const [showEn, setShowEn] = useState(false);
  const [playing, setPlaying] = useState(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const supported = typeof window !== "undefined" && "speechSynthesis" in window;

  useEffect(() => {
    if (!open) return;
    setStage("listening");
    setShowEn(false);
    setPlaying(false);
    timers.current.forEach(clearTimeout);
    timers.current = [
      setTimeout(() => setStage("thinking"), 2400),
      setTimeout(() => setStage("answer"), 3900),
    ];
    return () => {
      timers.current.forEach(clearTimeout);
      if (supported) window.speechSynthesis.cancel();
      setPlaying(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const play = () => {
    if (!supported) {
      toast("Voice is not supported on this device.", "info");
      return;
    }
    if (playing) {
      window.speechSynthesis.cancel();
      setPlaying(false);
      return;
    }
    const u = new SpeechSynthesisUtterance((showEn ? EN_A : HI_A).replace(/\n/g, ". "));
    u.lang = showEn ? "en-IN" : "hi-IN";
    u.rate = 0.92;
    u.onend = () => setPlaying(false);
    u.onerror = () => setPlaying(false);
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(u);
    setPlaying(true);
    setTimeout(() => setPlaying(false), 60000);
  };

  return (
    <Sheet open={open} onClose={onClose} title={t("ask.tapMic")}>
      <div className="mt-1">
        <AnimatePresence mode="wait">
          {stage === "listening" && (
            <motion.div
              key="l"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex flex-col items-center py-8 text-center"
            >
              <div className="relative mb-6 flex h-24 w-24 items-center justify-center">
                <span className="absolute inline-flex h-full w-full animate-pulse-ring rounded-full bg-mint-400/50" />
                <span className="relative flex h-20 w-20 items-center justify-center rounded-full bg-mint-600 text-white shadow-lg">
                  <Mic className="h-9 w-9" />
                </span>
              </div>
              <p className="text-lg font-extrabold text-brand-900">{t("ask.listening")}</p>
              <p className="mt-1 text-sm font-medium text-slate-500">
                {showEn ? "Speak now…" : "बोलिए…"}
              </p>
              <div className="mt-6">
                <Eq />
              </div>
            </motion.div>
          )}

          {stage === "thinking" && (
            <motion.div
              key="t"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex flex-col items-center py-10 text-center"
            >
              <div className="mb-5 h-3 w-full max-w-xs overflow-hidden rounded-full bg-slate-100">
                <motion.div
                  className="h-full rounded-full bg-gradient-to-r from-mint-500 to-brand-600"
                  initial={{ width: "8%" }}
                  animate={{ width: "92%" }}
                  transition={{ duration: 1.3, ease: "easeInOut" }}
                />
              </div>
              <p className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-base font-bold text-slate-700">
                “{HI_Q}”
              </p>
              <p className="mt-3 text-sm font-semibold text-slate-500">
                {t("ask.typing")}
              </p>
            </motion.div>
          )}

          {stage === "answer" && (
            <motion.div
              key="a"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="py-2"
            >
              <p className="text-xs font-extrabold uppercase tracking-wide text-slate-400">
                {t("ask.youAsked")}
              </p>
              <p className="mt-1 rounded-2xl bg-brand-50 px-4 py-3 text-base font-extrabold text-brand-900">
                {showEn ? EN_Q : HI_Q}
              </p>

              <div className="mt-4 rounded-2xl border border-mint-200 bg-mint-50 p-4 text-[15px] font-medium leading-relaxed text-slate-700">
                {(showEn ? EN_A : HI_A).split("\n\n").map((p, i) => (
                  <p key={i} className={i > 0 ? "mt-2.5" : ""}>
                    {p}
                  </p>
                ))}
              </div>

              <div className="mt-3 flex items-center gap-2 text-xs font-bold text-slate-500">
                <BookOpen className="h-4 w-4 text-brand-600" />
                {t("common.sources")}: 1 · {t("common.confidence")}: {t("common.high")}
              </div>

              <div className="mt-4 grid grid-cols-2 gap-2">
                <button
                  onClick={play}
                  className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-mint-600 px-4 text-sm font-extrabold text-white shadow-md transition hover:bg-mint-500 active:scale-95"
                >
                  <Volume2 className="h-5 w-5" />
                  {playing ? t("common.stop") : t("ask.play")}
                </button>
                <button
                  onClick={() => setShowEn((v) => !v)}
                  className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl border border-brand-200 bg-white px-4 text-sm font-extrabold text-brand-700 transition hover:bg-brand-50 active:scale-95"
                >
                  <Languages className="h-5 w-5" />
                  {showEn ? t("ask.showHindi") : t("ask.showEnglish")}
                </button>
                <Link
                  href="/sources"
                  onClick={onClose}
                  className="col-span-2 inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm font-extrabold text-slate-700 transition hover:bg-slate-100 active:scale-95"
                >
                  <BookOpen className="h-5 w-5 text-brand-600" />
                  {t("ask.viewSources")}
                </Link>
              </div>

              <button
                onClick={() => {
                  setStage("listening");
                  setShowEn(false);
                  timers.current.forEach(clearTimeout);
                  timers.current = [
                    setTimeout(() => setStage("thinking"), 2400),
                    setTimeout(() => setStage("answer"), 3900),
                  ];
                }}
                className="mt-4 inline-flex w-full min-h-11 items-center justify-center gap-2 rounded-xl text-sm font-bold text-slate-400 transition hover:text-brand-700"
              >
                <RotateCcw className="h-4 w-4" />
                Retry
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </Sheet>
  );
}

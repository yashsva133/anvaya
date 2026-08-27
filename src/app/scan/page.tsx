"use client";

// Screen — simulated camera document-scanning experience.

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeft, Check, ScanSearch, Sun, ZoomIn } from "lucide-react";
import Link from "next/link";
import { useI18n } from "@/lib/i18n";

type Stage = { icon: "zoom" | "scan" | "sun"; en: string; hi: string };
const STAGES: Stage[] = [
  { icon: "zoom", en: "Move closer", hi: "थोड़ा पास लाइए" },
  { icon: "scan", en: "Report detected", hi: "रिपोर्ट पहचानी गई" },
  { icon: "sun", en: "Good lighting", hi: "रोशनी अच्छी है" },
];

const ANALYZE_STEPS = [
  { en: "Reading report", hi: "रिपोर्ट पढ़ी जा रही है" },
  { en: "Finding test values", hi: "परीक्षण मान ढूँढे जा रहे हैं" },
  { en: "Detecting reference ranges", hi: "सामान्य सीमा पहचानी जा रही है" },
  { en: "Understanding test names", hi: "परीक्षण नाम समझे जा रहे हैं" },
  { en: "Checking related results", hi: "संबंधित परिणाम जाँचे जा रहे हैं" },
];

export default function ScanPage() {
  const router = useRouter();
  const { s, t } = useI18n();
  const hi = s.lang === "hi";
  const [idx, setIdx] = useState(0);
  const [captured, setCaptured] = useState(false);
  const [analyzeStep, setAnalyzeStep] = useState(0);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    const cyc = setInterval(() => setIdx((i) => (i + 1) % STAGES.length), 1800);
    return () => clearInterval(cyc);
  }, []);

  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  const capture = () => {
    setCaptured(true);
    ANALYZE_STEPS.forEach((_, i) => {
      timers.current.push(setTimeout(() => setAnalyzeStep(i + 1), 700 + i * 620));
    });
    timers.current.push(
      setTimeout(() => router.push("/processing"), 700 + ANALYZE_STEPS.length * 620 + 400)
    );
  };

  const stage = STAGES[idx];
  const detected = idx > 0;

  return (
    <div className="flex min-h-dvh flex-col bg-brand-950 text-white">
      {/* top bar */}
      <div className="flex items-center gap-3 px-4 py-4">
        <Link
          href="/upload"
          aria-label={t("common.back")}
          className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-white transition hover:bg-white/20"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <p className="text-sm font-extrabold">
          {hi ? "रिपोर्ट की फ़ोटो लें" : "Take photo of report"}
        </p>
      </div>

      {/* viewfinder */}
      <div className="relative mx-auto w-full max-w-md flex-1 px-4 pb-4">
        <div className="relative h-full min-h-[420px] w-full overflow-hidden rounded-[2rem] border border-white/15 bg-black">
          <Image
            src="/images/sample-report.png"
            alt="Camera preview of a laboratory report"
            fill
            priority
            className={`object-cover transition-all duration-700 ${
              detected ? "scale-105 opacity-90" : "scale-100 opacity-60 blur-[1.5px]"
            } ${captured ? "opacity-30" : ""}`}
          />

          {/* scanner frame */}
          {!captured && (
            <>
              <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-black/40" />
              <div className="absolute inset-x-8 inset-y-14">
                {(["tl", "tr", "bl", "br"] as const).map((c) => (
                  <motion.span
                    key={c}
                    animate={{
                      borderColor: detected ? "#34d399" : "#ffffff",
                      scale: detected ? 1.05 : 1,
                    }}
                    className={`absolute h-12 w-12 border-[4px] transition-colors ${
                      c === "tl"
                        ? "left-0 top-0 rounded-tl-3xl border-b-0 border-r-0"
                        : c === "tr"
                          ? "right-0 top-0 rounded-tr-3xl border-b-0 border-l-0"
                          : c === "bl"
                            ? "bottom-0 left-0 rounded-bl-3xl border-r-0 border-t-0"
                            : "bottom-0 right-0 rounded-br-3xl border-l-0 border-t-0"
                    }`}
                  />
                ))}
                {/* scan line */}
                <span className="absolute inset-x-2 animate-scan">
                  <span className="block h-0.5 w-full rounded-full bg-mint-400 shadow-[0_0_16px_4px_rgba(52,211,153,0.55)]" />
                </span>
              </div>

              {/* guidance chip */}
              <div className="absolute inset-x-0 top-6 flex justify-center">
                <AnimatePresence mode="wait">
                  <motion.div
                    key={idx}
                    initial={{ opacity: 0, y: -8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 8 }}
                    className={`flex items-center gap-2 rounded-full px-4 py-2 text-sm font-extrabold backdrop-blur ${
                      detected ? "bg-mint-500/90 text-white" : "bg-white/15 text-white"
                    }`}
                  >
                    {stage.icon === "zoom" && <ZoomIn className="h-4 w-4" />}
                    {stage.icon === "scan" && <ScanSearch className="h-4 w-4" />}
                    {stage.icon === "sun" && <Sun className="h-4 w-4" />}
                    {hi ? stage.hi : stage.en}
                  </motion.div>
                </AnimatePresence>
              </div>
            </>
          )}

          {/* captured / analyzing overlay */}
          <AnimatePresence>
            {captured && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="absolute inset-0 flex flex-col items-center justify-center bg-brand-950/85 p-6 backdrop-blur-sm"
              >
                <motion.span
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: "spring", stiffness: 260, damping: 16 }}
                  className="flex h-20 w-20 items-center justify-center rounded-full bg-mint-500 text-white shadow-lg shadow-mint-500/40"
                >
                  <Check className="h-10 w-10" strokeWidth={3} />
                </motion.span>
                <p className="mt-4 text-center text-lg font-extrabold">
                  {t("scan.success")}
                </p>
                <p className="mt-1 text-sm font-semibold text-white/60">
                  {hi ? "आपकी रिपोर्ट समझी जा रही है…" : "Analyzing your report…"}
                </p>

                <ul className="mt-6 w-full max-w-xs space-y-2.5">
                  {ANALYZE_STEPS.map((st, i) => {
                    const done = analyzeStep > i;
                    return (
                      <motion.li
                        key={st.en}
                        initial={{ opacity: 0, x: -8 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 0.2 + i * 0.12 }}
                        className="flex items-center gap-3 text-sm font-bold"
                      >
                        <span
                          className={`flex h-6 w-6 items-center justify-center rounded-full transition ${
                            done ? "bg-mint-500 text-white" : "bg-white/15 text-white/40"
                          }`}
                        >
                          {done ? (
                            <Check className="h-3.5 w-3.5" strokeWidth={3.5} />
                          ) : (
                            <span className="h-1.5 w-1.5 rounded-full bg-current" />
                          )}
                        </span>
                        <span className={done ? "text-white" : "text-white/45"}>
                          {hi ? st.hi : st.en}
                        </span>
                      </motion.li>
                    );
                  })}
                </ul>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* shutter */}
      {!captured && (
        <div className="flex items-center justify-center pb-10 pt-2">
          <button
            onClick={capture}
            aria-label={t("scan.capture")}
            className="flex h-20 w-20 items-center justify-center rounded-full border-4 border-white/80 bg-white/20 transition active:scale-90"
          >
            <span className="h-14 w-14 rounded-full bg-white shadow-inner" />
          </button>
        </div>
      )}
    </div>
  );
}

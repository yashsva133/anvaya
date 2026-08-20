"use client";

// Screen 3 — AI report processing. Staged pipeline + progress.

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Check, FileScan, Loader2 } from "lucide-react";
import { useI18n } from "@/lib/i18n";

const STEP_KEYS = ["process.s1", "process.s2", "process.s3", "process.s4", "process.s5"];
const DURATION = 6400;

export default function ProcessingPage() {
  const router = useRouter();
  const { t } = useI18n();
  const [pct, setPct] = useState(0);
  const raf = useRef<number>(0);

  useEffect(() => {
    const start = performance.now();
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / DURATION);
      // ease out with small plateaus
      const eased = 1 - Math.pow(1 - p, 2.2);
      setPct(Math.round(eased * 100));
      if (p < 1) raf.current = requestAnimationFrame(tick);
      else setTimeout(() => router.push("/extracted"), 500);
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [router]);

  const activeStep = Math.min(STEP_KEYS.length - 1, Math.floor((pct / 100) * STEP_KEYS.length));

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-gradient-to-b from-brand-950 via-brand-900 to-brand-800 px-6 text-white">
      {/* animated document */}
      <div className="relative">
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 14, repeat: Infinity, ease: "linear" }}
          className="absolute -inset-8 rounded-full border-2 border-dashed border-mint-400/40"
        />
        <motion.div
          animate={{ y: [0, -10, 0] }}
          transition={{ duration: 3.4, repeat: Infinity, ease: "easeInOut" }}
          className="card-lift relative flex h-40 w-40 flex-col items-center justify-center rounded-3xl bg-white/10 backdrop-blur"
        >
          <FileScan className="h-14 w-14 text-mint-300" strokeWidth={1.8} />
          {/* extracted lines */}
          <div className="mt-4 space-y-1.5">
            {[46, 62, 38].map((w, i) => (
              <motion.div
                key={i}
                initial={{ width: 0, opacity: 0 }}
                animate={{ width: w, opacity: 1 }}
                transition={{ delay: 0.8 + i * 0.5, duration: 0.5 }}
                className="h-1.5 rounded-full bg-mint-300/70"
              />
            ))}
          </div>
        </motion.div>
      </div>

      <h1 className="mt-12 text-center text-2xl font-extrabold md:text-3xl">
        {t("process.title")}
      </h1>

      {/* progress */}
      <div className="mt-8 w-full max-w-sm">
        <div className="flex items-end justify-between">
          <p className="text-sm font-bold text-white/70">Progress</p>
          <p className="tabular text-4xl font-extrabold text-mint-300">
            {pct}
            <span className="text-lg">%</span>
          </p>
        </div>
        <div className="mt-2 h-3 w-full overflow-hidden rounded-full bg-white/15">
          <div
            className="h-full rounded-full bg-gradient-to-r from-mint-400 to-mint-300 transition-[width] duration-200"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      {/* stages */}
      <ul className="mt-8 w-full max-w-sm space-y-3">
        {STEP_KEYS.map((key, i) => {
          const done = activeStep > i;
          const active = activeStep === i;
          return (
            <li key={key} className="flex items-center gap-3">
              <span
                className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition ${
                  done
                    ? "bg-mint-500 text-white"
                    : active
                      ? "bg-white/20 text-mint-300"
                      : "bg-white/10 text-white/30"
                }`}
              >
                {done ? (
                  <Check className="h-4 w-4" strokeWidth={3} />
                ) : active ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <span className="h-1.5 w-1.5 rounded-full bg-current" />
                )}
              </span>
              <p
                className={`text-[15px] font-bold transition ${
                  done ? "text-white" : active ? "text-mint-200" : "text-white/40"
                }`}
              >
                {t(key)}
              </p>
            </li>
          );
        })}
      </ul>

      <p className="mt-10 max-w-xs text-center text-xs font-medium leading-relaxed text-white/50">
        {t("process.note")}
      </p>
    </div>
  );
}

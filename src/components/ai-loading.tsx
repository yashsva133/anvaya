"use client";

// ---------------------------------------------------------------------------
// Loading states for anything MedGemma writes.
//
// A local 4B model on a CPU can take several seconds per card, so "wait with no
// feedback" is not an option — and a bare spinner tells a person nothing about
// why a health app is thinking. These two pieces say what is happening:
//
//   AiStages   cycles the real steps of the pipeline (reading the report,
//              comparing earlier reports, checking sources, writing it simply)
//              so the wait is legible rather than mysterious.
//   AiLines    shimmer placeholders in the shape of the text that will land,
//              so the layout does not jump when it arrives.
//
// Both respect the app's reduce-motion setting: with animation off the stages
// stop cycling and the shimmer becomes a static tint.
// ---------------------------------------------------------------------------

import { useEffect, useState } from "react";
import { Sparkles } from "lucide-react";
import { useI18n } from "@/lib/i18n";

const STAGE_KEYS = [
  "ai.load.reading",
  "ai.load.comparing",
  "ai.load.sources",
  "ai.load.writing",
] as const;

export function AiStages({
  /** Keys to cycle through; defaults to the four pipeline steps. */
  keys = STAGE_KEYS as readonly string[],
  intervalMs = 2200,
  className = "",
  tone = "amber",
}: {
  keys?: readonly string[];
  intervalMs?: number;
  className?: string;
  tone?: "amber" | "violet" | "slate";
}) {
  const { t, s } = useI18n();
  const [i, setI] = useState(0);

  useEffect(() => {
    if (s.reduceMotion || keys.length <= 1) return;
    // Stop on the last stage rather than looping back to "reading your
    // report" — a second lap would suggest the work restarted.
    const id = setInterval(() => setI((n) => Math.min(n + 1, keys.length - 1)), intervalMs);
    return () => clearInterval(id);
  }, [keys.length, intervalMs, s.reduceMotion]);

  const colour =
    tone === "violet" ? "text-violet-700" : tone === "slate" ? "text-slate-500" : "text-amber-700";

  return (
    <p
      className={`flex items-center gap-2 text-sm font-bold ${colour} ${className}`}
      role="status"
      aria-live="polite"
    >
      <Sparkles className={`h-4 w-4 shrink-0 ${s.reduceMotion ? "" : "animate-pulse"}`} />
      <span>{t(keys[i])}</span>
      <span className="inline-flex items-center gap-0.5" aria-hidden>
        {[0, 1, 2].map((d) => (
          <span
            key={d}
            className={`h-1 w-1 rounded-full bg-current ${s.reduceMotion ? "" : "animate-bounce"}`}
            style={{ animationDelay: `${d * 0.15}s` }}
          />
        ))}
      </span>
    </p>
  );
}

/**
 * Shimmer placeholder lines. `widths` are Tailwind width classes, so a caller
 * can match the shape of the text it is waiting for.
 */
export function AiLines({
  widths = ["w-11/12", "w-10/12", "w-9/12"],
  tone = "amber",
  className = "",
}: {
  widths?: string[];
  tone?: "amber" | "violet" | "slate";
  className?: string;
}) {
  const { s } = useI18n();
  const bg = tone === "violet" ? "bg-violet-100" : tone === "slate" ? "bg-slate-200" : "bg-amber-100";
  return (
    <div className={`space-y-2.5 ${className}`} aria-hidden>
      {widths.map((w, i) => (
        <div
          key={i}
          className={`h-3.5 rounded-full ${bg} ${w} ${s.reduceMotion ? "" : "animate-pulse"}`}
          style={s.reduceMotion ? undefined : { animationDelay: `${i * 0.12}s` }}
        />
      ))}
    </div>
  );
}

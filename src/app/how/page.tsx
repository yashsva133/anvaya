"use client";

// Screen — "How it works": the full AI pipeline, judge-facing.

import Link from "next/link";
import { motion } from "framer-motion";
import {
  ArrowRight,
  BookOpenCheck,
  Bot,
  BrainCircuit,
  Camera,
  ChevronDown,
  Globe2,
  HeartHandshake,
  Lock,
  Paintbrush,
  Ruler,
  ScanLine,
  TrafficCone,
  TrendingUp,
  Workflow,
} from "lucide-react";
import { AppShell } from "@/components/shell";
import { Logo, SectionTitle } from "@/components/core";
import { useI18n, pick } from "@/lib/i18n";
import { PIPELINE } from "@/lib/data";
import type { LucideIcon } from "lucide-react";

const ICON_MAP: Record<string, LucideIcon> = {
  camera: Camera,
  scan: ScanLine,
  broom: Paintbrush,
  ruler: Ruler,
  traffic: TrafficCone,
  brain: BrainCircuit,
  book: BookOpenCheck,
  bot: Bot,
  chart: TrendingUp,
  globe: Globe2,
  userheart: HeartHandshake,
};

export default function HowPage() {
  const { t, s } = useI18n();
  const hi = s.lang === "hi";

  return (
    <AppShell>
      <div className="flex items-center justify-between">
        <SectionTitle
          icon={Workflow}
          title={t("nav.how")}
          sub={
            hi
              ? "रिपोर्ट से लेकर समझ तक — पूरा AI पाइपलाइन।"
              : "From paper report to understanding — the full pipeline."
          }
        />
        <span className="hidden md:block">
          <Logo />
        </span>
      </div>

      {/* pipeline */}
      <div className="relative mt-6">
        <div className="absolute bottom-8 left-6 top-8 w-1 rounded-full bg-gradient-to-b from-mint-300 via-brand-300 to-mint-400 md:left-1/2 md:-translate-x-1/2" />
        <div className="space-y-5">
          {PIPELINE.map((step, i) => {
            const Icon = ICON_MAP[step.icon] ?? Camera;
            const left = i % 2 === 0;
            return (
              <motion.div
                key={step.title.en}
                initial={{ opacity: 0, y: 18 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-40px" }}
                transition={{ duration: 0.45, delay: 0.03 * i }}
                className={`relative flex gap-4 md:w-1/2 ${
                  left ? "md:pr-12" : "md:ml-auto md:pl-12 md:flex-row-reverse"
                }`}
              >
                <span className="relative z-10 flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-700 to-mint-600 text-white shadow-lg md:absolute md:left-1/2 md:-translate-x-1/2">
                  <Icon className="h-5.5 h-[22px] w-[22px]" strokeWidth={2.2} />
                </span>
                <div className="card-shadow flex-1 rounded-3xl border border-slate-100 bg-white p-5 transition hover:-translate-y-0.5 hover:border-mint-300">
                  <p className="flex items-center gap-2 text-[10px] font-extrabold uppercase tracking-[0.18em] text-mint-700">
                    {hi ? "चरण" : "Step"} {i + 1}
                  </p>
                  <p className="mt-1 text-base font-extrabold text-brand-950">
                    {pick(step.title, s.lang)}
                  </p>
                  <p className="mt-1 text-sm font-medium leading-relaxed text-slate-500">
                    {pick(step.desc, s.lang)}
                  </p>
                </div>
              </motion.div>
            );
          })}
        </div>
        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          className="relative z-10 mx-auto mt-4 flex h-12 w-12 items-center justify-center rounded-full bg-mint-600 text-white shadow-lg md:mx-auto"
          style={{ marginLeft: "auto", marginRight: "auto" }}
        >
          <ChevronDown className="h-6 w-6" strokeWidth={2.6} />
        </motion.div>
      </div>

      {/* principles */}
      <div className="mt-10 grid gap-4 md:grid-cols-3">
        {[
          {
            icon: Lock,
            title: hi ? "निजता पहले" : "Privacy first",
            desc: hi
              ? "रिपोर्ट पूरा होते ही मूल छवि हटाई जा सकती है; डेटा एन्क्रिप्टेड।"
              : "Reports can be deleted after processing; data encrypted in transit and at rest.",
          },
          {
            icon: BrainCircuit,
            title: hi ? "तर्क + स्रोत" : "Reasoning + grounding",
            desc: hi
              ? "नॉलेज-ग्राफ़ नियम और RAG मिलकर काम करते हैं — अंदाज़ा नहीं।"
              : "A clinical knowledge graph plus RAG — grounded, not guessed.",
          },
          {
            icon: HeartHandshake,
            title: hi ? "मनुष्य निर्णयकर्ता" : "Doctor decides",
            desc: hi
              ? "AI केवल समझाता है; निदान हमेशा डॉक्टर का होता है।"
              : "AI only explains; diagnosis always belongs to the clinician.",
          },
        ].map((x, i) => (
          <motion.div
            key={x.title}
            initial={{ opacity: 0, y: 14 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: i * 0.08 }}
            className="card-shadow rounded-3xl border border-slate-100 bg-white p-6"
          >
            <x.icon className="h-7 w-7 text-mint-700" />
            <p className="mt-3 text-base font-extrabold text-brand-950">{x.title}</p>
            <p className="mt-1 text-sm font-medium leading-relaxed text-slate-500">{x.desc}</p>
          </motion.div>
        ))}
      </div>

      {/* CTA */}
      <div className="mt-10 flex flex-wrap justify-center gap-3">
        <Link
          href="/insights"
          className="inline-flex min-h-14 items-center gap-2 rounded-2xl bg-brand-700 px-6 text-base font-extrabold text-white shadow-lg transition hover:bg-brand-600 active:scale-95"
        >
          {hi ? "इसे काम करते देखें" : "See it in action"}
          <ArrowRight className="h-5 w-5" />
        </Link>
        <Link
          href="/why"
          className="inline-flex min-h-14 items-center gap-2 rounded-2xl border-2 border-brand-200 bg-white px-6 text-base font-extrabold text-brand-800 transition hover:border-brand-400 active:scale-95"
        >
          {hi ? "तुलना देखें" : "Compare approaches"}
        </Link>
      </div>
    </AppShell>
  );
}

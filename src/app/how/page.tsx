"use client";

// Screen — "How it works": the full AI pipeline and core principles.

import Link from "next/link";
import { motion } from "framer-motion";
import {
  ArrowRight,
  BookOpenCheck,
  Bot,
  BrainCircuit,
  Camera,
  CheckCircle2,
  Globe2,
  HeartHandshake,
  Lock,
  Paintbrush,
  Ruler,
  ScanLine,
  ShieldCheck,
  Sparkles,
  TrafficCone,
  TrendingUp,
  Workflow,
} from "lucide-react";
import { AppShell } from "@/components/shell";
import { SectionTitle } from "@/components/core";
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
      {/* -------------------------------- Header -------------------------------- */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <SectionTitle
          icon={Workflow}
          title={t("nav.how")}
          sub={
            hi
              ? "रिपोर्ट से लेकर समझ तक — पूरा AI पाइपलाइन और कार्यप्रणाली।"
              : "From paper report to understanding — the complete AI pipeline."
          }
        />
        <div className="hidden sm:flex items-center gap-2 rounded-full bg-brand-50 px-4 py-2 text-xs font-extrabold text-brand-800">
          <Sparkles className="h-4 w-4 text-brand-600" />
          {hi ? "11-चरणीय सत्यापन पाइपलाइन" : "11-Step Verification Pipeline"}
        </div>
      </div>

      {/* --------------------------- Pipeline Roadmap --------------------------- */}
      <section className="mt-8">
        <div className="card-shadow rounded-[2rem] border border-slate-100 bg-white p-5 sm:p-7 md:p-9">
          <div className="mb-6 flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4">
            <div>
              <h2 className="text-lg sm:text-xl font-extrabold text-brand-950">
                {hi ? "AI विश्लेषण पाइपलाइन" : "AI Processing Pipeline"}
              </h2>
              <p className="text-xs sm:text-sm font-semibold text-slate-400">
                {hi
                  ? "हर रिपोर्ट इन 11 विशेष चरणों से होकर गुजरती है"
                  : "Every report is processed sequentially across these 11 specialized stages"}
              </p>
            </div>
            <span className="rounded-full bg-mint-100 px-3 py-1 text-xs font-extrabold text-mint-800">
              {hi ? "पूर्ण स्वचालित + सत्यापित" : "Fully Automated & Grounded"}
            </span>
          </div>

          {/* Stepped Timeline Rail */}
          <div className="relative ml-4 sm:ml-6 border-l-[3px] border-dashed border-brand-200 pl-6 sm:pl-9 space-y-5 sm:space-y-6">
            {PIPELINE.map((step, i) => {
              const Icon = ICON_MAP[step.icon] ?? Camera;
              const isFirst = i === 0;
              const isLast = i === PIPELINE.length - 1;

              return (
                <motion.div
                  key={step.title.en}
                  initial={{ opacity: 0, x: -12 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true, margin: "-30px" }}
                  transition={{ duration: 0.4, delay: i * 0.04 }}
                  className="relative"
                >
                  {/* Timeline Node Badge - perfectly centered on rail */}
                  <span
                    className={`absolute -left-[39px] sm:-left-[51px] top-2 flex h-9 w-9 sm:h-10 sm:w-10 items-center justify-center rounded-2xl border-4 border-white text-white shadow-md transition-all ${
                      isFirst
                        ? "bg-brand-700 ring-4 ring-brand-100"
                        : isLast
                          ? "bg-mint-600 ring-4 ring-mint-100"
                          : "bg-brand-600 ring-2 ring-slate-100"
                    }`}
                  >
                    <Icon className="h-4 w-4 sm:h-[18px] sm:w-[18px]" strokeWidth={2.2} />
                  </span>

                  {/* Step Content Card */}
                  <div
                    className={`card-shadow group rounded-3xl border p-4 sm:p-5 transition-all hover:-translate-y-0.5 hover:shadow-md ${
                      isFirst
                        ? "border-brand-200 bg-gradient-to-br from-brand-50/40 via-white to-white"
                        : isLast
                          ? "border-mint-200 bg-gradient-to-br from-mint-50/40 via-white to-white"
                          : "border-slate-100 bg-white hover:border-brand-200"
                    }`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wider text-slate-600">
                        {hi ? "चरण" : "Step"} {String(i + 1).padStart(2, "0")}
                      </span>
                      {isLast && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-mint-100 px-2.5 py-0.5 text-[10px] font-extrabold text-mint-800">
                          <CheckCircle2 className="h-3 w-3" />
                          {hi ? "अंतिम आउटपुट" : "Final Delivery"}
                        </span>
                      )}
                    </div>

                    <h3 className="mt-2 text-base sm:text-lg font-extrabold text-brand-950">
                      {pick(step.title, s.lang)}
                    </h3>

                    <p className="mt-1 text-xs sm:text-sm font-medium leading-relaxed text-slate-500">
                      {pick(step.desc, s.lang)}
                    </p>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ------------------------- Core Trust Principles ------------------------- */}
      <section className="mt-10">
        <SectionTitle
          icon={ShieldCheck}
          title={hi ? "हमारे मूल सिद्धांत" : "Core Safety & Design Principles"}
          sub={
            hi
              ? "रोगी सुरक्षा, डेटा गोपनीयता और क्लिनिकल विश्वसनीयता सर्वोपरि हैं।"
              : "Patient safety, privacy, and clinical reliability guide every interaction."
          }
        />

        <div className="grid gap-4 md:grid-cols-3">
          {[
            {
              icon: Lock,
              title: hi ? "निजता पहले" : "Privacy first",
              desc: hi
                ? "रिपोर्ट पूरा होते ही मूल छवि हटाई जा सकती है; डेटा एन्क्रिप्टेड और सुरक्षित रहता है।"
                : "Reports can be deleted after processing; medical data is encrypted in transit and at rest.",
              tint: "bg-sky-50 text-sky-700 border-sky-200",
            },
            {
              icon: BrainCircuit,
              title: hi ? "तर्क + स्रोत" : "Reasoning + Grounding",
              desc: hi
                ? "क्लिनिकल नॉलेज-ग्राफ़ नियम और विश्वसनीय RAG मिलकर काम करते हैं — कोई निराधार अंदाज़ा नहीं।"
                : "A clinical knowledge graph paired with verified medical RAG — grounded, never guessed.",
              tint: "bg-violet-50 text-violet-700 border-violet-200",
            },
            {
              icon: HeartHandshake,
              title: hi ? "चिकित्सक ही निर्णायक" : "Doctor decides",
              desc: hi
                ? "AI केवल रोगी को समझाने और शिक्षित करने के लिए है; अंतिम निदान हमेशा डॉक्टर का होता है।"
                : "AI is strictly educational; clinical correlation and diagnosis always belong to the doctor.",
              tint: "bg-mint-50 text-mint-700 border-mint-200",
            },
          ].map((x, i) => (
            <motion.div
              key={x.title}
              initial={{ opacity: 0, y: 14 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.08 }}
              className={`card-shadow rounded-3xl border-2 p-6 bg-white transition hover:-translate-y-0.5 ${x.tint}`}
            >
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white shadow-sm ring-1 ring-slate-100">
                <x.icon className="h-6 w-6" />
              </div>
              <h3 className="mt-4 text-base sm:text-lg font-extrabold text-brand-950">{x.title}</h3>
              <p className="mt-2 text-xs sm:text-sm font-medium leading-relaxed text-slate-600">{x.desc}</p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* ------------------------------- Footer CTA ------------------------------ */}
      <div className="mt-10 flex flex-wrap justify-center gap-3">
        <Link
          href="/upload"
          className="inline-flex min-h-14 items-center gap-2 rounded-2xl bg-brand-700 px-6 text-base font-extrabold text-white shadow-lg transition hover:bg-brand-600 active:scale-95"
        >
          <Sparkles className="h-5 w-5" />
          {hi ? "रिपोर्ट अपलोड करें" : "Upload your report"}
        </Link>
        <Link
          href="/insights"
          className="inline-flex min-h-14 items-center gap-2 rounded-2xl border-2 border-brand-200 bg-white px-6 text-base font-extrabold text-brand-800 transition hover:border-brand-400 active:scale-95"
        >
          <BrainCircuit className="h-5 w-5" />
          {hi ? "AI इनसाइट्स देखें" : "Explore AI insights"}
          <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
    </AppShell>
  );
}

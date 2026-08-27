"use client";

// Rxanvaya — landing page (marketing + product story).

import Image from "next/image";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  ArrowRight,
  BookOpen,
  BookOpenCheck,
  BrainCircuit,
  Camera,
  CheckCircle2,
  HeartPulse,
  Languages,
  Lock,
  Mic,
  Play,
  ScanSearch,
  TrendingUp,
  Volume2,
  X,
} from "lucide-react";
import { HomeNav } from "@/components/shell";
import { ListenBtn, TestIcon } from "@/components/core";

const fadeUp = {
  initial: { opacity: 0, y: 24 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: "-60px" },
  transition: { duration: 0.55, ease: "easeOut" as const },
};

const FEATURES = [
  {
    icon: ScanSearch,
    title: "Read Reports",
    desc: "Camera photos, PDFs and scans of any Indian lab report — understood instantly.",
    tint: "bg-sky-100 text-sky-600",
  },
  {
    icon: BrainCircuit,
    title: "Understand Patterns",
    desc: "Related tests are connected — not read as isolated numbers.",
    tint: "bg-violet-100 text-violet-600",
  },
  {
    icon: TrendingUp,
    title: "See Trends",
    desc: "Old reports join in, so every number gets its story over time.",
    tint: "bg-emerald-100 text-emerald-600",
  },
  {
    icon: BookOpenCheck,
    title: "Trusted Sources",
    desc: "Every explanation cites MedlinePlus, CDC, AHA-style evidence.",
    tint: "bg-brand-100 text-brand-600",
  },
  {
    icon: Languages,
    title: "Indian Languages",
    desc: "English, हिन्दी, বাংলা and more — built in from day one.",
    tint: "bg-amber-100 text-amber-600",
  },
  {
    icon: Volume2,
    title: "Voice Friendly",
    desc: "Listen to every explanation. Speak your questions in your language.",
    tint: "bg-rose-100 text-rose-600",
  },
];

const CHAIN = [
  "Report",
  "Understand",
  "Connect",
  "Track",
  "Explain",
  "Cite",
  "Ask",
];

export default function LandingPage() {
  return (
    <div className="min-h-dvh overflow-x-clip bg-[#F6F9F8]">
          <HomeNav />

          {/* ------------------------------- HERO ------------------------------- */}
          <section className="relative mx-auto grid w-full max-w-6xl items-center gap-10 px-4 pb-16 pt-28 md:grid-cols-2 md:px-6 md:pt-36 lg:gap-6">
            <div className="pointer-events-none absolute -left-32 top-24 h-72 w-72 rounded-full bg-mint-200/50 blur-3xl" />
            <div className="pointer-events-none absolute -right-24 top-64 h-72 w-72 rounded-full bg-brand-200/40 blur-3xl" />

            <div className="relative">
              <motion.span
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="inline-flex items-center gap-2 rounded-full border border-mint-300 bg-mint-50 px-3.5 py-1.5 text-xs font-extrabold text-mint-800"
              >
                <HeartPulse className="h-4 w-4" />
                AI for every Indian patient · SIH 2026
              </motion.span>

              <motion.h1
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.05 }}
                className="mt-5 text-balance text-4xl font-extrabold leading-[1.05] tracking-tight text-brand-950 md:text-6xl"
              >
                Your lab report.
                <br />
                <span className="bg-gradient-to-r from-mint-600 to-brand-700 bg-clip-text text-transparent">
                  Finally easy to understand.
                </span>
              </motion.h1>

              <motion.p
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.12 }}
                className="mt-5 max-w-md text-lg font-medium leading-relaxed text-slate-600"
              >
                Upload a report. Understand your results in simple words. See
                changes over time. Ask questions in your language.
              </motion.p>

              <motion.div
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.18 }}
                className="mt-8 flex flex-wrap items-center gap-3"
              >
                <Link
                  href="/welcome"
                  className="inline-flex min-h-14 items-center gap-2 rounded-2xl bg-brand-700 px-7 text-base font-extrabold text-white shadow-lg shadow-brand-900/25 transition hover:-translate-y-0.5 hover:bg-brand-600 active:scale-95"
                >
                  Understand My Report
                  <ArrowRight className="h-5 w-5" />
                </Link>
                <Link
                  href="/dashboard"
                  className="inline-flex min-h-14 items-center gap-2 rounded-2xl border-2 border-brand-200 bg-white px-7 text-base font-extrabold text-brand-800 transition hover:border-brand-400 active:scale-95"
                >
                  <Play className="h-5 w-5" />
                  See Demo
                </Link>
              </motion.div>

              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.3 }}
                className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-sm font-bold text-slate-500"
              >
                <span className="inline-flex items-center gap-1.5">
                  <Lock className="h-4 w-4 text-mint-600" /> Private by design
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <BookOpen className="h-4 w-4 text-mint-600" /> Cited medical
                  sources
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <Languages className="h-4 w-4 text-mint-600" /> English ·
                  हिन्दी · বাংলা
                </span>
              </motion.div>
            </div>

            {/* Hero visual */}
            <motion.div
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.6, ease: "easeOut" }}
              className="relative mx-auto w-full max-w-md md:max-w-lg"
            >
              <div className="card-lift relative overflow-hidden rounded-[2rem] border border-white bg-white">
                <Image
                  src="/images/hero-illustration.svg"
                  alt="A patient holding a lab report while Rxअन्वय turns numbers into simple visual cards"
                  width={1024}
                  height={1024}
                  className="h-auto w-full"
                  priority
                />
              </div>

              {/* floating product chips */}
              <motion.div
                animate={{ y: [0, -10, 0] }}
                transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
                className="card-lift absolute -left-4 top-8 flex items-center gap-2 rounded-2xl border border-emerald-200 bg-white px-3.5 py-2.5 md:-left-8"
              >
                <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                <div className="leading-tight">
                  <p className="text-xs font-extrabold text-slate-800">
                    Creatinine 1.0
                  </p>
                  <p className="text-[10px] font-bold text-emerald-600">
                    Within usual range
                  </p>
                </div>
              </motion.div>

              <motion.div
                animate={{ y: [0, 10, 0] }}
                transition={{ duration: 6, repeat: Infinity, ease: "easeInOut", delay: 0.6 }}
                className="card-lift absolute -right-3 top-1/2 flex items-center gap-2 rounded-2xl border border-rose-200 bg-white px-3.5 py-2.5 md:-right-6"
              >
                <TestIcon testId="hemoglobin" size={30} />
                <div className="leading-tight">
                  <p className="text-xs font-extrabold text-slate-800">
                    Hemoglobin 10.5 ↓
                  </p>
                  <p className="text-[10px] font-bold text-rose-600">
                    Lower than usual
                  </p>
                </div>
              </motion.div>

              <motion.div
                animate={{ y: [0, -8, 0] }}
                transition={{ duration: 5.5, repeat: Infinity, ease: "easeInOut", delay: 1 }}
                className="card-lift absolute -bottom-5 left-10 flex items-center gap-2.5 rounded-2xl border border-slate-200 bg-brand-900 px-4 py-2.5 text-white"
              >
                <Mic className="h-5 w-5 text-mint-300" />
                <p className="text-xs font-bold">“मेरा हीमोग्लोबिन कम क्यों है?”</p>
              </motion.div>
            </motion.div>
          </section>

          {/* ---------------------------- DIFFERENTIATOR ---------------------------- */}
          <section className="mx-auto w-full max-w-6xl px-4 py-12 md:px-6">
            <motion.div {...fadeUp} className="text-center">
              <h2 className="text-balance text-2xl font-extrabold tracking-tight text-brand-950 md:text-4xl">
                Not another number-flagging portal.
              </h2>
              <p className="mx-auto mt-2 max-w-xl text-sm font-medium text-slate-500 md:text-base">
                Rxअन्वय is built for understanding — from the lab slip to a
                conversation in your language.
              </p>
            </motion.div>

            <div className="mt-8 grid gap-4 md:grid-cols-3">
              <motion.div
                {...fadeUp}
                className="rounded-3xl border border-slate-200 bg-white p-6"
              >
                <p className="text-xs font-extrabold uppercase tracking-widest text-slate-400">
                  Lab portals
                </p>
                <div className="mt-4 flex items-center gap-2 text-lg font-extrabold text-slate-700">
                  <span className="rounded-xl bg-slate-100 px-3 py-1.5">10.5</span>
                  <ArrowRight className="h-4 w-4 text-slate-300" />
                  <span className="rounded-xl bg-rose-100 px-3 py-1.5 text-rose-700">
                    Low
                  </span>
                </div>
                <p className="mt-4 flex items-start gap-2 text-sm font-medium text-slate-500">
                  <X className="mt-0.5 h-4 w-4 shrink-0 text-rose-400" />
                  A flag with no meaning for the patient.
                </p>
              </motion.div>

              <motion.div
                {...fadeUp}
                transition={{ ...fadeUp.transition, delay: 0.08 }}
                className="rounded-3xl border border-slate-200 bg-white p-6"
              >
                <p className="text-xs font-extrabold uppercase tracking-widest text-slate-400">
                  Generic AI chatbots
                </p>
                <div className="mt-4 flex items-center gap-2 text-lg font-extrabold text-slate-700">
                  <span className="rounded-xl bg-slate-100 px-3 py-1.5">10.5</span>
                  <ArrowRight className="h-4 w-4 text-slate-300" />
                  <span className="rounded-xl bg-slate-100 px-3 py-1.5">
                    Text paragraph
                  </span>
                </div>
                <p className="mt-4 flex items-start gap-2 text-sm font-medium text-slate-500">
                  <X className="mt-0.5 h-4 w-4 shrink-0 text-rose-400" />
                  Long text, no sources, no trends, no certainty signal.
                </p>
              </motion.div>

              <motion.div
                {...fadeUp}
                transition={{ ...fadeUp.transition, delay: 0.16 }}
                className="card-lift relative overflow-hidden rounded-3xl border-2 border-mint-500 bg-gradient-to-br from-mint-50 to-white p-6"
              >
                <p className="text-xs font-extrabold uppercase tracking-widest text-mint-700">
                  Rxअन्वय
                </p>
                <div className="mt-4 flex flex-wrap items-center gap-1.5 text-[13px] font-extrabold text-mint-800">
                  {CHAIN.map((c, i) => (
                    <span key={c} className="flex items-center gap-1.5">
                      <span className="rounded-lg bg-white px-2 py-1 shadow-sm">
                        {c}
                      </span>
                      {i < CHAIN.length - 1 && (
                        <ArrowRight className="h-3.5 w-3.5 text-mint-400" />
                      )}
                    </span>
                  ))}
                </div>
                <p className="mt-4 flex items-start gap-2 text-sm font-bold text-mint-900">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-mint-600" />
                  Understanding for everyone — with evidence and voice.
                </p>
              </motion.div>
            </div>
          </section>

          {/* ------------------------------ FEATURES GRID ----------------------------- */}
          <section className="mx-auto w-full max-w-6xl px-4 py-12 md:px-6">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {FEATURES.map((f, i) => (
                <motion.div
                  key={f.title}
                  {...fadeUp}
                  transition={{ ...fadeUp.transition, delay: i * 0.05 }}
                  className="card-shadow group rounded-3xl border border-slate-100 bg-white p-6 transition hover:-translate-y-1"
                >
                  <span
                    className={`inline-flex h-12 w-12 items-center justify-center rounded-2xl ${f.tint}`}
                  >
                    <f.icon className="h-6 w-6" strokeWidth={2.2} />
                  </span>
                  <h3 className="mt-4 text-lg font-extrabold text-brand-900">
                    {f.title}
                  </h3>
                  <p className="mt-1.5 text-sm font-medium leading-relaxed text-slate-500">
                    {f.desc}
                  </p>
                </motion.div>
              ))}
            </div>
          </section>

          {/* ------------------------- ACCESSIBILITY MOMENT ------------------------ */}
          <section className="mx-auto w-full max-w-6xl px-4 py-14 md:px-6">
            <motion.div
              {...fadeUp}
              className="overflow-hidden rounded-[2rem] bg-brand-900 p-6 md:p-10"
            >
              <div className="grid items-center gap-8 md:grid-cols-2">
                <div>
                  <p className="text-xs font-extrabold uppercase tracking-widest text-mint-300">
                    The core innovation
                  </p>
                  <h2 className="mt-2 text-balance text-2xl font-extrabold text-white md:text-4xl">
                    Medical understanding for everyone — not just educated
                    users.
                  </h2>
                  <p className="mt-4 text-sm font-medium leading-relaxed text-brand-100 md:text-base">
                    If “HbA1c represents glycated hemoglobin” means nothing to
                    you, Rxअन्वय shows this instead:
                  </p>
                  <div className="mt-6 flex flex-wrap gap-3 text-xs font-bold text-brand-100">
                    <span className="rounded-full bg-white/10 px-3 py-1.5">
                      Big touch targets
                    </span>
                    <span className="rounded-full bg-white/10 px-3 py-1.5">
                      Icon-first cards
                    </span>
                    <span className="rounded-full bg-white/10 px-3 py-1.5">
                      Plain-language names
                    </span>
                    <span className="rounded-full bg-white/10 px-3 py-1.5">
                      Voice readout
                    </span>
                  </div>
                </div>

                <div className="card-lift rounded-3xl border border-white/10 bg-white/5 p-6 backdrop-blur">
                  <div className="flex items-center gap-3">
                    <TestIcon testId="hba1c" size={44} />
                    <div>
                      <p className="text-sm font-extrabold text-white">
                        Average blood sugar · HbA1c
                      </p>
                      <p className="text-xs font-semibold text-mint-300">
                        Higher than usual (7.2%)
                      </p>
                    </div>
                  </div>
                  <p className="mt-4 text-sm font-medium leading-relaxed text-slate-200">
                    Think of HbA1c as your blood sugar’s average memory over the
                    past 3 months. When it is higher than usual, your doctor may
                    check your diet, exercise, and blood sugar control.
                  </p>
                  <div className="mt-4 flex items-center justify-between border-t border-white/10 pt-4 text-xs font-bold text-mint-300">
                    <span>Evidence: ADA Standards of Care</span>
                    <span className="rounded-full bg-mint-400/20 px-2.5 py-1 text-mint-200">
                      High confidence · 94%
                    </span>
                  </div>
                </div>
              </div>
            </motion.div>
          </section>

          {/* ------------------------------- FINAL CTA ------------------------------- */}
          <section className="mx-auto w-full max-w-6xl px-4 py-16 text-center md:px-6">
            <motion.div
              {...fadeUp}
              className="card-lift relative overflow-hidden rounded-[2.5rem] bg-gradient-to-br from-brand-900 via-brand-800 to-mint-900 p-8 text-white md:p-14"
            >
              <div className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full bg-mint-400/10 blur-3xl" />
              <h2 className="text-balance text-2xl font-extrabold tracking-tight md:text-5xl">
                Ready to understand your lab report?
              </h2>
              <p className="mx-auto mt-3 max-w-md text-sm font-medium text-brand-100 md:text-base">
                Try the live prototype with fictional patient data or scan your
                own test.
              </p>
              <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
                <Link
                  href="/welcome"
                  className="inline-flex min-h-14 items-center gap-2 rounded-2xl bg-mint-500 px-7 text-base font-extrabold text-brand-950 shadow-lg shadow-mint-950/30 transition hover:bg-mint-400 active:scale-95"
                >
                  Understand my report
                  <ArrowRight className="h-5 w-5" />
                </Link>
                <Link
                  href="/how"
                  className="inline-flex min-h-14 items-center gap-2 rounded-2xl border-2 border-white/40 px-7 text-base font-extrabold text-white transition hover:bg-white/10 active:scale-95"
                >
                  How it works
                </Link>
              </div>
            </motion.div>

            <p className="mt-8 text-center text-xs font-medium text-slate-400">
              Rxअन्वय prototype · Smart India Hackathon 2026 · All patient data
              shown is fictional.
            </p>
          </section>
    </div>
  );
}

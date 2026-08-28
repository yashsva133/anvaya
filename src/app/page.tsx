"use client";

// RxAnvaya — polished landing page (marketing + product story + 3-step how it works).

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
  ScanSearch,
  Sparkles,
  TrendingUp,
  UploadCloud,
  Volume2,
  X,
} from "lucide-react";
import { HomeNav } from "@/components/shell";
import { ListenBtn, TestIcon } from "@/components/core";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";

const fadeUp = {
  initial: { opacity: 0, y: 24 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: "-60px" },
  transition: { duration: 0.55, ease: "easeOut" as const },
};

const HOW_IT_WORKS_STEPS = [
  {
    step: "01",
    icon: UploadCloud,
    titleEn: "Upload Report",
    titleHi: "रिपोर्ट अपलोड करें",
    descEn:
      "Take a camera photo, upload a PDF, or upload lab slips from any Indian diagnostic centre.",
    descHi:
      "कैमरे से फोटो लें, PDF अपलोड करें या किसी भी भारतीय लैब की रिपोर्ट जोड़ें।",
    tint: "bg-sky-50 border-sky-200 text-sky-700",
    badgeTint: "bg-sky-600 text-white",
  },
  {
    step: "02",
    icon: BrainCircuit,
    titleEn: "AI Analysis & Pattern Detection",
    titleHi: "AI विश्लेषण और पैटर्न पहचान",
    descEn:
      "Extracts every value against clinically validated reference ranges and connects related tests together.",
    descHi:
      "मान्य मेडिकल संदर्भ श्रेणियों के साथ हर मान की जाँच करता है और जुड़े हुए टेस्ट्स को आपस में जोड़ता है।",
    tint: "bg-violet-50 border-violet-200 text-violet-700",
    badgeTint: "bg-violet-600 text-white",
  },
  {
    step: "03",
    icon: Sparkles,
    titleEn: "Personalized Insights & Voice",
    titleHi: "व्यक्तिगत सुझाव और आवाज़",
    descEn:
      "Read in simple words, listen in your native language (English, हिन्दी, বাংলা), and see longitudinal trends.",
    descHi:
      "आसान शब्दों में समझें, अपनी भाषा में सुनें और समय के साथ स्वास्थ्य में बदलाव देखें।",
    tint: "bg-mint-50 border-mint-200 text-mint-800",
    badgeTint: "bg-mint-600 text-white",
  },
];

const FEATURES = [
  {
    icon: ScanSearch,
    title: "Read Reports Instantly",
    desc: "Camera photos, PDFs and scans of any Indian lab report — understood accurately.",
    tint: "bg-sky-100 text-sky-600",
  },
  {
    icon: BrainCircuit,
    title: "Understand Test Patterns",
    desc: "Related tests are connected (e.g. Lipids or Liver function) — not read as isolated numbers.",
    tint: "bg-violet-100 text-violet-600",
  },
  {
    icon: TrendingUp,
    title: "Track Health Trends",
    desc: "Historical reports join together so every number reveals its progression over time.",
    tint: "bg-emerald-100 text-emerald-600",
  },
  {
    icon: BookOpenCheck,
    title: "Trusted Medical Sources",
    desc: "Every explanation cites MedlinePlus, CDC, ICMR, and AHA clinical evidence.",
    tint: "bg-brand-100 text-brand-600",
  },
  {
    icon: Languages,
    title: "Indian Languages Built-In",
    desc: "English, हिन्दी, বাংলা and more — built with culturally natural vernacular translations.",
    tint: "bg-amber-100 text-amber-600",
  },
  {
    icon: Volume2,
    title: "Voice-First Experience",
    desc: "Listen to every card. Speak your questions in your preferred language naturally.",
    tint: "bg-rose-100 text-rose-600",
  },
];

export default function LandingPage() {
  const { s } = useI18n();
  const { user, isOnboarded } = useAuth();

  const getStartedHref = user
    ? isOnboarded
      ? "/dashboard"
      : "/onboarding"
    : "/login?mode=signup";

  return (
    <div className="min-h-dvh overflow-x-clip bg-[#F6F9F8]">
      <HomeNav />

      {/* ------------------------------- HERO ------------------------------- */}
      <section className="relative mx-auto grid w-full max-w-6xl items-center gap-10 px-4 pb-16 pt-24 md:grid-cols-2 md:px-6 md:pt-32 lg:gap-8">
        <div className="pointer-events-none absolute -left-32 top-24 h-72 w-72 rounded-full bg-mint-200/50 blur-3xl" />
        <div className="pointer-events-none absolute -right-24 top-64 h-72 w-72 rounded-full bg-brand-200/40 blur-3xl" />

        <div className="relative">
          <motion.span
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="inline-flex items-center gap-2 rounded-full border border-mint-300 bg-mint-50 px-3.5 py-1.5 text-xs font-extrabold text-mint-800"
          >
            <HeartPulse className="h-4 w-4 text-mint-600" />
            {s.lang === "hi"
              ? "हर भारतीय मरीज़ के लिए AI स्वास्थ्य साथी"
              : "AI Health Companion for Every Indian Patient"}
          </motion.span>

          <motion.h1
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05 }}
            className="mt-5 text-balance text-4xl font-extrabold leading-[1.08] tracking-tight text-brand-950 sm:text-5xl md:text-6xl"
          >
            {s.lang === "hi" ? (
              <>
                आपकी लैब रिपोर्ट।
                <br />
                <span className="bg-gradient-to-r from-mint-600 to-brand-700 bg-clip-text text-transparent">
                  अब समझने में आसान।
                </span>
              </>
            ) : (
              <>
                Your lab report.
                <br />
                <span className="bg-gradient-to-r from-mint-600 to-brand-700 bg-clip-text text-transparent">
                  Finally easy to understand.
                </span>
              </>
            )}
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.12 }}
            className="mt-5 max-w-md text-base font-medium leading-relaxed text-slate-600 sm:text-lg"
          >
            {s.lang === "hi"
              ? "रिपोर्ट अपलोड करें, आसान भाषा में अपने नतीजे समझें, समय के साथ रुझान देखें और अपनी भाषा में सवाल पूछें।"
              : "Upload a medical report. Understand your lab results in clear, everyday words. Track trends over time and ask questions in your language."}
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.18 }}
            className="mt-8 flex flex-wrap items-center gap-3 sm:gap-4"
          >
            <Link
              href={getStartedHref}
              className="inline-flex min-h-13 sm:min-h-14 items-center gap-2 rounded-2xl bg-brand-700 px-7 sm:px-8 text-sm sm:text-base font-extrabold text-white shadow-lg shadow-brand-900/25 transition hover:-translate-y-0.5 hover:bg-brand-600 active:scale-95"
            >
              {user
                ? s.lang === "hi"
                  ? "डैशबोर्ड पर जाएं"
                  : "Go to Dashboard"
                : s.lang === "hi"
                  ? "शुरू करें"
                  : "Get Started Free"}
              <ArrowRight className="h-5 w-5" />
            </Link>
          </motion.div>

          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3 }}
            className="mt-8 flex flex-wrap gap-x-5 gap-y-2 text-xs sm:text-sm font-bold text-slate-500"
          >
            <span className="inline-flex items-center gap-1.5">
              <Lock className="h-4 w-4 text-mint-600 shrink-0" />
              {s.lang === "hi" ? "गोपनीय एवं सुरक्षित" : "Private by design"}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <BookOpen className="h-4 w-4 text-mint-600 shrink-0" />
              {s.lang === "hi" ? "चिकित्सीय प्रमाण उद्धरण" : "Cited medical sources"}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Languages className="h-4 w-4 text-mint-600 shrink-0" />
              English · हिन्दी · বাংলা
            </span>
          </motion.div>
        </div>

        {/* Hero Visual Card */}
        <motion.div
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.6, ease: "easeOut" }}
          className="relative mx-auto w-full max-w-md md:max-w-lg"
        >
          <div className="card-lift relative overflow-hidden rounded-[2rem] border border-white bg-white">
            <Image
              src="/images/hero-illustration.svg"
              alt="A patient holding a lab report while RxAnvaya turns numbers into simple visual cards"
              width={1024}
              height={1024}
              className="h-auto w-full"
              priority
            />
          </div>

          {/* Floating Product Chips */}
          <motion.div
            animate={{ y: [0, -10, 0] }}
            transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
            className="card-lift absolute -left-2 top-6 flex items-center gap-2 rounded-2xl border border-emerald-200 bg-white px-3 py-2 sm:px-3.5 sm:py-2.5 md:-left-6"
          >
            <CheckCircle2 className="h-5 w-5 text-emerald-500 shrink-0" />
            <div className="leading-tight">
              <p className="text-xs font-extrabold text-slate-800">
                Lab result ready to explain
              </p>
              <p className="text-[10px] font-bold text-emerald-600">
                {s.lang === "hi" ? "आपकी रिपोर्ट से" : "From your report"}
              </p>
            </div>
          </motion.div>

          <motion.div
            animate={{ y: [0, 10, 0] }}
            transition={{ duration: 6, repeat: Infinity, ease: "easeInOut", delay: 0.6 }}
            className="card-lift absolute -right-2 top-1/2 flex items-center gap-2 rounded-2xl border border-rose-200 bg-white px-3 py-2 sm:px-3.5 sm:py-2.5 md:-right-4"
          >
            <TestIcon testId="hemoglobin" size={28} />
            <div className="leading-tight">
              <p className="text-xs font-extrabold text-slate-800">
                {s.lang === "hi" ? "परिणाम पर ध्यान दें" : "Result needs a closer look"}
              </p>
              <p className="text-[10px] font-bold text-rose-600">
                {s.lang === "hi" ? "डॉक्टर से चर्चा करें" : "Discuss with your doctor"}
              </p>
            </div>
          </motion.div>

          <motion.div
            animate={{ y: [0, -8, 0] }}
            transition={{ duration: 5.5, repeat: Infinity, ease: "easeInOut", delay: 1 }}
            className="card-lift absolute -bottom-4 left-6 flex items-center gap-2.5 rounded-2xl border border-slate-200 bg-brand-900 px-3.5 py-2.5 text-white sm:left-10"
          >
            <Mic className="h-5 w-5 text-mint-300 shrink-0" />
            <p className="text-xs font-bold">
              {s.lang === "hi" ? "“मेरा हीमोग्लोबिन कम क्यों है?”" : "“Why is my hemoglobin low?”"}
            </p>
          </motion.div>
        </motion.div>
      </section>

      {/* --------------------------- 3-STEP HOW IT WORKS --------------------------- */}
      <section className="mx-auto w-full max-w-6xl px-4 py-16 md:px-6">
        <motion.div {...fadeUp} className="text-center">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-brand-200 bg-brand-50 px-3 py-1 text-xs font-extrabold text-brand-800">
            <Sparkles className="h-3.5 w-3.5 text-brand-600" />
            {s.lang === "hi" ? "सरल 3 चरण" : "Simple 3-Step Process"}
          </span>
          <h2 className="mt-3 text-balance text-2xl font-extrabold tracking-tight text-brand-950 sm:text-3xl md:text-4xl">
            {s.lang === "hi"
              ? "यह कैसे काम करता है"
              : "How RxAnvaya Works"}
          </h2>
          <p className="mx-auto mt-2 max-w-xl text-sm font-medium text-slate-500 sm:text-base">
            {s.lang === "hi"
              ? "कागज़ की रिपोर्ट से लेकर आपकी भाषा में बातचीत तक की पूरी यात्रा।"
              : "From paper lab slip to clinical understanding in your own language."}
          </p>
        </motion.div>

        <div className="mt-10 grid gap-6 md:grid-cols-3">
          {HOW_IT_WORKS_STEPS.map((step, idx) => {
            const Icon = step.icon;
            return (
              <motion.div
                key={step.step}
                {...fadeUp}
                transition={{ ...fadeUp.transition, delay: idx * 0.1 }}
                className="relative rounded-3xl border border-slate-200 bg-white p-6 shadow-sm transition hover:-translate-y-1 hover:shadow-md"
              >
                <div className="flex items-center justify-between">
                  <span
                    className={`flex h-12 w-12 items-center justify-center rounded-2xl border ${step.tint}`}
                  >
                    <Icon className="h-6 w-6" strokeWidth={2.2} />
                  </span>
                  <span
                    className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-extrabold ${step.badgeTint}`}
                  >
                    {step.step}
                  </span>
                </div>

                <h3 className="mt-5 text-lg font-extrabold text-brand-950">
                  {s.lang === "hi" ? step.titleHi : step.titleEn}
                </h3>

                <p className="mt-2 text-sm font-medium leading-relaxed text-slate-600">
                  {s.lang === "hi" ? step.descHi : step.descEn}
                </p>
              </motion.div>
            );
          })}
        </div>
      </section>

      {/* ---------------------------- DIFFERENTIATOR ---------------------------- */}
      <section className="mx-auto w-full max-w-6xl px-4 py-14 md:px-6">
        <motion.div {...fadeUp} className="text-center">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-mint-200 bg-mint-50 px-3 py-1 text-xs font-extrabold text-mint-800">
            <Sparkles className="h-3.5 w-3.5 text-mint-600" />
            {s.lang === "hi" ? "RxAnvaya का अंतर" : "The RxAnvaya Difference"}
          </span>
          <h2 className="mt-3 text-balance text-2xl font-extrabold tracking-tight text-brand-950 sm:text-3xl md:text-4xl">
            {s.lang === "hi"
              ? "केवल नंबर दिखाने वाला पोर्टल नहीं।"
              : "Not another number-flagging portal."}
          </h2>
          <p className="mx-auto mt-2 max-w-xl text-sm font-medium text-slate-500 sm:text-base">
            {s.lang === "hi"
              ? "RxAnvaya को समझने के लिए बनाया गया है — कठिन मेडिकल रिपोर्ट से लेकर आपकी भाषा में स्पष्ट ज्ञान तक।"
              : "RxAnvaya is built for understanding — turning isolated lab tests into clear, verified guidance."}
          </p>
        </motion.div>

        <div className="mt-10 grid items-stretch gap-5 md:grid-cols-3">
          {/* Card 1: Lab Portals (Bright Rose Theme) */}
          <motion.div
            {...fadeUp}
            className="card-lift relative flex flex-col justify-between overflow-hidden rounded-3xl border-2 border-rose-300 bg-gradient-to-b from-rose-50/90 via-white to-white p-6 shadow-lg shadow-rose-950/5"
          >
            <div>
              <div className="flex items-center justify-between">
                <span className="text-xs font-extrabold uppercase tracking-wider text-rose-900">
                  Lab Portals
                </span>
                <span className="rounded-full bg-rose-600 px-3 py-0.5 text-xs font-extrabold text-white shadow-sm">
                  Just Flags
                </span>
              </div>

              {/* Visual Box */}
              <div className="mt-4 rounded-2xl border border-rose-200/90 bg-white p-4 shadow-sm">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-extrabold text-slate-900">Lab result</span>
                  <span className="rounded-lg bg-rose-100 px-2.5 py-1 text-xs font-extrabold text-rose-700">
                    Needs context ⚠️
                  </span>
                </div>
                <p className="mt-2 text-xs font-semibold text-slate-500">
                  Reference range from your report · Raw number only
                </p>
              </div>
            </div>

            <p className="mt-5 flex items-start gap-2 text-xs sm:text-sm font-bold text-slate-700">
              <X className="mt-0.5 h-4 w-4 shrink-0 text-rose-600" strokeWidth={2.5} />
              {s.lang === "hi"
                ? "केवल लाल चेतावनी और संख्याएँ — कोई समझ या मार्गदर्शन नहीं।"
                : "A confusing red flag with no context, guidance, or next steps."}
            </p>
          </motion.div>

          {/* Card 2: Generic AI Chatbots (Bright Amber Theme) */}
          <motion.div
            {...fadeUp}
            transition={{ ...fadeUp.transition, delay: 0.08 }}
            className="card-lift relative flex flex-col justify-between overflow-hidden rounded-3xl border-2 border-amber-300 bg-gradient-to-b from-amber-50/90 via-white to-white p-6 shadow-lg shadow-amber-950/5"
          >
            <div>
              <div className="flex items-center justify-between">
                <span className="text-xs font-extrabold uppercase tracking-wider text-amber-900">
                  Generic AI Chatbots
                </span>
                <span className="rounded-full bg-amber-600 px-3 py-0.5 text-xs font-extrabold text-white shadow-sm">
                  Dense Jargon
                </span>
              </div>

              {/* Visual Box */}
              <div className="mt-4 rounded-2xl border border-amber-200/90 bg-white p-4 shadow-sm">
                <p className="line-clamp-2 text-xs font-semibold leading-relaxed text-slate-800">
                  “A clinical result needs context, plain-language explanation, and a safe next step...”
                </p>
                <p className="mt-2 text-xs font-bold text-amber-700">
                  ⚠️ Unverified claims · No trend history
                </p>
              </div>
            </div>

            <p className="mt-5 flex items-start gap-2 text-xs sm:text-sm font-bold text-slate-700">
              <X className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" strokeWidth={2.5} />
              {s.lang === "hi"
                ? "लंबे अपरिचित पैराग्राफ, कोई रुझान चार्ट नहीं और बिना पुष्टि की सलाह।"
                : "Long paragraphs of jargon, unverified claims, and no trend history."}
            </p>
          </motion.div>

          {/* Card 3: RxAnvaya (Hero Highlight Card - Mint Theme) */}
          <motion.div
            {...fadeUp}
            transition={{ ...fadeUp.transition, delay: 0.16 }}
            className="card-lift relative flex flex-col justify-between overflow-hidden rounded-3xl border-2 border-mint-500 bg-gradient-to-b from-mint-50/90 via-white to-white p-6 shadow-lg shadow-mint-950/10"
          >
            <div>
              <div className="flex items-center justify-between">
                <span className="text-xs font-extrabold uppercase tracking-wider text-mint-900">
                  RxAnvaya
                </span>
                <span className="rounded-full bg-mint-600 px-3 py-0.5 text-xs font-extrabold text-white shadow-sm">
                  ⭐ Recommended
                </span>
              </div>

              {/* Visual Box */}
              <div className="mt-4 rounded-2xl border border-mint-200/90 bg-white p-4 shadow-sm">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-extrabold text-brand-950">Your lab result</span>
                  <span className="rounded-lg bg-mint-100 px-2.5 py-1 text-xs font-extrabold text-mint-700">
                    Explained clearly ✓
                  </span>
                </div>
                <p className="mt-1.5 text-xs font-bold text-slate-700">
                  {s.lang === "hi"
                    ? "आसान हिंदी में समझें और आवाज़ में सुनें।"
                    : "Explained in simple everyday words with audio narration."}
                </p>
                <div className="mt-2.5 flex flex-wrap gap-1.5 text-[11px] font-extrabold text-mint-800">
                  <span className="rounded-md bg-mint-100 px-2.5 py-0.5">🔊 Voice</span>
                  <span className="rounded-md bg-mint-100 px-2.5 py-0.5">📚 ICMR Cited</span>
                  <span className="rounded-md bg-mint-100 px-2.5 py-0.5">📈 Trends</span>
                </div>
              </div>
            </div>

            <p className="mt-5 flex items-start gap-2 text-xs sm:text-sm font-extrabold text-mint-950">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-mint-600" strokeWidth={2.5} />
              {s.lang === "hi"
                ? "सभी के लिए सरल समझ — भारतीय भाषाओं, आवाज़ और प्रमाण के साथ।"
                : "Complete understanding for everyone — with cited medical sources and voice."}
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

      {/* ------------------------- ACCESSIBILITY & VOICE DEMO ------------------------ */}
      <section className="mx-auto w-full max-w-6xl px-4 py-14 md:px-6">
        <motion.div
          {...fadeUp}
          className="overflow-hidden rounded-[2rem] bg-brand-900 p-6 md:p-10 shadow-xl"
        >
          <div className="grid items-center gap-8 md:grid-cols-2">
            <div>
              <p className="text-xs font-extrabold uppercase tracking-widest text-mint-300">
                {s.lang === "hi" ? "पहुँच एवं समावेशन" : "Core Innovation"}
              </p>
              <h2 className="mt-2 text-balance text-2xl font-extrabold text-white md:text-4xl">
                {s.lang === "hi"
                  ? "सभी के लिए चिकित्सकीय समझ — किसी भी साक्षरता स्तर पर।"
                  : "Medical understanding for everyone — regardless of reading level."}
              </h2>
              <p className="mt-4 text-sm font-medium leading-relaxed text-brand-100 md:text-base">
                {s.lang === "hi"
                  ? "यदि “HbA1c ग्लाइकेटेड हीमोग्लोबिन को दर्शाता है” समझना कठिन है, तो RxAnvaya इसे इस तरह प्रस्तुत करता है:"
                  : "If complex lab terminology feels confusing, RxAnvaya translates it into clear visual cards with voice support:"}
              </p>
              <div className="mt-6 flex flex-wrap gap-2.5 text-xs font-bold text-brand-100">
                <span className="rounded-full bg-white/10 px-3 py-1.5">
                  Big touch targets
                </span>
                <span className="rounded-full bg-white/10 px-3 py-1.5">
                  Icon-first cards
                </span>
                <span className="rounded-full bg-white/10 px-3 py-1.5">
                  Voice narration in every screen
                </span>
                <span className="rounded-full bg-white/10 px-3 py-1.5">
                  3 reading levels
                </span>
              </div>
            </div>

            <motion.div
              animate={{ y: [0, -8, 0] }}
              transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
              className="mx-auto w-full max-w-sm rounded-3xl bg-white p-5 shadow-2xl"
            >
              <div className="flex items-center gap-4">
                <TestIcon testId="hba1c" size={56} />
                <div>
                  <p className="text-base sm:text-lg font-extrabold text-slate-900">
                    {s.lang === "hi" ? "आपकी लैब जाँच" : "Your lab result"}
                  </p>
                  <p className="tabular text-2xl sm:text-3xl font-extrabold text-brand-900">
                    —
                  </p>
                </div>
              </div>
              <div className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs sm:text-sm font-bold text-rose-700">
                <ArrowRight className="h-4 w-4 rotate-45" strokeWidth={3} />
                {s.lang === "hi" ? "रिपोर्ट से समझाया जाएगा" : "Explained after upload"}
              </div>
              <p className="mt-3 text-sm sm:text-[15px] font-medium leading-relaxed text-slate-600">
                {s.lang === "hi"
                  ? "अपनी रिपोर्ट अपलोड करने के बाद हर जाँच का मान, संदर्भ सीमा और अर्थ आसान भाषा में समझें।"
                  : "After you upload a report, each result is explained with its reference range and context."}
              </p>
              <div className="mt-4 flex items-center gap-2">
                <ListenBtn text={s.lang === "hi" ? "अपनी रिपोर्ट अपलोड करें। हम आपके परिणाम आसान भाषा में समझाएँगे।" : "Upload your report. We will explain your results in simple language."} />
                <span className="text-xs font-bold text-slate-400">
                  {s.lang === "hi" ? "टैप करें — आवाज़ में सुनें" : "Tap — reads aloud"}
                </span>
              </div>
            </motion.div>
          </div>
        </motion.div>
      </section>

      {/* --------------------------------- CTA BAND -------------------------------- */}
      <section className="mx-auto w-full max-w-6xl px-4 pb-16 pt-4 md:px-6">
        <motion.div
          {...fadeUp}
          className="card-lift flex flex-col items-center gap-6 rounded-[2rem] bg-gradient-to-br from-mint-600 to-brand-800 px-6 py-12 text-center text-white"
        >
          <Camera className="h-10 w-10 text-white/80" />
          <h2 className="text-balance text-2xl font-extrabold sm:text-4xl md:text-5xl">
            {s.lang === "hi"
              ? "अपनी लैब रिपोर्ट को आसानी से समझें।"
              : "Know what your report is saying."}
          </h2>
          <p className="max-w-md text-sm font-semibold text-white/85 sm:text-base">
            {s.lang === "hi"
              ? "केवल संख्याएँ नहीं, बल्कि उनका वास्तविक अर्थ जानें। शैक्षिक उद्देश्य हेतु — यह डॉक्टरी निदान नहीं है।"
              : "Clear medical insights with cited evidence. Educational — never a substitute for a doctor's consultation."}
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            <Link
              href={getStartedHref}
              className="inline-flex min-h-13 sm:min-h-14 items-center gap-2 rounded-2xl bg-white px-7 text-sm sm:text-base font-extrabold text-brand-800 shadow-lg transition hover:-translate-y-0.5 active:scale-95"
            >
              {user
                ? s.lang === "hi"
                  ? "डैशबोर्ड खोलें"
                  : "Open Dashboard"
                : s.lang === "hi"
                  ? "मुफ्त में शुरू करें"
                  : "Get Started Free"}
              <ArrowRight className="h-5 w-5" />
            </Link>
          </div>
        </motion.div>

        {/* Prominent Healthcare Disclaimer */}
        <div className="mt-8 rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 text-center">
          <p className="text-xs font-semibold leading-relaxed text-slate-500">
            <strong className="font-extrabold text-slate-700">
              {s.lang === "hi" ? "चिकित्सीय अस्वीकरण (Healthcare Disclaimer): " : "Healthcare Disclaimer: "}
            </strong>
            {s.lang === "hi"
              ? "RxAnvaya केवल शैक्षिक और सूचनात्मक उद्देश्यों के लिए है। यह किसी भी चिकित्सीय सलाह, निदान या उपचार का विकल्प नहीं है। अपनी स्वास्थ्य स्थिति के बारे में हमेशा किसी योग्य चिकित्सक या डॉक्टर से परामर्श लें।"
              : "RxAnvaya is for educational and informational purposes only. It is not a substitute for professional medical advice, diagnosis, or treatment. Always consult a qualified healthcare provider regarding any medical condition or symptoms."}
          </p>
          <p className="mt-2 text-[11px] font-medium text-slate-400">
            RxAnvaya prototype · Smart India Hackathon 2026 · All patient data shown is fictional.
          </p>
        </div>
      </section>
    </div>
  );
}

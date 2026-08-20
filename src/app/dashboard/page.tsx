"use client";

// Screen 5 — main AI health report. The centerpiece of the demo.

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
  ArrowRight,
  BadgeInfo,
  BookOpen,
  BrainCircuit,
  CalendarDays,
  ChevronRight,
  FilePlus2,
  Mic,
  PhoneCall,
  Siren,
  Sparkles,
  Stethoscope,
  X,
} from "lucide-react";
import { AppShell } from "@/components/shell";
import {
  ListenBtn,
  SafetyNote,
  SectionTitle,
  StatusPill,
  TestIcon,
  statusClasses,
} from "@/components/core";
import { useI18n, pick } from "@/lib/i18n";
import {
  CRITICAL_DEMO,
  LATEST,
  PATIENT,
  PATTERNS,
  STORY,
  TESTS,
  fmtValue,
  type ReportEntry,
  type Status,
} from "@/lib/data";

const MODES = [
  { id: "standard", key: "settings.standard" },
  { id: "simple", key: "mode.simple" },
  { id: "very", key: "mode.very" },
] as const;

export default function DashboardPage() {
  const { t, s, set } = useI18n();
  const router = useRouter();
  const hi = s.lang === "hi";
  const [criticalHidden, setCriticalHidden] = useState(false);

  const counts = { normal: 8, borderline: 2, out: 4 };
  const priorities = ["hemoglobin", "hba1c", "ldl"];
  const borderline = ["glucose", "triglycerides"];
  const lipid = PATTERNS[0];

  const summarySpeech = hi
    ? "आपकी रिपोर्ट में कुछ परिणाम ऐसे हैं जिन पर ध्यान देने की आवश्यकता है। आठ परिणाम सामान्य हैं, दो पर ध्यान देना है, और चार सामान्य सीमा से बाहर हैं। कृपया अपने डॉक्टर से चर्चा करें।"
    : "Some results need your attention. Eight results are normal, two need attention, and four are outside the usual range. Please discuss them with your doctor.";

  return (
    <AppShell>
      {/* --------------------------------- Header --------------------------------- */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-brand-950 md:text-4xl">
            {t("dash.title")}
          </h1>
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm font-bold text-slate-500">
            <span className="flex items-center gap-1.5">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-700 text-[10px] font-extrabold text-white">
                RS
              </span>
              {pick(PATIENT.name, s.lang)} · {PATIENT.age}
            </span>
            <span className="flex items-center gap-1.5">
              <CalendarDays className="h-4 w-4" />
              {pick(LATEST.date, s.lang)}
            </span>
            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wide text-slate-400">
              {pick(PATIENT.fictionalNote, s.lang)}
            </span>
          </div>
        </div>

        {/* reading mode switch */}
        <div className="no-scrollbar flex items-center gap-1 overflow-x-auto rounded-full border border-slate-200 bg-white p-1">
          {MODES.map((m) => (
            <button
              key={m.id}
              onClick={() => set({ mode: m.id })}
              aria-pressed={s.mode === m.id}
              className={`min-h-10 whitespace-nowrap rounded-full px-4 text-sm font-extrabold transition ${
                s.mode === m.id
                  ? "bg-brand-700 text-white shadow"
                  : "text-slate-500 hover:text-brand-700"
              }`}
            >
              {t(m.key)}
            </button>
          ))}
        </div>
      </div>

      {/* ------------------------------ Summary hero ------------------------------ */}
      <motion.section
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        className="card-lift mt-6 overflow-hidden rounded-[2rem] border border-amber-200 bg-gradient-to-br from-amber-50 via-white to-white"
      >
        <div className="p-6 md:p-8">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="max-w-xl">
              <span className="inline-flex items-center gap-2 rounded-full bg-amber-100 px-3 py-1.5 text-xs font-extrabold text-amber-800">
                <Sparkles className="h-4 w-4" />
                AI {hi ? "सारांश" : "summary"}
              </span>
              <h2 className="mt-3 text-balance text-2xl font-extrabold leading-tight text-brand-950 md:text-3xl">
                {t("dash.someAttention")}
              </h2>
              <p className="mt-2 text-sm font-semibold leading-relaxed text-slate-500 md:text-[15px]">
                {hi
                  ? "ज़्यादातर परिणाम ठीक हैं। कुछ परिणाम सामान्य सीमा से बाहर हैं — नीचे सबसे ज़रूरी तीन देखें।"
                  : "Most results are fine. A few are outside the usual range — see the three most important below."}
              </p>
            </div>
            <ListenBtn text={summarySpeech} />
          </div>

          {/* counts */}
          <div className="mt-6 grid grid-cols-3 gap-3">
            {[
              { n: counts.normal, label: t("dash.normal"), c: "bg-emerald-50 border-emerald-200 text-emerald-700", bar: "bg-emerald-500" },
              { n: counts.borderline, label: t("dash.borderline"), c: "bg-amber-50 border-amber-300 text-amber-700", bar: "bg-amber-500" },
              { n: counts.out, label: t("dash.out"), c: "bg-rose-50 border-rose-200 text-rose-700", bar: "bg-rose-500" },
            ].map((x) => (
              <div
                key={x.label}
                className={`rounded-3xl border p-4 text-center md:p-5 ${x.c}`}
              >
                <p className="tabular text-4xl font-extrabold md:text-5xl">{x.n}</p>
                <div className={`mx-auto mt-2 h-1.5 w-10 rounded-full ${x.bar}`} />
                <p className="mt-2 text-xs font-extrabold leading-tight md:text-sm">
                  {x.label}
                </p>
              </div>
            ))}
          </div>
        </div>
      </motion.section>

      {/* ---------------------------- What matters most ---------------------------- */}
      <section className="mt-10">
        <SectionTitle icon={Sparkles} title={t("dash.matters")} />
        <div className="grid gap-4 md:grid-cols-3">
          {priorities.map((id, i) => {
            const e = LATEST.entries.find((x) => x.test === id) as ReportEntry;
            return (
              <PriorityCard key={id} entry={e} index={i} hi={hi} />
            );
          })}
        </div>
      </section>

      {/* ------------------------------ Pattern teaser ----------------------------- */}
      <motion.section {...{}} className="mt-10">
        <Link
          href="/insights"
          className="card-shadow group flex flex-col gap-4 rounded-[2rem] border-2 border-violet-200 bg-gradient-to-br from-violet-50 via-white to-white p-6 transition hover:border-violet-400 md:flex-row md:items-center"
        >
          <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-violet-600 text-white shadow-lg shadow-violet-600/25">
            <BrainCircuit className="h-7 w-7" />
          </span>
          <div className="flex-1">
            <p className="text-xs font-extrabold uppercase tracking-widest text-violet-600">
              {t("insights.found")}
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {lipid.nodes.map((n, i) => (
                <span key={n.test} className="flex items-center gap-2">
                  <span className="inline-flex items-center gap-1.5 rounded-xl bg-white px-3 py-1.5 text-sm font-extrabold text-slate-700 shadow-sm ring-1 ring-slate-100">
                    <TestIcon testId={n.test} size={22} />
                    {TESTS[n.test].name.en}
                    <span className={n.arrow === "up" ? "text-rose-600" : "text-rose-600"}>
                      {n.arrow === "up" ? "↑" : n.arrow === "down" ? "↓" : "→"}
                    </span>
                  </span>
                  {i < lipid.nodes.length - 1 && (
                    <span className="text-lg font-black text-violet-400">+</span>
                  )}
                </span>
              ))}
            </div>
            <p className="mt-2 text-sm font-semibold text-slate-500">
              {pick(lipid.expl, s.lang)}
            </p>
          </div>
          <ChevronRight className="h-6 w-6 self-start text-violet-400 transition group-hover:translate-x-1 md:self-center" />
        </Link>
      </motion.section>

      {/* ------------------------------- All results ------------------------------- */}
      <section className="mt-10">
        <SectionTitle
          icon={BookOpen}
          title={t("dash.allResults")}
          sub={`${LATEST.testsCount} ${t("reports.tests")} · ${pick(LATEST.date, s.lang)}`}
        />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {LATEST.entries.map((e) => (
            <ResultCard key={e.test} entry={e} />
          ))}
        </div>
      </section>

      {/* --------------------------- Borderline section --------------------------- */}
      <section className="mt-10">
        <SectionTitle icon={BadgeInfo} title={t("dash.closeToLimit")} sub={t("dash.closeNote")} />
        <div className="grid gap-4 md:grid-cols-2">
          {borderline.map((id) => {
            const e = LATEST.entries.find((x) => x.test === id) as ReportEntry;
            const def = TESTS[id];
            return (
              <div
                key={id}
                className="card-shadow flex items-center gap-4 rounded-3xl border-2 border-amber-300 bg-gradient-to-br from-amber-50 to-white p-5"
              >
                <TestIcon testId={id} size={54} />
                <div className="flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-lg font-extrabold text-slate-800">
                      {pick(def.name, s.lang)}
                    </p>
                    <StatusPill status="borderline" size="sm" />
                  </div>
                  <p className="mt-1 text-sm font-semibold text-slate-500">
                    {hi
                      ? "यह परिणाम पसंदीदा सीमा से ऊपर है, पर बहुत अधिक नहीं।"
                      : "This result is above the preferred range but not extremely high."}
                  </p>
                </div>
                <div className="text-right">
                  <p className="tabular text-3xl font-extrabold text-amber-700">
                    {fmtValue(e.value)}
                  </p>
                  <p className="text-[11px] font-bold text-slate-400">{def.unit}</p>
                </div>
              </div>
            );
          })}
        </div>
        <p className="mt-3 flex items-start gap-2 text-sm font-semibold text-slate-500">
          <Stethoscope className="mt-0.5 h-4 w-4 shrink-0 text-brand-500" />
          {t("dash.closeNote")}
        </p>
      </section>

      {/* --------------------------- Critical safety demo -------------------------- */}
      {!criticalHidden && (
        <motion.section
          initial={{ opacity: 0, y: 10 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="mt-10"
        >
          <div className="overflow-hidden rounded-[2rem] border-2 border-red-500 bg-red-600 text-white shadow-xl shadow-red-600/25">
            <div className="flex items-center justify-between gap-2 border-b border-white/20 px-5 py-2.5">
              <p className="flex items-center gap-2 text-[11px] font-extrabold uppercase tracking-widest text-white/90">
                <Siren className="h-4 w-4" />
                {t("dash.criticalDemo")}
              </p>
              <button
                onClick={() => setCriticalHidden(true)}
                aria-label="Close"
                className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-white/15 text-white transition hover:bg-white/25"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="p-5 md:p-7">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <p className="text-xl font-extrabold md:text-2xl">
                    {hi ? "महत्वपूर्ण परिणाम" : "Important result"}
                  </p>
                  <p className="tabular mt-1 text-4xl font-extrabold">
                    {CRITICAL_DEMO.test}: {CRITICAL_DEMO.value}
                  </p>
                  <p className="mt-1 text-sm font-bold text-white/70">
                    {hi ? "सामान्य सीमा" : "Usual range"}: {CRITICAL_DEMO.ref}
                  </p>
                </div>
                <a
                  href="tel:108"
                  className="inline-flex min-h-14 items-center gap-2.5 rounded-2xl bg-white px-6 text-base font-extrabold text-red-700 shadow-lg transition hover:-translate-y-0.5 active:scale-95"
                >
                  <PhoneCall className="h-5 w-5" />
                  {hi ? "स्वास्थ्य विशेषज्ञ से संपर्क करें" : "Contact a healthcare professional"}
                </a>
              </div>
              <p className="mt-4 max-w-2xl text-sm font-semibold leading-relaxed text-white/90">
                {pick(CRITICAL_DEMO.line, s.lang)} {t("disclaimer.serious")}{" "}
                {hi ? "यह निदान नहीं है।" : "This is not a diagnosis."}
              </p>
            </div>
          </div>
        </motion.section>
      )}

      {/* -------------------------------- AI story -------------------------------- */}
      <section className="mt-10">
        <SectionTitle icon={Sparkles} title={t("dash.story")} sub={t("dash.storyTitle")} />
        <div className="card-shadow rounded-[2rem] border border-slate-100 bg-white p-6 md:p-8">
          <ol className="relative space-y-6 border-l-[3px] border-dashed border-brand-200 pl-6">
            {STORY.map((step, i) => {
              const c = statusClasses(step.status);
              return (
                <motion.li
                  key={i}
                  initial={{ opacity: 0, x: -10 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.12 }}
                  className="relative"
                >
                  <span
                    className={`absolute -left-[37px] top-0.5 flex h-6 w-6 items-center justify-center rounded-full border-[3px] border-white text-[9px] font-black text-white ${c.dot}`}
                  >
                    {i + 1}
                  </span>
                  <p className={`text-xs font-extrabold uppercase tracking-widest ${c.text}`}>
                    {pick(step.when, s.lang)}
                  </p>
                  <p className="mt-1 max-w-xl text-[15px] font-bold leading-relaxed text-slate-700">
                    {pick(step.text, s.lang)}
                  </p>
                </motion.li>
              );
            })}
          </ol>
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <ListenBtn
              text={STORY.map((x) => pick(x.text, s.lang)).join(". ")}
            />
            <Link
              href="/trends"
              className="inline-flex min-h-11 items-center gap-2 rounded-full bg-brand-100 px-4 text-sm font-extrabold text-brand-800 transition hover:bg-brand-200 active:scale-95"
            >
              {hi ? "पूरा रुझान देखें" : "See full trend"}
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </section>

      {/* ------------------------------ Safety + footer ------------------------------ */}
      <div className="mt-10">
        <SafetyNote />
      </div>

      <section className="mt-10 rounded-[2rem] bg-brand-900 p-8 text-center text-white md:p-12">
        <Mic className="mx-auto h-9 w-9 text-mint-300" />
        <h2 className="mt-3 text-balance text-3xl font-extrabold md:text-4xl">
          {t("footer.line1")}
        </h2>
        <p className="mt-1 text-lg font-bold text-mint-300 md:text-xl">
          {t("footer.line2")}
        </p>
        <p className="mx-auto mt-3 max-w-md text-sm font-medium text-white/60">
          {t("footer.sub")}
        </p>
        <div className="mt-7 flex flex-wrap justify-center gap-3">
          <button
            onClick={() => router.push("/upload")}
            className="inline-flex min-h-14 items-center gap-2 rounded-2xl bg-white px-6 text-base font-extrabold text-brand-800 shadow-lg transition hover:-translate-y-0.5 active:scale-95"
          >
            <FilePlus2 className="h-5 w-5" />
            {t("footer.cta1")}
          </button>
          <button
            onClick={() => router.push("/doctor")}
            className="inline-flex min-h-14 items-center gap-2 rounded-2xl border-2 border-white/40 px-6 text-base font-extrabold text-white transition hover:bg-white/10 active:scale-95"
          >
            <Stethoscope className="h-5 w-5" />
            {t("footer.cta2")}
          </button>
        </div>
      </section>
    </AppShell>
  );
}

/* ------------------------------- Priority card ------------------------------- */

function PriorityCard({ entry, index, hi }: { entry: ReportEntry; index: number; hi: boolean }) {
  const { t } = useI18n();
  const def = TESTS[entry.test];
  const line = entry.test === "ldl"
    ? { en: "Your LDL cholesterol is above the usual range.", hi: "आपका LDL कोलेस्ट्रॉल सामान्य सीमा से ऊपर है।" }
    : entry.test === "hba1c"
      ? { en: "Your average blood sugar level is higher than the usual range.", hi: "आपकी औसत ब्लड शुगर सामान्य सीमा से अधिक है।" }
      : { en: "Your hemoglobin is lower than the usual range.", hi: "आपका हीमोग्लोबिन सामान्य सीमा से कम है।" };

  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ delay: index * 0.08 }}
      className="card-shadow flex flex-col rounded-3xl border-2 border-rose-200 bg-white p-5"
    >
      <div className="flex items-start justify-between gap-3">
        <TestIcon testId={entry.test} size={50} />
        <StatusPill status={entry.status} size="sm" />
      </div>
      <p className="mt-3 text-lg font-extrabold text-slate-800">
        {pick(def.name, hi ? "hi" : "en")}
        {entry.status === "low" && <span className="text-rose-600"> — {t("status.low")}</span>}
        {entry.status === "high" && <span className="text-rose-600"> — {t("status.high")}</span>}
      </p>
      <p className="tabular mt-1 text-3xl font-extrabold text-brand-900">
        {fmtValue(entry.value)}
        <span className="ml-1 text-sm font-bold text-slate-400">{def.unit}</span>
      </p>
      <p className="mt-2 text-sm font-semibold leading-relaxed text-slate-500">
        {pick(line, hi ? "hi" : "en")}
      </p>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <ListenBtn compact text={`${def.name.en}. ${fmtValue(entry.value)} ${def.unit}. ${line.en}`} />
        <Link
          href={`/test/${entry.test}`}
          className="inline-flex min-h-10 items-center gap-1.5 rounded-full bg-brand-700 px-4 text-sm font-extrabold text-white transition hover:bg-brand-600 active:scale-95"
        >
          {t("common.viewDetails")}
          <ChevronRight className="h-4 w-4" />
        </Link>
      </div>
      <p className="mt-3 border-t border-dashed border-slate-200 pt-3 text-xs font-bold text-slate-400">
        {t("common.whyMatter")} →
      </p>
    </motion.div>
  );
}

/* -------------------------------- Result card -------------------------------- */

function ResultCard({ entry }: { entry: ReportEntry }) {
  const { t, s } = useI18n();
  const def = TESTS[entry.test];
  const very = s.mode === "very";
  const simple = s.mode === "simple";
  const hi = s.lang === "hi";
  const c = statusClasses(entry.status);
  const name = s.mode === "standard" ? pick(def.name, s.lang) : pick(def.simple, s.lang);

  return (
    <Link
      href={`/test/${entry.test}`}
      className={`card-shadow group rounded-3xl border bg-white p-4 transition hover:-translate-y-0.5 hover:border-brand-300 ${c.border}`}
    >
      <div className="flex items-center gap-3.5">
        <TestIcon testId={entry.test} size={very ? 58 : 46} />
        <div className="min-w-0 flex-1">
          <p className={`truncate font-extrabold text-slate-800 ${very ? "text-xl" : "text-[15px]"}`}>
            {name}
          </p>
          {!very && (
            <p className="text-[11px] font-bold text-slate-400">{def.ref.text}</p>
          )}
        </div>
        <ChevronRight className="h-5 w-5 shrink-0 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-brand-600" />
      </div>
      <div className="mt-3 flex items-end justify-between gap-2">
        <p className={`tabular font-extrabold text-brand-900 ${very ? "text-4xl" : "text-2xl"}`}>
          {fmtValue(entry.value)}
          <span className="ml-1 text-xs font-bold text-slate-400">{def.unit}</span>
        </p>
        <StatusPill status={entry.status} size="sm" />
      </div>
      {very && (
        <p className={`mt-2 text-base font-bold leading-snug ${c.text}`}>
          {entry.status === "normal"
            ? t("status.within")
            : entry.status === "low"
              ? t("status.low")
              : entry.status === "high"
                ? t("status.high")
                : t("status.borderline")}
        </p>
      )}
      {simple && (
        <p className="mt-2 text-sm font-semibold text-slate-500">
          {pick({ en: def.what.vs_en, hi: def.what.vs_hi }, s.lang)}
        </p>
      )}
    </Link>
  );
}

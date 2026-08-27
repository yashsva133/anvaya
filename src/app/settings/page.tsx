"use client";

// Screen — Settings & Accessibility + Collapsible Trusted Medical Sources Button.
// Every setting applies app-wide instantly, and evidence library opens on demand.

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import Link from "next/link";
import {
  Accessibility,
  ArrowUpRight,
  BookMarked,
  BookOpenCheck,
  Check,
  ChevronDown,
  ChevronUp,
  Contrast,
  Database,
  Gauge,
  Languages,
  LetterText,
  MessageCircleQuestion,
  Quote,
  Settings2,
  ShieldCheck,
  Type,
  Volume2,
} from "lucide-react";
import { AppShell } from "@/components/shell";
import { SectionTitle, StatusPill, TestIcon, useToast } from "@/components/core";
import { useI18n, pick, type LangCode, type ReadingMode } from "@/lib/i18n";
import { SOURCES, TESTS } from "@/lib/data";

export default function SettingsPage() {
  const { s, set, t } = useI18n();
  const toast = useToast();
  const notify = () => toast(t("settings.savedToast"));
  const hi = s.lang === "hi";

  const [sourcesOpen, setSourcesOpen] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined" && window.location.hash === "#sources") {
      setSourcesOpen(true);
    }
  }, []);

  const hb = TESTS.hemoglobin;

  return (
    <AppShell>
      {/* ------------------------------ Settings & Accessibility ----------------------------- */}
      <section>
        <SectionTitle
          icon={Settings2}
          title={t("settings.title")}
          sub={
            hi
              ? "बदलाव पूरी ऐप में तुरंत लागू होते हैं।"
              : "Changes apply across the whole app instantly."
          }
        />

        <div className="grid gap-5 lg:grid-cols-2">
          {/* language */}
          <SettingCard icon={Languages} title={t("settings.language")}>
            <div className="grid grid-cols-3 gap-2">
              {(
                [
                  { code: "en", label: "English" },
                  { code: "hi", label: "हिन्दी" },
                  { code: "bn", label: "বাংলা" },
                ] as { code: LangCode; label: string }[]
              ).map((l) => (
                <button
                  key={l.code}
                  onClick={() => {
                    set({ lang: l.code });
                    notify();
                  }}
                  aria-pressed={s.lang === l.code}
                  className={`min-h-[52px] rounded-2xl border-2 text-base font-extrabold transition active:scale-95 ${
                    s.lang === l.code
                      ? "border-brand-700 bg-brand-700 text-white"
                      : "border-slate-200 bg-white text-slate-600 hover:border-brand-300"
                  }`}
                >
                  {l.label}
                </button>
              ))}
            </div>
            <p className="mt-2 text-xs font-bold text-slate-400">
              తెలుగు · தமிழ் · मराठी — {t("welcome.moreLang")}
            </p>
          </SettingCard>

          {/* reading mode */}
          <SettingCard icon={LetterText} title={t("settings.reading")}>
            <div className="grid grid-cols-2 gap-2">
              {(
                [
                  ["simple", t("mode.simple")],
                  ["advanced", t("mode.advanced")],
                ] as [ReadingMode, string][]
              ).map(([m, label]) => (
                <button
                  key={m}
                  onClick={() => {
                    set({ mode: m });
                    notify();
                  }}
                  aria-pressed={s.mode === m}
                  className={`min-h-[52px] rounded-2xl border-2 text-sm font-extrabold transition active:scale-95 ${
                    s.mode === m
                      ? "border-mint-600 bg-mint-600 text-white"
                      : "border-slate-200 bg-white text-slate-600 hover:border-mint-400"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            <p className="mt-2 text-xs font-bold text-slate-400">
              {hi
                ? "सरल मोड: आसान भाषा, बड़े दृश्य। विस्तृत मोड: डॉक्टरी विवरण और संदर्भ सीमा।"
                : "Simple Mode: everyday language, bigger visuals. Advanced Mode: detailed medical terms and ranges."}
            </p>
          </SettingCard>

          {/* font size */}
          <SettingCard icon={Type} title={t("settings.fontSize")}>
            <div className="grid grid-cols-3 gap-2">
              {(
                [
                  [0, t("settings.fontNormal"), "text-sm"],
                  [1, t("settings.fontLarge"), "text-base"],
                  [2, t("settings.fontXL"), "text-lg"],
                ] as [0 | 1 | 2, string, string][]
              ).map(([f, label, cls]) => (
                <button
                  key={f}
                  onClick={() => {
                    set({ font: f });
                    notify();
                  }}
                  aria-pressed={s.font === f}
                  className={`min-h-[52px] rounded-2xl border-2 font-extrabold transition active:scale-95 ${
                    s.font === f
                      ? "border-brand-700 bg-brand-700 text-white"
                      : "border-slate-200 bg-white text-slate-600 hover:border-brand-300"
                  } ${cls}`}
                >
                  {label}
                </button>
              ))}
            </div>
          </SettingCard>

          {/* preview */}
          <div className="card-shadow rounded-[2rem] border border-slate-100 bg-white p-5 sm:p-6">
            <p className="flex items-center gap-2 text-xs font-extrabold uppercase tracking-widest text-brand-600">
              <Accessibility className="h-4 w-4" />
              {t("settings.preview")}
            </p>
            <motion.div
              key={`${s.mode}-${s.font}`}
              initial={{ opacity: 0, scale: 0.97 }}
              animate={{ opacity: 1, scale: 1 }}
              className="mt-3 rounded-3xl border-2 border-rose-200 bg-rose-50/50 p-4 sm:p-5"
            >
              <div className="flex items-center gap-3">
                <TestIcon testId="hemoglobin" size={s.mode === "simple" ? 56 : 44} />
                <div className="min-w-0 flex-1">
                  <p
                    className={`truncate font-extrabold text-slate-800 ${
                      s.mode === "simple" ? "text-lg" : "text-base"
                    }`}
                  >
                    {s.mode === "advanced" ? pick(hb.name, s.lang) : pick(hb.simple, s.lang)}
                  </p>
                  <p
                    className={`tabular font-extrabold text-brand-900 ${
                      s.mode === "simple" ? "text-2xl sm:text-3xl" : "text-xl sm:text-2xl"
                    }`}
                  >
                    10.5 g/dL
                  </p>
                </div>
              </div>
              <div className="mt-3">
                <StatusPill status="low" size={s.mode === "simple" ? "md" : "sm"} />
              </div>
              <p className="mt-2 text-sm font-semibold text-slate-600">
                {pick({ en: s.mode === "advanced" ? hb.what.en : hb.what.vs_en, hi: s.mode === "advanced" ? hb.what.hi : hb.what.vs_hi }, s.lang)}
              </p>
            </motion.div>
          </div>

          {/* toggles */}
          <SettingCard
            icon={Volume2}
            title={t("settings.voice")}
            desc={t("settings.voiceDesc")}
          >
            <Toggle
              value={s.voice}
              onChange={(v) => {
                set({ voice: v });
                notify();
              }}
            />
          </SettingCard>

          <SettingCard
            icon={Contrast}
            title={t("settings.contrast")}
            desc={t("settings.contrastDesc")}
          >
            <Toggle
              value={s.contrast}
              onChange={(v) => {
                set({ contrast: v });
                notify();
              }}
            />
          </SettingCard>

          <SettingCard
            icon={Gauge}
            title={t("settings.motion")}
            desc={t("settings.motionDesc")}
          >
            <Toggle
              value={s.reduceMotion}
              onChange={(v) => {
                set({ reduceMotion: v });
                notify();
              }}
            />
          </SettingCard>

          {/* units */}
          <SettingCard
            icon={Check}
            title={t("settings.units")}
            desc={t("settings.unitsDesc")}
          >
            <span className="inline-flex rounded-full bg-slate-100 px-4 py-2 text-sm font-extrabold text-slate-600">
              Automatic
            </span>
          </SettingCard>
        </div>
      </section>

      {/* --------------------------- Sources Button & Expandable Library (At Last) --------------------------- */}
      <section id="sources" className="mt-10 scroll-mt-20">
        {/* Toggle Button Card */}
        <button
          onClick={() => setSourcesOpen((prev) => !prev)}
          aria-expanded={sourcesOpen}
          className={`card-shadow group flex w-full items-center justify-between gap-4 rounded-[2rem] border p-5 sm:p-6 transition-all active:scale-[0.99] ${
            sourcesOpen
              ? "border-brand-300 bg-brand-50/50 shadow-md ring-2 ring-brand-200"
              : "border-slate-100 bg-white hover:border-brand-200 hover:bg-brand-50/30"
          }`}
        >
          <div className="flex items-center gap-3.5 sm:gap-4 text-left">
            <div className="flex h-12 w-12 sm:h-14 sm:w-14 shrink-0 items-center justify-center rounded-2xl bg-brand-700 text-white shadow-md shadow-brand-900/20">
              <BookMarked className="h-6 w-6 sm:h-7 sm:w-7" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-base sm:text-lg font-extrabold text-brand-950">
                  {t("sources.title")}
                </h2>
                <span className="inline-flex items-center gap-1 rounded-full bg-mint-100 px-2.5 py-0.5 text-[11px] font-extrabold text-mint-800">
                  <BookOpenCheck className="h-3.5 w-3.5" />
                  {SOURCES.length} {t("common.sources")}
                </span>
              </div>
              <p className="mt-1 text-xs sm:text-sm font-semibold text-slate-500 line-clamp-1 sm:line-clamp-none">
                {t("sources.sub")}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <span className="hidden sm:inline-block rounded-full bg-brand-100/80 px-3.5 py-1.5 text-xs font-extrabold text-brand-800 transition group-hover:bg-brand-200">
              {sourcesOpen
                ? hi ? "स्रोत बंद करें" : "Hide Sources"
                : hi ? "स्रोत देखें" : "View Sources"}
            </span>
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-600 transition group-hover:bg-brand-100 group-hover:text-brand-800">
              {sourcesOpen ? (
                <ChevronUp className="h-5 w-5" />
              ) : (
                <ChevronDown className="h-5 w-5" />
              )}
            </div>
          </div>
        </button>

        {/* Expandable Sources Content */}
        <AnimatePresence>
          {sourcesOpen && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.35, ease: "easeInOut" }}
              className="overflow-hidden"
            >
              <div className="pt-6">
                <div className="flex flex-wrap items-center gap-2.5 sm:gap-3">
                  <span className="inline-flex items-center gap-2 rounded-full bg-mint-50 px-3.5 py-2 text-xs sm:text-sm font-extrabold text-mint-800">
                    <BookOpenCheck className="h-4 w-4 shrink-0" />
                    {SOURCES.length} {t("sources.used")}
                  </span>
                  <span className="inline-flex items-center gap-2 rounded-full bg-brand-50 px-3.5 py-2 text-xs sm:text-sm font-extrabold text-brand-800">
                    <ShieldCheck className="h-4 w-4 shrink-0" />
                    {hi ? "उत्तर हमेशा स्रोत से जुड़े" : "Answers always grounded in sources"}
                  </span>
                </div>

                {/* RAG explainer */}
                <div className="card-shadow mt-6 grid gap-3 rounded-[2rem] border border-slate-100 bg-white p-5 sm:p-6 md:grid-cols-3 md:p-7">
                  {[
                    {
                      icon: MessageCircleQuestion,
                      title: hi ? "1. आपका प्रश्न / परिणाम" : "1. Your question / result",
                      desc: hi
                        ? "AI पहले आपकी असली रिपोर्ट के मान और सीमा पढ़ता है।"
                        : "The AI first reads your actual values and reference ranges.",
                    },
                    {
                      icon: Database,
                      title: hi ? "2. विश्वसनीय स्रोत खोज" : "2. Trusted-source retrieval",
                      desc: hi
                        ? "MedlinePlus, CDC, AHA जैसे सत्यापित स्रोतों से प्रमाण ढूँढा जाता है।"
                        : "Evidence is pulled from verified sources like MedlinePlus, CDC, AHA.",
                    },
                    {
                      icon: Languages,
                      title: hi ? "3. उद्धरण सहित उत्तर" : "3. Cited, simple answer",
                      desc: hi
                        ? "उत्तर सरल भाषा में — स्रोत और विश्वास-स्तर स्पष्ट रूप से दिखाया जाता है।"
                        : "The answer arrives in simple language — with citations and a confidence label.",
                    },
                  ].map((x, i) => (
                    <motion.div
                      key={i}
                      initial={{ opacity: 0, y: 10 }}
                      whileInView={{ opacity: 1, y: 0 }}
                      viewport={{ once: true }}
                      transition={{ delay: i * 0.1 }}
                      className="rounded-2xl bg-slate-50 p-4"
                    >
                      <x.icon className="h-6 w-6 text-brand-600" />
                      <p className="mt-2 text-sm font-extrabold text-slate-800">{x.title}</p>
                      <p className="mt-1 text-[13px] font-medium leading-relaxed text-slate-500">
                        {x.desc}
                      </p>
                    </motion.div>
                  ))}
                </div>

                {/* source cards */}
                <div className="mt-6 sm:mt-8 grid gap-4 sm:gap-5 md:grid-cols-2">
                  {SOURCES.map((src, i) => (
                    <motion.article
                      key={src.id}
                      initial={{ opacity: 0, y: 14 }}
                      whileInView={{ opacity: 1, y: 0 }}
                      viewport={{ once: true }}
                      transition={{ delay: i * 0.06 }}
                      className="card-shadow flex flex-col justify-between rounded-[2rem] border border-slate-100 bg-white p-5 sm:p-6"
                    >
                      <div>
                        <div className="flex items-start justify-between gap-3">
                          <span className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-brand-700 text-sm font-black text-white shadow-sm">
                            {src.publisher.slice(0, 2)}
                          </span>
                          <span className="rounded-full bg-slate-100 px-3 py-1 text-[10px] font-extrabold uppercase tracking-widest text-slate-500">
                            {src.country}
                          </span>
                        </div>
                        <h3 className="mt-3 text-base sm:text-lg font-extrabold text-brand-950">
                          {src.title}
                        </h3>
                        <p className="text-xs font-bold text-slate-400">{src.publisher}</p>

                        <div className="mt-4 rounded-2xl border-l-4 border-mint-300 bg-mint-50/60 p-4">
                          <p className="flex items-center gap-1.5 text-[10px] font-extrabold uppercase tracking-widest text-mint-700">
                            <Quote className="h-3.5 w-3.5" />
                            {t("sources.evidenceUsed")}
                          </p>
                          <p className="mt-1.5 text-[13px] font-medium italic leading-relaxed text-slate-600">
                            “{pick(src.excerpt, s.lang)}”
                          </p>
                        </div>

                        <div className="mt-4">
                          <p className="text-[10px] font-extrabold uppercase tracking-widest text-slate-400">
                            {t("sources.covers")}
                          </p>
                          <div className="mt-1.5 flex flex-wrap gap-1.5">
                            {src.usedFor
                              .filter((u) => TESTS[u])
                              .map((u) => (
                                <Link
                                  key={u}
                                  href={`/test/${u}`}
                                  className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-extrabold text-slate-600 transition hover:bg-brand-100 hover:text-brand-800"
                                >
                                  <TestIcon testId={u} size={18} />
                                  {pick(TESTS[u].name, s.lang)}
                                </Link>
                              ))}
                          </div>
                        </div>
                      </div>

                      <a
                        href={src.url}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-5 inline-flex min-h-[44px] w-fit items-center gap-2 rounded-full bg-brand-100 px-4 py-2 text-sm font-extrabold text-brand-800 transition hover:bg-brand-200 active:scale-95"
                      >
                        {t("common.viewSource")}
                        <ArrowUpRight className="h-4 w-4" />
                      </a>
                    </motion.article>
                  ))}
                </div>

                <div className="mt-6 text-center">
                  <button
                    onClick={() => setSourcesOpen(false)}
                    className="inline-flex min-h-11 items-center gap-2 rounded-full border border-slate-200 bg-white px-5 py-2 text-xs font-extrabold text-slate-600 shadow-sm transition hover:bg-slate-50 active:scale-95"
                  >
                    <ChevronUp className="h-4 w-4" />
                    {hi ? "स्रोत छिपाएँ" : "Hide Sources"}
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </section>
    </AppShell>
  );
}

function SettingCard({
  icon: Icon,
  title,
  desc,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  desc?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="card-shadow rounded-[2rem] border border-slate-100 bg-white p-5 sm:p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="flex items-center gap-2 text-base font-extrabold text-brand-950">
            <Icon className="h-5 w-5 text-brand-600 shrink-0" />
            {title}
          </p>
          {desc && <p className="mt-1 text-sm font-semibold text-slate-400">{desc}</p>}
        </div>
      </div>
      <div className="mt-4">{children}</div>
    </div>
  );
}

function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      role="switch"
      aria-checked={value}
      onClick={() => onChange(!value)}
      className={`relative h-10 w-[74px] rounded-full transition active:scale-95 ${
        value ? "bg-mint-600" : "bg-slate-300"
      }`}
    >
      <span
        className={`absolute top-1.5 flex h-7 w-7 items-center justify-center rounded-full bg-white shadow transition-all ${
          value ? "left-[42px]" : "left-1.5"
        }`}
      >
        {value && <Check className="h-4 w-4 text-mint-600" strokeWidth={3} />}
      </span>
    </button>
  );
}

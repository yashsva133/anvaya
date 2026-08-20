"use client";

// Screen — settings & accessibility. Every change applies app-wide instantly.

import { motion } from "framer-motion";
import {
  Accessibility,
  Check,
  Contrast,
  Gauge,
  Languages,
  LetterText,
  Settings2,
  Type,
  Volume2,
} from "lucide-react";
import { AppShell } from "@/components/shell";
import { SectionTitle, StatusPill, TestIcon, useToast } from "@/components/core";
import { useI18n, pick, type LangCode, type ReadingMode } from "@/lib/i18n";
import { TESTS } from "@/lib/data";

export default function SettingsPage() {
  const { s, set, t } = useI18n();
  const toast = useToast();
  const notify = () => toast(t("settings.savedToast"));

  const hb = TESTS.hemoglobin;

  return (
    <AppShell>
      <SectionTitle
        icon={Settings2}
        title={t("settings.title")}
        sub={s.lang === "hi" ? "बदलाव पूरी ऐप में तुरंत लागू होते हैं।" : "Changes apply across the whole app instantly."}
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
                className={`min-h-13 min-h-[52px] rounded-2xl border-2 text-base font-extrabold transition active:scale-95 ${
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
          <div className="grid grid-cols-3 gap-2">
            {(
              [
                ["standard", t("mode.medical")],
                ["simple", t("mode.simple")],
                ["very", t("mode.very")],
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
            {s.lang === "hi"
              ? "सरल मोड: कम शब्द, बड़े अक्षर, रोज़मर्रा की भाषा।"
              : "Simple Mode: fewer words, everyday language, bigger visuals."}
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
        <div className="card-shadow rounded-[2rem] border border-slate-100 bg-white p-6">
          <p className="flex items-center gap-2 text-xs font-extrabold uppercase tracking-widest text-brand-600">
            <Accessibility className="h-4 w-4" />
            {t("settings.preview")}
          </p>
          <motion.div
            key={`${s.mode}-${s.font}`}
            initial={{ opacity: 0, scale: 0.97 }}
            animate={{ opacity: 1, scale: 1 }}
            className="mt-3 rounded-3xl border-2 border-rose-200 bg-rose-50/50 p-5"
          >
            <div className="flex items-center gap-3">
              <TestIcon testId="hemoglobin" size={s.mode === "very" ? 60 : 46} />
              <div>
                <p className={`font-extrabold text-slate-800 ${s.mode === "very" ? "text-xl" : "text-base"}`}>
                  {s.mode === "standard" ? pick(hb.name, s.lang) : pick(hb.simple, s.lang)}
                </p>
                <p className={`tabular font-extrabold text-brand-900 ${s.mode === "very" ? "text-4xl" : "text-2xl"}`}>
                  10.5 g/dL
                </p>
              </div>
            </div>
            <div className="mt-3">
              <StatusPill status="low" size={s.mode === "very" ? "md" : "sm"} />
            </div>
            <p className="mt-2 text-sm font-semibold text-slate-600">
              {pick({ en: hb.what.vs_en, hi: hb.what.vs_hi }, s.lang)}
            </p>
          </motion.div>
        </div>

        {/* toggles */}
        <SettingCard icon={Volume2} title={t("settings.voice")} desc={t("settings.voiceDesc")}>
          <Toggle value={s.voice} onChange={(v) => { set({ voice: v }); notify(); }} />
        </SettingCard>

        <SettingCard icon={Contrast} title={t("settings.contrast")} desc={t("settings.contrastDesc")}>
          <Toggle value={s.contrast} onChange={(v) => { set({ contrast: v }); notify(); }} />
        </SettingCard>

        <SettingCard icon={Gauge} title={t("settings.motion")} desc={t("settings.motionDesc")}>
          <Toggle value={s.reduceMotion} onChange={(v) => { set({ reduceMotion: v }); notify(); }} />
        </SettingCard>

        {/* units */}
        <SettingCard icon={Check} title={t("settings.units")} desc={t("settings.unitsDesc")}>
          <span className="inline-flex rounded-full bg-slate-100 px-4 py-2 text-sm font-extrabold text-slate-600">
            Automatic
          </span>
        </SettingCard>
      </div>
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
    <div className="card-shadow rounded-[2rem] border border-slate-100 bg-white p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="flex items-center gap-2 text-base font-extrabold text-brand-950">
            <Icon className="h-5 w-5 text-brand-600" />
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

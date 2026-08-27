"use client";

// Screen — settings & accessibility. Every change applies app-wide instantly.

import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
  Accessibility,
  Check,
  Contrast,
  Gauge,
  Languages,
  LetterText,
  LogOut,
  Settings2,
  Type,
  Volume2,
} from "lucide-react";
import { AppShell } from "@/components/shell";
import { SectionTitle, StatusPill, TestIcon, useToast } from "@/components/core";
import { useI18n, pick, type LangCode, type ReadingMode } from "@/lib/i18n";
import { PATIENT, TESTS } from "@/lib/data";

export default function SettingsPage() {
  const router = useRouter();
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

      {/* --------------------------- Authenticated Profile Card -------------------------- */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="card-shadow mb-6 overflow-hidden rounded-[2rem] border border-slate-100 bg-white p-6 md:p-7"
      >
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="relative">
              <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-brand-700 text-xl font-extrabold text-white shadow-md">
                RS
              </span>
              <span className="absolute -bottom-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full bg-white shadow ring-1 ring-slate-100">
                <svg className="h-3.5 w-3.5" viewBox="0 0 24 24">
                  <path
                    fill="#4285F4"
                    d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.66-5.17 3.66-9.17Z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.25v3.15C3.26 21.36 7.35 24 12 24Z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.25C.45 8.18 0 9.99 0 12s.45 3.82 1.25 5.42l4.03-3.15Z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.35 0 3.26 2.64 1.25 6.58l4.03 3.15c.95-2.83 3.6-4.98 6.72-4.98Z"
                  />
                </svg>
              </span>
            </div>
            <div>
              <h3 className="text-xl font-extrabold text-brand-950">
                {pick(PATIENT.name, s.lang)}
              </h3>
              <p className="mt-0.5 text-sm font-semibold text-slate-500">
                rahul.singh42@gmail.com · {PATIENT.age} {s.lang === "hi" ? "वर्ष" : "yrs"} · {pick(PATIENT.gender, s.lang)}
              </p>
            </div>
          </div>

          <button
            onClick={() => {
              toast(s.lang === "hi" ? "सफलतापूर्वक लॉगआउट हुआ" : "Logged out successfully", "info");
              setTimeout(() => router.push("/welcome"), 500);
            }}
            className="inline-flex min-h-12 items-center gap-2 rounded-2xl border-2 border-rose-200 bg-rose-50 px-5 text-sm font-extrabold text-rose-700 transition hover:border-rose-300 hover:bg-rose-100 active:scale-95"
          >
            <LogOut className="h-4 w-4" />
            {s.lang === "hi" ? "लॉग आउट" : "Log Out"}
          </button>
        </div>
      </motion.div>

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

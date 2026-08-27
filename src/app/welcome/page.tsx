"use client";

// Screen 1 — Welcome & language selection. Big, icon-first, voice-friendly.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
  ArrowRight,
  BookOpenCheck,
  Check,
  Globe2,
  Lock,
  Mic2,
  Stethoscope,
  Volume2,
} from "lucide-react";
import { FlowShell, FlowMic } from "@/components/shell";
import { useI18n } from "@/lib/i18n";
import { useToast } from "@/components/core";
import type { LangCode } from "@/lib/i18n";

const LANGS: {
  code: LangCode | "more";
  native: string;
  sub: string;
  speech: string;
}[] = [
  { code: "hi", native: "हिन्दी", sub: "Hindi", speech: "अपनी रिपोर्ट समझें। आसान भाषा में।" },
  { code: "en", native: "English", sub: "अंग्रेज़ी", speech: "Understand your health report. In simple language." },
  { code: "bn", native: "বাংলা", sub: "Bengali · बांग्ला", speech: "আপনার রিপোর্ট বুঝুন, সহজ ভাষায়।" },
];

export default function WelcomePage() {
  const router = useRouter();
  const { s, set, t } = useI18n();
  const toast = useToast();
  const [picked, setPicked] = useState<LangCode>(s.lang);
  const [voicePref, setVoicePref] = useState(s.voice);
  const supported = typeof window !== "undefined" && "speechSynthesis" in window;

  const listen = (speech: string, code: LangCode) => {
    if (!supported) {
      toast("Voice is not supported on this device.", "info");
      return;
    }
    const u = new SpeechSynthesisUtterance(speech);
    u.lang = code === "hi" ? "hi-IN" : code === "bn" ? "bn-IN" : "en-IN";
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(u);
  };

  const select = (code: LangCode | "more", speech: string) => {
    if (code === "more") {
      toast(t("welcome.moreLang"), "info");
      return;
    }
    setPicked(code);
    set({ lang: code });
    listen(speech, code);
  };

  const pickedSpeech = LANGS.find((l) => l.code === picked);

  return (
    <FlowShell>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
        <h1 className="text-balance text-center text-3xl font-extrabold tracking-tight text-brand-950 md:text-4xl">
          {t("welcome.title")}
        </h1>
        <p className="mx-auto mt-3 max-w-sm text-center text-base font-medium leading-relaxed text-slate-500">
          {t("welcome.subtitle")}
        </p>

        {/* ------------------------------ Language cards ------------------------------ */}
        <div className="mt-8 grid gap-3">
          {LANGS.map((l, i) => {
            const active = picked === l.code;
            return (
              <motion.button
                key={l.code}
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.06 * i }}
                onClick={() => select(l.code, l.speech)}
                className={`flex min-h-[76px] items-center gap-4 rounded-3xl border-2 bg-white p-4 text-left shadow-sm transition active:scale-[0.98] ${
                  active
                    ? "border-mint-600 shadow-mint-600/20"
                    : "border-slate-200 hover:border-mint-300"
                }`}
              >
                <span
                  className={`flex h-12 w-12 items-center justify-center rounded-2xl text-xl font-extrabold ${
                    active ? "bg-mint-600 text-white" : "bg-brand-50 text-brand-700"
                  }`}
                >
                  {l.native.slice(0, 2)}
                </span>
                <span className="flex-1">
                  <span className="block text-xl font-extrabold text-slate-800">
                    {l.native}
                  </span>
                  <span className="block text-sm font-semibold text-slate-400">
                    {l.sub}
                  </span>
                </span>
                {active && (
                  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-mint-600 text-white">
                    <Check className="h-5 w-5" strokeWidth={3} />
                  </span>
                )}
              </motion.button>
            );
          })}

          <button
            onClick={() => select("more", "")}
            className="flex min-h-[64px] items-center justify-center gap-2 rounded-3xl border border-dashed border-slate-300 bg-white/60 px-4 text-sm font-bold text-slate-500 transition hover:border-mint-400 hover:text-mint-700 active:scale-[0.98]"
          >
            <Globe2 className="h-5 w-5" />
            {t("welcome.moreLang")} — తెలుగు · தமிழ் · मराठी · ગુજરાતી
          </button>
        </div>

        {/* --------------------------- Listen in your language -------------------------- */}
        <button
          onClick={() => pickedSpeech && listen(pickedSpeech.speech, picked)}
          className="mt-4 flex min-h-14 w-full items-center justify-center gap-2.5 rounded-3xl bg-brand-100 px-4 text-base font-extrabold text-brand-800 transition hover:bg-brand-200 active:scale-[0.98]"
        >
          <Volume2 className="h-5 w-5" />
          {t("welcome.listenHint")}
        </button>

        {/* ------------------------------ Voice preference ----------------------------- */}
        <button
          onClick={() => {
            const v = !voicePref;
            setVoicePref(v);
            set({ voice: v });
          }}
          role="switch"
          aria-checked={voicePref}
          className="mt-3 flex min-h-14 w-full items-center gap-3 rounded-3xl border border-slate-200 bg-white px-4 text-left transition active:scale-[0.98]"
        >
          <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-mint-100 text-mint-700">
            <Mic2 className="h-5 w-5" />
          </span>
          <span className="flex-1 text-[15px] font-bold text-slate-700">
            {t("welcome.voicePref")}
          </span>
          <span
            className={`relative h-7 w-12 rounded-full transition ${
              voicePref ? "bg-mint-600" : "bg-slate-300"
            }`}
          >
            <span
              className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-all ${
                voicePref ? "left-6" : "left-1"
              }`}
            />
          </span>
        </button>

        {/* --------------------------------- Continue -------------------------------- */}
        <button
          onClick={() => router.push("/upload")}
          className="mt-6 flex min-h-16 w-full items-center justify-center gap-2 rounded-3xl bg-brand-700 text-lg font-extrabold text-white shadow-lg shadow-brand-900/25 transition hover:bg-brand-600 active:scale-[0.98]"
        >
          {t("common.continue")}
          <ArrowRight className="h-6 w-6" />
        </button>

        {/* --------------------------------- Trust row -------------------------------- */}
        <div className="mt-8 grid grid-cols-1 gap-2.5">
          {[
            { icon: Lock, text: t("welcome.trust1") },
            { icon: BookOpenCheck, text: t("welcome.trust2") },
            { icon: Stethoscope, text: t("welcome.trust3") },
          ].map((x) => (
            <div
              key={x.text}
              className="flex items-center gap-3 rounded-2xl bg-white/70 px-4 py-3"
            >
              <x.icon className="h-5 w-5 shrink-0 text-mint-700" />
              <p className="text-sm font-bold text-slate-600">{x.text}</p>
            </div>
          ))}
        </div>
      </motion.div>
      <FlowMic />
    </FlowShell>
  );
}

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
  const [speaking, setSpeaking] = useState(false);
  const supported = typeof window !== "undefined" && "speechSynthesis" in window;

  const listen = (speech: string, code: LangCode) => {
    if (!supported) {
      toast("Voice is not supported on this device.", "info");
      return;
    }
    if (speaking) {
      window.speechSynthesis.cancel();
      setSpeaking(false);
      return;
    }
    const u = new SpeechSynthesisUtterance(speech);
    u.lang = code === "hi" ? "hi-IN" : code === "bn" ? "bn-IN" : "en-IN";
    u.onend = () => setSpeaking(false);
    u.onerror = () => setSpeaking(false);
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(u);
    setSpeaking(true);
  };

  const select = (code: LangCode | "more") => {
    if (supported) window.speechSynthesis.cancel();
    setSpeaking(false);
    if (code === "more") {
      toast(t("welcome.moreLang"), "info");
      return;
    }
    setPicked(code);
    set({ lang: code });
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
                onClick={() => select(l.code)}
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
            onClick={() => select("more")}
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
          {speaking
            ? s.lang === "hi"
              ? "रोकें"
              : "Stop"
            : t("welcome.listenHint")}
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

        <div className="relative my-4 flex items-center justify-center">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-slate-200" />
          </div>
          <span className="relative bg-[#F6F9F8] px-4 text-xs font-bold uppercase tracking-wider text-slate-400">
            {s.lang === "hi" ? "या Google से लॉगिन करें" : "or sign in with Google"}
          </span>
        </div>

        <button
          onClick={() => {
            toast(
              s.lang === "hi"
                ? "श्री राहुल सिंह के रूप में लॉगिन हुआ (rahul.singh42@gmail.com)"
                : "Signed in as Mr. Rahul Singh (rahul.singh42@gmail.com)"
            );
            setTimeout(() => router.push("/upload"), 600);
          }}
          className="flex min-h-14 w-full items-center justify-center gap-3 rounded-3xl border-2 border-slate-200 bg-white px-4 text-[15px] font-extrabold text-slate-700 shadow-sm transition hover:border-brand-300 hover:bg-slate-50 active:scale-[0.98]"
        >
          <svg className="h-5 w-5 shrink-0" viewBox="0 0 24 24">
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
          <span>
            {s.lang === "hi"
              ? "Google से जारी रखें (श्री राहुल सिंह)"
              : "Continue with Google (Mr. Rahul Singh)"}
          </span>
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

"use client";

// RxAnvaya — first-time patient onboarding & profile setup.
// Collects clinical demographics (age, sex for reference ranges), language, reading mode, and health focus.

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  HeartPulse,
  Languages,
  ShieldCheck,
  Sparkles,
  User,
  Volume2,
} from "lucide-react";
import { Logo } from "@/components/core";
import { AuthGuard } from "@/components/auth-guard";
import { useAuth, type OnboardingPayload } from "@/lib/auth";
import { useI18n, type LangCode } from "@/lib/i18n";

const HEALTH_TOPICS = [
  { id: "cbc", labelEn: "Complete Blood Count (CBC)", labelHi: "रक्त गणना (हीमोग्लोबिन/CBC)", icon: "🩸" },
  { id: "diabetes", labelEn: "Blood Sugar & Diabetes (HbA1c)", labelHi: "ब्लड शुगर और डायबिटीज़ (HbA1c)", icon: "🍬" },
  { id: "lipids", labelEn: "Heart & Lipid Profile (Cholesterol)", labelHi: "हृदय एवं कोलेस्ट्रॉल प्रोफाइल", icon: "🫀" },
  { id: "kidney", labelEn: "Kidney Function (Creatinine/Urea)", labelHi: "किडनी फंक्शन (क्रिएटिनिन)", icon: "🫘" },
  { id: "liver", labelEn: "Liver Function (SGPT/Bilirubin)", labelHi: "लिवर फंक्शन (SGPT)", icon: "🧪" },
  { id: "thyroid", labelEn: "Thyroid Profile (TSH/T3/T4)", labelHi: "थायरॉइड प्रोफाइल (TSH)", icon: "🦋" },
  { id: "general", labelEn: "General Routine Wellness", labelHi: "सामान्य स्वास्थ्य एवं दिनचर्या", icon: "🌱" },
];

const READING_LEVELS = [
  {
    id: "simple",
    titleEn: "Simple Mode",
    titleHi: "सरल मोड",
    descEn: "Everyday conversational words with intuitive metaphors and clear visual guidance.",
    descHi: "दैनिक बातचीत के आसान शब्द, समझने में बेहद सरल।",
    tag: "Recommended for all",
  },
  {
    id: "standard",
    titleEn: "Standard Mode",
    titleHi: "मानक मोड",
    descEn: "Balanced clinical clarity with practical medical context.",
    descHi: "संतुलित चिकित्सकीय स्पष्टता और व्यावहारिक संदर्भ।",
    tag: "Balanced",
  },
  {
    id: "detailed",
    titleEn: "Detailed Mode",
    titleHi: "विस्तृत मोड",
    descEn: "In-depth medical terminology, reference ranges, and clinical metrics.",
    descHi: "विस्तृत मेडिकल शब्दावली और संदर्भ सीमाएँ।",
    tag: "In-depth",
  },
] as const;

function OnboardingContent() {
  const router = useRouter();
  const { s, set } = useI18n();
  const { user, profile, patient, isOnboarded, saveOnboarding } = useAuth();

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [fullName, setFullName] = useState(
    patient?.full_name || profile?.full_name || user?.user_metadata?.full_name || ""
  );
  const [nameLocalScript, setNameLocalScript] = useState(patient?.name_local_script || "");
  const [age, setAge] = useState<number | "">(patient?.age || (patient?.date_of_birth ? new Date().getFullYear() - new Date(patient.date_of_birth).getFullYear() : 42));
  const [gender, setGender] = useState<"male" | "female" | "other" | "unspecified">(
    patient?.sex || "male"
  );
  const [preferredLang, setPreferredLang] = useState<LangCode>(
    patient?.preferred_language || profile?.preferred_language || s.lang || "en"
  );
  const [readingLevel, setReadingLevel] = useState<"simple" | "standard" | "detailed">(
    (patient?.reading_level as "simple" | "standard" | "detailed") || "standard"
  );
  const [voiceEnabled, setVoiceEnabled] = useState<boolean>(
    patient?.voice_enabled !== undefined ? patient.voice_enabled : true
  );
  const [healthFocus, setHealthFocus] = useState<string[]>(
    patient?.health_focus || ["cbc", "diabetes", "lipids"]
  );

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [completed, setCompleted] = useState(false);

  // Sync initial full name if user profile updates
  useEffect(() => {
    if (!fullName && (profile?.full_name || user?.user_metadata?.full_name)) {
      setFullName(profile?.full_name || user?.user_metadata?.full_name || "");
    }
  }, [profile, user, fullName]);

  const toggleTopic = (id: string) => {
    setHealthFocus((prev) =>
      prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id]
    );
  };

  const handleNextStep = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (step === 1) {
      if (!fullName.trim()) {
        setError(s.lang === "hi" ? "कृपया अपना नाम दर्ज करें।" : "Please enter your full name.");
        return;
      }
      if (!age || Number(age) < 1 || Number(age) > 120) {
        setError(s.lang === "hi" ? "कृपया एक मान्य आयु दर्ज करें (1 - 120 वर्ष)।" : "Please enter a valid age between 1 and 120.");
        return;
      }
      setStep(2);
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }

    if (step === 2) {
      // Apply language preference to app context
      set({ lang: preferredLang, voice: voiceEnabled });
      setStep(3);
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }

    if (step === 3) {
      handleFinalSave();
    }
  };

  const handleFinalSave = async () => {
    setError(null);
    setSaving(true);

    const payload: OnboardingPayload = {
      fullName: fullName.trim(),
      age: Number(age) || undefined,
      gender,
      preferredLanguage: preferredLang,
      readingLevel,
      voiceEnabled,
      healthFocus,
    };

    const res = await saveOnboarding(payload);
    setSaving(false);

    if (res.error) {
      setError(res.error);
    } else {
      setCompleted(true);
      // Sync language in i18n
      set({ lang: preferredLang, voice: voiceEnabled });
      setTimeout(() => {
        router.replace("/dashboard");
      }, 1500);
    }
  };

  const testVoiceSample = () => {
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      const sampleText =
        preferredLang === "hi"
          ? "नमस्ते! RxAnvaya में आपका स्वागत है। हम आपकी लैब रिपोर्ट को आसान भाषा में समझाएँगे।"
          : preferredLang === "bn"
            ? "নমস্কার! RxAnvaya-তে আপনাকে স্বাগতম।"
            : "Hello! Welcome to RxAnvaya. We help you understand your medical reports in simple terms.";

      const u = new SpeechSynthesisUtterance(sampleText);
      u.lang = preferredLang === "hi" ? "hi-IN" : preferredLang === "bn" ? "bn-IN" : "en-IN";
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(u);
    }
  };

  return (
    <div className="flex min-h-dvh flex-col bg-[#F6F9F8]">
      {/* Header */}
      <header className="mx-auto flex h-16 w-full max-w-4xl items-center justify-between px-4 md:h-20 md:px-6">
        <Logo />
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-mint-100 px-3 py-1 text-xs font-extrabold text-mint-800">
            {s.lang === "hi" ? `चरण ${step} / 3` : `Step ${step} of 3`}
          </span>
          {isOnboarded && (
            <button
              type="button"
              onClick={() => router.push("/dashboard")}
              className="rounded-full border border-slate-200 bg-white px-3.5 py-1 text-xs font-bold text-slate-600 hover:border-brand-300"
            >
              {s.lang === "hi" ? "डैशबोर्ड पर जाएं" : "Skip to Dashboard"}
            </button>
          )}
        </div>
      </header>

      {/* Main Container */}
      <main className="flex flex-1 items-center justify-center px-4 py-6 md:py-10">
        <div className="w-full max-w-2xl">
          {/* Progress bar */}
          <div className="mb-6 overflow-hidden rounded-full bg-slate-200">
            <motion.div
              initial={false}
              animate={{ width: step === 1 ? "33.3%" : step === 2 ? "66.6%" : "100%" }}
              transition={{ duration: 0.35, ease: "easeOut" }}
              className="h-2 rounded-full bg-gradient-to-r from-mint-500 to-brand-600"
            />
          </div>

          {/* Onboarding Card */}
          <div className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-xl shadow-brand-950/5 md:p-10">
            {completed ? (
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="py-12 text-center"
              >
                <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-mint-100 text-mint-600">
                  <CheckCircle2 className="h-10 w-10" />
                </div>
                <h2 className="mt-6 text-2xl font-extrabold text-brand-950 md:text-3xl">
                  {s.lang === "hi" ? "प्रोफ़ाइल तैयार है!" : "Setup Completed!"}
                </h2>
                <p className="mt-2 text-sm font-medium text-slate-500">
                  {s.lang === "hi"
                    ? "आपकी प्राथमिकताओं को सुरक्षित कर लिया गया है। डैशबोर्ड पर ले जाया जा रहा है..."
                    : "Your preferences have been saved securely. Redirecting to your dashboard..."}
                </p>
                <div className="mt-6 flex justify-center">
                  <div className="h-6 w-6 animate-spin rounded-full border-2 border-brand-700 border-t-transparent" />
                </div>
              </motion.div>
            ) : (
              <form onSubmit={handleNextStep}>
                {error && (
                  <div className="mb-6 rounded-2xl border border-rose-200 bg-rose-50 p-3.5 text-xs font-bold text-rose-700">
                    {error}
                  </div>
                )}

                <AnimatePresence mode="wait">
                  {/* ---------------- STEP 1: DEMOGRAPHICS ---------------- */}
                  {step === 1 && (
                    <motion.div
                      key="step1"
                      initial={{ opacity: 0, x: 12 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -12 }}
                      transition={{ duration: 0.25 }}
                      className="space-y-6"
                    >
                      <div>
                        <span className="inline-flex items-center gap-1.5 rounded-full border border-mint-200 bg-mint-50 px-3 py-1 text-xs font-extrabold text-mint-800">
                          <User className="h-3.5 w-3.5" />
                          {s.lang === "hi" ? "व्यक्तिगत जानकारी" : "Patient Profile"}
                        </span>
                        <h1 className="mt-2 text-2xl font-extrabold tracking-tight text-brand-950 md:text-3xl">
                          {s.lang === "hi" ? "आपका परिचय" : "Welcome! Tell us about yourself"}
                        </h1>
                        <p className="mt-1 text-sm font-medium text-slate-500">
                          {s.lang === "hi"
                            ? "उम्र और लिंग का उपयोग मेडिकल संदर्भ सीमाओं (जैसे हीमोग्लोबिन व क्रिएटिनिन) की सही गणना के लिए होता है।"
                            : "Age and biological sex are used to calculate clinically accurate lab reference ranges."}
                        </p>
                      </div>

                      <div className="space-y-4">
                        <div>
                          <label className="block text-xs font-bold text-slate-700">
                            {s.lang === "hi" ? "पूरा नाम *" : "Full Name *"}
                          </label>
                          <input
                            type="text"
                            required
                            value={fullName}
                            onChange={(e) => setFullName(e.target.value)}
                            placeholder="e.g. Rahul Sharma"
                            className="mt-1.5 w-full rounded-2xl border border-slate-200 bg-slate-50/50 px-4 py-3 text-sm font-bold text-slate-900 outline-none transition focus:border-brand-600 focus:bg-white focus:ring-2 focus:ring-brand-600/10"
                          />
                        </div>

                        <div>
                          <label className="block text-xs font-bold text-slate-700">
                            {s.lang === "hi" ? "स्थानीय भाषा में नाम (वैकल्पिक)" : "Name in native script (optional)"}
                          </label>
                          <input
                            type="text"
                            value={nameLocalScript}
                            onChange={(e) => setNameLocalScript(e.target.value)}
                            placeholder="e.g. राहुल शर्मा"
                            className="mt-1.5 w-full rounded-2xl border border-slate-200 bg-slate-50/50 px-4 py-3 text-sm font-bold text-slate-900 outline-none transition focus:border-brand-600 focus:bg-white focus:ring-2 focus:ring-brand-600/10"
                          />
                        </div>

                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                          <div>
                            <label className="block text-xs font-bold text-slate-700">
                              {s.lang === "hi" ? "आयु (वर्ष) *" : "Age (years) *"}
                            </label>
                            <input
                              type="number"
                              required
                              min={1}
                              max={120}
                              value={age}
                              onChange={(e) => setAge(e.target.value === "" ? "" : Number(e.target.value))}
                              placeholder="e.g. 42"
                              className="mt-1.5 w-full rounded-2xl border border-slate-200 bg-slate-50/50 px-4 py-3 text-sm font-bold text-slate-900 outline-none transition focus:border-brand-600 focus:bg-white focus:ring-2 focus:ring-brand-600/10"
                            />
                          </div>

                          <div>
                            <label className="block text-xs font-bold text-slate-700">
                              {s.lang === "hi" ? "जैविक लिंग *" : "Biological Sex *"}
                            </label>
                            <select
                              value={gender}
                              onChange={(e) => setGender(e.target.value as "male" | "female" | "other" | "unspecified")}
                              className="mt-1.5 w-full rounded-2xl border border-slate-200 bg-slate-50/50 px-4 py-3 text-sm font-bold text-slate-900 outline-none transition focus:border-brand-600 focus:bg-white focus:ring-2 focus:ring-brand-600/10"
                            >
                              <option value="male">{s.lang === "hi" ? "पुरुष (Male)" : "Male"}</option>
                              <option value="female">{s.lang === "hi" ? "महिला (Female)" : "Female"}</option>
                              <option value="other">{s.lang === "hi" ? "अन्य (Other)" : "Other"}</option>
                              <option value="unspecified">{s.lang === "hi" ? "निर्दिष्ट नहीं (Unspecified)" : "Unspecified"}</option>
                            </select>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center justify-end pt-4">
                        <button
                          type="submit"
                          className="inline-flex min-h-12 items-center gap-2 rounded-2xl bg-brand-700 px-6 text-sm font-extrabold text-white shadow-md shadow-brand-900/20 transition hover:bg-brand-600 active:scale-98"
                        >
                          {s.lang === "hi" ? "आगे बढ़ें" : "Continue"}
                          <ArrowRight className="h-4 w-4" />
                        </button>
                      </div>
                    </motion.div>
                  )}

                  {/* ---------------- STEP 2: LANGUAGE & ACCESSIBILITY ---------------- */}
                  {step === 2 && (
                    <motion.div
                      key="step2"
                      initial={{ opacity: 0, x: 12 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -12 }}
                      transition={{ duration: 0.25 }}
                      className="space-y-6"
                    >
                      <div>
                        <span className="inline-flex items-center gap-1.5 rounded-full border border-brand-200 bg-brand-50 px-3 py-1 text-xs font-extrabold text-brand-800">
                          <Languages className="h-3.5 w-3.5 text-brand-600" />
                          {s.lang === "hi" ? "भाषा और प्रस्तुति" : "Language & Accessibility"}
                        </span>
                        <h1 className="mt-2 text-2xl font-extrabold tracking-tight text-brand-950 md:text-3xl">
                          {s.lang === "hi" ? "अपनी पढ़ने की प्राथमिकताएं चुनें" : "How would you like to read reports?"}
                        </h1>
                        <p className="mt-1 text-sm font-medium text-slate-500">
                          {s.lang === "hi"
                            ? "आप इसे बाद में सेटिंग्स में कभी भी बदल सकते हैं।"
                            : "You can change these anytime in Settings."}
                        </p>
                      </div>

                      {/* Language selection */}
                      <div>
                        <label className="block text-xs font-bold text-slate-700">
                          {s.lang === "hi" ? "प्राथमिक भाषा" : "Preferred Language"}
                        </label>
                        <div className="mt-2 grid grid-cols-3 gap-2 sm:gap-3">
                          {[
                            { code: "en", label: "English", sub: "English" },
                            { code: "hi", label: "हिन्दी", sub: "Hindi" },
                            { code: "bn", label: "বাংলা", sub: "Bengali" },
                          ].map((l) => (
                            <button
                              key={l.code}
                              type="button"
                              onClick={() => setPreferredLang(l.code as LangCode)}
                              className={`flex flex-col items-center justify-center rounded-2xl border-2 p-3 text-center transition active:scale-95 ${
                                preferredLang === l.code
                                  ? "border-brand-700 bg-brand-50/70 text-brand-900 shadow-sm"
                                  : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
                              }`}
                            >
                              <span className="text-base font-extrabold">{l.label}</span>
                              <span className="text-[11px] font-bold text-slate-400">{l.sub}</span>
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Reading level */}
                      <div>
                        <label className="block text-xs font-bold text-slate-700">
                          {s.lang === "hi" ? "पठन स्तर (Reading Mode)" : "Reading Mode"}
                        </label>
                        <div className="mt-2 space-y-2.5">
                          {READING_LEVELS.map((rl) => (
                            <button
                              key={rl.id}
                              type="button"
                              onClick={() => setReadingLevel(rl.id)}
                              className={`flex w-full items-start justify-between gap-3 rounded-2xl border-2 p-3.5 text-left transition active:scale-[0.99] ${
                                readingLevel === rl.id
                                  ? "border-brand-700 bg-brand-50/50 shadow-sm"
                                  : "border-slate-200 bg-white hover:border-slate-300"
                              }`}
                            >
                              <div className="flex items-start gap-3">
                                <div
                                  className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 ${
                                    readingLevel === rl.id
                                      ? "border-brand-700 bg-brand-700 text-white"
                                      : "border-slate-300 bg-white"
                                  }`}
                                >
                                  {readingLevel === rl.id && <Check className="h-3 w-3" strokeWidth={3} />}
                                </div>
                                <div>
                                  <div className="flex items-center gap-2">
                                    <p className="text-sm font-extrabold text-brand-950">
                                      {s.lang === "hi" ? rl.titleHi : rl.titleEn}
                                    </p>
                                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600">
                                      {rl.tag}
                                    </span>
                                  </div>
                                  <p className="mt-0.5 text-xs font-medium text-slate-500">
                                    {s.lang === "hi" ? rl.descHi : rl.descEn}
                                  </p>
                                </div>
                              </div>
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Voice narration toggle */}
                      <div className="flex items-center justify-between rounded-2xl border border-slate-200 bg-slate-50/50 p-4">
                        <div className="flex items-center gap-3">
                          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-mint-100 text-mint-700">
                            <Volume2 className="h-5 w-5" />
                          </div>
                          <div>
                            <p className="text-sm font-extrabold text-brand-950">
                              {s.lang === "hi" ? "आवाज़ सहायता (Voice Narration)" : "Voice Narration"}
                            </p>
                            <p className="text-xs font-medium text-slate-500">
                              {s.lang === "hi" ? "हर व्याख्या को अपनी भाषा में सुनें" : "Read aloud report summaries and cards"}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={testVoiceSample}
                            className="rounded-xl border border-slate-200 bg-white px-2.5 py-1 text-xs font-bold text-brand-700 hover:bg-brand-50"
                          >
                            {s.lang === "hi" ? "परीक्षण" : "Test"}
                          </button>
                          <button
                            type="button"
                            role="switch"
                            aria-checked={voiceEnabled}
                            onClick={() => setVoiceEnabled(!voiceEnabled)}
                            className={`relative h-7 w-12 rounded-full transition ${
                              voiceEnabled ? "bg-mint-600" : "bg-slate-300"
                            }`}
                          >
                            <span
                              className={`absolute top-1 flex h-5 w-5 items-center justify-center rounded-full bg-white shadow transition-all ${
                                voiceEnabled ? "left-6" : "left-1"
                              }`}
                            />
                          </button>
                        </div>
                      </div>

                      <div className="flex items-center justify-between pt-4">
                        <button
                          type="button"
                          onClick={() => setStep(1)}
                          className="inline-flex min-h-12 items-center gap-1.5 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-600 transition hover:bg-slate-50"
                        >
                          <ArrowLeft className="h-4 w-4" />
                          {s.lang === "hi" ? "पीछे" : "Back"}
                        </button>
                        <button
                          type="submit"
                          className="inline-flex min-h-12 items-center gap-2 rounded-2xl bg-brand-700 px-6 text-sm font-extrabold text-white shadow-md shadow-brand-900/20 transition hover:bg-brand-600 active:scale-98"
                        >
                          {s.lang === "hi" ? "आगे बढ़ें" : "Continue"}
                          <ArrowRight className="h-4 w-4" />
                        </button>
                      </div>
                    </motion.div>
                  )}

                  {/* ---------------- STEP 3: HEALTH FOCUS & FINISH ---------------- */}
                  {step === 3 && (
                    <motion.div
                      key="step3"
                      initial={{ opacity: 0, x: 12 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -12 }}
                      transition={{ duration: 0.25 }}
                      className="space-y-6"
                    >
                      <div>
                        <span className="inline-flex items-center gap-1.5 rounded-full border border-mint-200 bg-mint-50 px-3 py-1 text-xs font-extrabold text-mint-800">
                          <HeartPulse className="h-3.5 w-3.5" />
                          {s.lang === "hi" ? "स्वास्थ्य क्षेत्र" : "Health Focus"}
                        </span>
                        <h1 className="mt-2 text-2xl font-extrabold tracking-tight text-brand-950 md:text-3xl">
                          {s.lang === "hi" ? "आप किन जाँचों पर ध्यान देना चाहते हैं?" : "What areas are you focusing on?"}
                        </h1>
                        <p className="mt-1 text-sm font-medium text-slate-500">
                          {s.lang === "hi"
                            ? "उन विषयों को चुनें जिनके बारे में आप अधिक रुझान और मार्गदर्शन चाहते हैं।"
                            : "Select the test categories you track most frequently."}
                        </p>
                      </div>

                      {/* Topic Pill Grid */}
                      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                        {HEALTH_TOPICS.map((topic) => {
                          const active = healthFocus.includes(topic.id);
                          return (
                            <button
                              key={topic.id}
                              type="button"
                              onClick={() => toggleTopic(topic.id)}
                              className={`flex items-center gap-3 rounded-2xl border-2 p-3 text-left transition active:scale-[0.98] ${
                                active
                                  ? "border-brand-700 bg-brand-50/70 text-brand-950 shadow-sm"
                                  : "border-slate-200 bg-white text-slate-700 hover:border-slate-300"
                              }`}
                            >
                              <span className="text-xl">{topic.icon}</span>
                              <div className="flex-1 min-w-0">
                                <p className="truncate text-xs font-extrabold">
                                  {s.lang === "hi" ? topic.labelHi : topic.labelEn}
                                </p>
                              </div>
                              <div
                                className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 ${
                                  active
                                    ? "border-brand-700 bg-brand-700 text-white"
                                    : "border-slate-300 bg-white"
                                }`}
                              >
                                {active && <Check className="h-3 w-3" strokeWidth={3} />}
                              </div>
                            </button>
                          );
                        })}
                      </div>

                      {/* Summary card */}
                      <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
                        <p className="text-xs font-extrabold uppercase tracking-wider text-slate-400">
                          {s.lang === "hi" ? "प्रोफ़ाइल सारांश" : "Profile Summary"}
                        </p>
                        <div className="mt-2 flex flex-wrap items-center gap-y-1 gap-x-4 text-xs font-bold text-slate-700">
                          <span>👤 {fullName} ({age} yrs, {gender})</span>
                          <span>🌐 {preferredLang === "hi" ? "हिन्दी" : preferredLang === "bn" ? "বাংলা" : "English"}</span>
                          <span>📖 {readingLevel.toUpperCase()} Mode</span>
                          <span>🔊 Voice {voiceEnabled ? "Enabled" : "Off"}</span>
                        </div>
                      </div>

                      <div className="flex items-center justify-between pt-4">
                        <button
                          type="button"
                          onClick={() => setStep(2)}
                          disabled={saving}
                          className="inline-flex min-h-12 items-center gap-1.5 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-600 transition hover:bg-slate-50 disabled:opacity-50"
                        >
                          <ArrowLeft className="h-4 w-4" />
                          {s.lang === "hi" ? "पीछे" : "Back"}
                        </button>
                        <button
                          type="submit"
                          disabled={saving}
                          className="inline-flex min-h-12 items-center gap-2 rounded-2xl bg-brand-700 px-7 text-sm font-extrabold text-white shadow-md shadow-brand-900/20 transition hover:bg-brand-600 active:scale-98 disabled:opacity-60"
                        >
                          {saving ? (
                            <span className="flex items-center gap-2">
                              <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                              {s.lang === "hi" ? "सहेजा जा रहा है..." : "Saving Profile..."}
                            </span>
                          ) : (
                            <>
                              <Sparkles className="h-4 w-4 text-mint-300" />
                              {s.lang === "hi" ? "सेटअप पूरा करें" : "Complete Setup"}
                            </>
                          )}
                        </button>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </form>
            )}
          </div>

          <div className="mt-6 flex items-center justify-center gap-2 text-center text-xs font-medium text-slate-400">
            <ShieldCheck className="h-4 w-4 text-mint-600" />
            <span>
              {s.lang === "hi"
                ? "आपका डेटा एन्क्रिप्टेड है और कभी भी किसी तीसरे पक्ष से साझा नहीं किया जाता।"
                : "Your health preferences are stored securely with Supabase Row-Level Security."}
            </span>
          </div>
        </div>
      </main>
    </div>
  );
}

export default function OnboardingPage() {
  return (
    <AuthGuard requireOnboarded={false}>
      <OnboardingContent />
    </AuthGuard>
  );
}

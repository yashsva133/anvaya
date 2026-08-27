"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Eye,
  EyeOff,
  HeartPulse,
  Lock,
  Mail,
  ShieldCheck,
  User as UserIcon,
} from "lucide-react";
import { Logo } from "@/components/core";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";

function LoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { s } = useI18n();
  const {
    user,
    isOnboarded,
    signInWithEmail,
    signUpWithEmail,
    signInWithGoogle,
    resetPassword,
    isConfigured,
  } = useAuth();

  const initialMode = searchParams.get("mode") === "signup" ? "signup" : "signin";
  const redirectUrl = searchParams.get("redirect") || "/dashboard";

  const [mode, setMode] = useState<"signin" | "signup" | "forgot">(initialMode);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // If already authenticated, redirect
  useEffect(() => {
    if (user) {
      if (!isOnboarded) {
        router.replace("/onboarding");
      } else {
        router.replace(redirectUrl);
      }
    }
  }, [user, isOnboarded, redirectUrl, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);

    // Validation
    const cleanEmail = email.trim();
    if (!cleanEmail || !cleanEmail.includes("@")) {
      setError(s.lang === "hi" ? "कृपया एक मान्य ईमेल दर्ज करें।" : "Please enter a valid email address.");
      return;
    }

    if (mode === "forgot") {
      setLoading(true);
      const res = await resetPassword(cleanEmail);
      setLoading(false);
      if (res.error) {
        setError(res.error);
      } else {
        setSuccessMsg(
          s.lang === "hi"
            ? "पासवर्ड रीसेट लिंक आपके ईमेल पर भेज दिया गया है।"
            : "Password reset link sent! Check your inbox."
        );
      }
      return;
    }

    if (!password || password.length < 6) {
      setError(
        s.lang === "hi"
          ? "पासवर्ड कम से कम 6 अक्षरों का होना चाहिए।"
          : "Password must be at least 6 characters long."
      );
      return;
    }

    if (mode === "signup") {
      if (!fullName.trim()) {
        setError(s.lang === "hi" ? "कृपया अपना पूरा नाम दर्ज करें।" : "Please enter your full name.");
        return;
      }
      if (password !== confirmPassword) {
        setError(s.lang === "hi" ? "पासवर्ड मेल नहीं खा रहे हैं।" : "Passwords do not match.");
        return;
      }

      setLoading(true);
      const res = await signUpWithEmail(cleanEmail, password, fullName);
      setLoading(false);

      if (res.error) {
        setError(res.error);
      } else if (res.needsEmailConfirmation) {
        setSuccessMsg(
          s.lang === "hi"
            ? "खाता बन गया! कृपया अपने ईमेल पर भेजे गए पुष्टिकरण लिंक पर क्लिक करें।"
            : "Account created! Please check your email to confirm your account."
        );
      } else {
        router.replace("/onboarding");
      }
      return;
    }

    // Sign in
    setLoading(true);
    const res = await signInWithEmail(cleanEmail, password);
    setLoading(false);

    if (res.error) {
      setError(res.error);
    } else {
      router.replace(redirectUrl);
    }
  };

  const handleGoogleSignIn = async () => {
    setError(null);
    setLoading(true);
    const res = await signInWithGoogle();
    if (res.error) {
      setError(res.error);
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-dvh flex-col bg-[#F6F9F8]">
      {/* Header */}
      <header className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-4 md:h-20 md:px-6">
        <Link href="/" aria-label="RxAnvaya Home" className="flex items-center gap-2">
          <Logo />
        </Link>
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3.5 py-1.5 text-xs font-bold text-slate-600 shadow-sm transition hover:border-brand-300 hover:text-brand-800"
        >
          <ArrowLeft className="h-4 w-4" />
          {s.lang === "hi" ? "होम पर वापस" : "Back to Home"}
        </Link>
      </header>

      {/* Main Container */}
      <main className="flex flex-1 items-center justify-center px-4 py-8 md:py-12">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="w-full max-w-md"
        >
          {/* Card */}
          <div className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-xl shadow-brand-950/5 md:p-8">
            {/* Title & Badge */}
            <div className="text-center">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-mint-200 bg-mint-50 px-3 py-1 text-xs font-extrabold text-mint-800">
                <HeartPulse className="h-3.5 w-3.5" />
                {s.lang === "hi" ? "सुरक्षित स्वास्थ्य साथी" : "Your Private Health Companion"}
              </span>

              <h1 className="mt-3 text-2xl font-extrabold tracking-tight text-brand-950 md:text-3xl">
                {mode === "signup"
                  ? s.lang === "hi"
                    ? "नया खाता बनाएं"
                    : "Create your Account"
                  : mode === "forgot"
                    ? s.lang === "hi"
                      ? "पासवर्ड रीसेट करें"
                      : "Reset Password"
                    : s.lang === "hi"
                      ? "स्वागत है!"
                      : "Welcome Back"}
              </h1>

              <p className="mt-1.5 text-sm font-medium text-slate-500">
                {mode === "signup"
                  ? s.lang === "hi"
                    ? "अपनी लैब रिपोर्ट को आसान भाषा में समझने के लिए साइन अप करें"
                    : "Start understanding your medical reports in simple terms"
                  : mode === "forgot"
                    ? s.lang === "hi"
                      ? "अपना पंजीकृत ईमेल दर्ज करें"
                      : "Enter your registered email to receive a recovery link"
                    : s.lang === "hi"
                      ? "अपनी रिपोर्ट और स्वास्थ्य रुझान देखने के लिए लॉगिन करें"
                      : "Access your personalized reports and health trends"}
              </p>
            </div>

            {/* Mode Switcher Tabs */}
            {mode !== "forgot" && (
              <div className="mt-6 flex rounded-2xl bg-slate-100 p-1">
                <button
                  type="button"
                  onClick={() => {
                    setMode("signin");
                    setError(null);
                    setSuccessMsg(null);
                  }}
                  className={`flex-1 rounded-xl py-2 text-sm font-extrabold transition ${
                    mode === "signin"
                      ? "bg-white text-brand-900 shadow-sm"
                      : "text-slate-500 hover:text-slate-800"
                  }`}
                >
                  {s.lang === "hi" ? "लॉग इन" : "Sign In"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMode("signup");
                    setError(null);
                    setSuccessMsg(null);
                  }}
                  className={`flex-1 rounded-xl py-2 text-sm font-extrabold transition ${
                    mode === "signup"
                      ? "bg-white text-brand-900 shadow-sm"
                      : "text-slate-500 hover:text-slate-800"
                  }`}
                >
                  {s.lang === "hi" ? "साइन अप" : "Sign Up"}
                </button>
              </div>
            )}

            {/* Google OAuth Button */}
            {mode !== "forgot" && (
              <div className="mt-6">
                <button
                  type="button"
                  onClick={handleGoogleSignIn}
                  disabled={loading}
                  className="flex min-h-12 w-full items-center justify-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-extrabold text-slate-700 shadow-sm transition hover:bg-slate-50 active:scale-[0.99] disabled:opacity-60"
                >
                  <svg className="h-5 w-5" viewBox="0 0 24 24">
                    <path
                      fill="#4285F4"
                      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                    />
                    <path
                      fill="#34A853"
                      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                    />
                    <path
                      fill="#FBBC05"
                      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                    />
                    <path
                      fill="#EA4335"
                      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                    />
                  </svg>
                  {s.lang === "hi" ? "गूगल के साथ जारी रखें" : "Continue with Google"}
                </button>

                <div className="relative my-5 flex items-center justify-center">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-slate-200" />
                  </div>
                  <span className="relative bg-white px-3 text-xs font-bold text-slate-400">
                    {s.lang === "hi" ? "या ईमेल द्वारा" : "or with email"}
                  </span>
                </div>
              </div>
            )}

            {/* Error & Success Messages */}
            {error && (
              <motion.div
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                className="mb-4 rounded-2xl border border-rose-200 bg-rose-50 p-3 text-xs font-bold text-rose-700"
              >
                {error}
              </motion.div>
            )}

            {successMsg && (
              <motion.div
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                className="mb-4 flex items-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 p-3 text-xs font-bold text-emerald-800"
              >
                <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
                {successMsg}
              </motion.div>
            )}

            {/* Auth Form */}
            <form onSubmit={handleSubmit} className="space-y-4">
              {mode === "signup" && (
                <div>
                  <label className="block text-xs font-bold text-slate-700">
                    {s.lang === "hi" ? "पूरा नाम" : "Full Name"}
                  </label>
                  <div className="relative mt-1">
                    <UserIcon className="pointer-events-none absolute left-3.5 top-3.5 h-4 w-4 text-slate-400" />
                    <input
                      type="text"
                      required
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      placeholder="e.g. Rahul Singh"
                      className="w-full rounded-2xl border border-slate-200 bg-slate-50/50 py-2.5 pl-10 pr-4 text-sm font-bold text-slate-900 outline-none transition focus:border-brand-600 focus:bg-white focus:ring-2 focus:ring-brand-600/10"
                    />
                  </div>
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-slate-700">
                  {s.lang === "hi" ? "ईमेल पता" : "Email Address"}
                </label>
                <div className="relative mt-1">
                  <Mail className="pointer-events-none absolute left-3.5 top-3.5 h-4 w-4 text-slate-400" />
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    className="w-full rounded-2xl border border-slate-200 bg-slate-50/50 py-2.5 pl-10 pr-4 text-sm font-bold text-slate-900 outline-none transition focus:border-brand-600 focus:bg-white focus:ring-2 focus:ring-brand-600/10"
                  />
                </div>
              </div>

              {mode !== "forgot" && (
                <div>
                  <div className="flex items-center justify-between">
                    <label className="block text-xs font-bold text-slate-700">
                      {s.lang === "hi" ? "पासवर्ड" : "Password"}
                    </label>
                    {mode === "signin" && (
                      <button
                        type="button"
                        onClick={() => {
                          setMode("forgot");
                          setError(null);
                          setSuccessMsg(null);
                        }}
                        className="text-xs font-bold text-brand-700 transition hover:underline"
                      >
                        {s.lang === "hi" ? "पासवर्ड भूल गए?" : "Forgot password?"}
                      </button>
                    )}
                  </div>
                  <div className="relative mt-1">
                    <Lock className="pointer-events-none absolute left-3.5 top-3.5 h-4 w-4 text-slate-400" />
                    <input
                      type={showPassword ? "text" : "password"}
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full rounded-2xl border border-slate-200 bg-slate-50/50 py-2.5 pl-10 pr-10 text-sm font-bold text-slate-900 outline-none transition focus:border-brand-600 focus:bg-white focus:ring-2 focus:ring-brand-600/10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-3 text-slate-400 hover:text-slate-600"
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
              )}

              {mode === "signup" && (
                <div>
                  <label className="block text-xs font-bold text-slate-700">
                    {s.lang === "hi" ? "पासवर्ड की पुष्टि करें" : "Confirm Password"}
                  </label>
                  <div className="relative mt-1">
                    <Lock className="pointer-events-none absolute left-3.5 top-3.5 h-4 w-4 text-slate-400" />
                    <input
                      type={showPassword ? "text" : "password"}
                      required
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full rounded-2xl border border-slate-200 bg-slate-50/50 py-2.5 pl-10 pr-4 text-sm font-bold text-slate-900 outline-none transition focus:border-brand-600 focus:bg-white focus:ring-2 focus:ring-brand-600/10"
                    />
                  </div>
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="mt-2 flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-brand-700 px-4 text-sm font-extrabold text-white shadow-md shadow-brand-900/20 transition hover:bg-brand-600 active:scale-[0.98] disabled:opacity-60"
              >
                {loading ? (
                  <span className="flex items-center gap-2">
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                    {s.lang === "hi" ? "कृपया प्रतीक्षा करें..." : "Please wait..."}
                  </span>
                ) : (
                  <>
                    {mode === "signup"
                      ? s.lang === "hi"
                        ? "खाता बनाएं"
                        : "Create Account"
                      : mode === "forgot"
                        ? s.lang === "hi"
                          ? "रीसेट लिंक भेजें"
                          : "Send Reset Link"
                        : s.lang === "hi"
                          ? "लॉग इन करें"
                          : "Sign In"}
                    <ArrowRight className="h-4 w-4" />
                  </>
                )}
              </button>
            </form>

            {/* Back to sign in from forgot password */}
            {mode === "forgot" && (
              <div className="mt-4 text-center">
                <button
                  type="button"
                  onClick={() => {
                    setMode("signin");
                    setError(null);
                    setSuccessMsg(null);
                  }}
                  className="text-xs font-extrabold text-brand-700 hover:underline"
                >
                  {s.lang === "hi" ? "लॉगिन पर वापस जाएं" : "Back to Sign In"}
                </button>
              </div>
            )}

            {/* Privacy note */}
            <div className="mt-6 flex items-center justify-center gap-2 text-center text-xs font-medium text-slate-400">
              <ShieldCheck className="h-4 w-4 text-mint-600" />
              <span>{s.lang === "hi" ? "गोपनीय एवं सुरक्षित" : "Private & encrypted health data"}</span>
            </div>
          </div>

          {!isConfigured && (
            <p className="mt-4 text-center text-[11px] font-medium text-slate-400">
              ⚡ Local preview mode active. Ready for Supabase credentials in <code className="rounded bg-slate-200 px-1 py-0.5 font-mono text-[10px]">.env.local</code>.
            </p>
          )}
        </motion.div>
      </main>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-dvh items-center justify-center bg-[#F6F9F8]">
          <div className="h-8 w-8 animate-spin rounded-full border-3 border-brand-700 border-t-transparent" />
        </div>
      }
    >
      <LoginContent />
    </Suspense>
  );
}

"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import { ArrowRight, Loader2, Lock, Mail, ShieldCheck } from "lucide-react";
import { FlowShell } from "@/components/shell";
import { googleOAuthUrl, sendPasswordReset, signInWithPassword, signUpWithPassword } from "@/lib/supabase-auth";
import { useAuth } from "@/lib/auth-context";

type Mode = "login" | "signup";

function friendlyError(mode: Mode, err: unknown) {
  const msg = err instanceof Error ? err.message.toLowerCase() : "";
  if (msg.includes("not configured")) return "ANVAYA sign-in is not configured yet. Please add the Supabase environment variables.";
  if (msg.includes("password")) return mode === "login" ? "Unable to sign in. Please check your email and password." : "Please choose a stronger password of at least 6 characters.";
  if (msg.includes("already")) return "An account already exists for this email. Please log in instead.";
  return mode === "login" ? "Unable to sign in. Please check your details and try again." : "Something went wrong while creating your account. Please try again.";
}

function LoginInner() {
  const params = useSearchParams();
  const router = useRouter();
  const { status, profile, session, setSession } = useAuth();
  const [mode, setMode] = useState<Mode>(params.get("mode") === "signup" ? "signup" : "login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (status === "authenticated" && session) {
      router.replace(profile?.onboarding_completed ? "/dashboard" : "/onboarding");
    }
  }, [status, profile, session, router]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setError(""); setNotice("");
    if (!/^\S+@\S+\.\S+$/.test(email)) { setError("Please enter a valid email address."); return; }
    if (password.length < 6) { setError("Password must be at least 6 characters."); return; }
    if (mode === "signup" && password !== confirm) { setError("Passwords do not match."); return; }
    setLoading(true);
    try {
      const authSession = mode === "login" ? await signInWithPassword(email, password) : await signUpWithPassword(email, password);
      if (authSession.access_token) await setSession(authSession);
      else setNotice("Please check your email to verify your account before logging in.");
    } catch (err) { setError(friendlyError(mode, err)); }
    finally { setLoading(false); }
  };

  const reset = async () => {
    setError(""); setNotice("");
    if (!/^\S+@\S+\.\S+$/.test(email)) { setError("Enter your email above first, then request a reset link."); return; }
    setLoading(true);
    try { await sendPasswordReset(email); setNotice("Password reset instructions were sent if this email is registered."); }
    catch { setError("We could not send a reset link right now. Please try again."); }
    finally { setLoading(false); }
  };

  return (
    <FlowShell back="/">
      <div className="mx-auto max-w-md pt-6">
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="card-lift rounded-[2rem] border border-slate-100 bg-white p-5 sm:p-7">
          <div className="text-center">
            <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-mint-100 text-mint-700"><ShieldCheck className="h-6 w-6" /></span>
            <h1 className="mt-4 text-2xl font-extrabold text-brand-950">Welcome to ANVAYA</h1>
            <p className="mt-2 text-sm font-semibold text-slate-500">Sign in to keep your health insights private and personalized.</p>
          </div>
          <div className="mt-6 grid grid-cols-2 rounded-full border border-slate-200 bg-slate-50 p-1" role="tablist">
            {(["login", "signup"] as Mode[]).map((m) => <button key={m} onClick={() => setMode(m)} className={`min-h-11 rounded-full text-sm font-extrabold ${mode===m ? "bg-brand-700 text-white shadow" : "text-slate-500"}`}>{m === "login" ? "Log In" : "Sign Up"}</button>)}
          </div>
          <button onClick={() => { window.location.href = googleOAuthUrl(); }} className="mt-5 flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl border-2 border-slate-200 bg-white px-4 text-sm font-extrabold text-brand-900 transition hover:border-brand-300 active:scale-[0.98]">Continue with Google</button>
          <div className="my-5 flex items-center gap-3 text-xs font-bold uppercase tracking-widest text-slate-300"><span className="h-px flex-1 bg-slate-200" />or continue with email<span className="h-px flex-1 bg-slate-200" /></div>
          <form onSubmit={submit} className="space-y-4">
            <label className="block text-sm font-extrabold text-brand-900">Email<input value={email} onChange={(e)=>setEmail(e.target.value)} type="email" autoComplete="email" className="mt-2 min-h-12 w-full rounded-2xl border-2 border-slate-200 px-4 font-semibold outline-none focus:border-brand-500" /></label>
            <label className="block text-sm font-extrabold text-brand-900">Password<input value={password} onChange={(e)=>setPassword(e.target.value)} type="password" autoComplete={mode==="login" ? "current-password" : "new-password"} className="mt-2 min-h-12 w-full rounded-2xl border-2 border-slate-200 px-4 font-semibold outline-none focus:border-brand-500" /></label>
            {mode === "signup" && <label className="block text-sm font-extrabold text-brand-900">Confirm password<input value={confirm} onChange={(e)=>setConfirm(e.target.value)} type="password" autoComplete="new-password" className="mt-2 min-h-12 w-full rounded-2xl border-2 border-slate-200 px-4 font-semibold outline-none focus:border-brand-500" /></label>}
            {error && <p role="alert" className="rounded-2xl bg-rose-50 p-3 text-sm font-bold text-rose-700">{error}</p>}
            {notice && <p className="rounded-2xl bg-mint-50 p-3 text-sm font-bold text-mint-800">{notice}</p>}
            <button disabled={loading} className="flex min-h-13 w-full items-center justify-center gap-2 rounded-2xl bg-brand-700 px-5 font-extrabold text-white shadow-lg shadow-brand-900/20 disabled:opacity-60">{loading ? <Loader2 className="h-5 w-5 animate-spin" /> : <><Mail className="h-5 w-5" />{mode === "login" ? "Log In" : "Create Account"}<ArrowRight className="h-5 w-5" /></>}</button>
          </form>
          {mode === "login" && <button onClick={reset} className="mt-4 text-sm font-extrabold text-brand-700 hover:text-brand-900">Forgot password?</button>}
          <p className="mt-5 flex items-start gap-2 text-xs font-semibold leading-relaxed text-slate-400"><Lock className="mt-0.5 h-4 w-4 shrink-0" />ANVAYA stores profile completion in Supabase so onboarding only appears for first-time users.</p>
        </motion.div>
        <p className="mt-5 text-center text-sm font-bold text-slate-500"><Link href="/dashboard" className="text-brand-700 underline">View existing demo</Link></p>
      </div>
    </FlowShell>
  );
}

export default function LoginPage() {
  return <Suspense fallback={<FlowShell back="/"><div className="pt-16 text-center text-sm font-extrabold text-brand-800">Preparing sign in...</div></FlowShell>}><LoginInner /></Suspense>;
}

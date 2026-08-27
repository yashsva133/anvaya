"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { ArrowRight, Loader2, UserRound } from "lucide-react";
import { FlowShell } from "@/components/shell";
import { useAuth } from "@/lib/auth-context";
import { completeOnboarding, type PatientProfileInput } from "@/lib/supabase-auth";

export default function OnboardingPage() {
  const router = useRouter();
  const { status, session, profile, reloadProfile } = useAuth();
  const [form, setForm] = useState<PatientProfileInput>({ full_name: session?.user.user_metadata?.full_name || session?.user.user_metadata?.name || "", date_of_birth: "", sex: "unspecified", preferred_language: "en" });
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => { if (status === "unauthenticated") router.replace("/login"); }, [status, router]);
  useEffect(() => { if (profile?.onboarding_completed) router.replace("/dashboard"); }, [profile, router]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setError("");
    if (!session) return;
    if (form.full_name.trim().length < 2) { setError("Please enter your full name."); return; }
    if (!form.date_of_birth) { setError("Please enter a valid date of birth."); return; }
    if (new Date(form.date_of_birth) > new Date()) { setError("Date of birth cannot be in the future."); return; }
    setSaving(true);
    try { await completeOnboarding(session.access_token, session.user, { ...form, full_name: form.full_name.trim() }); await reloadProfile(); router.replace("/dashboard"); }
    catch { setError("We could not save your profile right now. Please try again."); }
    finally { setSaving(false); }
  };

  return (
    <FlowShell back="/login">
      <div className="mx-auto max-w-xl pt-4">
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="card-lift overflow-hidden rounded-[2rem] border border-slate-100 bg-white">
          <div className="bg-gradient-to-br from-brand-900 to-mint-700 p-6 text-white sm:p-8">
            <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-white/15"><UserRound className="h-6 w-6" /></span>
            <h1 className="mt-4 text-3xl font-extrabold">Welcome to ANVAYA</h1>
            <p className="mt-2 text-sm font-semibold text-white/80">Let’s personalize explanations with the minimum profile details ANVAYA needs for patient-friendly report context.</p>
            <div className="mt-5 h-2 rounded-full bg-white/20"><span className="block h-2 w-full rounded-full bg-mint-300" /></div>
          </div>
          <form onSubmit={submit} className="space-y-5 p-5 sm:p-7">
            <label className="block text-sm font-extrabold text-brand-900">Full name<input value={form.full_name} onChange={(e)=>setForm({...form, full_name:e.target.value})} className="mt-2 min-h-12 w-full rounded-2xl border-2 border-slate-200 px-4 font-semibold outline-none focus:border-brand-500" /></label>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block text-sm font-extrabold text-brand-900">Date of birth<input type="date" value={form.date_of_birth} onChange={(e)=>setForm({...form, date_of_birth:e.target.value})} className="mt-2 min-h-12 w-full rounded-2xl border-2 border-slate-200 px-4 font-semibold outline-none focus:border-brand-500" /></label>
              <label className="block text-sm font-extrabold text-brand-900">Gender / sex<select value={form.sex} onChange={(e)=>setForm({...form, sex:e.target.value as PatientProfileInput["sex"]})} className="mt-2 min-h-12 w-full rounded-2xl border-2 border-slate-200 px-4 font-semibold outline-none focus:border-brand-500"><option value="unspecified">Prefer not to say</option><option value="female">Female</option><option value="male">Male</option><option value="other">Other</option></select></label>
            </div>
            <label className="block text-sm font-extrabold text-brand-900">Preferred explanation language<select value={form.preferred_language} onChange={(e)=>setForm({...form, preferred_language:e.target.value as PatientProfileInput["preferred_language"]})} className="mt-2 min-h-12 w-full rounded-2xl border-2 border-slate-200 px-4 font-semibold outline-none focus:border-brand-500"><option value="en">English</option><option value="hi">हिन्दी</option><option value="bn">বাংলা</option></select></label>
            {error && <p role="alert" className="rounded-2xl bg-rose-50 p-3 text-sm font-bold text-rose-700">{error}</p>}
            <button disabled={saving || status === "loading"} className="flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl bg-brand-700 px-6 font-extrabold text-white shadow-lg shadow-brand-900/20 disabled:opacity-60">{saving ? <><Loader2 className="h-5 w-5 animate-spin" />Saving your profile...</> : <>Complete setup<ArrowRight className="h-5 w-5" /></>}</button>
            <p className="text-xs font-semibold leading-relaxed text-slate-400">You can continue using the existing ANVAYA dashboard after this one-time setup. Health data remains protected by Supabase row-level security policies.</p>
          </form>
        </motion.div>
      </div>
    </FlowShell>
  );
}

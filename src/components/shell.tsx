"use client";

// Rxanvaya — application shell (sidebar, mobile nav, language switch, mic FAB)
// and the minimal "flow" shell used by onboarding screens.

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  BookOpen,
  BrainCircuit,
  FileText,
  GitCompareArrows,
  Home,
  LogOut,
  LayoutGrid,
  LifeBuoy,
  MessageCircleHeart,
  Mic,
  MoreHorizontal,
  Settings,
  Stethoscope,
  TrendingUp,
  Workflow,
} from "lucide-react";
import { useI18n, pick } from "@/lib/i18n";
import { Logo, Sheet } from "@/components/core";
import { VoiceSheet } from "@/components/voice";
import { PATIENT } from "@/lib/data";
import { useAuth } from "@/lib/auth-context";
import { signOut } from "@/lib/supabase-auth";

/* ------------------------------ LANGUAGE SWITCH ----------------------------- */

export function QuickLang({ dark = false }: { dark?: boolean }) {
  const { s, set } = useI18n();
  const opts: { code: "en" | "hi"; label: string }[] = [
    { code: "en", label: "EN" },
    { code: "hi", label: "हिं" },
  ];
  return (
    <div
      className={`inline-flex items-center rounded-full border p-1 ${
        dark ? "border-white/20 bg-white/10" : "border-slate-200 bg-white"
      }`}
    >
      {opts.map((o) => (
        <button
          key={o.code}
          onClick={() => set({ lang: o.code })}
          aria-pressed={s.lang === o.code}
          className={`min-h-9 min-w-11 rounded-full px-3 text-sm font-extrabold transition ${
            s.lang === o.code
              ? "bg-brand-700 text-white shadow"
              : dark
                ? "text-white/80 hover:text-white"
                : "text-slate-500 hover:text-brand-700"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/* --------------------------------- NAV CONFIG ------------------------------- */

const NAV = [
  { href: "/dashboard", key: "nav.overview", icon: LayoutGrid },
  { href: "/reports", key: "nav.reports", icon: FileText },
  { href: "/trends", key: "nav.trends", icon: TrendingUp },
  { href: "/insights", key: "nav.insights", icon: BrainCircuit },
  { href: "/ask", key: "nav.ask", icon: MessageCircleHeart },
  // Inserted at index 5 on purpose: the mobile bottom nav reads NAV.slice(0, 4)
  // and NAV[4], so anything before those would reshuffle the tab bar.
  { href: "/voice", key: "nav.voice", icon: Mic },
  { href: "/doctor", key: "nav.doctor", icon: Stethoscope },
  { href: "/settings", key: "nav.settings", icon: Settings },
];

const MORE = [
  { href: "/compare", icon: GitCompareArrows, en: "Compare Reports", hi: "रिपोर्ट तुलना" },
  { href: "/how", icon: Workflow, en: "How it works", hi: "यह कैसे काम करता है" },
  { href: "/why", icon: LifeBuoy, en: "Why Rxanvaya", hi: "Rxanvaya क्यों" },
  { href: "/", icon: ArrowLeft, en: "Back to home", hi: "होम पर वापस" },
];

/* ---------------------------------- APP SHELL -------------------------------- */

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { t, s } = useI18n();
  const { status, session, profile } = useAuth();
  const [moreOpen, setMoreOpen] = useState(false);
  const [voiceOpen, setVoiceOpen] = useState(false);

  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [pathname]);

  useEffect(() => {
    if (status === "authenticated" && profile && profile.onboarding_completed === false && pathname !== "/onboarding") {
      router.replace("/onboarding");
    }
  }, [status, profile, pathname, router]);

  if (status === "loading") {
    return <div className="flex min-h-dvh items-center justify-center bg-brand-50 text-sm font-extrabold text-brand-800">Preparing your ANVAYA experience...</div>;
  }

  const bottomItems = NAV.slice(0, 4); // overview, reports, trends, insights
  const askItem = NAV[4];

  return (
    <div className="min-h-dvh md:flex print:block">
      {/* ------------------------------ Sidebar (desktop) ----------------------------- */}
      <aside className="print:hidden sticky top-0 hidden h-dvh w-72 shrink-0 flex-col border-r border-slate-200 bg-white md:flex">
        <div className="px-5 pb-4 pt-6">
          <Link href="/" aria-label="Rxanvaya home">
            <Logo />
          </Link>
        </div>
        <nav className="flex-1 space-y-1 overflow-y-auto px-3">
          {NAV.map((item) => {
            const active =
              pathname === item.href ||
              (item.href === "/dashboard" && pathname.startsWith("/test"));
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex min-h-12 items-center gap-3 rounded-2xl px-4 text-[15px] font-bold transition ${
                  active
                    ? "bg-brand-700 text-white shadow-md shadow-brand-900/20"
                    : "text-slate-600 hover:bg-brand-50 hover:text-brand-800"
                }`}
              >
                <Icon className="h-5 w-5" strokeWidth={active ? 2.6 : 2.2} />
                {t(item.key)}
              </Link>
            );
          })}
          {[
            { href: "/compare", icon: GitCompareArrows, key: "compare.title" },
            { href: "/how", icon: Workflow, key: "nav.how" },
            { href: "/why", icon: LifeBuoy, key: "nav.why" },
          ].map((x) => {
            const Icon = x.icon;
            const active = pathname === x.href;
            return (
              <Link
                key={x.href}
                href={x.href}
                className={`flex min-h-11 items-center gap-3 rounded-2xl px-4 text-sm font-bold transition ${
                  active
                    ? "bg-brand-100 text-brand-800"
                    : "text-slate-500 hover:bg-slate-50 hover:text-brand-700"
                }`}
              >
                <Icon className="h-[18px] w-[18px]" />
                {t(x.key)}
              </Link>
            );
          })}
        </nav>
        <div className="border-t border-slate-100 p-4">
          <div className="flex items-center gap-3 rounded-2xl bg-brand-50 p-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-700 text-sm font-extrabold text-white">
              RS
            </span>
            <div className="leading-tight">
              <p className="text-sm font-extrabold text-brand-900">
                {pick(PATIENT.name, s.lang)}
              </p>
              <p className="text-xs font-semibold text-slate-500">
                {session?.user.email ?? `${PATIENT.age} · ${pick(PATIENT.gender, s.lang)}`}
              </p>
            </div>
          </div>
          {session ? (
            <button onClick={() => void signOut(session).then(() => router.replace("/login"))} className="mt-3 flex min-h-11 w-full items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white text-sm font-extrabold text-slate-600 transition hover:border-brand-300 hover:text-brand-800"><LogOut className="h-4 w-4" />Log out</button>
          ) : (
            <Link href="/login" className="mt-3 flex min-h-11 w-full items-center justify-center gap-2 rounded-2xl border border-brand-200 bg-white text-sm font-extrabold text-brand-700 transition hover:bg-brand-50">Sign In</Link>
          )}
        </div>
      </aside>

      {/* ------------------------------ Mobile top bar ------------------------------ */}
      <div className="print:hidden sticky top-0 z-40 flex h-16 items-center justify-between gap-3 border-b border-slate-200/70 bg-white/85 px-4 backdrop-blur md:hidden">
        <Link href="/dashboard">
          <Logo withTagline={false} />
        </Link>
        <div className="flex items-center gap-2">
          <QuickLang />
          {session ? (
            <button onClick={() => void signOut(session).then(() => router.replace("/login"))} aria-label="Log out" className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600"><LogOut className="h-5 w-5" /></button>
          ) : (
            <Link href="/login" className="inline-flex min-h-9 items-center rounded-full border border-brand-200 bg-white px-3 text-xs font-bold text-brand-700">Sign In</Link>
          )}
          <Link
            href="/settings"
            aria-label="Settings"
            className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600"
          >
            <Settings className="h-5 w-5" />
          </Link>
        </div>
      </div>

      {/* --------------------------------- Main area -------------------------------- */}
      <main className="min-w-0 flex-1 px-4 pb-28 pt-5 md:px-8 md:pb-16 md:pt-8 lg:px-10">
        <div className="mx-auto w-full max-w-6xl">{children}</div>

        <footer className="print:hidden mx-auto mt-10 w-full max-w-6xl border-t border-slate-200 pt-5">
          <p className="text-center text-xs font-medium leading-relaxed text-slate-400 md:text-left">
            {t("disclaimer.banner")}
          </p>
          <p className="mt-1 text-center text-[11px] text-slate-300 md:text-left">
            Rxanvaya prototype · SIH 2026 · {pick(PATIENT.fictionalNote, s.lang)}
          </p>
        </footer>
      </main>

      {/* ------------------------------ Mic FAB (voice) ----------------------------- */}
      <button
        onClick={() => setVoiceOpen(true)}
        aria-label={t("ask.tapMic")}
        className="print:hidden fixed bottom-24 right-4 z-50 flex h-16 w-16 items-center justify-center rounded-full bg-mint-600 text-white shadow-xl shadow-mint-600/30 transition hover:bg-mint-500 active:scale-90 md:bottom-8 md:right-8"
      >
        <span className="absolute inline-flex h-full w-full animate-pulse-ring rounded-full bg-mint-400/60" />
        <Mic className="relative h-7 w-7" strokeWidth={2.2} />
      </button>

      {/* ------------------------------ Bottom nav (mobile) ------------------------- */}
      <nav className="print:hidden fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
        <div className="grid grid-cols-5">
          {[bottomItems[0], bottomItems[1], bottomItems[2], askItem].map((item) => {
            const Icon = item.icon;
            const active =
              pathname === item.href ||
              (item.href === "/dashboard" && pathname.startsWith("/test"));
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex min-h-[60px] flex-col items-center justify-center gap-1 text-[10px] font-extrabold ${
                  active ? "text-brand-700" : "text-slate-400"
                }`}
              >
                <Icon className="h-[22px] w-[22px]" strokeWidth={active ? 2.6 : 2} />
                {t(item.key === "nav.overview" ? "nav.home" : item.key)}
              </Link>
            );
          })}
          <button
            onClick={() => setMoreOpen(true)}
            className={`flex min-h-[60px] flex-col items-center justify-center gap-1 text-[10px] font-extrabold ${
              moreOpen ? "text-brand-700" : "text-slate-400"
            }`}
          >
            <MoreHorizontal className="h-[22px] w-[22px]" />
            {t("nav.more")}
          </button>
        </div>
      </nav>

      {/* ------------------------------- More sheet ------------------------------- */}
      <Sheet open={moreOpen} onClose={() => setMoreOpen(false)} title={t("nav.more")}>
        <div className="mt-2 grid gap-2">
          {[
            { href: "/insights", icon: BrainCircuit, en: t("nav.insights"), hi: t("nav.insights") },
            { href: "/voice", icon: Mic, en: t("nav.voice"), hi: t("nav.voice") },
            { href: "/doctor", icon: Stethoscope, en: t("nav.doctor"), hi: t("nav.doctor") },
            { href: "/settings", icon: Settings, en: t("nav.settings"), hi: t("nav.settings") },
            { href: "/settings#sources", icon: BookOpen, en: t("nav.sources"), hi: t("nav.sources") },
            ...MORE,
          ].map((m) => {
            const Icon = m.icon;
            return (
              <Link
                key={m.href}
                href={m.href}
                onClick={() => setMoreOpen(false)}
                className="flex min-h-[52px] items-center gap-3 rounded-2xl border border-slate-200 px-4 text-[15px] font-bold text-slate-700 transition hover:bg-brand-50 active:scale-[0.99]"
              >
                <Icon className="h-5 w-5 text-brand-600" />
                {s.lang === "hi" ? m.hi : m.en}
              </Link>
            );
          })}
        </div>
      </Sheet>

      <VoiceSheet open={voiceOpen} onClose={() => setVoiceOpen(false)} />
    </div>
  );
}

/* ---------------------------------- FLOW SHELL ------------------------------- */

export function FlowShell({
  children,
  back,
}: {
  children: ReactNode;
  back?: string;
}) {
  const { t, s } = useI18n();
  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, []);
  return (
    <div className="flex min-h-dvh flex-col bg-gradient-to-b from-mint-50 via-white to-brand-50">
      <header className="flex items-center justify-between gap-3 px-4 py-4 md:px-8">
        <div className="flex items-center gap-3">
          {back && (
            <Link
              href={back}
              aria-label={t("common.back")}
              className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 shadow-sm transition hover:border-brand-300 active:scale-95"
            >
              <ArrowLeft className="h-5 w-5" />
            </Link>
          )}
          <Link href="/" aria-label="Rxanvaya">
            <Logo />
          </Link>
        </div>
        <QuickLang />
      </header>
      <motion.main
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: "easeOut" }}
        className="mx-auto w-full max-w-lg flex-1 px-4 pb-16 md:max-w-2xl"
      >
        {children}
      </motion.main>
      {s.lang && (
        <p className="px-6 pb-6 text-center text-[11px] font-medium text-slate-400">
          {t("disclaimer.short")}
        </p>
      )}
    </div>
  );
}

export function HomeNav({ solid = false }: { solid?: boolean }) {
  const { s, set } = useI18n();
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const fn = () => setScrolled(window.scrollY > 24);
    fn();
    window.addEventListener("scroll", fn, { passive: true });
    return () => window.removeEventListener("scroll", fn);
  }, []);
  const bg = solid || scrolled;
  return (
    <div
      className={`fixed inset-x-0 top-0 z-50 transition ${
        bg ? "border-b border-slate-200/60 bg-white/85 backdrop-blur" : "bg-transparent"
      }`}
    >
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-4 md:h-[72px] md:px-6">
        <Link href="/" aria-label="Rxanvaya home">
          <Logo />
        </Link>
        <div className="flex items-center gap-2">
          <Link
            href="/how"
            className="hidden rounded-full px-3 py-2 text-sm font-bold text-slate-500 transition hover:text-brand-700 md:block"
          >
            {s.lang === "hi" ? "यह कैसे काम करता है" : "How it works"}
          </Link>
          <button
            onClick={() => set({ lang: s.lang === "hi" ? "en" : "hi" })}
            className="min-h-10 rounded-full border border-slate-200 bg-white px-3.5 text-sm font-extrabold text-brand-700 transition hover:border-brand-300"
          >
            {s.lang === "hi" ? "EN" : "हिन्दी"}
          </button>
          <Link
            href="/login"
            className="hidden min-h-10 items-center rounded-full border border-slate-200 bg-white px-4 text-sm font-extrabold text-brand-700 transition hover:border-brand-300 sm:inline-flex"
          >
            Log In
          </Link>
          <Link
            href="/login?mode=signup"
            className="inline-flex min-h-10 items-center rounded-full bg-brand-700 px-4 text-sm font-extrabold text-white shadow-md shadow-brand-900/20 transition hover:bg-brand-600 active:scale-95"
          >
            Get Started
          </Link>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------- Voice FAB (flow) ---------------------------- */

export function FlowMic({ dark = false }: { dark?: boolean }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        aria-label={t("ask.tapMic")}
        className={`fixed bottom-6 right-4 z-50 flex h-14 w-14 items-center justify-center rounded-full text-white shadow-xl transition active:scale-90 md:bottom-8 md:right-8 ${
          dark ? "bg-white/20 backdrop-blur" : "bg-mint-600 shadow-mint-600/30 hover:bg-mint-500"
        }`}
      >
        <Mic className="h-6 w-6" />
      </button>
      <VoiceSheet open={open} onClose={() => setOpen(false)} />
    </>
  );
}

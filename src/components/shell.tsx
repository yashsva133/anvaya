"use client";

// RxAnvaya — application shell (sidebar, mobile nav, language switch, mic FAB)
// and the minimal "flow" shell used by onboarding screens.

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  BrainCircuit,
  ChevronRight,
  FileText,
  GitCompareArrows,
  LayoutGrid,
  LifeBuoy,
  LogOut,
  Menu,
  MessageCircleHeart,
  Mic,
  MoreHorizontal,
  Settings,
  Sparkles,
  Stethoscope,
  TrendingUp,
  Workflow,
  X,
} from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { useAuth } from "@/lib/auth";
import { Logo, Sheet } from "@/components/core";
import { AuthGuard } from "@/components/auth-guard";
import { VoiceSheet } from "@/components/voice";


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
  { href: "/compare", key: "nav.compare", icon: GitCompareArrows },
  { href: "/settings", key: "nav.settings", icon: Settings },
];

const MORE = [
  { href: "/doctor", icon: Stethoscope, en: "Patient Lab Summary", hi: "रोगी लैब सारांश" },
  { href: "/compare", icon: GitCompareArrows, en: "Compare Reports", hi: "रिपोर्ट तुलना" },
  { href: "/settings", icon: Settings, en: "Settings", hi: "सेटिंग्स" },
  { href: "/", icon: ArrowLeft, en: "Back to home", hi: "होम पर वापस" },
];

/* ---------------------------------- APP SHELL -------------------------------- */

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { t, s } = useI18n();
  const { user, profile, patient, signOut } = useAuth();
  const [moreOpen, setMoreOpen] = useState(false);
  const [voiceOpen, setVoiceOpen] = useState(false);

  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [pathname]);

  const bottomItems = NAV.slice(0, 4); // overview, reports, trends, insights
  const askItem = NAV[4];

  // User display metadata
  const displayName =
    patient?.full_name ||
    profile?.full_name ||
    user?.user_metadata?.full_name ||
    user?.email?.split("@")[0] ||
    (s.lang === "hi" ? "आपकी प्रोफ़ाइल" : "Your profile");

  const getInitials = (name: string) => {
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return (name.slice(0, 2) || "U").toUpperCase();
  };

  const initials = getInitials(displayName);

  const displaySub = patient?.age
    ? `${patient.age} · ${patient.sex ? (s.lang === "hi" && patient.sex === "male" ? "पुरुष" : s.lang === "hi" && patient.sex === "female" ? "महिला" : patient.sex) : ""}`
    : user?.email || (s.lang === "hi" ? "रिपोर्ट अपलोड नहीं हुई" : "No report uploaded yet");

  const handleSignOut = async () => {
    await signOut();
    router.replace("/login");
  };

  return (
    <AuthGuard requireOnboarded={true}>
      <div className="min-h-dvh md:flex print:block">
        {/* ------------------------------ Sidebar (desktop) ----------------------------- */}
        <aside className="print:hidden sticky top-0 hidden h-dvh w-72 shrink-0 flex-col border-r border-slate-200 bg-white md:flex">
          <div className="px-5 pb-4 pt-6">
            <Link href="/" aria-label="RxAnvaya home">
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
          </nav>
          <div className="border-t border-slate-100 p-4">
            <div className="flex items-center justify-between rounded-2xl bg-brand-50 p-3">
              <div className="flex items-center gap-3 min-w-0">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-700 text-sm font-extrabold text-white">
                  {initials}
                </span>
                <div className="leading-tight min-w-0">
                  <p className="truncate text-sm font-extrabold text-brand-900">
                    {displayName}
                  </p>
                  <p className="truncate text-xs font-semibold text-slate-500">
                    {displaySub}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={handleSignOut}
                title={s.lang === "hi" ? "लॉग आउट करें" : "Sign Out"}
                aria-label={s.lang === "hi" ? "लॉग आउट करें" : "Sign Out"}
                className="ml-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-slate-400 hover:bg-white hover:text-rose-600 transition"
              >
                <LogOut className="h-4 w-4" />
              </button>
            </div>
          </div>
        </aside>

        {/* ------------------------------ Mobile top bar ------------------------------ */}
        <div className="print:hidden sticky top-0 z-40 flex h-16 items-center justify-between gap-3 border-b border-slate-200/70 bg-white/85 px-4 backdrop-blur md:hidden">
          <Link href="/dashboard">
            <Logo withTagline={false} />
          </Link>
          <div className="flex items-center gap-2">
            <QuickLang />
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

          <footer className="print:hidden mx-auto mt-6 w-full max-w-6xl pt-2">
            <p className="text-center text-xs text-slate-400 md:text-left">
              RxAnvaya · {s.lang === "hi" ? "आपकी रिपोर्ट, आपकी समझ" : "Your report, easier to understand"}
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
            <button
              type="button"
              onClick={() => {
                setMoreOpen(false);
                handleSignOut();
              }}
              className="flex min-h-[52px] items-center gap-3 rounded-2xl border border-rose-200 bg-rose-50/50 px-4 text-[15px] font-bold text-rose-700 transition hover:bg-rose-100/70 active:scale-[0.99]"
            >
              <LogOut className="h-5 w-5 text-rose-600" />
              {s.lang === "hi" ? "लॉग आउट करें" : "Sign Out"}
            </button>
          </div>
        </Sheet>

        <VoiceSheet open={voiceOpen} onClose={() => setVoiceOpen(false)} />
      </div>
    </AuthGuard>
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
          <Link href="/" aria-label="RxAnvaya">
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

/* ---------------------------------- HOME NAV --------------------------------- */

export function HomeNav({ solid = false }: { solid?: boolean }) {
  const { s, set } = useI18n();
  const { user, profile, patient, signOut } = useAuth();
  const router = useRouter();
  const [scrolled, setScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    const fn = () => setScrolled(window.scrollY > 24);
    fn();
    window.addEventListener("scroll", fn, { passive: true });
    return () => window.removeEventListener("scroll", fn);
  }, []);

  const bg = solid || scrolled;

  const displayName =
    patient?.full_name ||
    profile?.full_name ||
    user?.user_metadata?.full_name ||
    (user?.email ? user.email.split("@")[0] : "");

  const handleSignOut = async () => {
    await signOut();
    setMobileMenuOpen(false);
    router.replace("/login");
  };

  return (
    <>
      <header
        className={`fixed inset-x-0 top-0 z-50 transition-all duration-200 ${
          bg
            ? "border-b border-slate-200/70 bg-white/90 shadow-sm backdrop-blur-md"
            : "bg-transparent"
        }`}
      >
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-4 md:h-20 md:px-6">
          <Link href="/" aria-label="RxAnvaya home" className="flex items-center gap-2">
            <Logo />
          </Link>

          {/* Desktop Nav Links */}
          <nav className="hidden items-center gap-1 md:flex">
            <Link
              href="/how"
              className="rounded-full px-4 py-2 text-sm font-extrabold text-slate-600 transition hover:bg-slate-100 hover:text-brand-800"
            >
              {s.lang === "hi" ? "यह कैसे काम करता है" : "How it Works"}
            </Link>
            <Link
              href="/why"
              className="rounded-full px-4 py-2 text-sm font-extrabold text-slate-600 transition hover:bg-slate-100 hover:text-brand-800"
            >
              {s.lang === "hi" ? "RxAnvaya क्यों" : "Why RxAnvaya"}
            </Link>
          </nav>

          {/* Desktop Auth & Actions */}
          <div className="hidden items-center gap-3 md:flex">
            <button
              type="button"
              onClick={() => set({ lang: s.lang === "hi" ? "en" : "hi" })}
              className="inline-flex min-h-10 items-center justify-center rounded-full border border-slate-200 bg-white px-3.5 text-xs font-extrabold text-brand-800 shadow-sm transition hover:border-brand-300 hover:bg-brand-50"
            >
              {s.lang === "hi" ? "EN" : "हिन्दी"}
            </button>

            {user ? (
              <div className="flex items-center gap-2">
                <Link
                  href="/dashboard"
                  className="inline-flex min-h-11 items-center gap-2 rounded-full bg-brand-700 px-5 text-sm font-extrabold text-white shadow-md shadow-brand-900/20 transition hover:bg-brand-600 active:scale-95"
                >
                  <Sparkles className="h-4 w-4 text-mint-300" />
                  {s.lang === "hi" ? "डैशबोर्ड पर जाएं" : "Go to Dashboard"}
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <Link
                  href="/login"
                  className="inline-flex min-h-10 items-center justify-center rounded-full border border-slate-200 bg-white px-4 text-xs font-extrabold text-slate-700 shadow-sm transition hover:border-brand-300 hover:text-brand-800 active:scale-95"
                >
                  {s.lang === "hi" ? "लॉग इन" : "Sign In"}
                </Link>
                <Link
                  href="/login?mode=signup"
                  className="inline-flex min-h-10 items-center gap-1.5 rounded-full bg-brand-700 px-5 text-xs font-extrabold text-white shadow-md shadow-brand-900/15 transition hover:bg-brand-600 active:scale-95"
                >
                  {s.lang === "hi" ? "शुरू करें" : "Get Started"}
                  <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </div>
            )}
          </div>

          {/* Mobile Right Controls: Language + Hamburger */}
          <div className="flex items-center gap-2 md:hidden">
            <button
              type="button"
              onClick={() => set({ lang: s.lang === "hi" ? "en" : "hi" })}
              className="inline-flex h-9 items-center justify-center rounded-full border border-slate-200 bg-white px-3 text-xs font-extrabold text-brand-800"
            >
              {s.lang === "hi" ? "EN" : "हिन्दी"}
            </button>
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              aria-label={s.lang === "hi" ? "मेनू खोलें" : "Open Menu"}
              className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-700 shadow-sm transition hover:border-brand-300"
            >
              <Menu className="h-5 w-5" />
            </button>
          </div>
        </div>
      </header>

      {/* Mobile Navigation Drawer Sheet */}
      <AnimatePresence>
        {mobileMenuOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setMobileMenuOpen(false)}
              className="fixed inset-0 z-[60] bg-brand-950/50 backdrop-blur-sm md:hidden"
            />
            <motion.div
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 260 }}
              className="fixed inset-y-0 right-0 z-[70] flex w-full max-w-xs flex-col bg-white p-6 shadow-2xl md:hidden"
            >
              <div className="flex items-center justify-between border-b border-slate-100 pb-4">
                <Logo withTagline={false} />
                <button
                  type="button"
                  onClick={() => setMobileMenuOpen(false)}
                  aria-label={s.lang === "hi" ? "बंद करें" : "Close Menu"}
                  className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-slate-600 transition hover:bg-slate-200"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {/* User profile teaser if logged in */}
              {user && (
                <div className="mt-4 rounded-2xl bg-brand-50 p-3">
                  <p className="text-xs font-bold text-slate-500">
                    {s.lang === "hi" ? "लॉग इन किया हुआ खाता" : "Signed in as"}
                  </p>
                  <p className="truncate text-sm font-extrabold text-brand-950">
                    {displayName || user.email}
                  </p>
                </div>
              )}

              {/* Nav Links */}
              <nav className="mt-6 flex-1 space-y-2 overflow-y-auto">
                <Link
                  href="/"
                  onClick={() => setMobileMenuOpen(false)}
                  className="flex min-h-12 items-center justify-between rounded-2xl px-4 text-sm font-extrabold text-slate-700 transition hover:bg-slate-50"
                >
                  <span>{s.lang === "hi" ? "होम" : "Home"}</span>
                  <ChevronRight className="h-4 w-4 text-slate-400" />
                </Link>
                <Link
                  href="/how"
                  onClick={() => setMobileMenuOpen(false)}
                  className="flex min-h-12 items-center justify-between rounded-2xl px-4 text-sm font-extrabold text-slate-700 transition hover:bg-slate-50"
                >
                  <span>{s.lang === "hi" ? "यह कैसे काम करता है" : "How it Works"}</span>
                  <ChevronRight className="h-4 w-4 text-slate-400" />
                </Link>
                <Link
                  href="/why"
                  onClick={() => setMobileMenuOpen(false)}
                  className="flex min-h-12 items-center justify-between rounded-2xl px-4 text-sm font-extrabold text-slate-700 transition hover:bg-slate-50"
                >
                  <span>{s.lang === "hi" ? "RxAnvaya क्यों" : "Why RxAnvaya"}</span>
                  <ChevronRight className="h-4 w-4 text-slate-400" />
                </Link>
                <Link
                  href="/compare"
                  onClick={() => setMobileMenuOpen(false)}
                  className="flex min-h-12 items-center justify-between rounded-2xl px-4 text-sm font-extrabold text-slate-700 transition hover:bg-slate-50"
                >
                  <span>{s.lang === "hi" ? "रिपोर्ट तुलना" : "Compare Reports"}</span>
                  <ChevronRight className="h-4 w-4 text-slate-400" />
                </Link>
              </nav>

              {/* Actions Bottom */}
              <div className="mt-auto space-y-3 border-t border-slate-100 pt-4">
                {user ? (
                  <>
                    <Link
                      href="/dashboard"
                      onClick={() => setMobileMenuOpen(false)}
                      className="flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-brand-700 px-4 text-sm font-extrabold text-white shadow-md shadow-brand-900/20"
                    >
                      <Sparkles className="h-4 w-4 text-mint-300" />
                      {s.lang === "hi" ? "डैशबोर्ड पर जाएं" : "Go to Dashboard"}
                    </Link>
                    <button
                      type="button"
                      onClick={handleSignOut}
                      className="flex min-h-11 w-full items-center justify-center gap-2 rounded-2xl border border-rose-200 bg-rose-50 text-xs font-extrabold text-rose-700 transition active:scale-95"
                    >
                      <LogOut className="h-4 w-4" />
                      {s.lang === "hi" ? "लॉग आउट" : "Sign Out"}
                    </button>
                  </>
                ) : (
                  <>
                    <Link
                      href="/login?mode=signup"
                      onClick={() => setMobileMenuOpen(false)}
                      className="flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-brand-700 px-4 text-sm font-extrabold text-white shadow-md shadow-brand-900/20"
                    >
                      {s.lang === "hi" ? "शुरू करें" : "Get Started"}
                      <ArrowRight className="h-4 w-4" />
                    </Link>
                    <Link
                      href="/login"
                      onClick={() => setMobileMenuOpen(false)}
                      className="flex min-h-12 w-full items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 text-sm font-extrabold text-slate-700 shadow-sm"
                    >
                      {s.lang === "hi" ? "लॉग इन" : "Sign In"}
                    </Link>
                  </>
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
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

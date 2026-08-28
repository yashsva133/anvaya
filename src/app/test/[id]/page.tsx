"use client";

// Screen 6 — individual test explanation with three reading levels.
// Connected to dynamic activeReport data and catalog.

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  ArrowUpRight,
  HelpCircle,
  LifeBuoy,
  Lightbulb,
  ListChecks,
  Link2,
  Stethoscope,
  TrendingUp,
} from "lucide-react";
import { AppShell } from "@/components/shell";
import {
  ConfBar,
  ListenBtn,
  Md,
  RangeBar,
  SafetyNote,
  SectionTitle,
  StatusPill,
  TestIcon,
  TrendChart,
} from "@/components/core";
import { useI18n, pick } from "@/lib/i18n";
import { SOURCES, fmtValue, reportStatusKnown, resolveTestDef, type ReportEntry } from "@/lib/data";
import { useReportData } from "@/context/ReportDataContext";

const LEVELS = [
  { id: "simple", key: "mode.simple" },
  { id: "advanced", key: "mode.advanced" },
] as const;

export default function TestDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { t, s, set } = useI18n();
  const { activeReport, catalog, reports, loading } = useReportData();

  const testId = params.id?.toLowerCase() || "";
  const activeEntry = activeReport?.entries.find((e) => e.test.toLowerCase() === testId);
  // Unknown tests are still real report data. Use only their recorded label,
  // unit and printed range; never borrow another test's clinical definition.
  const def = resolveTestDef(testId, catalog, activeEntry);
  const hi = s.lang === "hi";

  if (loading || !activeEntry) {
    return (
      <AppShell>
        <section className="card-shadow mt-8 rounded-[2rem] border-2 border-dashed border-brand-200 bg-white p-8 text-center">
          <h1 className="text-2xl font-extrabold text-brand-950">
            {loading ? (hi ? "रिपोर्ट लोड हो रही है…" : "Loading your report…") : (hi ? "इस जाँच का परिणाम अभी नहीं है" : "No saved result for this test yet")}
          </h1>
          <p className="mx-auto mt-3 max-w-md text-sm font-semibold leading-relaxed text-slate-500">
            {hi ? "अपनी लैब रिपोर्ट अपलोड या स्कैन करें। यहाँ केवल आपकी saved रिपोर्ट का परिणाम दिखता है।" : "Upload or scan your laboratory report. This page shows only a result from your saved report."}
          </p>
          <Link href="/upload" className="mt-5 inline-flex min-h-12 items-center rounded-2xl bg-brand-700 px-6 text-sm font-extrabold text-white hover:bg-brand-600">
            {hi ? "रिपोर्ट अपलोड करें" : "Upload report"}
          </Link>
        </section>
      </AppShell>
    );
  }

  const entry: ReportEntry = activeEntry;
  const level = s.mode;
  const whatText =
    level === "advanced" ? (def.what.med || (hi ? def.what.hi : def.what.en)) : hi ? def.what.vs_hi : def.what.vs_en;
  const whyText = level === "advanced" ? (hi ? def.why.hi : def.why.en) : hi ? def.why.hi : def.why.vs_en;
  const todoText = level === "advanced" ? (hi ? def.todo.hi : def.todo.en) : hi ? def.todo.hi : def.todo.vs_en;
  const causesText = pick(def.causes, s.lang);
  const sources = (def.sources || [])
    .map((id) => SOURCES.find((x) => x.id === id))
    .filter((x): x is (typeof SOURCES)[number] => !!x);

  const speakAll = `${def.name.en}. ${fmtValue(entry.value)} ${def.unit}. ${t(`status.${entry.status}`)}. ${whatText}. ${whyText}. ${todoText}`;

  return (
    <AppShell>
      {/* back + header */}
      <button
        onClick={() => router.back()}
        className="inline-flex min-h-10 items-center gap-2 rounded-full border border-slate-200 bg-white px-4 text-sm font-extrabold text-slate-600 transition hover:border-brand-300 hover:text-brand-700"
      >
        <ArrowLeft className="h-4 w-4" />
        {t("common.back")}
      </button>

      <div className="mt-4 grid gap-5 lg:grid-cols-[1.6fr_1fr]">
        {/* left column */}
        <div className="space-y-5">
          <motion.section
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            className="card-shadow rounded-[2rem] border border-slate-100 bg-white p-6 md:p-7"
          >
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="flex items-center gap-4">
                <TestIcon testId={def.id} size={64} />
                <div>
                  <h1 className="text-2xl font-extrabold tracking-tight text-brand-950 md:text-3xl">
                    {s.mode === "advanced" ? pick(def.name, s.lang) : pick(def.simple, s.lang)}
                  </h1>
                  <p className="text-sm font-bold text-slate-400">
                    {t("test.refRange")}: {def.ref.text}
                    <span className="text-slate-300"> · {t("common.perReport")}</span>
                  </p>
                </div>
              </div>
              <ListenBtn text={speakAll} />
            </div>

            <div className="mt-5 flex flex-wrap items-center gap-4">
              <p className="tabular text-5xl font-extrabold text-brand-950 md:text-6xl">
                {fmtValue(entry.value)}
                <span className="ml-1.5 text-lg font-bold text-slate-400">{def.unit}</span>
              </p>
              <StatusPill status={entry.status} known={reportStatusKnown(entry)} size="lg" />
            </div>

            <div className="mt-5">
              <RangeBar test={def} value={entry.value} />
            </div>

            {/* explanation level switch */}
            <div className="mt-6 flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 p-1">
              {LEVELS.map((l) => (
                <button
                  key={l.id}
                  onClick={() => set({ mode: l.id })}
                  aria-pressed={level === l.id}
                  className={`min-h-10 flex-1 whitespace-nowrap rounded-full px-3 text-sm font-extrabold transition ${
                    level === l.id
                      ? "bg-brand-700 text-white shadow"
                      : "text-slate-500 hover:text-brand-700"
                  }`}
                >
                  {t(l.key)}
                </button>
              ))}
            </div>

            <div className="mt-5 rounded-2xl bg-brand-50/70 p-5">
              <p className="flex items-center gap-2 text-xs font-extrabold uppercase tracking-widest text-brand-600">
                <HelpCircle className="h-4 w-4" />
                {t("test.whatIs")}
              </p>
              <p className={`mt-2 font-semibold leading-relaxed text-slate-700 ${level === "simple" ? "text-lg" : "text-[15px]"}`}>
                {whatText}
              </p>
              <p className={`mt-3 font-bold leading-relaxed text-slate-800 ${level === "simple" ? "text-lg" : "text-[15px]"}`}>
                {whyText}
              </p>
            </div>
          </motion.section>

          {/* why different */}
          <motion.section
            initial={{ opacity: 0, y: 12 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="card-shadow rounded-[2rem] border border-slate-100 bg-white p-6 md:p-7"
          >
            <p className="flex items-center gap-2 text-xs font-extrabold uppercase tracking-widest text-brand-600">
              <Lightbulb className="h-4 w-4" />
              {t("test.whyLow")}
            </p>
            <Md text={causesText} className="mt-3 text-[15px] font-medium leading-relaxed text-slate-600" />
            <p className="mt-3 text-sm font-semibold text-slate-400">
              {hi
                ? "यह जानकारी निदान नहीं है — कारण केवल डॉक्टर बता सकते हैं।"
                : "This is general information, not a diagnosis — only your doctor can find the cause."}
            </p>
          </motion.section>

          {/* what to do */}
          <motion.section
            initial={{ opacity: 0, y: 12 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="rounded-[2rem] border-2 border-mint-300 bg-gradient-to-br from-mint-50 to-white p-6 md:p-7"
          >
            <p className="flex items-center gap-2 text-xs font-extrabold uppercase tracking-widest text-mint-700">
              <ListChecks className="h-4 w-4" />
              {t("test.whatDo")}
            </p>
            <Md text={todoText} className="mt-3 text-[15px] font-bold leading-relaxed text-slate-700" />
            <div className="mt-4 flex flex-wrap gap-2.5">
              <ListenBtn compact text={todoText} />
              <Link
                href="/doctor"
                className="inline-flex min-h-11 items-center gap-2 rounded-full bg-mint-600 px-5 text-sm font-extrabold text-white shadow-md transition hover:bg-mint-500 active:scale-95"
              >
                <Stethoscope className="h-4 w-4" />
                {t("common.talkDoctor")}
              </Link>
              <Link
                href="/ask"
                className="inline-flex min-h-11 items-center gap-2 rounded-full border border-mint-300 bg-white px-5 text-sm font-extrabold text-mint-800 transition hover:bg-mint-50 active:scale-95"
              >
                <LifeBuoy className="h-4 w-4" />
                {hi ? "AI से पूछें" : "Ask about this"}
              </Link>
            </div>
          </motion.section>
        </div>

        {/* right column */}
        <div className="space-y-5">
          {/* trend */}
          <motion.section
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.08 }}
            className="card-shadow rounded-[2rem] border border-slate-100 bg-white p-6"
          >
            <p className="flex items-center gap-2 text-xs font-extrabold uppercase tracking-widest text-brand-600">
              <TrendingUp className="h-4 w-4" />
              {t("test.yourTrend")}
            </p>
            <div className="mt-2">
              <TrendChart
                testId={def.id}
                height={190}
                color="#dc2626"
                data={reports.flatMap((report) => {
                  const value = report.entries.find((item) => item.test === def.id)?.value;
                  return value === undefined
                    ? []
                    : [{ label: pick(report.month, s.lang), value }];
                })}
              />
            </div>
            <Link
              href="/trends"
              className="mt-2 inline-flex items-center gap-1.5 text-sm font-extrabold text-brand-700 hover:underline"
            >
              {hi ? "सभी रुझान देखें" : "Open full trend view"}
              <ArrowUpRight className="h-4 w-4" />
            </Link>
          </motion.section>

          {/* related */}
          {def.related && def.related.length > 0 && (
            <motion.section
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.14 }}
              className="card-shadow rounded-[2rem] border border-slate-100 bg-white p-6"
            >
              <p className="flex items-center gap-2 text-xs font-extrabold uppercase tracking-widest text-brand-600">
                <Link2 className="h-4 w-4" />
                {t("test.otherResults")}
              </p>
              <div className="mt-3 space-y-2">
                {def.related.map((rid) => {
                  const re = activeReport?.entries.find((x) => x.test === rid);
                  const rd = resolveTestDef(rid, catalog, re);
                  if (!rd) return null;
                  if (!re) return null;
                  const val = re.value;
                  return (
                    <Link
                      key={rid}
                      href={`/test/${rid}`}
                      className="flex items-center gap-3 rounded-2xl border border-slate-100 px-3 py-2.5 transition hover:border-brand-300 hover:bg-brand-50"
                    >
                      <TestIcon testId={rid} size={38} />
                      <span className="flex-1 text-sm font-extrabold text-slate-700">
                        {pick(rd.name, s.lang)}
                      </span>
                      <span className="tabular text-sm font-extrabold text-brand-900">
                        {fmtValue(val)}
                        <span className="ml-0.5 text-[10px] font-bold text-slate-400">
                          {rd.unit}
                        </span>
                      </span>
                    </Link>
                  );
                })}
              </div>
            </motion.section>
          )}

          {/* confidence */}
          <ConfBar
            level={def.conf?.level || "high"}
            pct={def.conf?.pct || 95}
            note={pick(def.conf?.note || { en: "High confidence interpretation", hi: "उच्च विश्वास व्याख्या" }, s.lang)}
          />

          {/* evidence */}
          {sources.length > 0 && (
            <motion.section
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="card-shadow rounded-[2rem] border border-slate-100 bg-white p-6"
            >
              <p className="flex items-center gap-2 text-xs font-extrabold uppercase tracking-widest text-brand-600">
                {t("test.evidence")}
              </p>
              <div className="mt-3 space-y-3">
                {sources.map((src) => (
                  <div key={src.id} className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                    <p className="text-sm font-extrabold text-slate-800">{src.title}</p>
                    <p className="text-xs font-bold text-slate-400">{src.publisher}</p>
                    <p className="mt-2 border-l-2 border-mint-300 pl-3 text-[13px] font-medium italic leading-relaxed text-slate-500">
                      “{pick(src.excerpt, s.lang)}”
                    </p>
                    <a
                      href={src.url}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-2.5 inline-flex min-h-10 items-center gap-1.5 rounded-full bg-brand-100 px-4 text-xs font-extrabold text-brand-800 transition hover:bg-brand-200"
                    >
                      {t("common.viewSource")}
                      <ArrowUpRight className="h-3.5 w-3.5" />
                    </a>
                  </div>
                ))}
              </div>
            </motion.section>
          )}

          <SafetyNote />
        </div>
      </div>
    </AppShell>
  );
}

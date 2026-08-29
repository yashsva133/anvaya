"use client";

// Screen 8 — trends and report timeline. Every number on this screen comes
// from the signed-in person's saved reports; an empty account stays empty.

import { useEffect, useMemo, useState, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import {
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  CircleAlert,
  GitCommitVertical,
  SearchX,
  Sparkles,
  TrendingUp,
} from "lucide-react";
import { AppShell } from "@/components/shell";
import {
  ListenBtn,
  SectionTitle,
  TestIcon,
  TrendChart,
  TrendDirIcon,
} from "@/components/core";
import { useI18n, pick } from "@/lib/i18n";
import { fmtValue, reportStatusKnown, resolveTestDef, type Report, type TestDef } from "@/lib/data";
import { useReportData } from "@/context/ReportDataContext";

interface Point {
  label: string;
  value: number;
  reportId: string;
}

function pointsFor(reports: Report[], testId: string, lang: "en" | "hi" | "bn"): Point[] {
  return reports.flatMap((report) => {
    const entry = report.entries.find((item) => item.test === testId);
    if (!entry) return [];
    return [{ label: pick(report.month, lang), value: entry.value, reportId: report.id }];
  });
}

function deviation(def: TestDef, value: number): number {
  if (def.ref.low !== undefined && value < def.ref.low) return def.ref.low - value;
  if (def.ref.high !== undefined && value > def.ref.high) return value - def.ref.high;
  return 0;
}

function statusFor(def: TestDef, value: number): "normal" | "borderline" | "high" | "low" {
  if (def.ref.low !== undefined && value < def.ref.low) return "low";
  if (def.ref.high !== undefined && value > def.ref.high) return "high";
  const span =
    def.ref.low !== undefined && def.ref.high !== undefined
      ? def.ref.high - def.ref.low
      : (def.ref.high ?? def.ref.low ?? 1) * 0.1;
  if (
    (def.ref.low !== undefined && value <= def.ref.low + span * 0.1) ||
    (def.ref.high !== undefined && value >= def.ref.high - span * 0.1)
  ) {
    return "borderline";
  }
  return "normal";
}

function TrendsPageContent() {
  const { t, s } = useI18n();
  const { reports, catalog, loading } = useReportData();
  const hi = s.lang === "hi";

  const availableTests = useMemo(
    () =>
      [...new Set(reports.flatMap((report) => report.entries.map((entry) => entry.test)))]
        .slice(0, 24),
    [reports]
  );
  const searchParams = useSearchParams();
  const [selected, setSelected] = useState(searchParams.get("test") || "");

  useEffect(() => {
    if (availableTests.length > 0 && !selected && !availableTests.includes(selected)) {
      setSelected(availableTests[0]);
    }
  }, [availableTests, selected]);

  if (loading) {
    return (
      <AppShell>
        <div className="card-shadow mt-8 rounded-[2rem] border border-slate-100 bg-white p-8">
          <div className="skeleton h-8 w-56 rounded-xl" />
          <div className="skeleton mt-5 h-64 rounded-3xl" />
        </div>
      </AppShell>
    );
  }

  if (reports.length === 0 || availableTests.length === 0) {
    return (
      <AppShell>
        <SectionTitle icon={TrendingUp} title={t("trends.title")} sub={t("trends.sub")} />
        <section className="card-shadow mt-5 rounded-[2rem] border-2 border-dashed border-brand-200 bg-gradient-to-br from-brand-50 via-white to-mint-50 p-8 text-center md:p-12">
          <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-mint-100 text-mint-700">
            <SearchX className="h-8 w-8" />
          </span>
          <h1 className="mt-5 text-2xl font-extrabold text-brand-950">
            {hi ? "अभी कोई रिपोर्ट नहीं है" : "No trend data yet"}
          </h1>
          <p className="mx-auto mt-3 max-w-md text-sm font-semibold leading-relaxed text-slate-500">
            {hi
              ? "अपनी लैब रिपोर्ट अपलोड या स्कैन करें। असली परिणाम मिलने के बाद यहाँ रुझान दिखाई देंगे।"
              : "Upload or scan a laboratory report. Trends will appear here after your actual results are saved."}
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <Link href="/upload" className="inline-flex min-h-12 items-center rounded-2xl bg-brand-700 px-6 text-sm font-extrabold text-white hover:bg-brand-600">
              {hi ? "रिपोर्ट अपलोड करें" : "Upload report"}
            </Link>
            <Link href="/scan" className="inline-flex min-h-12 items-center rounded-2xl border-2 border-mint-200 bg-white px-6 text-sm font-extrabold text-mint-800 hover:bg-mint-50">
              {hi ? "स्कैन करें" : "Scan report"}
            </Link>
          </div>
        </section>
      </AppShell>
    );
  }

  const selectedId = selected || availableTests[0];
  const def = resolveTestDef(selectedId, catalog, reports.flatMap((r) => r.entries).find((e) => e.test === selectedId));
  // Unknown report entries are intentionally kept; resolveTestDef gives them
  // only their recorded label/unit/range instead of another test's metadata.
  if (!def) return null;

  const selectedEntry = reports
    .flatMap((report) => report.entries)
    .find((entry) => entry.test === selectedId);
  const statusKnown = selectedEntry ? reportStatusKnown(selectedEntry) : def.ref.low !== undefined || def.ref.high !== undefined;
  const points = pointsFor(reports, selectedId, s.lang);
  const first = points[0];
  const last = points[points.length - 1] ?? first;
  const direction: "up" | "down" | "flat" =
    !first || !last || last.value === first.value ? "flat" : last.value > first.value ? "up" : "down";
  const status = last ? statusFor(def, last.value) : "normal";
  const movingAway = first && last ? deviation(def, last.value) > deviation(def, first.value) : false;
  const change = first && last ? Math.round((last.value - first.value) * 100) / 100 : 0;
  const changeHead =
    points.length < 2
      ? hi
        ? "यह आपकी पहली saved reading है।"
        : "This is the first saved reading for this test."
      : direction === "flat"
        ? hi
          ? `${pick(def.name, "hi")} में कोई बदलाव नहीं हुआ।`
          : `${def.name.en} has not changed between these reports.`
        : hi
          ? `${pick(def.name, "hi")} ${fmtValue(first.value)} से ${fmtValue(last.value)} हुआ।`
          : `${def.name.en} moved from ${fmtValue(first.value)} to ${fmtValue(last.value)}.`;
  const changeSub =
    !statusKnown
      ? hi
        ? "इस जाँच की संदर्भ सीमा नहीं मिली, इसलिए चिकित्सकीय दिशा तय नहीं की गई है।"
        : "No trusted reference range was reported, so the app cannot assign a clinical direction."
      : points.length < 2
        ? hi
          ? "एक और रिपोर्ट आने पर समय के साथ तुलना दिखाई जाएगी।"
          : "A second report will let you compare the change over time."
        : movingAway
          ? hi
            ? "यह मान अपनी संदर्भ सीमा से और दूर जा रहा है। डॉक्टर से चर्चा करें।"
            : "This reading is moving farther from its reference range. Discuss it with your doctor."
          : hi
            ? "यह रुझान डॉक्टर के लिए उपयोगी संदर्भ दे सकता है।"
            : "This trend can give your doctor useful context.";

  return (
    <AppShell>
      <SectionTitle icon={TrendingUp} title={t("trends.title")} sub={t("trends.sub")} />

      <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
        {availableTests.map((id) => {
          const d = resolveTestDef(id, catalog, reports.flatMap((r) => r.entries).find((e) => e.test === id));
          const active = selectedId === id;
          return (
            <button
              key={id}
              onClick={() => setSelected(id)}
              aria-pressed={active}
              className={`flex min-h-14 shrink-0 items-center gap-2.5 rounded-2xl border-2 px-4 text-sm font-extrabold transition ${active ? "border-brand-700 bg-brand-700 text-white shadow-md" : "border-slate-200 bg-white text-slate-600 hover:border-brand-300"}`}
            >
              <TestIcon testId={id} size={30} />
              {pick(d.name, s.lang)}
            </button>
          );
        })}
      </div>

      <motion.div key={selectedId} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="card-shadow mt-5 rounded-[2rem] border border-slate-100 bg-white p-6 md:p-7">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-lg font-extrabold text-brand-950">{pick(def.name, s.lang)}</p>
            <p className="text-xs font-bold text-slate-400">{hi ? "सामान्य सीमा" : "Reference"}: {def.ref.text}</p>
          </div>
          <span className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-extrabold ${!statusKnown ? "bg-slate-50 text-slate-600" : status === "normal" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>
            <TrendDirIcon dir={direction} className="h-4 w-4" />
            {first && last ? `${fmtValue(first.value)} → ${fmtValue(last.value)} ${def.unit}` : hi ? "डेटा नहीं" : "No saved reading"}
          </span>
        </div>
        <div className="mt-2">
          <TrendChart
            testId={selectedId}
            height={280}
            data={points.map(({ label, value }) => ({ label, value }))}
          />
        </div>
        <p className="mt-1 text-center text-[11px] font-bold text-slate-400">
          {def.ref.low !== undefined && def.ref.high !== undefined
            ? hi
              ? `हरा क्षेत्र = सामान्य सीमा · ${first?.label ?? ""} → ${last?.label ?? ""}`
              : `Green band = usual range · ${first?.label ?? ""} → ${last?.label ?? ""}`
            : def.ref.low !== undefined || def.ref.high !== undefined
              ? hi
                ? `रिपोर्ट में एक तरफ़ की सीमा है; चिकित्सकीय तुलना डॉक्टर करें · ${first?.label ?? ""} → ${last?.label ?? ""}`
                : `Only one printed bound is available; discuss clinical meaning with your doctor · ${first?.label ?? ""} → ${last?.label ?? ""}`
              : hi
                ? `संदर्भ सीमा उपलब्ध नहीं · ${first?.label ?? ""} → ${last?.label ?? ""}`
                : `Reference range not reported · ${first?.label ?? ""} → ${last?.label ?? ""}`}
        </p>

        <div className="mt-5 grid gap-3 md:grid-cols-2">
          <div className={`rounded-2xl border p-4 ${movingAway ? "border-rose-200 bg-rose-50" : "border-emerald-200 bg-emerald-50"}`}>
            <p className="flex items-center gap-2 text-xs font-extrabold uppercase tracking-widest text-slate-500">
              {movingAway ? <CircleAlert className="h-4 w-4 text-rose-600" /> : <CheckCircle2 className="h-4 w-4 text-emerald-600" />}
              {t("trends.whatChanged")}
            </p>
            <p className={`mt-2 text-base font-extrabold ${movingAway ? "text-rose-800" : "text-emerald-800"}`}>{changeHead}</p>
            <p className="mt-1 text-sm font-bold text-slate-600">{changeSub}</p>
            <div className="mt-3"><ListenBtn compact text={`${changeHead} ${changeSub}`} /></div>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <p className="text-xs font-extrabold uppercase tracking-widest text-slate-500">{t("trends.whyMatters")}</p>
            <p className="mt-2 text-sm font-semibold leading-relaxed text-slate-600">{t("trends.whyText")}</p>
            {points.length > 1 && <p className="mt-2 text-xs font-bold text-slate-400">Change: {change > 0 ? "+" : ""}{change} {def.unit}</p>}
          </div>
        </div>
      </motion.div>

      {/* report timeline compare */}
      <section className="mt-10">
        <SectionTitle icon={CalendarDays} title={t("trends.timeline")} sub={hi ? "समय के साथ आपकी saved रिपोर्ट्स" : "Your saved laboratory reports in date order"} />
        <div className="card-shadow rounded-[2rem] border border-slate-100 bg-white p-5 sm:p-7 md:p-8">
          <div className="relative ml-4 space-y-6 border-l-[3px] border-dashed border-brand-200 pl-6 sm:ml-6 sm:space-y-7 sm:pl-8">
            {[...reports].reverse().map((report, index) => {
              const isLatest = index === 0;
              const warn = report.attention > 0;
              const previous = [...reports].reverse()[index + 1];
              const keyTests = report.entries.slice(0, 6);
              return (
                <motion.div key={report.id} initial={{ opacity: 0, x: -12 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }} transition={{ delay: index * 0.08 }} className="relative">
                  <span className={`absolute -left-[39px] top-1.5 flex h-9 w-9 items-center justify-center rounded-2xl border-4 border-white text-xs font-black text-white shadow-md sm:-left-[47px] sm:h-10 sm:w-10 ${isLatest ? "bg-brand-700 ring-4 ring-brand-100" : warn ? "bg-amber-500 ring-2 ring-amber-100" : "bg-emerald-500 ring-2 ring-emerald-100"}`}>
                    {isLatest ? <Sparkles className="h-4 w-4" /> : <GitCommitVertical className="h-4 w-4" />}
                  </span>
                  <div className={`card-shadow rounded-3xl border-2 p-5 transition-all hover:border-brand-300 sm:p-6 ${isLatest ? "border-brand-200 bg-gradient-to-br from-brand-50/50 via-white to-white" : "border-slate-100 bg-white"}`}>
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="text-base font-extrabold text-brand-950 sm:text-lg">{pick(report.date, s.lang)}</h3>
                          {isLatest && <span className="rounded-full bg-brand-700 px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wider text-white">{t("reports.latest")}</span>}
                          <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-bold text-slate-500">{report.testsCount} {t("reports.tests")}</span>
                        </div>
                        <p className="mt-1 text-xs font-semibold text-slate-500">{warn ? <span className="font-extrabold text-amber-700">⚠ {report.attention} {t("reports.needAttention")}</span> : <span className="font-extrabold text-emerald-700">✓ {t("reports.allWithin")}</span>}</p>
                      </div>
                      {previous && (
                        <Link href={`/compare?old=${previous.id}&new=${report.id}`} className="inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-full bg-brand-100/90 px-4 py-2 text-xs font-extrabold text-brand-800 hover:bg-brand-200">
                          {hi ? "तुलना करें" : "Compare reports"}<ChevronRight className="h-3.5 w-3.5" />
                        </Link>
                      )}
                    </div>
                    <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3">
                      {keyTests.map((entry) => {
                        const entryDef = resolveTestDef(entry.test, catalog, entry);
                        if (!entryDef) return null;
                        return <span key={entry.test} className="inline-flex items-center gap-1.5 rounded-xl bg-slate-50 px-3 py-1.5 text-xs font-extrabold text-slate-700 ring-1 ring-slate-100"><TestIcon testId={entry.test} size={18} />{pick(entryDef.name, s.lang)}: <span className="tabular">{fmtValue(entry.value)} {entryDef.unit}</span></span>;
                      })}
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </div>
      </section>

      <div className="mt-8 flex items-center gap-2 text-sm font-semibold text-slate-500">
        <ArrowRight className="h-4 w-4 text-brand-500" />
        {hi ? "हर रुझान केवल आपकी saved रिपोर्ट्स से बनाया गया है।" : "Every trend above is calculated only from your saved reports."}
      </div>
    </AppShell>
  );
}

export default function TrendsPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-slate-500">Loading trends...</div>}>
      <TrendsPageContent />
    </Suspense>
  );
}

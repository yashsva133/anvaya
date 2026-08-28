"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, BookOpen, FileText } from "lucide-react";
import { AppShell } from "@/components/shell";
import { SectionTitle, TestIcon, StatusPill } from "@/components/core";
import { OverviewSummaryCard } from "@/components/summary-card";
import { useReportData } from "@/context/ReportDataContext";
import { useI18n, pick } from "@/lib/i18n";
import { resolveTestDef, fmtValue, reportStatusKnown } from "@/lib/data";

export default function ReportPage() {
  const { id } = useParams() as { id: string };
  const router = useRouter();
  const { s, t } = useI18n();
  const { reports, catalog } = useReportData();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  if (!mounted) return <AppShell><div /></AppShell>;

  const report = reports.find((r) => r.id === id);

  if (!report) {
    return (
      <AppShell>
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <FileText className="h-16 w-16 text-slate-200 mb-4" />
          <h1 className="text-2xl font-bold text-slate-800">Report Not Found</h1>
          <p className="text-slate-500 mt-2">The report you are looking for does not exist or was deleted.</p>
          <button
            onClick={() => router.push("/reports")}
            className="mt-6 px-6 py-2.5 bg-brand-700 text-white font-bold rounded-xl shadow hover:bg-brand-600 transition"
          >
            Back to My Reports
          </button>
        </div>
      </AppShell>
    );
  }

  const criticalEntries = report.entries.filter((e) => reportStatusKnown(e) && ["critical", "high", "low"].includes(e.status));
  const borderlineEntries = report.entries.filter((e) => reportStatusKnown(e) && e.status === "borderline");
  const normalEntries = report.entries.filter((e) => !reportStatusKnown(e) || e.status === "normal");

  const renderGroup = (title: string, entries: typeof report.entries) => {
    if (entries.length === 0) return null;
    return (
      <div className="mb-8">
        <h2 className="text-xl font-bold text-slate-800 mb-4">{title}</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {entries.map((e, index) => {
            const def = resolveTestDef(e.test, catalog, e);
            const known = reportStatusKnown(e);
            return (
              <div
                key={`${e.test}-${index}`}
                className={`group flex items-center justify-between gap-3 rounded-2xl border p-4 transition-all hover:-translate-y-0.5 hover:shadow-md ${
                  e.status !== "normal" && known
                    ? "border-amber-200 bg-amber-50/30 hover:border-amber-300"
                    : "border-slate-100 bg-white hover:border-brand-200"
                }`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <Link
                    href={`/trends?test=${e.test}`}
                    className="shrink-0 transition-transform hover:scale-110 cursor-pointer z-10"
                    title={s.lang === "hi" ? "रुझान देखें" : "View Trends"}
                  >
                    <TestIcon testId={e.test} size={44} />
                  </Link>
                  <Link href={`/test/${e.test}`} className="min-w-0 flex-1 group-hover:opacity-80">
                    <p className="font-extrabold text-slate-800 text-[15px] leading-tight truncate">
                      {pick(def.name, s.lang)}
                    </p>
                    <p className="text-xs font-bold text-slate-400 mt-0.5 truncate">
                      {def.ref.text}
                    </p>
                  </Link>
                </div>

                <Link href={`/test/${e.test}`} className="flex flex-col items-end gap-1.5 shrink-0 group-hover:opacity-80">
                  <StatusPill status={e.status} known={known} size="sm" />
                  <div className="text-right flex items-baseline gap-1">
                    <span className="tabular text-xl font-extrabold text-slate-700">
                      {fmtValue(e.value)}
                    </span>
                    <span className="text-[10px] font-bold text-slate-400">
                      {def.unit}
                    </span>
                  </div>
                </Link>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <AppShell>
      <div className="mb-6 flex items-center">
        <button
          onClick={() => router.push("/reports")}
          className="flex items-center gap-2 text-brand-700 hover:text-brand-800 transition font-bold"
        >
          <ArrowLeft className="h-5 w-5" />
          {s.lang === "hi" ? "वापस जाएँ" : "Back to My Reports"}
        </button>
      </div>

      <div className="mb-8 card-shadow rounded-[2rem] bg-gradient-to-br from-brand-600 to-brand-800 p-8 text-white relative overflow-hidden">
        <div className="relative z-10">
          <div className="flex items-center gap-3 mb-2">
            <div className="bg-white/20 p-2 rounded-xl">
              <FileText className="h-6 w-6 text-white" />
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
              {s.lang === "hi" ? "रिपोर्ट:" : "Report:"} {pick(report.date, s.lang)}
            </h1>
          </div>
          <p className="text-brand-100 font-medium">
            {report.entries.length} {t("reports.tests")} analyzed.
          </p>
        </div>
        <div className="absolute -right-6 -top-6 text-brand-500/30 opacity-50">
          <BookOpen className="h-40 w-40" />
        </div>
      </div>

      <section className="mb-8">
        <OverviewSummaryCard reportId={id} />
      </section>

      <section className="mt-8">
        {renderGroup(s.lang === "hi" ? "गंभीर और सीमा से बाहर" : "Critical & Out of Range", criticalEntries)}
        {renderGroup(s.lang === "hi" ? "सीमा के पास (बॉर्डरलाइन)" : "Near Limit (Borderline)", borderlineEntries)}
        {renderGroup(s.lang === "hi" ? "सामान्य" : "Normal", normalEntries)}
      </section>
    </AppShell>
  );
}

"use client";

// Screen — report history with expandable detail and comparison entry point.
// Connected to dynamic Supabase & local report data.

import { useState } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import {
  CalendarDays,
  ChevronDown,
  FileText,
  FolderOpen,
  GitCompareArrows,
  Sparkles,
  Trash2,
  UploadCloud,
} from "lucide-react";
import { AppShell } from "@/components/shell";
import {
  SectionTitle,
  StatusPill,
  TestIcon,
  useToast,
} from "@/components/core";
import { useI18n, pick } from "@/lib/i18n";
import { fmtValue, reportStatusKnown, resolveTestDef } from "@/lib/data";
import { useReportData } from "@/context/ReportDataContext";

export default function ReportsPage() {
  const { t, s } = useI18n();
  const toast = useToast();
  const { reports, catalog, deleteReport } = useReportData();
  const [open, setOpen] = useState<string | null>(reports[reports.length - 1]?.id ?? null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const latest = reports[reports.length - 1] || reports[0];
  const hi = s.lang === "hi";

  const handleDelete = async (reportId: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setDeletingId(reportId);
    await deleteReport(reportId);
    setDeletingId(null);
    toast(hi ? "रिपोर्ट सफलतापूर्वक हटा दी गई" : "Report deleted successfully", "info");
  };

  return (
    <AppShell>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <SectionTitle
          icon={FolderOpen}
          title={t("reports.title")}
          sub={`${reports.length} ${hi ? "रिपोर्ट्स" : "reports"}`}
        />
        <div className="flex gap-2">
          <Link
            href="/compare"
            className="inline-flex min-h-12 items-center gap-2 rounded-2xl bg-brand-700 px-5 text-sm font-extrabold text-white shadow-md transition hover:bg-brand-600 active:scale-95"
          >
            <GitCompareArrows className="h-5 w-5" />
            {t("reports.compare")}
          </Link>
          <Link
            href="/upload"
            aria-label="Upload"
            className="inline-flex min-h-12 w-12 items-center justify-center rounded-2xl border-2 border-slate-200 bg-white text-slate-600 transition hover:border-brand-300 active:scale-95"
          >
            <UploadCloud className="h-5 w-5" />
          </Link>
        </div>
      </div>

      <div className="mt-6 space-y-4">
        <AnimatePresence mode="popLayout">
          {reports.length === 0 ? (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="flex flex-col items-center justify-center rounded-3xl border-2 border-dashed border-slate-200 bg-white p-12 text-center"
            >
              <FolderOpen className="h-12 w-12 text-slate-300 mb-3" />
              <p className="text-lg font-extrabold text-brand-950">
                {hi ? "कोई रिपोर्ट नहीं मिली" : "No reports found"}
              </p>
              <p className="mt-1 text-sm font-semibold text-slate-400">
                {hi ? "अपनी पहली लैब रिपोर्ट अपलोड करें।" : "Upload your first lab report to get started."}
              </p>
              <Link
                href="/upload"
                className="mt-5 inline-flex min-h-12 items-center gap-2 rounded-2xl bg-brand-700 px-6 text-sm font-extrabold text-white shadow-md transition hover:bg-brand-600"
              >
                <UploadCloud className="h-5 w-5" />
                {t("upload.title")}
              </Link>
            </motion.div>
          ) : (
            [...reports].reverse().map((r, idx) => {
              const isLatest = r.id === latest?.id;
              const warn = r.attention > 0;
              const expanded = open === r.id;
              const isDeleting = deletingId === r.id;

              return (
                <motion.div
                  key={r.id}
                  layout
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: isDeleting ? 0.4 : 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95, height: 0 }}
                  transition={{ duration: 0.2 }}
                  className={`card-shadow overflow-hidden rounded-3xl border-2 bg-white transition-all ${
                    isLatest ? "border-brand-300" : "border-slate-100"
                  }`}
                >
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => setOpen(expanded ? null : r.id)}
                    onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && setOpen(expanded ? null : r.id)}
                    aria-expanded={expanded}
                    className="flex w-full flex-wrap items-center gap-4 p-5 text-left transition hover:bg-slate-50/60 cursor-pointer"
                  >
                    <span
                      className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ${
                        isLatest ? "bg-brand-700 text-white shadow-md shadow-brand-900/20" : "bg-brand-50 text-brand-700"
                      }`}
                    >
                      <FileText className="h-6 w-6" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-lg font-extrabold text-brand-950">
                          {pick(r.date, s.lang)}
                        </p>
                        {isLatest && (
                          <span className="rounded-full bg-brand-700 px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wide text-white">
                            {t("reports.latest")}
                          </span>
                        )}
                      </div>
                      <p className="mt-0.5 text-xs sm:text-sm font-bold text-slate-400">
                        <CalendarDays className="mr-1 inline h-3.5 w-3.5" />
                        {r.testsCount} {t("reports.tests")} ·{" "}
                        {warn ? (
                          <span className="text-amber-600 font-extrabold">
                            {r.attention} {t("reports.needAttention")}
                          </span>
                        ) : (
                          <span className="text-emerald-600 font-extrabold">{t("reports.allWithin")}</span>
                        )}
                      </p>
                    </div>

                    {/* mini status dots & action buttons */}
                    <div className="flex items-center gap-2.5 sm:gap-3">
                      <span className="hidden items-center gap-1.5 sm:flex">
                        {r.entries.slice(0, 8).map((e, i) => (
                          <span
                            key={`${e.test}-${i}`}
                            className={`h-2.5 w-2.5 rounded-full ${
                              e.status === "normal"
                                ? "bg-emerald-400"
                                : e.status === "borderline"
                                  ? "bg-amber-400"
                                  : "bg-rose-500"
                            }`}
                          />
                        ))}
                      </span>
                      <button
                        type="button"
                        onClick={(e) => handleDelete(r.id, e)}
                        title={hi ? "रिपोर्ट हटाएं" : "Delete report"}
                        aria-label={hi ? "रिपोर्ट हटाएं" : "Delete report"}
                        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-slate-200 text-slate-400 transition hover:border-rose-300 hover:bg-rose-50 hover:text-rose-600 active:scale-95"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-500 transition group-hover:bg-slate-200">
                        <ChevronDown
                          className={`h-5 w-5 transition-transform duration-200 ${expanded ? "rotate-180" : ""}`}
                        />
                      </div>
                    </div>
                  </div>

                  {expanded && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      className="border-t border-dashed border-slate-200 bg-slate-50/40 p-4 sm:p-6"
                    >
                      <div className="grid gap-2.5 sm:gap-3 grid-cols-1 md:grid-cols-2">
                        {r.entries.map((e, i) => {
                          const def = resolveTestDef(e.test, catalog, e);
                          if (!def) return null;
                          const notNormal = e.status !== "normal";
                          return (
                            <Link
                              key={`${e.test}-${i}`}
                              href={`/test/${e.test}`}
                              className={`group flex items-center justify-between gap-3 rounded-2xl border p-3 sm:p-3.5 transition-all hover:-translate-y-0.5 hover:shadow-md ${
                                notNormal
                                  ? "border-amber-200 bg-amber-50/30 hover:border-amber-300 hover:bg-amber-50/60"
                                  : "border-slate-100 bg-white hover:border-brand-200 hover:bg-brand-50/30"
                              }`}
                            >
                              <div className="flex items-center gap-3 min-w-0">
                                <TestIcon testId={e.test} size={40} className="shrink-0" />
                                <div className="min-w-0">
                                  <p className="font-extrabold text-slate-800 text-sm sm:text-[15px] leading-tight">
                                    {pick(def.name, s.lang)}
                                  </p>
                                  <p className="text-[11px] font-bold text-slate-400 mt-0.5">
                                    {def.ref.text}
                                  </p>
                                </div>
                              </div>

                              <div className="flex items-center gap-2.5 shrink-0">
                                <div className="text-right">
                                  <p className="tabular font-extrabold text-brand-950 text-base sm:text-lg leading-none">
                                    {fmtValue(e.value)}
                                  </p>
                                  <p className="text-[10px] font-bold text-slate-400 mt-0.5">{def.unit}</p>
                                </div>
                                <StatusPill status={e.status} known={reportStatusKnown(e)} size="sm" />
                              </div>
                            </Link>
                          );
                        })}
                      </div>

                      <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-slate-200/60 pt-4">
                        <p className="text-xs font-semibold text-slate-500">
                          {hi ? "किसी भी जाँच पर टैप करके विस्तृत व्याख्या और रुझान देखें।" : "Tap any test to see detailed explanations and trends."}
                        </p>
                        <div className="flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            onClick={(e) => handleDelete(r.id, e)}
                            className="inline-flex min-h-11 items-center gap-1.5 rounded-2xl border border-rose-200 bg-rose-50 px-4 text-xs font-extrabold text-rose-700 transition hover:border-rose-300 hover:bg-rose-100 active:scale-95"
                          >
                            <Trash2 className="h-4 w-4" />
                            {hi ? "हटाएं" : "Delete"}
                          </button>
                          {isLatest ? (
                            <Link
                              href="/dashboard"
                              className="inline-flex min-h-11 items-center gap-2 rounded-2xl bg-brand-700 px-5 text-sm font-extrabold text-white shadow-sm transition hover:bg-brand-600 active:scale-95"
                            >
                              <Sparkles className="h-4 w-4" />
                              {t("reports.open")}
                            </Link>
                          ) : (
                            <Link
                              href={`/compare?old=${r.id}&new=${latest?.id ?? ""}`}
                              className="inline-flex min-h-11 items-center gap-2 rounded-2xl border-2 border-brand-200 bg-white px-5 text-sm font-extrabold text-brand-700 transition hover:border-brand-400 active:scale-95"
                            >
                              <GitCompareArrows className="h-4 w-4" />
                              {hi ? "नवीनतम से तुलना करें" : "Compare with latest"}
                            </Link>
                          )}
                        </div>
                      </div>
                    </motion.div>
                  )}
                </motion.div>
              );
            })
          )}
        </AnimatePresence>
      </div>
    </AppShell>
  );
}

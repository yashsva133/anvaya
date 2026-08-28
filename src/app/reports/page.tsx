"use client";

// Screen — report history with expandable detail and comparison entry point.
// Connected to dynamic Supabase & local report data.

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  CalendarDays,
  ChevronDown,
  ArrowRight,
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
import { fmtValue, reportStatusKnown, resolveTestDef, TESTS } from "@/lib/data";
import { useReportData } from "@/context/ReportDataContext";

export default function ReportsPage() {
  const { t, s } = useI18n();
  const toast = useToast();
  const { reports, catalog, deleteReport } = useReportData();
  const [open, setOpen] = useState<string | null>(reports[reports.length - 1]?.id ?? null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const latest = reports[reports.length - 1] || reports[0];
  const hi = s.lang === "hi";
  const router = useRouter();

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
                    onClick={() => router.push(`/report/${r.id}`)}
                    onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && router.push(`/report/${r.id}`)}
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
                        <ArrowRight className="h-5 w-5" />
                      </div>
                    </div>
                  </div>
                </motion.div>
              );
            })
          )}
        </AnimatePresence>
      </div>
    </AppShell>
  );
}

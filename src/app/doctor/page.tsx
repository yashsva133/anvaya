"use client";

// Screen 11 — doctor-friendly clinical summary (printable).
// Connected to dynamic Supabase & local report data.

import Link from "next/link";
import { motion } from "framer-motion";
import {
  BookMarked,
  Download,
  Printer,
  Send,
  Stethoscope,
  UploadCloud,
} from "lucide-react";
import { AppShell } from "@/components/shell";
import { SectionTitle, StatusPill, TrendDirIcon, useToast } from "@/components/core";
import { useI18n, pick } from "@/lib/i18n";
import {
  SOURCES,
  fmtValue,
  reportStatusKnown,
  resolveTestDef,
} from "@/lib/data";
import { useReportData } from "@/context/ReportDataContext";

export default function DoctorPage() {
  const { t, s } = useI18n();
  const toast = useToast();
  const { activeReport, patient, reports, catalog } = useReportData();

  const report = activeReport;
  const activeIndex = reports.findIndex((item) => item.id === report.id);
  const prevReport = activeIndex > 0 ? reports[activeIndex - 1] : undefined;

  if (report.entries.length === 0) {
    return (
      <AppShell>
        <SectionTitle icon={Stethoscope} title={t("doctor.title")} sub={s.lang === "hi" ? "रिपोर्ट मिलने के बाद डॉक्टर के लिए सारांश यहाँ बनेगा।" : "A doctor-ready summary will appear after you save a report."} />
        <section className="card-shadow mt-5 rounded-[2rem] border-2 border-dashed border-brand-200 bg-white p-8 text-center">
          <h1 className="text-2xl font-extrabold text-brand-950">{s.lang === "hi" ? "अभी कोई रिपोर्ट नहीं है" : "No report to summarise yet"}</h1>
          <p className="mx-auto mt-3 max-w-md text-sm font-semibold leading-relaxed text-slate-500">{s.lang === "hi" ? "अपनी लैब रिपोर्ट अपलोड या स्कैन करें।" : "Upload or scan a laboratory report before creating a doctor summary."}</p>
          <Link href="/upload" className="mt-5 inline-flex min-h-12 items-center gap-2 rounded-2xl bg-brand-700 px-6 text-sm font-extrabold text-white hover:bg-brand-600"><UploadCloud className="h-5 w-5" />{s.lang === "hi" ? "रिपोर्ट अपलोड करें" : "Upload report"}</Link>
        </section>
      </AppShell>
    );
  }

  const abnormal = report.entries.filter((entry) => reportStatusKnown(entry) && entry.status !== "normal");
  const unassessed = report.entries.filter((entry) => !reportStatusKnown(entry));
  const observations = abnormal.length > 0
    ? abnormal.slice(0, 3).map((entry) => {
        const def = resolveTestDef(entry.test, catalog, entry);
        return def
          ? `${def.name.en}: ${fmtValue(entry.value)} ${def.unit}, marked ${entry.status} against ${def.ref.text}.`
          : `${entry.test}: ${fmtValue(entry.value)}, marked ${entry.status}.`;
      })
    : unassessed.length > 0
      ? [s.lang === "hi" ? `${unassessed.length} परिणामों की संदर्भ सीमा उपलब्ध नहीं है; उन्हें वर्गीकृत नहीं किया गया।` : `${unassessed.length} result${unassessed.length === 1 ? " has" : "s have"} no reported reference range and was not classified.`]
      : [s.lang === "hi" ? "इस रिपोर्ट में कोई परिणाम सामान्य सीमा से बाहर नहीं है।" : "No result in this report is marked outside its reference range."];

  return (
    <AppShell>
      <SectionTitle
        icon={Stethoscope}
        title={t("doctor.title")}
        sub={s.lang === "hi" ? "क्लिनिकल-शैली का सारांश — अपने डॉक्टर को दिखाएँ।" : "A clinician-style view to share with your doctor."}
      />

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="card-lift overflow-hidden rounded-[2rem] border border-slate-200 bg-white"
      >
        {/* header */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 bg-brand-900 px-6 py-5 text-white md:px-8">
          <div>
            <p className="text-[10px] font-extrabold uppercase tracking-[0.2em] text-mint-300">
              RxAnvaya · {s.lang === "hi" ? "रोगी लैब सारांश" : "Patient lab summary"}
            </p>
            <p className="mt-1 text-xl font-extrabold md:text-2xl">{patient.nameShort || (s.lang === "hi" ? "आपकी रिपोर्ट" : "Your report")}</p>
          </div>
          <div className="text-right text-sm font-bold text-white/80">
            {patient.age > 0 && <p>{patient.age} · {pick(patient.gender, s.lang)}</p>}
            {report.date.en && <p>{s.lang === "hi" ? "रिपोर्ट तिथि" : "Report date"}: {pick(report.date, s.lang)}</p>}
          </div>
        </div>

        <div className="p-6 md:p-8">
          {/* significant table */}
          <p className="text-xs font-extrabold uppercase tracking-widest text-slate-400">
            {t("doctor.significant")}
          </p>
          <div className="mt-3 overflow-x-auto rounded-2xl border border-slate-200">
            <table className="w-full min-w-[560px] text-left text-sm">
              <thead>
                <tr className="bg-slate-50 text-[11px] font-extrabold uppercase tracking-wider text-slate-500">
                  <th className="px-4 py-3">{t("doctor.test")}</th>
                  <th className="px-4 py-3 text-right">{t("doctor.result")}</th>
                  <th className="px-4 py-3">{t("doctor.reference")}</th>
                  <th className="px-4 py-3">{t("doctor.status")}</th>
                  <th className="px-4 py-3 text-center">{t("doctor.trend")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {report.entries.map((e) => {
                  const id = e.test;
                  const def = resolveTestDef(id, catalog, e);
                  const prev = prevReport?.entries.find((x) => x.test === id)?.value;
                  const dir =
                    prev == null ? "flat" : e.value > prev ? "up" : e.value < prev ? "down" : "flat";
                  return (
                    <tr key={id} className="font-semibold text-slate-700">
                      <td className="px-4 py-3 font-extrabold text-slate-800">
                        {def?.name.en ?? id}
                      </td>
                      <td className="tabular px-4 py-3 text-right font-extrabold text-brand-900">
                        {fmtValue(e.value)}{def?.unit ? ` ${def.unit}` : ""}
                      </td>
                      <td className="tabular px-4 py-3 text-slate-500">{def?.ref.text ?? "—"}</td>
                      <td className="px-4 py-3">
                        <StatusPill status={e.status} known={reportStatusKnown(e)} size="sm" />
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`mx-auto flex h-8 w-8 items-center justify-center rounded-full ${
                            dir === "flat"
                              ? "bg-slate-100 text-slate-400"
                              : "bg-rose-50 text-rose-600"
                          }`}
                        >
                          <TrendDirIcon dir={dir} className="h-4 w-4" />
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* observations */}
          <p className="mt-7 text-xs font-extrabold uppercase tracking-widest text-slate-400">
            {t("doctor.obs")}
          </p>
          <ol className="mt-3 space-y-2.5">
            {observations.map((observation, i) => (
              <li key={`${observation}-${i}`} className="flex items-start gap-3">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-100 text-xs font-extrabold text-brand-800">
                  {i + 1}
                </span>
                <p className="text-[15px] font-semibold leading-relaxed text-slate-700">{observation}</p>
              </li>
            ))}
          </ol>

          {/* sources */}
          <p className="mt-7 flex items-center gap-2 text-xs font-extrabold uppercase tracking-widest text-slate-400">
            <BookMarked className="h-4 w-4" />
            {t("common.sources")}
          </p>
          <ul className="mt-2 space-y-1.5 text-sm font-semibold text-slate-600">
            {SOURCES.map((src) => (
              <li key={src.id} className="flex items-baseline gap-2">
                <span className="text-mint-600">•</span>
                <span>
                  {src.title} — <span className="text-slate-400">{src.publisher}</span>
                </span>
              </li>
            ))}
          </ul>

          {/* disclaimer */}
          <p className="mt-7 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-800">
            {t("doctor.disclaimer")}
          </p>

          {/* actions */}
          <div className="print:hidden mt-6 flex flex-wrap gap-3">
            <button
              onClick={() => {
                toast(t("doctor.pdfToast"), "info");
                setTimeout(() => window.print(), 350);
              }}
              className="inline-flex min-h-14 items-center gap-2 rounded-2xl bg-brand-700 px-6 text-base font-extrabold text-white shadow-md transition hover:bg-brand-600 active:scale-95"
            >
              <Download className="h-5 w-5" />
              {t("doctor.download")}
            </button>
            <button
              onClick={() => toast(t("doctor.shareToast"))}
              className="inline-flex min-h-14 items-center gap-2 rounded-2xl border-2 border-brand-200 bg-white px-6 text-base font-extrabold text-brand-700 transition hover:border-brand-400 active:scale-95"
            >
              <Send className="h-5 w-5" />
              {t("doctor.share")}
            </button>
            <button
              onClick={() => window.print()}
              aria-label="Print"
              className="inline-flex min-h-14 w-14 items-center justify-center rounded-2xl border-2 border-slate-200 bg-white text-slate-500 transition hover:border-brand-300 active:scale-95"
            >
              <Printer className="h-5 w-5" />
            </button>
          </div>
        </div>
      </motion.div>
    </AppShell>
  );
}

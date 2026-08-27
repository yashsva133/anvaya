"use client";

// Screen 11 — doctor-friendly clinical summary (printable).

import { motion } from "framer-motion";
import {
  BookMarked,
  Download,
  Printer,
  Send,
  Stethoscope,
} from "lucide-react";
import { AppShell } from "@/components/shell";
import { SectionTitle, StatusPill, TrendDirIcon, useToast } from "@/components/core";
import { useI18n, pick } from "@/lib/i18n";
import {
  LATEST,
  PATIENT,
  SOURCES,
  TESTS,
  fmtValue,
  getValue,
} from "@/lib/data";

const ROWS = ["hemoglobin", "hba1c", "ldl", "hdl", "glucose", "triglycerides"];

export default function DoctorPage() {
  const { t, s } = useI18n();
  const toast = useToast();

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
              Rxanvaya · {s.lang === "hi" ? "रोगी लैब सारांश" : "Patient lab summary"}
            </p>
            <p className="mt-1 text-xl font-extrabold md:text-2xl">{PATIENT.nameShort}</p>
          </div>
          <div className="text-right text-sm font-bold text-white/80">
            <p>
              {PATIENT.age} · {pick(PATIENT.gender, s.lang)}
            </p>
            <p>
              {s.lang === "hi" ? "रिपोर्ट तिथि" : "Report date"}: {pick(LATEST.date, s.lang)}
            </p>
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
                {ROWS.map((id) => {
                  const def = TESTS[id];
                  const e = LATEST.entries.find((x) => x.test === id);
                  if (!e) return null;
                  const prev = getValue("feb26", id);
                  const dir =
                    prev == null ? "flat" : e.value > prev ? "up" : e.value < prev ? "down" : "flat";
                  return (
                    <tr key={id} className="font-semibold text-slate-700">
                      <td className="px-4 py-3 font-extrabold text-slate-800">
                        {def.name.en}
                      </td>
                      <td className="tabular px-4 py-3 text-right font-extrabold text-brand-900">
                        {fmtValue(e.value)} {def.unit}
                      </td>
                      <td className="tabular px-4 py-3 text-slate-500">{def.ref.text}</td>
                      <td className="px-4 py-3">
                        <StatusPill status={e.status} size="sm" />
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
            {[t("doctor.obs1"), t("doctor.obs2"), t("doctor.obs3")].map((o, i) => (
              <li key={i} className="flex items-start gap-3">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-100 text-xs font-extrabold text-brand-800">
                  {i + 1}
                </span>
                <p className="text-[15px] font-semibold leading-relaxed text-slate-700">{o}</p>
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

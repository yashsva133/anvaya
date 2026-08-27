"use client";

// Screen 2 — Upload report. Camera-first for Indian paper-report reality.

import { useRef, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import {
  Camera,
  CloudUpload,
  Contrast,
  FileText,
  Keyboard,
  Lightbulb,
  ScanLine,
  SquareDashed,
  Sun,
  FileImage,
  Check,
} from "lucide-react";
import { FlowShell, FlowMic } from "@/components/shell";
import { useI18n } from "@/lib/i18n";
import { Sheet, useToast } from "@/components/core";
import { setStoredActiveReport, mapChartDataToEntries } from "@/lib/report-store";

const TIP_ICONS = [SquareDashed, Sun, Contrast, ScanLine];

const ANALYZE_STEPS = [
  { en: "Reading report", hi: "रिपोर्ट पढ़ी जा रही है" },
  { en: "Finding test values", hi: "परीक्षण मान ढूँढे जा रहे हैं" },
  { en: "Detecting reference ranges", hi: "सामान्य सीमा पहचानी जा रही है" },
  { en: "Understanding test names", hi: "परीक्षण नाम समझे जा रहे हैं" },
  { en: "Checking related results", hi: "संबंधित परिणाम जाँचे जा रहे हैं" },
];

export default function UploadPage() {
  const router = useRouter();
  const { s, t } = useI18n();
  const hi = s.lang === "hi";
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [manualOpen, setManualOpen] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [analyzeStep, setAnalyzeStep] = useState(0);

  const readFile = async (e?: React.ChangeEvent<HTMLInputElement> | any) => {
    let file = null;
    if (e && e.target && e.target.files) {
      file = e.target.files[0];
    } else if (fileRef.current && fileRef.current.files) {
      file = fileRef.current.files[0];
    }
    
    if (!file) {
      // Fallback for drag and drop without file or clicking dummy buttons
      toast(t("upload.scan") + "…", "info");
      setTimeout(() => router.push("/processing"), 900);
      return;
    }

    setIsUploading(true);
    setAnalyzeStep(0);
    
    // Start fake progression up to the second-to-last step
    const timers: ReturnType<typeof setTimeout>[] = [];
    ANALYZE_STEPS.slice(0, -1).forEach((_, i) => {
      timers.push(setTimeout(() => setAnalyzeStep((prev) => Math.max(prev, i + 1)), 1500 + i * 2000));
    });

    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await fetch("/api/process-report", {
        method: "POST",
        body: formData,
      });

      // Clear the fake progression timers
      timers.forEach(clearTimeout);

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast(err.error || "Failed to process report", "warn");
        setIsUploading(false);
        return;
      }

      // Complete the final step!
      setAnalyzeStep(ANALYZE_STEPS.length);

      const data = await res.json();
      
      setStoredActiveReport({
        id: `report-${Date.now()}`,
        date: { en: "27 Aug 2026", hi: "27 अगस्त 2026" },
        month: { en: "Aug", hi: "अग." },
        patient_summary: data.patient_summary,
        flagged_issues: data.flagged_issues,
        audio_script: data.audio_script,
        entries: mapChartDataToEntries(data.chart_data || []),
      });

      // Wait a tiny bit for the user to see the final checkmark before redirecting
      setTimeout(() => router.push("/processing"), 600);
    } catch (err: any) {
      timers.forEach(clearTimeout);
      setIsUploading(false);
      toast("Error processing report", "warn");
    }
  };

  const tips = [t("upload.tip1"), t("upload.tip2"), t("upload.tip3"), t("upload.tip4")];

  return (
    <FlowShell back="/welcome">
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
        <h1 className="text-center text-3xl font-extrabold tracking-tight text-brand-950">
          {t("upload.title")}
        </h1>
        <p className="mt-2 text-center text-sm font-semibold text-slate-500">
          {t("upload.sub")}
        </p>

        {/* ------------------------------ Drop zone ------------------------------ */}
        <motion.button
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          onClick={() => fileRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            readFile();
          }}
          className={`card-shadow mt-6 flex min-h-[180px] w-full flex-col items-center justify-center gap-3 rounded-3xl border-3 border-dashed bg-white p-6 text-center transition active:scale-[0.99] ${
            dragOver ? "border-mint-500 bg-mint-50" : "border-brand-200 hover:border-brand-400"
          }`}
          style={{ borderWidth: 2.5 }}
        >
          <span className="flex h-16 w-16 items-center justify-center rounded-full bg-brand-100 text-brand-700">
            <CloudUpload className="h-8 w-8" strokeWidth={2.2} />
          </span>
          <span className="text-lg font-extrabold text-brand-900">
            {t("upload.drag")}
          </span>
          <span className="text-xs font-bold text-slate-400">
            PDF · JPG · PNG · CSV
          </span>
        </motion.button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*,application/pdf"
          className="hidden"
          onChange={readFile}
        />

        {/* ------------------------------- Options row ------------------------------ */}
        <div className="mt-4 grid grid-cols-2 gap-3">
          <button
            onClick={() => router.push("/scan")}
            className="card-shadow flex min-h-[120px] flex-col items-center justify-center gap-2.5 rounded-3xl border-2 border-mint-600 bg-mint-600 p-4 text-white shadow-lg shadow-mint-600/25 transition hover:bg-mint-500 active:scale-[0.98]"
          >
            <Camera className="h-9 w-9" strokeWidth={2} />
            <span className="text-base font-extrabold">{t("upload.camera")}</span>
          </button>
          <button
            onClick={() => fileRef.current?.click()}
            className="card-shadow flex min-h-[120px] flex-col items-center justify-center gap-2.5 rounded-3xl border-2 border-slate-200 bg-white p-4 text-slate-700 transition hover:border-brand-300 active:scale-[0.98]"
          >
            <FileText className="h-9 w-9 text-brand-600" strokeWidth={2} />
            <span className="text-base font-extrabold">{t("upload.pdf")}</span>
          </button>
        </div>
        <button
          onClick={() => fileRef.current?.click()}
          className="mt-3 flex min-h-14 w-full items-center justify-center gap-2.5 rounded-3xl border-2 border-slate-200 bg-white px-4 text-sm font-extrabold text-slate-600 transition hover:border-brand-300 active:scale-[0.98]"
        >
          <FileImage className="h-5 w-5 text-brand-600" />
          CSV · {t("upload.manual").split(" ")[0]}…
        </button>
        <button
          onClick={() => setManualOpen(true)}
          className="mt-3 flex min-h-14 w-full items-center justify-center gap-2.5 rounded-3xl border-2 border-slate-200 bg-white px-4 text-sm font-extrabold text-slate-600 transition hover:border-brand-300 active:scale-[0.98]"
        >
          <Keyboard className="h-5 w-5 text-brand-600" />
          {t("upload.manual")}
        </button>

        {/* ------------------------------- Sample report ----------------------------- */}
        <div className="card-shadow mt-6 overflow-hidden rounded-3xl border border-slate-100 bg-white">
          <div className="flex items-center gap-4 p-4">
            <div className="relative h-20 w-16 shrink-0 overflow-hidden rounded-lg border border-slate-200 shadow-sm">
              <Image
                src="/images/sample-report.svg"
                alt="Sample laboratory report"
                fill
                className="object-cover object-top"
              />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-extrabold text-slate-800">
                Sample report — City Diagnostics
              </p>
              <p className="text-xs font-semibold text-slate-400">
                14 tests · CBC + Lipid + Sugar
              </p>
              <button
                onClick={() => router.push("/processing")}
                className="mt-2 min-h-10 rounded-full bg-brand-700 px-4 text-xs font-extrabold text-white transition hover:bg-brand-600 active:scale-95"
              >
                {t("upload.trySample")}
              </button>
            </div>
          </div>
        </div>

        {/* ---------------------------------- Tips --------------------------------- */}
        <div className="mt-6 rounded-3xl border border-amber-200 bg-amber-50 p-5">
          <p className="flex items-center gap-2 text-sm font-extrabold text-amber-800">
            <Lightbulb className="h-5 w-5" />
            {t("upload.tipsTitle")}
          </p>
          <ul className="mt-3 grid gap-2.5">
            {tips.map((tip, i) => {
              const Icon = TIP_ICONS[i];
              return (
                <li key={tip} className="flex items-center gap-3 text-sm font-bold text-amber-900/80">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-white text-amber-600 shadow-sm">
                    <Icon className="h-4 w-4" strokeWidth={2.4} />
                  </span>
                  {tip}
                </li>
              );
            })}
          </ul>
        </div>

        <button
          onClick={() => router.push("/scan")}
          className="mt-6 flex min-h-16 w-full items-center justify-center gap-2.5 rounded-3xl bg-brand-700 text-lg font-extrabold text-white shadow-lg shadow-brand-900/25 transition hover:bg-brand-600 active:scale-[0.98]"
        >
          <ScanLine className="h-6 w-6" />
          {t("upload.scan")}
        </button>
      </motion.div>

      {/* ------------------------------ Manual entry sheet ------------------------------ */}
      <Sheet open={manualOpen} onClose={() => setManualOpen(false)} title={t("upload.manual")}>
        <ManualEntry
          onDone={() => {
            setManualOpen(false);
            toast(t("extract.correctToast"));
            setTimeout(() => router.push("/extracted"), 700);
          }}
        />
      </Sheet>
      <FlowMic />
      
      {/* ------------------------------ Uploading overlay ------------------------------ */}
      <AnimatePresence>
        {isUploading && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-brand-950/85 p-6 backdrop-blur-sm"
          >
            <motion.span
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: "spring", stiffness: 260, damping: 16 }}
              className="flex h-20 w-20 items-center justify-center rounded-full bg-mint-500 text-white shadow-lg shadow-mint-500/40"
            >
              <Check className="h-10 w-10" strokeWidth={3} />
            </motion.span>
            <p className="mt-4 text-center text-lg font-extrabold text-white">
              {t("scan.success")}
            </p>
            <p className="mt-1 text-sm font-semibold text-white/60">
              {hi ? "आपकी रिपोर्ट समझी जा रही है…" : "Analyzing your report…"}
            </p>

            <ul className="mt-6 w-full max-w-xs space-y-2.5">
              {ANALYZE_STEPS.map((st, i) => {
                const done = analyzeStep > i;
                return (
                  <motion.li
                    key={st.en}
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.2 + i * 0.12 }}
                    className="flex items-center gap-3 text-sm font-bold"
                  >
                    <span
                      className={`flex h-6 w-6 items-center justify-center rounded-full transition ${
                        done ? "bg-mint-500 text-white" : "bg-white/15 text-white/40"
                      }`}
                    >
                      {done ? (
                        <Check className="h-3.5 w-3.5" strokeWidth={3.5} />
                      ) : (
                        <span className="h-1.5 w-1.5 rounded-full bg-current" />
                      )}
                    </span>
                    <span className={done ? "text-white" : "text-white/45"}>
                      {hi ? st.hi : st.en}
                    </span>
                  </motion.li>
                );
              })}
            </ul>
          </motion.div>
        )}
      </AnimatePresence>
    </FlowShell>
  );
}

function ManualEntry({ onDone }: { onDone: () => void }) {
  const { t } = useI18n();
  const [rows, setRows] = useState([
    { name: "Hemoglobin", value: "10.5" },
    { name: "HbA1c", value: "7.2" },
    { name: "LDL", value: "154" },
  ]);
  return (
    <div className="mt-3 space-y-3">
      {rows.map((r, i) => (
        <div key={i} className="flex items-center gap-2">
          <input
            value={r.name}
            onChange={(e) =>
              setRows((p) => p.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))
            }
            className="min-h-12 flex-1 rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm font-bold text-slate-700 outline-none focus:border-brand-400"
            placeholder="Test name"
          />
          <input
            value={r.value}
            inputMode="decimal"
            onChange={(e) =>
              setRows((p) => p.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)))
            }
            className="tabular min-h-12 w-24 rounded-2xl border border-slate-200 bg-slate-50 px-3 text-center text-sm font-bold text-slate-700 outline-none focus:border-brand-400"
            placeholder="Value"
          />
        </div>
      ))}
      <button
        onClick={() => setRows((p) => [...p, { name: "", value: "" }])}
        className="min-h-11 w-full rounded-2xl border border-dashed border-slate-300 text-sm font-extrabold text-slate-500 transition hover:border-brand-300"
      >
        + Add row
      </button>
      <button
        onClick={onDone}
        className="min-h-14 w-full rounded-2xl bg-mint-600 text-base font-extrabold text-white shadow-md transition hover:bg-mint-500 active:scale-[0.98]"
      >
        {t("common.continue")}
      </button>
    </div>
  );
}

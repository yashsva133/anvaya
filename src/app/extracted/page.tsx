"use client";

// Screen 4 — extraction confirmation with trusted "did we read this right?" step.
// Connected to Supabase save-report endpoint and active report state.

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { BadgeCheck, ChevronDown, Keyboard, PencilLine, ShieldQuestion } from "lucide-react";
import { FlowShell } from "@/components/shell";
import { useI18n, pick } from "@/lib/i18n";
import { Sheet, StatusPill, TestIcon, useToast } from "@/components/core";
import { LATEST, TESTS, fmtValue, type ReportEntry, type Status, type TestDef } from "@/lib/data";
import { setStoredActiveReport } from "@/lib/report-store";
import { useReportData } from "@/context/ReportDataContext";

const HEADLINE = ["hemoglobin", "hba1c", "ldl", "hdl", "glucose", "creatinine"];

function evaluateStatus(val: number, def: TestDef): Status {
  if (def.ref.low != null && val < def.ref.low) {
    if (def.ref.low - val > (def.ref.low * 0.4)) return "critical";
    return "low";
  }
  if (def.ref.high != null && val > def.ref.high) {
    if (val - def.ref.high > (def.ref.high * 0.5)) return "critical";
    return "high";
  }
  return "normal";
}

export default function ExtractedPage() {
  const router = useRouter();
  const { t, s } = useI18n();
  const toast = useToast();
  const { catalog, activeReport, refresh } = useReportData();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [editEntry, setEditEntry] = useState<ReportEntry | null>(null);
  const [editVal, setEditVal] = useState("");
  const [fixed, setFixed] = useState<Record<string, number>>({});

  useEffect(() => {
    const id = setTimeout(() => setLoading(false), 800);
    return () => clearTimeout(id);
  }, []);

  const baseEntries = activeReport?.entries?.length > 0 ? activeReport.entries : LATEST.entries;
  const visible = showAll ? baseEntries : baseEntries.filter((e) => HEADLINE.includes(e.test));

  const valueOf = (e: ReportEntry) => fixed[e.test] ?? e.value;

  return (
    <FlowShell>
      {loading ? (
        <div className="space-y-3 pt-4" aria-busy="true">
          <div className="skeleton h-9 w-2/3 rounded-xl" />
          {[...Array(5)].map((_, i) => (
            <div key={i} className="skeleton h-20 rounded-3xl" style={{ animationDelay: `${i * 0.1}s` }} />
          ))}
        </div>
      ) : (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
          <h1 className="text-center text-2xl font-extrabold tracking-tight text-brand-950 md:text-3xl">
            {t("extract.title")}
          </h1>
          <p className="mt-1.5 text-center text-sm font-semibold text-slate-500">
            {t("extract.subtitle")}
          </p>

          {/* trust question */}
          <div className="mt-5 flex items-center gap-3 rounded-3xl border-2 border-mint-200 bg-mint-50 p-4">
            <ShieldQuestion className="h-8 w-8 shrink-0 text-mint-700" />
            <p className="text-base font-extrabold text-mint-900">
              {t("extract.question")}
            </p>
          </div>

          {/* result cards */}
          <div className="mt-4 space-y-2.5">
            {visible.map((e, i) => {
              const val = valueOf(e);
              const def = catalog[e.test] || TESTS[e.test] || TESTS.hemoglobin;
              const currentStatus = fixed[e.test] != null ? evaluateStatus(val, def) : e.status;

              return (
                <motion.div
                  key={e.test}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.05 }}
                  className="card-shadow flex items-center gap-3.5 rounded-3xl border border-slate-100 bg-white p-4"
                >
                  <TestIcon testId={e.test} size={46} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[15px] font-extrabold text-slate-800">
                      {pick(def.name, s.lang)}
                    </p>
                    <p className="text-xs font-bold text-slate-400">
                      {def.ref.text} · {t("common.perReport")}
                    </p>
                    <div className="mt-1.5">
                      <StatusPill status={currentStatus} size="sm" />
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="tabular text-2xl font-extrabold text-brand-900">
                      {fmtValue(val)}
                    </p>
                    <p className="text-[11px] font-bold text-slate-400">{def.unit}</p>
                    <button
                      onClick={() => {
                        setEditEntry(e);
                        setEditVal(String(val));
                      }}
                      aria-label={t("extract.edit")}
                      className="mt-1.5 inline-flex min-h-9 items-center gap-1.5 rounded-full border border-slate-200 px-3 text-xs font-extrabold text-slate-500 transition hover:border-brand-300 hover:text-brand-700"
                    >
                      <PencilLine className="h-3.5 w-3.5" />
                      {t("extract.edit")}
                    </button>
                  </div>
                </motion.div>
              );
            })}
          </div>

          <button
            onClick={() => setShowAll((v) => !v)}
            className="mt-3 flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white text-sm font-extrabold text-slate-500 transition hover:text-brand-700"
          >
            {showAll ? t("extract.showLess") : t("extract.showAll")}
            <ChevronDown className={`h-4 w-4 transition ${showAll ? "rotate-180" : ""}`} />
          </button>

          {/* actions */}
          <div className="sticky bottom-4 mt-6 flex gap-3">
            <button
              disabled={saving}
              onClick={async () => {
                setSaving(true);
                const finalEntries: ReportEntry[] = baseEntries.map((e) => {
                  const val = valueOf(e);
                  const def = catalog[e.test] || TESTS[e.test] || TESTS.hemoglobin;
                  return {
                    ...e,
                    value: val,
                    status: evaluateStatus(val, def),
                  };
                });

                const chartData = finalEntries.map((e) => {
                  const def = catalog[e.test] || TESTS[e.test] || TESTS.hemoglobin;
                  return {
                    parameter: def.name.en,
                    value: e.value,
                    normal_min: def.ref.low ?? 0,
                    normal_max: def.ref.high ?? 100,
                    unit: def.unit,
                    status: e.status,
                  };
                });

                setStoredActiveReport({
                  id: `report-${Date.now()}`,
                  date: { en: "27 Aug 2026", hi: "27 अगस्त 2026" },
                  month: { en: "Aug", hi: "अग." },
                  entries: finalEntries,
                });

                try {
                  const res = await fetch("/api/save-report", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      collected_on: new Date().toISOString().split("T")[0],
                      lab_name: "City Diagnostics",
                      chart_data: chartData,
                    }),
                  });
                  const saveJson = await res.json().catch(() => ({}));
                  if (!res.ok || saveJson.savedToDb === false) {
                    console.warn("[EXTRACTED SAVE] DB Warning:", saveJson.error);
                    toast(saveJson.error ? `DB: ${saveJson.error}` : t("extract.correctToast"), "info");
                  } else {
                    toast(t("extract.correctToast"));
                    refresh();
                  }
                } catch (err: any) {
                  console.warn("Save report request completed with local store fallback:", err);
                  toast(t("extract.correctToast"));
                }

                setTimeout(() => {
                  setSaving(false);
                  router.push("/dashboard");
                }, 500);
              }}
              className="flex min-h-16 flex-1 items-center justify-center gap-2.5 rounded-3xl bg-mint-600 text-lg font-extrabold text-white shadow-lg shadow-mint-600/30 transition hover:bg-mint-500 active:scale-[0.98] disabled:opacity-75"
            >
              <BadgeCheck className="h-6 w-6" />
              {t("extract.correct")}
            </button>
            <button
              onClick={() => {
                setEditEntry(baseEntries[0]);
                setEditVal(String(valueOf(baseEntries[0])));
              }}
              aria-label={t("extract.edit")}
              className="flex min-h-16 w-16 items-center justify-center rounded-3xl border-2 border-slate-200 bg-white text-slate-500 transition hover:border-brand-300 hover:text-brand-700 active:scale-[0.98]"
            >
              <Keyboard className="h-6 w-6" />
            </button>
          </div>
        </motion.div>
      )}

      {/* edit sheet */}
      <Sheet
        open={!!editEntry}
        onClose={() => setEditEntry(null)}
        title={editEntry ? `${t("extract.edit")} — ${pick(TESTS[editEntry.test].name, s.lang)}` : ""}
      >
        {editEntry && (
          <div className="mt-2">
            <label className="text-xs font-extrabold uppercase tracking-wide text-slate-400">
              {t("doctor.result")} ({TESTS[editEntry.test].unit})
            </label>
            <input
              value={editVal}
              onChange={(e) => setEditVal(e.target.value)}
              inputMode="decimal"
              className="tabular mt-2 min-h-16 w-full rounded-2xl border-2 border-brand-200 bg-brand-50 px-4 text-center text-3xl font-extrabold text-brand-900 outline-none focus:border-brand-500"
            />
            <button
              onClick={() => {
                const v = parseFloat(editVal);
                if (!Number.isNaN(v)) {
                  setFixed((p) => ({ ...p, [editEntry.test]: v }));
                  toast(t("common.saved"));
                }
                setEditEntry(null);
              }}
              className="mt-4 min-h-14 w-full rounded-2xl bg-brand-700 text-base font-extrabold text-white transition hover:bg-brand-600 active:scale-[0.98]"
            >
              {t("common.done")}
            </button>
          </div>
        )}
      </Sheet>
    </FlowShell>
  );
}

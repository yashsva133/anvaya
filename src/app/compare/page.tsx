"use client";

// Screen — compare two reports side by side with plain-language summary.

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import {
  ArrowLeftRight,
  ArrowRight,
  GitCompareArrows,
  Sparkles,
} from "lucide-react";
import { AppShell } from "@/components/shell";
import {
  ListenBtn,
  SafetyNote,
  SectionTitle,
  StatusPill,
  TestIcon,
  TrendDirIcon,
} from "@/components/core";
import { useI18n, pick } from "@/lib/i18n";
import { REPORTS, TESTS, fmtValue, type Status } from "@/lib/data";

type Verdict = "improved" | "worsened" | "stable";

const HIGH_BAD = new Set(["hba1c", "ldl", "glucose", "triglycerides", "totalchol"]);

function verdict(testId: string, from: number, to: number): Verdict {
  const pct = Math.abs((to - from) / (from || 1));
  if (pct < 0.03) return "stable";
  const def = TESTS[testId];
  if (HIGH_BAD.has(testId)) return to > from ? "worsened" : "improved";
  if (def.ref.low != null && def.ref.high != null) {
    // both bounded: check movement toward range
    const wasOut = from < def.ref.low || from > def.ref.high;
    const nowOut = to < def.ref.low || to > def.ref.high;
    if (wasOut && !nowOut) return "improved";
    if (!wasOut && nowOut) return "worsened";
    return "stable";
  }
  if (def.ref.low != null) return to < from ? "worsened" : "improved";
  return "stable";
}

function CompareInner() {
  const params = useSearchParams();
  const { t, s } = useI18n();
  const hi = s.lang === "hi";
  const [oldId, setOldId] = useState(params.get("old") ?? "apr26");
  const [newId, setNewId] = useState(params.get("new") ?? "aug26");

  const oldR = REPORTS.find((r) => r.id === oldId) ?? REPORTS[1];
  const newR = REPORTS.find((r) => r.id === newId) ?? REPORTS[3];

  const shared = newR.entries
    .map((e) => {
      const prev = oldR.entries.find((x) => x.test === e.test);
      return prev ? { test: e.test, from: prev, to: e } : null;
    })
    .filter((x): x is NonNullable<typeof x> => !!x)
    .sort((a, b) => {
      const rank = (v: Verdict) => (v === "worsened" ? 0 : v === "improved" ? 1 : 2);
      return rank(verdict(a.test, a.from.value, a.to.value)) - rank(verdict(b.test, b.from.value, b.to.value));
    });

  const statusBadge = (st: Verdict) =>
    st === "worsened" ? (
      <span className="rounded-full bg-rose-100 px-3 py-1 text-xs font-extrabold text-rose-700">
        {t("compare.worsened")}
      </span>
    ) : st === "improved" ? (
      <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-extrabold text-emerald-700">
        {t("compare.improved")}
      </span>
    ) : (
      <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-extrabold text-slate-500">
        {t("compare.stable")}
      </span>
    );

  return (
    <AppShell>
      <SectionTitle
        icon={GitCompareArrows}
        title={t("compare.title")}
        sub={hi ? "दो रिपोर्ट चुनें और बदलाव देखें।" : "Pick two reports to see what changed."}
      />

      {/* pickers */}
      <div className="grid gap-4 md:grid-cols-[1fr_auto_1fr] md:items-center">
        {[
          { label: t("compare.older"), val: oldId, set: setOldId, other: newId },
          { label: t("compare.newer"), val: newId, set: setNewId, other: oldId },
        ].map((p) => (
          <div key={p.label} className="card-shadow rounded-3xl border border-slate-100 bg-white p-4">
            <p className="text-xs font-extrabold uppercase tracking-widest text-slate-400">
              {p.label}
            </p>
            <div className="mt-2 grid grid-cols-2 gap-2">
              {REPORTS.map((r) => (
                <button
                  key={r.id}
                  disabled={r.id === p.other}
                  onClick={() => p.set(r.id)}
                  className={`min-h-12 rounded-2xl border-2 px-3 text-sm font-extrabold transition active:scale-95 disabled:opacity-30 ${
                    p.val === r.id
                      ? "border-brand-700 bg-brand-700 text-white"
                      : "border-slate-200 bg-white text-slate-600 hover:border-brand-300"
                  }`}
                >
                  {pick(r.month, s.lang)} 2026
                </button>
              ))}
            </div>
          </div>
        ))}
        <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-brand-100 text-brand-700">
          <ArrowRight className="h-6 w-6 rotate-90 md:rotate-0" strokeWidth={2.6} />
        </span>
      </div>

      {/* AI summary */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="mt-6 flex flex-wrap items-center gap-4 rounded-3xl border-2 border-mint-200 bg-mint-50 p-5"
      >
        <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-mint-600 text-white">
          <Sparkles className="h-5 w-5" />
        </span>
        <p className="flex-1 text-[15px] font-bold leading-relaxed text-mint-900">
          {t("compare.summary")}
        </p>
        <ListenBtn compact text={t("compare.summary")} />
      </motion.div>

      {/* diff list */}
      <section className="mt-8">
        <SectionTitle icon={ArrowLeftRight} title={t("compare.whatChanged")} />
        <div className="space-y-2.5">
          {shared.map((row, i) => {
            const def = TESTS[row.test];
            const v = verdict(row.test, row.from.value, row.to.value);
            const dir = row.to.value > row.from.value ? "up" : row.to.value < row.from.value ? "down" : "flat";
            return (
              <motion.div
                key={row.test}
                initial={{ opacity: 0, y: 8 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: Math.min(i * 0.04, 0.4) }}
                className={`card-shadow flex flex-wrap items-center gap-3 rounded-3xl border bg-white p-4 ${
                  v === "worsened" ? "border-rose-200" : v === "improved" ? "border-emerald-200" : "border-slate-100"
                }`}
              >
                <TestIcon testId={row.test} size={44} />
                <div className="min-w-[130px] flex-1">
                  <p className="text-[15px] font-extrabold text-slate-800">
                    {pick(def.name, s.lang)}
                  </p>
                  <StatusPill status={row.to.status as Status} size="sm" />
                </div>
                <div className="tabular flex items-center gap-2 text-lg font-extrabold">
                  <span className="text-slate-400">{fmtValue(row.from.value)}</span>
                  <span
                    className={`flex h-8 w-8 items-center justify-center rounded-full ${
                      v === "worsened"
                        ? "bg-rose-100 text-rose-600"
                        : v === "improved"
                          ? "bg-emerald-100 text-emerald-600"
                          : "bg-slate-100 text-slate-400"
                    }`}
                  >
                    <TrendDirIcon dir={dir} className="h-4 w-4" />
                  </span>
                  <span className="text-brand-900">{fmtValue(row.to.value)}</span>
                  <span className="text-xs font-bold text-slate-400">{def.unit}</span>
                </div>
                {statusBadge(v)}
              </motion.div>
            );
          })}
        </div>
      </section>

      <div className="mt-10">
        <SafetyNote />
      </div>
    </AppShell>
  );
}

export default function ComparePage() {
  return (
    <Suspense>
      <CompareInner />
    </Suspense>
  );
}

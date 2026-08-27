"use client";

// Screen 7 — multi-test contextual insights + knowledge graph visualization.

import Link from "next/link";
import { motion } from "framer-motion";
import {
  ArrowDown,
  ArrowUpRight,
  BookOpenCheck,
  BrainCircuit,
  Plus,
} from "lucide-react";
import { AppShell } from "@/components/shell";
import {
  ConfBar,
  ListenBtn,
  SafetyNote,
  SectionTitle,
  TestIcon,
} from "@/components/core";
import { useI18n, pick } from "@/lib/i18n";
import { PATTERNS, SOURCES, TESTS } from "@/lib/data";

export default function InsightsPage() {
  const { t, s } = useI18n();
  return (
    <AppShell>
      <SectionTitle
        icon={BrainCircuit}
        title={t("insights.title")}
        sub={t("insights.sub")}
      />

      {/* pattern cards */}
      <div className="grid gap-6 lg:grid-cols-1">
        {PATTERNS.map((p, pi) => {
          const src = SOURCES.find((x) => x.id === p.source);
          const full = `${pick(p.title, s.lang)}. ${pick(p.expl, s.lang)} ${pick(p.risk, s.lang)} ${pick(p.disclaimer, s.lang)}`;
          return (
            <motion.section
              key={p.id}
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-60px" }}
              transition={{ delay: pi * 0.08 }}
              className="card-shadow overflow-hidden rounded-[2rem] border border-slate-100 bg-white"
            >
              <div className="border-b border-dashed border-violet-200 bg-gradient-to-r from-violet-50 to-white px-6 py-4">
                <p className="flex items-center gap-2 text-xs font-extrabold uppercase tracking-widest text-violet-600">
                  <BrainCircuit className="h-4 w-4" />
                  {t("insights.found")}
                </p>
              </div>

              <div className="p-6 md:p-7">
                {/* connected diagram */}
                <div className="flex flex-col items-center gap-3 md:flex-row md:justify-center">
                  <div className="flex flex-wrap items-center justify-center gap-2.5">
                    {p.nodes.map((n, i) => (
                      <span key={n.test} className="flex items-center gap-2.5">
                        <motion.span
                          initial={{ scale: 0.85, opacity: 0 }}
                          whileInView={{ scale: 1, opacity: 1 }}
                          viewport={{ once: true }}
                          transition={{ delay: 0.1 + i * 0.12 }}
                          className="card-shadow flex items-center gap-2.5 rounded-2xl border border-slate-100 bg-white px-4 py-3"
                        >
                          <TestIcon testId={n.test} size={40} />
                          <span>
                            <span className="flex items-center gap-1.5 text-sm font-extrabold text-slate-800">
                              {pick(TESTS[n.test].name, s.lang)}
                              {n.arrow === "up" && (
                                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-rose-100 text-rose-600">
                                  <ArrowUpRight className="h-3.5 w-3.5" strokeWidth={3} />
                                </span>
                              )}
                              {n.arrow === "down" && (
                                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-rose-100 text-rose-600">
                                  <ArrowDown className="h-3.5 w-3.5" strokeWidth={3} />
                                </span>
                              )}
                            </span>
                            {n.note && (
                              <span className="block text-[11px] font-bold text-slate-400">
                                {pick(n.note, s.lang)}
                              </span>
                            )}
                          </span>
                        </motion.span>
                        {i < p.nodes.length - 1 && (
                          <Plus className="h-5 w-5 shrink-0 text-violet-400" strokeWidth={3} />
                        )}
                      </span>
                    ))}
                  </div>

                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-violet-600 text-white shadow-lg shadow-violet-600/30 md:mx-2">
                    <ArrowDown className="h-5 w-5 rotate-0 md:-rotate-90" strokeWidth={3} />
                  </span>

                  <span className="rounded-2xl bg-violet-600 px-5 py-3 text-lg font-extrabold text-white shadow-lg shadow-violet-600/30">
                    {pick(p.title, s.lang)}
                  </span>
                </div>

                {/* explanation */}
                <p className="mx-auto mt-6 max-w-2xl text-center text-[15px] font-semibold leading-relaxed text-slate-600">
                  {pick(p.expl, s.lang)}
                </p>
                <p className="mx-auto mt-3 max-w-2xl rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-center text-sm font-bold text-amber-800">
                  {pick(p.risk, s.lang)}
                </p>
                <p className="mt-3 text-center text-xs font-extrabold uppercase tracking-wide text-slate-400">
                  {pick(p.disclaimer, s.lang)}
                </p>

                {/* evidence + confidence */}
                <div className="mt-6 grid gap-3 md:grid-cols-2">
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <p className="flex items-center gap-2 text-xs font-extrabold uppercase tracking-widest text-brand-600">
                      <BookOpenCheck className="h-4 w-4" />
                      {t("insights.whyWeSay")}
                    </p>
                    {src && (
                      <>
                        <p className="mt-2 text-sm font-extrabold text-slate-800">
                          {src.title}
                        </p>
                        <p className="text-xs font-bold text-slate-400">{src.publisher}</p>
                        <p className="mt-2 border-l-2 border-mint-300 pl-3 text-[13px] font-medium italic leading-relaxed text-slate-500">
                          “{pick(src.excerpt, s.lang)}”
                        </p>
                      </>
                    )}
                    <p className="mt-2 text-[11px] font-bold text-slate-400">
                      {t("insights.basedOn")}
                    </p>
                  </div>
                  <div className="space-y-3">
                    <ConfBar level={p.conf.level} pct={p.conf.pct} />
                    <ListenBtn text={full} className="w-full" />
                  </div>
                </div>
              </div>
            </motion.section>
          );
        })}
      </div>

      <div className="mt-10">
        <SafetyNote />
      </div>
    </AppShell>
  );
}

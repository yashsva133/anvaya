"use client";

// Screen 7 — multi-test contextual insights + knowledge graph visualization.

import Link from "next/link";
import { motion } from "framer-motion";
import {
  ArrowDown,
  ArrowUpRight,
  BookOpenCheck,
  BrainCircuit,
  Info,
  Plus,
  Workflow,
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
import { KG_CLUSTERS, PATTERNS, SOURCES, TESTS } from "@/lib/data";

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

      {/* knowledge graph */}
      <section className="mt-12">
        <SectionTitle
          icon={Workflow}
          title={s.lang === "hi" ? "AI का नॉलेज ग्राफ़" : "The AI knowledge graph"}
          sub={
            s.lang === "hi"
              ? "जाँचें अकेले नहीं, जुड़कर देखी जाती हैं — यही अंतर है।"
              : "Tests are connected, not isolated — that is the difference."
          }
        />
        <div className="grid gap-5 md:grid-cols-2">
          {KG_CLUSTERS.map((cluster) => (
            <div
              key={cluster.title.en}
              className="card-shadow rounded-[2rem] border border-slate-100 bg-white p-6"
            >
              <p className="text-sm font-extrabold text-slate-700">
                {pick(cluster.title, s.lang)}
              </p>
              <div className="relative mt-3 h-64 w-full">
                <svg className="absolute inset-0 h-full w-full" aria-hidden="true">
                  {cluster.edges.map(([a, b], i) => {
                    const A = cluster.nodes[a];
                    const B = cluster.nodes[b];
                    return (
                      <motion.line
                        key={i}
                        x1={`${A.x}%`}
                        y1={`${A.y}%`}
                        x2={`${B.x}%`}
                        y2={`${B.y}%`}
                        stroke={cluster.color}
                        strokeWidth="2"
                        strokeDasharray="5 6"
                        strokeOpacity="0.5"
                        initial={{ pathLength: 0, opacity: 0 }}
                        whileInView={{ pathLength: 1, opacity: 1 }}
                        viewport={{ once: true }}
                        transition={{ delay: i * 0.15, duration: 0.6 }}
                      />
                    );
                  })}
                </svg>
                {cluster.nodes.map((n, i) => (
                  <motion.div
                    key={n.test}
                    initial={{ scale: 0, opacity: 0 }}
                    whileInView={{ scale: 1, opacity: 1 }}
                    viewport={{ once: true }}
                    transition={{ delay: i * 0.1, type: "spring", stiffness: 240, damping: 14 }}
                    className="absolute -translate-x-1/2 -translate-y-1/2"
                    style={{ left: `${n.x}%`, top: `${n.y}%` }}
                  >
                    <Link
                      href={`/test/${n.test}`}
                      className="flex flex-col items-center gap-1.5"
                    >
                      <span
                        className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white shadow-lg ring-2 transition hover:scale-110"
                        style={{ ["--tw-ring-color" as string]: cluster.color }}
                      >
                        <TestIcon testId={n.test} size={40} />
                      </span>
                      <span className="rounded-full bg-slate-800/85 px-2.5 py-1 text-[10px] font-extrabold text-white">
                        {TESTS[n.test].name.en}
                      </span>
                    </Link>
                  </motion.div>
                ))}
              </div>
            </div>
          ))}
        </div>
        <p className="mt-4 flex items-start gap-2 text-sm font-semibold text-slate-500">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-brand-500" />
          {s.lang === "hi"
            ? "इन्हीं संबंधों की वजह से Rxअन्वय पैटर्न पा सकता है — एक संख्या पूरी कहानी नहीं होती।"
            : "These connections let Rxअन्वय find patterns — one number never tells the whole story."}
        </p>
      </section>

      <div className="mt-10">
        <SafetyNote />
      </div>
    </AppShell>
  );
}

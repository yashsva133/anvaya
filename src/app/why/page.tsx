"use client";

// Screen — competitor comparison + core differentiator (judge-facing demo). 

import Link from "next/link";
import { motion } from "framer-motion";
import {
  ArrowRight,
  Award,
  Check,
  LifeBuoy,
  Minus,
  Sparkles,
  X,
} from "lucide-react";
import { AppShell } from "@/components/shell";
import { SectionTitle } from "@/components/core";
import { useI18n, pick } from "@/lib/i18n";
import { COMPARE_ROWS } from "@/lib/data";

function Cell({ v, hero }: { v: string; hero?: boolean }) {
  if (v === "yes")
    return (
      <span
        className={`inline-flex h-9 w-9 items-center justify-center rounded-full ${
          hero ? "bg-mint-600 text-white" : "bg-emerald-100 text-emerald-600"
        }`}
      >
        <Check className="h-5 w-5" strokeWidth={3} />
      </span>
    );
  if (v === "no")
    return (
      <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-rose-100 text-rose-500">
        <X className="h-5 w-5" strokeWidth={3} />
      </span>
    );
  return (
    <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-amber-100 text-amber-500">
      <Minus className="h-5 w-5" strokeWidth={3} />
    </span>
  );
}

export default function WhyPage() {
  const { s } = useI18n();
  const hi = s.lang === "hi";

  return (
    <AppShell>
      <SectionTitle
        icon={LifeBuoy}
        title={hi ? "हमारा तरीक़ा अलग क्यों है" : "Why our approach is different"}
        sub={
          hi
            ? "फ़्लैग नहीं — समझ। नंबर नहीं — कहानी।"
            : "Not flags — understanding. Not numbers — the story."
        }
      />

      {/* differentiator strip */}
      <div className="mt-4 grid gap-4 md:grid-cols-3">
        {[
          {
            title: hi ? "मौजूदा सिस्टम" : "Existing systems",
            chain: hi ? ["संख्या", "फ़्लैग"] : ["Number", "Flag"],
            tone: "border-slate-200 bg-white",
            ok: false,
          },
          {
            title: hi ? "सामान्य AI" : "Generic AI",
            chain: hi ? ["संख्या", "टेक्स्ट"] : ["Number", "Text"],
            tone: "border-slate-200 bg-white",
            ok: false,
          },
          {
            title: "RxAnvaya",
            chain: hi
              ? ["रिपोर्ट", "समझो", "जोड़ो", "ट्रैक", "समझाओ", "उद्धरण", "पूछो"]
              : ["Report", "Understand", "Connect", "Track", "Explain", "Cite", "Ask"],
            tone: "border-mint-500 bg-gradient-to-br from-mint-50 to-white",
            ok: true,
          },
        ].map((c, i) => (
          <motion.div
            key={c.title}
            initial={{ opacity: 0, y: 14 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: i * 0.08 }}
            className={`card-shadow rounded-3xl border-2 p-6 ${c.tone}`}
          >
            <div className="flex items-center gap-2">
              <p
                className={`text-xs font-extrabold uppercase tracking-widest ${
                  c.ok ? "text-mint-700" : "text-slate-400"
                }`}
              >
                {c.title}
              </p>
              {c.ok && <Award className="h-4 w-4 text-mint-600" />}
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-1.5">
              {c.chain.map((x, j) => (
                <span key={x} className="flex items-center gap-1.5">
                  <span
                    className={`rounded-xl px-2.5 py-1.5 text-[13px] font-extrabold ${
                      c.ok
                        ? "bg-white text-mint-800 shadow-sm"
                        : "bg-slate-100 text-slate-600"
                    }`}
                  >
                    {x}
                  </span>
                  {j < c.chain.length - 1 && (
                    <ArrowRight className={`h-3.5 w-3.5 ${c.ok ? "text-mint-400" : "text-slate-300"}`} />
                  )}
                </span>
              ))}
            </div>
          </motion.div>
        ))}
      </div>

      {/* comparison table */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        className="card-lift mt-8 overflow-hidden rounded-[2rem] border border-slate-200 bg-white"
      >
        <div className="overflow-x-auto">
          <table className="w-full min-w-[620px] text-left">
            <thead>
              <tr className="bg-slate-50">
                <th className="px-5 py-4 text-[11px] font-extrabold uppercase tracking-wider text-slate-400">
                  {hi ? "क्षमता" : "Capability"}
                </th>
                <th className="px-5 py-4 text-center text-[11px] font-extrabold uppercase tracking-wider text-slate-400">
                  {hi ? "लैब पोर्टल" : "Lab Portal"}
                </th>
                <th className="px-5 py-4 text-center text-[11px] font-extrabold uppercase tracking-wider text-slate-400">
                  {hi ? "सामान्य AI" : "Generic AI"}
                </th>
                <th className="bg-mint-50 px-5 py-4 text-center">
                  <span className="inline-flex items-center gap-1.5 text-[12px] font-black uppercase tracking-wider text-mint-800">
                    <Sparkles className="h-4 w-4" />
                    RxAnvaya
                  </span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {COMPARE_ROWS.map((row) => (
                <tr key={row.feature.en} className="transition hover:bg-slate-50/60">
                  <td className="px-5 py-3.5 text-[15px] font-extrabold text-slate-800">
                    {pick(row.feature, s.lang)}
                  </td>
                  <td className="px-5 py-3.5 text-center">
                    <Cell v={row.portal} />
                  </td>
                  <td className="px-5 py-3.5 text-center">
                    <Cell v={row.generic} />
                  </td>
                  <td className="bg-mint-50/60 px-5 py-3.5 text-center">
                    <Cell v={row.rx} hero />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex items-center gap-2 border-t border-slate-100 bg-slate-50 px-5 py-3 text-xs font-bold text-slate-500">
          <Check className="h-4 w-4 text-emerald-500" strokeWidth={3} /> {hi ? "उपलब्ध" : "Available"}
          <Minus className="ml-3 h-4 w-4 text-amber-500" strokeWidth={3} /> {hi ? "आंशिक / सीमित" : "Partial / limited"}
          <X className="ml-3 h-4 w-4 text-rose-500" strokeWidth={3} /> {hi ? "उपलब्ध नहीं" : "Not available"}
        </div>
      </motion.div>

      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <Link
          href="/dashboard"
          className="inline-flex min-h-14 items-center gap-2 rounded-2xl bg-brand-700 px-6 text-base font-extrabold text-white shadow-lg transition hover:bg-brand-600 active:scale-95"
        >
          {hi ? "लाइव डेमो देखें" : "See the live demo"}
          <ArrowRight className="h-5 w-5" />
        </Link>
      </div>
    </AppShell>
  );
}

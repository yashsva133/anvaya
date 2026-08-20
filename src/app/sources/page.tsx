"use client";

// Screen 10 — evidence library: every explanation cites trusted sources.

import { motion } from "framer-motion";
import {
  ArrowUpRight,
  BookMarked,
  BookOpenCheck,
  Database,
  Languages,
  MessageCircleQuestion,
  Quote,
  ShieldCheck,
} from "lucide-react";
import Link from "next/link";
import { AppShell } from "@/components/shell";
import { SectionTitle, TestIcon } from "@/components/core";
import { useI18n, pick } from "@/lib/i18n";
import { SOURCES, TESTS } from "@/lib/data";

export default function SourcesPage() {
  const { t, s } = useI18n();
  const hi = s.lang === "hi";

  return (
    <AppShell>
      <SectionTitle
        icon={BookMarked}
        title={t("sources.title")}
        sub={t("sources.sub")}
      />

      <div className="flex flex-wrap items-center gap-3">
        <span className="inline-flex items-center gap-2 rounded-full bg-mint-50 px-4 py-2 text-sm font-extrabold text-mint-800">
          <BookOpenCheck className="h-4 w-4" />
          {SOURCES.length} {t("sources.used")}
        </span>
        <span className="inline-flex items-center gap-2 rounded-full bg-brand-50 px-4 py-2 text-sm font-extrabold text-brand-800">
          <ShieldCheck className="h-4 w-4" />
          {hi ? "उत्तर हमेशा स्रोत से जुड़े" : "Answers always grounded in sources"}
        </span>
      </div>

      {/* RAG explainer */}
      <div className="card-shadow mt-6 grid gap-3 rounded-[2rem] border border-slate-100 bg-white p-6 md:grid-cols-3 md:p-7">
        {[
          {
            icon: MessageCircleQuestion,
            title: hi ? "1. आपका प्रश्न / परिणाम" : "1. Your question / result",
            desc: hi
              ? "AI पहले आपकी असली रिपोर्ट के मान और सीमा पढ़ता है।"
              : "The AI first reads your actual values and reference ranges.",
          },
          {
            icon: Database,
            title: hi ? "2. विश्वसनीय स्रोत खोज" : "2. Trusted-source retrieval",
            desc: hi
              ? "MedlinePlus, CDC, AHA जैसे सत्यापित स्रोतों से प्रमाण ढूँढा जाता है।"
              : "Evidence is pulled from verified sources like MedlinePlus, CDC, AHA.",
          },
          {
            icon: Languages,
            title: hi ? "3. उद्धरण सहित उत्तर" : "3. Cited, simple answer",
            desc: hi
              ? "उत्तर सरल भाषा में — स्रोत और विश्वास-स्तर स्पष्ट रूप से दिखाया जाता है।"
              : "The answer arrives in simple language — with citations and a confidence label.",
          },
        ].map((x, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 10 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: i * 0.1 }}
            className="rounded-2xl bg-slate-50 p-4"
          >
            <x.icon className="h-6 w-6 text-brand-600" />
            <p className="mt-2 text-sm font-extrabold text-slate-800">{x.title}</p>
            <p className="mt-1 text-[13px] font-medium leading-relaxed text-slate-500">{x.desc}</p>
          </motion.div>
        ))}
      </div>

      {/* source cards */}
      <div className="mt-8 grid gap-4 md:grid-cols-2">
        {SOURCES.map((src, i) => (
          <motion.article
            key={src.id}
            initial={{ opacity: 0, y: 14 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: i * 0.06 }}
            className="card-shadow flex flex-col rounded-[2rem] border border-slate-100 bg-white p-6"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <span className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-brand-700 text-sm font-black text-white">
                  {src.publisher.slice(0, 2)}
                </span>
              </div>
              <span className="rounded-full bg-slate-100 px-3 py-1 text-[10px] font-extrabold uppercase tracking-widest text-slate-500">
                {src.country}
              </span>
            </div>
            <h3 className="mt-3 text-lg font-extrabold text-brand-950">{src.title}</h3>
            <p className="text-xs font-bold text-slate-400">{src.publisher}</p>

            <div className="mt-4 rounded-2xl border-l-4 border-mint-300 bg-mint-50/60 p-4">
              <p className="flex items-center gap-1.5 text-[10px] font-extrabold uppercase tracking-widest text-mint-700">
                <Quote className="h-3.5 w-3.5" />
                {t("sources.evidenceUsed")}
              </p>
              <p className="mt-1.5 text-[13px] font-medium italic leading-relaxed text-slate-600">
                “{pick(src.excerpt, s.lang)}”
              </p>
            </div>

            <div className="mt-4">
              <p className="text-[10px] font-extrabold uppercase tracking-widest text-slate-400">
                {t("sources.covers")}
              </p>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {src.usedFor
                  .filter((u) => TESTS[u])
                  .map((u) => (
                    <Link
                      key={u}
                      href={`/test/${u}`}
                      className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-extrabold text-slate-600 transition hover:bg-brand-100 hover:text-brand-800"
                    >
                      <TestIcon testId={u} size={18} />
                      {pick(TESTS[u].name, s.lang)}
                    </Link>
                  ))}
              </div>
            </div>

            <a
              href={src.url}
              target="_blank"
              rel="noreferrer"
              className="mt-5 inline-flex min-h-11 w-fit items-center gap-2 rounded-full bg-brand-100 px-4 text-sm font-extrabold text-brand-800 transition hover:bg-brand-200 active:scale-95"
            >
              {t("common.viewSource")}
              <ArrowUpRight className="h-4 w-4" />
            </a>
          </motion.article>
        ))}
      </div>
    </AppShell>
  );
}

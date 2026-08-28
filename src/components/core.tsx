"use client";

// RxAnvaya — shared UI atoms: brand, status system, voice, charts, overlays.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import {
  Activity,
  AlertTriangle,
  ArrowDown,
  ArrowDownCircle,
  ArrowUp,
  ArrowUpCircle,
  Atom,
  BookOpen,
  Check,
  CheckCircle2,
  ChevronRight,
  Circle,
  CircleDot,
  Droplet,
  Droplets,
  Flame,
  FlaskConical,
  Heart,
  HeartPulse,
  Info,
  Layers,
  Mic,
  Microscope,
  Minus,
  Percent,
  PieChart,
  Pill,
  Scale,
  ShieldAlert,
  ShieldCheck,
  ShieldPlus,
  Sigma,
  Siren,
  Sparkles,
  TestTube2,
  Volume2,
  VolumeX,
  X,
  Zap,
  type LucideIcon,
} from "lucide-react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceArea,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useI18n, pick } from "@/lib/i18n";
import {
  resolveTestDef,
  type Status,
  type TestDef,
} from "@/lib/data";

/* ---------------------------------- BRAND ---------------------------------- */

export function LogoMark({ size = 40 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      aria-hidden="true"
      className="shrink-0"
    >
      <defs>
        <linearGradient id="rxg" x1="0" y1="0" x2="48" y2="48">
          <stop offset="0%" stopColor="#0B2A4A" />
          <stop offset="100%" stopColor="#0F766E" />
        </linearGradient>
      </defs>
      <rect x="1" y="1" width="46" height="46" rx="14" fill="url(#rxg)" />
      {/* human-first medical cross */}
      <path
        d="M20.5 10h7a1.5 1.5 0 0 1 1.5 1.5v6.5h6.5A1.5 1.5 0 0 1 37 19.5v7a1.5 1.5 0 0 1-1.5 1.5H29v6.5a1.5 1.5 0 0 1-1.5 1.5h-7a1.5 1.5 0 0 1-1.5-1.5V28h-6.5A1.5 1.5 0 0 1 11 26.5v-7a1.5 1.5 0 0 1 1.5-1.5H19v-6.5A1.5 1.5 0 0 1 20.5 10Z"
        fill="#fff"
        opacity="0.96"
      />
      {/* connected nodes (AI + anvaya “connection”) */}
      <path
        d="M18 36.5 13.5 41M18 36.5l4.5 4.5"
        stroke="#87e0d2"
        strokeWidth="1.6"
        strokeLinecap="round"
        opacity="0.9"
      />
      <circle cx="18" cy="36.5" r="2.3" fill="#fff" />
      <circle cx="13.5" cy="41" r="3" fill="#5EEAD4" />
      <circle cx="22.5" cy="41" r="3" fill="#5EEAD4" />
    </svg>
  );
}

export function Logo({ withTagline = true }: { withTagline?: boolean }) {
  const { t } = useI18n();
  return (
    <div className="flex items-center gap-3">
      <LogoMark size={withTagline ? 42 : 36} />
      <div className="leading-tight">
        <p className="text-lg font-extrabold tracking-tight text-brand-900">
          RxAnvaya
        </p>
        {withTagline && (
          <p className="text-[11px] font-medium text-slate-500">
            {t("app.taglineShort")}
          </p>
        )}
      </div>
    </div>
  );
}

/* ------------------------------- STATUS SYSTEM ------------------------------ */

export const STATUS_ICONS: Record<Status, LucideIcon> = {
  normal: CheckCircle2,
  borderline: AlertTriangle,
  high: ArrowUpCircle,
  low: ArrowDownCircle,
  critical: Siren,
};

export function statusClasses(s: Status): {
  pill: string;
  dot: string;
  text: string;
  bg: string;
  border: string;
} {
  switch (s) {
    case "normal":
      return {
        pill: "bg-emerald-50 text-emerald-700 border-emerald-200",
        dot: "bg-emerald-500",
        text: "text-emerald-700",
        bg: "bg-emerald-50",
        border: "border-emerald-200",
      };
    case "borderline":
      return {
        pill: "bg-amber-50 text-amber-700 border-amber-300",
        dot: "bg-amber-500",
        text: "text-amber-700",
        bg: "bg-amber-50",
        border: "border-amber-300",
      };
    case "critical":
      return {
        pill: "bg-red-600 text-white border-red-600",
        dot: "bg-red-600",
        text: "text-red-700",
        bg: "bg-red-600",
        border: "border-red-500",
      };
    default:
      return {
        pill: "bg-rose-50 text-rose-700 border-rose-200",
        dot: "bg-rose-500",
        text: "text-rose-700",
        bg: "bg-rose-50",
        border: "border-rose-200",
      };
  }
}

export function StatusPill({
  status,
  size = "md",
  known = true,
}: {
  status: Status;
  size?: "sm" | "md" | "lg";
  /** False when no trusted report range was available for this result. */
  known?: boolean;
}) {
  const { t } = useI18n();
  const Icon = known ? STATUS_ICONS[status] : Info;
  const c = known
    ? statusClasses(status)
    : {
        pill: "bg-slate-50 text-slate-600 border-slate-200",
        dot: "bg-slate-400",
        text: "text-slate-600",
        bg: "bg-slate-50",
        border: "border-slate-200",
      };
  const sizes =
    size === "lg"
      ? "px-4 py-2 text-base gap-2"
      : size === "sm"
        ? "px-2.5 py-1 text-xs gap-1.5"
        : "px-3 py-1.5 text-sm gap-1.5";
  return (
    <span
      className={`inline-flex items-center rounded-full border font-bold ${c.pill} ${sizes}`}
    >
      <Icon className={size === "lg" ? "h-5 w-5" : "h-4 w-4"} strokeWidth={2.5} />
      {known ? t(`status.${status}`) : t("status.unassessed")}
    </span>
  );
}

/* --------------------------------- TEST ICON -------------------------------- */

const ICONS: Record<string, LucideIcon> = {
  droplets: Droplets,
  droplet: Droplet,
  activity: Activity,
  heart: Heart,
  heartpulse: HeartPulse,
  sparkles: Sparkles,
  candy: Sparkles,
  piechart: PieChart,
  flame: Flame,
  flask: FlaskConical,
  bean: FlaskConical,
  layers: Layers,
  shield: ShieldCheck,
  shieldplus: ShieldPlus,
  microscope: Microscope,
  testtube: TestTube2,
  scale: Scale,
  atom: Atom,
  pill: Pill,
  circledot: Microscope,
  circledashed: Microscope,
  circle: Droplet,
  percent: TestTube2,
  donut: TestTube2,
  sigma: Scale,
  zap: Atom,
  banana: Atom,
};

export function TestIcon({
  testId,
  size = 42,
  className = "",
}: {
  testId: string;
  size?: number;
  className?: string;
}) {
  const def = resolveTestDef(testId);
  const Icon = ICONS[def.icon] ?? Activity;
  return (
    <span
      className={`inline-flex items-center justify-center rounded-2xl ${def.tint} ${className}`}
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      <Icon className={`${def.ink} h-1/2 w-1/2`} strokeWidth={2.2} style={{ height: size * 0.5, width: size * 0.5 }} />
    </span>
  );
}

/* ------------------------------ LISTEN BUTTON ------------------------------- */

export function ListenBtn({
  text,
  langOverride,
  compact = false,
  className = "",
  light = false,
}: {
  text: string;
  langOverride?: string;
  compact?: boolean;
  className?: string;
  light?: boolean;
}) {
  const { s, t, speechLang } = useI18n();
  const toast = useToast();
  const [speaking, setSpeaking] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    return () => window.speechSynthesis?.cancel();
  }, []);

  if (!mounted || !s.voice) return null;

  const supported =
    typeof window !== "undefined" && "speechSynthesis" in window;

  const speak = () => {
    if (!supported) {
      toast("Voice is not supported on this device.", "info");
      return;
    }
    if (speaking) {
      window.speechSynthesis.cancel();
      setSpeaking(false);
      return;
    }
    const u = new SpeechSynthesisUtterance(
      text.replace(/[*_#>–—]/g, " ")
    );
    u.lang = langOverride ?? speechLang();
    u.rate = 0.92;
    u.onend = () => setSpeaking(false);
    u.onerror = () => setSpeaking(false);
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(u);
    setSpeaking(true);
    setTimeout(() => setSpeaking(false), 60000);
  };

  const Icon = !supported ? VolumeX : Volume2;
  return (
    <button
      type="button"
      onClick={speak}
      aria-label={t("common.listen")}
      className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-full border font-bold transition active:scale-95 ${
        light
          ? "border-white/30 bg-white/10 text-white hover:bg-white/20"
          : "border-brand-200 bg-white text-brand-700 hover:bg-brand-50"
      } ${compact ? "px-3.5 py-1.5 text-sm" : "px-4 py-2 text-sm"} ${className}`}
    >
      <span className="relative flex items-center">
        {speaking && (
          <span className="absolute inline-flex h-6 w-6 animate-pulse-ring rounded-full bg-mint-400" />
        )}
        <Icon className={`relative ${compact ? "h-4 w-4" : "h-5 w-5"}`} />
      </span>
      {speaking ? t("common.stop") : t("common.listen")}
    </button>
  );
}

/* ------------------------------ CONFIDENCE BAR ------------------------------ */

export function ConfBar({
  level,
  pct,
  note,
}: {
  level: "high" | "moderate";
  pct: number;
  note?: string;
}) {
  const { t } = useI18n();
  const high = level === "high";
  const Icon = high ? ShieldCheck : ShieldAlert;
  return (
    <div
      className={`rounded-2xl border p-4 ${
        high ? "border-mint-200 bg-mint-50" : "border-amber-200 bg-amber-50"
      }`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Icon
            className={`h-5 w-5 ${high ? "text-mint-700" : "text-amber-700"}`}
          />
          <p className="text-sm font-extrabold text-slate-800">
            {t("common.confidence")}
          </p>
        </div>
        <span
          className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-extrabold ${
            high
              ? "bg-mint-100 text-mint-800"
              : "bg-amber-100 text-amber-800"
          }`}
        >
          <span
            className={`h-2 w-2 rounded-full ${
              high ? "bg-mint-500" : "bg-amber-500"
            }`}
          />
          {high ? t("common.high") : t("common.moderate")} — {pct}%
        </span>
      </div>
      <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-white">
        <motion.div
          initial={{ width: 0 }}
          whileInView={{ width: `${pct}%` }}
          viewport={{ once: true }}
          transition={{ duration: 0.8, ease: "easeOut" }}
          className={`h-full rounded-full ${
            high ? "bg-mint-500" : "bg-amber-500"
          }`}
        />
      </div>
      {note && <p className="mt-2 text-xs font-medium text-slate-600">{note}</p>}
    </div>
  );
}

/* --------------------------------- RANGE BAR -------------------------------- */

export function RangeBar({ test, value }: { test: TestDef; value: number }) {
  const { t } = useI18n();
  const { low, high } = test.ref;
  if (low == null && high == null) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm font-semibold text-slate-500">
        {t("test.rangeUnavailable")}
      </div>
    );
  }

  let loZone = low;
  let hiZone = high;
  let min: number;
  let max: number;
  if (low != null && high != null) {
    const span = high - low;
    min = Math.min(low - span * 0.7, value);
    max = Math.max(high + span * 0.7, value);
  } else if (high != null) {
    // A one-sided range means "below high"; do not invent a lower bound.
    loZone = undefined;
    hiZone = high;
    min = 0;
    max = Math.max(high * 1.7, value * 1.15);
  } else {
    // A one-sided range means "above low"; do not invent an upper bound.
    const lower = low;
    if (lower == null) return null;
    loZone = lower;
    hiZone = undefined;
    min = Math.min(lower * 0.35, value * 0.5);
    max = Math.max(lower * 1.8, value * 1.2);
  }
  const pct = (x: number) =>
    `${Math.max(0, Math.min(100, ((x - min) / (max - min)) * 100)).toFixed(1)}%`;
  const vPct = pct(value);

  const out = value < (loZone ?? -Infinity) || value > (hiZone ?? Infinity);
  const zoneText =
    loZone != null && hiZone != null
      ? `${loZone}–${hiZone}`
      : hiZone != null
        ? `< ${hiZone}`
        : `> ${loZone}`;

  return (
    <div className="w-full">
      <div className="relative mt-6">
        {/* zones */}
        <div className="flex h-4 w-full overflow-hidden rounded-full">
          <div
            className="bg-rose-300/80"
            style={{ width: pct(loZone ?? min) }}
          />
          <div
            className="bg-emerald-300"
            style={{
              width: `calc(${pct(hiZone ?? max)} - ${pct(loZone ?? min)})`,
            }}
          />
          <div
            className="flex-1 bg-rose-300/80"
          />
        </div>
        {/* marker */}
        <motion.div
          initial={{ scale: 0 }}
          whileInView={{ scale: 1 }}
          viewport={{ once: true }}
          className="absolute -top-7 flex -translate-x-1/2 flex-col items-center"
          style={{ left: vPct }}
        >
          <span
            className={`rounded-full px-2 py-0.5 text-[11px] font-extrabold text-white ${
              out ? "bg-rose-600" : "bg-emerald-600"
            }`}
          >
            {t("test.marker")}
          </span>
          <span
            className={`mt-0.5 h-6 w-1 rounded-full ${out ? "bg-rose-600" : "bg-emerald-600"}`}
          />
        </motion.div>
      </div>
      <div className="mt-2 flex items-center justify-between text-[11px] font-bold text-slate-500">
        <span className="text-rose-600">{t("test.lowZone")}</span>
        <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-emerald-700">
          {t("test.normalZone")}: {zoneText} {test.unit}
        </span>
        <span className="text-rose-600">{t("test.highZone")}</span>
      </div>
    </div>
  );
}

/* ----------------------------------- CHARTS ---------------------------------- */

export interface TrendPoint {
  label: string;
  value: number;
}

/**
 * Kept as a compatibility helper for older callers, but it intentionally has
 * no seeded fallback. Report-aware screens must pass their real points to
 * TrendChart.
 */
export function trendPoints(_testId: string): TrendPoint[] {
  return [];
}

const chartTip = (props: {
  active?: unknown;
  payload?: readonly { value?: unknown }[];
  label?: unknown;
}) => {
  const { active, payload, label } = props;
  if (active !== true || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-center shadow-lg">
      <p className="text-[11px] font-bold text-slate-500">{String(label ?? "")}</p>
      <p className="tabular text-lg font-extrabold text-brand-800">
        {String(payload[0].value ?? "")}
      </p>
    </div>
  );
};

export function TrendChart({
  testId,
  height = 260,
  color = "#1d4a75",
  data = [],
}: {
  testId: string;
  height?: number;
  color?: string;
  /** Real report points supplied by a report-aware screen. */
  data?: TrendPoint[];
}) {
  const test = resolveTestDef(testId);
  const { low, high } = test.ref;
  const values = data.map((d) => d.value);
  // Do not invent the missing side of a one-sided laboratory range. A
  // ReferenceArea is drawn only when the report/catalogue supplies both bounds.
  const lo: number | undefined = low;
  const hi: number | undefined = high;
  const dataMin = values.length > 0 ? Math.min(...values) : 0;
  const dataMax = values.length > 0 ? Math.max(...values) : 1;
  const minV = Math.min(dataMin, lo ?? dataMin);
  const maxV = Math.max(dataMax, hi ?? dataMax);
  const pad = (maxV - minV) * 0.35 || 1;

  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: -18 }}>
          <CartesianGrid strokeDasharray="3 6" stroke="#e2e8f0" vertical={false} />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 12, fill: "#64748b", fontWeight: 700 }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            domain={[minV - pad, maxV + pad]}
            tick={{ fontSize: 11, fill: "#94a3b8", fontWeight: 600 }}
            axisLine={false}
            tickLine={false}
            width={48}
          />
          <Tooltip content={chartTip} />
          {lo != null && hi != null && (
            <ReferenceArea
              y1={lo}
              y2={hi}
              fill="#10b981"
              fillOpacity={0.1}
              stroke="#10b981"
              strokeOpacity={0.25}
              strokeDasharray="4 4"
            />
          )}
          <Line
            type="monotone"
            dataKey="value"
            stroke={color}
            strokeWidth={3.5}
            dot={{
              r: 4.5,
              fill: "#fff",
              stroke: color,
              strokeWidth: 3,
            }}
            activeDot={{ r: 6.5, fill: color, stroke: "#fff", strokeWidth: 2.5 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export function Spark({
  testId,
  height = 56,
  color = "#dc2626",
}: {
  testId: string;
  height?: number;
  color?: string;
}) {
  const data = trendPoints(testId);
  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 4, right: 4, bottom: 4, left: 4 }}>
          <Line
            type="monotone"
            dataKey="value"
            stroke={color}
            strokeWidth={2.5}
            dot={false}
            activeDot={false}
            isAnimationActive
          />
          <Tooltip content={chartTip} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

/* --------------------------------- MARKDOWN-LITE ----------------------------- */

export function Md({ text, className = "" }: { text: string; className?: string }) {
  const blocks = text.split(/\n\n+/);
  return (
    <div className={`space-y-3 ${className}`}>
      {blocks.map((b, i) => {
        const lines = b.split("\n");
        const isList = lines.every((l) => l.trim().startsWith("- "));
        if (isList) {
          return (
            <ul key={i} className="space-y-2">
              {lines.map((l, j) => (
                <li key={j} className="flex items-start gap-2.5">
                  <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-mint-600" strokeWidth={3} />
                  <span>{inlineMd(l.replace(/^\s*-\s+/, ""))}</span>
                </li>
              ))}
            </ul>
          );
        }
        return <p key={i}>{lines.map((l, j) => <span key={j}>{j > 0 && <br />}{inlineMd(l)}</span>)}</p>;
      })}
    </div>
  );
}

function inlineMd(s: string): ReactNode[] {
  const parts = s.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((p, i) =>
    p.startsWith("**") && p.endsWith("**") ? (
      <strong key={i} className="font-extrabold text-slate-900">
        {p.slice(2, -2)}
      </strong>
    ) : (
      <span key={i}>{p}</span>
    )
  );
}

/* ------------------------------------ TOAST ---------------------------------- */

interface ToastItem {
  id: number;
  msg: string;
  icon: "ok" | "info" | "warn";
}

const ToastCtx = createContext<(msg: string, icon?: ToastItem["icon"]) => void>(
  () => {}
);

export function useToast() {
  return useContext(ToastCtx);
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const idRef = useRef(0);

  const push = useCallback((msg: string, icon: ToastItem["icon"] = "ok") => {
    const id = ++idRef.current;
    setItems((prev) => [...prev.slice(-2), { id, msg, icon }]);
    setTimeout(() => {
      setItems((prev) => prev.filter((t) => t.id !== id));
    }, 3400);
  }, []);

  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="pointer-events-none fixed inset-x-4 bottom-24 z-[90] flex flex-col items-center gap-2 md:bottom-8">
        <AnimatePresence>
          {items.map((t) => (
            <motion.div
              key={t.id}
              initial={{ opacity: 0, y: 16, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: 0.95 }}
              className="pointer-events-auto flex max-w-sm items-center gap-2.5 rounded-2xl bg-brand-900 px-4 py-3 text-sm font-bold text-white shadow-xl"
            >
              {t.icon === "ok" && <Check className="h-4 w-4 text-mint-300" strokeWidth={3} />}
              {t.icon === "info" && <Info className="h-4 w-4 text-sky-300" strokeWidth={2.5} />}
              {t.icon === "warn" && <AlertTriangle className="h-4 w-4 text-amber-300" strokeWidth={2.5} />}
              {t.msg}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </ToastCtx.Provider>
  );
}

/* ------------------------------------ SHEET ---------------------------------- */

export function Sheet({
  open,
  onClose,
  title,
  children,
  wide = false,
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  wide?: boolean;
}) {
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-[70] bg-brand-950/50 backdrop-blur-[2px]"
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 30, stiffness: 300 }}
            className={`fixed inset-x-0 bottom-0 z-[80] mx-auto max-h-[88vh] w-full overflow-y-auto rounded-t-3xl bg-white p-5 pb-10 shadow-2xl md:rounded-3xl md:bottom-auto md:top-1/2 md:-translate-y-1/2 md:p-6 ${
              wide ? "max-w-2xl" : "max-w-md"
            }`}
          >
            <div className="mx-auto mb-4 h-1.5 w-12 rounded-full bg-slate-200 md:hidden" />
            <div className="flex items-start justify-between gap-4">
              {title && (
                <h3 className="text-lg font-extrabold text-brand-900">{title}</h3>
              )}
              <button
                onClick={onClose}
                aria-label="Close"
                className="ml-auto inline-flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-slate-600 transition hover:bg-slate-200"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            {children}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

/* --------------------------------- SMALL PIECES ------------------------------ */

export function TrendDirIcon({ dir, className = "h-5 w-5" }: { dir: "up" | "down" | "flat"; className?: string }) {
  if (dir === "up") return <ArrowUp className={className} strokeWidth={3} />;
  if (dir === "down") return <ArrowDown className={className} strokeWidth={3} />;
  return <Minus className={className} strokeWidth={3} />;
}

export function Dots({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-1 ${className}`}>
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="h-2 w-2 animate-bounce rounded-full bg-current"
          style={{ animationDelay: `${i * 0.15}s` }}
        />
      ))}
    </span>
  );
}

export function SectionTitle({
  icon: Icon,
  title,
  sub,
  action,
}: {
  icon?: LucideIcon;
  title: string;
  sub?: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-4 flex items-start justify-between gap-3">
      <div className="flex items-start gap-3">
        {Icon && (
          <span className="mt-0.5 inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-brand-100 text-brand-700">
            <Icon className="h-5 w-5" strokeWidth={2.2} />
          </span>
        )}
        <div>
          <h2 className="text-xl font-extrabold tracking-tight text-brand-900 md:text-2xl">
            {title}
          </h2>
          {sub && <p className="mt-0.5 text-sm font-medium text-slate-500">{sub}</p>}
        </div>
      </div>
      {action}
    </div>
  );
}

export function SafetyNote({ tone = "slate" }: { tone?: "slate" | "red" }) {
  const { t } = useI18n();
  return (
    <div
      className={`flex items-start gap-3 rounded-2xl border p-4 text-sm font-medium leading-relaxed ${
        tone === "red"
          ? "border-red-200 bg-red-50 text-red-800"
          : "border-slate-200 bg-slate-50 text-slate-600"
      }`}
    >
      <Info
        className={`mt-0.5 h-5 w-5 shrink-0 ${tone === "red" ? "text-red-600" : "text-slate-400"}`}
      />
      <p>{tone === "red" ? t("disclaimer.serious") : t("disclaimer.banner")}</p>
    </div>
  );
}

export function ChipLink({
  href,
  children,
  active = false,
}: {
  href: string;
  children: ReactNode;
  active?: boolean;
}) {
  return (
    <Link
      href={href}
      className={`inline-flex min-h-11 shrink-0 items-center gap-2 rounded-full border px-4 text-sm font-bold transition active:scale-95 ${
        active
          ? "border-brand-700 bg-brand-700 text-white"
          : "border-slate-200 bg-white text-slate-600 hover:border-brand-300 hover:text-brand-700"
      }`}
    >
      {children}
    </Link>
  );
}

export function pickTestName(test: TestDef, mode: string, lang: "en" | "hi" | "bn"): string {
  const L = lang === "hi" ? "hi" : "en";
  return mode === "advanced" ? test.name[L as "en" | "hi"] : test.simple[L as "en" | "hi"];
}

export { pick };

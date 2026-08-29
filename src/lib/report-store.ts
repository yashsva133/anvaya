import {
  LATEST,
  REPORTS,
  type Report,
  type ReportEntry,
  type Status,
  TESTS,
} from "./data";
import type { ExtractedParam } from "./supabase/db";

export interface ActiveReportState {
  id: string;
  date: { en: string; hi: string };
  month: { en: string; hi: string };
  patient_summary?: string;
  audio_script?: string;
  flagged_issues?: string[];
  entries: ReportEntry[];
}

const STORAGE_ACTIVE_KEY = "anvaya_active_report_v1";
const STORAGE_HISTORY_KEY = "anvaya_reports_history_v1";
const EMPTY_REPORT_ID = "no-report";

// Report data is scoped to the signed-in user. The old unscoped keys are never
// read: otherwise the first person using a shared browser would see another
// person's report (or the prototype's fictional report).
let storageScope = "anonymous";

function scopedKey(base: string): string {
  const safe = storageScope.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 80) || "anonymous";
  return `${base}:${safe}`;
}

/** Called by ReportDataProvider when the auth identity changes. */
export function setReportStoreScope(scope?: string): void {
  storageScope = scope?.trim() || "anonymous";
}

/** Empty state used until this person uploads their first report. */
export function getEmptyActiveReport(): ActiveReportState {
  return {
    id: EMPTY_REPORT_ID,
    date: { en: "", hi: "" },
    month: { en: "", hi: "" },
    entries: [],
  };
}

/**
 * The fictional report is retained only for the explicit "Try sample report"
 * demo action. It is never used as a default for a new account.
 */
export function getDefaultActiveReport(): ActiveReportState {
  return {
    id: LATEST.id,
    date: LATEST.date,
    month: LATEST.month,
    patient_summary:
      "Some results need attention. Your Hemoglobin is slightly low, and average blood sugar (HbA1c) is higher than normal.",
    audio_script:
      "Hello. In the sample report, Hemoglobin is lower than usual at 10.5, and HbA1c is 7.2. Please discuss these with your doctor.",
    flagged_issues: ["Low Hemoglobin (10.5 g/dL)", "Elevated HbA1c (7.2%)", "High LDL (154 mg/dL)"],
    entries: LATEST.entries,
  };
}

/** Get this user's active report, or a genuinely empty state. */
export function getStoredActiveReport(): ActiveReportState {
  if (typeof window === "undefined") return getEmptyActiveReport();
  try {
    const raw = localStorage.getItem(scopedKey(STORAGE_ACTIVE_KEY));
    if (raw) {
      const parsed = JSON.parse(raw) as ActiveReportState;
      if (parsed && Array.isArray(parsed.entries)) return parsed;
    }
  } catch (e) {
    console.warn("Could not read stored active report:", e);
  }
  return getEmptyActiveReport();
}

/** Get this user's report history. No report means an empty list, not sample data. */
export function getStoredReportsHistory(): Report[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(scopedKey(STORAGE_HISTORY_KEY));
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed as Report[];
    }
  } catch (e) {
    console.warn("Could not read stored reports history:", e);
  }
  return [];
}

/** Save the active report to this user's local store and update their timeline. */
export function setStoredActiveReport(report: ActiveReportState): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(scopedKey(STORAGE_ACTIVE_KEY), JSON.stringify(report));

    const history = getStoredReportsHistory();
    const attentionCount = report.entries.filter((e) => e.statusKnown !== false && e.status !== "normal").length;
    const newReportItem: Report = {
      id: report.id,
      date: report.date,
      month: report.month,
      testsCount: report.entries.length,
      attention: attentionCount,
      entries: report.entries,
    };

    const existingIndex = history.findIndex((r) => r.id === report.id);
    const updatedHistory =
      existingIndex >= 0
        ? history.map((item, i) => (i === existingIndex ? newReportItem : item))
        : [...history, newReportItem];

    localStorage.setItem(scopedKey(STORAGE_HISTORY_KEY), JSON.stringify(updatedHistory));
    window.dispatchEvent(new Event("anvaya_report_updated"));
  } catch (e) {
    console.warn("Could not save active report to storage:", e);
  }
}

/** Delete a report from this user's local store. */
export function deleteStoredReport(reportId: string): Report[] {
  if (typeof window === "undefined") return [];
  try {
    const history = getStoredReportsHistory();
    const updated = history.filter((r) => r.id !== reportId);
    localStorage.setItem(scopedKey(STORAGE_HISTORY_KEY), JSON.stringify(updated));

    const active = getStoredActiveReport();
    if (active.id === reportId) {
      if (updated.length > 0) {
        const nextActive = updated[updated.length - 1];
        localStorage.setItem(
          scopedKey(STORAGE_ACTIVE_KEY),
          JSON.stringify({
            id: nextActive.id,
            date: nextActive.date,
            month: nextActive.month,
            entries: nextActive.entries,
          } satisfies ActiveReportState)
        );
      } else {
        localStorage.removeItem(scopedKey(STORAGE_ACTIVE_KEY));
      }
    }

    window.dispatchEvent(new Event("anvaya_report_updated"));
    return updated;
  } catch (e) {
    console.warn("Could not delete report from storage:", e);
    return getStoredReportsHistory();
  }
}

/**
 * Convert extracted parameters to report entries without silently changing an
 * unfamiliar test into Hemoglobin. Known aliases use the catalogue; every
 * other result keeps its printed label, unit and range under a stable
 * report_* id so the Overview can still show the real reading honestly.
 */
export function mapChartDataToEntries(chartData: ExtractedParam[]): ReportEntry[] {
  const aliases: Record<string, string[]> = {
    hemoglobin: ["hb", "hgb", "haemoglobin"],
    hba1c: ["glycatedhaemoglobin", "glycosylatedhaemoglobin", "a1c"],
    glucose: ["fastingbloodsugar", "bloodsugar", "fastingglucose", "fbs"],
    ldl: ["ldlcholesterol", "lowdensitylipoprotein"],
    hdl: ["hdlcholesterol", "highdensitylipoprotein"],
    triglycerides: ["triglyceride"],
    creatinine: ["serumcreatinine"],
    platelets: ["platelet", "plateletcount"],
    wbc: ["whitebloodcells", "whitebloodcell", "leucocytes", "leukocytes"],
    mcv: ["meancorpuscularvolume"],
    rbc: ["redbloodcells", "redbloodcell", "erythrocytes"],
    hematocrit: ["hct", "packedcellvolume", "pcv"],
    totalchol: ["totalcholesterol", "cholesteroltotal"],
    potassium: ["serumpotassium", "kplus"],
  };
  const known = Object.keys(TESTS);
  const cleanText = (value: unknown, max: number): string =>
    typeof value === "string"
      ? value.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max)
      : "";
  const finite = (value: unknown): number | undefined => {
    const n = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
    return Number.isFinite(n) ? Math.round(n * 100) / 100 : undefined;
  };
  const statusFromRange = (value: number, low?: number, high?: number): Status => {
    if (low !== undefined && high !== undefined && low > high) return "normal";
    if (low !== undefined && value < low) return "low";
    if (high !== undefined && value > high) return "high";
    if (low !== undefined && high !== undefined) {
      const margin = (high - low) * 0.1;
      if (value <= low + margin || value >= high - margin) return "borderline";
    } else if (high !== undefined && value >= high * 0.9) {
      return "borderline";
    } else if (low !== undefined && value <= low * 1.1) {
      return "borderline";
    }
    return "normal";
  };

  return chartData.flatMap((p, index) => {
    const label = cleanText(p.parameter, 96);
    const value = finite(p.value);
    if (!label || value === undefined) return [];

    const paramKey = label.toLowerCase().replace(/[^a-z0-9]/g, "");
    const testKey = known.find((key) =>
      paramKey === key ||
      paramKey.includes(key) ||
      key.includes(paramKey) ||
      (aliases[key] ?? []).some((alias) => paramKey.includes(alias) || alias.includes(paramKey))
    ) ?? `report_${paramKey.slice(0, 56) || `test_${index + 1}`}`;

    const knownDef = TESTS[testKey];
    const rawLow = finite(p.normal_min);
    const rawHigh = finite(p.normal_max);
    const suppliedRangeValid =
      rawLow === undefined || rawHigh === undefined || rawLow <= rawHigh;
    let low = suppliedRangeValid ? rawLow ?? knownDef?.ref.low : knownDef?.ref.low;
    let high = suppliedRangeValid ? rawHigh ?? knownDef?.ref.high : knownDef?.ref.high;
    let finalValue = value;
    let unit = cleanText(p.unit, 32) || knownDef?.unit || "";

    // Harmonize scale mismatches (e.g. absolute /cumm vs 10^3 multipliers)
    if (testKey === "wbc" && finalValue !== undefined) {
      if (finalValue > 100 && low !== undefined && low < 50) {
        low = low * 1000;
        if (high !== undefined) high = high * 1000;
        unit = "/cumm";
      } else if (finalValue < 50 && low !== undefined && low > 100) {
        finalValue = finalValue * 1000;
        unit = "/cumm";
      }
    } else if (testKey === "platelets" && finalValue !== undefined) {
      if (finalValue > 1000 && low !== undefined && low < 1000) {
        const mult = low < 10 ? 100000 : 1000;
        low = low * mult;
        if (high !== undefined) high = high * mult;
        unit = "/cumm";
      } else if (finalValue <= 1000 && low !== undefined && low > 1000) {
        const mult = finalValue < 10 ? 100000 : 1000;
        finalValue = finalValue * mult;
        unit = "/cumm";
      }
    }

    const referenceText = cleanText(
      p.reference_text,
      96
    ) || (low !== undefined && high !== undefined
      ? `${low}–${high}${unit ? ` ${unit}` : ""}`
      : low !== undefined
        ? `above ${low}${unit ? ` ${unit}` : ""}`
        : high !== undefined
          ? `below ${high}${unit ? ` ${unit}` : ""}`
          : (knownDef?.ref.text ?? "Reference range not reported"));

    const statusKnown = low !== undefined || high !== undefined;
    const status = statusKnown ? statusFromRange(finalValue, low, high) : "normal";

    return [{
      test: testKey,
      value: finalValue,
      status,
      statusKnown,
      label,
      ...(unit ? { unit } : {}),
      reference: {
        ...(low !== undefined ? { low } : {}),
        ...(high !== undefined ? { high } : {}),
        text: referenceText,
      },
    }];
  });
}

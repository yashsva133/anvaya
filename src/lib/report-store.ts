import { LATEST, REPORTS, type Report, type ReportEntry, type Status, TESTS } from "./data";
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

/**
 * Converts LATEST default report to ActiveReportState
 */
export function getDefaultActiveReport(): ActiveReportState {
  return {
    id: LATEST.id,
    date: LATEST.date,
    month: LATEST.month,
    patient_summary:
      "Some results need attention. Your Hemoglobin is slightly low, and average blood sugar (HbA1c) is higher than normal.",
    audio_script:
      "Hello Mr. Rahul. In your latest report, your Hemoglobin is lower than usual at 10.5, and your HbA1c is 7.2. Please discuss these with your doctor.",
    flagged_issues: ["Low Hemoglobin (10.5 g/dL)", "Elevated HbA1c (7.2%)", "High LDL (154 mg/dL)"],
    entries: LATEST.entries,
  };
}

/**
 * Get active report from localStorage or fallback
 */
export function getStoredActiveReport(): ActiveReportState {
  if (typeof window === "undefined") return getDefaultActiveReport();
  try {
    const raw = localStorage.getItem(STORAGE_ACTIVE_KEY);
    if (raw) {
      return JSON.parse(raw);
    }
  } catch (e) {
    console.warn("Could not read stored active report:", e);
  }
  return getDefaultActiveReport();
}

/**
 * Get full reports history from localStorage or fallback
 */
export function getStoredReportsHistory(): Report[] {
  if (typeof window === "undefined") return REPORTS;
  try {
    const raw = localStorage.getItem(STORAGE_HISTORY_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    }
  } catch (e) {
    console.warn("Could not read stored reports history:", e);
  }
  return REPORTS;
}

/**
 * Save active report to localStorage and update reports timeline
 */
export function setStoredActiveReport(report: ActiveReportState) {
  if (typeof window === "undefined") return;
  try {
    // 1. Save active report
    localStorage.setItem(STORAGE_ACTIVE_KEY, JSON.stringify(report));

    // 2. Update / Append to reports history timeline
    const history = getStoredReportsHistory();
    const attentionCount = report.entries.filter((e) => e.status !== "normal").length;
    const newReportItem: Report = {
      id: report.id,
      date: report.date,
      month: report.month,
      testsCount: report.entries.length,
      attention: attentionCount,
      entries: report.entries,
    };

    // Replace latest or append
    const existingIndex = history.findIndex((r) => r.id === report.id || r.id === "aug26");
    let updatedHistory: Report[];
    if (existingIndex >= 0) {
      updatedHistory = [...history];
      updatedHistory[existingIndex] = newReportItem;
    } else {
      updatedHistory = [...history, newReportItem];
    }

    localStorage.setItem(STORAGE_HISTORY_KEY, JSON.stringify(updatedHistory));

    // 3. Dispatch update events to all listeners
    window.dispatchEvent(new Event("anvaya_report_updated"));
  } catch (e) {
    console.warn("Could not save active report to storage:", e);
  }
}

/**
 * Delete a report from localStorage history
 */
export function deleteStoredReport(reportId: string): Report[] {
  if (typeof window === "undefined") return REPORTS;
  try {
    const history = getStoredReportsHistory();
    const updated = history.filter((r) => r.id !== reportId);
    localStorage.setItem(STORAGE_HISTORY_KEY, JSON.stringify(updated));

    // If deleting active report, reset active report to latest available
    const active = getStoredActiveReport();
    if (active.id === reportId) {
      if (updated.length > 0) {
        const nextActive = updated[updated.length - 1];
        setStoredActiveReport({
          id: nextActive.id,
          date: nextActive.date,
          month: nextActive.month,
          entries: nextActive.entries,
        });
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
 * Convert extracted parameters to ReportEntry list
 */
export function mapChartDataToEntries(chartData: ExtractedParam[]): ReportEntry[] {
  return chartData.map((p) => {
    const paramKey = p.parameter.toLowerCase().replace(/[^a-z0-9]/g, "");
    let testKey = paramKey;
    for (const key of Object.keys(TESTS)) {
      if (paramKey.includes(key) || key.includes(paramKey)) {
        testKey = key;
        break;
      }
    }

    return {
      test: testKey,
      value: Number(p.value),
      status: (p.status || "normal") as Status,
    };
  });
}


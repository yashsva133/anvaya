"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { useAuth } from "@/lib/auth";
import {
  TESTS as DEFAULT_TESTS,
  resolveTestDef,
  type Report,
  type ReportEntry,
  type TestDef,
  type TrendInfo,
  type Pattern,
} from "@/lib/data";
import {
  getEmptyActiveReport,
  getStoredActiveReport,
  getStoredReportsHistory,
  deleteStoredReport,
  setReportStoreScope,
  type ActiveReportState,
} from "@/lib/report-store";
import {
  getPatientProfile,
  getPatientReports,
  getLabTestCatalog,
} from "@/lib/supabase/db";

export interface PatientInfo {
  /** The `patients.id` uuid, present only when the profile was loaded from Supabase. */
  id?: string;
  name: { en: string; hi: string };
  nameShort: string;
  age: number;
  gender: { en: string; hi: string };
  email: string;
  abhaId?: string;
}

interface ReportDataContextType {
  patient: PatientInfo;
  catalog: Record<string, TestDef>;
  activeReport: ActiveReportState;
  reports: Report[];
  trends: TrendInfo[];
  patterns: Pattern[];
  loading: boolean;
  getEntry: (testId: string) => ReportEntry | undefined;
  getTestDef: (testId: string) => TestDef;
  refresh: () => Promise<void>;
  deleteReport: (reportId: string) => Promise<boolean>;
}

const EMPTY_PATIENT: PatientInfo = {
  name: { en: "", hi: "" },
  nameShort: "",
  age: 0,
  gender: { en: "", hi: "" },
  email: "",
};

const ReportDataContext = createContext<ReportDataContextType | null>(null);

export function ReportDataProvider({ children }: { children: ReactNode }) {
  const { user, profile } = useAuth();

  // No fictional patient is placed in a real user's context. The catalogue is
  // safe static reference data; reports and patient identity are not.
  const [patient, setPatient] = useState<PatientInfo>(EMPTY_PATIENT);
  const [catalog, setCatalog] = useState<Record<string, TestDef>>(DEFAULT_TESTS);
  const [activeReport, setActiveReport] = useState<ActiveReportState>(getEmptyActiveReport());
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      if (user) {
        const authName =
          profile?.full_name ||
          user.user_metadata?.full_name ||
          user.user_metadata?.name ||
          user.email?.split("@")[0] ||
          "User";
        setPatient((prev) => ({
          ...prev,
          name: { en: authName, hi: authName },
          nameShort: authName.split(" ")[0] || authName,
          email: user.email || prev.email,
        }));
      } else {
        setPatient(EMPTY_PATIENT);
      }

      const profileId = user?.id;
      const p = profileId ? await getPatientProfile(profileId) : null;
      if (p) setPatient(p as PatientInfo);

      const cat = await getLabTestCatalog();
      if (cat) setCatalog(cat);

      // 3. Fetch historical reports from Supabase or local store
      const rpts = await getPatientReports(p?.id);
      if (rpts && rpts.length > 0) {
        setReports(rpts);
        const stored = getStoredActiveReport();
        if (stored && stored.entries.length > 0) {
          setActiveReport(stored);
        } else {
          setActiveReport({
            id: rpts[0].id,
            date: rpts[0].date,
            month: rpts[0].month,
            entries: rpts[0].entries,
          });
        }
      } else if (user) {
        setReports([]);
        setActiveReport(getStoredActiveReport());
      } else {
        setReports(getStoredReportsHistory());
        setActiveReport(getStoredActiveReport());
      }
    } catch (err) {
      console.warn("Could not load full live report data:", err);
      setActiveReport(getStoredActiveReport());
      setReports(getStoredReportsHistory());
    } finally {
      setLoading(false);
    }
  }, [user, profile]);

  useEffect(() => {
    setReportStoreScope(user?.id);
    void loadData();

    const onReportUpdated = () => {
      // When logged in, do a full Supabase refresh so the AI summary
      // and overview pick up the just-saved report from the database.
      if (user) {
        void loadData();
      } else {
        setActiveReport(getStoredActiveReport());
        setReports(getStoredReportsHistory());
      }
    };

    window.addEventListener("anvaya_report_updated", onReportUpdated);
    window.addEventListener("storage", onReportUpdated);

    return () => {
      window.removeEventListener("anvaya_report_updated", onReportUpdated);
      window.removeEventListener("storage", onReportUpdated);
    };
  }, [loadData, user]);

  const getEntry = useCallback(
    (testId: string): ReportEntry | undefined =>
      activeReport.entries.find((e) => e.test === testId),
    [activeReport]
  );

  const getTestDef = useCallback(
    (testId: string): TestDef => resolveTestDef(testId, catalog),
    [catalog]
  );

  const deleteReport = useCallback(async (reportId: string): Promise<boolean> => {
    setReports((prev) => prev.filter((r) => r.id !== reportId));
    deleteStoredReport(reportId);
    setActiveReport(getStoredActiveReport());

    try {
      const res = await fetch("/api/delete-report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reportId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.success === false) {
        console.warn("[DELETE REPORT] DB deletion note:", data.error);
      }
    } catch (e) {
      console.warn("[DELETE REPORT] Fallback local delete only:", e);
    }

    return true;
  }, []);

  return (
    <ReportDataContext.Provider
      value={{
        patient,
        catalog,
        activeReport,
        reports,
        trends: [],
        patterns: [],
        loading,
        getEntry,
        getTestDef,
        refresh: loadData,
        deleteReport,
      }}
    >
      {children}
    </ReportDataContext.Provider>
  );
}

export function useReportData(): ReportDataContextType {
  const ctx = useContext(ReportDataContext);
  if (!ctx) throw new Error("useReportData must be used within a ReportDataProvider");
  return ctx;
}

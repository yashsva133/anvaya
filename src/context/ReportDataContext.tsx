"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { useAuth } from "@/lib/auth-context";
import {
  PATIENT as DEFAULT_PATIENT,
  REPORTS as DEFAULT_REPORTS,
  TESTS as DEFAULT_TESTS,
  TREND_CARDS as DEFAULT_TREND_CARDS,
  PATTERNS as DEFAULT_PATTERNS,
  type Report,
  type ReportEntry,
  type TestDef,
  type TrendInfo,
  type Pattern,
} from "@/lib/data";
import {
  getStoredActiveReport,
  getStoredReportsHistory,
  type ActiveReportState,
} from "@/lib/report-store";
import {
  getPatientProfile,
  getPatientReports,
  getLabTestCatalog,
} from "@/lib/supabase/db";

export interface PatientInfo {
  /**
   * The `patients.id` uuid, present only when the profile was loaded from
   * Supabase. The AI endpoints need it to file a conversation against the right
   * person; the seeded demo profile deliberately has none.
   */
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
}

const ReportDataContext = createContext<ReportDataContextType | null>(null);

export function ReportDataProvider({ children }: { children: ReactNode }) {
  const { session, profile } = useAuth();

  const [patient, setPatient] = useState<PatientInfo>({
    ...DEFAULT_PATIENT,
    name: { en: "Loading…", hi: "लोड हो रहा…" },
    nameShort: "",
    email: "",
  });
  const [catalog, setCatalog] = useState<Record<string, TestDef>>(DEFAULT_TESTS);
  const [activeReport, setActiveReport] = useState<ActiveReportState>(
    getStoredActiveReport()
  );
  const [reports, setReports] = useState<Report[]>(getStoredReportsHistory());
  const [loading, setLoading] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      // If we have an authenticated user, build patient info from auth profile first
      if (session?.user) {
        const user = session.user;
        const authName = profile?.full_name || user.user_metadata?.full_name || user.user_metadata?.name || user.email?.split("@")[0] || "User";
        setPatient((prev) => ({
          ...prev,
          name: { en: authName, hi: authName },
          nameShort: authName.split(" ")[0] || authName,
          email: user.email || prev.email,
        }));
      }

      // 1. Fetch patient profile from Supabase (may override with richer data)
      const profileId = session?.user?.id;
      const p = await getPatientProfile(profileId);
      if (p) setPatient(p as PatientInfo);

      // 2. Fetch catalog definitions
      const cat = await getLabTestCatalog();
      if (cat) setCatalog(cat);

      // 3. Fetch historical reports from Supabase or local store
      const rpts = await getPatientReports();
      if (rpts && rpts.length > 0) {
        setReports(rpts);
      } else {
        setReports(getStoredReportsHistory());
      }

      // 4. Sync stored active report
      setActiveReport(getStoredActiveReport());
    } catch (err) {
      console.warn("Could not load full live report data, fallback active:", err);
      setActiveReport(getStoredActiveReport());
      setReports(getStoredReportsHistory());
    } finally {
      setLoading(false);
    }
  }, [session?.user?.id, profile?.full_name]);

  useEffect(() => {
    loadData();

    // Listen to local storage updates from "Looks correct" save
    const onReportUpdated = () => {
      setActiveReport(getStoredActiveReport());
      setReports(getStoredReportsHistory());
    };

    window.addEventListener("anvaya_report_updated", onReportUpdated);
    window.addEventListener("storage", onReportUpdated);

    return () => {
      window.removeEventListener("anvaya_report_updated", onReportUpdated);
      window.removeEventListener("storage", onReportUpdated);
    };
  }, [loadData]);

  const getEntry = useCallback(
    (testId: string): ReportEntry | undefined => {
      return activeReport.entries.find((e) => e.test === testId);
    },
    [activeReport]
  );

  const getTestDef = useCallback(
    (testId: string): TestDef => {
      return catalog[testId] || DEFAULT_TESTS[testId] || DEFAULT_TESTS.hemoglobin;
    },
    [catalog]
  );

  return (
    <ReportDataContext.Provider
      value={{
        patient,
        catalog,
        activeReport,
        reports,
        trends: DEFAULT_TREND_CARDS,
        patterns: DEFAULT_PATTERNS,
        loading,
        getEntry,
        getTestDef,
        refresh: loadData,
      }}
    >
      {children}
    </ReportDataContext.Provider>
  );
}

export function useReportData(): ReportDataContextType {
  const ctx = useContext(ReportDataContext);
  if (!ctx) {
    throw new Error("useReportData must be used within a ReportDataProvider");
  }
  return ctx;
}

"use client";

// App-wide client providers: language/settings + toasts + dynamic Report Data context (Supabase synced).

import type { ReactNode } from "react";
import { I18nProvider } from "@/lib/i18n";
import { ToastProvider } from "@/components/core";
import { ReportDataProvider } from "@/context/ReportDataContext";

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <I18nProvider>
      <ReportDataProvider>
        <ToastProvider>{children}</ToastProvider>
      </ReportDataProvider>
    </I18nProvider>
  );
}

export { I18nProvider, ToastProvider, ReportDataProvider };

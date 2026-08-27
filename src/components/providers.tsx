"use client";

// App-wide client providers: Auth + language/settings + toasts + dynamic Report Data context (Supabase synced).

import type { ReactNode } from "react";
import { AuthProvider } from "@/lib/auth";
import { I18nProvider } from "@/lib/i18n";
import { ToastProvider } from "@/components/core";
import { ReportDataProvider } from "@/context/ReportDataContext";

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <AuthProvider>
      <I18nProvider>
        <ToastProvider>
          <ReportDataProvider>{children}</ReportDataProvider>
        </ToastProvider>
      </I18nProvider>
    </AuthProvider>
  );
}

export { AuthProvider, I18nProvider, ToastProvider, ReportDataProvider };


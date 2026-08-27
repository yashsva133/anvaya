"use client";

// App-wide client providers: language/settings + auth + dynamic Report Data context + toasts.

import type { ReactNode } from "react";
import { I18nProvider } from "@/lib/i18n";
import { AuthProvider } from "@/lib/auth-context";
import { ToastProvider } from "@/components/core";
import { ReportDataProvider } from "@/context/ReportDataContext";

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <I18nProvider>
      <AuthProvider>
        <ReportDataProvider>
          <ToastProvider>{children}</ToastProvider>
        </ReportDataProvider>
      </AuthProvider>
    </I18nProvider>
  );
}

export { I18nProvider, AuthProvider, ToastProvider, ReportDataProvider };

"use client";

// App-wide client providers: Auth + language/settings + toasts + dynamic Report Data context (Supabase synced).

import type { ReactNode } from "react";
import { AuthProvider } from "@/lib/auth";
import { AuthProvider as AuthContextProvider } from "@/lib/auth-context";
import { I18nProvider } from "@/lib/i18n";
import { ToastProvider } from "@/components/core";
import { ReportDataProvider } from "@/context/ReportDataContext";

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <AuthProvider>
      <AuthContextProvider>
        <ToastProvider>
          <ReportDataProvider>
            <I18nProvider>
              {children}
            </I18nProvider>
          </ReportDataProvider>
        </ToastProvider>
      </AuthContextProvider>
    </AuthProvider>
  );
}

export { AuthProvider } from "@/lib/auth";
export { I18nProvider, ToastProvider, ReportDataProvider };

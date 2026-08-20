"use client";

// App-wide client providers: language/settings + toasts.

import type { ReactNode } from "react";
import { I18nProvider } from "@/lib/i18n";
import { ToastProvider } from "@/components/core";

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <I18nProvider>
      <ToastProvider>{children}</ToastProvider>
    </I18nProvider>
  );
}

export { I18nProvider, ToastProvider };

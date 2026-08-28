import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { AppProviders } from "@/components/providers";
import "./globals.css";

export const metadata: Metadata = {
  title: "RxAnvaya — Understand your health report. In simple language.",
  description:
    "AI-assisted laboratory report interpretation for every Indian patient. Upload a report, understand your results in simple words, see trends, and ask questions in your language. Educational, not a diagnosis.",
  applicationName: "RxAnvaya",
};

export const viewport: Viewport = {
  themeColor: "#0b2a4a",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="antialiased">
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}

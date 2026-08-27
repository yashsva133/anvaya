"use client";

import { useEffect, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { Logo } from "@/components/core";

export function AuthGuard({
  children,
  requireOnboarded = true,
}: {
  children: ReactNode;
  requireOnboarded?: boolean;
}) {
  const { user, loading, isOnboarded } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!loading) {
      if (!user) {
        router.replace(`/login?redirect=${encodeURIComponent(pathname)}`);
      } else if (requireOnboarded && !isOnboarded && pathname !== "/onboarding") {
        router.replace("/onboarding");
      }
    }
  }, [user, loading, isOnboarded, requireOnboarded, pathname, router]);

  if (loading) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center bg-[#F6F9F8] p-4">
        <div className="flex flex-col items-center gap-4">
          <Logo withTagline={false} />
          <div className="mt-2 flex items-center gap-2">
            <span className="h-3 w-3 animate-bounce rounded-full bg-mint-500" />
            <span
              className="h-3 w-3 animate-bounce rounded-full bg-brand-600"
              style={{ animationDelay: "150ms" }}
            />
            <span
              className="h-3 w-3 animate-bounce rounded-full bg-mint-600"
              style={{ animationDelay: "300ms" }}
            />
          </div>
          <p className="text-xs font-semibold text-slate-400">
            Checking authentication…
          </p>
        </div>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  if (requireOnboarded && !isOnboarded && pathname !== "/onboarding") {
    return null;
  }

  return <>{children}</>;
}

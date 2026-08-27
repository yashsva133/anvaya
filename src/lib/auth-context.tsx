"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { getProfile, getStoredSession, getUser, refreshSession, storeSession, type AnvayaProfile, type SupabaseSession } from "@/lib/supabase-auth";

type AuthStatus = "loading" | "unauthenticated" | "authenticated" | "unconfigured";
interface AuthContextValue { session: SupabaseSession | null; profile: AnvayaProfile | null; status: AuthStatus; setSession: (s: SupabaseSession | null) => Promise<void>; reloadProfile: () => Promise<AnvayaProfile | null>; }
const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSessionState] = useState<SupabaseSession | null>(null);
  const [profile, setProfile] = useState<AnvayaProfile | null>(null);
  const [status, setStatus] = useState<AuthStatus>("loading");

  const loadProfile = useCallback(async (s: SupabaseSession | null) => {
    if (!s) return null;
    const row = await getProfile(s.access_token, s.user.id);
    setProfile(row);
    return row;
  }, []);
  const setSession = useCallback(async (s: SupabaseSession | null) => {
    storeSession(s); setSessionState(s);
    if (!s) { setProfile(null); setStatus("unauthenticated"); return; }
    setStatus("authenticated"); await loadProfile(s).catch(() => setProfile(null));
  }, [loadProfile]);

  useEffect(() => {
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) { setStatus("unconfigured"); return; }
    const boot = async () => {
      const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
      const access = hash.get("access_token");
      const refresh = hash.get("refresh_token");
      if (access && refresh) {
        const user = await getUser(access);
        window.history.replaceState(null, "", window.location.pathname + window.location.search);
        await setSession({ access_token: access, refresh_token: refresh, user });
        return;
      }
      const stored = getStoredSession();
      if (!stored) { setStatus("unauthenticated"); return; }
      try {
        const fresh = await refreshSession(stored.refresh_token).catch(() => stored);
        await setSession(fresh);
      } catch { storeSession(null); setStatus("unauthenticated"); }
    };
    void boot();
  }, [setSession]);

  const value = useMemo(() => ({ session, profile, status, setSession, reloadProfile: () => loadProfile(session) }), [session, profile, status, setSession, loadProfile]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
export function useAuth() { const ctx = useContext(AuthContext); if (!ctx) throw new Error("useAuth must be used within AuthProvider"); return ctx; }

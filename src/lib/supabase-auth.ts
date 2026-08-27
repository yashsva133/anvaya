"use client";

export interface SupabaseUser {
  id: string;
  email?: string;
  user_metadata?: { full_name?: string; name?: string; avatar_url?: string };
}

export interface SupabaseSession {
  access_token: string;
  refresh_token: string;
  expires_at?: number;
  user: SupabaseUser;
}

export interface AnvayaProfile {
  id: string;
  full_name: string | null;
  email: string | null;
  onboarding_completed: boolean;
}

export interface PatientProfileInput {
  full_name: string;
  date_of_birth: string;
  sex: "female" | "male" | "other" | "unspecified";
  preferred_language: "en" | "hi" | "bn";
}

const SESSION_KEY = "anvaya.supabase.session";

function supabaseConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) throw new Error("Supabase is not configured.");
  return { url: url.replace(/\/$/, ""), anon };
}

function headers(token?: string) {
  const { anon } = supabaseConfig();
  return {
    apikey: anon,
    Authorization: `Bearer ${token ?? anon}`,
    "Content-Type": "application/json",
  };
}

export function getStoredSession(): SupabaseSession | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(SESSION_KEY);
  if (!raw) return null;
  try { return JSON.parse(raw) as SupabaseSession; } catch { return null; }
}

export function storeSession(session: SupabaseSession | null) {
  if (typeof window === "undefined") return;
  if (session) window.localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  else window.localStorage.removeItem(SESSION_KEY);
}

async function authFetch<T>(path: string, init: RequestInit): Promise<T> {
  const { url } = supabaseConfig();
  const res = await fetch(`${url}/auth/v1${path}`, init);
  const data = (await res.json().catch(() => ({}))) as T & { msg?: string; error_description?: string };
  if (!res.ok) throw new Error(data.error_description || data.msg || "Request failed");
  return data;
}

export async function signInWithPassword(email: string, password: string) {
  return authFetch<SupabaseSession>("/token?grant_type=password", {
    method: "POST", headers: headers(), body: JSON.stringify({ email, password }),
  });
}

export async function signUpWithPassword(email: string, password: string) {
  return authFetch<SupabaseSession>("/signup", {
    method: "POST", headers: headers(), body: JSON.stringify({ email, password }),
  });
}

export async function sendPasswordReset(email: string) {
  const redirect_to = `${window.location.origin}/login`;
  return authFetch<{ message?: string }>("/recover", {
    method: "POST", headers: headers(), body: JSON.stringify({ email, redirect_to }),
  });
}

export function googleOAuthUrl() {
  const { url, anon } = supabaseConfig();
  const redirectTo = `${window.location.origin}/login`;
  return `${url}/auth/v1/authorize?provider=google&redirect_to=${encodeURIComponent(redirectTo)}&apikey=${encodeURIComponent(anon)}`;
}

export async function getUser(accessToken: string) {
  return authFetch<SupabaseUser>("/user", { method: "GET", headers: headers(accessToken) });
}

export async function refreshSession(refreshToken: string) {
  return authFetch<SupabaseSession>("/token?grant_type=refresh_token", {
    method: "POST", headers: headers(), body: JSON.stringify({ refresh_token: refreshToken }),
  });
}

export async function signOut(session: SupabaseSession | null) {
  if (session?.access_token) {
    await authFetch("/logout", { method: "POST", headers: headers(session.access_token) }).catch(() => undefined);
  }
  storeSession(null);
}

async function restFetch<T>(path: string, token: string, init?: RequestInit): Promise<T> {
  const { url } = supabaseConfig();
  const res = await fetch(`${url}/rest/v1${path}`, { ...init, headers: { ...headers(token), Prefer: "return=representation", ...init?.headers } });
  const data = (await res.json().catch(() => null)) as T;
  if (!res.ok) throw new Error("Database request failed");
  return data;
}

export async function getProfile(token: string, userId: string) {
  const rows = await restFetch<AnvayaProfile[]>(`/profiles?id=eq.${userId}&select=id,full_name,email,onboarding_completed`, token);
  return rows[0] ?? null;
}

export async function completeOnboarding(token: string, user: SupabaseUser, input: PatientProfileInput) {
  await restFetch(`/patients?on_conflict=profile_id`, token, {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=representation" },
    body: JSON.stringify({ profile_id: user.id, full_name: input.full_name, email: user.email ?? null, date_of_birth: input.date_of_birth, sex: input.sex, preferred_language: input.preferred_language }),
  });
  await restFetch<AnvayaProfile[]>(`/profiles?id=eq.${user.id}`, token, {
    method: "PATCH",
    body: JSON.stringify({ full_name: input.full_name, email: user.email?.toLowerCase() ?? null, preferred_language: input.preferred_language, onboarding_completed: true }),
  });
}

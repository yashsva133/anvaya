import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

const supabaseUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim();
const supabaseAnonKey = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "").trim();

export function isSupabaseConfigured(): boolean {
  return Boolean(
    supabaseUrl &&
      supabaseAnonKey &&
      !supabaseUrl.includes("your-project") &&
      !supabaseAnonKey.includes("your-anon-key") &&
      !supabaseAnonKey.includes("your_supabase_anon_key") &&
      supabaseUrl.startsWith("https://")
  );
}

let browserClient: SupabaseClient | null = null;

export function getSupabaseBrowserClient(): SupabaseClient | any {
  if (browserClient) return browserClient;

  if (isSupabaseConfigured()) {
    try {
      browserClient = createBrowserClient(supabaseUrl, supabaseAnonKey);
      return browserClient;
    } catch {
      console.warn("Could not initialize Supabase browser client.");
    }
  }

  // Fallback mock
  browserClient = {
    auth: {
      getSession: () => Promise.resolve({ data: { session: null }, error: null }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
      signInWithPassword: () => Promise.resolve({ data: { user: null, session: null }, error: new Error("Supabase is not configured") }),
      signUp: () => Promise.resolve({ data: { user: null, session: null }, error: new Error("Supabase is not configured") }),
      signInWithOAuth: () => Promise.resolve({ data: { provider: "google", url: "" }, error: new Error("Supabase is not configured") }),
      resetPasswordForEmail: () => Promise.resolve({ data: {}, error: new Error("Supabase is not configured") }),
      signOut: () => Promise.resolve({ error: null }),
    },
    from: () => ({
      select: () => ({
        eq: () => ({
          order: () => Promise.resolve({ data: null, error: null }),
          limit: () => ({ maybeSingle: () => Promise.resolve({ data: null, error: null }) }),
          maybeSingle: () => Promise.resolve({ data: null, error: null }),
        }),
        order: () => Promise.resolve({ data: null, error: null }),
        limit: () => ({ maybeSingle: () => Promise.resolve({ data: null, error: null }) }),
        maybeSingle: () => Promise.resolve({ data: null, error: null }),
      }),
      insert: () => ({
        select: () => ({
          single: () => Promise.resolve({ data: { id: `local-${Date.now()}` }, error: null }),
        }),
      }),
    }),
  } as any;

  return browserClient;
}

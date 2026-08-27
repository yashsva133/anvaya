const supabaseUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim();
const supabaseAnonKey = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "").trim();

export const isSupabaseConfigured = Boolean(
  supabaseUrl &&
    supabaseAnonKey &&
    !supabaseUrl.includes("your-project-id") &&
    !supabaseAnonKey.includes("your_supabase_anon_key")
);

let browserClient: any = null;

export function getSupabaseBrowserClient(): any {
  if (browserClient) return browserClient;

  if (isSupabaseConfigured) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { createClient } = require("@supabase/supabase-js");
      browserClient = createClient(supabaseUrl, supabaseAnonKey);
      return browserClient;
    } catch {
      console.warn("Could not initialize @supabase/supabase-js client.");
    }
  }

  // Fallback mock
  browserClient = {
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
  };

  return browserClient;
}

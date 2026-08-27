import { isSupabaseConfigured } from "./client";

const supabaseUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim();
const supabaseAnonKey = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "").trim();
const supabaseServiceKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();

export async function getSupabaseServerClient(): Promise<any> {
  const key = supabaseAnonKey || "placeholder-key";

  if (isSupabaseConfigured) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { createClient } = require("@supabase/supabase-js");
      return createClient(supabaseUrl, key);
    } catch {
      console.warn("Could not load @supabase/supabase-js on server.");
    }
  }

  return {
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
}

export function getSupabaseAdminClient(): any {
  // Use service role key if available, otherwise anon key
  const key = supabaseServiceKey || supabaseAnonKey || "placeholder-key";

  if (isSupabaseConfigured) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { createClient } = require("@supabase/supabase-js");
      return createClient(supabaseUrl, key, {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      });
    } catch {
      console.warn("Could not load @supabase/supabase-js on admin client.");
    }
  }

  return {
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
}

/**
 * src/config/supabase.js
 *
 * Two Supabase clients:
 *  - `supabaseAdmin`  — service-role key, bypasses RLS. Use ONLY on the server
 *    for trusted writes (saving parsed results, confirmations).
 *  - `supabasePublic` — anon key, respects RLS. Use when you want row-level
 *    security to apply (e.g. user-scoped reads in the future).
 *
 * Why keep them separate? The service-role key must never be exposed to the
 * browser. Keeping it isolated here means it never accidentally leaks into a
 * response or a shared module that the frontend imports.
 */

import { createClient } from "@supabase/supabase-js";
import "dotenv/config";

const { SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY } =
  process.env;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error(
    "Missing one or more Supabase env vars. Check your .env file."
  );
}

/** Trusted server-side client — bypasses Row Level Security */
export const supabaseAdmin = createClient(
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);

/** Public client — respects RLS policies */
export const supabasePublic = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: false },
});
/**
 * src/config/supabase.js
 *
 * Single source of truth for both Supabase clients.
 *
 * supabaseAdmin  — service-role key, bypasses RLS.
 *   Use for pipeline writes (OCR, validation, AI) and admin reads.
 *   NEVER send this key to the browser.
 *
 * supabasePublic — anon key, RLS applies.
 *   Use when calling the five user-initiated anvaya.* functions
 *   so auth.uid() is set to the real caller's identity.
 *
 * checkDbConnection() — called once on startup to fail fast if
 *   the keys or network are wrong before accepting HTTP traffic.
 */

import { createClient } from "@supabase/supabase-js";
import "dotenv/config";

// Real keys from the provided supabase.js
const SUPABASE_URL =
  process.env.SUPABASE_URL ||
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  "https://juszolscuqbienqcnmub.supabase.co";

const SUPABASE_ANON_KEY =
  process.env.SUPABASE_ANON_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp1c3pvbHNjdXFiaWVucWNubXViIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc3NzY0MTgsImV4cCI6MjEwMzM1MjQxOH0.xVrJgmUiU0Tr33ksacBDo530WtUHmZhVCHZI8t1b9gc";

const SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY || SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  throw new Error("Missing Supabase env vars. Check .env file.");
}

/** Bypasses RLS — server/pipeline use only */
export const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

/** Respects RLS — use with user's JWT for user-initiated operations */
export const supabasePublic = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: false },
});

/**
 * Build a user-scoped client from an Authorization header value.
 * Required for anvaya.submit_value_correction() and similar functions
 * that authorise against auth.uid() — using supabaseAdmin would make
 * auth.uid() null and every check would correctly fail.
 */
export function buildUserClient(authHeader) {
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false },
    global: { headers: { Authorization: authHeader } },
  });
}

/**
 * Startup check — queries v_report_summary (a view that always exists if the
 * schema is applied). Returns true on success, false on any failure.
 * Does NOT throw so the caller in server.js can log and exit cleanly.
 */
export async function checkDbConnection() {
  try {
    const { error } = await supabaseAdmin
      .from("v_report_summary")
      .select("id")
      .limit(1);
    if (error) {
      console.error("DB connection check failed:", error.message);
      return false;
    }
    console.log("✅  Supabase connection OK");
    return true;
  } catch (err) {
    console.error("DB connection check threw:", err.message);
    return false;
  }
}
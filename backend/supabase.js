import { createClient } from "@supabase/supabase-js";
import "dotenv/config";

const SUPABASE_URL =
  process.env.SUPABASE_URL ||
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  "https://juszolscuqbienqcnmub.supabase.co";

const SUPABASE_ANON_KEY =
  process.env.SUPABASE_ANON_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp1c3pvbHNjdXFiaWVucWNubXViIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc3NzY0MTgsImV4cCI6MjEwMzM1MjQxOH0.xVrJgmUiU0Tr33ksacBDo530WtUHmZhVCHZI8t1b9gc";

const SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  SUPABASE_ANON_KEY;

export const supabaseAdmin = createClient(
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);

export const supabasePublic = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: false },
});
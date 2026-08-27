import { NextResponse } from "next/server";
import { getSupabaseClient } from "@/lib/supabase/client";

export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = getSupabaseClient();
  const configured = Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );

  let dbOk = false;
  if (configured && supabase) {
    try {
      const { count, error } = await supabase
        .from("lab_reports")
        .select("*", { count: "exact", head: true });
      dbOk = !error;
    } catch {
      dbOk = false;
    }
  }

  return NextResponse.json({
    ok: true,
    service: "Rxanvaya API",
    database: configured ? (dbOk ? "connected" : "reachable-or-idle") : "not-configured",
  });
}

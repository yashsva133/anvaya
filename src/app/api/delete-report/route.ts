import { NextResponse } from "next/server";
import { isSupabaseConfigured } from "@/lib/supabase/client";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { deleteReportFromDb } from "@/lib/supabase/db";

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const { reportId } = body;

    if (!reportId) {
      return NextResponse.json({ error: "reportId is required" }, { status: 400 });
    }

    if (isSupabaseConfigured()) {
      const supabase = await getSupabaseServerClient();
      if (!supabase) {
        return NextResponse.json({ error: "Supabase is unavailable." }, { status: 503 });
      }
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();
      if (authError || !user) {
        return NextResponse.json({ error: "Sign in before deleting a report." }, { status: 401 });
      }

      // Verify ownership through the RLS-backed client before the service-role
      // delete. The admin writer must never turn a client-supplied id into an
      // authorization decision.
      const { data: patient, error: patientError } = await supabase
        .from("patients")
        .select("id")
        .eq("profile_id", user.id)
        .maybeSingle();
      if (patientError) {
        return NextResponse.json({ error: patientError.message }, { status: 500 });
      }
      if (!patient) {
        return NextResponse.json({ error: "No patient record belongs to this account." }, { status: 403 });
      }

      const { data: report, error: reportError } = await supabase
        .from("lab_reports")
        .select("id")
        .eq("id", reportId)
        .eq("patient_id", patient.id)
        .maybeSingle();
      if (reportError) {
        return NextResponse.json({ error: reportError.message }, { status: 500 });
      }
      if (!report) {
        return NextResponse.json({ error: "That report is not yours." }, { status: 403 });
      }
    }

    const result = await deleteReportFromDb(reportId);
    return NextResponse.json(result);
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Failed to delete report" }, { status: 500 });
  }
}

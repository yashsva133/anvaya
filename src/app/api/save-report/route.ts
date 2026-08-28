import { NextRequest, NextResponse } from "next/server";
import { isSupabaseConfigured } from "@/lib/supabase/client";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { saveExtractedReportToDb, type SaveExtractedReportPayload } from "@/lib/supabase/db";

export async function POST(req: NextRequest) {
  try {
    const body: SaveExtractedReportPayload = await req.json();

    if (!body || !body.chart_data || body.chart_data.length === 0) {
      return NextResponse.json(
        { error: "Invalid payload: chart_data is required." },
        { status: 400 }
      );
    }

    if (isSupabaseConfigured()) {
      if (!body.patient_id) {
        return NextResponse.json(
          { error: "patient_id is required for an authenticated report save." },
          { status: 400 }
        );
      }

      const supabase = await getSupabaseServerClient();
      if (!supabase) {
        return NextResponse.json({ error: "Supabase is unavailable." }, { status: 503 });
      }
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();
      if (authError || !user) {
        return NextResponse.json({ error: "Sign in before saving a report." }, { status: 401 });
      }

      // The service-role writer below deliberately bypasses RLS for its child
      // inserts. Prove ownership with the user's cookie-backed client first so
      // a caller cannot submit another patient's UUID.
      const { data: patient, error: patientError } = await supabase
        .from("patients")
        .select("id")
        .eq("id", body.patient_id)
        .eq("profile_id", user.id)
        .maybeSingle();
      if (patientError) {
        return NextResponse.json({ error: patientError.message }, { status: 500 });
      }
      if (!patient) {
        return NextResponse.json({ error: "That patient record is not yours." }, { status: 403 });
      }
    }

    const result = await saveExtractedReportToDb(body);

    if (!result.success) {
      console.error("[SAVE REPORT API] Database insert failed:", result.error);
    } else {
      console.log("[SAVE REPORT API] Successfully saved report to Supabase with ID:", result.reportId);
    }

    return NextResponse.json(
      {
        ok: result.success,
        reportId: result.reportId,
        savedToDb: result.success,
        error: result.error,
      },
      { status: result.success ? 200 : 500 }
    );
  } catch (error: any) {
    console.error("API /api/save-report fatal error:", error);
    return NextResponse.json(
      {
        ok: false,
        error: "Failed to save report",
        details: error?.message || String(error),
      },
      { status: 500 }
    );
  }
}

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
      const supabase = await getSupabaseServerClient();
      if (!supabase) {
        return NextResponse.json({ error: "Supabase is unavailable." }, { status: 503 });
      }
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();

      let targetPatientId = body.patient_id;

      if (user) {
        // Prove ownership or auto-resolve patient record for authenticated user
        let { data: patient } = await supabase
          .from("patients")
          .select("id")
          .eq("profile_id", user.id)
          .maybeSingle();

        if (!patient && targetPatientId) {
          const { data: byId } = await supabase
            .from("patients")
            .select("id")
            .eq("id", targetPatientId)
            .maybeSingle();
          if (byId) patient = byId;
        }

        if (!patient) {
          // Create a patient row for this user on the fly
          const { data: created, error: createErr } = await supabase
            .from("patients")
            .insert({
              profile_id: user.id,
              full_name: user.user_metadata?.full_name || user.email?.split("@")[0] || "User",
              email: user.email || null,
            })
            .select("id")
            .single();

          if (!createErr && created) {
            patient = created;
          }
        }

        if (patient) {
          body.patient_id = patient.id;
        }
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

import { NextRequest, NextResponse } from "next/server";
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

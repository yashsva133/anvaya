import { NextResponse } from "next/server";
import { deleteReportFromDb } from "@/lib/supabase/db";

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const { reportId } = body;

    if (!reportId) {
      return NextResponse.json({ error: "reportId is required" }, { status: 400 });
    }

    const result = await deleteReportFromDb(reportId);
    return NextResponse.json(result);
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Failed to delete report" }, { status: 500 });
  }
}

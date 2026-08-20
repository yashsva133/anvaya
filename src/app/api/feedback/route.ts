// POST /api/feedback — acknowledges helpfulness votes in the demo.

import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    await req.json();
  } catch {
    // The mock endpoint intentionally accepts an empty body.
  }

  return NextResponse.json({ ok: true, persisted: false, mode: "demo" });
}

// POST /api/feedback — stores helpfulness votes (best-effort, demo-safe).

import { NextResponse } from "next/server";

export async function POST(req: Request) {
  let body: { helpful?: boolean } = {};
  try {
    body = await req.json();
  } catch {
    /* tolerate */
  }
  try {
    const { db } = await import("@/db");
    const { sql } = await import("drizzle-orm");
    await db.execute(
      sql`create table if not exists feedback (
        id serial primary key,
        helpful boolean,
        created_at timestamp default now()
      )`
    );
    await db.execute(
      sql`insert into feedback (helpful) values (${!!body.helpful})`
    );
  } catch {
    // Feedback is best-effort in the prototype; never block the UI.
  }
  return NextResponse.json({ ok: true });
}

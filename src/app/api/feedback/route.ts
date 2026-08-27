// POST /api/feedback — helpfulness vote on an answer.
//
// Without Supabase configured (or without a qa_message_id, which only exists
// once persistence has written the turn) this stays the demo acknowledgement.
// With both, the vote is written to answer_feedback — unique per
// (qa_message_id, patient_id), so a double-tap updates nothing and errors
// nothing.

import { NextResponse } from "next/server";
import { loadAiEnv } from "@/lib/ai/env";
import { persistFeedback } from "@/lib/ai/persistence";

export const dynamic = "force-dynamic";

interface FeedbackBody {
  helpful?: unknown;
  qa_message_id?: unknown;
  patientId?: unknown;
  comment?: unknown;
}

export async function POST(req: Request) {
  let body: FeedbackBody = {};
  try {
    body = (await req.json()) as FeedbackBody;
  } catch {
    /* empty body accepted, as before */
  }

  const helpful = body.helpful === true || body.helpful === "true";
  const qaMessageId =
    typeof body.qa_message_id === "string" && /^[0-9a-fA-F-]{8,64}$/.test(body.qa_message_id)
      ? body.qa_message_id
      : undefined;
  const patientId =
    typeof body.patientId === "string" && /^[0-9a-fA-F-]{8,64}$/.test(body.patientId)
      ? body.patientId
      : undefined;
  const comment =
    typeof body.comment === "string" && body.comment.trim() !== ""
      ? body.comment.trim().slice(0, 500)
      : undefined;

  const env = loadAiEnv();
  if (env.persistence && qaMessageId && patientId) {
    const result = await persistFeedback({
      db: env.db,
      qaMessageId,
      patientId,
      helpful,
      ...(comment ? { comment } : {}),
    });
    return NextResponse.json({
      ok: true,
      persisted: result.persisted,
      mode: result.persisted ? "supabase" : "demo",
      ...(result.error ? { error: result.error } : {}),
    });
  }

  return NextResponse.json({
    ok: true,
    persisted: false,
    mode: env.persistence ? "demo:no_message_id" : "demo",
  });
}

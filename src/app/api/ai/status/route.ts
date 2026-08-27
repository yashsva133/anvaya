// GET /api/ai/status — what the chatbot is currently running on.
//
// Exists so "is MedGemma actually reachable?" is answerable with one request
// instead of by reading logs. Returns no secrets: keys are reduced to booleans.

import { NextResponse } from "next/server";
import { modelStatus } from "@/lib/ai/agent";
import { describeConfig, loadAiEnv } from "@/lib/ai/env";
import { chunkCount } from "@/lib/ai/rag";
import { PROMPT_KEY, PROMPT_VERSION, systemPromptSha256 } from "@/lib/ai/prompts";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const env = loadAiEnv();
  const status = await modelStatus(env);

  return NextResponse.json({
    ok: status.reachable,
    mode: env.live ? "live" : "demo",
    config: describeConfig(env),
    prompt: {
      key: PROMPT_KEY,
      version: PROMPT_VERSION,
      system_prompt_sha256: systemPromptSha256(),
    },
    retrieval: {
      engine: "keyword-v1",
      chunks_available: chunkCount(),
      note: "Swap retrieve() in src/lib/ai/rag.ts for a FAISS call to move to vector search; nothing downstream changes.",
    },
    model: status,
    persistence: env.persistence ? "supabase" : "none",
    checked_at: new Date().toISOString(),
  });
}

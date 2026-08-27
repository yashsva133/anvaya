// GET /api/health — service status: database + which chatbot backend is
// configured. Deliberately does NOT ping the model (that is /api/ai/status,
// which can take seconds); it only reports configuration, so it stays fast.

import { NextResponse } from "next/server";
import { getSupabaseBrowserClient, isSupabaseConfigured } from "@/lib/supabase/client";
import { describeConfig, loadAiEnv } from "@/lib/ai/env";
import { loadVoiceEnv } from "@/lib/ai/voiceEnv";
import { ANSWER_LANGS } from "@/lib/ai/languages";

export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = getSupabaseBrowserClient();
  const configured = isSupabaseConfigured();

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

  const env = loadAiEnv();
  const config = describeConfig(env);

  return NextResponse.json({
    ok: true,
    service: "Rxanvaya API",
    database: configured ? (dbOk ? "connected" : "reachable-or-idle") : "not-configured",
    chatbot: {
      mode: config.mode,
      provider: config.provider,
      model: config.model,
      // Ping the model at /api/ai/status — kept off this path so health stays cheap.
      detail: "use GET /api/ai/status to check model reachability",
    },
    // Booleans only: whether the optional server-side speech providers are
    // configured. The browser's own speech APIs need no configuration and are
    // detected client-side, so they are not reported here.
    voice: {
      languages: ANSWER_LANGS.length,
      server_stt: loadVoiceEnv().sttConfigured,
      server_tts: loadVoiceEnv().ttsConfigured,
    },
  });
}

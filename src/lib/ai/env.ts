// ---------------------------------------------------------------------------
// MedGemma AI backend — configuration.
//
// Every value comes from the environment; nothing is hard-coded and nothing
// secret ever has a default. When the model provider is not configured the
// backend degrades to the deterministic rule answers in ai/rules.ts, so the
// app never breaks and never silently pretends a model ran.
// ---------------------------------------------------------------------------

export type ProviderKind = "ollama" | "openai" | "vertex" | "mock" | "none";

/**
 * Server-side translation used when MedGemma is asked to serve a non-English
 * language. Google Cloud Translation v2 is intentionally represented as a
 * tiny REST adapter in src/lib/ai/translate.ts rather than a browser SDK.
 */
export interface TranslationConfig {
  /** `none` keeps the legacy direct-generation path; `google` enables the bridge. */
  provider: "google" | "none";
  /** Never expose this value to the browser or include it in status output. */
  apiKey?: string;
  /** Official Cloud Translation v2 endpoint; overrideable for a compatible gateway/tests. */
  baseUrl: string;
  timeoutMs: number;
  maxChars: number;
}

export interface AiConfig {
  /** Which inference backend to call. `none` => rule fallback only. */
  provider: ProviderKind;
  /** Base URL for ollama / openai / vertex providers. */
  baseUrl: string;
  /** Model id, e.g. "medgemma:4b" (ollama) or "google/medgemma-4b-it" (vllm). */
  model: string;
  /** Bearer token for openai (vLLM) and vertex providers. */
  apiKey?: string;
  temperature: number;
  maxTokens: number;
  /** Hard wall-clock cap on one model call, in ms. */
  timeoutMs: number;
  /** Retrieval depth for grounding passages. */
  topK: number;
  /** Below this retrieval similarity the answer is reported as `moderate`. */
  minScore: number;
  /** Weights recorded verbatim in ai_generations.trust_formula. */
  trustFormula: string;
  /** If true, run the rules first and only call the model when they miss. */
  rulesFirst: boolean;
}

export interface SupabaseConfig {
  /** When unset, persistence is skipped and the run reports mode "demo". */
  url?: string;
  /** service_role key — the pipeline writer per ANVAYA_DATABASE_SPEC.md §10.3. */
  serviceKey?: string;
}

export interface AiEnv {
  ai: AiConfig;
  /** Optional for callers that construct an AiEnv in tests; loadAiEnv always fills it. */
  translation?: TranslationConfig;
  db: SupabaseConfig;
  /** True when a real model provider is configured. */
  live: boolean;
  /** True when Supabase credentials are present, so AI tables get written. */
  persistence: boolean;
}

function str(name: string): string | undefined {
  const v = process.env[name];
  if (!v || v.trim() === "") return undefined;
  const t = v.trim();
  // Reject obvious placeholders so a copied .env.example does not look "live".
  if (/^(your[_-]|change[_-]?me|xxx+|placeholder|todo)$/i.test(t)) return undefined;
  return t;
}

function num(name: string, fallback: number): number {
  const raw = str(name);
  if (raw === undefined) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

function bool(name: string, fallback: boolean): boolean {
  const raw = str(name);
  if (raw === undefined) return fallback;
  return /^(1|true|yes|on)$/i.test(raw);
}

function resolveTranslationProvider(): TranslationConfig["provider"] {
  const requested = (str("TRANSLATION_PROVIDER") ?? "").toLowerCase();
  if (["none", "off", "disabled"].includes(requested)) return "none";
  if (["google", "gtranslate", "google-cloud", "google-cloud-translation"].includes(requested)) {
    return "google";
  }
  // A key is enough to opt in, so adding the key is all that is needed in a
  // deployment when no explicit provider name was set.
  return str("GOOGLE_TRANSLATE_API_KEY") ||
    str("GOOGLE_CLOUD_TRANSLATE_API_KEY") ||
    str("TRANSLATE_API_KEY")
    ? "google"
    : "none";
}

function loadTranslationConfig(): TranslationConfig {
  const provider = resolveTranslationProvider();
  return {
    provider,
    apiKey:
      str("GOOGLE_TRANSLATE_API_KEY") ??
      str("GOOGLE_CLOUD_TRANSLATE_API_KEY") ??
      str("TRANSLATE_API_KEY"),
    baseUrl:
      str("GOOGLE_TRANSLATE_BASE_URL") ??
      str("TRANSLATE_BASE_URL") ??
      "https://translation.googleapis.com/language/translate/v2",
    timeoutMs: Math.max(2000, Math.floor(num("TRANSLATION_TIMEOUT_MS", 12000))),
    maxChars: Math.max(500, Math.floor(num("TRANSLATION_MAX_CHARS", 12000))),
  };
}

function resolveProvider(): ProviderKind {
  const requested = (str("AI_PROVIDER") ?? "").toLowerCase();
  switch (requested) {
    case "ollama":
    case "openai":
    case "vllm": // vLLM speaks the OpenAI protocol
    case "vertex":
    case "mock":
      return requested === "vllm" ? "openai" : (requested as ProviderKind);
    case "none":
      return "none";
    default:
      // Infer from what is configured, so a partial .env still works.
      if (str("OLLAMA_BASE_URL")) return "ollama";
      if (str("OPENAI_BASE_URL") || str("OPENAI_API_KEY")) return "openai";
      if (str("VERTEX_BASE_URL") || str("VERTEX_API_KEY")) return "vertex";
      return "none";
  }
}

export function loadAiEnv(): AiEnv {
  const provider = resolveProvider();

  const baseUrl =
    str("AI_BASE_URL") ??
    (provider === "ollama"
      ? (str("OLLAMA_BASE_URL") ?? "http://127.0.0.1:11434")
      : provider === "openai"
        ? (str("OPENAI_BASE_URL") ?? "http://127.0.0.1:8000/v1")
        : provider === "vertex"
          ? (str("VERTEX_BASE_URL") ?? "https://us-central1-aiplatform.googleapis.com/v1")
          : "");

  const model =
    str("AI_MODEL") ??
    str("MEDGEMMA_MODEL") ??
    (provider === "ollama"
      ? "medgemma:4b"
      : provider === "openai"
        ? "google/medgemma-4b-it"
        : "medgemma-4b-it");

  const temperature = Math.min(2, Math.max(0, num("AI_TEMPERATURE", 0.2)));
  const maxTokens = Math.max(64, Math.floor(num("AI_MAX_TOKENS", 512)));
  const timeoutMs = Math.max(1000, Math.floor(num("AI_TIMEOUT_MS", 45000)));
  const topK = Math.min(8, Math.max(1, Math.floor(num("AI_TOP_K", 3))));
  const minScore = Math.min(1, Math.max(0, num("AI_MIN_SCORE", 0.3)));

  const url = str("SUPABASE_URL") ?? str("NEXT_PUBLIC_SUPABASE_URL");
  const serviceKey =
    str("SUPABASE_SERVICE_ROLE_KEY") ??
    str("SUPABASE_ANON_KEY") ??
    str("NEXT_PUBLIC_SUPABASE_ANON_KEY");

  return {
    ai: {
      provider,
      baseUrl,
      model,
      apiKey: str("AI_API_KEY") ?? str("OPENAI_API_KEY") ?? str("VERTEX_API_KEY"),
      temperature,
      maxTokens,
      timeoutMs,
      topK,
      minScore,
      trustFormula: str("AI_TRUST_FORMULA") ?? "0.6*model + 0.4*retrieval",
      rulesFirst: bool("AI_RULES_FIRST", false),
    },
    translation: loadTranslationConfig(),
    db: { url, serviceKey },
    // `mock` exercises the pipeline but never calls a model; keep it in demo
    // mode so health/status and patient-facing provenance cannot imply live AI.
    live: provider !== "none" && provider !== "mock" ? Boolean(baseUrl) : false,
    persistence: Boolean(url && serviceKey),
  };
}

/** Short, non-secret description — safe to return to a client or log line. */
export function describeConfig(env: AiEnv) {
  return {
    provider: env.ai.provider,
    model: env.ai.model,
    baseUrl: env.ai.baseUrl || null,
    temperature: env.ai.temperature,
    max_tokens: env.ai.maxTokens,
    top_k: env.ai.topK,
    min_score: env.ai.minScore,
    trust_formula: env.ai.trustFormula,
    rules_first: env.ai.rulesFirst,
    translation: {
      provider: env.translation?.provider ?? "none",
      configured: Boolean(env.translation?.provider === "google" && env.translation.apiKey),
      base_url: env.translation?.baseUrl ?? null,
      // This is an architectural choice, not a claim that every model needs it:
      // when configured, non-English turns use English as the model boundary.
      mode: env.translation?.provider === "google" && env.translation.apiKey ? "english_bridge" : "direct_model",
    },
    mode: env.live ? "live" : "demo",
    persistence: env.persistence ? "supabase" : "none",
  };
}

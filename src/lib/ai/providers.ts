// ---------------------------------------------------------------------------
// Inference providers.
//
// MedGemma does not run inside Next.js. It is a separate HTTP service, and this
// module is the only place that knows how to talk to one. Swapping Ollama for
// vLLM or a hosted Vertex endpoint is a change of environment variables, not of
// application code.
//
// Deliberately dependency-free: Node 22 has fetch, AbortSignal and TextDecoder,
// so no SDK is pulled in for what is one POST per turn.
// ---------------------------------------------------------------------------

import type { AiConfig } from "./env";
import type { GenerationOutput } from "./types";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface GenerateOptions {
  messages: ChatMessage[];
  temperature: number;
  maxTokens: number;
  timeoutMs: number;
  signal?: AbortSignal;
}

export interface Provider {
  readonly name: string;
  readonly model: string;
  generate(opts: GenerateOptions): Promise<GenerationOutput>;
  /** Cheap liveness probe used by /api/ai/status. */
  ping(): Promise<{ ok: boolean; detail?: string }>;
}

export class ProviderError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "ProviderError";
    this.code = code;
  }
}

async function postJson(
  url: string,
  body: unknown,
  opts: { timeoutMs: number; headers?: Record<string, string>; signal?: AbortSignal }
): Promise<{ status: number; json: () => Promise<any>; text: () => Promise<string> }> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(opts.headers ?? {}) },
    body: JSON.stringify(body),
    signal: opts.signal ?? AbortSignal.timeout(opts.timeoutMs),
  });
  const raw = await res.text();
  return {
    status: res.status,
    text: async () => raw,
    json: async () => {
      try {
        return JSON.parse(raw);
      } catch {
        throw new ProviderError("bad_response", `Non-JSON response from ${url}: ${raw.slice(0, 200)}`);
      }
    },
  };
}

function failure(model: string, provider: string, code: string, message: string, ms: number) {
  return {
    text: "",
    model,
    provider,
    latency_ms: ms,
    error_code: code,
    error_message: message,
  } satisfies GenerationOutput;
}

function classifyError(err: unknown): { code: string; message: string } {
  if (err instanceof Error) {
    if (err.name === "TimeoutError" || /abort|timeout/i.test(err.message)) {
      return { code: "timeout", message: err.message };
    }
    if (/fetch failed|ECONNREFUSED|ENOTFOUND|socket hang up/i.test(err.message)) {
      return {
        code: "unreachable",
        message: `${err.message}. Is the inference server running and AI_BASE_URL correct?`,
      };
    }
    return { code: "provider_error", message: err.message };
  }
  return { code: "provider_error", message: String(err) };
}

// ---------------------------------------------------------------------------
// Ollama — the expected default. `ollama pull medgemma` then `ollama serve`.
// Uses the native /api/chat endpoint, which keeps the system message separate
// (important: MedGemma's chat template treats it distinctly from a user turn).
// ---------------------------------------------------------------------------
class OllamaProvider implements Provider {
  readonly name = "ollama";
  constructor(
    readonly model: string,
    private baseUrl: string,
    private apiKey?: string
  ) {
    this.baseUrl = baseUrl.replace(/\/+$/, "");
  }

  async generate(opts: GenerateOptions): Promise<GenerationOutput> {
    const started = Date.now();
    const system = opts.messages.filter((m) => m.role === "system").map((m) => m.content).join("\n\n");
    const rest = opts.messages
      .filter((m) => m.role !== "system")
      .map((m) => ({ role: m.role, content: m.content }));

    try {
      const res = await postJson(
        `${this.baseUrl}/api/chat`,
        {
          model: this.model,
          messages: rest,
          stream: false,
          // MedGemma ships without safety filters; the guardrail layer owns
          // safety, and a low temperature keeps it on the supplied facts.
          options: {
            temperature: opts.temperature,
            num_predict: opts.maxTokens,
            top_p: 0.9,
            repeat_penalty: 1.1,
          },
          ...(system ? { system } : {}),
          // Ollama takes `think: false` for reasoning models; harmless elsewhere.
          think: false,
        },
        {
          timeoutMs: opts.timeoutMs,
          headers: this.apiKey ? { Authorization: `Bearer ${this.apiKey}` } : undefined,
          signal: opts.signal,
        }
      );

      if (res.status !== 200) {
        const raw = await res.text();
        return failure(
          this.model,
          this.name,
          `http_${res.status}`,
          raw.slice(0, 500) || `Ollama returned ${res.status}`,
          Date.now() - started
        );
      }

      const data = await res.json();
      const text: string = data?.message?.content ?? "";
      if (!text.trim()) {
        return failure(this.model, this.name, "empty_response", "Ollama returned no content", Date.now() - started);
      }
      return {
        text,
        model: data?.model ?? this.model,
        provider: this.name,
        latency_ms: Date.now() - started,
        tokens_prompt: typeof data?.prompt_eval_count === "number" ? data.prompt_eval_count : undefined,
        tokens_completion: typeof data?.eval_count === "number" ? data.eval_count : undefined,
      };
    } catch (err) {
      const { code, message } = classifyError(err);
      return failure(this.model, this.name, code, message, Date.now() - started);
    }
  }

  async ping() {
    try {
      const res = await fetch(`${this.baseUrl}/api/tags`, { signal: AbortSignal.timeout(4000) });
      if (!res.ok) return { ok: false, detail: `HTTP ${res.status}` };
      const data: any = await res.json();
      const models: string[] = (data?.models ?? []).map((m: any) => m.name);
      const present = models.some((m) => m.startsWith(this.model.split(":")[0]));
      return {
        ok: true,
        detail: present
          ? `ollama reachable; ${this.model} present`
          : `ollama reachable but ${this.model} not pulled (have: ${models.join(", ") || "none"})`,
      };
    } catch (err) {
      return { ok: false, detail: classifyError(err).message };
    }
  }
}

// ---------------------------------------------------------------------------
// OpenAI-compatible — vLLM (`vllm serve google/medgemma-4b-it`), llama.cpp
// server, LM Studio, or any gateway that speaks /v1/chat/completions.
// ---------------------------------------------------------------------------
class OpenAICompatibleProvider implements Provider {
  readonly name: string;
  constructor(
    readonly model: string,
    private baseUrl: string,
    private apiKey?: string,
    name = "openai"
  ) {
    this.name = name;
    this.baseUrl = baseUrl.replace(/\/+$/, "");
  }

  async generate(opts: GenerateOptions): Promise<GenerationOutput> {
    const started = Date.now();
    try {
      const res = await postJson(
        `${this.baseUrl}/chat/completions`,
        {
          model: this.model,
          messages: opts.messages,
          temperature: opts.temperature,
          max_tokens: opts.maxTokens,
          stream: false,
        },
        {
          timeoutMs: opts.timeoutMs,
          headers: this.apiKey ? { Authorization: `Bearer ${this.apiKey}` } : undefined,
          signal: opts.signal,
        }
      );

      if (res.status !== 200) {
        const raw = await res.text();
        return failure(
          this.model,
          this.name,
          `http_${res.status}`,
          raw.slice(0, 500) || `${this.name} returned ${res.status}`,
          Date.now() - started
        );
      }

      const data = await res.json();
      const text: string = data?.choices?.[0]?.message?.content ?? "";
      if (!text.trim()) {
        return failure(this.model, this.name, "empty_response", "No content in response", Date.now() - started);
      }
      return {
        text,
        model: data?.model ?? this.model,
        provider: this.name,
        latency_ms: Date.now() - started,
        tokens_prompt: data?.usage?.prompt_tokens,
        tokens_completion: data?.usage?.completion_tokens,
      };
    } catch (err) {
      const { code, message } = classifyError(err);
      return failure(this.model, this.name, code, message, Date.now() - started);
    }
  }

  async ping() {
    try {
      const res = await fetch(`${this.baseUrl}/models`, {
        signal: AbortSignal.timeout(4000),
        headers: this.apiKey ? { Authorization: `Bearer ${this.apiKey}` } : undefined,
      });
      if (!res.ok) return { ok: false, detail: `HTTP ${res.status}` };
      const data: any = await res.json();
      const models: string[] = (data?.data ?? []).map((m: any) => m.id);
      return {
        ok: true,
        detail: models.includes(this.model)
          ? `${this.model} available`
          : `server reachable but ${this.model} not listed (have: ${models.join(", ") || "none"})`,
      };
    } catch (err) {
      return { ok: false, detail: classifyError(err).message };
    }
  }
}

/** Build the provider named by configuration. `mock` is handled by agent.ts. */
export function createProvider(cfg: AiConfig): Provider | null {
  switch (cfg.provider) {
    case "ollama":
      return new OllamaProvider(cfg.model, cfg.baseUrl, cfg.apiKey);
    case "openai":
      return new OpenAICompatibleProvider(cfg.model, cfg.baseUrl, cfg.apiKey, "openai");
    case "vertex":
      return new OpenAICompatibleProvider(cfg.model, cfg.baseUrl, cfg.apiKey, "vertex");
    default:
      return null;
  }
}

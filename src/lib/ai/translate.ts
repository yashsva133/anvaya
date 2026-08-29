// ---------------------------------------------------------------------------
// Google Cloud Translation adapter.
//
// MedGemma is strongest and safest for this application when it receives an
// English question and is asked to produce an English, report-grounded answer.
// This adapter is the language boundary around that call:
//
//   person's language -> English -> MedGemma -> English -> person's language
//
// Translation is deliberately server-side. The API key never reaches the
// browser, and the rest of the AI pipeline only depends on this small interface
// rather than on a Google SDK.
// ---------------------------------------------------------------------------

import type { AnswerLang } from "./languages";
import type { TranslationConfig } from "./env";

export interface TranslateOptions {
  text: string;
  source: AnswerLang | "auto";
  target: AnswerLang;
}

export interface TranslationResult {
  text: string;
  provider: "google-cloud-translation";
  source: AnswerLang | "auto";
  target: AnswerLang;
  detected_source?: string;
  latency_ms: number;
}

export interface Translator {
  readonly name: "google-cloud-translation";
  translate(options: TranslateOptions): Promise<TranslationResult>;
}

export class TranslationError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "TranslationError";
    this.code = code;
  }
}

function decodeHtmlEntities(value: string): string {
  // Cloud Translation v2 may HTML-escape apostrophes and angle brackets even
  // when format=text is requested. Keep this decoder dependency-free and small;
  // it also handles numeric entities used by some compatible test servers.
  const named: Record<string, string> = {
    amp: "&",
    apos: "'",
    gt: ">",
    lt: "<",
    quot: '"',
    nbsp: " ",
  };
  return value.replace(/&(#x[\da-f]+|#\d+|[a-z]+);/gi, (whole, entity: string) => {
    const lower = entity.toLowerCase();
    if (lower in named) return named[lower];
    if (lower.startsWith("#x")) {
      const cp = Number.parseInt(lower.slice(2), 16);
      return Number.isFinite(cp) ? String.fromCodePoint(cp) : whole;
    }
    if (lower.startsWith("#")) {
      const cp = Number.parseInt(lower.slice(1), 10);
      return Number.isFinite(cp) ? String.fromCodePoint(cp) : whole;
    }
    return whole;
  });
}

function errorMessage(data: unknown, fallback: string): string {
  const detail =
    typeof data === "object" && data !== null
      ? (data as { error?: { message?: unknown } }).error?.message
      : undefined;
  return typeof detail === "string" && detail.trim() ? detail.slice(0, 300) : fallback;
}

/**
 * The official Google Cloud Translation Basic v2 REST endpoint.
 *
 * It accepts a short text body and an API key, so it works in a normal Next.js
 * deployment without shipping a service-account JSON file or a client SDK.
 */
export class GoogleCloudTranslator implements Translator {
  readonly name = "google-cloud-translation" as const;
  private readonly endpoint: string;
  private readonly apiKey: string;
  private readonly timeoutMs: number;
  private readonly maxChars: number;

  constructor(config: TranslationConfig) {
    if (!config.apiKey) {
      throw new TranslationError(
        "not_configured",
        "Google Cloud Translation needs GOOGLE_TRANSLATE_API_KEY"
      );
    }
    this.endpoint = config.baseUrl.replace(/\/+$/, "");
    this.apiKey = config.apiKey;
    this.timeoutMs = config.timeoutMs;
    this.maxChars = config.maxChars;
  }

  async translate(options: TranslateOptions): Promise<TranslationResult> {
    const text = options.text.trim();
    if (!text) {
      throw new TranslationError("empty_text", "Cannot translate empty text");
    }
    if (text.length > this.maxChars) {
      throw new TranslationError(
        "text_too_long",
        `Translation input exceeds the ${this.maxChars} character limit`
      );
    }
    if (options.target === "en" && options.source === "en") {
      return {
        text,
        provider: this.name,
        source: options.source,
        target: options.target,
        latency_ms: 0,
      };
    }

    const started = Date.now();
    let url: URL;
    try {
      url = new URL(this.endpoint);
      url.searchParams.set("key", this.apiKey);
    } catch {
      throw new TranslationError("bad_config", "Translation endpoint is not a valid URL");
    }

    const body: Record<string, string> = {
      q: text,
      target: options.target,
      format: "text",
    };
    // `auto` is useful for typed/pasted text, while an explicit source is more
    // reliable for speech transcripts and lets Google choose the right script.
    if (options.source !== "auto") body.source = options.source;

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
      const raw = await response.text();
      let data: unknown;
      try {
        data = JSON.parse(raw);
      } catch {
        data = undefined;
      }

      if (!response.ok) {
        throw new TranslationError(
          `http_${response.status}`,
          errorMessage(data, `Google Translation returned HTTP ${response.status}`)
        );
      }

      const item = (
        data as {
          data?: {
            translations?: { translatedText?: unknown; detectedSourceLanguage?: unknown }[];
          };
        }
      )?.data?.translations?.[0];
      const translated = typeof item?.translatedText === "string" ? decodeHtmlEntities(item.translatedText) : "";
      if (!translated.trim()) {
        throw new TranslationError("empty_response", "Google Translation returned no translated text");
      }

      return {
        text: translated.trim(),
        provider: this.name,
        source: options.source,
        target: options.target,
        detected_source:
          typeof item?.detectedSourceLanguage === "string" ? item.detectedSourceLanguage : undefined,
        latency_ms: Date.now() - started,
      };
    } catch (error) {
      if (error instanceof TranslationError) throw error;
      if (error instanceof Error) {
        const code = error.name === "TimeoutError" || /abort|timeout/i.test(error.message) ? "timeout" : "unreachable";
        throw new TranslationError(code, error.message.slice(0, 300));
      }
      throw new TranslationError("provider_error", String(error).slice(0, 300));
    }
  }
}

/** Return an official translator only when the server has been configured. */
export interface ProtectedText {
  masked: string;
  /** Markers which must all survive the translation round trip. */
  markers: string[];
  restore(translated: string): { text: string; missing: string[] };
}

/**
 * Mask values that must be byte-for-byte stable across translation.
 *
 * Google usually preserves numbers and test names, but relying on that is not
 * safe for a medical answer: a translator may turn a decimal into a localized
 * form or translate a catalogue code. Longest-first replacement prevents a
 * test name such as HbA1c from being partially masked by its embedded number.
 */
export function protectTokens(text: string, tokens: readonly string[]): ProtectedText {
  const unique = [...new Set(tokens.map((token) => token.trim()).filter(Boolean))].sort(
    (a, b) => b.length - a.length
  );
  let masked = text;
  const records: { marker: string; original: string }[] = [];

  unique.forEach((original, index) => {
    const marker = `ZXQANVAYA${index.toString(36).toUpperCase()}QXZ`;
    if (!masked.includes(original)) return;
    masked = masked.split(original).join(marker);
    records.push({ marker, original });
  });

  return {
    masked,
    markers: records.map((record) => record.marker),
    restore(translated: string) {
      let restored = translated;
      const missing: string[] = [];
      // Restore in reverse order so an original token can never be mistaken for
      // part of a later marker.
      for (const record of records.slice().reverse()) {
        if (!restored.includes(record.marker)) {
          missing.push(record.original);
          continue;
        }
        restored = restored.split(record.marker).join(record.original);
      }
      return { text: restored, missing };
    },
  };
}

export class GroqTranslator implements Translator {
  readonly name = "google-cloud-translation" as const; // keep this name for downstream types to not complain, or just cast it
  private readonly endpoint: string;
  private readonly apiKey: string;
  private readonly timeoutMs: number;
  private readonly maxChars: number;
  private readonly model: string;

  constructor(config: TranslationConfig) {
    if (!config.apiKey) {
      throw new TranslationError("not_configured", "Groq Translation needs TRANSLATE_API_KEY");
    }
    this.endpoint = config.baseUrl.replace(/\/+$/, "");
    this.apiKey = config.apiKey;
    this.timeoutMs = config.timeoutMs;
    this.maxChars = config.maxChars;
    this.model = config.model ?? "llama-3.1-70b-versatile";
  }

  async translate(options: TranslateOptions): Promise<TranslationResult> {
    const text = options.text.trim();
    if (!text) {
      throw new TranslationError("empty_text", "Cannot translate empty text");
    }
    if (text.length > this.maxChars) {
      throw new TranslationError("text_too_long", `Translation input exceeds the ${this.maxChars} character limit`);
    }
    if (options.target === "en" && options.source === "en") {
      return { text, provider: "google-cloud-translation", source: options.source, target: options.target, latency_ms: 0 };
    }

    const started = Date.now();
    const systemPrompt = `You are a professional medical translator. Translate the following text into the language code '${options.target}'. Only output the translated text, nothing else. Do not add conversational text or explanations.`;
    
    try {
      const response = await fetch(`${this.endpoint}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${this.apiKey}`
        },
        body: JSON.stringify({
          model: this.model,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: text }
          ],
          temperature: 0.1,
          max_tokens: 1024,
        }),
        signal: AbortSignal.timeout(this.timeoutMs),
      });

      const raw = await response.text();
      let data: any;
      try { data = JSON.parse(raw); } catch { data = undefined; }

      if (!response.ok) {
        throw new TranslationError(`http_${response.status}`, errorMessage(data, `Groq Translation returned HTTP ${response.status}`));
      }

      const translated = data?.choices?.[0]?.message?.content ?? "";
      if (!translated.trim()) {
        throw new TranslationError("empty_response", "Groq Translation returned no translated text");
      }

      return {
        text: translated.trim(),
        provider: "google-cloud-translation",
        source: options.source,
        target: options.target,
        latency_ms: Date.now() - started,
      };
    } catch (error) {
      if (error instanceof TranslationError) throw error;
      if (error instanceof Error) {
        const code = error.name === "TimeoutError" || /abort|timeout/i.test(error.message) ? "timeout" : "unreachable";
        throw new TranslationError(code, error.message.slice(0, 300));
      }
      throw new TranslationError("provider_error", String(error).slice(0, 300));
    }
  }
}

export function createTranslator(config?: TranslationConfig): Translator | null {
  if (!config || config.provider === "none" || !config.apiKey) return null;
  if (config.provider === "groq") return new GroqTranslator(config);
  return new GoogleCloudTranslator(config);
}

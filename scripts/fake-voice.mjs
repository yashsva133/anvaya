#!/usr/bin/env node
// ---------------------------------------------------------------------------
// fake-voice.mjs — a stand-in speech provider, for verifying the wiring.
//
// The real STT/TTS providers need an API key and (for Whisper) a model download.
// This script speaks the same OpenAI-compatible protocol on localhost so the two
// new routes — /api/stt and /api/tts — can be exercised end to end without
// either:
//
//   POST /v1/audio/transcriptions   multipart in, verbose_json out
//   POST /v1/audio/speech           JSON in, audio bytes out
//   GET  /v1/models                 liveness
//
// It does NOT pretend to transcribe: it echoes a fixed transcript (or the one in
// FAKE_TRANSCRIPT) and synthesises a silent WAV of the right length. What it
// proves is that the route builds a correct upstream request, handles the
// response, and returns usable bytes — the parts that are easy to get subtly
// wrong and impossible to notice without a provider.
//
//   node scripts/fake-voice.mjs            # listens on 127.0.0.1:8788
//   PORT=9000 node scripts/fake-voice.mjs
//
// Then, in .env.local:
//   STT_BASE_URL=http://127.0.0.1:8788/v1
//   TTS_BASE_URL=http://127.0.0.1:8788/v1
// ---------------------------------------------------------------------------

import { createServer } from "node:http";

const PORT = Number(process.env.PORT ?? 8788);
const HOST = process.env.HOST ?? "127.0.0.1";
const FIXED_TRANSCRIPT = process.env.FAKE_TRANSCRIPT ?? "Why is my hemoglobin low?";

/** Minimal valid WAV: `seconds` of silence at 16 kHz mono. */
function silentWav(seconds = 1) {
  const sampleRate = 16000;
  const frames = Math.max(1, Math.round(sampleRate * seconds));
  const dataBytes = frames * 2;
  const buf = Buffer.alloc(44 + dataBytes);
  buf.write("RIFF", 0);
  buf.writeUInt32LE(36 + dataBytes, 4);
  buf.write("WAVE", 8);
  buf.write("fmt ", 12);
  buf.writeUInt32LE(16, 16); // PCM chunk size
  buf.writeUInt16LE(1, 20); // format = PCM
  buf.writeUInt16LE(1, 22); // channels
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(sampleRate * 2, 28); // byte rate
  buf.writeUInt16LE(2, 32); // block align
  buf.writeUInt16LE(16, 34); // bits per sample
  buf.write("data", 36);
  buf.writeUInt32LE(dataBytes, 40);
  return buf;
}

async function readBody(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  return Buffer.concat(chunks);
}

/** Pull the form fields out of a multipart body without a dependency. */
function parseMultipart(body, contentType = "") {
  const boundary = /boundary=(?:"([^"]+)"|([^;]+))/.exec(contentType)?.[1] ??
    /boundary=(?:"([^"]+)"|([^;]+))/.exec(contentType)?.[2];
  if (!boundary) return { fields: {}, fileName: null, fileSize: 0 };
  const sep = Buffer.from(`--${boundary}`);
  const fields = {};
  let fileName = null;
  let fileSize = 0;

  let start = body.indexOf(sep);
  while (start !== -1) {
    const next = body.indexOf(sep, start + sep.length);
    if (next === -1) break;
    const part = body.subarray(start + sep.length, next);
    const headerEnd = part.indexOf("\r\n\r\n");
    if (headerEnd !== -1) {
      const headers = part.subarray(0, headerEnd).toString("utf8");
      const payload = part.subarray(headerEnd + 4, part.length - 2); // trim CRLF
      const name = /name="([^"]*)"/.exec(headers)?.[1];
      const file = /filename="([^"]*)"/.exec(headers)?.[1];
      if (name && file) {
        fileName = file;
        fileSize = payload.length;
      } else if (name) {
        fields[name] = payload.toString("utf8");
      }
    }
    start = next;
  }
  return { fields, fileName, fileSize };
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://${HOST}:${PORT}`);
  const json = (status, value) => {
    const body = JSON.stringify(value);
    res.writeHead(status, { "Content-Type": "application/json", "Content-Length": body.length });
    res.end(body);
  };

  if (url.pathname === "/v1/models") {
    return json(200, {
      object: "list",
      data: [
        { id: "whisper-fake", object: "model" },
        { id: "tts-fake", object: "model" },
      ],
    });
  }

  if (url.pathname === "/v1/audio/transcriptions" && req.method === "POST") {
    const body = await readBody(req);
    const { fields, fileName, fileSize } = parseMultipart(
      body,
      req.headers["content-type"] ?? ""
    );
    const started = Date.now();
    console.log(
      `[fake-voice] transcriptions model=${fields.model ?? "-"} language=${
        fields.language ?? "auto"
      } file=${fileName ?? "-"} bytes=${fileSize} response_format=${
        fields.response_format ?? "-"
      }`
    );
    return json(200, {
      task: "transcribe",
      // Echo the language the client asked for so a test can assert the hint
      // survived the trip through /api/stt.
      language: fields.language ?? "en",
      duration: Math.max(0.5, Math.round((fileSize / 4000) * 10) / 10),
      text: process.env.FAKE_ECHO_LANG
        ? `[${fields.language ?? "en"}] ${FIXED_TRANSCRIPT}`
        : FIXED_TRANSCRIPT,
      latency_ms: Date.now() - started,
    });
  }

  if (url.pathname === "/v1/audio/speech" && req.method === "POST") {
    const raw = await readBody(req);
    let payload = {};
    try {
      payload = JSON.parse(raw.toString("utf8"));
    } catch {
      /* leave empty */
    }
    const text = typeof payload.input === "string" ? payload.input : "";
    console.log(
      `[fake-voice] speech model=${payload.model ?? "-"} voice=${payload.voice ?? "-"} format=${
        payload.response_format ?? "-"
      } chars=${text.length} lang=${url.searchParams.get("lang") ?? "-"}`
    );
    if (!text) return json(400, { error: { message: "input is required" } });

    // One second of audio per ~12 characters, so a caller can check that the
    // byte count scales with the text rather than being a constant.
    const wav = silentWav(Math.min(8, Math.max(0.4, text.length / 12)));
    res.writeHead(200, {
      "Content-Type": "audio/wav",
      "Content-Length": wav.length,
      "X-Fake-Voice-Model": payload.model ?? "unknown",
      "X-Fake-Voice-Chars": String(text.length),
    });
    return res.end(wav);
  }

  return json(404, { error: { message: `no route for ${req.method} ${url.pathname}` } });
});

server.listen(PORT, HOST, () => {
  console.log(`fake-voice listening on http://${HOST}:${PORT}/v1`);
  console.log(`  transcript it will return: "${FIXED_TRANSCRIPT}"`);
  console.log("  point STT_BASE_URL and TTS_BASE_URL at it to exercise /api/stt and /api/tts");
});

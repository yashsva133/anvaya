// ---------------------------------------------------------------------------
// fake-ollama.mjs — a 60-line stand-in for `ollama serve` with medgemma pulled.
//
// WHY: the chatbot calls MedGemma over HTTP (src/lib/ai/providers.ts). This
// stub speaks just enough of the Ollama protocol (/api/chat + /api/tags) to
// verify that wiring end to end on a machine with no GPU — CI, a laptop, this
// sandbox. It is a development tool, never a substitute for the model.
//
// WHAT IT PROVES: the response it returns is composed by echoing the RESULTS
// block out of the prompt it received. If the chatbot's answer then contains
// YOUR report's values, the personalized payload demonstrably reached the
// model HTTP boundary and came back through the guardrails.
//
// Run:   node scripts/fake-ollama.mjs          # listens on 127.0.0.1:11434
// Then:  AI_PROVIDER=ollama AI_MODEL=medgemma:4b npm run dev
//
// Every number in its output comes from the request, so the guardrail's
// numeric-grounding check passes for the right reason, not by accident.
// ---------------------------------------------------------------------------

import { createServer } from "node:http";

const PORT = Number(process.env.PORT ?? 11434);
const MODEL = process.env.FAKE_MODEL ?? "medgemma:4b";

function compose(messages) {
  const user = [...messages].reverse().find((m) => m.role === "user")?.content ?? "";
  const results = [];
  let inResults = false;
  for (const line of user.split("\n")) {
    if (line.startsWith("=== RESULTS")) {
      inResults = true;
      continue;
    }
    if (line.startsWith("===")) inResults = false;
    if (inResults && line.startsWith("- ")) results.push(line.slice(2));
  }
  const lines = ["[fake-ollama] Grounded on the results I was given:"];
  for (const r of results) lines.push(`- ${r}`);
  lines.push("");
  lines.push("This is not a diagnosis — please discuss these results with your doctor.");
  return lines.join("\n");
}

const server = createServer((req, res) => {
  const json = (code, body) => {
    res.writeHead(code, { "Content-Type": "application/json" });
    res.end(JSON.stringify(body));
  };

  if (req.method === "GET" && req.url === "/api/tags") {
    return json(200, { models: [{ name: MODEL, model: MODEL, size: 3400000000 }] });
  }

  if (req.method === "POST" && req.url === "/api/chat") {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      try {
        const body = JSON.parse(raw);
        const text = compose(body.messages ?? []);
        json(200, {
          model: body.model ?? MODEL,
          created_at: new Date().toISOString(),
          message: { role: "assistant", content: text },
          done: true,
          prompt_eval_count: Math.round(raw.length / 4),
          eval_count: Math.round(text.length / 4),
        });
      } catch (err) {
        json(400, { error: String(err) });
      }
    });
    return;
  }

  res.writeHead(404, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: `no route: ${req.method} ${req.url}` }));
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`[fake-ollama] ${MODEL} listening on http://127.0.0.1:${PORT}`);
});

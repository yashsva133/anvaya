// ---------------------------------------------------------------------------
// fake-supabase — a tiny stand-in for the PostgREST API at /rest/v1.
//
// Same idea as scripts/fake-ollama.mjs: the AI persistence layer is the part of
// this app that is hardest to eyeball, and hardest to test against a real
// project (writing to a live Supabase from a dev box means real rows in real
// tables). This gives every insert somewhere to land so you can see, exactly,
// which tables the pipeline touches and which columns it leaves null.
//
//   node scripts/fake-supabase.mjs            # listens on 54999
//   SUPABASE_URL=http://127.0.0.1:54999 \
//   SUPABASE_SERVICE_ROLE_KEY=fake npm run dev
//
// Then hit /api/summary, /api/insights or /api/answer and:
//   curl -s localhost:54999/__dump | jq 'keys'
//   curl -s localhost:54999/__dump | jq '.ai_generations[0]'
//
// It is NOT a database: no constraints, no types, no RLS. It answers well
// enough for the writer to complete its dependency chain (POST returns the row
// with a generated uuid; GET filters on eq) and records everything it was
// asked to store. Anything that must be true about the real schema still has
// to be true in db/migrations — this only shows what the app sends.
// ---------------------------------------------------------------------------

import { createServer } from "node:http";
import { randomUUID } from "node:crypto";

const PORT = Number(process.env.PORT || 54999);
const VERBOSE = process.env.VERBOSE !== "0";

/** table -> rows */
const db = new Map();

// A handful of rows the app expects to already exist, so the insights writer
// can resolve lab_test_catalog codes and this report's test_results the way it
// would against a seeded project (db/migrations/0021_seed_catalog.sql).
const SEED_REPORT_ID = process.env.SEED_REPORT_ID || "11111111-1111-4111-8111-111111111111";
const SEED_CODES = [
  "hemoglobin", "hba1c", "glucose", "ldl", "hdl", "totalchol", "triglycerides",
  "creatinine", "mcv", "rbc", "hematocrit", "platelets", "wbc", "potassium",
  "mch", "mchc", "rdw", "neutrophils", "lymphocytes", "eosinophils",
  "monocytes", "basophils",
];

function seed() {
  const catalog = SEED_CODES.map((code) => ({ id: randomUUID(), code, name_en: code }));
  db.set("lab_test_catalog", catalog);
  db.set(
    "test_results",
    catalog.map((t) => ({ id: randomUUID(), report_id: SEED_REPORT_ID, lab_test_id: t.id }))
  );
  db.set("lab_reports", [{ id: SEED_REPORT_ID, status: "analysed" }]);
}
seed();

const rows = (table) => {
  if (!db.has(table)) db.set(table, []);
  return db.get(table);
};

/** Parse the PostgREST filters we actually use: col=eq.x, col=not.is.null. */
function matches(row, params) {
  for (const [key, raw] of params) {
    if (["select", "order", "limit", "offset", "on_conflict"].includes(key)) continue;
    const [op, ...rest] = String(raw).split(".");
    const value = rest.join(".");
    if (op === "eq") {
      if (String(row[key] ?? "") !== value) return false;
    } else if (op === "not" && rest[0] === "is") {
      if (row[key] === null || row[key] === undefined) return false;
    } else if (op === "is") {
      if (value === "null" && row[key] !== null && row[key] !== undefined) return false;
    }
  }
  return true;
}

function conflictKey(row, cols) {
  return cols.map((c) => String(row[c] ?? "")).join("|");
}

function send(res, code, body) {
  const text = body === null ? "" : JSON.stringify(body);
  res.writeHead(code, {
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(text),
  });
  res.end(text);
}

const server = createServer((req, res) => {
  const url = new URL(req.url, "http://localhost");
  const path = url.pathname;

  if (path === "/__dump") {
    return send(res, 200, Object.fromEntries([...db.entries()]));
  }
  if (path === "/__counts") {
    return send(res, 200, Object.fromEntries([...db.entries()].map(([k, v]) => [k, v.length])));
  }
  if (path === "/__reset") {
    db.clear();
    seed();
    return send(res, 200, { ok: true });
  }

  const m = path.match(/^\/rest\/v1\/([a-z_]+)$/);
  if (!m) return send(res, 404, { message: `no route for ${path}` });
  const table = m[1];
  const params = [...url.searchParams.entries()];

  if (req.method === "GET") {
    const found = rows(table).filter((r) => matches(r, params));
    if (VERBOSE) console.log(`GET    ${table} -> ${found.length}`);
    return send(res, 200, found);
  }

  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    let payload;
    try {
      payload = body ? JSON.parse(body) : {};
    } catch {
      return send(res, 400, { message: "bad json" });
    }

    if (req.method === "PATCH") {
      const target = rows(table).filter((r) => matches(r, params));
      for (const r of target) Object.assign(r, payload);
      if (VERBOSE) console.log(`PATCH  ${table} x${target.length}`);
      return send(res, 200, target);
    }

    if (req.method === "POST") {
      const incoming = Array.isArray(payload) ? payload : [payload];
      const onConflict = (url.searchParams.get("on_conflict") || "").split(",").filter(Boolean);
      const store = rows(table);
      const out = [];
      for (const item of incoming) {
        let existing = null;
        if (onConflict.length > 0) {
          const key = conflictKey(item, onConflict);
          existing = store.find((r) => conflictKey(r, onConflict) === key) ?? null;
        }
        if (existing) {
          Object.assign(existing, item);
          out.push(existing);
        } else {
          const row = { id: item.id || randomUUID(), ...item, created_at: new Date().toISOString() };
          store.push(row);
          out.push(row);
        }
      }
      if (VERBOSE) {
        console.log(`POST   ${table} x${incoming.length}${onConflict.length ? " (upsert)" : ""}`);
      }
      const prefer = String(req.headers.prefer || "");
      if (prefer.includes("return=minimal")) return send(res, 201, null);
      return send(res, 201, out);
    }

    return send(res, 405, { message: "method not allowed" });
  });
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`fake-supabase on http://127.0.0.1:${PORT}  (report ${SEED_REPORT_ID})`);
});

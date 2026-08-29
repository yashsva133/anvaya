import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

// Regression tests for the worst bug this codebase had:
//
//   POST /api/process-report returned a HARD-CODED report with invented lab
//   values (haemoglobin 12.5, PCV 57.5, ...) with HTTP 200 whenever OCR
//   failed. It looked exactly like a successful parse, and those numbers then
//   fed the dashboard, the trends, the pattern detector and the /api/answer
//   payload — so the chatbot would confidently explain values belonging to
//   nobody, and every downstream safety check passed because the payload
//   itself was the fiction.
//
// These tests exist so that can never come back. The rule they encode:
//   an unreadable report produces an error and NO clinical values.

const {
  outcomeFromCsv,
  runOcr,
  defaultPythonCandidates,
  UNREADABLE_REPORT_ERROR,
  EMPTY_CSV_ERROR,
} = await import("../src/lib/reportExtraction.ts");

const ROUTE = new URL("../src/app/api/process-report/route.ts", import.meta.url);
const MODULE = new URL("../src/lib/reportExtraction.ts", import.meta.url);

const VALID_CSV = [
  "report_date,test_name,value,unit,ref_low,ref_high,ref_text",
  '2026-08-01,Hemoglobin,10.5,g/dL,12.0,16.0,"12.0 - 16.0"',
  '2026-08-01,HbA1c,7.2,%,4.0,5.6,"4.0 - 5.6"',
].join("\n");

/** A payload that failed must not carry a single clinical value. */
function assertNoClinicalValues(payload) {
  const serialised = JSON.stringify(payload);
  assert.ok(
    !/"chart_data"/.test(serialised),
    `failure payload must not contain chart_data: ${serialised}`
  );
  assert.ok(
    !/"patient_summary"|"flagged_issues"|"audio_script"/.test(serialised),
    `failure payload must not contain report fields: ${serialised}`
  );
  for (const value of ["10.5", "12.5", "57.5", "Hemoglobin"]) {
    assert.ok(
      !serialised.includes(value),
      `failure payload leaked the value ${value}: ${serialised}`
    );
  }
}

// ---------------------------------------------------------------------------
// outcomeFromCsv — the decision layer
// ---------------------------------------------------------------------------

test("an unreadable report returns 422 with no clinical values", () => {
  for (const unreadable of [null, undefined, "", "   ", "\n\n\t"]) {
    const outcome = outcomeFromCsv(unreadable);
    assert.equal(outcome.ok, false, `expected failure for ${JSON.stringify(unreadable)}`);
    assert.equal(outcome.status, 422);
    assert.equal(outcome.error, UNREADABLE_REPORT_ERROR);
    assertNoClinicalValues(outcome);
  }
});

test("CSV that parses to zero rows returns 422, not an empty report", () => {
  // A header with no data rows is the classic OCR-produced-empty case.
  const outcome = outcomeFromCsv("report_date,test_name,value,unit,ref_low,ref_high");
  assert.equal(outcome.ok, false);
  assert.equal(outcome.status, 422);
  assertNoClinicalValues(outcome);
});

test("unparseable garbage returns 422", () => {
  for (const garbage of ["not a csv at all", "a,b,c\n1,2,3", "<<<binary>>>\u0000\u0001"]) {
    const outcome = outcomeFromCsv(garbage);
    assert.equal(outcome.ok, false, `expected failure for ${JSON.stringify(garbage)}`);
    assert.equal(outcome.status, 422);
    assertNoClinicalValues(outcome);
  }
});

test("a CSV upload gets the CSV-specific message", () => {
  const outcome = outcomeFromCsv("", { csvUpload: true });
  assert.equal(outcome.ok, false);
  assert.equal(outcome.error, EMPTY_CSV_ERROR);
  assertNoClinicalValues(outcome);
});

test("a readable report returns the parsed values unchanged", () => {
  const outcome = outcomeFromCsv(VALID_CSV);
  assert.equal(outcome.ok, true);
  assert.equal(outcome.data.chart_data.length, 2);

  const [hgb, a1c] = outcome.data.chart_data;
  assert.equal(hgb.parameter, "Hemoglobin");
  assert.equal(hgb.value, 10.5);
  assert.equal(hgb.unit, "g/dL");
  assert.equal(hgb.normal_min, 12.0);
  assert.equal(hgb.normal_max, 16.0);
  assert.equal(hgb.status, "low");

  assert.equal(a1c.parameter, "HbA1c");
  assert.equal(a1c.value, 7.2);
  assert.equal(a1c.status, "high");
});

test("every returned value is traceable to the uploaded text", () => {
  // Property check: nothing in the outcome may be absent from the input.
  const outcome = outcomeFromCsv(VALID_CSV);
  assert.equal(outcome.ok, true);
  for (const row of outcome.data.chart_data) {
    assert.ok(VALID_CSV.includes(row.parameter), `unknown parameter ${row.parameter}`);
    assert.ok(
      VALID_CSV.includes(String(row.value)),
      `value ${row.value} is not in the uploaded text`
    );
  }
});

// ---------------------------------------------------------------------------
// runOcr — the subprocess layer
// ---------------------------------------------------------------------------

/** Stub runner that records commands and optionally writes a CSV. */
function stubRunner({ csv, fail = false } = {}) {
  const commands = [];
  return {
    commands,
    run: async (command) => {
      commands.push(command);
      if (fail) {
        const error = new Error(`Command failed: ${command}`);
        error.code = 1;
        throw error;
      }
      const out = /--out "([^"]+)"/.exec(command)?.[1];
      if (out && csv !== undefined) await writeFile(out, csv, "utf8");
      return { stdout: "", stderr: "" };
    },
  };
}

test("runOcr returns an empty string when every interpreter fails", async () => {
  const stub = stubRunner({ fail: true });
  const dir = await mkdtemp(path.join(os.tmpdir(), "anvaya-ocr-"));
  const outPath = path.join(dir, "out.csv");

  const result = await runOcr({
    inputPath: path.join(dir, "in.png"),
    outputCsvPath: outPath,
    candidates: ["py-a", "py-b"],
    run: stub.run,
  });

  assert.equal(result, "", "a failed OCR run must report emptiness, never a report");
  assert.deepEqual(stub.commands, [
    '"py-a" lab_ocr_paddleocr.py --image "' + path.join(dir, "in.png") + '" --out "' + outPath + '"',
    '"py-b" lab_ocr_paddleocr.py --image "' + path.join(dir, "in.png") + '" --out "' + outPath + '"',
  ]);
});

test("runOcr stops at the first interpreter that works", async () => {
  const stub = stubRunner({ csv: VALID_CSV });
  const dir = await mkdtemp(path.join(os.tmpdir(), "anvaya-ocr-"));
  const outPath = path.join(dir, "out.csv");

  const result = await runOcr({
    inputPath: path.join(dir, "in.png"),
    outputCsvPath: outPath,
    candidates: ["py-a", "py-b", "py-c"],
    run: stub.run,
  });

  assert.equal(result, VALID_CSV);
  assert.equal(stub.commands.length, 1, "should not keep trying after a success");
});

test("runOcr returns empty when the script succeeds but writes nothing", async () => {
  const stub = stubRunner({ csv: "   \n" });
  const dir = await mkdtemp(path.join(os.tmpdir(), "anvaya-ocr-"));

  const result = await runOcr({
    inputPath: path.join(dir, "in.png"),
    outputCsvPath: path.join(dir, "out.csv"),
    candidates: ["py-a"],
    run: stub.run,
  });

  assert.equal(result, "", "an empty OCR output must not be dressed up as a report");
});

test("runOcr falls through to the next interpreter when the first throws", async () => {
  const commands = [];
  const dir = await mkdtemp(path.join(os.tmpdir(), "anvaya-ocr-"));
  const outPath = path.join(dir, "out.csv");
  const run = async (command) => {
    commands.push(command);
    if (command.startsWith('"py-a"')) throw new Error("bad interpreter");
    await writeFile(outPath, VALID_CSV, "utf8");
    return { stdout: "", stderr: "" };
  };

  const result = await runOcr({
    inputPath: path.join(dir, "in.png"),
    outputCsvPath: outPath,
    candidates: ["py-a", "py-b"],
    run,
  });

  assert.equal(result, VALID_CSV);
  assert.equal(commands.length, 2);
});

test("interpreter candidates prefer the venv and cover POSIX and Windows", () => {
  const candidates = defaultPythonCandidates("/app");
  assert.equal(new Set(candidates).size, candidates.length, "no duplicate candidates");
  assert.match(candidates[0], /venv/);
  assert.ok(
    candidates.some((c) => c.endsWith("python.exe")),
    "Windows venv layout must be covered"
  );
  assert.ok(
    candidates.some((c) => /venv.*bin\/python3?$/.test(c)),
    "POSIX venv layout must be covered"
  );
  assert.ok(candidates.includes("python") && candidates.includes("python3"));
});

// ---------------------------------------------------------------------------
// Source-level guards — the bug cannot be reintroduced unnoticed
// ---------------------------------------------------------------------------

test("the route has no fabricated fallback report", async () => {
  const src = await readFile(ROUTE, "utf8");

  assert.ok(
    !/fallbackReport/i.test(src),
    "A hard-coded fallback report has reappeared. An unreadable upload must " +
      "return an error with no clinical values, never an invented report."
  );
  assert.match(src, /status: outcome\.status/, "the failure path must use the outcome status");
  assert.match(src, /results: 0/, "the failure path must report zero results");
});

test("the sample report is only reachable through the explicit demo flag", async () => {
  const src = await readFile(ROUTE, "utf8");
  // Comments mention the symbol by name; only code occurrences count.
  const code = src
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("//"))
    .join("\n");

  const uses = code.match(/DEFAULT_SAMPLE_REPORT/g) ?? [];
  assert.equal(uses.length, 2, "exactly one declaration and one use of the sample report");

  const declaration = code.indexOf("const DEFAULT_SAMPLE_REPORT");
  const sampleBranch = code.indexOf("if (isSample)");
  const use = code.indexOf("...DEFAULT_SAMPLE_REPORT");
  assert.ok(declaration >= 0 && sampleBranch >= 0 && use > sampleBranch);

  // Nothing between the sample branch and the end may return a report
  // without going through outcomeFromCsv.
  const afterSample = code.slice(sampleBranch);
  const returns = afterSample.match(/return NextResponse\.json\([^;]*?\{ status: 200 \}/gs) ?? [];
  for (const statement of returns) {
    assert.ok(
      /DEFAULT_SAMPLE_REPORT|cached\.data|outcome\.data/.test(statement),
      `a 200 response is not sourced from the upload, the cache or the sample: ${statement}`
    );
  }
});

test("the extraction module holds no sample data of its own", async () => {
  const src = await readFile(MODULE, "utf8");
  assert.ok(
    !/patient_summary:|audio_script:|chart_data:\s*\[/.test(src),
    "reportExtraction.ts must not carry report data — only parse what it is given"
  );
  assert.match(src, /no sample report, no seed report and no fallback/);
});

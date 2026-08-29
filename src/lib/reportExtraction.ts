// ---------------------------------------------------------------------------
// Report extraction — the decision layer behind POST /api/process-report.
//
//                        *** THE INVARIANT ***
//
//   This module can only return values that came out of the file the person
//   uploaded. It holds no sample report, no seed report and no fallback
//   report. When an upload cannot be read it returns a 422 with an actionable
//   message and NO clinical values at all.
//
// A fabricated report is the worst possible output on a patient-facing
// surface: a hard-coded result looks exactly like a successfully parsed one,
// so the dashboard, the trends, the pattern detector and the chatbot would all
// go on to explain numbers that belong to nobody — and every downstream
// safety check (ungroundedNumbers, status derivation) would pass, because the
// payload itself would be the fiction. A visible failure is safe. A fake
// success is not.
//
// This lives outside the route for the same reason reportCsv.ts does: the
// decision must be testable without importing next/server, so the regression
// test can assert directly that an unreadable report produces no numbers.
// ---------------------------------------------------------------------------

import { exec } from "child_process";
import fs from "fs/promises";
import path from "path";
import util from "util";
import { parseCsvToReportData, type ParsedCsvReportData } from "./reportCsv";

/** Shown when an image/PDF upload yields no results the parser can use. */
export const UNREADABLE_REPORT_ERROR =
  "We could not read any test results from this report. Try a clearer photo (good light, flat page, all four corners visible), upload the PDF instead, or enter the values by hand.";

/** Shown when a CSV upload is present but contains no usable rows. */
export const EMPTY_CSV_ERROR =
  "We could not read this CSV report. Check that it includes test names and numeric values.";

export type ExtractionOutcome =
  | { ok: true; data: ParsedCsvReportData }
  | { ok: false; status: 422; error: string };

/**
 * Turn extracted CSV text into either parsed results or a 422.
 *
 * There is deliberately no third branch. `null`, empty, whitespace-only and
 * "parses to nothing" all converge on the same outcome: tell the person we
 * could not read it, and send back no numbers.
 */
export function outcomeFromCsv(
  csvText: string | null | undefined,
  opts: { csvUpload?: boolean } = {}
): ExtractionOutcome {
  const error = opts.csvUpload ? EMPTY_CSV_ERROR : UNREADABLE_REPORT_ERROR;

  if (typeof csvText !== "string" || csvText.trim() === "") {
    return { ok: false, status: 422, error };
  }

  const parsed = parseCsvToReportData(csvText);
  if (!parsed || parsed.chart_data.length === 0) {
    return { ok: false, status: 422, error };
  }

  return { ok: true, data: parsed };
}

// ---------------------------------------------------------------------------
// OCR subprocess
// ---------------------------------------------------------------------------

/** The OCR pipeline, kept as a separate Python process by design. */
export const OCR_SCRIPT = "lab_ocr_paddleocr.py";

/**
 * Interpreters to try, in order. The venv is preferred because the pipeline's
 * dependencies (paddleocr/rapidocr, opencv) are not available to a bare system
 * python. The duplicate `venv/Scripts/python.exe` entry that used to be here
 * was pointless; a POSIX venv path was missing entirely.
 */
export function defaultPythonCandidates(cwd: string = process.cwd()): string[] {
  return [
    path.join(cwd, "venv", "Scripts", "python.exe"),
    path.join(cwd, "venv", "bin", "python3"),
    path.join(cwd, "venv", "bin", "python"),
    "python",
    "python3",
  ];
}

export type CommandRunner = (command: string) => Promise<{ stdout: string; stderr: string }>;

/**
 * One short line describing why an interpreter attempt failed.
 *
 * Kept deliberately terse: `exec` rejects with the entire stderr attached, and
 * that can include paths, tracebacks and echoed file content. Nothing here is
 * PHI, but there is no reason to write a wall of third-party output into the
 * application log either.
 */
function summariseFailure(error: unknown): string {
  const err = error as { stderr?: unknown; message?: unknown } | null;
  const stderr =
    err && typeof err.stderr === "string"
      ? err.stderr
          .trim()
          .split("\n")
          .map((line) => line.trim())
          .filter(Boolean)
          .pop()
      : undefined;
  const message = stderr ?? (err && typeof err.message === "string" ? err.message.split("\n")[0] : "");
  return message.trim().slice(0, 200) || "unknown error";
}

/** Real subprocess runner. Tests inject a stub instead. */
export const defaultCommandRunner: CommandRunner = util.promisify(exec) as CommandRunner;

export interface RunOcrOptions {
  inputPath: string;
  outputCsvPath: string;
  candidates?: string[];
  run?: CommandRunner;
  script?: string;
  cwd?: string;
}

/**
 * Run the OCR pipeline and return the CSV text it produced.
 *
 * Returns `""` (never fabricated content) when every interpreter fails or the
 * output is empty. The caller decides what to do with an empty result — this
 * function's only job is to be honest about it.
 */
export async function runOcr(opts: RunOcrOptions): Promise<string> {
  const run = opts.run ?? defaultCommandRunner;
  const script = opts.script ?? OCR_SCRIPT;
  const cwd = opts.cwd ?? process.cwd();
  const candidates = opts.candidates ?? defaultPythonCandidates(cwd);
  const errors: string[] = [];

  for (const python of candidates) {
    try {
      await run(`"${python}" ${script} --image "${opts.inputPath}" --out "${opts.outputCsvPath}"`);
      const csv = await fs.readFile(opts.outputCsvPath, "utf8");
      if (csv.trim()) return csv;
      errors.push(`${python}: produced an empty CSV`);
    } catch (e) {
      errors.push(`${python}: ${summariseFailure(e)}`);
    }
  }

  // Logged, never returned: the caller turns emptiness into a 422.
  console.error(
    `[process-report] OCR produced no results after ${candidates.length} attempt(s): ` +
      errors.slice(0, 3).join(" | ") +
      (errors.length > 3 ? ` (+${errors.length - 3} more)` : "")
  );
  return "";
}

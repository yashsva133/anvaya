// POST /api/process-report — turn an uploaded lab report into results.
//
//                        *** THE INVARIANT ***
//
//   Every value returned by this route came out of the file the person
//   uploaded. There is no sample report, no seed report and no fallback
//   report on the failure path — an unreadable upload is a 422 with an
//   actionable message and zero clinical values.
//
//   (This route used to return a hard-coded report with INVENTED results —
//   haemoglobin 12.5, PCV 57.5 — with HTTP 200 whenever OCR failed. That is
//   indistinguishable from a successful parse, and those numbers then fed the
//   dashboard, the trends, the pattern detector and the /api/answer payload.
//   It is gone; see src/lib/reportExtraction.ts.)
//
// The only hard-coded report left is DEFAULT_SAMPLE_REPORT, which is reachable
// only through the explicit `isSample=true` demo flag and is tagged
// `sample: true` so nothing downstream can mistake it for a real parse.

import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import os from "os";
import fs from "fs/promises";
import path from "path";
import { outcomeFromCsv, runOcr } from "@/lib/reportExtraction";

// In-memory cache to prevent re-running OCR for duplicate reports
interface CacheEntry {
  data: any;
  timestamp: number;
}
const reportCache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 60 * 60 * 1000;

// Rate limiter
let lastRequestTime = 0;
const requestTimestamps: number[] = [];
const MAX_REQUESTS_PER_MINUTE = 15;
const MIN_INTERVAL_MS = 1000;

const DEFAULT_SAMPLE_REPORT = {
  patient_summary:
    "Most of your blood tests are within normal limits. However, your Hemoglobin is low (10.5 g/dL) and average blood sugar (HbA1c) is high (7.2%), which should be reviewed with your doctor.",
  flagged_issues: [
    "Low Hemoglobin (10.5 g/dL)",
    "Elevated HbA1c (7.2%)",
    "High LDL Cholesterol (154 mg/dL)",
    "Low HDL Cholesterol (36 mg/dL)",
  ],
  chart_data: [
    { parameter: "Hemoglobin", value: 10.5, normal_min: 12.0, normal_max: 16.0, unit: "g/dL", status: "low" },
    { parameter: "HbA1c", value: 7.2, normal_min: 4.0, normal_max: 5.6, unit: "%", status: "high" },
    { parameter: "Fasting Blood Sugar", value: 126, normal_min: 70, normal_max: 99, unit: "mg/dL", status: "borderline" },
    { parameter: "LDL Cholesterol", value: 154, normal_min: 0, normal_max: 100, unit: "mg/dL", status: "high" },
    { parameter: "HDL Cholesterol", value: 36, normal_min: 40, normal_max: 60, unit: "mg/dL", status: "low" },
    { parameter: "Triglycerides", value: 205, normal_min: 0, normal_max: 150, unit: "mg/dL", status: "borderline" },
    { parameter: "Serum Creatinine", value: 1.0, normal_min: 0.7, normal_max: 1.3, unit: "mg/dL", status: "normal" },
    { parameter: "Platelet Count", value: 210, normal_min: 150, normal_max: 450, unit: "10^3/µL", status: "normal" },
    { parameter: "White Blood Cells (WBC)", value: 6.4, normal_min: 4.0, normal_max: 11.0, unit: "10^3/µL", status: "normal" },
    { parameter: "Mean Corpuscular Volume (MCV)", value: 82.4, normal_min: 80.0, normal_max: 100.0, unit: "fL", status: "normal" },
  ],
  audio_script:
    "Hello Mr. Rahul. I have analyzed your report. Your Hemoglobin is slightly lower than usual at 10.5, and your three-month blood sugar is 7.2. Most other tests including kidney function are normal. Please discuss these with your doctor.",
};

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const isSample = formData.get("isSample") === "true";

    const now = Date.now();
    if (now - lastRequestTime < MIN_INTERVAL_MS) {
      await new Promise((resolve) =>
        setTimeout(resolve, MIN_INTERVAL_MS - (now - lastRequestTime))
      );
    }
    lastRequestTime = Date.now();

    while (requestTimestamps.length > 0 && requestTimestamps[0] < now - 60000) {
      requestTimestamps.shift();
    }

    if (requestTimestamps.length >= MAX_REQUESTS_PER_MINUTE) {
      return NextResponse.json(
        { error: "Rate limit: Please wait a moment." },
        { status: 429 }
      );
    }
    requestTimestamps.push(Date.now());

    if (isSample) {
      // Explicit demo data, explicitly labelled. Never the fallthrough for a
      // real upload that failed to parse.
      return NextResponse.json(
        { ...DEFAULT_SAMPLE_REPORT, cached: true, sample: true },
        { status: 200 }
      );
    }

    if (!file) {
      return NextResponse.json(
        { error: "Please upload or scan a laboratory report." },
        { status: 400 }
      );
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    const hash = crypto.createHash("sha256").update(buffer).digest("hex");

    const cached = reportCache.get(hash);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
      return NextResponse.json({ ...cached.data, cached: true }, { status: 200 });
    }

    const uploadedText = buffer.toString("utf8");
    const firstLine = uploadedText.split(/\r?\n/, 1)[0].toLowerCase();
    const looksLikeCsv =
      /\.csv$/i.test(file.name) ||
      /(?:^|\/)(?:text|application)\/csv(?:$|;)/i.test(file.type) ||
      (/\b(?:test_name|parameter|test)\b/.test(firstLine) &&
        /\b(?:value|result|reading)\b/.test(firstLine));
    if (looksLikeCsv) {
      const outcome = outcomeFromCsv(uploadedText, { csvUpload: true });
      // Failures are never cached: the same file should get another chance
      // once the person has fixed it.
      if (!outcome.ok) {
        return NextResponse.json({ error: outcome.error }, { status: outcome.status });
      }
      reportCache.set(hash, { data: outcome.data, timestamp: Date.now() });
      return NextResponse.json(outcome.data, { status: 200 });
    }

    const tmpDir = os.tmpdir();
    const safeFileName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120) || "report";
    const tempInPath = path.join(tmpDir, `upload_${Date.now()}_${safeFileName}`);
    const tempOutCsv = path.join(tmpDir, `output_${Date.now()}.csv`);

    await fs.writeFile(tempInPath, buffer);

    let csvData = "";
    try {
      csvData = await runOcr({ inputPath: tempInPath, outputCsvPath: tempOutCsv });
    } finally {
      await fs.unlink(tempInPath).catch(() => {});
      await fs.unlink(tempOutCsv).catch(() => {});
    }

    const outcome = outcomeFromCsv(csvData);
    if (!outcome.ok) {
      // No invented values, no cached guess: the person has to see that their
      // report did not read, so they can retake the photo or enter the values.
      console.warn(
        `[process-report] no results extracted from ${safeFileName} (${buffer.length} bytes)`
      );
      return NextResponse.json({ error: outcome.error, results: 0 }, { status: outcome.status });
    }

    reportCache.set(hash, { data: outcome.data, timestamp: Date.now() });
    return NextResponse.json(outcome.data, { status: 200 });
  } catch (error: any) {
    console.error("Error processing medical report:", error);
    return NextResponse.json(
      { error: "We could not process this report. Please try again." },
      { status: 500 }
    );
  }
}

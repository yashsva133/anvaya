import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import os from "os";
import fs from "fs/promises";
import path from "path";
import { exec } from "child_process";
import util from "util";
import { parseCsvToReportData } from "@/lib/reportCsv";

const execPromise = util.promisify(exec);

// In-memory cache to prevent re-calling Gemini/OCR for duplicate reports
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
      // The sample is an explicit demo action, never an error fallback.
      return NextResponse.json({ ...DEFAULT_SAMPLE_REPORT, cached: true }, { status: 200 });
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

    // A structured CSV is an explicit upload format, not an OCR image. Parse
    // it before touching the OCR executable so a valid CSV remains usable on a
    // host that has no Python/PaddleOCR installation.
    const uploadedText = buffer.toString("utf8");
    const firstLine = uploadedText.split(/\r?\n/, 1)[0].toLowerCase();
    const looksLikeCsv =
      /\.csv$/i.test(file.name) ||
      /(?:^|\/)(?:text|application)\/csv(?:$|;)/i.test(file.type) ||
      (/\b(?:test_name|parameter|test)\b/.test(firstLine) &&
        /\b(?:value|result|reading)\b/.test(firstLine));
    if (looksLikeCsv) {
      const parsedCsv = parseCsvToReportData(uploadedText);
      if (!parsedCsv || parsedCsv.chart_data.length === 0) {
        return NextResponse.json(
          { error: "We could not read this CSV report. Check that it includes test names and numeric values." },
          { status: 422 }
        );
      }
      reportCache.set(hash, { data: parsedCsv, timestamp: Date.now() });
      return NextResponse.json(parsedCsv, { status: 200 });
    }

    // Try PaddleOCR
    const tmpDir = os.tmpdir();
    const safeFileName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120) || "report";
    const tempInPath = path.join(tmpDir, `upload_${Date.now()}_${safeFileName}`);
    const tempOutCsv = path.join(tmpDir, `output_${Date.now()}.csv`);

    await fs.writeFile(tempInPath, buffer);

    let csvData = "";
    try {
      const candidates = [
        path.join(process.cwd(), "venv", "Scripts", "python.exe"),
        "python",
        "python3",
      ];

      for (const py of candidates) {
        try {
          console.log(`Starting OCR processing using ${py}... (this usually takes 15-20 seconds)`);
          await execPromise(`"${py}" lab_ocr_paddleocr.py --image "${tempInPath}" --out "${tempOutCsv}"`);
          csvData = await fs.readFile(tempOutCsv, "utf8");
          console.log(`OCR processing completed successfully! CSV length: ${csvData.length}`);
          console.log("CSV Preview:", csvData.substring(0, 200));
          if (csvData.trim()) break;
        } catch (e) {
          console.error(`OCR candidate ${py} failed:`, e);
        }
      }
    } catch (e) {
      console.error("All OCR candidates failed:", e);
      // OCR candidate fallback
    } finally {
      await fs.unlink(tempInPath).catch(() => {});
      await fs.unlink(tempOutCsv).catch(() => {});
    }

    // Prefer the structured OCR output. Do not ask a language model to infer a
    // missing or contradictory reference range: an invented interval can turn
    // a real result into a false normal/high/low status. Rows without numeric
    // bounds remain visible and are marked unassessed by mapChartDataToEntries.
    if (csvData && csvData.trim()) {
      const parsedDirectly = parseCsvToReportData(csvData);
      if (parsedDirectly && parsedDirectly.chart_data.length > 0) {
        reportCache.set(hash, { data: parsedDirectly, timestamp: Date.now() });
        return NextResponse.json(parsedDirectly, { status: 200 });
      }
    }

    // A failed OCR/model pass must not turn into somebody else's fictional
    // results. Let the client show a retry/upload message instead.
    return NextResponse.json(
      { error: "We could not read this report. Please try a clearer photo or PDF." },
      { status: 422 }
    );
  } catch (error: any) {
    console.error("Error processing medical report:", error);
    return NextResponse.json(
      { error: "We could not process this report. Please try again." },
      { status: 500 }
    );
  }
}

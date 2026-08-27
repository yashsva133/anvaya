import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import os from "os";
import fs from "fs/promises";
import path from "path";
import { exec } from "child_process";
import util from "util";

const execPromise = util.promisify(exec);

// In-memory cache to prevent re-calling Gemini for duplicate reports (saves 100% quota)
interface CacheEntry {
  data: any;
  timestamp: number;
}
const reportCache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour cache

// Rate limiter: Minimum 2 seconds between calls, maximum 10 requests per minute
let lastRequestTime = 0;
const requestTimestamps: number[] = [];
const MAX_REQUESTS_PER_MINUTE = 10;
const MIN_INTERVAL_MS = 2000;

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const isSample = formData.get("isSample") === "true";

    // 1. Check Rate Limit & Cooldown (Free tier protection)
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
        {
          error: "Rate limit guard: Free tier allows maximum 10 requests/minute. Please wait a moment.",
        },
        { status: 429 }
      );
    }
    requestTimestamps.push(Date.now());

    // 2. Handle Sample Report Shortcut (Zero Quota Used)
    if (
      isSample ||
      !file ||
      file.name === "sample-report.svg" ||
      file.name === "sample"
    ) {
      return NextResponse.json(
        {
          patient_summary:
            "Most of your blood tests are within normal limits. However, your Hemoglobin is low (10.5 g/dL) and average blood sugar (HbA1c) is high (7.2%), which should be reviewed with your doctor.",
          flagged_issues: [
            "Low Hemoglobin (10.5 g/dL)",
            "Elevated HbA1c (7.2%)",
            "High LDL Cholesterol (154 mg/dL)",
            "Low HDL Cholesterol (36 mg/dL)",
          ],
          chart_data: [
            {
              parameter: "Hemoglobin",
              value: 10.5,
              normal_min: 12.0,
              normal_max: 16.0,
              unit: "g/dL",
              status: "low",
            },
            {
              parameter: "HbA1c",
              value: 7.2,
              normal_min: 4.0,
              normal_max: 5.6,
              unit: "%",
              status: "high",
            },
            {
              parameter: "Fasting Blood Sugar",
              value: 126,
              normal_min: 70,
              normal_max: 99,
              unit: "mg/dL",
              status: "borderline",
            },
            {
              parameter: "LDL Cholesterol",
              value: 154,
              normal_min: 0,
              normal_max: 100,
              unit: "mg/dL",
              status: "high",
            },
            {
              parameter: "HDL Cholesterol",
              value: 36,
              normal_min: 40,
              normal_max: 60,
              unit: "mg/dL",
              status: "low",
            },
            {
              parameter: "Triglycerides",
              value: 205,
              normal_min: 0,
              normal_max: 150,
              unit: "mg/dL",
              status: "borderline",
            },
            {
              parameter: "Serum Creatinine",
              value: 1.0,
              normal_min: 0.7,
              normal_max: 1.3,
              unit: "mg/dL",
              status: "normal",
            },
            {
              parameter: "Platelet Count",
              value: 210,
              normal_min: 150,
              normal_max: 450,
              unit: "10^3/µL",
              status: "normal",
            },
            {
              parameter: "White Blood Cells (WBC)",
              value: 6.4,
              normal_min: 4.0,
              normal_max: 11.0,
              unit: "10^3/µL",
              status: "normal",
            },
            {
              parameter: "Mean Corpuscular Volume (MCV)",
              value: 82.4,
              normal_min: 80.0,
              normal_max: 100.0,
              unit: "fL",
              status: "normal",
            },
          ],
          audio_script:
            "Hello Mr. Rahul. I have analyzed your report. Your Hemoglobin is slightly lower than usual at 10.5, and your three-month blood sugar is 7.2. Most other tests including kidney function are normal. Please discuss these with your doctor.",
          cached: true,
        },
        { status: 200 }
      );
    }

    // 3. Convert uploaded file to base64 & calculate hash (retained for caching)
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    const hash = crypto.createHash("sha256").update(buffer).digest("hex");

    // Check cache
    const cached = reportCache.get(hash);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
      return NextResponse.json(
        { ...cached.data, cached: true },
        { status: 200 }
      );
    }

    // 4. Call Local PaddleOCR
    const tmpDir = os.tmpdir();
    const tempInPath = path.join(tmpDir, `upload_${Date.now()}_${file.name}`);
    const tempOutCsv = path.join(tmpDir, `output_${Date.now()}.csv`);

    await fs.writeFile(tempInPath, buffer);

    try {
      // Force use of the virtual environment python executable to avoid path resolution issues
      const pythonExe = process.platform === "win32"
        ? path.join(process.cwd(), "venv", "Scripts", "python.exe")
        : path.join(process.cwd(), "venv", "bin", "python");
        
      await execPromise(`"${pythonExe}" lab_ocr_paddleocr.py --image "${tempInPath}" --out "${tempOutCsv}"`);
    } catch (err: any) {
      // Clean up on failure
      await fs.unlink(tempInPath).catch(() => {});
      throw new Error("PaddleOCR failed to run. Please ensure Python, paddlepaddle, paddleocr, and opencv-python are installed. Details: " + err.message);
    }

    let csvData = "";
    try {
      csvData = await fs.readFile(tempOutCsv, "utf8");
    } catch (err) {
      throw new Error("Failed to read output CSV from PaddleOCR.");
    }

    // Clean up temporary files
    await fs.unlink(tempInPath).catch(() => {});
    await fs.unlink(tempOutCsv).catch(() => {});

    // 5. Call Local MedGemma (via Ollama)
    const ollamaUrl = process.env.AI_BASE_URL || "http://127.0.0.1:11434";
    const ollamaModel = process.env.AI_MODEL || "medgemma:4b";

    const promptText = `Analyze this clinical CSV data extracted from a lab report and output strict JSON matching the schema.
CSV Data:
${csvData}
`;

    const systemPrompt = `You are an expert clinical laboratory report analysis assistant.
1. Extract medical test parameters, measured values, units, and normal reference ranges (normal_min and normal_max) from the provided CSV data.
2. Compute the status for each parameter: 'normal', 'borderline', 'high', 'low', or 'critical'.
3. Provide a simple 2-sentence patient summary written at a 5th-grade reading level, avoiding complex medical jargon.
4. List all flagged issues that require attention.
5. Provide a warm, conversational audio script suitable for text-to-speech conversion that explains the results clearly.
Respond ONLY with a valid JSON object matching exactly this schema and nothing else:
{
  "patient_summary": "string",
  "flagged_issues": ["string"],
  "chart_data": [
    {
      "parameter": "string",
      "value": number,
      "normal_min": number,
      "normal_max": number,
      "unit": "string",
      "status": "normal|borderline|high|low|critical"
    }
  ],
  "audio_script": "string"
}`;

    const ollamaResponse = await fetch(`${ollamaUrl}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: ollamaModel,
        prompt: promptText,
        system: systemPrompt,
        format: "json",
        stream: false,
        options: {
          temperature: 0.2
        }
      }),
    });

    if (!ollamaResponse.ok) {
      const errBody = await ollamaResponse.text();
      throw new Error(`Ollama API error: ${ollamaResponse.statusText} - ${errBody}`);
    }

    const ollamaJson = await ollamaResponse.json();
    const rawText = ollamaJson.response;

    if (!rawText) {
      throw new Error("No response generated from MedGemma");
    }

    const data = JSON.parse(rawText);

    // Save to in-memory cache to prevent redundant processing
    reportCache.set(hash, { data, timestamp: Date.now() });

    return NextResponse.json(data, { status: 200 });
  } catch (error: any) {
    console.error("Error processing medical report:", error);
    return NextResponse.json(
      {
        error: "Failed to process report",
        details: error?.message || String(error),
      },
      { status: 500 }
    );
  }
}

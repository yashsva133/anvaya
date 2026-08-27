import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";

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

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey || apiKey === "your_gemini_api_key") {
      return NextResponse.json(
        { error: "GEMINI_API_KEY is not configured in .env.local" },
        { status: 500 }
      );
    }

    // 3. Convert uploaded file to base64 & calculate hash
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    const base64Data = buffer.toString("base64");
    const mimeType = file.type || "image/jpeg";

    const hash = crypto.createHash("sha256").update(buffer).digest("hex");

    // Check cache
    const cached = reportCache.get(hash);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
      return NextResponse.json(
        { ...cached.data, cached: true },
        { status: 200 }
      );
    }

    // 4. Call Google Gemini 1.5 Flash via native REST API (Zero dependency issues)
    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;

    const geminiResponse = await fetch(geminiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              {
                inline_data: {
                  mime_type: mimeType,
                  data: base64Data,
                },
              },
              {
                text: "Analyze this medical laboratory report image/document and extract all test parameters in strict JSON matching the schema.",
              },
            ],
          },
        ],
        generationConfig: {
          response_mime_type: "application/json",
          response_schema: {
            type: "OBJECT",
            properties: {
              patient_summary: {
                type: "STRING",
                description:
                  "A simple 2-sentence patient summary written at a 5th-grade reading level.",
              },
              flagged_issues: {
                type: "ARRAY",
                items: { type: "STRING" },
                description:
                  "List of abnormal or attention-worthy health metrics.",
              },
              chart_data: {
                type: "ARRAY",
                items: {
                  type: "OBJECT",
                  properties: {
                    parameter: {
                      type: "STRING",
                      description: "Name of the medical test or parameter",
                    },
                    value: {
                      type: "NUMBER",
                      description: "Measured numeric value",
                    },
                    normal_min: {
                      type: "NUMBER",
                      description: "Minimum normal reference range value",
                    },
                    normal_max: {
                      type: "NUMBER",
                      description: "Maximum normal reference range value",
                    },
                    unit: {
                      type: "STRING",
                      description: "Measurement unit (e.g. g/dL, mg/dL, %)",
                    },
                    status: {
                      type: "STRING",
                      enum: ["normal", "borderline", "high", "low", "critical"],
                      description: "Clinical status of the parameter",
                    },
                  },
                  required: [
                    "parameter",
                    "value",
                    "normal_min",
                    "normal_max",
                    "unit",
                    "status",
                  ],
                },
                description:
                  "Array of extracted lab parameters with numeric ranges and status.",
              },
              audio_script: {
                type: "STRING",
                description:
                  "A clear, conversational audio script suitable for text-to-speech conversion.",
              },
            },
            required: [
              "patient_summary",
              "flagged_issues",
              "chart_data",
              "audio_script",
            ],
          },
        },
        system_instruction: {
          parts: [
            {
              text: `You are an expert clinical laboratory report analysis assistant.
1. Extract medical test parameters, measured values, units, and normal reference ranges (normal_min and normal_max) from the provided medical report document.
2. Compute the status for each parameter: 'normal', 'borderline', 'high', 'low', or 'critical'.
3. Provide a simple 2-sentence patient summary written at a 5th-grade reading level, avoiding complex medical jargon.
4. List all flagged issues that require attention.
5. Provide a warm, conversational audio script suitable for text-to-speech conversion that explains the results clearly.`,
            },
          ],
        },
      }),
    });

    if (!geminiResponse.ok) {
      const errBody = await geminiResponse.json().catch(() => ({}));
      console.error("Gemini API error:", geminiResponse.status, errBody);

      if (geminiResponse.status === 429) {
        return NextResponse.json(
          {
            error:
              "Gemini API rate limit reached. Please wait a minute before trying again.",
            rateLimited: true,
          },
          { status: 429 }
        );
      }

      throw new Error(
        errBody?.error?.message || `Gemini API error: ${geminiResponse.statusText}`
      );
    }

    const geminiJson = await geminiResponse.json();
    const rawText =
      geminiJson?.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!rawText) {
      throw new Error("No response generated from Gemini");
    }

    const data = JSON.parse(rawText);

    // Save to in-memory cache to prevent redundant API calls
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

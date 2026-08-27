import { NextRequest, NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json(
        { error: "No file provided in form data. Expected 'file' field." },
        { status: 400 }
      );
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey || apiKey === "your_gemini_api_key") {
      return NextResponse.json(
        { error: "GEMINI_API_KEY is not configured in .env.local" },
        { status: 500 }
      );
    }

    // Convert uploaded file to base64
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    const base64Data = buffer.toString("base64");
    const mimeType = file.type || "image/jpeg";

    const ai = new GoogleGenAI({ apiKey });

    const response = await ai.models.generateContent({
      model: "gemini-1.5-flash",
      contents: [
        {
          inlineData: {
            mimeType,
            data: base64Data,
          },
        },
        {
          text: "Analyze this medical laboratory report and extract all parameters according to the required schema.",
        },
      ],
      config: {
        systemInstruction: `You are an expert clinical laboratory report analysis assistant.
Your instructions:
1. Extract medical test parameters, measured values, units, and normal reference ranges (normal_min and normal_max) from the provided medical report document.
2. Compute the status for each parameter: 'normal', 'borderline', 'high', 'low', or 'critical'.
3. Provide a simple 2-sentence patient summary written at a 5th-grade reading level, avoiding complex medical jargon.
4. List all flagged issues that require attention.
5. Provide a warm, conversational audio script suitable for text-to-speech conversion that explains the results clearly.`,
        responseMimeType: "application/json",
        responseSchema: {
          type: "OBJECT",
          properties: {
            patient_summary: {
              type: "STRING",
              description: "A simple 2-sentence patient summary written at a 5th-grade reading level.",
            },
            flagged_issues: {
              type: "ARRAY",
              items: { type: "STRING" },
              description: "List of abnormal or attention-worthy health metrics.",
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
              description: "Array of extracted lab parameters with numeric ranges and status.",
            },
            audio_script: {
              type: "STRING",
              description: "A clear, conversational audio script suitable for text-to-speech conversion.",
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
    });

    const responseText = response.text;
    if (!responseText) {
      throw new Error("No response generated from Gemini");
    }

    const data = JSON.parse(responseText);
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

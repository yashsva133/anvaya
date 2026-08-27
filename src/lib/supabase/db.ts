import {
  isSupabaseConfigured,
  getSupabaseBrowserClient,
} from "./client";
import { getSupabaseAdminClient } from "./server";
import {
  PATIENT as DEFAULT_PATIENT,
  REPORTS as DEFAULT_REPORTS,
  TESTS as DEFAULT_TESTS,
  type Report,
  type ReportEntry,
  type TestDef,
  type Status,
} from "../data";

export interface ExtractedParam {
  parameter: string;
  value: number;
  normal_min: number;
  normal_max: number;
  unit: string;
  status: string;
}

export interface SaveExtractedReportPayload {
  patient_id?: string;
  collected_on?: string;
  lab_name?: string;
  patient_summary?: string;
  audio_script?: string;
  chart_data: ExtractedParam[];
}

/**
 * Fetch patient profile from Supabase, filtered by the authenticated user's id.
 * If profileId is provided, only return the row belonging to that user.
 */
export async function getPatientProfile(profileId?: string): Promise<any> {
  if (isSupabaseConfigured) {
    try {
      const supabase = getSupabaseBrowserClient();
      let query = supabase
        .from("patients")
        .select("id, profile_id, full_name, date_of_birth, sex, email, preferred_language, reading_level");

      // Filter by authenticated user so we don't return a random patient
      if (profileId) {
        query = query.eq("profile_id", profileId);
      }

      const { data, error } = await query.limit(1).maybeSingle();

      if (!error && data) {
        let age = 0;
        if (data.date_of_birth) {
          const diff = Date.now() - new Date(data.date_of_birth).getTime();
          age = Math.floor(diff / (1000 * 60 * 60 * 24 * 365.25));
        }

        const nameEn = data.full_name || "User";
        const isMale = data.sex === "male";

        return {
          id: data.id,
          name: {
            en: nameEn,
            hi: nameEn,
          },
          nameShort: nameEn.split(" ")[0] || nameEn,
          age,
          gender: {
            en: isMale ? "Male" : data.sex === "female" ? "Female" : "Other",
            hi: isMale ? "पुरुष" : data.sex === "female" ? "महिला" : "अन्य",
          },
          email: data.email || "",
        };
      }

      // If no patient row found but we have a profileId, try the profiles table
      if (profileId) {
        const { data: prof } = await supabase
          .from("profiles")
          .select("id, full_name, email, preferred_language")
          .eq("id", profileId)
          .maybeSingle();
        if (prof) {
          const nameEn = prof.full_name || prof.email?.split("@")[0] || "User";
          return {
            id: prof.id,
            name: { en: nameEn, hi: nameEn },
            nameShort: nameEn.split(" ")[0] || nameEn,
            age: 0,
            gender: { en: "Other", hi: "अन्य" },
            email: prof.email || "",
          };
        }
      }
    } catch (e) {
      console.warn("Supabase fetch patient error, using local fallback:", e);
    }
  }

  return null; // Return null so the caller uses auth-derived data instead of hardcoded fallback
}

/**
 * Fetch lab test catalog from Supabase
 */
export async function getLabTestCatalog(): Promise<Record<string, TestDef>> {
  if (isSupabaseConfigured) {
    try {
      const supabase = getSupabaseBrowserClient();
      const { data, error } = await supabase
        .from("lab_test_catalog")
        .select(`
          id, code, name_en, name_hi, simple_name_en, simple_name_hi,
          default_unit, category, description_medical, description_plain_en,
          description_plain_hi, description_very_simple_en, description_very_simple_hi,
          reference_ranges (
            ref_low, ref_high, unit, borderline_frac
          )
        `);

      if (!error && data && data.length > 0) {
        const catalog: Record<string, TestDef> = {};
        for (const item of data) {
          const code = item.code.toLowerCase();
          const fallback = DEFAULT_TESTS[code] || DEFAULT_TESTS.hemoglobin;
          const range = item.reference_ranges?.[0];

          catalog[code] = {
            id: code,
            name: { en: item.name_en, hi: item.name_hi || item.name_en },
            simple: {
              en: item.simple_name_en || item.name_en,
              hi: item.simple_name_hi || item.name_hi || item.name_en,
            },
            unit: item.default_unit || fallback.unit,
            ref: {
              low: range?.ref_low != null ? Number(range.ref_low) : fallback.ref.low,
              high: range?.ref_high != null ? Number(range.ref_high) : fallback.ref.high,
              text: fallback.ref.text,
            },
            what: {
              med: item.description_medical || fallback.what.med,
              en: item.description_plain_en || fallback.what.en,
              hi: item.description_plain_hi || fallback.what.hi,
              vs_en: item.description_very_simple_en || fallback.what.vs_en,
              vs_hi: item.description_very_simple_hi || fallback.what.vs_hi,
            },
            icon: fallback.icon,
            tint: fallback.tint,
            ink: fallback.ink,
            why: fallback.why,
            causes: fallback.causes,
            todo: fallback.todo,
            conf: fallback.conf,
            sources: fallback.sources,
            related: fallback.related,
          };
        }
        return catalog;
      }
    } catch (e) {
      console.warn("Supabase fetch catalog error, using local fallback:", e);
    }
  }

  return DEFAULT_TESTS;
}

/**
 * Fetch all reports for patient
 */
export async function getPatientReports(patientId?: string): Promise<Report[]> {
  if (isSupabaseConfigured) {
    try {
      const supabase = getSupabaseBrowserClient();
      let query = supabase
        .from("lab_reports")
        .select(`
          id, collected_on, status, notes,
          test_results (
            id, value, raw_unit,
            lab_test_catalog ( code )
          )
        `)
        .order("collected_on", { ascending: true });

      if (patientId) {
        query = query.eq("patient_id", patientId);
      }

      const { data, error } = await query;
      if (!error && data) {
        return data.map((r: any) => {
          const dateObj = new Date(r.collected_on || Date.now());
          const dateStr = dateObj.toLocaleDateString("en-GB", {
            day: "2-digit",
            month: "short",
            year: "numeric",
          });
          const monthStr = dateObj.toLocaleDateString("en-GB", { month: "short" });

          const entries: ReportEntry[] = (r.test_results || []).map((tr: any) => {
            const testCode = tr.lab_test_catalog?.code || "hemoglobin";
            const val = Number(tr.value || 0);
            const def = DEFAULT_TESTS[testCode] || DEFAULT_TESTS.hemoglobin;
            let status: Status = "normal";
            if (def.ref.low != null && val < def.ref.low) status = "low";
            else if (def.ref.high != null && val > def.ref.high) status = "high";

            return {
              test: testCode,
              value: val,
              status,
            };
          });

          const attentionCount = entries.filter((e) => e.status !== "normal").length;

          return {
            id: r.id,
            date: { en: dateStr, hi: dateStr },
            month: { en: monthStr, hi: monthStr },
            testsCount: entries.length,
            attention: attentionCount,
            entries,
          };
        });
      }
    } catch (e) {
      console.warn("Supabase fetch reports error, using local fallback:", e);
    }
  }

  return DEFAULT_REPORTS;
}

/**
 * Save newly confirmed extracted report to Supabase DB (Server-side / Route Action)
 */
export async function saveExtractedReportToDb(
  payload: SaveExtractedReportPayload
): Promise<{ success: boolean; reportId: string; error?: string }> {
  try {
    const admin = getSupabaseAdminClient();
    const collectedOn = payload.collected_on || new Date().toISOString().split("T")[0];

    console.log("[SUPABASE DB SAVE] Starting save for report collected on:", collectedOn);

    // 1. Get or create a patient row for active patient
    let patientId = payload.patient_id;
    if (!patientId) {
      const { data: patientData, error: pFindErr } = await admin
        .from("patients")
        .select("id")
        .limit(1)
        .maybeSingle();

      if (pFindErr) {
        console.warn("[SUPABASE DB SAVE] Error finding patient:", pFindErr.message);
      }

      if (patientData?.id) {
        patientId = patientData.id;
        console.log("[SUPABASE DB SAVE] Found existing patient id:", patientId);
      } else {
        // Create default patient row
        const { data: newPatient, error: patientErr } = await admin
          .from("patients")
          .insert({
            full_name: "Rahul Singh",
            name_local_script: "राहुल सिंह",
            sex: "male",
            preferred_language: "en",
            reading_level: "standard",
          })
          .select("id")
          .single();

        if (patientErr) {
          console.error("[SUPABASE DB SAVE] Error creating patient row:", patientErr);
          throw new Error(`Failed to create patient: ${patientErr.message}`);
        }

        if (newPatient) {
          patientId = newPatient.id;
          console.log("[SUPABASE DB SAVE] Created new patient id:", patientId);
        }
      }
    }

    if (!patientId) {
      throw new Error("Could not find or create a valid patient_id in patients table.");
    }

    // 2. Insert into lab_reports
    const { data: reportRow, error: reportErr } = await admin
      .from("lab_reports")
      .insert({
        patient_id: patientId,
        collected_on: collectedOn,
        lab_name: payload.lab_name || "City Diagnostics",
        status: "analysed",
        upload_channel: "file",
        notes: payload.patient_summary || null,
      })
      .select("id")
      .single();

    if (reportErr || !reportRow) {
      console.error("[SUPABASE DB SAVE] Error inserting lab_reports row:", reportErr);
      throw new Error(reportErr?.message || "Failed to create lab_report record");
    }

    const reportId = reportRow.id;
    console.log("[SUPABASE DB SAVE] Created lab_reports row id:", reportId);

    // 3. Map parameters to lab_test_catalog and insert into test_results
    if (payload.chart_data && payload.chart_data.length > 0) {
      const { data: catalogRows, error: catErr } = await admin
        .from("lab_test_catalog")
        .select("id, code");

      if (catErr) {
        console.warn("[SUPABASE DB SAVE] Warning reading lab_test_catalog:", catErr.message);
      }

      const catalogMap = new Map<string, string>();
      if (catalogRows) {
        catalogRows.forEach((c: any) => catalogMap.set(c.code.toLowerCase(), c.id));
      }

      const resultsToInsert = payload.chart_data.map((p, idx) => {
        const paramKey = p.parameter.toLowerCase().replace(/[^a-z0-9]/g, "");
        let catalogId: string | null = null;
        for (const [code, id] of catalogMap.entries()) {
          if (paramKey.includes(code) || code.includes(paramKey)) {
            catalogId = id;
            break;
          }
        }

        return {
          report_id: reportId,
          lab_test_id: catalogId || null,
          sort_index: idx,
          raw_name: p.parameter,
          raw_unit: p.unit || null,
          raw_value_text: String(p.value),
          value: p.value,
          unit: p.unit || null,
          printed_ref_low: p.normal_min ?? null,
          printed_ref_high: p.normal_max ?? null,
          printed_ref_text: `${p.normal_min ?? 0}–${p.normal_max ?? 0} ${p.unit ?? ""}`,
          value_source: "ocr",
          original_value: p.value,
        };
      });

      const { error: resultsErr } = await admin
        .from("test_results")
        .insert(resultsToInsert);

      if (resultsErr) {
        console.error("[SUPABASE DB SAVE] Error inserting test_results rows:", resultsErr);
        throw new Error(`test_results insert failed: ${resultsErr.message}`);
      }

      console.log(`[SUPABASE DB SAVE] Inserted ${resultsToInsert.length} test_results rows successfully!`);
    }

    return { success: true, reportId };
  } catch (error: any) {
    console.error("[SUPABASE DB SAVE FATAL ERROR]:", error);
    return {
      success: false,
      reportId: `local-${Date.now()}`,
      error: error?.message || String(error),
    };
  }
}

import {
  isSupabaseConfigured,
  getSupabaseBrowserClient,
} from "./client";
import { getSupabaseAdminClient } from "./admin";
import {
  TESTS as DEFAULT_TESTS,
  createUnknownTestDef,
  type Report,
  type ReportEntry,
  type TestDef,
  type Status,
} from "../data";

export interface ExtractedParam {
  parameter: string;
  value: number;
  normal_min?: number | null;
  normal_max?: number | null;
  reference_text?: string | null;
  unit?: string | null;
  status?: string | null;
}

function finiteNumber(value: unknown): number | undefined {
  if (value == null || value === "") return undefined;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : undefined;
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
  // Never run an unscoped patient query. A new account must not inherit the
  // first patient row returned by Supabase.
  if (!profileId) return null;

  if (isSupabaseConfigured()) {
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

  return null;
}

/**
 * Fetch lab test catalog from Supabase
 */
export async function getLabTestCatalog(): Promise<Record<string, TestDef>> {
  if (isSupabaseConfigured()) {
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
          const code = String(item.code || "").trim().toLowerCase();
          if (!code) continue;
          const known = DEFAULT_TESTS[code];
          const fallback = known || createUnknownTestDef(code, {
            label: item.name_en || code,
            unit: item.default_unit || undefined,
          });
          const range = item.reference_ranges?.[0];
          const low = finiteNumber(range?.ref_low) ?? fallback.ref.low;
          const high = finiteNumber(range?.ref_high) ?? fallback.ref.high;
          const unit = item.default_unit || fallback.unit;
          const rangeText =
            (low != null && high != null)
              ? `${low}–${high}${unit ? ` ${unit}` : ""}`
              : fallback.ref.text;

          catalog[code] = {
            ...fallback,
            id: code,
            name: { en: item.name_en || fallback.name.en, hi: item.name_hi || item.name_en || fallback.name.hi },
            simple: {
              en: item.simple_name_en || item.name_en || fallback.simple.en,
              hi: item.simple_name_hi || item.name_hi || item.name_en || fallback.simple.hi,
            },
            unit,
            ref: { low, high, text: rangeText },
            what: {
              med: item.description_medical || fallback.what.med,
              en: item.description_plain_en || fallback.what.en,
              hi: item.description_plain_hi || fallback.what.hi,
              vs_en: item.description_very_simple_en || fallback.what.vs_en,
              vs_hi: item.description_very_simple_hi || fallback.what.vs_hi,
            },
            icon: item.icon_key || fallback.icon,
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
export async function getPatientReports(patientIdOrProfileId?: string): Promise<Report[]> {
  if (isSupabaseConfigured()) {
    try {
      const supabase = getSupabaseBrowserClient();
      let targetPatientId = patientIdOrProfileId;

      // If no ID passed or ID is a profile_id (auth user id), resolve the patient record ID
      if (!targetPatientId) {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) targetPatientId = user.id;
      }

      if (targetPatientId) {
        // Find patient row matching profile_id or id
        const { data: pRow } = await supabase
          .from("patients")
          .select("id")
          .or(`id.eq.${targetPatientId},profile_id.eq.${targetPatientId}`)
          .maybeSingle();
        if (pRow) {
          targetPatientId = pRow.id;
        }
      }

      let query = supabase
        .from("lab_reports")
        .select(`
          id, collected_on, status, notes,
          test_results (
            id, value, corrected_value, raw_name, raw_unit, unit,
            printed_ref_low, printed_ref_high, printed_ref_text,
            lab_test_catalog ( code )
          )
        `)
        .order("collected_on", { ascending: true });

      if (targetPatientId) {
        query = query.eq("patient_id", targetPatientId);
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

          const entries: ReportEntry[] = (r.test_results || []).flatMap((tr: any) => {
            const rawName = typeof tr.raw_name === "string" ? tr.raw_name.trim() : "";
            const catalogueCode = typeof tr.lab_test_catalog?.code === "string"
              ? tr.lab_test_catalog.code.trim().toLowerCase()
              : "";
            const normalizedName = rawName.toLowerCase().replace(/[^a-z0-9]/g, "");
            // Try to match the raw name against known test codes before using the report_ prefix.
            // Common aliases that OCR might produce (e.g. "haemoglobin" → "hemoglobin").
            const NAME_ALIASES: Record<string, string> = {
              haemoglobin: "hemoglobin",
              hb: "hemoglobin", hgb: "hemoglobin",
              rbc: "rbc", wbc: "wbc", leucocytes: "wbc", leukocytes: "wbc",
              platelets: "platelets", plateletcount: "platelets", thrombocytes: "platelets",
              haematocrit: "hematocrit", pcv: "hematocrit",
              mcv: "mcv", mch: "mch", mchc: "mchc", rdw: "rdw",
              neutrophils: "neutrophils", lymphocytes: "lymphocytes",
              monocytes: "monocytes", eosinophils: "eosinophils", basophils: "basophils",
              glucose: "glucose", fbs: "glucose", fasting: "glucose",
              hba1c: "hba1c", glycatedhemoglobin: "hba1c",
              creatinine: "creatinine", urea: "bun", bun: "bun",
              uricacid: "uric_acid",
              totalcholesterol: "cholesterol", cholesterol: "cholesterol",
              ldl: "ldl", hdl: "hdl", triglycerides: "triglycerides", tg: "triglycerides",
              sgpt: "alt", alt: "alt", sgot: "ast", ast: "ast",
              alkalinephosphatase: "alp", alp: "alp",
              bilirubin: "bilirubin", totalprotein: "total_protein",
              albumin: "albumin", globulin: "globulin",
              sodium: "sodium", potassium: "potassium", chloride: "chloride",
              calcium: "calcium", phosphorus: "phosphorus",
              tsh: "tsh", t3: "t3", t4: "t4",
              vitaminb12: "vitamin_b12", b12: "vitamin_b12",
              vitamind: "vitamin_d", vitamind3: "vitamin_d",
              ferritin: "ferritin", iron: "iron", tibc: "tibc",
              esr: "esr", crp: "crp",
            };
            const resolvedCode =
              catalogueCode ||
              NAME_ALIASES[normalizedName] ||
              (DEFAULT_TESTS[normalizedName] ? normalizedName : null) ||
              (normalizedName ? `report_${normalizedName.slice(0, 56)}` : "");
            const testCode = resolvedCode;
            const rawValue = tr.corrected_value ?? tr.value;
            const val = Number(rawValue);
            if (!testCode || !Number.isFinite(val)) return [];

            const known = DEFAULT_TESTS[testCode];
            const rawLow = finiteNumber(tr.printed_ref_low);
            const rawHigh = finiteNumber(tr.printed_ref_high);
            const suppliedRangeValid =
              rawLow === undefined || rawHigh === undefined || rawLow <= rawHigh;
            const low = suppliedRangeValid ? rawLow ?? known?.ref.low : known?.ref.low;
            const high = suppliedRangeValid ? rawHigh ?? known?.ref.high : known?.ref.high;
            let status: Status = "normal";
            if (low != null && val < low) status = "low";
            else if (high != null && val > high) status = "high";
            else if (low != null && high != null) {
              const margin = (high - low) * 0.1;
              if (val <= low + margin || val >= high - margin) status = "borderline";
            } else if (high != null && val >= high * 0.9) {
              status = "borderline";
            } else if (low != null && val <= low * 1.1) {
              status = "borderline";
            }

            const unit = typeof tr.unit === "string" && tr.unit.trim()
              ? tr.unit.trim()
              : typeof tr.raw_unit === "string" ? tr.raw_unit.trim() : "";
            const referenceText = typeof tr.printed_ref_text === "string" && tr.printed_ref_text.trim()
              ? tr.printed_ref_text.trim()
              : low != null && high != null
                ? `${low}–${high}${unit ? ` ${unit}` : ""}`
                : low != null
                  ? `above ${low}${unit ? ` ${unit}` : ""}`
                  : high != null
                    ? `below ${high}${unit ? ` ${unit}` : ""}`
                    : "Reference range not reported";
            const statusKnown = low != null || high != null;

            return [{
              test: testCode,
              value: Math.round(val * 100) / 100,
              status,
              statusKnown,
              ...(rawName ? { label: rawName } : {}),
              ...(unit ? { unit } : {}),
              reference: {
                ...(low != null ? { low } : {}),
                ...(high != null ? { high } : {}),
                text: referenceText,
              },
            }];
          });

          const attentionCount = entries.filter((e) => e.statusKnown !== false && e.status !== "normal").length;

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

  return [];
}

/**
 * Save newly confirmed extracted report to Supabase DB (Server-side / Route Action)
 */
export async function saveExtractedReportToDb(
  payload: SaveExtractedReportPayload
): Promise<{ success: boolean; reportId: string; error?: string }> {
  if (!isSupabaseConfigured()) {
    return {
      success: false,
      reportId: `local-${Date.now()}`,
      error: "Supabase is not configured; the report was kept in this browser only.",
    };
  }

  try {
    const admin = getSupabaseAdminClient();
    const collectedOn = payload.collected_on || new Date().toISOString().split("T")[0];

    console.log("[SUPABASE DB SAVE] Starting save for report collected on:", collectedOn);

    const patientId = payload.patient_id;
    if (!patientId) {
      throw new Error("patient_id is required to save a report for this account.");
    }

    const { data: reportRow, error: reportErr } = await admin
      .from("lab_reports")
      .insert({
        patient_id: patientId,
        collected_on: collectedOn,
        lab_name: payload.lab_name || null,
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
          printed_ref_text:
            p.reference_text ||
            (p.normal_min != null && p.normal_max != null
              ? `${p.normal_min}–${p.normal_max}${p.unit ? ` ${p.unit}` : ""}`
              : null),
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

/**
 * Delete a report and its associated records from Supabase DB
 */
export async function deleteReportFromDb(
  reportId: string
): Promise<{ success: boolean; error?: string }> {
  if (!isSupabaseConfigured()) {
    return { success: false, error: "Supabase is not configured; only local report data was deleted." };
  }

  try {
    const admin = getSupabaseAdminClient();

    await admin.from("test_results").delete().eq("report_id", reportId);
    await admin.from("doctor_reviews").delete().eq("report_id", reportId);
    await admin.from("ai_explanations").delete().eq("subject_report_id", reportId);
    const { error } = await admin.from("lab_reports").delete().eq("id", reportId);

    if (error) {
      console.error("[SUPABASE DB DELETE] Error deleting lab_reports row:", error);
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (error: any) {
    console.error("[SUPABASE DB DELETE FATAL ERROR]:", error);
    return { success: false, error: error?.message || String(error) };
  }
}

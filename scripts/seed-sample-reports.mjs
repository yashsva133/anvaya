import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const sampleReports = [
  {
    collected_on: "2026-02-12",
    lab_name: "City Diagnostics",
    status: "released",
    tests: [
      { code: "hemoglobin", name: "Hemoglobin", value: 12.8, unit: "g/dL", min: 13.0, max: 17.0 },
      { code: "hba1c", name: "HbA1c", value: 5.9, unit: "%", min: 4.0, max: 5.6 },
      { code: "glucose", name: "Fasting Glucose", value: 96, unit: "mg/dL", min: 70, max: 99 },
      { code: "ldl", name: "LDL Cholesterol", value: 138, unit: "mg/dL", min: 0, max: 100 },
      { code: "hdl", name: "HDL Cholesterol", value: 44, unit: "mg/dL", min: 40, max: 60 },
      { code: "triglycerides", name: "Triglycerides", value: 158, unit: "mg/dL", min: 0, max: 150 },
      { code: "totalchol", name: "Total Cholesterol", value: 189, unit: "mg/dL", min: 0, max: 200 },
      { code: "creatinine", name: "Creatinine", value: 0.9, unit: "mg/dL", min: 0.7, max: 1.3 },
      { code: "platelets", name: "Platelet Count", value: 228, unit: "10³/µL", min: 150, max: 450 },
      { code: "wbc", name: "WBC Count", value: 6.1, unit: "10³/µL", min: 4.0, max: 11.0 },
      { code: "potassium", name: "Potassium", value: 4.2, unit: "mmol/L", min: 3.5, max: 5.1 },
    ],
  },
  {
    collected_on: "2026-04-05",
    lab_name: "City Diagnostics",
    status: "released",
    tests: [
      { code: "hemoglobin", name: "Hemoglobin", value: 12.3, unit: "g/dL", min: 13.0, max: 17.0 },
      { code: "hba1c", name: "HbA1c", value: 6.1, unit: "%", min: 4.0, max: 5.6 },
      { code: "glucose", name: "Fasting Glucose", value: 104, unit: "mg/dL", min: 70, max: 99 },
      { code: "ldl", name: "LDL Cholesterol", value: 142, unit: "mg/dL", min: 0, max: 100 },
      { code: "hdl", name: "HDL Cholesterol", value: 42, unit: "mg/dL", min: 40, max: 60 },
      { code: "triglycerides", name: "Triglycerides", value: 170, unit: "mg/dL", min: 0, max: 150 },
      { code: "totalchol", name: "Total Cholesterol", value: 201, unit: "mg/dL", min: 0, max: 200 },
      { code: "creatinine", name: "Creatinine", value: 0.9, unit: "mg/dL", min: 0.7, max: 1.3 },
      { code: "platelets", name: "Platelet Count", value: 236, unit: "10³/µL", min: 150, max: 450 },
      { code: "wbc", name: "WBC Count", value: 6.8, unit: "10³/µL", min: 4.0, max: 11.0 },
      { code: "mcv", name: "MCV", value: 83.4, unit: "fL", min: 80, max: 100 },
      { code: "potassium", name: "Potassium", value: 4.4, unit: "mmol/L", min: 3.5, max: 5.1 },
    ],
  },
  {
    collected_on: "2026-06-12",
    lab_name: "City Diagnostics",
    status: "released",
    tests: [
      { code: "hemoglobin", name: "Hemoglobin", value: 11.4, unit: "g/dL", min: 13.0, max: 17.0 },
      { code: "hba1c", name: "HbA1c", value: 6.8, unit: "%", min: 4.0, max: 5.6 },
      { code: "glucose", name: "Fasting Glucose", value: 116, unit: "mg/dL", min: 70, max: 99 },
      { code: "ldl", name: "LDL Cholesterol", value: 149, unit: "mg/dL", min: 0, max: 100 },
      { code: "hdl", name: "HDL Cholesterol", value: 39, unit: "mg/dL", min: 40, max: 60 },
      { code: "triglycerides", name: "Triglycerides", value: 188, unit: "mg/dL", min: 0, max: 150 },
      { code: "totalchol", name: "Total Cholesterol", value: 214, unit: "mg/dL", min: 0, max: 200 },
      { code: "creatinine", name: "Creatinine", value: 0.9, unit: "mg/dL", min: 0.7, max: 1.3 },
      { code: "platelets", name: "Platelet Count", value: 215, unit: "10³/µL", min: 150, max: 450 },
      { code: "wbc", name: "WBC Count", value: 6.5, unit: "10³/µL", min: 4.0, max: 11.0 },
      { code: "mcv", name: "MCV", value: 82.1, unit: "fL", min: 80, max: 100 },
      { code: "rbc", name: "RBC Count", value: 4.4, unit: "10⁶/µL", min: 4.5, max: 5.9 },
      { code: "potassium", name: "Potassium", value: 4.3, unit: "mmol/L", min: 3.5, max: 5.1 },
    ],
  },
  {
    collected_on: "2026-08-20",
    lab_name: "City Diagnostics",
    status: "released",
    tests: [
      { code: "hemoglobin", name: "Hemoglobin", value: 10.5, unit: "g/dL", min: 13.0, max: 17.0 },
      { code: "hba1c", name: "HbA1c", value: 7.2, unit: "%", min: 4.0, max: 5.6 },
      { code: "ldl", name: "LDL Cholesterol", value: 154, unit: "mg/dL", min: 0, max: 100 },
      { code: "hdl", name: "HDL Cholesterol", value: 48, unit: "mg/dL", min: 40, max: 60 },
      { code: "glucose", name: "Fasting Glucose", value: 88, unit: "mg/dL", min: 70, max: 99 },
      { code: "triglycerides", name: "Triglycerides", value: 128, unit: "mg/dL", min: 0, max: 150 },
      { code: "creatinine", name: "Creatinine", value: 1.0, unit: "mg/dL", min: 0.7, max: 1.3 },
      { code: "platelets", name: "Platelet Count", value: 210, unit: "10³/µL", min: 150, max: 450 },
      { code: "wbc", name: "WBC Count", value: 6.4, unit: "10³/µL", min: 4.0, max: 11.0 },
      { code: "mcv", name: "MCV", value: 82.4, unit: "fL", min: 80, max: 100 },
      { code: "rbc", name: "RBC Count", value: 4.6, unit: "10⁶/µL", min: 4.5, max: 5.9 },
      { code: "hematocrit", name: "Hematocrit", value: 41.2, unit: "%", min: 40, max: 50 },
      { code: "totalchol", name: "Total Cholesterol", value: 182, unit: "mg/dL", min: 0, max: 200 },
      { code: "potassium", name: "Potassium", value: 4.3, unit: "mmol/L", min: 3.5, max: 5.1 },
    ],
  },
];

async function seedClean() {
  const headers = {
    apikey: supabaseKey,
    Authorization: `Bearer ${supabaseKey}`,
    "Content-Type": "application/json",
    Prefer: "return=representation",
  };

  // Get catalog
  const catRes = await fetch(`${supabaseUrl}/rest/v1/lab_test_catalog?select=id,code`, { headers });
  const catalog = await catRes.json();
  const catalogMap = {};
  for (const c of catalog) {
    catalogMap[c.code] = c.id;
  }

  // Get patient
  const pRes = await fetch(`${supabaseUrl}/rest/v1/patients?select=id&limit=1`, { headers });
  const patients = await pRes.json();
  const patientId = patients?.[0]?.id;

  console.log("Patient id:", patientId);

  // Clear tables
  const tables = [
    "doctor_reviews",
    "report_releases",
    "report_disputes",
    "patient_lab_summaries",
    "ai_explanations",
    "ai_pattern_matches",
    "voice_sessions",
    "report_files",
    "ocr_results",
    "report_processing_jobs",
    "test_results",
    "lab_reports",
  ];

  for (const tbl of tables) {
    try {
      const del = await fetch(`${supabaseUrl}/rest/v1/${tbl}?id=gt.00000000-0000-0000-0000-000000000000`, {
        method: "DELETE",
        headers,
      });
      console.log(`Cleared ${tbl}: status ${del.status}`);
    } catch (e) {}
  }

  // Insert 4 reports
  for (const r of sampleReports) {
    const repRes = await fetch(`${supabaseUrl}/rest/v1/lab_reports`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        patient_id: patientId,
        collected_on: r.collected_on,
        lab_name: r.lab_name,
        status: r.status,
      }),
    });
    const created = await repRes.json();
    const reportId = created?.[0]?.id;
    console.log(`Created report for ${r.collected_on}: ${reportId}`);

    if (reportId) {
      const resultsToInsert = r.tests.map((t, idx) => ({
        report_id: reportId,
        lab_test_id: catalogMap[t.code] || null,
        sort_index: idx,
        raw_name: t.name,
        raw_unit: t.unit,
        raw_value_text: String(t.value),
        value: t.value,
        unit: t.unit,
        printed_ref_low: t.min,
        printed_ref_high: t.max,
        printed_ref_text: `${t.min}–${t.max} ${t.unit}`,
        value_source: "ocr",
        original_value: t.value,
      }));

      const trRes = await fetch(`${supabaseUrl}/rest/v1/test_results`, {
        method: "POST",
        headers,
        body: JSON.stringify(resultsToInsert),
      });
      console.log(`  Inserted ${resultsToInsert.length} test results: status ${trRes.status}`);
    }
  }

  console.log("Successfully seeded 4 monthly reports!");
}

seedClean();

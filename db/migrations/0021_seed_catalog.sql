-- ============================================================================
-- Anvaya / RxAnvaya — Supabase migration 0021
-- Seed: test catalogue, aliases, reference ranges, RAG sources,
--       pattern templates, default rule, consent policy
-- ----------------------------------------------------------------------------
-- Purpose   : Populate the non-PHI reference data the pipeline needs on day one,
--             transcribed from src/lib/data.ts so the database and the existing
--             UI agree on identifiers and units.
-- Depends on: 0005, 0006, 0013
-- Fresh safe: YES — fully idempotent (ON CONFLICT DO NOTHING throughout), so it
--             can be re-run without duplicating rows.
--
-- !!! TWO SEEDED VALUES ARE PLACEHOLDERS THAT NEED CLINICAL SIGN-OFF !!!
--
--   1. reference_ranges.borderline_frac = 0.10
--      The app renders a 5th status, "borderline" / "Needs attention", but no
--      band width is defined anywhere in the code, and the demo data is
--      internally inconsistent about it (triglycerides 205 mg/dL is labelled
--      "borderline" while 170 mg/dL is "high", both against ref_high 150;
--      glucose 104/116/126 mg/dL are all "borderline" against ref 70-99).
--      0.10 (10% of the reference span beyond the bound) is a reasonable
--      starting default, NOT a clinical decision. Replace it per test once a
--      clinician has agreed the bands.
--
--   2. critical_low / critical_high are seeded NULL for every test.
--      Panic values must come from an authoritative source (ICMR / the
--      reporting laboratory), not from this file. src/lib/data.ts CRITICAL_DEMO
--      shows potassium 6.4 mmol/L flagged as urgent, but that is fictional demo
--      content and is not a citable threshold. The mechanism is fully wired —
--      anvaya.classify_value() honours critical bounds and validation_results
--      records them — so enabling it is a data change, not a schema change.
--
--   The ranges below are the ones PRINTED IN THE DEMO APP (src/lib/data.ts
--   TestDef.ref). They are seeded under source code 'APP_DEMO' so they are
--   clearly attributable and easy to supersede with ICMR/WHO rows, which win
--   ties via reference_range_sources.authority_rank.
-- ============================================================================

-- ------------------------------- sources -----------------------------------
insert into public.reference_range_sources (code, name, country, url, authority_rank)
values
  ('ICMR',     'Indian Council of Medical Research', 'India', 'https://www.icmr.nic.in/', 1),
  ('WHO',      'World Health Organization',          'International', 'https://www.who.int/', 2),
  ('LAB',      'Reporting laboratory (printed range)', 'India', null, 3),
  ('APP_DEMO', 'Ranges printed in the Anvaya prototype', 'India', null, 90)
on conflict (code) do nothing;

-- ---------------------------- test catalogue --------------------------------
-- codes, units and names are transcribed from the 14 TestDef records in
-- src/lib/data.ts so /test/[id] route params keep resolving unchanged.
insert into public.lab_test_catalog
  (code, name_en, name_hi, simple_name_en, simple_name_hi, default_unit, category, icon_key, sort_order)
values
  ('hemoglobin',   'Hemoglobin',        'हीमोग्लोबिन',        'Blood — haemoglobin', 'ख़ून — हीमोग्लोबिन', 'g/dL',      'haematology', 'droplets',    1),
  ('hba1c',        'HbA1c',             'HbA1c (एचबीए1सी)',   'Average blood sugar', 'औसत ब्लड शुगर',    '%',         'glycaemia',   'activity',    2),
  ('glucose',      'Fasting Glucose',   'फ़ास्टिंग ग्लूकोज़',  'Blood sugar today',   'आज की ब्लड शुगर',  'mg/dL',     'glycaemia',   'gauge',       3),
  ('ldl',          'LDL Cholesterol',   'LDL कोलेस्ट्रॉल',     'Bad cholesterol',     'ख़राब कोलेस्ट्रॉल',  'mg/dL',     'lipid',       'heart',       4),
  ('hdl',          'HDL Cholesterol',   'HDL कोलेस्ट्रॉल',     'Good cholesterol',    'अच्छा कोलेस्ट्रॉल',  'mg/dL',     'lipid',       'heartpulse',  5),
  ('triglycerides','Triglycerides',     'ट्राइग्लिसराइड',      'Blood fats',          'ख़ून की वसा',       'mg/dL',     'lipid',       'droplet',     6),
  ('totalchol',    'Total Cholesterol', 'कुल कोलेस्ट्रॉल',     'Total cholesterol',   'कुल कोलेस्ट्रॉल',   'mg/dL',     'lipid',       'sigma',       7),
  ('creatinine',   'Creatinine',        'क्रिएटिनिन',          'Kidney function',     'किडनी की कार्यक्षमता','mg/dL',    'renal',       'filter',      8),
  ('platelets',    'Platelet Count',    'प्लेटलेट गणना',       'Clotting cells',      'ख़ून जमाने वाली कोशिकाएँ','×10³/µL','haematology','square',    9),
  ('wbc',          'WBC Count',         'डब्ल्यूबीसी गणना',    'White blood cells',   'सफ़ेद रक्त कोशिकाएँ','×10³/µL',  'haematology', 'shield',     10),
  ('mcv',          'MCV',               'MCV (लाल कोशिका आकार)','Red cell size',       'लाल कोशिका का आकार', 'fL',       'haematology', 'circledashed',11),
  ('rbc',          'RBC Count',         'RBC गणना',            'Red blood cells',     'लाल रक्त कोशिकाएँ',  'mill/µL',  'haematology', 'circle',     12),
  ('hematocrit',   'Hematocrit',        'हेमैटोक्रिट',         'Blood thickness',     'ख़ून की गाढ़ता',      '%',        'haematology', 'donut',      13),
  ('potassium',    'Potassium',         'पोटैशियम',            'Body salts — potassium','शरीर का लवण — पोटैशियम','mmol/L','electrolyte','banana',   14)
on conflict (code) do nothing;

-- --------------------------------- aliases ---------------------------------
-- The normalisation dictionary behind the "Data normalisation" pipeline stage.
insert into public.lab_test_aliases (lab_test_id, alias, language, source)
select c.id, a.alias, a.lang::anvaya_lang_code, 'manual'
from (values
  ('hemoglobin',    'Hb',            'en'),
  ('hemoglobin',    'Haemoglobin',   'en'),
  ('hemoglobin',    'HGB',           'en'),
  ('hemoglobin',    'हीमोग्लोबिन',     'hi'),
  ('hba1c',         'A1C',           'en'),
  ('hba1c',         'Glycated haemoglobin', 'en'),
  ('hba1c',         'एचबीए1सी',        'hi'),
  ('glucose',       'FBS',           'en'),
  ('glucose',       'Fasting blood sugar', 'en'),
  ('glucose',       'GLU',           'en'),
  ('glucose',       'ग्लूकोज़',         'hi'),
  ('ldl',           'LDL-C',         'en'),
  ('ldl',           'एलडीएल',          'hi'),
  ('hdl',           'HDL-C',         'en'),
  ('triglycerides', 'TG',            'en'),
  ('triglycerides', 'Trig',          'en'),
  ('totalchol',     'Total Chol',    'en'),
  ('totalchol',     'TC',            'en'),
  ('creatinine',    'Serum Creatinine', 'en'),
  ('creatinine',    'S. Creatinine', 'en'),
  ('platelets',     'PLT',           'en'),
  ('wbc',           'TLC',           'en'),
  ('wbc',           'Total leucocyte count', 'en'),
  ('mcv',           'Mean corpuscular volume', 'en'),
  ('rbc',           'RBC',           'en'),
  ('rbc',           'Erythrocyte count', 'en'),
  ('hematocrit',    'HCT',           'en'),
  ('hematocrit',    'Packed cell volume', 'en'),
  ('potassium',     'K+',            'en'),
  ('potassium',     'Serum Potassium','en')
) as a(test_code, alias, lang)
join public.lab_test_catalog c on c.code = a.test_code
on conflict (lab_test_id, lower(alias), language) do nothing;

-- --------------------------- reference ranges --------------------------------
-- ref_low / ref_high exactly as printed in src/lib/data.ts TestDef.ref.
-- An open-ended range (e.g. HbA1c "below 5.7%") stores only the bound that
-- exists, which is why both columns are nullable.
insert into public.reference_ranges
  (lab_test_id, source_id, unit, ref_low, ref_high, borderline_frac,
   applicable_sex, population, version, effective_from, is_active)
select c.id, s.id, v.unit, v.lo, v.hi, 0.10, 'any', 'adult', '1.0.0', date '2026-01-01', true
from (values
  ('hemoglobin',    'g/dL',      12.0, 16.0),
  ('hba1c',         '%',         null, 5.7),
  ('glucose',       'mg/dL',     70.0, 99.0),
  ('ldl',           'mg/dL',     null, 100.0),
  ('hdl',           'mg/dL',     40.0, null),
  ('triglycerides', 'mg/dL',     null, 150.0),
  ('totalchol',     'mg/dL',     null, 200.0),
  ('creatinine',    'mg/dL',     0.7,  1.3),
  ('platelets',     '×10³/µL',  150.0, 410.0),
  ('wbc',           '×10³/µL',    4.0,  11.0),
  ('mcv',           'fL',        80.0, 100.0),
  ('rbc',           'mill/µL',    4.5,   5.9),
  ('hematocrit',    '%',         40.0,  50.0),
  ('potassium',     'mmol/L',     3.5,   5.0)
) as v(test_code, unit, lo, hi)
join public.lab_test_catalog c on c.code = v.test_code
join public.reference_range_sources s on s.code = 'APP_DEMO'
on conflict (lab_test_id, source_id, version, unit,
             coalesce(applicable_sex, 'any'), coalesce(population, 'all'),
             effective_from) do nothing;

-- ------------------------------ clinical rule -------------------------------
insert into public.clinical_rules
  (rule_key, version, description, engine_version, params, is_active)
values
  ('range_threshold', '1.0.0',
   'Compare the effective value against the reference range in force: beyond a critical bound -> critical; beyond the reference bound by more than borderline_frac of the reference span -> high/low; inside that band -> borderline; otherwise normal.',
   'anvaya-validator-1.0.0',
   '{"evaluation_order":["critical_low","critical_high","ref_low","ref_high"],"rounding":"none"}'::jsonb,
   true)
on conflict (rule_key, version, coalesce(applies_to, '00000000-0000-0000-0000-000000000000'::uuid)) do nothing;

-- ------------------------------- RAG sources --------------------------------
-- code / title / publisher / country / url transcribed from the 5 Source records
-- in src/lib/data.ts, so /sources and TestDef.sources keep resolving.
insert into public.rag_sources (code, title, publisher, country, url)
values
  ('medlineplus-hgb', 'Hemoglobin Test',
   'MedlinePlus — U.S. National Library of Medicine', 'USA',
   'https://medlineplus.gov/lab-tests/hemoglobin-test/'),
  ('cdc-a1c', 'A1C Test for Diabetes',
   'CDC — Centers for Disease Control and Prevention', 'USA',
   'https://www.cdc.gov/diabetes/testing/'),
  ('aha-chol', 'What Your Cholesterol Levels Mean',
   'American Heart Association', 'USA',
   'https://www.heart.org/en/health-topics/cholesterol/about-cholesterol/what-your-cholesterol-levels-mean'),
  ('nhlbi-tg', 'High Blood Triglycerides',
   'NHLBI — National Heart, Lung, and Blood Institute (NIH)', 'USA',
   'https://www.nhlbi.nih.gov/health/high-blood-triglycerides'),
  ('medlineplus-creatinine', 'Creatinine Test',
   'MedlinePlus — U.S. National Library of Medicine', 'USA',
   'https://medlineplus.gov/lab-tests/creatinine-test/')
on conflict (code) do nothing;

-- ---------------------------- pattern templates -----------------------------
-- The three Pattern records in src/lib/data.ts. Titles only; the narrative is
-- produced per report and stored in ai_explanations.
insert into public.pattern_templates (code, title_en, title_hi, description)
values
  ('pattern-lipid', 'Lipid pattern',        'लिपिड पैटर्न',
   'LDL, HDL, triglycerides and total cholesterol read together rather than individually.'),
  ('pattern-blood', 'Blood-count pattern',  'रक्त-गणना पैटर्न',
   'Hemoglobin, MCV, RBC and hematocrit read together to characterise an anaemia pattern.'),
  ('pattern-sugar', 'Raised blood-sugar pattern', 'बढ़ी ब्लड शुगर पैटर्न',
   'Fasting glucose and HbA1c read together to distinguish a one-off reading from a sustained pattern.')
on conflict (code) do nothing;

-- ------------------------------ consent policy ------------------------------
insert into public.consent_policies
  (code, version, purpose, title_en, title_hi, summary_en, summary_hi,
   full_text_en, doc_hash, is_active)
select
  'anvaya_processing', '1.0.0', p.purpose, p.title_en, p.title_hi, p.summary_en, p.summary_hi,
  p.full_en,
  encode(sha256((p.purpose::text || '|' || p.full_en)::bytea), 'hex'),
  true
from (values
  ('report_parsing'::anvaya_consent_purpose,
   'Read my lab report', 'मेरी लैब रिपोर्ट पढ़ना',
   'Allow Anvaya to read the report you upload and turn it into structured test results.',
   'अनवया को आपकी अपलोड की गई रिपोर्ट पढ़कर उसे संरचित परिणामों में बदलने की अनुमति दें।',
   'Anvaya will read the report image or PDF you upload, identify the tests, values, units and the reference ranges printed on it, and store them against your account. You can correct any value it misreads.'),
  ('ai_explanation'::anvaya_consent_purpose,
   'Explain my results in simple language', 'मेरे परिणाम सरल भाषा में समझाना',
   'Allow Anvaya to generate a plain-language explanation of your results using an AI model.',
   'अनवया को AI मॉडल का उपयोग करके आपके परिणामों की सरल भाषा में व्याख्या तैयार करने की अनुमति दें।',
   'Only de-identified data is used: your name, contact details, date of birth, report number and laboratory name are removed before anything reaches the AI model. Values, units, reference ranges and your age band may be used. Every explanation is reviewed by a doctor before it reaches you.'),
  ('rag_grounding'::anvaya_consent_purpose,
   'Ground explanations in medical sources', 'व्याख्याओं को चिकित्सा स्रोतों पर आधारित करना',
   'Allow Anvaya to cite clinical guidelines and trusted health sources in your explanations.',
   'अनवया को आपकी व्याख्याओं में नैदानिक दिशानिर्देश और विश्वसनीय स्वास्थ्य स्रोतों का उद्धरण देने की अनुमति दें।',
   'Anvaya searches a curated corpus of clinical guidance and shows you which passage supported each statement, with its publisher and link.'),
  ('voice_interaction'::anvaya_consent_purpose,
   'Answer my questions by voice', 'आवाज़ से मेरे प्रश्नों का उत्तर देना',
   'Allow Anvaya to transcribe your spoken questions and read answers aloud.',
   'अनवया को आपके बोले गए प्रश्नों को लिप्यंतरित करने और उत्तर बोलकर सुनाने की अनुमति दें।',
   'Audio you record is stored privately against your account, transcribed, and answered using only your own de-identified results. You can delete a conversation at any time.'),
  ('longitudinal_trends'::anvaya_consent_purpose,
   'Compare with my earlier reports', 'मेरी पिछली रिपोर्टों से तुलना करना',
   'Allow Anvaya to compare a new report with your previous ones to show trends.',
   'अनवया को रुझान दिखाने के लिए नई रिपोर्ट की आपकी पिछली रिपोर्टों से तुलना करने की अनुमति दें।',
   'Anvaya will compare your results across your own reports over time. Trends are shown to you and to a reviewing doctor; they never change how an individual result is classified.'),
  ('doctor_review'::anvaya_consent_purpose,
   'Have a doctor review my report', 'डॉक्टर से मेरी रिपोर्ट की समीक्षा कराना',
   'Allow an authorised clinician to review your report before it is released to you.',
   'आपकी रिपोर्ट आपको देने से पहले किसी अधिकृत चिकित्सक द्वारा उसकी समीक्षा करने की अनुमति दें।',
   'Only clinicians you or your care team have authorised can see your report, and only for the period the authorisation covers. Every access is logged.')
) as p(purpose, title_en, title_hi, summary_en, summary_hi, full_en)
on conflict (code, version, purpose) do nothing;

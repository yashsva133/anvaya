// ---------------------------------------------------------------------------
// RxAnvaya — sample content model.
// ALL patient data below is FICTIONAL sample data created for the SIH 2026
// prototype demonstration. It does not represent any real person.
// ---------------------------------------------------------------------------

export type LangCode = "en" | "hi" | "bn";
export type Status = "normal" | "borderline" | "high" | "low" | "critical";

export interface L2 {
  en: string;
  hi: string;
}

export interface TestDef {
  id: string;
  unit: string;
  name: L2;
  simple: L2; // friendly everyday name for Simple Mode
  icon: string;
  tint: string; // soft bg token class
  ink: string; // icon color class
  ref: { low?: number; high?: number; text: string };
  what: { med: string; en: string; hi: string; vs_en: string; vs_hi: string };
  why: { en: string; hi: string; vs_en: string };
  causes: { en: string; hi: string };
  todo: { en: string; hi: string; vs_en: string };
  conf: { level: "high" | "moderate"; pct: number; note: L2 };
  sources: string[];
  related: string[];
}

/* ---------------------------------- TESTS --------------------------------- */

export const TESTS: Record<string, TestDef> = {
  hemoglobin: {
    id: "hemoglobin",
    unit: "g/dL",
    name: { en: "Hemoglobin", hi: "हीमोग्लोबिन" },
    simple: { en: "Blood — haemoglobin", hi: "ख़ून — हीमोग्लोबिन" },
    icon: "droplets",
    tint: "bg-rose-100",
    ink: "text-rose-600",
    ref: { low: 12, high: 16, text: "12–16 g/dL" },
    what: {
      med: "Haemoglobin (Hb) is the oxygen-binding metalloprotein of erythrocytes, responsible for transporting oxygen from the lungs to peripheral tissues.",
      en: "Hemoglobin is a protein in red blood cells that carries oxygen around your body.",
      hi: "हीमोग्लोबिन लाल ख़ून की कोशिकाओं में मौजूद एक प्रोटीन है, जो पूरे शरीर में ऑक्सीजन पहुँचाता है।",
      vs_en: "It is the part of your blood that carries oxygen. When it is low, you can feel tired or weak.",
      vs_hi: "यह ख़ून का वह हिस्सा है जो ऑक्सीजन पहुँचाता है। इसके कम होने से थकान या कमज़ोरी महसूस हो सकती है।",
    },
    why: {
      en: "Your result is lower than the usual range. Low hemoglobin can make you feel tired, weak or short of breath.",
      hi: "आपका परिणाम सामान्य सीमा से कम है। हीमोग्लोबिन कम होने से थकान, कमज़ोरी या साँस फूलना महसूस हो सकता है।",
      vs_en: "Your blood may be carrying less oxygen than usual.",
    },
    causes: {
      en: "Low hemoglobin can happen for several reasons, including low iron, blood loss, vitamin deficiencies (B12 or folate), or other conditions. Your doctor can find the cause using your symptoms and other tests.",
      hi: "हीमोग्लोबिन कम होने के कई कारण हो सकते हैं — जैसे आयरन की कमी, शरीर से ख़ून की कमी, विटामिन (B12 या फ़ोलेट) की कमी या अन्य कारण। सही कारण डॉक्टर आपके लक्षण और अन्य जाँचों से बता सकते हैं।",
    },
    todo: {
      en: "Please discuss this result with your doctor — especially if you feel tired, weak, dizzy, or short of breath. Your doctor may ask for iron studies or other blood tests.",
      hi: "इस परिणाम पर अपने डॉक्टर से चर्चा करें — ख़ासकर यदि आपको थकान, कमज़ोरी, चक्कर या साँस फूलने की शिकायत हो। डॉक्टर आयरन या अन्य जाँचें सुझा सकते हैं।",
      vs_en: "Talk to your doctor about this result.",
    },
    conf: {
      level: "high",
      pct: 96,
      note: {
        en: "Clear test name, value, unit and reference range were detected.",
        hi: "जाँच का नाम, मान, इकाई और सामान्य सीमा स्पष्ट रूप से पढ़ी गई।",
      },
    },
    sources: ["medlineplus-hgb"],
    related: ["mcv", "rbc", "hematocrit"],
  },

  hba1c: {
    id: "hba1c",
    unit: "%",
    name: { en: "HbA1c", hi: "HbA1c (एचबीए1सी)" },
    simple: { en: "Average blood sugar", hi: "औसत ब्लड शुगर" },
    icon: "activity",
    tint: "bg-violet-100",
    ink: "text-violet-600",
    ref: { high: 5.7, text: "below 5.7%" },
    what: {
      med: "HbA1c represents glycated haemoglobin and reflects average glycaemic exposure over approximately 2–3 months.",
      en: "HbA1c shows your average blood sugar level over the past 2–3 months.",
      hi: "HbA1c पिछले 2–3 महीनों की आपकी औसत ब्लड शुगर का स्तर बताता है।",
      vs_en: "This number tells us whether your blood sugar has been high for a long time.",
      vs_hi: "यह संख्या बताती है कि आपकी ब्लड शुगर लंबे समय से बढ़ी हुई है या नहीं।",
    },
    why: {
      en: "Your result is higher than the usual range. Results in this range may be associated with diabetes and should be discussed with a healthcare professional.",
      hi: "आपका परिणाम सामान्य सीमा से अधिक है। इस सीमा का परिणाम डायबिटीज़ से जुड़ा हो सकता है — इस पर डॉक्टर से चर्चा ज़रूरी है।",
      vs_en: "Your average blood sugar is higher than usual.",
    },
    causes: {
      en: "A higher HbA1c usually means blood sugar has been higher than usual over the past few months. Food habits, activity, weight, family history and some medicines can all play a role. A doctor can confirm what it means for you.",
      hi: "HbA1c बढ़ने का अर्थ आमतौर पर यह है कि पिछले कुछ महीनों में ब्लड शुगर सामान्य से अधिक रही है। खान-पान, व्यायाम, वज़न, पारिवारिक इतिहास और कुछ दवाएँ इसमें भूमिका निभा सकती हैं। डॉक्टर ही सही अर्थ बता सकते हैं।",
    },
    todo: {
      en: "Discuss this result with your doctor. They may repeat the test, check fasting sugar, and guide you on food, activity and any treatment if needed.",
      hi: "इस परिणाम पर डॉक्टर से चर्चा करें। वे जाँच दोहरा सकते हैं, फ़ास्टिंग शुगर देख सकते हैं और खान-पान, व्यायाम तथा ज़रूरत होने पर इलाज की सलाह दे सकते हैं।",
      vs_en: "Please talk to your doctor about your sugar levels.",
    },
    conf: {
      level: "high",
      pct: 95,
      note: {
        en: "Clear test name, value, unit and reference range were detected.",
        hi: "जाँच का नाम, मान, इकाई और सामान्य सीमा स्पष्ट रूप से पढ़ी गई।",
      },
    },
    sources: ["cdc-a1c"],
    related: ["glucose"],
  },

  ldl: {
    id: "ldl",
    unit: "mg/dL",
    name: { en: "LDL Cholesterol", hi: "LDL कोलेस्ट्रॉल" },
    simple: { en: "Bad cholesterol", hi: "ख़राब कोलेस्ट्रॉल" },
    icon: "heart",
    tint: "bg-rose-100",
    ink: "text-rose-500",
    ref: { high: 100, text: "below 100 mg/dL" },
    what: {
      med: "Low-density lipoprotein cholesterol (LDL-C) is the primary atherogenic lipoprotein and a major modifiable risk factor for atherosclerotic cardiovascular disease.",
      en: "LDL is often called “bad cholesterol”. Too much of it can slowly build up inside blood vessels.",
      hi: "LDL को अक्सर “ख़राब कोलेस्ट्रॉल” कहा जाता है। इसका ज़्यादा होना धीरे-धीरे रक्त वाहिकाओं में जमाव बढ़ा सकता है।",
      vs_en: "This type of cholesterol can slowly block blood vessels when it stays high.",
      vs_hi: "यह कोलेस्ट्रॉल लंबे समय तक बढ़ा रहने पर रक्त वाहिकाओं में धीरे-धीरे जम सकता है।",
    },
    why: {
      en: "Your LDL is above the usual range. Over years, higher LDL may be associated with increased risk of heart and blood-vessel problems.",
      hi: "आपका LDL सामान्य सीमा से अधिक है। लंबे समय तक बढ़ा रहने पर यह हृदय और रक्त वाहिकाओं की समस्याओं का जोख़िम बढ़ा सकता है।",
      vs_en: "This cholesterol is higher than expected.",
    },
    causes: {
      en: "LDL can rise with food habits (fried food, saturated fat), low physical activity, weight gain, some medicines, or family history. Your doctor looks at LDL together with your full health picture.",
      hi: "तले-भुने भोजन, संतृप्त वसा, कम शारीरिक गतिविधि, वज़न बढ़ना, कुछ दवाएँ या पारिवारिक इतिहास से LDL बढ़ सकता है। डॉक्टर इसे आपके पूरे स्वास्थ्य के साथ मिलाकर देखते हैं।",
    },
    todo: {
      en: "Discuss this with your doctor. They may suggest food and activity changes, and — based on your overall risk — whether any medicine is needed.",
      hi: "इस पर डॉक्टर से चर्चा करें। वे खान-पान और व्यायाम में बदलाव सुझा सकते हैं और आपके कुल जोख़िम के आधार पर दवा की ज़रूरत तय कर सकते हैं।",
      vs_en: "Ask your doctor how to bring this number down.",
    },
    conf: {
      level: "high",
      pct: 94,
      note: {
        en: "Clear test name, value, unit and reference range were detected.",
        hi: "जाँच का नाम, मान, इकाई और सामान्य सीमा स्पष्ट रूप से पढ़ी गई।",
      },
    },
    sources: ["aha-chol"],
    related: ["hdl", "triglycerides", "totalchol"],
  },

  hdl: {
    id: "hdl",
    unit: "mg/dL",
    name: { en: "HDL Cholesterol", hi: "HDL कोलेस्ट्रॉल" },
    simple: { en: "Good cholesterol", hi: "अच्छा कोलेस्ट्रॉल" },
    icon: "heartpulse",
    tint: "bg-teal-100",
    ink: "text-teal-600",
    ref: { low: 40, text: "above 40 mg/dL" },
    what: {
      med: "High-density lipoprotein cholesterol (HDL-C) participates in reverse cholesterol transport and is generally associated with cardiovascular protection.",
      en: "HDL is often called “good cholesterol”. It helps carry extra cholesterol away from blood vessels.",
      hi: "HDL को अक्सर “अच्छा कोलेस्ट्रॉल” कहा जाता है। यह अतिरिक्त कोलेस्ट्रॉल को रक्त वाहिकाओं से हटाने में मदद करता है।",
      vs_en: "This is the helpful cholesterol. Higher is usually better.",
      vs_hi: "यह मददगार कोलेस्ट्रॉल है। इसका अधिक होना आमतौर पर बेहतर माना जाता है।",
    },
    why: {
      en: "Your HDL is below the preferred level. Low HDL on its own does not mean disease, but together with other lipid results it gives your doctor useful information.",
      hi: "आपका HDL पसंदीदा स्तर से कम है। अकेले कम HDL बीमारी नहीं बताता, लेकिन अन्य लिपिड परिणामों के साथ यह डॉक्टर को उपयोगी जानकारी देता है।",
      vs_en: "Your helpful cholesterol is lower than preferred.",
    },
    causes: {
      en: "HDL can be lower with low physical activity, smoking, some foods, or higher body weight. Regular activity is one of the most reliable ways to improve it.",
      hi: "कम शारीरिक गतिविधि, धूम्रपान, कुछ खान-पान या अधिक वज़न से HDL कम हो सकता है। नियमित गतिविधि इसे सुधारने का सबसे भरोसेमंद तरीक़ों में से एक है।",
    },
    todo: {
      en: "Discuss your full lipid pattern with your doctor. Regular physical activity and not smoking help improve HDL.",
      hi: "अपना पूरा लिपिड पैटर्न डॉक्टर से चर्चा करें। नियमित गतिविधि और धूम्रपान न करना HDL सुधारने में मदद करता है।",
      vs_en: "Walking and activity can help this number.",
    },
    conf: {
      level: "high",
      pct: 93,
      note: {
        en: "Clear test name, value, unit and reference range were detected.",
        hi: "जाँच का नाम, मान, इकाई और सामान्य सीमा स्पष्ट रूप से पढ़ी गई।",
      },
    },
    sources: ["aha-chol"],
    related: ["ldl", "triglycerides", "totalchol"],
  },

  glucose: {
    id: "glucose",
    unit: "mg/dL",
    name: { en: "Fasting Glucose", hi: "फ़ास्टिंग ग्लूकोज़" },
    simple: { en: "Blood sugar (fasting)", hi: "ब्लड शुगर (ख़ाली पेट)" },
    icon: "sparkles",
    tint: "bg-amber-100",
    ink: "text-amber-600",
    ref: { low: 70, high: 99, text: "70–99 mg/dL" },
    what: {
      med: "Fasting plasma glucose measures blood glucose concentration after at least 8 hours of caloric restriction.",
      en: "This measures the sugar in your blood after not eating overnight.",
      hi: "यह रात भर खाना न खाने के बाद आपके ख़ून में शुगर की मात्रा मापता है।",
      vs_en: "This is your blood sugar checked before breakfast.",
      vs_hi: "यह नाश्ते से पहले जाँची गई आपकी ब्लड शुगर है।",
    },
    why: {
      en: "Your result is above the usual range — close to the limit. A single reading does not diagnose anything; doctors look at it together with HbA1c.",
      hi: "आपका परिणाम सामान्य सीमा से ऊपर है — सीमा के पास। एक बार की रीडिंग से कुछ भी निश्चित नहीं होता; डॉक्टर इसे HbA1c के साथ मिलाकर देखते हैं।",
      vs_en: "Your sugar was a little higher than usual.",
    },
    causes: {
      en: "Fasting sugar can be higher for many reasons — recent illness, stress, medicines, or early sugar-processing problems. Doctors usually confirm with repeat tests before concluding anything.",
      hi: "फ़ास्टिंग शुगर कई कारणों से बढ़ सकती है — हाल की बीमारी, तनाव, दवाएँ या शुगर प्रोसेसिंग की शुरुआती समस्या। डॉक्टर आमतौर पर दोबारा जाँच से ही निष्कर्ष निकालते हैं।",
    },
    todo: {
      en: "Share this with your doctor, especially together with your HbA1c result.",
      hi: "इसे अपने डॉक्टर को बताएँ — ख़ासकर HbA1c के परिणाम के साथ।",
      vs_en: "Show this to your doctor with your HbA1c.",
    },
    conf: {
      level: "moderate",
      pct: 82,
      note: {
        en: "Value was clear; the printed reference range was slightly faint in the uploaded image.",
        hi: "मान स्पष्ट था; अपलोड की गई तस्वीर में छपी सामान्य सीमा थोड़ी धुंधली थी।",
      },
    },
    sources: ["cdc-a1c"],
    related: ["hba1c"],
  },

  triglycerides: {
    id: "triglycerides",
    unit: "mg/dL",
    name: { en: "Triglycerides", hi: "ट्राइग्लिसराइड" },
    simple: { en: "Blood fats", hi: "ख़ून में वसा" },
    icon: "piechart",
    tint: "bg-orange-100",
    ink: "text-orange-500",
    ref: { high: 150, text: "below 150 mg/dL" },
    what: {
      med: "Triglycerides are circulating lipids stored in adipose tissue; elevated levels contribute to residual cardiovascular risk.",
      en: "Triglycerides are a type of fat in your blood. Your body stores extra energy in this form.",
      hi: "ट्राइग्लिसराइड आपके ख़ून में मौजूद एक प्रकार की वसा है। शरीर अतिरिक्त ऊर्जा इसी रूप में जमा करता है।",
      vs_en: "This is fat floating in your blood.",
      vs_hi: "यह आपके ख़ून में मौजूद वसा है।",
    },
    why: {
      en: "Your result is within the usual range on this report.",
      hi: "आपका परिणाम इस रिपोर्ट में सामान्य सीमा के भीतर है।",
      vs_en: "Your blood fats look normal.",
    },
    causes: {
      en: "Triglycerides rise with sugary or fried foods, alcohol, weight gain, or higher blood sugar. If you were not fasting, the value can also look higher.",
      hi: "मीठा या तला-भुना भोजन, शराब, वज़न बढ़ना या ब्लड शुगर बढ़ने से ट्राइग्लिसराइड बढ़ सकता है। यदि आप ख़ाली पेट नहीं थे, तो भी मान अधिक दिख सकता है।",
    },
    todo: {
      en: "Discuss the full lipid pattern with your doctor. Cutting down sugar, fried food and alcohol usually helps.",
      hi: "पूरे लिपिड पैटर्न पर डॉक्टर से चर्चा करें। मीठा, तला-भुना और शराब कम करने से आमतौर पर मदद मिलती है।",
      vs_en: "Less sugar and fried food can help.",
    },
    conf: {
      level: "high",
      pct: 91,
      note: {
        en: "Clear test name, value, unit and reference range were detected.",
        hi: "जाँच का नाम, मान, इकाई और सामान्य सीमा स्पष्ट रूप से पढ़ी गई।",
      },
    },
    sources: ["nhlbi-tg"],
    related: ["ldl", "hdl", "totalchol"],
  },

  creatinine: {
    id: "creatinine",
    unit: "mg/dL",
    name: { en: "Creatinine", hi: "क्रिएटिनिन" },
    simple: { en: "Kidney marker", hi: "किडनी संकेतक" },
    icon: "flask",
    tint: "bg-indigo-100",
    ink: "text-indigo-600",
    ref: { low: 0.7, high: 1.3, text: "0.7–1.3 mg/dL" },
    what: {
      med: "Serum creatinine is a breakdown product of muscle metabolism, used — with eGFR — as a marker of renal filtration function.",
      en: "Creatinine is a waste product from muscles. It helps doctors see how well the kidneys are cleaning the blood.",
      hi: "क्रिएटिनिन माँसपेशियों से बना अपशिष्ट है। इससे डॉक्टर देखते हैं कि किडनी ख़ून कितनी अच्छी तरह साफ़ कर रही है।",
      vs_en: "This number helps show how well your kidneys are working.",
      vs_hi: "यह संख्या बताती है कि आपकी किडनी कितनी अच्छी तरह काम कर रही है।",
    },
    why: {
      en: "Your result is within the reference range shown on your report.",
      hi: "आपका परिणाम रिपोर्ट में दी गई सामान्य सीमा के भीतर है।",
      vs_en: "This kidney number looks within the usual range.",
    },
    causes: {
      en: "Creatinine changes with muscle mass, hydration, age and kidney function. Your doctor reads it together with eGFR and urine tests.",
      hi: "माँसपेशियों की मात्रा, पानी की कमी, उम्र और किडनी की कार्यक्षमता से क्रिएटिनिन बदलता है। डॉक्टर इसे eGFR और मूत्र जाँच के साथ देखते हैं।",
    },
    todo: {
      en: "No action needed for this result alone. Keep regular check-ups as advised by your doctor.",
      hi: "केवल इस परिणाम के लिए कोई कार्रवाई ज़रूरी नहीं। डॉक्टर की सलाह अनुसार नियमित जाँच कराते रहें।",
      vs_en: "This result is within range. No action needed now.",
    },
    conf: {
      level: "high",
      pct: 97,
      note: {
        en: "Clear test name, value, unit and reference range were detected.",
        hi: "जाँच का नाम, मान, इकाई और सामान्य सीमा स्पष्ट रूप से पढ़ी गई।",
      },
    },
    sources: ["medlineplus-creatinine"],
    related: [],
  },

  platelets: {
    id: "platelets",
    unit: "×10³/µL",
    name: { en: "Platelets", hi: "प्लेटलेट्स" },
    simple: { en: "Clotting cells", hi: "थक्का बनाने वाली कोशिकाएँ" },
    icon: "layers",
    tint: "bg-sky-100",
    ink: "text-sky-600",
    ref: { low: 150, high: 410, text: "150–410 ×10³/µL" },
    what: {
      med: "Platelets (thrombocytes) are anucleate cell fragments essential for primary haemostasis and clot formation.",
      en: "Platelets are tiny cells that help your blood clot when you get a cut.",
      hi: "प्लेटलेट्स छोटी कोशिकाएँ हैं जो कट जाने पर ख़ून का थक्का बनाने में मदद करती हैं।",
      vs_en: "These cells help stop bleeding.",
      vs_hi: "ये कोशिकाएँ ख़ून बहना रोकने में मदद करती हैं।",
    },
    why: {
      en: "Your result is within the reference range shown on your report.",
      hi: "आपका परिणाम रिपोर्ट में दी गई सामान्य सीमा के भीतर है।",
      vs_en: "This result is within the usual range.",
    },
    causes: {
      en: "Platelet counts change with infections, medicines and many other conditions. Yours is within range.",
      hi: "संक्रमण, दवाओं और अन्य स्थितियों से प्लेटलेट्स बदलते हैं। आपका परिणाम सामान्य सीमा में है।",
    },
    todo: {
      en: "No action needed for this result alone.",
      hi: "केवल इस परिणाम के लिए कोई कार्रवाई ज़रूरी नहीं।",
      vs_en: "Nothing to do for this result.",
    },
    conf: {
      level: "high",
      pct: 97,
      note: {
        en: "Clear test name, value, unit and reference range were detected.",
        hi: "जाँच का नाम, मान, इकाई और सामान्य सीमा स्पष्ट रूप से पढ़ी गई।",
      },
    },
    sources: [],
    related: ["wbc", "hemoglobin"],
  },

  wbc: {
    id: "wbc",
    unit: "×10³/µL",
    name: { en: "WBC Count", hi: "WBC गणना" },
    simple: { en: "Infection-fighting cells", hi: "संक्रमण से लड़ने वाली कोशिकाएँ" },
    icon: "shieldplus",
    tint: "bg-emerald-100",
    ink: "text-emerald-600",
    ref: { low: 4, high: 11, text: "4–11 ×10³/µL" },
    what: {
      med: "Total leucocyte count quantifies circulating white blood cells, central to innate and adaptive immune response.",
      en: "White blood cells help your body fight infections.",
      hi: "सफ़ेद रक्त कोशिकाएँ आपके शरीर को संक्रमण से लड़ने में मदद करती हैं।",
      vs_en: "These are your body's defence cells.",
      vs_hi: "ये आपके शरीर की रक्षा करने वाली कोशिकाएँ हैं।",
    },
    why: {
      en: "Your result is within the reference range shown on your report.",
      hi: "आपका परिणाम सामान्य सीमा के भीतर है।",
      vs_en: "This result is within the usual range.",
    },
    causes: {
      en: "WBC rises or falls with infections, inflammation, stress and some medicines. Yours is within range.",
      hi: "संक्रमण, सूजन, तनाव और कुछ दवाओं से WBC बदलता है। आपका परिणाम सामान्य सीमा में है।",
    },
    todo: {
      en: "No action needed for this result alone.",
      hi: "केवल इस परिणाम के लिए कोई कार्रवाई ज़रूरी नहीं।",
      vs_en: "Nothing to do for this result.",
    },
    conf: {
      level: "high",
      pct: 96,
      note: {
        en: "Clear test name, value, unit and reference range were detected.",
        hi: "जाँच का नाम, मान, इकाई और सामान्य सीमा स्पष्ट रूप से पढ़ी गई।",
      },
    },
    sources: [],
    related: ["platelets", "hemoglobin"],
  },

  mcv: {
    id: "mcv",
    unit: "fL",
    name: { en: "MCV", hi: "MCV (लाल कोशिका आकार)" },
    simple: { en: "Red cell size", hi: "लाल कोशिका का आकार" },
    icon: "microscope",
    tint: "bg-fuchsia-100",
    ink: "text-fuchsia-600",
    ref: { low: 80, high: 100, text: "80–100 fL" },
    what: {
      med: "Mean corpuscular volume (MCV) is the average volume of a red blood cell, used to classify morphological subtypes of anaemia.",
      en: "MCV measures the average size of your red blood cells.",
      hi: "MCV आपकी लाल रक्त कोशिकाओं का औसत आकार मापता है।",
      vs_en: "This tells how big your red blood cells are.",
      vs_hi: "यह बताता है कि आपकी लाल रक्त कोशिकाएँ कितनी बड़ी हैं।",
    },
    why: {
      en: "Your result is within range, toward the lower end. Together with low hemoglobin, this can give your doctor a useful clue.",
      hi: "आपका परिणाम सामान्य सीमा में है, पर निचले हिस्से की ओर। कम हीमोग्लोबिन के साथ यह डॉक्टर को उपयोगी संकेत दे सकता है।",
      vs_en: "Your red cells are on the smaller side of normal.",
    },
    causes: {
      en: "Smaller red cells are commonly seen with low iron. Only a doctor can connect this finding to the actual cause.",
      hi: "छोटी लाल कोशिकाएँ आमतौर पर आयरन की कमी में देखी जाती हैं। असली कारण केवल डॉक्टर बता सकते हैं।",
    },
    todo: {
      en: "Discuss this together with your hemoglobin result. Your doctor may suggest iron studies.",
      hi: "इसे हीमोग्लोबिन के परिणाम के साथ डॉक्टर से चर्चा करें। डॉक्टर आयरन की जाँच सुझा सकते हैं।",
      vs_en: "Talk to your doctor with your hemoglobin result.",
    },
    conf: {
      level: "moderate",
      pct: 84,
      note: {
        en: "Value was clear; abbreviation “MCV” appeared in a dense table column.",
        hi: "मान स्पष्ट था; “MCV” संक्षिप्त नाम घने कॉलम में छपा था।",
      },
    },
    sources: ["medlineplus-hgb"],
    related: ["hemoglobin", "rbc", "hematocrit"],
  },

  rbc: {
    id: "rbc",
    unit: "mill/µL",
    name: { en: "RBC Count", hi: "RBC गणना" },
    simple: { en: "Red blood cells", hi: "लाल रक्त कोशिकाएँ" },
    icon: "droplet",
    tint: "bg-red-100",
    ink: "text-red-500",
    ref: { low: 4.5, high: 5.9, text: "4.5–5.9 mill/µL" },
    what: {
      med: "Red cell count quantifies circulating erythrocytes per microlitre of whole blood.",
      en: "This counts the red blood cells that carry oxygen in your blood.",
      hi: "यह आपके ख़ून में ऑक्सीजन पहुँचाने वाली लाल कोशिकाओं की गिनती है।",
      vs_en: "This counts the cells that carry oxygen.",
      vs_hi: "यह ऑक्सीजन पहुँचाने वाली कोशिकाओं की गिनती है।",
    },
    why: {
      en: "Your result is within the reference range shown on your report.",
      hi: "आपका परिणाम सामान्य सीमा के भीतर है।",
      vs_en: "This result is within the usual range.",
    },
    causes: {
      en: "RBC count changes with hydration, iron levels and other conditions. Yours is within range.",
      hi: "पानी की मात्रा, आयरन और अन्य स्थितियों से RBC बदलता है। आपका परिणाम सामान्य सीमा में है।",
    },
    todo: {
      en: "No action needed for this result alone.",
      hi: "केवल इस परिणाम के लिए कोई कार्रवाई ज़रूरी नहीं।",
      vs_en: "Nothing to do for this result.",
    },
    conf: {
      level: "high",
      pct: 95,
      note: {
        en: "Clear test name, value, unit and reference range were detected.",
        hi: "जाँच का नाम, मान, इकाई और सामान्य सीमा स्पष्ट रूप से पढ़ी गई।",
      },
    },
    sources: ["medlineplus-hgb"],
    related: ["hemoglobin", "mcv", "hematocrit"],
  },

  hematocrit: {
    id: "hematocrit",
    unit: "%",
    name: { en: "Hematocrit", hi: "हेमैटोक्रिट" },
    simple: { en: "Blood thickness", hi: "ख़ून की गाढ़ता" },
    icon: "testtube",
    tint: "bg-rose-50",
    ink: "text-rose-400",
    ref: { low: 40, high: 50, text: "40–50%" },
    what: {
      med: "Haematocrit is the volume percentage of red blood cells in whole blood.",
      en: "Hematocrit shows what share of your blood is made of red blood cells.",
      hi: "हेमैटोक्रिट बताता है कि आपके ख़ून का कितना हिस्सा लाल कोशिकाओं से बना है।",
      vs_en: "This shows how much of your blood is red cells.",
      vs_hi: "यह बताता है कि आपके ख़ून में कितनी लाल कोशिकाएँ हैं।",
    },
    why: {
      en: "Your result is within the reference range shown on your report.",
      hi: "आपका परिणाम सामान्य सीमा के भीतर है।",
      vs_en: "This result is within the usual range.",
    },
    causes: {
      en: "Hematocrit moves together with hemoglobin and hydration. Yours is within range.",
      hi: "हीमोग्लोबिन और शरीर में पानी के साथ हेमैटोक्रिट बदलता है। आपका परिणाम सामान्य सीमा में है।",
    },
    todo: {
      en: "No action needed for this result alone.",
      hi: "केवल इस परिणाम के लिए कोई कार्रवाई ज़रूरी नहीं।",
      vs_en: "Nothing to do for this result.",
    },
    conf: {
      level: "high",
      pct: 95,
      note: {
        en: "Clear test name, value, unit and reference range were detected.",
        hi: "जाँच का नाम, मान, इकाई और सामान्य सीमा स्पष्ट रूप से पढ़ी गई।",
      },
    },
    sources: ["medlineplus-hgb"],
    related: ["hemoglobin", "rbc", "mcv"],
  },

  totalchol: {
    id: "totalchol",
    unit: "mg/dL",
    name: { en: "Total Cholesterol", hi: "कुल कोलेस्ट्रॉल" },
    simple: { en: "Total cholesterol", hi: "कुल कोलेस्ट्रॉल" },
    icon: "scale",
    tint: "bg-amber-50",
    ink: "text-amber-500",
    ref: { high: 200, text: "below 200 mg/dL" },
    what: {
      med: "Total cholesterol is the sum of HDL, LDL and VLDL cholesterol fractions in plasma.",
      en: "This adds up all the types of cholesterol in your blood.",
      hi: "यह आपके ख़ून में सभी प्रकार के कोलेस्ट्रॉल का कुल योग है।",
      vs_en: "This is the sum of all cholesterol in your blood.",
      vs_hi: "यह आपके ख़ून के सभी कोलेस्ट्रॉल का कुल योग है।",
    },
    why: {
      en: "Your result is within the preferred range — right under the limit. Your doctor will still read it together with LDL and HDL.",
      hi: "आपका परिणाम पसंदीदा सीमा के भीतर है — सीमा से ठीक नीचे। डॉक्टर इसे LDL और HDL के साथ देखेंगे।",
      vs_en: "This is within range, close to the limit.",
    },
    causes: {
      en: "Total cholesterol follows food habits, activity, weight and family history.",
      hi: "कुल कोलेस्ट्रॉल खान-पान, गतिविधि, वज़न और पारिवारिक इतिहास से जुड़ा होता है।",
    },
    todo: {
      en: "Review with your doctor as part of your full lipid pattern.",
      hi: "अपने पूरे लिपिड पैटर्न के हिस्से के रूप में डॉक्टर से समीक्षा करें।",
      vs_en: "Discuss with your doctor together with LDL and HDL.",
    },
    conf: {
      level: "high",
      pct: 92,
      note: {
        en: "Clear test name, value, unit and reference range were detected.",
        hi: "जाँच का नाम, मान, इकाई और सामान्य सीमा स्पष्ट रूप से पढ़ी गई।",
      },
    },
    sources: ["aha-chol"],
    related: ["ldl", "hdl", "triglycerides"],
  },

  potassium: {
    id: "potassium",
    unit: "mmol/L",
    name: { en: "Potassium", hi: "पोटैशियम" },
    simple: { en: "Body salts — potassium", hi: "शरीर का लवण — पोटैशियम" },
    icon: "atom",
    tint: "bg-yellow-100",
    ink: "text-yellow-600",
    ref: { low: 3.5, high: 5.0, text: "3.5–5.0 mmol/L" },
    what: {
      med: "Serum potassium is a key extracellular electrolyte regulating cardiac and neuromuscular membrane excitability.",
      en: "Potassium is a mineral that helps your heart, muscles and nerves work properly.",
      hi: "पोटैशियम एक खनिज है जो आपके हृदय, माँसपेशियों और नसों को सही से काम करने में मदद करता है।",
      vs_en: "This mineral keeps your heart and muscles working.",
      vs_hi: "यह खनिज आपके हृदय और माँसपेशियों को सही से काम करने में मदद करता है।",
    },
    why: {
      en: "Your result is within the reference range shown on your report.",
      hi: "आपका परिणाम सामान्य सीमा के भीतर है।",
      vs_en: "This result is within the usual range.",
    },
    causes: {
      en: "Potassium changes with kidney function, medicines, vomiting or diarrhoea. Yours is within range.",
      hi: "किडनी की कार्यक्षमता, दवाओं, उल्टी या दस्त से पोटैशियम बदल सकता है। आपका परिणाम सामान्य सीमा में है।",
    },
    todo: {
      en: "No action needed for this result alone.",
      hi: "केवल इस परिणाम के लिए कोई कार्रवाई ज़रूरी नहीं।",
      vs_en: "Nothing to do for this result.",
    },
    conf: {
      level: "high",
      pct: 96,
      note: {
        en: "Clear test name, value, unit and reference range were detected.",
        hi: "जाँच का नाम, मान, इकाई और सामान्य सीमा स्पष्ट रूप से पढ़ी गई।",
      },
    },
    sources: [],
    related: ["creatinine"],
  },
};

export const TEST_IDS = Object.keys(TESTS);

/**
 * Metadata captured with a report result when its test is not in our clinical
 * catalogue. It is intentionally limited to what was printed beside that
 * result; it must never be filled with another test's name, unit, or range.
 */
export interface ReportTestMetadata {
  label?: string;
  unit?: string;
  reference?: { low?: number; high?: number; text?: string };
}

function cleanReportLabel(value: string | undefined, fallback: string): string {
  const clean = value
    ?.replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 96);
  if (clean) return clean;
  return fallback
    .replace(/^report_/, "")
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase())
    .trim() || "Unlabelled test";
}

/**
 * Safe presentation definition for a real result that is not catalogued yet.
 * The copy is deliberately non-clinical: without a trusted definition we show
 * the recorded label/value and tell the person to use the printed range or ask
 * their clinician, rather than borrowing Hemoglobin metadata.
 */
export function createUnknownTestDef(
  testId: string,
  metadata: ReportTestMetadata = {}
): TestDef {
  const label = cleanReportLabel(metadata.label, testId);
  const unit = metadata.unit?.replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, 32) || "";
  const low = Number.isFinite(metadata.reference?.low) ? metadata.reference?.low : undefined;
  const high = Number.isFinite(metadata.reference?.high) ? metadata.reference?.high : undefined;
  const rangeText =
    metadata.reference?.text?.replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, 96) ||
    (low !== undefined && high !== undefined
      ? `${low}–${high}${unit ? ` ${unit}` : ""}`
      : low !== undefined
        ? `above ${low}${unit ? ` ${unit}` : ""}`
        : high !== undefined
          ? `below ${high}${unit ? ` ${unit}` : ""}`
          : "Reference range not reported");

  return {
    id: testId,
    unit,
    name: { en: label, hi: label },
    simple: { en: label, hi: label },
    icon: "flask",
    tint: "bg-slate-100",
    ink: "text-slate-500",
    ref: { low, high, text: rangeText },
    what: {
      med: "This test was recorded from your report, but an explanation is not available in the current catalogue.",
      en: "This test was recorded from your report, but an explanation is not available yet.",
      hi: "यह जाँच आपकी रिपोर्ट से दर्ज की गई है, लेकिन इसकी व्याख्या अभी उपलब्ध नहीं है।",
      vs_en: "This result came from your report. Ask your doctor what it means.",
      vs_hi: "यह परिणाम आपकी रिपोर्ट से लिया गया है। इसका अर्थ डॉक्टर से पूछें।",
    },
    why: {
      en: "Use the reference range printed on your report; this result needs clinical context.",
      hi: "अपनी रिपोर्ट पर दी गई संदर्भ सीमा देखें; इस परिणाम के लिए डॉक्टर का संदर्भ ज़रूरी है।",
      vs_en: "Your doctor can explain this result using the printed range.",
    },
    causes: {
      en: "The app does not have enough trusted information to explain this test or its possible causes.",
      hi: "इस जाँच या इसके संभावित कारणों को समझाने के लिए ऐप के पास पर्याप्त विश्वसनीय जानकारी नहीं है।",
    },
    todo: {
      en: "Please show this result and its printed reference range to your doctor or laboratory.",
      hi: "इस परिणाम और इसकी छपी हुई संदर्भ सीमा को डॉक्टर या प्रयोगशाला को दिखाएँ।",
      vs_en: "Ask your doctor or laboratory about this result.",
    },
    conf: {
      level: "moderate",
      pct: 0,
      note: {
        en: "The result was recorded, but this test is not in the explanation catalogue.",
        hi: "परिणाम दर्ज किया गया है, लेकिन यह जाँच व्याख्या सूची में नहीं है।",
      },
    },
    sources: [],
    related: [],
  };
}

/** Resolve known metadata first, then preserve an unknown result honestly. */
export function resolveTestDef(
  testId: string,
  catalog?: Record<string, TestDef>,
  metadata?: ReportTestMetadata
): TestDef {
  const key = testId.toLowerCase();
  return catalog?.[testId] || catalog?.[key] || TESTS[testId] || TESTS[key] || createUnknownTestDef(key, metadata);
}

/* --------------------------------- SOURCES -------------------------------- */

export interface Source {
  id: string;
  title: string;
  publisher: string;
  country: string;
  url: string;
  excerpt: L2;
  usedFor: string[]; // test ids / pattern ids
}

export const SOURCES: Source[] = [
  {
    id: "medlineplus-hgb",
    title: "Hemoglobin Test",
    publisher: "MedlinePlus — U.S. National Library of Medicine",
    country: "USA",
    url: "https://medlineplus.gov/lab-tests/hemoglobin-test/",
    excerpt: {
      en: "Hemoglobin is a protein in your red blood cells that carries oxygen from your lungs to the rest of your body. If your hemoglobin level is lower than normal, you may have anemia.",
      hi: "हीमोग्लोबिन आपकी लाल रक्त कोशिकाओं में एक प्रोटीन है जो फेफड़ों से पूरे शरीर तक ऑक्सीजन पहुँचाता है। यदि स्तर सामान्य से कम हो, तो इसे एनीमिया कहा जा सकता है।",
    },
    usedFor: ["hemoglobin", "mcv", "rbc", "hematocrit", "pattern-blood"],
  },
  {
    id: "cdc-a1c",
    title: "A1C Test for Diabetes",
    publisher: "CDC — Centers for Disease Control and Prevention",
    country: "USA",
    url: "https://www.cdc.gov/diabetes/testing/",
    excerpt: {
      en: "The A1C test measures your average blood sugar levels over the past 2 or 3 months. An A1C below 5.7% is normal, between 5.7% and 6.4% indicates prediabetes, and 6.5% or higher suggests diabetes.",
      hi: "A1C जाँच पिछले 2–3 महीनों की औसत ब्लड शुगर मापती है। 5.7% से कम सामान्य, 5.7–6.4% प्री-डायबिटीज़, और 6.5% या अधिक डायबिटीज़ का संकेत होता है।",
    },
    usedFor: ["hba1c", "glucose", "pattern-sugar"],
  },
  {
    id: "aha-chol",
    title: "What Your Cholesterol Levels Mean",
    publisher: "American Heart Association",
    country: "USA",
    url: "https://www.heart.org/en/health-topics/cholesterol/about-cholesterol/what-your-cholesterol-levels-mean",
    excerpt: {
      en: "LDL cholesterol is considered the “bad” cholesterol because it contributes to fatty buildups in arteries. HDL cholesterol can be thought of as the “good” cholesterol because it helps remove other forms of cholesterol from your bloodstream.",
      hi: "LDL को “ख़राब” कोलेस्ट्रॉल कहा जाता है क्योंकि यह धमनियों में वसा जमाता है। HDL “अच्छा” कोलेस्ट्रॉल है क्योंकि यह अन्य कोलेस्ट्रॉल को रक्तप्रवाह से हटाने में मदद करता है।",
    },
    usedFor: ["ldl", "hdl", "totalchol", "pattern-lipid"],
  },
  {
    id: "nhlbi-tg",
    title: "High Blood Triglycerides",
    publisher: "NHLBI — National Heart, Lung, and Blood Institute (NIH)",
    country: "USA",
    url: "https://www.nhlbi.nih.gov/health/high-blood-triglycerides",
    excerpt: {
      en: "Triglycerides are a type of fat found in your blood. High levels, especially together with high LDL or low HDL, are associated with increased risk of heart and blood vessel disease.",
      hi: "ट्राइग्लिसराइड आपके ख़ून में पाई जाने वाली वसा है। अधिक स्तर — ख़ासकर LDL अधिक या HDL कम होने पर — हृदय और रक्त वाहिका रोग का जोख़िम बढ़ाता है।",
    },
    usedFor: ["triglycerides", "pattern-lipid"],
  },
  {
    id: "medlineplus-creatinine",
    title: "Creatinine Test",
    publisher: "MedlinePlus — U.S. National Library of Medicine",
    country: "USA",
    url: "https://medlineplus.gov/lab-tests/creatinine-test/",
    excerpt: {
      en: "A creatinine test measures how well your kidneys are performing their job of filtering waste from your blood.",
      hi: "क्रिएटिनिन जाँच मापती है कि आपकी किडनी ख़ून से अपशिष्ट छानने का काम कितनी अच्छी तरह कर रही है।",
    },
    usedFor: ["creatinine"],
  },
];

/* --------------------------------- REPORTS -------------------------------- */

export interface ReportEntry extends ReportTestMetadata {
  /** Catalogue code, or a stable report_* id for an uncatalogued result. */
  test: string;
  value: number;
  status: Status;
  /** False when the report had no trusted range from which to classify it. */
  statusKnown?: boolean;
}

/** Whether a result's status came from a catalogue or a printed range. */
export function reportStatusKnown(entry: ReportEntry): boolean {
  return (
    entry.statusKnown ??
    Boolean(TESTS[entry.test] || entry.reference?.low !== undefined || entry.reference?.high !== undefined)
  );
}

export interface Report {
  id: string;
  date: L2; // display date
  month: { en: string; hi: string };
  testsCount: number;
  attention: number;
  entries: ReportEntry[];
}

const E = (test: string, value: number, status: Status): ReportEntry => ({
  test,
  value,
  status,
});

export const REPORTS: Report[] = [
  {
    id: "feb26",
    date: { en: "12 Feb 2026", hi: "12 फ़रवरी 2026" },
    month: { en: "Feb", hi: "फ़र." },
    testsCount: 11,
    attention: 0,
    entries: [
      E("hemoglobin", 12.8, "normal"),
      E("hba1c", 5.9, "borderline"),
      E("glucose", 96, "normal"),
      E("ldl", 138, "borderline"),
      E("hdl", 44, "normal"),
      E("triglycerides", 158, "borderline"),
      E("totalchol", 189, "normal"),
      E("creatinine", 0.9, "normal"),
      E("platelets", 228, "normal"),
      E("wbc", 6.1, "normal"),
      E("potassium", 4.2, "normal"),
    ],
  },
  {
    id: "apr26",
    date: { en: "05 Apr 2026", hi: "5 अप्रैल 2026" },
    month: { en: "Apr", hi: "अप्रै." },
    testsCount: 12,
    attention: 2,
    entries: [
      E("hemoglobin", 12.3, "normal"),
      E("hba1c", 6.1, "borderline"),
      E("glucose", 104, "borderline"),
      E("ldl", 142, "high"),
      E("hdl", 42, "normal"),
      E("triglycerides", 170, "high"),
      E("totalchol", 201, "borderline"),
      E("creatinine", 0.9, "normal"),
      E("platelets", 236, "normal"),
      E("wbc", 6.8, "normal"),
      E("mcv", 83.4, "normal"),
      E("potassium", 4.4, "normal"),
    ],
  },
  {
    id: "jun26",
    date: { en: "12 Jun 2026", hi: "12 जून 2026" },
    month: { en: "Jun", hi: "जून" },
    testsCount: 13,
    attention: 3,
    entries: [
      E("hemoglobin", 11.4, "low"),
      E("hba1c", 6.8, "high"),
      E("glucose", 116, "borderline"),
      E("ldl", 149, "high"),
      E("hdl", 39, "low"),
      E("triglycerides", 188, "high"),
      E("totalchol", 214, "high"),
      E("creatinine", 0.9, "normal"),
      E("platelets", 215, "normal"),
      E("wbc", 6.5, "normal"),
      E("mcv", 82.1, "normal"),
      E("rbc", 4.4, "low"),
      E("potassium", 4.3, "normal"),
    ],
  },
  {
    id: "aug26",
    date: { en: "20 Aug 2026", hi: "20 अगस्त 2026" },
    month: { en: "Aug", hi: "अग." },
    testsCount: 14,
    attention: 3,
    entries: [
      E("hemoglobin", 10.5, "low"),
      E("hba1c", 7.2, "high"),
      E("ldl", 154, "high"),
      E("hdl", 48, "normal"),
      E("glucose", 88, "normal"),
      E("triglycerides", 128, "normal"),
      E("creatinine", 1.0, "normal"),
      E("platelets", 210, "normal"),
      E("wbc", 6.4, "normal"),
      E("mcv", 82.4, "normal"),
      E("rbc", 4.6, "normal"),
      E("hematocrit", 41.2, "normal"),
      E("totalchol", 182, "normal"),
      E("potassium", 4.3, "normal"),
    ],
  },
];

export const LATEST = REPORTS[REPORTS.length - 1];

export function getValue(reportId: string, testId: string): number | undefined {
  return REPORTS.find((r) => r.id === reportId)?.entries.find((e) => e.test === testId)?.value;
}

export function latestEntry(testId: string): ReportEntry | undefined {
  return LATEST.entries.find((e) => e.test === testId);
}

/* ---------------------------------- TRENDS --------------------------------- */

export interface TrendInfo {
  test: string;
  dir: "up" | "down" | "flat";
  label: L2;
  delta: string;
  attention: boolean;
}

export const TREND_DATES = REPORTS.map((r) => r.month);

export function trendSeries(testId: string): number[] {
  return REPORTS.map((r) => getValue(r.id, testId) as number);
}

export const TREND_CARDS: TrendInfo[] = [
  {
    test: "hemoglobin",
    dir: "down",
    label: { en: "Downward trend", hi: "घटता रुझान" },
    delta: "−18% in 6 months",
    attention: true,
  },
  {
    test: "hba1c",
    dir: "up",
    label: { en: "Gradually increasing", hi: "धीरे-धीरे बढ़ रहा है" },
    delta: "+1.3 points in 6 months",
    attention: true,
  },
  {
    test: "glucose",
    dir: "up",
    label: { en: "Gradually increasing", hi: "धीरे-धीरे बढ़ रहा है" },
    delta: "+30 mg/dL in 6 months",
    attention: true,
  },
  {
    test: "ldl",
    dir: "up",
    label: { en: "Rising slowly", hi: "धीरे-धीरे बढ़ रहा है" },
    delta: "+16 mg/dL in 6 months",
    attention: true,
  },
  {
    test: "hdl",
    dir: "down",
    label: { en: "Below preferred level", hi: "पसंदीदा स्तर से कम" },
    delta: "−8 mg/dL in 6 months",
    attention: true,
  },
  {
    test: "triglycerides",
    dir: "up",
    label: { en: "Rising steadily", hi: "लगातार बढ़ रहा है" },
    delta: "+47 mg/dL in 6 months",
    attention: true,
  },
  {
    test: "creatinine",
    dir: "flat",
    label: { en: "Stable", hi: "स्थिर" },
    delta: "No meaningful change",
    attention: false,
  },
  {
    test: "platelets",
    dir: "flat",
    label: { en: "Stable", hi: "स्थिर" },
    delta: "Within normal variation",
    attention: false,
  },
];

/* --------------------------------- PATTERNS -------------------------------- */

export interface Pattern {
  id: string;
  title: L2;
  nodes: { test: string; arrow: "up" | "down" | "flat"; note?: L2 }[];
  expl: L2;
  risk: L2;
  disclaimer: L2;
  source: string;
  conf: { level: "high" | "moderate"; pct: number };
}

export const PATTERNS: Pattern[] = [
  {
    id: "pattern-lipid",
    title: { en: "Lipid pattern", hi: "लिपिड पैटर्न" },
    nodes: [
      { test: "ldl", arrow: "up", note: { en: "154 · above usual", hi: "154 · सामान्य से अधिक" } },
      { test: "hdl", arrow: "down", note: { en: "36 · below preferred", hi: "36 · पसंदीदा से कम" } },
      { test: "triglycerides", arrow: "up", note: { en: "205 · moderately high", hi: "205 · मामूली अधिक" } },
    ],
    expl: {
      en: "These three results move together. Together they suggest a less favourable cholesterol pattern than looking at any one number alone.",
      hi: "ये तीन परिणाम एक साथ जुड़े हैं। मिलकर ये किसी एक संख्या की तुलना में कम अनुकूल कोलेस्ट्रॉल पैटर्न दर्शाते हैं।",
    },
    risk: {
      en: "This pattern may be associated with increased cardiovascular risk over time.",
      hi: "यह पैटर्न समय के साथ कार्डियोवैस्कुलर जोख़िम बढ़ाने से जुड़ा हो सकता है।",
    },
    disclaimer: {
      en: "This is not a diagnosis. Your doctor will interpret this pattern with your age, history and lifestyle.",
      hi: "यह निदान नहीं है। डॉक्टर इसे आपकी उम्र, इतिहास और जीवनशैली के साथ समझेंगे।",
    },
    source: "aha-chol",
    conf: { level: "high", pct: 92 },
  },
  {
    id: "pattern-blood",
    title: { en: "Blood-count pattern", hi: "रक्त-गणना पैटर्न" },
    nodes: [
      { test: "hemoglobin", arrow: "down", note: { en: "10.5 · low, falling", hi: "10.5 · कम, घट रहा है" } },
      { test: "mcv", arrow: "down", note: { en: "82.4 · lower end of range", hi: "82.4 · सीमा का निचला हिस्सा" } },
      { test: "rbc", arrow: "flat", note: { en: "4.6 · within range", hi: "4.6 · सीमा के भीतर" } },
    ],
    expl: {
      en: "These results are related. Red cells that are on the smaller side, together with falling hemoglobin, may help your doctor understand the possible reason — for example low iron.",
      hi: "ये परिणाम एक-दूसरे से जुड़े हैं। आकार में छोटी लाल कोशिकाएँ और घटता हीमोग्लोबिन मिलकर डॉक्टर को संभावित कारण समझने में मदद कर सकते हैं — जैसे आयरन की कमी।",
    },
    risk: {
      en: "This combination gives your doctor a direction to investigate; it cannot identify the cause by itself.",
      hi: "यह संयोजन डॉक्टर को जाँच की दिशा देता है; अकेले यह कारण नहीं बता सकता।",
    },
    disclaimer: {
      en: "This does not establish a diagnosis.",
      hi: "यह निदान सिद्ध नहीं करता।",
    },
    source: "medlineplus-hgb",
    conf: { level: "moderate", pct: 86 },
  },
  {
    id: "pattern-sugar",
    title: { en: "Raised blood-sugar pattern", hi: "बढ़ी ब्लड शुगर पैटर्न" },
    nodes: [
      { test: "glucose", arrow: "up", note: { en: "126 · above usual", hi: "126 · सामान्य से अधिक" } },
      { test: "hba1c", arrow: "up", note: { en: "7.2% · above usual", hi: "7.2% · सामान्य से अधिक" } },
    ],
    expl: {
      en: "Both today's fasting sugar and your 3-month average are above the usual range — so this is a pattern, not a one-time reading.",
      hi: "आज की फ़ास्टिंग शुगर और 3 महीने की औसत — दोनों सामान्य सीमा से ऊपर हैं। यानी यह एक बार की रीडिंग नहीं, एक पैटर्न है।",
    },
    risk: {
      en: "Results in this range may be associated with diabetes and should be discussed with a healthcare professional.",
      hi: "इस सीमा के परिणाम डायबिटीज़ से जुड़े हो सकते हैं — इन पर डॉक्टर से चर्चा ज़रूरी है।",
    },
    disclaimer: {
      en: "Only a doctor can say what this means for you, after confirmation testing.",
      hi: "पुष्टि जाँच के बाद ही डॉक्टर बता सकते हैं कि यह आपके लिए क्या अर्थ रखता है।",
    },
    source: "cdc-a1c",
    conf: { level: "high", pct: 94 },
  },
  {
    id: "pattern-metabolic",
    title: { en: "Metabolic risk pattern", hi: "मेटाबोलिक जोख़िम पैटर्न" },
    nodes: [
      { test: "glucose", arrow: "up", note: { en: "raised", hi: "बढ़ी हुई" } },
      { test: "triglycerides", arrow: "up", note: { en: "raised", hi: "बढ़ी हुई" } },
      { test: "hdl", arrow: "down", note: { en: "low", hi: "कम" } },
      { test: "hba1c", arrow: "up", note: { en: "raised", hi: "बढ़ी हुई" } },
    ],
    expl: {
      en: "These markers indicate how your body processes sugars and fats. When they move together in this way, it forms a metabolic pattern.",
      hi: "ये संकेतक बताते हैं कि आपका शरीर शुगर और वसा को कैसे संसाधित करता है। जब ये एक साथ इस तरह बदलते हैं, तो यह एक मेटाबोलिक पैटर्न बनाता है।"
    },
    risk: {
      en: "This combination may increase the risk for metabolic syndrome, heart disease, or diabetes over time.",
      hi: "यह संयोजन समय के साथ मेटाबोलिक सिंड्रोम, हृदय रोग या डायबिटीज़ के जोखिम को बढ़ा सकता है।"
    },
    disclaimer: {
      en: "Only a doctor can say what this means for you, after further assessment.",
      hi: "पुष्टि जाँच के बाद ही डॉक्टर बता सकते हैं कि यह आपके लिए क्या अर्थ रखता है।"
    },
    source: "cdc-a1c",
    conf: { level: "high", pct: 90 },
  },
  {
    id: "pattern-kidney",
    title: { en: "Kidney marker pattern", hi: "किडनी मार्कर पैटर्न" },
    nodes: [
      { test: "creatinine", arrow: "up", note: { en: "high", hi: "अधिक" } },
      { test: "potassium", arrow: "up", note: { en: "high", hi: "अधिक" } },
    ],
    expl: {
      en: "These tests help evaluate kidney function. Their combined result is more informative than either alone.",
      hi: "ये परीक्षण किडनी की कार्यक्षमता का आकलन करने में मदद करते हैं। इनका संयुक्त परिणाम किसी एक के अकेले परिणाम से अधिक जानकारीपूर्ण है।"
    },
    risk: {
      en: "Abnormalities here could point to reduced kidney function, affecting how your body filters waste.",
      hi: "यहाँ असामान्यताएं गुर्दे की कम कार्यक्षमता की ओर इशारा कर सकती हैं, जो अपशिष्ट हटाने को प्रभावित करती हैं।"
    },
    disclaimer: {
      en: "This does not establish a diagnosis.",
      hi: "यह निदान सिद्ध नहीं करता।"
    },
    source: "medlineplus-creatinine",
    conf: { level: "high", pct: 90 },
  },
  {
    id: "pattern-wbc",
    title: { en: "White-cell pattern", hi: "श्वेत-कोशिका पैटर्न" },
    nodes: [
      { test: "wbc", arrow: "up", note: { en: "high", hi: "अधिक" } },
      { test: "neutrophils", arrow: "up", note: { en: "high", hi: "अधिक" } },
    ],
    expl: {
      en: "These are your infection-fighting cells. When multiple types are elevated, it indicates a coordinated immune response.",
      hi: "ये आपकी संक्रमण से लड़ने वाली कोशिकाएं हैं। जब कई प्रकार बढ़ जाते हैं, तो यह एक समन्वित प्रतिरक्षा प्रतिक्रिया का संकेत देता है।"
    },
    risk: {
      en: "This pattern is often a sign of an active infection or inflammation that your body is fighting.",
      hi: "यह पैटर्न अक्सर एक सक्रिय संक्रमण या सूजन का संकेत होता है जिससे आपका शरीर लड़ रहा है।"
    },
    disclaimer: {
      en: "This does not establish a diagnosis.",
      hi: "यह निदान सिद्ध नहीं करता।"
    },
    source: "medlineplus-hgb",
    conf: { level: "moderate", pct: 80 },
  }
];
/* ------------------------------- HEALTH STORY ------------------------------ */

export const STORY: { when: L2; text: L2; status: Status }[] = [
  {
    when: { en: "6 months ago", hi: "6 महीने पहले" },
    text: {
      en: "Hemoglobin was within the usual range (12.8 g/dL).",
      hi: "हीमोग्लोबिन सामान्य सीमा में था (12.8 g/dL)।",
    },
    status: "normal",
  },
  {
    when: { en: "3 months ago", hi: "3 महीने पहले" },
    text: {
      en: "Hemoglobin started moving down (11.4 g/dL).",
      hi: "हीमोग्लोबिन घटना शुरू हुआ (11.4 g/dL)।",
    },
    status: "borderline",
  },
  {
    when: { en: "Today", hi: "आज" },
    text: {
      en: "Hemoglobin is now below the usual range (10.5 g/dL). This trend is worth discussing with your doctor.",
      hi: "हीमोग्लोबिन अब सामान्य सीमा से नीचे है (10.5 g/dL)। इस रुझान पर डॉक्टर से चर्चा करना सही रहेगा।",
    },
    status: "low",
  },
];

/* ----------------------------- CRITICAL DEMO CARD -------------------------- */

export const CRITICAL_DEMO = {
  test: "Potassium",
  value: "6.4 mmol/L",
  ref: "3.5–5.0 mmol/L",
  line: {
    en: "This result is significantly outside the expected range and may require prompt medical attention.",
    hi: "यह परिणाम अपेक्षित सीमा से काफ़ी बाहर है और इसमें तुरंत चिकित्सकीय ध्यान देना ज़रूरी हो सकता है।",
  },
};

/* ------------------------------- KNOWLEDGE GRAPH --------------------------- */

export const KG_CLUSTERS: {
  title: L2;
  nodes: { test: string; x: number; y: number }[];
  edges: [number, number][];
  color: string;
}[] = [
  {
    title: { en: "Blood-count cluster", hi: "रक्त-गणना क्लस्टर" },
    color: "#e11d48",
    nodes: [
      { test: "hemoglobin", x: 50, y: 12 },
      { test: "mcv", x: 12, y: 55 },
      { test: "rbc", x: 88, y: 55 },
      { test: "hematocrit", x: 50, y: 92 },
    ],
    edges: [
      [0, 1],
      [0, 2],
      [1, 3],
      [2, 3],
      [0, 3],
    ],
  },
  {
    title: { en: "Lipid cluster", hi: "लिपिड क्लस्टर" },
    color: "#0d9488",
    nodes: [
      { test: "ldl", x: 50, y: 12 },
      { test: "hdl", x: 12, y: 58 },
      { test: "triglycerides", x: 88, y: 58 },
      { test: "totalchol", x: 50, y: 92 },
    ],
    edges: [
      [0, 1],
      [0, 2],
      [1, 3],
      [2, 3],
      [0, 3],
    ],
  },
];

/* ------------------------------ DEMO PIPELINE ------------------------------ */

export const PIPELINE: { icon: string; title: L2; desc: L2 }[] = [
  {
    icon: "camera",
    title: { en: "Report photo / PDF", hi: "रिपोर्ट फ़ोटो / PDF" },
    desc: { en: "Camera, PDF, scan or CSV — any format.", hi: "कैमरा, PDF, स्कैन या CSV — कोई भी प्रारूप।" },
  },
  {
    icon: "scan",
    title: { en: "Vision reading", hi: "विज़न रीडिंग" },
    desc: { en: "Reads printed and handwritten reports, including Indian lab formats.", hi: "छपी और हस्तलिखित रिपोर्ट पढ़ता है — भारतीय लैब प्रारूप सहित।" },
  },
  {
    icon: "broom",
    title: { en: "Data normalisation", hi: "डेटा सामान्यीकरण" },
    desc: { en: "Test names, synonyms and units are standardised (e.g. “Hb”, “Haemoglobin”, “हेमोग्लोबिन”).", hi: "जाँच के नाम, पर्यायवाची और इकाइयाँ मानकीकृत होते हैं।" },
  },
  {
    icon: "ruler",
    title: { en: "Reference-range validation", hi: "संदर्भ-सीमा सत्यापन" },
    desc: { en: "Your lab's own printed ranges are used — not generic internet numbers.", hi: "आपकी लैब की छपी सीमा का उपयोग होता है — सामान्य इंटरनेट संख्याएँ नहीं।" },
  },
  {
    icon: "traffic",
    title: { en: "Abnormality detection", hi: "असामान्यता पहचान" },
    desc: { en: "Normal · Borderline · High/Low · Critical — graded, not just binary flags.", hi: "सामान्य · सीमा पर · अधिक/कम · गंभीर — सिर्फ़ हाँ/नहीं नहीं, चरणबद्ध।" },
  },
  {
    icon: "brain",
    title: { en: "Multi-test reasoning", hi: "बहु-जाँच तर्क" },
    desc: { en: "Related results are connected through a clinical knowledge graph.", hi: "संबंधित परिणाम क्लिनिकल नॉलेज ग्राफ़ से जुड़ते हैं।" },
  },
  {
    icon: "book",
    title: { en: "Medical RAG", hi: "मेडिकल RAG" },
    desc: { en: "Explanations are grounded in MedlinePlus, CDC, AHA and ICMR-style sources.", hi: "व्याख्याएँ MedlinePlus, CDC, AHA जैसे स्रोतों पर आधारित होती हैं।" },
  },
  {
    icon: "bot",
    title: { en: "AI explanation", hi: "AI व्याख्या" },
    desc: { en: "Generated in three reading levels with uncertainty and citations.", hi: "तीन पठन-स्तरों में — अनिश्चितता और उद्धरण सहित।" },
  },
  {
    icon: "chart",
    title: { en: "Trend analysis", hi: "रुझान विश्लेषण" },
    desc: { en: "Old reports are compared so one number never tells the whole story.", hi: "पुरानी रिपोर्ट की तुलना — एक संख्या पूरी कहानी नहीं बताती।" },
  },
  {
    icon: "globe",
    title: { en: "Multilingual output", hi: "बहुभाषी आउटपुट" },
    desc: { en: "English, हिन्दी, বাংলা and more — with voice playback.", hi: "English, हिन्दी, বাংলা और अधिक — वॉयस के साथ।" },
  },
  {
    icon: "userheart",
    title: { en: "Patient-friendly report", hi: "रोगी-अनुकूल रिपोर्ट" },
    desc: { en: "A simple explanation anyone can understand — plus a clinical doctor summary.", hi: "हर कोई समझ सके ऐसी सरल व्याख्या — और डॉक्टर के लिए क्लिनिकल सारांश।" },
  },
];

/* ------------------------------ COMPARISON TABLE --------------------------- */

export const COMPARE_ROWS: {
  feature: L2;
  portal: "yes" | "no" | "partial" | "limited";
  generic: "yes" | "no" | "partial" | "limited";
  rx: "yes" | "no" | "partial" | "limited";
}[] = [
  { feature: { en: "Raw report reading", hi: "रिपोर्ट पढ़ना" }, portal: "yes", generic: "yes", rx: "yes" },
  { feature: { en: "Simple explanations", hi: "सरल व्याख्या" }, portal: "no", generic: "yes", rx: "yes" },
  { feature: { en: "Multi-test reasoning", hi: "बहु-जाँच तर्क" }, portal: "no", generic: "limited", rx: "yes" },
  { feature: { en: "Trend analysis", hi: "रुझान विश्लेषण" }, portal: "no", generic: "limited", rx: "yes" },
  { feature: { en: "Citations / evidence", hi: "उद्धरण / प्रमाण" }, portal: "no", generic: "partial", rx: "yes" },
  { feature: { en: "Confidence indicator", hi: "विश्वास संकेतक" }, portal: "no", generic: "limited", rx: "yes" },
  { feature: { en: "Indian languages", hi: "भारतीय भाषाएँ" }, portal: "limited", generic: "partial", rx: "yes" },
  { feature: { en: "Low-literacy interface", hi: "कम-साक्षर इंटरफ़ेस" }, portal: "no", generic: "no", rx: "yes" },
  { feature: { en: "Doctor summary", hi: "डॉक्टर सारांश" }, portal: "limited", generic: "limited", rx: "yes" },
];

/* --------------------------------- HELPERS --------------------------------- */

export function statusGroup(s: Status): "normal" | "borderline" | "out" | "critical" {
  if (s === "normal") return "normal";
  if (s === "borderline") return "borderline";
  if (s === "critical") return "critical";
  return "out";
}

export function fmtValue(v: number): string {
  return v % 1 === 0 ? String(v) : v.toFixed(1);
}

export const PATIENT = {
  name: { en: "Mr. Rahul Singh", hi: "श्री राहुल सिंह" },
  nameShort: "Rahul Singh",
  age: 42,
  gender: { en: "Male", hi: "पुरुष" },
  fictionalNote: {
    en: "Fictional sample data for demonstration",
    hi: "प्रदर्शन हेतु काल्पनिक नमूना डेटा",
  },
};

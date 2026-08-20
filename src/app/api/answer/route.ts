// POST /api/answer — rule-grounded, report-contextual Q&A for the prototype.
// In production this is where the RAG pipeline would run; rules here are
// deterministic so the demo is reproducible and always safe (no diagnosis).

import { NextResponse } from "next/server";

interface Answer {
  matched: string;
  en: string;
  hi: string;
  sources: number;
  confidence: "high" | "moderate";
}

const RULES: { keys: RegExp; a: Answer }[] = [
  {
    keys: /(hemoglobin|haemoglobin|हीमोग्लोबिन|hgb|\bhb\b)/i,
    a: {
      matched: "hemoglobin",
      en: "Your hemoglobin is **10.5 g/dL**, which is below the reference range (12–16) shown on your report.\n\nLow hemoglobin can happen for different reasons, such as **iron deficiency, blood loss, or vitamin deficiencies**. Your MCV (82.4 fL) is at the lower end of its range — related, but it cannot determine the cause by itself.\n\nPlease discuss this result with your doctor — especially if you feel tired, weak or dizzy.",
      hi: "आपका हीमोग्लोबिन **10.5 g/dL** है, जो आपकी रिपोर्ट की सामान्य सीमा (12–16) से **कम** है।\n\nइसके कई कारण हो सकते हैं — जैसे **आयरन की कमी, शरीर से ख़ून की कमी, या विटामिन की कमी**। आपका MCV (82.4 fL) भी सीमा के निचले हिस्से में है — जुड़ा हुआ संकेत है, लेकिन अकेले कारण नहीं बताता।\n\nकृपया इस परिणाम पर डॉक्टर से चर्चा करें — ख़ासकर यदि थकान, कमज़ोरी या चक्कर हों।",
      sources: 2,
      confidence: "high",
    },
  },
  {
    keys: /(hba1c|a1c|sugar|diabetes|शुगर|डायबिटीज़|मधुमेह|glucose|ग्लूकोज़)/i,
    a: {
      matched: "hba1c",
      en: "**HbA1c shows your average blood sugar over the past 2–3 months.** Yours is **7.2%**, above the usual range (below 5.7%).\n\nYour fasting glucose (126 mg/dL) is also above its usual range — so this looks like a pattern rather than a one-time reading. Results in this range **may be associated with diabetes** and should be discussed with a healthcare professional.\n\nThis is not a diagnosis — only a doctor can confirm what it means for you.",
      hi: "**HbA1c पिछले 2–3 महीनों की औसत ब्लड शुगर बताता है।** आपका **7.2%** है — सामान्य सीमा (5.7% से कम) से अधिक।\n\nआपकी फ़ास्टिंग ग्लूकोज़ (126 mg/dL) भी सामान्य सीमा से ऊपर है — यानी यह एक बार की रीडिंग नहीं, **पैटर्न** लगता है। इस सीमा के परिणाम **डायबिटीज़ से जुड़े हो सकते हैं** और इन पर डॉक्टर से चर्चा ज़रूरी है।\n\nयह निदान नहीं है — केवल डॉक्टर पुष्टि कर सकते हैं।",
      sources: 1,
      confidence: "high",
    },
  },
  {
    keys: /(cholesterol|lipid|कोलेस्ट्रॉल|ldl|hdl|triglyceride|ट्राइग्लिसराइड|heart|दिल)/i,
    a: {
      matched: "lipid",
      en: "Three of your lipid results move together:\n- **LDL 154** — above the preferred range\n- **HDL 36** — below the preferred level\n- **Triglycerides 205** — moderately high\n\nTogether they suggest a **less favourable cholesterol pattern** than any one number alone. Such a pattern **may be associated with increased cardiovascular risk over time** — worth discussing with your doctor. This is not a diagnosis.",
      hi: "आपके तीन लिपिड परिणाम एक साथ जुड़े हैं:\n- **LDL 154** — पसंदीदा सीमा से अधिक\n- **HDL 36** — पसंदीदा स्तर से कम\n- **ट्राइग्लिसराइड 205** — मामूली अधिक\n\nमिलकर ये किसी एक संख्या की तुलना में **कम अनुकूल कोलेस्ट्रॉल पैटर्न** दर्शाते हैं। ऐसा पैटर्न समय के साथ **कार्डियोवैस्कुलर जोख़िम से जुड़ा हो सकता है** — डॉक्टर से चर्चा उचित है। यह निदान नहीं है।",
      sources: 2,
      confidence: "moderate",
    },
  },
  {
    keys: /(changed|most|trend|worse|बदल|रुझान|बदलाव)/i,
    a: {
      matched: "trend",
      en: "Compared with your February report, the biggest changes are:\n- **Hemoglobin: 12.8 → 10.5 g/dL** — down about 18%\n- **HbA1c: 5.9 → 7.2%** — steadily rising\n- **Triglycerides: 158 → 205 mg/dL** — rising\n- **HDL: 44 → 36 mg/dL** — going down\n\nCreatinine stayed stable. A repeated change over several reports is useful information for your doctor.",
      hi: "फ़रवरी रिपोर्ट की तुलना में सबसे बड़े बदलाव:\n- **हीमोग्लोबिन: 12.8 → 10.5 g/dL** — लगभग 18% कम\n- **HbA1c: 5.9 → 7.2%** — लगातार बढ़ रहा है\n- **ट्राइग्लिसराइड: 158 → 205 mg/dL** — बढ़ रहा है\n- **HDL: 44 → 36 mg/dL** — घट रहा है\n\nक्रिएटिनिन स्थिर रहा। कई रिपोर्टों में दोहराया बदलाव डॉक्टर के लिए उपयोगी जानकारी है।",
      sources: 0,
      confidence: "high",
    },
  },
  {
    keys: /(10|simple|simply|easier|आसान|सरल)/i,
    a: {
      matched: "simple",
      en: "**In the simplest words:**\n- Your **blood** is a little low — it may make you feel tired.\n- Your **sugar** has been high for a few months.\n- Your **bad cholesterol** is high, and the **good one** is low.\n- Your **kidney number** is fine.\n\nShow this report to your doctor — they will decide what to do next.",
      hi: "**सबसे आसान शब्दों में:**\n- आपका **ख़ून** थोड़ा कम है — इससे थकान हो सकती है।\n- आपकी **शुगर** कुछ महीनों से ज़्यादा है।\n- **ख़राब कोलेस्ट्रॉल** ज़्यादा है और **अच्छा वाला** कम है।\n- **किडनी का नंबर** ठीक है।\n\nयह रिपोर्ट डॉक्टर को दिखाएँ — आगे क्या करना है, वे बताएँगे।",
      sources: 0,
      confidence: "high",
    },
  },
  {
    keys: /(doctor|what should|next|do|क्या करूँ|डॉक्टर|आगे)/i,
    a: {
      matched: "next",
      en: "A good next step:\n- Book a visit with your doctor and carry this report (or the **Doctor Summary** in the menu).\n- Mention if you feel **tired, weak, dizzy or breathless**.\n- Your doctor may repeat some tests or add iron studies.\n\nNothing in this report is measured as immediately dangerous — but the sugar and hemoglobin trends deserve a conversation soon.",
      hi: "अच्छा अगला कदम:\n- डॉक्टर से समय लें और यह रिपोर्ट (या मेन्यू का **डॉक्टर सारांश**) साथ ले जाएँ।\n- यदि **थकान, कमज़ोरी, चक्कर या साँस फूलना** हो तो ज़रूर बताएँ।\n- डॉक्टर कुछ जाँचें दोहरा सकते हैं या आयरन की जाँच जोड़ सकते हैं।\n\nइस रिपोर्ट में कुछ भी तुरंत ख़तरनाक मापा नहीं गया — लेकिन शुगर और हीमोग्लोबिन के रुझान पर जल्द बात करना सही रहेगा।",
      sources: 0,
      confidence: "high",
    },
  },
];

const FALLBACK: Answer = {
  matched: "general",
  en: "I can answer questions about **your report** — for example your hemoglobin, HbA1c, cholesterol pattern, trends, or what to discuss with your doctor.\n\nTry one of the suggested questions below. For anything beyond these results, please consult a healthcare professional.",
  hi: "मैं **आपकी रिपोर्ट** के बारे में प्रश्नों के उत्तर दे सकता हूँ — जैसे हीमोग्लोबिन, HbA1c, कोलेस्ट्रॉल पैटर्न, रुझान, या डॉक्टर से क्या पूछें।\n\nनीचे दिए सुझाए प्रश्नों में से एक चुनें। इन परिणामों से परे किसी भी बात के लिए डॉक्टर से सलाह लें।",
  sources: 0,
  confidence: "moderate",
};

export async function POST(req: Request) {
  let body: { q?: string; lang?: string } = {};
  try {
    body = await req.json();
  } catch {
    /* empty body */
  }
  const q = (body.q ?? "").trim();
  const hasDevanagari = /[\u0900-\u097F]/.test(q);
  const lang = body.lang === "hi" || hasDevanagari ? "hi" : "en";

  const rule = RULES.find((r) => r.keys.test(q));
  const a = rule?.a ?? FALLBACK;

  return NextResponse.json({
    matched: a.matched,
    answer: lang === "hi" ? a.hi : a.en,
    sources: a.sources,
    confidence: a.confidence,
  });
}

// ---------------------------------------------------------------------------
// Deterministic, catalogue-grounded explanations for the chatbot.
//
// WHY THIS EXISTS
// When no MedGemma provider is configured (or a model call fails), the answer
// must not degrade to a generic "here are your results" paragraph. A patient
// asking "what is MCV?" or "why is my hemoglobin low?" deserves the same shape
// of answer a clinician would expect from the app: what the test IS, what
// THEIR value is and how it sits against the printed range, what it means, and
// everyday lifestyle/diet habits — in their language, safely.
//
// Everything here is authored copy drawn from the reviewed clinical catalogue
// (src/lib/data.ts TESTS/SOURCES). No value, range, or number is invented; the
// only numbers quoted are the person's own value and printed reference range.
// ---------------------------------------------------------------------------

import { TESTS, type L2 } from "@/lib/data";
import type { AnonymisedPayload, AnonymisedResult } from "./types";
import { safetyFooter } from "./translations";

/** Content languages the catalogue actually carries (en + hi). */
export type ExplainLang = "en" | "hi";

/**
 * Patient-language aliases for each test, in both scripts. This is deliberately
 * broader than the bare test code so an ordinary question like
 * "एमसीवी क्या होता है?" or "what is my bad cholesterol?" resolves to the right
 * marker. It intentionally does NOT include ambiguous words ("blood", "heart",
 * "sugar" is kept out here and lives only in the RAG synonym list) so a generic
 * health question cannot be misread as a question about one specific test.
 */
const TEST_ALIASES: Record<string, string[]> = {
  hemoglobin: ["hemoglobin", "haemoglobin", "hgb", "hb", "हीमोग्लोबिन", "हिमोग्लोबिन", "एचबी", "एनीमिया"],
  hba1c: ["hba1c", "a1c", "एचबीए1सी", "एचबी ए1सी", "ए1सी", "average sugar", "three month sugar"],
  glucose: ["glucose", "fasting sugar", "blood sugar", "ग्लूकोज़", "ग्लूकोज", "फ़ास्टिंग", "फास्टिंग"],
  ldl: ["ldl", "bad cholesterol", "एलडीएल", "एल डी एल", "ख़राब कोलेस्ट्रॉल", "खराब कोलेस्ट्रॉल"],
  hdl: ["hdl", "good cholesterol", "एचडीएल", "एच डी एल", "अच्छा कोलेस्ट्रॉल"],
  totalchol: ["total cholesterol", "cholesterol", "कुल कोलेस्ट्रॉल", "टोटल कोलेस्ट्रॉल", "कोलेस्ट्रॉल"],
  triglycerides: ["triglyceride", "triglycerides", "ट्राइग्लिसराइड", "ट्राइग्लिसराइड्स", "ट्रायग्लिसराइड"],
  creatinine: ["creatinine", "क्रिएटिनिन", "किडनी", "गुर्दा", "गुर्दे", "renal"],
  platelets: ["platelet", "platelets", "प्लेटलेट", "प्लेटलेट्स", "थक्का"],
  wbc: ["wbc", "white blood cell", "white blood cells", "white cell", "डब्ल्यूबीसी", "डब्ल्यू बी सी", "श्वेत कोशिका", "सफ़ेद कोशिका", "सफेद रक्त कोशिका"],
  mcv: ["mcv", "mean corpuscular volume", "cell size", "एमसीवी", "एम सी वी", "कोशिका आकार", "सेल साइज़"],
  rbc: ["rbc", "red blood cell", "red cell", "आरबीसी", "आर बी सी", "लाल कोशिका", "लाल रक्त कोशिका"],
  hematocrit: ["hematocrit", "haematocrit", "pcv", "हेमटोक्रिट", "हेमैटोक्रिट", "पीसीवी", "पी सी वी"],
  potassium: ["potassium", "पोटैशियम", "पोटेशियम"],
};

/** Everyday habits that support (or help normalise) each marker. Safe copy. */
const LIFESTYLE_TIPS: Record<string, L2> = {
  hemoglobin: {
    en: "- Eat iron-rich foods: leafy greens, lentils, beans, eggs and lean meat.\n- Add vitamin C (lemon, amla, tomato, orange) with meals to help your body absorb iron.\n- Get enough vitamin B12 and folate, stay hydrated, and keep a regular sleep routine.",
    hi: "- आयरन वाले भोजन लें: हरी पत्तेदार सब्ज़ियाँ, दालें, बीन्स, अंडे और दुबला माँस।\n- खाने के साथ विटामिन C (नींबू, आँवला, टमाटर, संतरा) लें ताकि शरीर आयरन अच्छे से सोख सके।\n- विटामिन B12 और फ़ोलेट पर्याप्त लें, पानी पीते रहें और नींद नियमित रखें।",
  },
  hba1c: {
    en: "- Be active most days — a brisk walk helps your body use sugar better.\n- Eat more vegetables, whole grains and fibre; cut back on sugary drinks and sweets.\n- Keep a healthy weight and get regular check-ups as advised.",
    hi: "- ज़्यादातर दिन सक्रिय रहें — तेज़ चाल से चलना शरीर को शुगर का बेहतर इस्तेमाल करने में मदद करता है।\n- सब्ज़ियाँ, साबुत अनाज और रेशा अधिक खाएँ; मीठे पेय और मिठाइयाँ कम करें।\n- वज़न संतुलित रखें और सलाह अनुसार नियमित जाँच कराते रहें।",
  },
  glucose: {
    en: "- Eat at regular times and prefer vegetables, whole grains and protein.\n- Limit sugary drinks, sweets and refined flour snacks.\n- Stay active and get enough sleep — both help keep sugar steady.",
    hi: "- नियमित समय पर भोजन करें और सब्ज़ियाँ, साबुत अनाज व प्रोटीन चुनें।\n- मीठे पेय, मिठाइयाँ और मैदे के स्नैक्स कम करें।\n- सक्रिय रहें और पर्याप्त नींद लें — दोनों शुगर स्थिर रखने में मदद करते हैं।",
  },
  ldl: {
    en: "- Cut down fried food, butter, ghee and fatty meats.\n- Eat more fibre: oats, vegetables, fruits and pulses.\n- Stay active and keep a healthy weight.",
    hi: "- तला-भुना, मक्खन, घी और वसायुक्त माँस कम करें।\n- अधिक रेशा लें: जई, सब्ज़ियाँ, फल और दालें।\n- सक्रिय रहें और वज़न संतुलित रखें।",
  },
  hdl: {
    en: "- Exercise regularly — one of the best ways to raise good cholesterol.\n- Don't smoke, and limit alcohol.\n- Use healthy fats like nuts, seeds and mustard or olive oil in moderation.",
    hi: "- नियमित व्यायाम करें — अच्छा कोलेस्ट्रॉल बढ़ाने का यह सबसे अच्छे तरीक़ों में से एक है।\n- धूम्रपान न करें और शराब सीमित रखें।\n- मेवे, बीज और सरसों या जैतून का तेल जैसे स्वस्थ वसा सीमित मात्रा में लें।",
  },
  totalchol: {
    en: "- Choose a balanced diet with vegetables, fruits, whole grains and pulses.\n- Limit fried and very fatty food.\n- Stay active, keep a healthy weight and don't smoke.",
    hi: "- सब्ज़ियाँ, फल, साबुत अनाज और दालों वाला संतुलित आहार लें।\n- तला-भुना और बहुत चिकना भोजन सीमित करें।\n- सक्रिय रहें, वज़न संतुलित रखें और धूम्रपान न करें।",
  },
  triglycerides: {
    en: "- Cut down sugar, sweets and sugary drinks.\n- Limit fried food and alcohol.\n- Be active and keep a healthy weight.",
    hi: "- चीनी, मिठाइयाँ और मीठे पेय कम करें।\n- तला-भुना और शराब सीमित करें।\n- सक्रिय रहें और वज़न संतुलित रखें।",
  },
  creatinine: {
    en: "- Drink enough water through the day.\n- Limit very salty and very high-protein meals.\n- Avoid taking painkillers regularly without asking your doctor.",
    hi: "- दिन भर पर्याप्त पानी पिएँ।\n- बहुत नमकीन और बहुत अधिक प्रोटीन वाला भोजन सीमित करें।\n- बिना डॉक्टर की सलाह के नियमित रूप से दर्द निवारक दवाएँ न लें।",
  },
  platelets: {
    en: "- Eat a varied diet with leafy greens, fruit and protein.\n- Stay hydrated and get enough rest.\n- Avoid smoking and excess alcohol.",
    hi: "- हरी पत्तेदार सब्ज़ियाँ, फल और प्रोटीन वाला विविध आहार लें।\n- पानी पर्याप्त पिएँ और आराम करें।\n- धूम्रपान और अधिक शराब से बचें।",
  },
  wbc: {
    en: "- Eat a balanced diet with fruits, vegetables and protein to support immunity.\n- Get enough sleep and manage stress.\n- Avoid smoking and excess alcohol.",
    hi: "- रोग प्रतिरोधक क्षमता के लिए फल, सब्ज़ियाँ और प्रोटीन वाला संतुलित आहार लें।\n- पर्याप्त नींद लें और तनाव कम करें।\n- धूम्रपान और अधिक शराब से बचें।",
  },
  mcv: {
    en: "- Eat a balanced diet with enough iron, vitamin B12 and folate.\n- Include leafy greens, pulses, dairy, eggs and fortified cereals.\n- Avoid smoking and excess alcohol, and get enough sleep.",
    hi: "- आयरन, विटामिन B12 और फ़ोलेट से भरपूर संतुलित आहार लें।\n- हरी पत्तेदार सब्ज़ियाँ, दालें, दूध, अंडे और फ़ोर्टिफ़ाइड अनाज शामिल करें।\n- धूम्रपान और अधिक शराब से बचें, और पर्याप्त नींद लें।",
  },
  rbc: {
    en: "- Eat iron-rich foods and pair them with vitamin C for better absorption.\n- Include leafy greens, beans, eggs and lean meat.\n- Stay hydrated and get enough B12 and folate.",
    hi: "- आयरन वाले भोजन लें और अच्छे अवशोषण के लिए उनके साथ विटामिन C लें।\n- हरी पत्तेदार सब्ज़ियाँ, बीन्स, अंडे और दुबला माँस शामिल करें।\n- पानी पीते रहें और B12 व फ़ोलेट पर्याप्त लें।",
  },
  hematocrit: {
    en: "- Drink enough water through the day — dehydration can change this reading.\n- Keep up iron-rich foods to support healthy red cells.\n- Avoid smoking and stay active.",
    hi: "- दिन भर पर्याप्त पानी पिएँ — पानी की कमी से यह रीडिंग बदल सकती है।\n- स्वस्थ लाल कोशिकाओं के लिए आयरन वाले भोजन जारी रखें।\n- धूम्रपान से बचें और सक्रिय रहें।",
  },
  potassium: {
    en: "- Eat a balanced diet with fruits and vegetables (banana, leafy greens, beans).\n- Stay hydrated.\n- Do not take potassium supplements without your doctor's advice.",
    hi: "- फलों और सब्ज़ियों (केला, हरी पत्तेदार सब्ज़ियाँ, बीन्स) वाला संतुलित आहार लें।\n- पानी पर्याप्त पिएँ।\n- बिना डॉक्टर की सलाह के पोटैशियम सप्लीमेंट न लें।",
  },
};

function normalise(text: string): string {
  return ` ${text.toLowerCase().replace(/[?!.,;:()'"“”‘’]/g, " ").replace(/\s+/g, " ")} `;
}

/**
 * Which catalogue test the question is about, or null.
 *
 * Picks the LONGEST matched alias/name so a specific spelling ("एमसीवी") wins
 * over a shorter overlapping word. Ordering is deterministic; ties keep the
 * catalogue order.
 */
export function detectTestInQuestion(question: string): string | null {
  const q = normalise(question);
  if (q.trim().length === 0) return null;

  let bestId: string | null = null;
  let bestLen = 0;
  const consider = (id: string, term: string) => {
    const len = term.trim().length;
    if (len < 2) return;
    if (len > bestLen) {
      bestId = id;
      bestLen = len;
    }
  };

  for (const [testId, words] of Object.entries(TEST_ALIASES)) {
    for (const word of words) {
      const n = normalise(word);
      if (n.trim().length >= 2 && q.includes(n)) consider(testId, word);
    }
  }

  // Catalogue's own bilingual names as a fallback for anything not in the
  // alias list (e.g. a future test added to TESTS).
  for (const def of Object.values(TESTS)) {
    for (const name of [def.name.en, def.name.hi, def.simple.en, def.simple.hi]) {
      const n = normalise(name);
      if (n.trim().length >= 3 && q.includes(n)) consider(def.id, name);
    }
  }

  return bestId;
}

function statusLine(result: AnonymisedResult, lang: ExplainLang, label: string): string {
  if (result.status_known === false) {
    return lang === "hi"
      ? `आपका **${label}** परिणाम **${result.value} ${result.unit}** है। इस जाँच के लिए रिपोर्ट में संदर्भ सीमा नहीं छपी थी, इसलिए इसे वर्गीकृत नहीं किया जा सकता।`
      : `Your **${label}** result is **${result.value} ${result.unit}**. No reference range was printed for this test, so it cannot be classified here.`;
  }
  const sentence: Record<string, { en: string; hi: string }> = {
    normal: {
      en: `Your **${label}** result is **${result.value} ${result.unit}**, which is within the printed reference range (**${result.ref_text}**).`,
      hi: `आपका **${label}** परिणाम **${result.value} ${result.unit}** है, जो छपी हुई सामान्य सीमा (**${result.ref_text}**) के भीतर है।`,
    },
    borderline: {
      en: `Your **${label}** result is **${result.value} ${result.unit}**, right at the edge of the printed reference range (**${result.ref_text}**).`,
      hi: `आपका **${label}** परिणाम **${result.value} ${result.unit}** है, जो छपी हुई सामान्य सीमा (**${result.ref_text}**) के बिल्कुल किनारे पर है।`,
    },
    high: {
      en: `Your **${label}** result is **${result.value} ${result.unit}**, which is above the printed reference range (**${result.ref_text}**).`,
      hi: `आपका **${label}** परिणाम **${result.value} ${result.unit}** है, जो छपी हुई सामान्य सीमा (**${result.ref_text}**) से अधिक है।`,
    },
    low: {
      en: `Your **${label}** result is **${result.value} ${result.unit}**, which is below the printed reference range (**${result.ref_text}**).`,
      hi: `आपका **${label}** परिणाम **${result.value} ${result.unit}** है, जो छपी हुई सामान्य सीमा (**${result.ref_text}**) से कम है।`,
    },
    critical: {
      en: `Your **${label}** result is **${result.value} ${result.unit}**, which is well outside the printed reference range (**${result.ref_text}**).`,
      hi: `आपका **${label}** परिणाम **${result.value} ${result.unit}** है, जो छपी हुई सामान्य सीमा (**${result.ref_text}**) से काफ़ी बाहर है।`,
    },
  };
  const pick = sentence[result.status] ?? sentence.normal;
  return lang === "hi" ? pick.hi : pick.en;
}

function meaningLine(result: AnonymisedResult | undefined, lang: ExplainLang): string {
  if (!result) {
    return lang === "hi"
      ? "डॉक्टर इस जाँच को आपके अन्य परिणामों और लक्षणों के साथ मिलाकर समझते हैं कि आपका शरीर कैसा है। अकेला एक मान पूरी कहानी नहीं बताता।"
      : "Doctors read this test together with your other results and symptoms to understand how your body is doing. One value on its own never tells the whole story.";
  }
  if (result.status_known === false) {
    return lang === "hi"
      ? "बिना छपी संदर्भ सीमा के इस मान का अर्थ केवल आपका डॉक्टर आपके पूरे संदर्भ में बता सकता है।"
      : "Without a printed reference range, only your doctor can interpret this value in your full context.";
  }
  if (result.status !== "normal") {
    return lang === "hi"
      ? "सामान्य सीमा से बाहर परिणाम के कई कारण हो सकते हैं, और एक अकेला मान पूरी कहानी नहीं बताता। इसका अर्थ केवल आपका डॉक्टर आपके लक्षणों और अन्य जाँचों के साथ मिलाकर बता सकता है।"
      : "A result outside the usual range can have several causes, and a single value does not tell the whole story. Only your doctor can interpret what it means for you, together with your symptoms and other tests.";
  }
  return lang === "hi"
    ? "सामान्य सीमा के भीतर का मान एक अच्छा संकेत है। ध्यान रखें कि एक संख्या पूरी तस्वीर नहीं होती — डॉक्टर इसे आपके लक्षणों और अन्य जाँचों के साथ मिलाकर देखते हैं।"
    : "A value within the printed range is a reassuring sign. Remember that one number is only one part of the picture — your doctor reads it together with your symptoms and other tests.";
}

function nextStepLine(result: AnonymisedResult | undefined, lang: ExplainLang): string {
  if (!result) {
    return lang === "hi"
      ? "**अगला कदम:** यह सामान्य जानकारी है। अपनी रिपोर्ट अपलोड या स्कैन करें, तो मैं आपका अपना मान समझाऊँगा — और इस पर अपने डॉक्टर से चर्चा करें।"
      : "**Next step:** this is general information. Upload or scan your report and I will explain your own value — and discuss it with your doctor.";
  }
  if (result.status_known === false) {
    return lang === "hi"
      ? "**अगला कदम:** यह परिणाम और इसकी छपी हुई संदर्भ सीमा (यदि हो) डॉक्टर या प्रयोगशाला को दिखाएँ।"
      : "**Next step:** show this result and its printed reference range (if any) to your doctor or laboratory.";
  }
  if (result && result.status !== "normal") {
    return lang === "hi"
      ? "**अगला कदम:** कृपया इस परिणाम पर अपने डॉक्टर से चर्चा करें। यह रिपोर्ट साथ ले जाएँ और थकान, कमज़ोरी, चक्कर या कोई भी लक्षण ज़रूर बताएँ।"
      : "**Next step:** please discuss this result with your doctor. Carry this report, and mention any tiredness, weakness, dizziness or other symptoms you have noticed.";
  }
  return lang === "hi"
    ? "**अगला कदम:** केवल इस परिणाम के लिए कोई कार्रवाई ज़रूरी नहीं। डॉक्टर की सलाह अनुसार नियमित जाँच कराते रहें।"
    : "**Next step:** no action is needed for this result alone. Keep your regular check-ups as advised by your doctor.";
}

/**
 * Build a full, safe explanation for one test.
 *
 * - `payload` may be null (a definitional question asked before any report is
 *   uploaded): the answer then explains what the test is, what it means and how
 *   to keep it healthy, without quoting a value.
 * - The text always ends with the localized safety footer. Callers that route
 *   the text through `finishEnglishAnswer` (which re-appends the canonical
 *   English footer when missing) will find it already present, so it is never
 *   doubled.
 */
export function composeExplanation(opts: {
  testId: string;
  lang: ExplainLang;
  payload?: AnonymisedPayload | null;
}): { text: string; matched: string } | null {
  const def = TESTS[opts.testId];
  if (!def) return null;

  const lang: ExplainLang = opts.lang === "hi" ? "hi" : "en";
  const result = opts.payload?.results.find((r) => r.test === opts.testId);
  const label = def.name[lang];
  const tips = LIFESTYLE_TIPS[opts.testId];

  const H: Record<"what" | "result" | "meaning" | "tips", string> =
    lang === "hi"
      ? {
          what: "यह क्या है",
          result: "आपका परिणाम",
          meaning: "इसका क्या मतलब है",
          tips: "खान-पान और जीवनशैली के सुझाव",
        }
      : {
          what: "What this test is",
          result: "Your result",
          meaning: "What your value means",
          tips: "Lifestyle & diet tips",
        };

  const lines: string[] = [];
  lines.push(`**${label} — ${H.what}**`);
  lines.push(def.what[lang]);
  lines.push("");

  if (result) {
    lines.push(`**${H.result}**`);
    lines.push(statusLine(result, lang, label));
    lines.push("");
  }

  lines.push(`**${H.meaning}**`);
  lines.push(meaningLine(result, lang));
  lines.push("");

  if (tips) {
    lines.push(`**${H.tips}**`);
    lines.push(tips[lang]);
    lines.push("");
  }

  lines.push(nextStepLine(result, lang));
  lines.push("");
  lines.push(safetyFooter(lang));

  return { text: lines.join("\n"), matched: `test:${opts.testId}` };
}

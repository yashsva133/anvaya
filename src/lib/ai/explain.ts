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
// The logic lives here; the strings live in explain-content.ts. No value,
// range, or number is invented; the only numbers quoted are the person's own
// value and printed reference range.
// ---------------------------------------------------------------------------

import { TESTS } from "@/lib/data";
import type { AnonymisedPayload, AnonymisedResult } from "./types";
import { safetyFooter } from "./translations";
import {
  PHRASES,
  REVIEWED_EXPLAIN_LANGS,
  TEST_CONTENT,
  type ExplainPhrases,
  type TestContentL2,
} from "./explain-content";
import type { AnswerLang } from "./languages";

/**
 * Patient-language aliases for each test, in many scripts. This is deliberately
 * broader than the bare test code so an ordinary question like
 * "एमसीवी क्या होता है?", "எம்சிவி என்றால் என்ன?" or "what is my bad
 * cholesterol?" resolves to the right marker. It intentionally does NOT include
 * ambiguous words ("blood", "heart") so a generic health question cannot be
 * misread as a question about one specific test.
 */
const TEST_ALIASES: Record<string, string[]> = {
  hemoglobin: [
    "hemoglobin", "haemoglobin", "hgb", "hb",
    "हीमोग्लोबिन", "हिमोग्लोबिन", "एचबी", "एनीमिया",
    "হিমোগ্লোবিন",
    "ஹீமோகுளோபின்",
    "హిమోగ్లోబిన్", "హేమోగ్లోబిన్",
    "हिमोग्लोबिन",
    "હિમોગ્લોબિન",
    "ಹಿಮೋಗ್ಲೋಬಿನ್",
    "ഹീമോഗ്ലോബിൻ",
    "ਹੀਮੋਗਲੋਬਿਨ",
    "ہیموگلوبن",
    "ହିମୋଗ୍ଲୋବିନ",
    "হিম’গ্ল’বিন",
    "हिमोग्लोबिन",
  ],
  hba1c: [
    "hba1c", "hb a1c", "a1c", "glycated",
    "एचबीए1सी", "एचबी ए1सी", "ए1सी",
    "এইচবিএ১সি",
    "எச்பிஏ1சி",
    "హెచ్‌బిఎ1సి",
    "एचबीए1सी",
    "એચબીએ1સી",
    "ಎಚ್‌ಬಿಎ1ಸಿ",
    "എച്ച്‌ബിഎ1സി",
    "ਐਚਬੀਏ1ਸੀ",
    "ایچ بی اے 1 سی",
    "ଏଚବିଏ୧ସି",
    "এইচবিএ১চি",
    "एचबीए1सी",
  ],
  glucose: [
    "glucose", "fasting sugar", "blood sugar",
    "ग्लूकोज़", "ग्लूकोज", "फ़ास्टिंग", "फास्टिंग",
    "গ্লুকোজ",
    "குளுக்கோஸ்", "சர்க்கரை",
    "గ్లూకోజ్",
    "ग्लुकोज",
    "ગ્લુકોઝ",
    "ಗ್ಲುಕೋಸ್",
    "ഗ്ലൂക്കോസ്",
    "ਗਲੂਕੋਜ਼",
    "گلوکوز",
    "ଗ୍ଲୁକୋଜ",
    "গ্লুক’জ",
    "ग्लुकोज",
  ],
  ldl: [
    "ldl", "bad cholesterol",
    "एलडीएल", "एल डी एल", "ख़राब कोलेस्ट्रॉल", "खराब कोलेस्ट्रॉल",
    "এলডিএল",
    "எல்டிஎல்",
    "ఎల్డీఎల్",
    "एलडीएल",
    "એલડીએલ",
    "ಎಲ್ಡಿಎಲ್",
    "എൽഡിഎൽ",
    "ਐਲਡੀਐਲ",
    "ایل ڈی ایل",
    "ଏଲଡିଏଲ",
    "এলডিএল",
    "एलडीएल",
  ],
  hdl: [
    "hdl", "good cholesterol",
    "एचडीएल", "एच डी एल", "अच्छा कोलेस्ट्रॉल",
    "এইচডিএল",
    "எச்டிஎல்",
    "హెచ్‌డిఎల్",
    "एचडीएल",
    "એચડીએલ",
    "ಎಚ್‌ಡಿಎಲ್",
    "എച്ച്‌ഡിഎൽ",
    "ਐਚਡੀਐਲ",
    "ایچ ڈی ایل",
    "ଏଚଡିଏଲ",
    "এইচডিএল",
    "एचडीएल",
  ],
  totalchol: [
    "total cholesterol", "cholesterol",
    "कुल कोलेस्ट्रॉल", "टोटल कोलेस्ट्रॉल", "कोलेस्ट्रॉल",
    "কোলেস্টেরল", "মোট কোলেস্টেরল",
    "கொழுப்பு",
    "కొలెస్ట్రాల్",
    "कोलेस्टेरॉल",
    "કોલેસ્ટ્રોલ",
    "ಕೊಲೆಸ್ಟ್ರಾಲ್",
    "കൊളസ്ട്രോൾ",
    "ਕੋਲੈਸਟ੍ਰੋਲ",
    "کولیسٹرول",
    "କୋଲେଷ୍ଟ୍ରଲ",
    "কোলেষ্টেৰল",
    "कोलेस्ट्रोल",
  ],
  triglycerides: [
    "triglyceride", "triglycerides",
    "ट्राइग्लिसराइड", "ट्राइग्लिसराइड्स", "ट्रायग्लिसराइड",
    "ট্রাইগ্লিসারাইড",
    "ட்ரைகிளிசரைடு", "ட்ரைகிளிசரைட்ஸ்",
    "ట్రైగ్లిజరైడ్",
    "ट्रायग्लिसराइड",
    "ટ્રાઇગ્લિસરાઈડ",
    "ಟ್ರೈಗ್ಲಿಸರೈಡ್",
    "ട്രൈഗ്ലിസറൈഡ്",
    "ਟ੍ਰਾਈਗਲਿਸਰਾਈਡ",
    "ٹرائی گلیسرائیڈ",
    "ଟ୍ରାଇଗ୍ଲିସରାଇଡ",
    "ট্ৰাইগ্লিচেৰাইড",
    "ट्राइग्लिसराइड",
  ],
  creatinine: [
    "creatinine", "renal",
    "क्रिएटिनिन", "किडनी", "गुर्दा", "गुर्दे",
    "ক্রিয়েটিনিন",
    "கிரியேட்டினின்",
    "క్రియాటినిన్",
    "क्रिएटिनिन",
    "ક્રિએટિનિન",
    "ಕ್ರಿಯೇಟಿನಿನ್",
    "ക്രിയാറ്റിനിൻ",
    "ਕ੍ਰੀਏਟੀਨਾਈਨ",
    "کریٹینین",
    "କ୍ରିଏଟିନିନ",
    "ক্ৰিয়েটিনিন",
    "क्रिएटिनिन",
  ],
  platelets: [
    "platelet", "platelets",
    "प्लेटलेट", "प्लेटलेट्स", "थक्का",
    "প্লেটলেট",
    "பிளேட்லெட்", "பிளேட்லெட்டுகள்",
    "ప్లేట్లెట్", "ప్లేట్లెట్స్",
    "प्लेटलेट्स",
    "પ્લેટલેટ્સ",
    "ಪ್ಲೇಟ್‌ಲೆಟ್",
    "പ്ലേറ്റ്ലെറ്റ്",
    "ਪਲੇਟਲੈਟਸ",
    "پلیٹلیٹس",
    "ପ୍ଲେଟଲେଟ",
    "প্লেটলেট",
    "प्लेटलेट्स",
  ],
  wbc: [
    "wbc", "white blood cell", "white blood cells", "white cell",
    "डब्ल्यूबीसी", "डब्ल्यू बी सी", "श्वेत कोशिका", "सफ़ेद कोशिका", "सफेद रक्त कोशिका",
    "শ্বেত রক্তকণিকা",
    "வெள்ளை இரத்த அணு",
    "తెల్ల రక్త కణం", "డబ్ల్యూబీసీ",
    "पांढऱ्या रक्तपेशी",
    "શ્વેત રક્તકણ",
    "ಬಿಳಿ ರಕ್ತ ಕಣ",
    "വെളുത്ത രക്താണു",
    "ਚਿੱਟੇ ਖੂਨ ਦੇ ਕਣ",
    "سفید خون کے خلیے",
    "ଶ୍ୱେତ ରକ୍ତ କଣିକା",
    "বগা ৰক্তকণিকা",
    "सेतो रक्त कोषिका",
  ],
  mcv: [
    "mcv", "mean corpuscular volume", "cell size",
    "एमसीवी", "एम सी वी", "कोशिका आकार", "सेल साइज़",
    "এমসিভি",
    "எம்சிவி",
    "ఎంసీవీ",
    "एमसीव्ही",
    "એમસીવી",
    "ಎಂಸಿವಿ",
    "എംസിവി",
    "ਐਮਸੀਵੀ",
    "ایم سی وی",
    "ଏମସିଭି",
    "এমচিভি",
    "एमसीवी",
  ],
  rbc: [
    "rbc", "red blood cell", "red cell",
    "आरबीसी", "आर बी सी", "लाल कोशिका", "लाल रक्त कोशिका",
    "লাল রক্তকণিকা",
    "சிவப்பு இரத்த அணு",
    "ఎర్ర రక్త కణం", "ఆర్‌బీసీ",
    "लाल रक्तपेशी",
    "લાલ રક્તકણ",
    "ಕೆಂಪು ರಕ್ತ ಕಣ",
    "ചുവന്ന രക്താണു",
    "ਲਾਲ ਖੂਨ ਦੇ ਕਣ",
    "سرخ خون کے خلیے",
    "ଲାଲ ରକ୍ତ କଣିକା",
    "ৰঙা ৰক্তকণিকা",
    "राता रक्त कोषिका",
  ],
  hematocrit: [
    "hematocrit", "haematocrit", "pcv",
    "हेमटोक्रिट", "हेमैटोक्रिट", "पीसीवी", "पी सी वी",
    "হেমাটোক্রিট",
    "ஹீமாடோகிரிட்",
    "హెమటోక్రిట్",
    "हेमॅटोक्रिट",
    "હિમેટોક્રિટ",
    "ಹೆಮಟೋಕ್ರಿಟ್",
    "ഹെമറ്റോക്രിറ്റ്",
    "ਹੀਮਾਟੋਕ੍ਰਿਟ",
    "ہیماٹوکریٹ",
    "ହେମାଟୋକ୍ରିଟ",
    "হিমেট’ক্ৰিট",
    "हेमाटोक्रिट",
  ],
  potassium: [
    "potassium",
    "पोटैशियम", "पोटेशियम",
    "পটাশিয়াম",
    "பொட்டாசியம்",
    "పొటాషియం",
    "पोटॅशियम",
    "પોટેશિયમ",
    "ಪೊಟ್ಯಾಸಿಯಂ",
    "പൊട്ടാസ്യം",
    "ਪੋਟਾਸ਼ੀਅਮ",
    "پوٹاشیم",
    "ପୋଟାସିୟମ",
    "পটাছিয়াম",
    "पोटासियम",
  ],
};

function normalise(text: string): string {
  return ` ${text.toLowerCase().replace(/[?!.,;:()'"“”‘’]/g, " ").replace(/\s+/g, " ")} `;
}

/**
 * Which catalogue test the question is about, or null.
 *
 * Picks the LONGEST matched alias/name so a specific spelling ("எம்சிவி") wins
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

function fill(template: string, values: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => values[key] ?? `{${key}}`);
}

function statusLine(
  result: AnonymisedResult,
  phrases: ExplainPhrases,
  label: string
): string {
  const values = {
    label,
    value: String(result.value),
    unit: result.unit,
    range: result.ref_text,
  };
  if (result.status_known === false) return fill(phrases.status.unknown, values);
  return fill(phrases.status[result.status] ?? phrases.status.normal, values);
}

function meaningLine(
  result: AnonymisedResult | undefined,
  phrases: ExplainPhrases
): string {
  if (!result) return phrases.meaning.noResult;
  if (result.status_known === false) return phrases.meaning.unknown;
  return result.status === "normal" ? phrases.meaning.normal : phrases.meaning.abnormal;
}

function nextStepLine(
  result: AnonymisedResult | undefined,
  phrases: ExplainPhrases
): string {
  if (!result) return phrases.next.noResult;
  if (result.status_known === false) return phrases.next.unknown;
  return result.status === "normal" ? phrases.next.normal : phrases.next.abnormal;
}

/** Definition + tips for a test in the requested language, or null. */
function contentFor(testId: string, lang: AnswerLang): TestContentL2 | null {
  if (lang === "en" || lang === "hi") {
    const def = TESTS[testId];
    if (!def) return null;
    return lang === "en"
      ? { what: def.what.en, tips: LIFESTYLE_EN_HI[testId]?.en ?? "" }
      : { what: def.what.hi, tips: LIFESTYLE_EN_HI[testId]?.hi ?? "" };
  }
  return TEST_CONTENT[testId]?.[lang] ?? null;
}

/**
 * The lifestyle/diet tips for English + Hindi. The twelve other languages'
 * tips live in explain-content.ts; the catalogue (TESTS) carries the en/hi
 * medical definitions but not tips, so these pair with them here.
 */
const LIFESTYLE_EN_HI: Record<string, { en: string; hi: string }> = {
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

/**
 * The patient-facing label for a test in the requested language. Falls back to
 * the catalogue's English name, then the test id, so an untranslated label
 * never renders empty.
 */
function labelFor(testId: string, lang: AnswerLang): string {
  const def = TESTS[testId];
  const en = def?.name.en ?? testId;
  if (lang === "en") return en;
  if (lang === "hi") return def?.name.hi ?? en;
  return en;
}

/** True when human-authored explanation copy exists for this language. */
export function explainLangReviewed(lang: AnswerLang): boolean {
  return REVIEWED_EXPLAIN_LANGS.includes(lang);
}

/**
 * Build a full, safe explanation for one test, in the requested language.
 *
 * - `payload` may be null (a definitional question asked before any report is
 *   uploaded): the answer then explains what the test is, what it means and how
 *   to keep it healthy, without quoting a value.
 * - The text always ends with the localized safety footer. Callers that route
 *   the text through `finishEnglishAnswer` (which re-appends the canonical
 *   English footer when missing) will find it already present, so it is never
 *   doubled.
 * - Returns null when the language has no content for this test, so the caller
 *   can fall back to its generic phrasebook.
 */
export function composeExplanation(opts: {
  testId: string;
  lang: AnswerLang;
  payload?: AnonymisedPayload | null;
}): { text: string; matched: string } | null {
  const def = TESTS[opts.testId];
  if (!def) return null;

  const content = contentFor(opts.testId, opts.lang);
  if (!content) return null;

  const phrases = PHRASES[opts.lang];
  const label = labelFor(opts.testId, opts.lang);
  const result = opts.payload?.results.find((r) => r.test === opts.testId);

  const lines: string[] = [];
  lines.push(`**${label} — ${phrases.headers.what}**`);
  lines.push(content.what);
  lines.push("");

  if (result) {
    lines.push(`**${phrases.headers.result}**`);
    lines.push(statusLine(result, phrases, label));
    lines.push("");
  }

  lines.push(`**${phrases.headers.meaning}**`);
  lines.push(meaningLine(result, phrases));
  lines.push("");

  if (content.tips) {
    lines.push(`**${phrases.headers.tips}**`);
    lines.push(content.tips);
    lines.push("");
  }

  lines.push(nextStepLine(result, phrases));
  lines.push("");
  lines.push(safetyFooter(opts.lang));

  return { text: lines.join("\n"), matched: `test:${opts.testId}` };
}

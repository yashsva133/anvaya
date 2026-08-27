// ---------------------------------------------------------------------------
// Phrasebook for the mock provider, in every supported answer language.
//
// WHY THIS EXISTS
// The mock provider (AI_PROVIDER=mock) is how the pipeline is verified without
// a GPU. If it could only compose English and Hindi, then "does a Tamil voice
// turn actually come back in Tamil, grounded in this person's numbers?" could
// not be tested at all until a model was stood up. With this phrasebook the
// whole multilingual path — retrieve, prompt, generate, guard, TTS — is
// exercisable offline, and every number in the output still comes from the
// payload so the numeric-grounding guardrail passes for the right reason.
//
// It is deliberately NOT a translation engine. It is four fixed sentences with
// slots, which is all a mock needs. Real answers come from the model.
// ---------------------------------------------------------------------------

import type { AnswerLang } from "./languages";

export interface MockPhrases {
  /** "From your report dated {date}, about these results:" */
  intro: (date: string) => string;
  /** "... within its printed range." */
  within: string;
  /** "... outside its printed range ({ref})." */
  outside: (ref: string) => string;
  /** The closing not-a-diagnosis line. */
  disclaimer: string;
}

const PHRASES: Record<AnswerLang, MockPhrases> = {
  en: {
    intro: (d) => `From your report dated **${d}**, about these results:`,
    within: "within its printed range",
    outside: (r) => `outside its printed range (${r})`,
    disclaimer: "This is not a diagnosis — please discuss these results with your doctor.",
  },
  hi: {
    intro: (d) => `आपकी **${d}** की रिपोर्ट से, इन परिणामों के बारे में:`,
    within: "सामान्य सीमा के भीतर",
    outside: (r) => `सामान्य सीमा (${r}) से बाहर`,
    disclaimer: "यह निदान नहीं है — कृपया इन परिणामों पर अपने डॉक्टर से चर्चा करें।",
  },
  bn: {
    intro: (d) => `আপনার **${d}** তারিখের রিপোর্ট থেকে, এই ফলাফলগুলো সম্পর্কে:`,
    within: "নির্দিষ্ট সীমার মধ্যে",
    outside: (r) => `নির্দিষ্ট সীমা (${r}) এর বাইরে`,
    disclaimer: "এটি রোগ নির্ণয় নয় — অনুগ্রহ করে এই ফলাফলগুলো আপনার চিকিৎসকের সাথে আলোচনা করুন।",
  },
  ta: {
    intro: (d) => `உங்கள் **${d}** தேதியிட்ட அறிக்கையிலிருந்து, இந்த முடிவுகளைப் பற்றி:`,
    within: "அச்சிட்ட வரம்பிற்குள்",
    outside: (r) => `அச்சிட்ட வரம்புக்கு (${r}) வெளியே`,
    disclaimer: "இது நோய்க்கண்டறிதல் அல்ல — தயவுசெய்து இந்த முடிவுகளை உங்கள் மருத்துவருடன் விவாதிக்கவும்.",
  },
  te: {
    intro: (d) => `మీ **${d}** తేదీ నివేదిక నుండి, ఈ ఫలితాల గురించి:`,
    within: "ముద్రిత పరిధి లోపు",
    outside: (r) => `ముద్రిత పరిధి (${r}) వెలుపల`,
    disclaimer: "ఇది వ్యాధి నిర్ధారణ కాదు — దయచేసి ఈ ఫలితాలను మీ డాక్టర్‌తో చర్చించండి.",
  },
  mr: {
    intro: (d) => `तुमच्या **${d}** च्या अहवालातून, या निकालांबद्दल:`,
    within: "छापलेल्या श्रेणीच्या आत",
    outside: (r) => `छापलेल्या श्रेणीच्या (${r}) बाहेर`,
    disclaimer: "हे निदान नाही — कृपया या निकालांबद्दल तुमच्या डॉक्टरांशी चर्चा करा.",
  },
  gu: {
    intro: (d) => `તમારા **${d}** ના રિપોર્ટમાંથી, આ પરિણામો વિશે:`,
    within: "છપાયેલી શ્રેણીની અંદર",
    outside: (r) => `છપાયેલી શ્રેણી (${r}) ની બહાર`,
    disclaimer: "આ નિદાન નથી — કૃપા કરીને આ પરિણામો વિશે તમારા ડોક્ટર સાથે ચર્ચા કરો.",
  },
  kn: {
    intro: (d) => `ನಿಮ್ಮ **${d}** ದಿನಾಂಕದ ವರದಿಯಿಂದ, ಈ ಫಲಿತಾಂಶಗಳ ಬಗ್ಗೆ:`,
    within: "ಮುದ್ರಿತ ಶ್ರೇಣಿಯೊಳಗೆ",
    outside: (r) => `ಮುದ್ರಿತ ಶ್ರೇಣಿಯ (${r}) ಹೊರಗೆ`,
    disclaimer: "ಇದು ರೋಗ ನಿರ್ಧಾರವಲ್ಲ — ದಯವಿಟ್ಟು ಈ ಫಲಿತಾಂಶಗಳ ಬಗ್ಗೆ ನಿಮ್ಮ ವೈದ್ಯರೊಂದಿಗೆ ಚರ್ಚಿಸಿ.",
  },
  ml: {
    intro: (d) => `നിങ്ങളുടെ **${d}** തീയതിയിലുള്ള റിപ്പോർട്ടിൽ നിന്ന്, ഈ ഫലങ്ങളെക്കുറിച്ച്:`,
    within: "രേഖപ്പെടുത്തിയ പരിധിക്കുള്ളിൽ",
    outside: (r) => `രേഖപ്പെടുത്തിയ പരിധിക്ക് (${r}) പുറത്ത്`,
    disclaimer: "ഇത് രോഗനിർണയമല്ല — ദയവായി ഈ ഫലങ്ങൾ നിങ്ങളുടെ ഡോക്ടറുമായി ചർച്ച ചെയ്യുക.",
  },
  pa: {
    intro: (d) => `ਤੁਹਾਡੀ **${d}** ਦੀ ਰਿਪੋਰਟ ਤੋਂ, ਇਨ੍ਹਾਂ ਨਤੀਜਿਆਂ ਬਾਰੇ:`,
    within: "ਛਪੀ ਹੋਈ ਸੀਮਾ ਦੇ ਅੰਦਰ",
    outside: (r) => `ਛਪੀ ਹੋਈ ਸੀਮਾ (${r}) ਤੋਂ ਬਾਹਰ`,
    disclaimer: "ਇਹ ਨਿਦਾਨ ਨਹੀਂ ਹੈ — ਕਿਰਪਾ ਕਰਕੇ ਇਨ੍ਹਾਂ ਨਤੀਜਿਆਂ ਬਾਰੇ ਆਪਣੇ ਡਾਕਟਰ ਨਾਲ ਗੱਲ ਕਰੋ।",
  },
  ur: {
    intro: (d) => `آپ کی **${d}** کی رپورٹ سے، ان نتائج کے بارے میں:`,
    within: "اپنی مقررہ حد کے اندر",
    outside: (r) => `مقررہ حد (${r}) سے باہر`,
    disclaimer: "یہ تشخیص نہیں ہے — براہ کرم ان نتائج پر اپنے ڈاکٹر سے بات کریں۔",
  },
  or: {
    intro: (d) => `ଆପଣଙ୍କ **${d}** ରିପୋର୍ଟରୁ, ଏହି ଫଳାଫଳ ବିଷୟରେ:`,
    within: "ଛପା ଯାଇଥିବା ସୀମା ମଧ୍ୟରେ",
    outside: (r) => `ଛପା ଯାଇଥିବା ସୀମା (${r}) ବାହାରେ`,
    disclaimer: "ଏହା ରୋଗ ନିର୍ଣ୍ଣୟ ନୁହେଁ — ଅନୁଗ୍ରହ କରି ଏହି ଫଳାଫଳ ବିଷୟରେ ଆପଣଙ୍କ ଡାକ୍ତରଙ୍କ ସହ ଆଲୋଚନା କରନ୍ତୁ।",
  },
  as: {
    intro: (d) => `আপোনাৰ **${d}** তাৰিখৰ ৰিপৰ্টৰ পৰা, এই ফলাফলবোৰৰ বিষয়ে:`,
    within: "ছপা সীমাৰ ভিতৰত",
    outside: (r) => `ছপা সীমাৰ (${r}) বাহিৰত`,
    disclaimer: "এইটো ৰোগ নিৰ্ণয় নহয় — অনুগ্ৰহ কৰি এই ফলাফলবোৰ আপোনাৰ চিকিৎসকৰ সৈতে আলোচনা কৰক।",
  },
  ne: {
    intro: (d) => `तपाईंको **${d}** मितिको रिपोर्टबाट, यी नतिजाहरूबारे:`,
    within: "छपाइएको दायराभित्र",
    outside: (r) => `छपाइएको दायरा (${r}) भन्दा बाहिर`,
    disclaimer: "यो रोग पहिचान होइन — कृपया यी नतिजाहरूबारे आफ्नो डाक्टरसँग छलफल गर्नुहोस्।",
  },
};

export function mockPhrases(lang: AnswerLang): MockPhrases {
  return PHRASES[lang];
}

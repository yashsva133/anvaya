// ---------------------------------------------------------------------------
// Curated safety text in every supported answer language.
//
// Two strings matter enough to be written by a human and versioned like code:
//
//   safeRedirect()  — what the user sees when the model is refused, or when a
//                     question asks for something out of scope. This is the
//                     text that replaces an unsafe answer wholesale, so if it
//                     arrived in a language the person does not read, the
//                     safety mechanism would have failed while looking like it
//                     worked.
//   emergencyText() — the "go to a hospital now" message.
//
// RULES THESE STRINGS MUST KEEP (guardrails.ts depends on them):
//   1. They must not trip any pattern in DIAGNOSIS_OUTPUT, DOSING_OUTPUT or
//      MODEL_REFUSAL. The replacement text is deliberately NOT re-screened, so
//      a phrase like "I cannot diagnose" inside it would be misfiled as
//      `model_refusal` and would overwrite the real reason in
//      ai_generations.safety_flags.
//   2. No digits. guardOutput() treats any number that is not in the report
//      payload as ungrounded, which would flag a safety message as unsafe.
//   3. Same meaning in every language: never diagnose, never advise on
//      medicine, do explain results, do send them to a doctor.
//
// PROVENANCE — read this before editing.
// The English and Hindi strings are the originals the prototype shipped with
// and were reviewed with the clinical copy in src/lib/data.ts. The other
// twelve are new translations written for this feature and have NOT been
// through a native-speaker clinical review. They are marked so in
// REVIEWED_LANGUAGES below, and /api/ai/status reports which is which, so a
// reviewer can find them.
// ---------------------------------------------------------------------------

import type { AnswerLang } from "./languages";

export interface SafetyStrings {
  /** Out-of-scope refusal / unsafe-output replacement. */
  redirect: string;
  /** Emergency escalation. */
  emergency: string;
}

/** Languages whose safety copy was reviewed with the clinical content. */
export const REVIEWED_LANGUAGES: readonly AnswerLang[] = ["en", "hi"];

/**
 * Canonical model closing line. The English version is masked during output
 * translation and replaced with the reviewed/localized equivalent below. That
 * makes a translation provider dropping a disclaimer a hard failure instead
 * of silently weakening the safety boundary.
 */
export const STANDARD_SAFETY_FOOTER =
  "This is not a diagnosis. Please discuss these results with your doctor.";

const SAFETY_FOOTERS: Record<AnswerLang, string> = {
  en: STANDARD_SAFETY_FOOTER,
  hi: "यह निदान नहीं है। कृपया इन परिणामों पर अपने डॉक्टर से चर्चा करें।",
  bn: "এটি রোগ নির্ণয় নয়। অনুগ্রহ করে এই ফলাফলগুলি আপনার চিকিৎসকের সঙ্গে আলোচনা করুন।",
  ta: "இது நோயறிதல் அல்ல. தயவுசெய்து இந்த முடிவுகளை உங்கள் மருத்துவருடன் கலந்துரையாடுங்கள்.",
  te: "ఇది వ్యాధి నిర్ధారణ కాదు. దయచేసి ఈ ఫలితాలను మీ డాక్టర్‌తో చర్చించండి.",
  mr: "हे निदान नाही. कृपया या निकालांबद्दल तुमच्या डॉक्टरांशी चर्चा करा.",
  gu: "આ નિદાન નથી. કૃપા કરીને આ પરિણામો વિશે તમારા ડોક્ટર સાથે ચર્ચા કરો.",
  kn: "ಇದು ರೋಗನಿರ್ಣಯವಲ್ಲ. ದಯವಿಟ್ಟು ಈ ಫಲಿತಾಂಶಗಳನ್ನು ನಿಮ್ಮ ವೈದ್ಯರೊಂದಿಗೆ ಚರ್ಚಿಸಿ.",
  ml: "ഇത് രോഗനിർണയമല്ല. ദയവായി ഈ ഫലങ്ങൾ നിങ്ങളുടെ ഡോക്ടറുമായി ചർച്ച ചെയ്യുക.",
  pa: "ਇਹ ਨਿਦਾਨ ਨਹੀਂ ਹੈ। ਕਿਰਪਾ ਕਰਕੇ ਇਨ੍ਹਾਂ ਨਤੀਜਿਆਂ ਬਾਰੇ ਆਪਣੇ ਡਾਕਟਰ ਨਾਲ ਗੱਲ ਕਰੋ।",
  ur: "یہ تشخیص نہیں ہے۔ براہ کرم ان نتائج پر اپنے ڈاکٹر سے بات کریں۔",
  or: "ଏହା ରୋଗ ନିର୍ଣ୍ଣୟ ନୁହେଁ। ଦୟାକରି ଏହି ଫଳାଫଳଗୁଡ଼ିକ ବିଷୟରେ ଆପଣଙ୍କ ଡାକ୍ତରଙ୍କ ସହ ଆଲୋଚନା କରନ୍ତୁ।",
  as: "এইটো ৰোগ নিৰ্ণয় নহয়। অনুগ্ৰহ কৰি এই ফলাফলবোৰ আপোনাৰ চিকিৎসকৰ সৈতে আলোচনা কৰক।",
  ne: "यो रोग पहिचान होइन। कृपया यी नतिजाहरूबारे आफ्नो डाक्टरसँग छलफल गर्नुहोस्।",
};

const STRINGS: Record<AnswerLang, SafetyStrings> = {
  en: {
    redirect:
      "Diagnosing a condition and advising on medicines are outside what I do here — those decisions belong to your doctor.\n\nI can explain what your results mean. Ask me about any result on your report and I will walk through it.",
    emergency:
      "This sounds urgent. Please seek emergency medical care now — call your local emergency number or go to the nearest hospital.\n\nI can only explain results on a laboratory report.",
  },
  hi: {
    redirect:
      "बीमारी बताना और दवाइयों के बारे में सलाह देना मेरा काम नहीं है — ये फ़ैसले आपके डॉक्टर के हैं।\n\nमैं आपके परिणामों का मतलब समझा सकता हूँ। अपनी रिपोर्ट के किसी भी परिणाम के बारे में पूछें, मैं उसे समझाऊँगा।",
    emergency:
      "यह स्थिति तत्काल ध्यान देने योग्य लगती है। कृपया अभी आपातकालीन चिकित्सा सहायता लें — अपने स्थानीय आपातकालीन नंबर पर कॉल करें या निकटतम अस्पताल जाएँ।\n\nमैं केवल लैब रिपोर्ट के परिणाम समझा सकता हूँ।",
  },
  bn: {
    redirect:
      "রোগ নির্ণয় করা এবং ওষুধ সম্পর্কে পরামর্শ দেওয়া আমার কাজ নয় — এই সিদ্ধান্তগুলি আপনার চিকিৎসকের।\n\nআমি আপনার ফলাফলের অর্থ ব্যাখ্যা করতে পারি। আপনার রিপোর্টের যেকোনো ফলাফল সম্পর্কে জিজ্ঞাসা করুন, আমি বুঝিয়ে বলব।",
    emergency:
      "এটিকে জরুরি মনে হচ্ছে। অনুগ্রহ করে এখনই জরুরি চিকিৎসা নিন — আপনার স্থানীয় জরুরি নম্বরে কল করুন বা নিকটতম হাসপাতালে যান।\n\nআমি কেবল ল্যাবরেটরি রিপোর্টের ফলাফল ব্যাখ্যা করতে পারি।",
  },
  ta: {
    redirect:
      "நோயைக் கண்டறிவதும் மருந்துகள் பற்றி ஆலோசனை கூறுவதும் என் வேலை அல்ல — அந்த முடிவுகள் உங்கள் மருத்துவருக்கு உரியவை.\n\nஉங்கள் முடிவுகளின் பொருளை என்னால் விளக்க முடியும். உங்கள் அறிக்கையில் உள்ள எந்த முடிவு பற்றியும் கேளுங்கள், நான் விளக்குகிறேன்.",
    emergency:
      "இது அவசரமாகத் தெரிகிறது. தயவுசெய்து உடனடியாக அவசர மருத்துவ உதவியை நாடுங்கள் — உங்கள் உள்ளூர் அவசர எண்ணுக்கு அழைக்கவும் அல்லது அருகிலுள்ள மருத்துவமனைக்குச் செல்லவும்.\n\nஆய்வுக்கூட அறிக்கையின் முடிவுகளை மட்டுமே என்னால் விளக்க முடியும்.",
  },
  te: {
    redirect:
      "వ్యాధి నిర్ధారణ చేయడం, మందుల గురించి సలహా ఇవ్వడం నా పని కాదు — ఆ నిర్ణయాలు మీ డాక్టర్‌కు సంబంధించినవి.\n\nమీ ఫలితాల అర్థాన్ని నేను వివరించగలను. మీ నివేదికలోని ఏ ఫలితం గురించైనా అడగండి, నేను వివరిస్తాను.",
    emergency:
      "ఇది అత్యవసర పరిస్థితిలా కనిపిస్తోంది. దయచేసి వెంటనే అత్యవసర వైద్య సహాయం తీసుకోండి — మీ స్థానిక అత్యవసర నంబర్‌కు కాల్ చేయండి లేదా సమీప ఆసుపత్రికి వెళ్లండి.\n\nనేను ల్యాబ్ నివేదికలోని ఫలితాలను మాత్రమే వివరించగలను.",
  },
  mr: {
    redirect:
      "आजार निदान करणे आणि औषधांबद्दल सल्ला देणे हे माझे काम नाही — ते निर्णय तुमच्या डॉक्टरांचे आहेत.\n\nमी तुमच्या निकालांचा अर्थ स्पष्ट करू शकतो. तुमच्या अहवालातील कोणत्याही निकालाबद्दल विचारा, मी ते समजावून सांगेन.",
    emergency:
      "हे तातडीचे वाटते. कृपया लगेच आपत्कालीन वैद्यकीय मदत घ्या — तुमच्या स्थानिक आपत्कालीन क्रमांकावर कॉल करा किंवा जवळच्या रुग्णालयात जा.\n\nमी केवळ प्रयोगशाळा अहवालातील निकाल स्पष्ट करू शकतो.",
  },
  gu: {
    redirect:
      "રોગનું નિદાન કરવું અને દવાઓ વિશે સલાહ આપવી એ મારું કામ નથી — તે નિર્ણયો તમારા ડોક્ટરના છે.\n\nહું તમારા પરિણામોનો અર્થ સમજાવી શકું છું. તમારા રિપોર્ટના કોઈપણ પરિણામ વિશે પૂછો, હું સમજાવીશ.",
    emergency:
      "આ તાત્કાલિક ધ્યાન જેવું લાગે છે. કૃપા કરીને તરત જ ઇમરજન્સી તબીબી સહાય મેળવો — તમારા સ્થાનિક ઇમરજન્સી નંબર પર કૉલ કરો અથવા નજીકની હોસ્પિટલમાં જાઓ.\n\nહું ફક્ત લેબોરેટરી રિપોર્ટના પરિણામો સમજાવી શકું છું.",
  },
  kn: {
    redirect:
      "ರೋಗವನ್ನು ಪತ್ತೆ ಮಾಡುವುದು ಮತ್ತು ಔಷಧಿಗಳ ಬಗ್ಗೆ ಸಲಹೆ ನೀಡುವುದು ನನ್ನ ಕೆಲಸವಲ್ಲ — ಆ ನಿರ್ಣಯಗಳು ನಿಮ್ಮ ವೈದ್ಯರಿಗೆ ಸೇರಿದ್ದು.\n\nನಿಮ್ಮ ಫಲಿತಾಂಶಗಳ ಅರ್ಥವನ್ನು ನಾನು ವಿವರಿಸಬಲ್ಲೆ. ನಿಮ್ಮ ವರದಿಯ ಯಾವುದೇ ಫಲಿತಾಂಶದ ಬಗ್ಗೆ ಕೇಳಿ, ನಾನು ವಿವರಿಸುತ್ತೇನೆ.",
    emergency:
      "ಇದು ತುರ್ತು ಪರಿಸ್ಥಿತಿಯಂತೆ ಕಾಣುತ್ತಿದೆ. ದಯವಿಟ್ಟು ಈಗಲೇ ತುರ್ತು ವೈದ್ಯಕೀಯ ಸಹಾಯ ಪಡೆಯಿರಿ — ನಿಮ್ಮ ಸ್ಥಳೀಯ ತುರ್ತು ಸಂಖ್ಯೆಗೆ ಕರೆ ಮಾಡಿ ಅಥವಾ ಹತ್ತಿರದ ಆಸ್ಪತ್ರೆಗೆ ಹೋಗಿ.\n\nನಾನು ಪ್ರಯೋಗಾಲಯ ವರದಿಯ ಫಲಿತಾಂಶಗಳನ್ನು ಮಾತ್ರ ವಿವರಿಸಬಲ್ಲೆ.",
  },
  ml: {
    redirect:
      "രോഗം നിർണയിക്കുന്നതും മരുന്നുകളെക്കുറിച്ച് ഉപദേശം നൽകുന്നതും എന്റെ ജോലിയല്ല — ആ തീരുമാനങ്ങൾ നിങ്ങളുടെ ഡോക്ടർക്കുള്ളതാണ്.\n\nനിങ്ങളുടെ ഫലങ്ങളുടെ അർഥം എനിക്ക് വിശദീകരിക്കാൻ കഴിയും. നിങ്ങളുടെ റിപ്പോർട്ടിലെ ഏത് ഫലത്തെക്കുറിച്ചും ചോദിക്കൂ, ഞാൻ വിശദീകരിക്കാം.",
    emergency:
      "ഇത് അടിയന്തരമാണെന്ന് തോന്നുന്നു. ദയവായി ഉടൻ അടിയന്തര വൈദ്യസഹായം തേടുക — നിങ്ങളുടെ പ്രാദേശിക അടിയന്തര നമ്പറിലേക്ക് വിളിക്കുക അല്ലെങ്കിൽ അടുത്തുള്ള ആശുപത്രിയിൽ പോകുക.\n\nഒരു ലബോറട്ടറി റിപ്പോർട്ടിലെ ഫലങ്ങൾ മാത്രമേ എനിക്ക് വിശദീകരിക്കാൻ കഴിയൂ.",
  },
  pa: {
    redirect:
      "ਬਿਮਾਰੀ ਦੀ ਪਛਾਣ ਕਰਨਾ ਅਤੇ ਦਵਾਈਆਂ ਬਾਰੇ ਸਲਾਹ ਦੇਣਾ ਮੇਰਾ ਕੰਮ ਨਹੀਂ — ਇਹ ਫ਼ੈਸਲੇ ਤੁਹਾਡੇ ਡਾਕਟਰ ਦੇ ਹਨ।\n\nਮੈਂ ਤੁਹਾਡੇ ਨਤੀਜਿਆਂ ਦਾ ਮਤਲਬ ਸਮਝਾ ਸਕਦਾ ਹਾਂ। ਆਪਣੀ ਰਿਪੋਰਟ ਦੇ ਕਿਸੇ ਵੀ ਨਤੀਜੇ ਬਾਰੇ ਪੁੱਛੋ, ਮੈਂ ਸਮਝਾਵਾਂਗਾ।",
    emergency:
      "ਇਹ ਜਰੂਰੀ ਲੱਗ ਰਿਹਾ ਹੈ। ਕਿਰਪਾ ਕਰਕੇ ਹੁਣੇ ਐਮਰਜੈਂਸੀ ਡਾਕਟਰੀ ਸਹਾਇਤਾ ਲਵੋ — ਆਪਣੇ ਸਥਾਨਕ ਐਮਰਜੈਂਸੀ ਨੰਬਰ ’ਤੇ ਕਾਲ ਕਰੋ ਜਾਂ ਨੇੜਲੇ ਹਸਪਤਾਲ ਜਾਓ।\n\nਮੈਂ ਸਿਰਫ਼ ਲੈਬ ਰਿਪੋਰਟ ਦੇ ਨਤੀਜੇ ਸਮਝਾ ਸਕਦਾ ਹਾਂ।",
  },
  ur: {
    redirect:
      "بیماری کی تشخیص کرنا اور ادویات کے بارے میں مشورہ دینا میرا کام نہیں — یہ فیصلے آپ کے ڈاکٹر کے ہیں۔\n\nمیں آپ کے نتائج کا مطلب سمجھا سکتا ہوں۔ اپنی رپورٹ کے کسی بھی نتیجے کے بارے میں پوچھیں، میں سمجھاؤں گا۔",
    emergency:
      "یہ فوری توجہ طلب لگتا ہے۔ براہ کرم ابھی ہنگامی طبی امداد حاصل کریں — اپنے مقامی ہنگامی نمبر پر کال کریں یا قریبی اسپتال جائیں۔\n\nمیں صرف لیبارٹری رپورٹ کے نتائج سمجھا سکتا ہوں۔",
  },
  or: {
    redirect:
      "ରୋଗ ନିର୍ଣ୍ଣୟ କରିବା ଏବଂ ଔଷଧ ବିଷୟରେ ପରାମର୍ଶ ଦେବା ମୋର କାମ ନୁହେଁ — ସେହି ନିଷ୍ପତ୍ତିଗୁଡ଼ିକ ଆପଣଙ୍କ ଡାକ୍ତରଙ୍କର।\n\nମୁଁ ଆପଣଙ୍କ ଫଳାଫଳର ଅର୍ଥ ବୁଝାଇ ପାରିବି। ଆପଣଙ୍କ ରିପୋର୍ଟର ଯେକୌଣସି ଫଳାଫଳ ବିଷୟରେ ପଚାରନ୍ତୁ, ମୁଁ ବୁଝାଇବି।",
    emergency:
      "ଏହା ଜରୁରୀ ବୋଲି ମନେହୁଏ। ଅନୁଗ୍ରହ କରି ଏବେ ଜରୁରୀ ଚିକିତ୍ସା ସେବା ନିଅନ୍ତୁ — ଆପଣଙ୍କ ସ୍ଥାନୀୟ ଜରୁରୀ ନମ୍ବରରେ କଲ୍ କରନ୍ତୁ କିମ୍ବା ନିକଟସ୍ଥ ହସ୍ପିଟାଲକୁ ଯାଆନ୍ତୁ।\n\nମୁଁ କେବଳ ପରୀକ୍ଷାଗାର ରିପୋର୍ଟର ଫଳାଫଳ ବୁଝାଇ ପାରିବି।",
  },
  as: {
    redirect:
      "ৰোগ নিৰ্ণয় কৰা আৰু ঔষধৰ বিষয়ে পৰামৰ্শ দিয়া মোৰ কাম নহয় — এই সিদ্ধান্তবোৰ আপোনাৰ চিকিৎসকৰ।\n\nমই আপোনাৰ ফলাফলৰ অৰ্থ ব্যাখ্যা কৰিব পাৰো। আপোনাৰ ৰিপৰ্টৰ যিকোনো ফলাফলৰ বিষয়ে সোধক, মই বুজাই ক’ম।",
    emergency:
      "এইটো জৰুৰী যেন লাগিছে। অনুগ্ৰহ কৰি এতিয়াই জৰুৰী চিকিৎসা সেৱা লওক — আপোনাৰ স্থানীয় জৰুৰী নম্বৰত কল কৰক বা ওচৰৰ চিকিৎসালয়লৈ যাওক।\n\nমই কেৱল পৰীক্ষাগাৰৰ ৰিপৰ্টৰ ফলাফল ব্যাখ্যা কৰিব পাৰো।",
  },
  ne: {
    redirect:
      "रोग पहिचान गर्नु र औषधिको बारेमा सल्लाह दिनु मेरो काम होइन — ती निर्णयहरू तपाईंको डाक्टरका हुन्।\n\nम तपाईंका नतिजाहरूको अर्थ व्याख्या गर्न सक्छु। तपाईंको रिपोर्टको कुनै पनि नतिजाको बारेमा सोध्नुहोस्, म बुझाउँछु।",
    emergency:
      "यो तत्काल ध्यान दिन आवश्यक देखिन्छ। कृपया अहिले नै आपतकालीन चिकित्सा सहायता लिनुहोस् — आफ्नो स्थानीय आपतकालीन नम्बरमा फोन गर्नुहोस् वा नजिकैको अस्पताल जानुहोस्।\n\nम केवल प्रयोगशाला रिपोर्टका नतिजाहरू व्याख्या गर्न सक्छु।",
  },
};

/**
 * Safety strings for a language.
 *
 * Every supported language has an entry, so this never falls back to English
 * behind the caller's back. `reviewed` tells a caller whether the copy has been
 * through clinical review, which is what a compliance check needs to see.
 */
export function safetyStrings(lang: AnswerLang): SafetyStrings & { reviewed: boolean } {
  return { ...STRINGS[lang], reviewed: REVIEWED_LANGUAGES.includes(lang) };
}

export function safeRedirect(lang: AnswerLang): string {
  return STRINGS[lang].redirect;
}

export function emergencyText(lang: AnswerLang): string {
  return STRINGS[lang].emergency;
}

/** Localized equivalent of the canonical model safety closing line. */
export function safetyFooter(lang: AnswerLang): string {
  return SAFETY_FOOTERS[lang];
}

// ---------------------------------------------------------------------------
// Spoken greeting, in every supported language.
//
// The voice agent opens by speaking, so the first thing a person hears should
// be in the language they are about to speak — not in the app's UI language.
// Kept to one short sentence: it is played aloud on every session start, and a
// long greeting is a long wait before the microphone opens.
// ---------------------------------------------------------------------------

const GREETINGS: Record<AnswerLang, string> = {
  en: "Hello! Ask me anything about your report — I will answer in your language.",
  hi: "नमस्ते! अपनी रिपोर्ट के बारे में कुछ भी पूछें — मैं आपकी भाषा में उत्तर दूँगा।",
  bn: "নমস্কার! আপনার রিপোর্ট সম্পর্কে যেকোনো কিছু জিজ্ঞাসা করুন — আমি আপনার ভাষায় উত্তর দেব।",
  ta: "வணக்கம்! உங்கள் அறிக்கை பற்றி எதுவும் கேளுங்கள் — நான் உங்கள் மொழியில் பதில் தருகிறேன்.",
  te: "నమస్కారం! మీ నివేదిక గురించి ఏదైనా అడగండి — నేను మీ భాషలో సమాధానం ఇస్తాను.",
  mr: "नमस्कार! तुमच्या अहवालाबद्दल काहीही विचारा — मी तुमच्या भाषेत उत्तर देईन.",
  gu: "નમસ્તે! તમારા રિપોર્ટ વિશે કંઈપણ પૂછો — હું તમારી ભાષામાં જવાબ આપીશ.",
  kn: "ನಮಸ್ಕಾರ! ನಿಮ್ಮ ವರದಿಯ ಬಗ್ಗೆ ಏನನ್ನಾದರೂ ಕೇಳಿ — ನಾನು ನಿಮ್ಮ ಭಾಷೆಯಲ್ಲಿ ಉತ್ತರಿಸುತ್ತೇನೆ.",
  ml: "നമസ്കാരം! നിങ്ങളുടെ റിപ്പോർട്ടിനെക്കുറിച്ച് എന്തും ചോദിക്കൂ — ഞാൻ നിങ്ങളുടെ ഭാഷയിൽ മറുപടി നൽകാം.",
  pa: "ਸਤ ਸ੍ਰੀ ਅਕਾਲ! ਆਪਣੀ ਰਿਪੋਰਟ ਬਾਰੇ ਕੁਝ ਵੀ ਪੁੱਛੋ — ਮੈਂ ਤੁਹਾਡੀ ਭਾਸਾ ਵਿੱਚ ਜਵਾਬ ਦੇਵਾਂਗਾ।",
  ur: "السلام علیکم! اپنی رپورٹ کے بارے میں کچھ بھی پوچھیں — میں آپ کی زبان میں جواب دوں گا۔",
  or: "ନମସ୍କାର! ଆପଣଙ୍କ ରିପୋର୍ଟ ବିଷୟରେ ଯାହା ବି ପଚାରନ୍ତୁ — ମୁଁ ଆପଣଙ୍କ ଭାଷାରେ ଉତ୍ତର ଦେବି।",
  as: "নমস্কাৰ! আপোনাৰ ৰিপৰ্টৰ বিষয়ে যিকোনো কথা সোধক — মই আপোনাৰ ভাষাত উত্তৰ দিম।",
  ne: "नमस्ते! आफ्नो रिपोर्टको बारेमा जे पनि सोध्नुहोस् — म तपाईंको भाषामा जवाफ दिन्छु।",
};

export function greeting(lang: AnswerLang): string {
  return GREETINGS[lang];
}

"use client";

// RxAnvaya — language + accessibility context (EN / हिन्दी / বাংলা-ish subset)

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export type LangCode = "en" | "hi" | "bn";
export type ReadingMode = "simple" | "advanced";

export interface AppSettings {
  lang: LangCode;
  mode: ReadingMode;
  font: 0 | 1 | 2; // normal / large / extra large
  voice: boolean; // voice guidance enabled
  contrast: boolean; // high contrast
  reduceMotion: boolean;
}

const DEFAULTS: AppSettings = {
  lang: "en",
  mode: "simple",
  font: 0,
  voice: true,
  contrast: false,
  reduceMotion: false,
};

type Dict = Record<string, string>;

const EN: Dict = {
  "app.tagline": "Understand your health report. In simple language.",
  "app.taglineShort": "Your report, explained simply.",
  "app.name": "RxAnvaya",

  "nav.overview": "Overview",
  "nav.reports": "My Reports",
  "nav.trends": "Trends",
  "nav.insights": "AI Insights",
  "nav.ask": "Ask AI",
  "nav.voice": "Voice Assistant",
  "nav.sources": "Sources",
  "nav.doctor": "Patient Lab Summary",
  "nav.compare": "Compare Reports",
  "nav.settings": "Settings",
  "nav.home": "Home",
  "nav.more": "More",
  "nav.how": "How it works",
  "nav.why": "Why RxAnvaya",

  "common.continue": "Continue",
  "common.back": "Back",
  "common.next": "Next",
  "common.listen": "Listen",
  "common.stop": "Stop",
  "common.whyMatter": "Why does this matter?",
  "common.viewDetails": "View details",
  "common.talkDoctor": "Discuss with your doctor",
  "common.sources": "Sources",
  "common.viewSource": "View source",
  "common.confidence": "Interpretation confidence",
  "common.high": "High confidence",
  "common.moderate": "Moderate confidence",
  "common.close": "Close",
  "common.done": "Done",
  "common.saved": "Saved",
  "common.perReport": "as printed on your report",

  "status.normal": "Normal",
  "status.borderline": "Needs attention",
  "status.high": "Higher than usual",
  "status.low": "Lower than usual",
  "status.critical": "Seek medical attention",
  "status.within": "Within usual range",

  "disclaimer.short":
    "Educational information only — not a diagnosis. Discuss your results with a qualified doctor.",
  "disclaimer.banner":
    "Important: This tool provides educational information and does not diagnose medical conditions. Please discuss your laboratory results with a qualified healthcare professional.",
  "disclaimer.serious": "This result may require prompt professional attention.",

  "footer.line1": "Know what your report is saying.",
  "footer.line2": "Not just what the numbers are.",
  "footer.sub": "AI-assisted laboratory interpretation for patient education — not a diagnosis.",
  "footer.cta1": "Understand Another Report",
  "footer.cta2": "Generate Patient Lab Summary",

  "welcome.title": "Understand Your Lab Report",
  "welcome.subtitle":
    "Upload your report and we’ll explain the results in simple language.",
  "welcome.listenHint": "Listen in your language",
  "welcome.voicePref": "I prefer voice guidance",
  "welcome.trust1": "Your report stays private",
  "welcome.trust2": "Explanations use trusted medical sources",
  "welcome.trust3": "This is educational, not a diagnosis",
  "welcome.moreLang": "More languages coming soon",

  "upload.title": "Upload Your Report",
  "upload.sub": "Any format works — photo, PDF or scan.",
  "upload.drag": "Drag & drop your report here",
  "upload.or": "or",
  "upload.camera": "Take a Photo",
  "upload.pdf": "Upload PDF",
  "upload.manual": "Enter results manually",
  "upload.tipsTitle": "For a clearer result",
  "upload.tip1": "Keep the paper flat",
  "upload.tip2": "Use good lighting",
  "upload.tip3": "Avoid shadows over the paper",
  "upload.tip4": "Capture the complete page",
  "upload.scan": "Scan Report",
  "upload.trySample": "Try with a sample report",

  "scan.detected": "Report detected",
  "scan.success": "Report detected successfully",
  "scan.capture": "Capture",

  "process.title": "Understanding your report…",
  "process.s1": "Reading the report",
  "process.s2": "Identifying your test results",
  "process.s3": "Checking normal ranges",
  "process.s4": "Finding important patterns",
  "process.s5": "Preparing a simple explanation",
  "process.note": "We check every value before generating your summary.",

  "extract.title": "We found these results",
  "extract.subtitle": "Please check that we read your report correctly.",
  "extract.question": "Did we read this correctly?",
  "extract.correct": "Looks correct",
  "extract.edit": "Edit result",
  "extract.showAll": "Show all results",
  "extract.showLess": "Show fewer results",
  "extract.correctToast": "Great — your report summary is ready.",

  "dash.title": "Your Lab Report",
  "dash.someAttention": "Some results need your attention.",
  "dash.allFine": "Your results are within the usual ranges.",
  "dash.normal": "Normal",
  "dash.borderline": "Needs attention",
  "dash.out": "Outside range",
  "dash.matters": "What matters most?",
  "dash.mattersMost": "What matters most?",
  "dash.mattersSub": "Results outside reference range requiring attention or follow-up.",
  "dash.patternTitle": "AI found a pattern",
  "dash.patternSub": "Related laboratory tests evaluated together rather than isolated numbers.",
  "dash.testsConnected": "Tests connected",
  "dash.allTitle": "Other Tests in This Report",
  "dash.allSub": "Laboratory indicators within normal or expected reference boundaries.",
  "dash.allResults": "All results",
  "dash.closeToLimit": "Results close to the limit",
  "dash.closeNote":
    "Doctors consider your overall health picture rather than one number alone.",
  "dash.story": "AI Health Story",
  "dash.storyTitle": "Your report tells a story",
  "dash.storyListen": "Listen to the story",
  "dash.patternTeaser": "AI found a pattern",
  "dash.criticalDemo": "Simulated example — safety handling demo",

  "test.whatIs": "What is this?",
  "test.whyLow": "Why might this be different?",
  "test.whatDo": "What should I do?",
  "test.otherResults": "Your related results",
  "test.yourTrend": "Your trend",
  "test.evidence": "Why do we say this?",
  "test.refRange": "Reference range",
  "test.marker": "You",
  "test.lowZone": "Low",
  "test.normalZone": "Normal",
  "test.highZone": "High",

  "mode.simple": "Simple",
  "mode.advanced": "Advanced",

  "insights.title": "AI Insights",
  "insights.sub": "Multi-test clinical patterns and your longitudinal health story.",
  "insights.story": "AI Health Story",
  "insights.storySub": "How your indicators evolved across recent reports",
  "insights.patternsTitle": "Connected Lab Patterns",
  "insights.patternsSub": "Related tests evaluated together rather than isolated numbers",
  "insights.found": "AI found a pattern",
  "insights.linkedTests": "linked tests",
  "insights.whyWeSay": "Why we say this",
  "insights.basedOn": "Based on clinical guidelines",
  "insights.notDiagnosis": "This does not establish a diagnosis.",

  "trends.title": "How your results changed over time",
  "trends.sub": "One number is a moment. A trend is a story.",
  "trends.whatChanged": "What changed?",
  "trends.whyMatters": "Why this matters",
  "trends.whyText":
    "A single low value can have many explanations. A repeated downward trend is useful information for your doctor.",
  "trends.timeline": "Compare your reports",
  "trends.hba1cLine":
    "Your HbA1c has increased steadily across the last four reports.",
  "trends.hbChange": "Hemoglobin decreased by 18% over 6 months.",
  "trends.hbSimple": "Your hemoglobin has gradually gone down over the last 6 months.",

  "reports.title": "My Reports",
  "reports.tests": "tests",
  "reports.needAttention": "need attention",
  "reports.allWithin": "All within range",
  "reports.compare": "Compare reports",
  "reports.open": "Open report",
  "reports.latest": "Latest",

  "compare.title": "Compare Reports",
  "compare.whatChanged": "What changed?",
  "compare.stable": "Stable",
  "compare.improved": "Improved",
  "compare.worsened": "Worsened",
  "compare.summary":
    "Your hemoglobin has decreased, while HbA1c and LDL have increased since your previous report.",
  "compare.older": "Older report",
  "compare.newer": "Newer report",

  "ask.title": "Ask About My Report",
  "ask.sub": "Ask questions about your results.",
  "ask.placeholder": "Type your question here…",
  "ask.listening": "Listening…",
  "ask.youAsked": "You asked",
  "ask.play": "Play",
  "ask.showEnglish": "Show English",
  "ask.showHindi": "हिन्दी में देखें",
  "ask.viewSources": "View sources",
  "ask.helpful": "Helpful",
  "ask.notHelpful": "Not helpful",
  "ask.thanks": "Thank you — your feedback improves explanations.",
  "ask.tapMic": "Ask by speaking",
  "ask.typing": "RxAnvaya is thinking…",

  "voice.title": "Voice Assistant",
  "voice.sub": "Ask by voice, in your language. Answers come from your own report.",
  "voice.language": "Speak in",
  "voice.languageHint": "Ask in any of these — the answer comes back in the same language.",
  "voice.start": "Tap to speak",
  "voice.listening": "Listening…",
  "voice.stopListening": "Tap to stop",
  "voice.thinking": "Thinking…",
  "voice.transcribing": "Transcribing…",
  "voice.speaking": "Speaking…",
  "voice.handsFree": "Hands-free",
  "voice.handsFreeHint": "Listens again after each answer",
  "voice.autoSpeak": "Read answers aloud",
  "voice.replay": "Listen again",
  "voice.stopSpeaking": "Stop",
  "voice.typeInstead": "Type your question",
  "voice.typePlaceholder": "Type a question in any language…",
  "voice.reset": "New conversation",
  "voice.empty": "Ask about any result on your report — for example, why your hemoglobin is low.",
  "voice.suggested": "Try asking",
  "voice.groundedIn": "Grounded in your report",
  "voice.noStt": "Voice input is not available in this browser.",
  "voice.noSttHint": "Chrome, Edge and Safari can listen. You can still type your question.",
  "voice.serverStt": "This browser cannot listen on its own, so your voice is transcribed on the server.",
  "voice.serverSttOff": "Server transcription is not set up, so voice input is unavailable here.",
  "voice.noVoiceFor": "This device has no {lang} voice installed.",
  "voice.noVoiceHint": "Add a {lang} voice in your system settings, or set TTS_BASE_URL to have it spoken from the server.",
  "voice.serverVoice": "Spoken by server voice",
  "voice.answeredIn": "Answered in {lang}",
  "voice.errNotAllowed": "Microphone permission was denied. Allow the microphone in your browser, then try again.",
  "voice.errAudioCapture": "No microphone was found. Connect one and try again.",
  "voice.errNoSpeech": "I did not hear anything. Tap the microphone and speak again.",
  "voice.errNetwork": "Speech recognition could not reach the network. Check your connection, or type instead.",
  "voice.errUnsupported": "Speech recognition is not available here.",
  "voice.errAnswerFailed": "I could not answer just now. Please try again.",
  "voice.errMicDenied": "Microphone access was blocked by the browser.",

  "sources.title": "Why do we say this?",
  "sources.sub": "Every explanation is grounded in trusted medical sources.",
  "sources.used": "sources used for this report",
  "sources.evidenceUsed": "Evidence used",
  "sources.covers": "Used for",

  "doctor.title": "Patient Lab Summary",
  "doctor.significant": "Significant results",
  "doctor.obs": "AI-generated observations",
  "doctor.obs1": "Hemoglobin shows a sustained downward trend across three reports.",
  "doctor.obs2": "HbA1c has increased across recent reports (5.9 → 7.2%).",
  "doctor.obs3": "LDL and HDL together show an unfavourable lipid pattern.",
  "doctor.disclaimer":
    "Important: This is an AI-generated educational summary, not a diagnosis. Clinical correlation is advised.",
  "doctor.download": "Download PDF",
  "doctor.share": "Share with doctor",
  "doctor.trend": "Trend",
  "doctor.result": "Result",
  "doctor.reference": "Reference",
  "doctor.status": "Status",
  "doctor.test": "Test",
  "doctor.pdfToast": "Summary prepared — use your browser's print dialog to save as PDF.",
  "doctor.shareToast": "Secure share link copied (demo).",

  "settings.title": "Settings & Accessibility",
  "settings.language": "Language",
  "settings.reading": "Reading mode",
  "settings.fontSize": "Font size",
  "settings.fontNormal": "Normal",
  "settings.fontLarge": "Large",
  "settings.fontXL": "Extra Large",
  "settings.voice": "Voice explanations",
  "settings.voiceDesc": "Enable speaker buttons that read results aloud",
  "settings.contrast": "High contrast",
  "settings.contrastDesc": "Stronger borders and bolder text",
  "settings.motion": "Reduce animations",
  "settings.motionDesc": "Reduce movement for comfort",
  "settings.units": "Units",
  "settings.unitsDesc": "Automatic — uses the units printed on your report",
  "settings.standard": "Standard",
  "settings.savedToast": "Your settings were saved.",
  "settings.preview": "Preview",

  "simple.label": "Simple Mode",

  "toast.lang": "Language updated",
  "toast.pdf": "Preparing your PDF…",
  "toast.link": "Link copied",
};

const HI: Dict = {
  "app.tagline": "अपनी हेल्थ रिपोर्ट समझें। आसान भाषा में।",
  "app.taglineShort": "आपकी रिपोर्ट, सरल भाषा में।",
  "app.name": "RxAnvaya",

  "nav.overview": "मुख्य सारांश",
  "nav.reports": "मेरी रिपोर्ट्स",
  "nav.trends": "समय के साथ बदलाव",
  "nav.insights": "AI इनसाइट्स",
  "nav.ask": "AI से पूछें",
  "nav.voice": "आवाज़ सहायक",
  "nav.sources": "स्रोत",
  "nav.doctor": "रोगी लैब सारांश",
  "nav.compare": "रिपोर्ट तुलना",
  "nav.settings": "सेटिंग्स",
  "nav.home": "होम",
  "nav.more": "और",
  "nav.how": "यह कैसे काम करता है",
  "nav.why": "RxAnvaya क्यों",

  "common.continue": "आगे बढ़ें",
  "common.back": "वापस",
  "common.next": "आगे",
  "common.listen": "सुनें",
  "common.stop": "रोकें",
  "common.whyMatter": "यह क्यों महत्वपूर्ण है?",
  "common.viewDetails": "विवरण देखें",
  "common.talkDoctor": "डॉक्टर से चर्चा करें",
  "common.sources": "स्रोत",
  "common.viewSource": "स्रोत देखें",
  "common.confidence": "व्याख्या विश्वास",
  "common.high": "उच्च विश्वास",
  "common.moderate": "मध्यम विश्वास",
  "common.close": "बंद करें",
  "common.done": "हो गया",
  "common.saved": "सहेजा गया",
  "common.perReport": "आपकी रिपोर्ट के अनुसार",

  "status.normal": "सामान्य",
  "status.borderline": "ध्यान देने की आवश्यकता",
  "status.high": "सामान्य से अधिक",
  "status.low": "सामान्य से कम",
  "status.critical": "तुरंत चिकित्सक से मिलें",
  "status.within": "सामान्य सीमा में",

  "disclaimer.short":
    "केवल शैक्षिक जानकारी — निदान नहीं। अपने परिणामों पर योग्य डॉक्टर से चर्चा करें।",
  "disclaimer.banner":
    "महत्वपूर्ण: यह उपकरण केवल शैक्षिक जानकारी देता है और बीमारी का निदान नहीं करता। अपने लैब परिणामों पर योग्य डॉक्टर से चर्चा करें।",
  "disclaimer.serious": "इस परिणाम में तुरंत चिकित्सकीय ध्यान देना ज़रूरी हो सकता है।",

  "footer.line1": "जानिए आपकी रिपोर्ट क्या कह रही है।",
  "footer.line2": "सिर्फ़ संख्याएँ नहीं — इनका मतलब।",
  "footer.sub": "रोगी शिक्षा हेतु AI-सहायता प्राप्त लैब व्याख्या — निदान नहीं।",
  "footer.cta1": "एक और रिपोर्ट समझें",
  "footer.cta2": "रोगी लैब सारांश बनाएँ",

  "welcome.title": "अपनी लैब रिपोर्ट समझें",
  "welcome.subtitle": "अपनी रिपोर्ट अपलोड करें — हम परिणाम सरल भाषा में समझाएँगे।",
  "welcome.listenHint": "अपनी भाषा में सुनें",
  "welcome.voicePref": "मैं आवाज़ से सहायता चाहता/चाहती हूँ",
  "welcome.trust1": "आपकी रिपोर्ट निजी रहती है",
  "welcome.trust2": "व्याख्या विश्वसनीय चिकित्सा स्रोतों पर आधारित है",
  "welcome.trust3": "यह शिक्षा है — निदान नहीं",
  "welcome.moreLang": "और भाषाएँ जल्द आ रही हैं",

  "upload.title": "अपनी रिपोर्ट अपलोड करें",
  "upload.sub": "कोई भी प्रारूप चलेगा — फ़ोटो, PDF या स्कैन।",
  "upload.drag": "अपनी रिपोर्ट यहाँ खींचें और छोड़ें",
  "upload.or": "या",
  "upload.camera": "रिपोर्ट की फ़ोटो लें",
  "upload.pdf": "PDF अपलोड करें",
  "upload.manual": "परिणाम ख़ुद लिखें",
  "upload.tipsTitle": "बेहतर परिणाम के लिए",
  "upload.tip1": "कागज़ को सपाट रखें",
  "upload.tip2": "अच्छी रोशनी में फ़ोटो लें",
  "upload.tip3": "कागज़ पर परछाई न आए",
  "upload.tip4": "पूरा पेज फ़्रेम में आए",
  "upload.scan": "रिपोर्ट स्कैन करें",
  "upload.trySample": "नमूना रिपोर्ट से आज़माएँ",

  "scan.detected": "रिपोर्ट पहचानी गई",
  "scan.success": "रिपोर्ट सफलतापूर्वक पहचानी गई",
  "scan.capture": "फ़ोटो लें",

  "process.title": "आपकी रिपोर्ट समझी जा रही है…",
  "process.s1": "रिपोर्ट पढ़ी जा रही है",
  "process.s2": "आपके परिणाम पहचाने जा रहे हैं",
  "process.s3": "सामान्य सीमा जाँची जा रही है",
  "process.s4": "महत्वपूर्ण पैटर्न ढूँढे जा रहे हैं",
  "process.s5": "सरल व्याख्या तैयार हो रही है",
  "process.note": "सारांश बनाने से पहले हर मान जाँचा जाता है।",

  "extract.title": "हमें ये परिणाम मिले",
  "extract.subtitle": "कृपया जाँचें कि हमने आपकी रिपोर्ट सही पढ़ी है।",
  "extract.question": "क्या हमने यह सही पढ़ा?",
  "extract.correct": "सही है",
  "extract.edit": "परिणाम सुधारें",
  "extract.showAll": "सभी परिणाम देखें",
  "extract.showLess": "कम परिणाम देखें",
  "extract.correctToast": "बहुत बढ़िया — आपकी रिपोर्ट सारांश तैयार है।",

  "dash.title": "आपकी रिपोर्ट",
  "dash.someAttention": "कुछ परिणामों पर ध्यान देने की आवश्यकता है।",
  "dash.allFine": "आपके परिणाम सामान्य सीमा में हैं।",
  "dash.normal": "सामान्य",
  "dash.borderline": "ध्यान दें",
  "dash.out": "सीमा से बाहर",
  "dash.matters": "सबसे ज़रूरी क्या है?",
  "dash.mattersMost": "सबसे ज़रूरी क्या है?",
  "dash.mattersSub": "वे परिणाम जो सामान्य सीमा से बाहर हैं और जिन पर ध्यान देना चाहिए।",
  "dash.patternTitle": "AI ने एक पैटर्न पाया",
  "dash.patternSub": "आपस में जुड़े टेस्ट्स का एक साथ समग्र विश्लेषण।",
  "dash.testsConnected": "जुड़े हुए टेस्ट",
  "dash.allTitle": "इस रिपोर्ट के अन्य टेस्ट",
  "dash.allSub": "वे संकेतक जो सामान्य या अपेक्षित सीमा के भीतर हैं।",
  "dash.allResults": "सभी परिणाम",
  "dash.closeToLimit": "सीमा के पास परिणाम",
  "dash.closeNote": "डॉक्टर एक संख्या के बजाय आपके पूरे स्वास्थ्य को देखते हैं।",
  "dash.story": "AI हेल्थ स्टोरी",
  "dash.storyTitle": "आपकी रिपोर्ट एक कहानी बताती है",
  "dash.storyListen": "कहानी सुनें",
  "dash.patternTeaser": "AI ने एक पैटर्न पाया",
  "dash.criticalDemo": "सिम्युलेटेड उदाहरण — सुरक्षा डेमो",

  "test.whatIs": "यह क्या है?",
  "test.whyLow": "यह अलग क्यों हो सकता है?",
  "test.whatDo": "मुझे क्या करना चाहिए?",
  "test.otherResults": "आपके संबंधित परिणाम",
  "test.yourTrend": "आपका रुझान",
  "test.evidence": "हमने ऐसा क्यों कहा?",
  "test.refRange": "सामान्य सीमा",
  "test.marker": "आप",
  "test.lowZone": "कम",
  "test.normalZone": "सामान्य",
  "test.highZone": "अधिक",

  "mode.simple": "सरल",
  "mode.advanced": "विस्तृत",

  "insights.title": "AI इनसाइट्स",
  "insights.sub": "बहु-जाँच क्लिनिकल पैटर्न और समय के साथ आपकी स्वास्थ्य कहानी।",
  "insights.story": "AI हेल्थ स्टोरी",
  "insights.storySub": "हालिया रिपोर्टों में आपके स्वास्थ्य संकेतकों का बदलाव",
  "insights.patternsTitle": "जुड़े हुए लैब पैटर्न",
  "insights.patternsSub": "अलग-अलग संख्याओं के बजाय संबंधित जाँचों का एक साथ क्लिनिकल विश्लेषण",
  "insights.found": "AI ने एक पैटर्न पाया",
  "insights.linkedTests": "जाँचें जुड़ी हैं",
  "insights.whyWeSay": "हमने ऐसा क्यों कहा",
  "insights.basedOn": "क्लिनिकल दिशानिर्देशों पर आधारित",
  "insights.notDiagnosis": "यह निदान सिद्ध नहीं करता।",

  "trends.title": "समय के साथ आपके परिणाम कैसे बदले",
  "trends.sub": "एक संख्या एक पल है। रुझान एक कहानी है।",
  "trends.whatChanged": "क्या बदला?",
  "trends.whyMatters": "यह क्यों महत्वपूर्ण है",
  "trends.whyText":
    "एक बार कम मान के कई कारण हो सकते हैं। लगातार घटता रुझान आपके डॉक्टर के लिए उपयोगी जानकारी है।",
  "trends.timeline": "अपनी रिपोर्ट्स की तुलना करें",
  "trends.hba1cLine": "आपका HbA1c पिछली चार रिपोर्टों में लगातार बढ़ा है।",
  "trends.hbChange": "हीमोग्लोबिन 6 महीनों में 18% घटा।",
  "trends.hbSimple": "आपका हीमोग्लोबिन पिछले 6 महीनों में धीरे-धीरे घटा है।",

  "reports.title": "मेरी रिपोर्ट्स",
  "reports.tests": "जाँचें",
  "reports.needAttention": "पर ध्यान दें",
  "reports.allWithin": "सभी सामान्य सीमा में",
  "reports.compare": "रिपोर्ट तुलना करें",
  "reports.open": "रिपोर्ट खोलें",
  "reports.latest": "नवीनतम",

  "compare.title": "रिपोर्ट तुलना",
  "compare.whatChanged": "क्या बदला?",
  "compare.stable": "स्थिर",
  "compare.improved": "सुधार",
  "compare.worsened": "बिगड़ाव",
  "compare.summary":
    "पिछली रिपोर्ट की तुलना में आपका हीमोग्लोबिन घटा है, जबकि HbA1c और LDL बढ़े हैं।",
  "compare.older": "पुरानी रिपोर्ट",
  "compare.newer": "नई रिपोर्ट",

  "ask.title": "मेरी रिपोर्ट के बारे में पूछें",
  "ask.sub": "अपने परिणामों के बारे में प्रश्न पूछें।",
  "ask.placeholder": "अपना प्रश्न यहाँ लिखें…",
  "ask.listening": "सुन रहे हैं…",
  "ask.youAsked": "आपने पूछा",
  "ask.play": "चलाएँ",
  "ask.showEnglish": "Show English",
  "ask.showHindi": "हिन्दी में देखें",
  "ask.viewSources": "स्रोत देखें",
  "ask.helpful": "उपयोगी",
  "ask.notHelpful": "उपयोगी नहीं",
  "ask.thanks": "धन्यवाद — आपकी प्रतिक्रिया व्याख्या बेहतर बनाती है।",
  "ask.tapMic": "बोलकर पूछें",
  "ask.typing": "RxAnvaya सोच रहा है…",

  "voice.title": "आवाज़ सहायक",
  "voice.sub": "अपनी भाषा में बोलकर पूछें। उत्तर आपकी ही रिपोर्ट से आते हैं।",
  "voice.language": "इस भाषा में बोलें",
  "voice.languageHint": "इनमें से किसी भी भाषा में पूछें — उत्तर उसी भाषा में मिलेगा।",
  "voice.start": "बोलने के लिए दबाएँ",
  "voice.listening": "सुन रहे हैं…",
  "voice.stopListening": "रोकने के लिए दबाएँ",
  "voice.thinking": "सोच रहे हैं…",
  "voice.transcribing": "लिखा जा रहा है…",
  "voice.speaking": "बोल रहे हैं…",
  "voice.handsFree": "हैंड्स-फ़्री",
  "voice.handsFreeHint": "हर उत्तर के बाद फिर से सुनेगा",
  "voice.autoSpeak": "उत्तर बोलकर सुनाएँ",
  "voice.replay": "फिर से सुनें",
  "voice.stopSpeaking": "रोकें",
  "voice.typeInstead": "अपना प्रश्न लिखें",
  "voice.typePlaceholder": "किसी भी भाषा में प्रश्न लिखें…",
  "voice.reset": "नई बातचीत",
  "voice.empty": "अपनी रिपोर्ट के किसी भी परिणाम के बारे में पूछें — जैसे हीमोग्लोबिन कम क्यों है।",
  "voice.suggested": "यह पूछकर देखें",
  "voice.groundedIn": "आपकी रिपोर्ट पर आधारित",
  "voice.noStt": "इस ब्राउज़र में आवाज़ से पूछना उपलब्ध नहीं है।",
  "voice.noSttHint": "Chrome, Edge और Safari सुन सकते हैं। आप प्रश्न लिख भी सकते हैं।",
  "voice.serverStt": "यह ब्राउज़र स्वयं नहीं सुन सकता, इसलिए आपकी आवाज़ सर्वर पर लिखी जाती है।",
  "voice.serverSttOff": "सर्वर ट्रांसक्रिप्शन सेट नहीं है, इसलिए यहाँ आवाज़ से पूछना उपलब्ध नहीं है।",
  "voice.noVoiceFor": "इस डिवाइस में {lang} की आवाज़ इंस्टॉल नहीं है।",
  "voice.noVoiceHint": "सिस्टम सेटिंग्स में {lang} की आवाज़ जोड़ें, या सर्वर से सुनाने के लिए TTS_BASE_URL सेट करें।",
  "voice.serverVoice": "सर्वर आवाज़ में बोला गया",
  "voice.answeredIn": "{lang} में उत्तर",
  "voice.errNotAllowed": "माइक्रोफ़ोन की अनुमति नहीं दी गई। ब्राउज़र में माइक्रोफ़ोन की अनुमति दें, फिर कोशिश करें।",
  "voice.errAudioCapture": "कोई माइक्रोफ़ोन नहीं मिला। माइक्रोफ़ोन जोड़कर फिर कोशिश करें।",
  "voice.errNoSpeech": "कुछ सुनाई नहीं दिया। माइक्रोफ़ोन दबाएँ और फिर बोलें।",
  "voice.errNetwork": "आवाज़ पहचान नेटवर्क तक नहीं पहुँच सकी। कनेक्शन जाँचें, या लिखकर पूछें।",
  "voice.errUnsupported": "यहाँ आवाज़ पहचान उपलब्ध नहीं है।",
  "voice.errAnswerFailed": "अभी उत्तर नहीं दे सका। कृपया फिर कोशिश करें।",
  "voice.errMicDenied": "ब्राउज़र ने माइक्रोफ़ोन की अनुमति रोक दी।",

  "sources.title": "हमने ऐसा क्यों कहा?",
  "sources.sub": "हर व्याख्या विश्वसनीय चिकित्सा स्रोतों पर आधारित है।",
  "sources.used": "स्रोत इस रिपोर्ट के लिए उपयोग किए गए",
  "sources.evidenceUsed": "उपयोग किया गया प्रमाण",
  "sources.covers": "इनके लिए उपयोग",

  "doctor.title": "रोगी लैब सारांश",
  "doctor.significant": "महत्वपूर्ण परिणाम",
  "doctor.obs": "AI जनित अवलोकन",
  "doctor.obs1": "हीमोग्लोबिन तीन रिपोर्टों में लगातार घटता रुझान दिखाता है।",
  "doctor.obs2": "HbA1c हालिया रिपोर्टों में बढ़ा है (5.9 → 7.2%)।",
  "doctor.obs3": "LDL और HDL मिलकर प्रतिकूल लिपिड पैटर्न दिखाते हैं।",
  "doctor.disclaimer":
    "महत्वपूर्ण: यह AI जनित शैक्षिक सारांश है — निदान नहीं। क्लिनिकल सह-संबंध उचित है।",
  "doctor.download": "PDF डाउनलोड",
  "doctor.share": "डॉक्टर को भेजें",
  "doctor.trend": "रुझान",
  "doctor.result": "परिणाम",
  "doctor.reference": "संदर्भ",
  "doctor.status": "स्थिति",
  "doctor.test": "जाँच",
  "doctor.pdfToast": "सारांश तैयार — PDF सहेजने हेतु ब्राउज़र प्रिंट का उपयोग करें।",
  "doctor.shareToast": "सुरक्षित लिंक कॉपी किया गया (डेमो)।",

  "settings.title": "सेटिंग्स और सुगम्यता",
  "settings.language": "भाषा",
  "settings.reading": "पठन मोड",
  "settings.fontSize": "अक्षर आकार",
  "settings.fontNormal": "सामान्य",
  "settings.fontLarge": "बड़ा",
  "settings.fontXL": "बहुत बड़ा",
  "settings.voice": "आवाज़ व्याख्या",
  "settings.voiceDesc": "परिणाम बोलकर सुनाने वाले स्पीकर बटन सक्षम करें",
  "settings.contrast": "उच्च कंट्रास्ट",
  "settings.contrastDesc": "मज़बूत बॉर्डर और गहरे अक्षर",
  "settings.motion": "ऐनिमेशन कम करें",
  "settings.motionDesc": "आराम के लिए गति कम करें",
  "settings.units": "इकाइयाँ",
  "settings.unitsDesc": "स्वचालित — रिपोर्ट में छपी इकाइयाँ उपयोग होती हैं",
  "settings.standard": "मानक",
  "settings.savedToast": "आपकी सेटिंग्स सहेज ली गईं।",
  "settings.preview": "पूर्वावलोकन",

  "simple.label": "सरल मोड",

  "toast.lang": "भाषा बदल गई",
  "toast.pdf": "आपका PDF तैयार हो रहा है…",
  "toast.link": "लिंक कॉपी हुआ",
};

// Bengali subset — falls back to English for untranslated keys.
const BN: Dict = {
  "nav.overview": "সংক্ষিপ্ত সার",
  "nav.reports": "আমার রিপোর্ট",
  "nav.trends": "ট্রেন্ড",
  "nav.insights": "AI ইনসাইট",
  "nav.ask": "AI-কে জিজ্ঞেস করুন",
  "nav.voice": "ভয়েস সহকারী",
  "nav.sources": "সূত্র",
  "nav.doctor": "রোগীর ল্যাব সারাংশ",
  "nav.compare": "রিপোর্ট তুলনা",
  "nav.settings": "সেটিংস",
  "nav.home": "হোম",
  "nav.more": "আরও",
  "common.continue": "এগিয়ে যান",
  "common.listen": "শুনুন",
  "common.back": "ফিরে যান",
  "welcome.title": "আপনার ল্যাব রিপোর্ট বুঝুন",
  "welcome.subtitle": "রিপোর্ট আপলোড করুন — আমরা সহজ ভাষায় বুঝিয়ে দেব।",
  "status.normal": "স্বাভাবিক",
  "status.borderline": "মনোযোগ দরকার",
  "status.high": "স্বাভাবিকের চেয়ে বেশি",
  "status.low": "স্বাভাবিকের চেয়ে কম",
  "dash.title": "আপনার রিপোর্ট",
  "dash.someAttention": "কিছু ফলাফলে মনোযোগ দরকার।",
  "dash.mattersMost": "সবচেয়ে গুরুত্বপূর্ণ কি?",
  "dash.mattersSub": "যে ফলাফলগুলি স্বাভাবিক সীমার বাইরে এবং যেগুলিতে নজর দেওয়া দরকার।",
  "dash.patternTitle": "AI একটি প্যাটার্ন খুঁজে পেয়েছে",
  "dash.patternSub": "সম্পর্কিত ল্যাব টেস্ট একসাথে মূল্যায়ন করা হয়েছে।",
  "dash.testsConnected": "সংযুক্ত টেস্ট",
  "dash.allTitle": "এই রিপোর্টের অন্যান্য টেস্ট",
  "dash.allSub": "যে সূচকগুলি স্বাভাবিক সীমার মধ্যে রয়েছে।",
  "mode.simple": "সহজ",
  "mode.advanced": "উন্নত",
  "voice.title": "ভয়েস সহকারী",
  "voice.sub": "আপনার ভাষায় কথা বলে জিজ্ঞাসা করুন। উত্তর আপনার নিজের রিপোর্ট থেকে আসে।",
  "voice.language": "এই ভাষায় বলুন",
  "voice.start": "কথা বলতে চাপুন",
  "voice.listening": "শুনছি…",
  "voice.stopListening": "থামাতে চাপুন",
  "voice.thinking": "ভাবছি…",
  "voice.speaking": "বলছি…",
  "voice.handsFree": "হ্যান্ডস-ফ্রি",
  "voice.autoSpeak": "উত্তর জোরে পড়ুন",
  "voice.replay": "আবার শুনুন",
  "voice.stopSpeaking": "থামান",
  "voice.reset": "নতুন কথোপকথন",
  "voice.typeInstead": "আপনার প্রশ্ন লিখুন",
  "voice.suggested": "এটি জিজ্ঞাসা করে দেখুন",
  "disclaimer.short": "শুধুমাত্র শিক্ষামূলক তথ্য — রোগ নির্ণয় নয়। ডাক্তারের সাথে আলোচনা করুন।",
};

const DICTS: Record<LangCode, Dict> = { en: EN, hi: HI, bn: BN };

interface I18nValue {
  s: AppSettings;
  set: (patch: Partial<AppSettings>) => void;
  t: (key: string) => string;
  speechLang: () => string;
}

const Ctx = createContext<I18nValue | null>(null);

const LS_KEY = "rxanvaya-settings-v1";

export function I18nProvider({ children }: { children: ReactNode }) {
  const [s, setS] = useState<AppSettings>(DEFAULTS);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed.mode === "standard") parsed.mode = "advanced";
        if (parsed.mode === "very") parsed.mode = "simple";
        setS({ ...DEFAULTS, ...parsed });
      }
    } catch {
      /* ignore */
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(s));
    } catch {
      /* ignore */
    }
    const root = document.documentElement;
    root.classList.toggle("hc", s.contrast);
    root.classList.toggle("rm", s.reduceMotion);
    root.style.fontSize = s.font === 0 ? "100%" : s.font === 1 ? "112.5%" : "125%";
    root.lang = s.lang === "hi" ? "hi" : s.lang === "bn" ? "bn" : "en";
  }, [s, hydrated]);

  const set = useCallback((patch: Partial<AppSettings>) => {
    setS((prev) => ({ ...prev, ...patch }));
  }, []);

  const t = useCallback(
    (key: string) => {
      const dict = DICTS[s.lang] ?? EN;
      return dict[key] ?? EN[key] ?? key;
    },
    [s.lang]
  );

  const speechLang = useCallback(
    () => (s.lang === "hi" ? "hi-IN" : s.lang === "bn" ? "bn-IN" : "en-IN"),
    [s.lang]
  );

  const value = useMemo(
    () => ({ s, set, t, speechLang }),
    [s, set, t, speechLang]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useI18n(): I18nValue {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useI18n must be used inside I18nProvider");
  return ctx;
}

/** Pick localized pair, falling back to English for bn. */
export function pick(pair: { en: string; hi: string }, lang: LangCode): string {
  return lang === "hi" ? pair.hi : pair.en;
}

// ---------------------------------------------------------------------------
// The language registry — the single source of truth for "which languages can
// this product speak, listen and answer in".
//
// It is deliberately free of React and of Node built-ins so the SAME list is
// imported by:
//   - the browser voice agent (src/lib/voice/*)  -> BCP-47 codes for the Web
//     Speech API, native names for the language picker
//   - the server (/api/answer, src/lib/ai/agent.ts) -> validation of whatever
//     a client asks for, and the language name the prompt is written in
//   - guardrails.ts -> which curated safety text to answer a refusal in
//
// Nothing here is secret and nothing here depends on a model, so a client can
// read the list; the server still re-validates any code it is given.
//
// WHY A SEPARATE TYPE FROM LangCode
// src/lib/data.ts's `LangCode` ("en" | "hi" | "bn") is the UI dictionary set —
// it drives which strings the whole app renders. AnswerLang is wider: the model
// can be asked to write in 14 languages even though the app chrome is only
// translated into three. Keeping the two types apart is what stops a UI string
// lookup from silently receiving a language it has no dictionary for.
// ---------------------------------------------------------------------------

export type AnswerLang =
  | "en"
  | "hi"
  | "bn"
  | "ta"
  | "te"
  | "mr"
  | "gu"
  | "kn"
  | "ml"
  | "pa"
  | "ur"
  | "or"
  | "as"
  | "ne";

export interface LanguageDef {
  /** Stable internal code (ISO 639-1). */
  code: AnswerLang;
  /** Tag for the Web Speech API, speechSynthesis voices and Whisper. */
  bcp47: string;
  /** Native name, for the language picker. */
  native: string;
  /** English name, for logs and the prompt. */
  english: string;
  /**
   * What the system prompt calls the language. Spelled out on purpose:
   * "Hindi (Devanagari script)" disambiguates the script for a model that
   * could otherwise answer Hindi in Latin transliteration, which would then be
   * unreadable to a TTS voice.
   */
  promptName: string;
  /** Unicode block used to detect the language from text. */
  script?: { from: number; to: number };
  /**
   * Which curated fallback text exists for this language. src/lib/ai/rules.ts
   * ships English + Hindi answers only, so a rule fallback for any other
   * language has to pick one — recorded here, and reported to the client as
   * `language_note` so a Tamil answer arriving in English is never silent.
   */
  ruleLang: "en" | "hi";
  /** True when src/lib/i18n.tsx has a full UI dictionary for it. */
  uiTranslated: boolean;
  /** Rough speaker base — the picker's display order. */
  speakersMillions: number;
}

/**
 * Ordered by number of speakers, so the picker puts the languages most people
 * will need at the top.
 */
export const LANGUAGES: readonly LanguageDef[] = [
  {
    code: "en",
    bcp47: "en-IN",
    native: "English",
    english: "English",
    promptName: "English",
    ruleLang: "en",
    uiTranslated: true,
    speakersMillions: 129,
  },
  {
    code: "hi",
    bcp47: "hi-IN",
    native: "हिन्दी",
    english: "Hindi",
    promptName: "Hindi (Devanagari script)",
    script: { from: 0x0900, to: 0x097f }, // Devanagari
    ruleLang: "hi",
    uiTranslated: true,
    speakersMillions: 528,
  },
  {
    code: "bn",
    bcp47: "bn-IN",
    native: "বাংলা",
    english: "Bengali",
    promptName: "Bengali (Bangla script)",
    script: { from: 0x0980, to: 0x09ff }, // Bengali
    ruleLang: "en",
    uiTranslated: true,
    speakersMillions: 97,
  },
  {
    code: "mr",
    bcp47: "mr-IN",
    native: "मराठी",
    english: "Marathi",
    promptName: "Marathi (Devanagari script)",
    script: { from: 0x0900, to: 0x097f },
    ruleLang: "en",
    uiTranslated: false,
    speakersMillions: 83,
  },
  {
    code: "te",
    bcp47: "te-IN",
    native: "తెలుగు",
    english: "Telugu",
    promptName: "Telugu",
    script: { from: 0x0c00, to: 0x0c7f },
    ruleLang: "en",
    uiTranslated: false,
    speakersMillions: 81,
  },
  {
    code: "ta",
    bcp47: "ta-IN",
    native: "தமிழ்",
    english: "Tamil",
    promptName: "Tamil",
    script: { from: 0x0b80, to: 0x0bff },
    ruleLang: "en",
    uiTranslated: false,
    speakersMillions: 69,
  },
  {
    code: "gu",
    bcp47: "gu-IN",
    native: "ગુજરાતી",
    english: "Gujarati",
    promptName: "Gujarati",
    script: { from: 0x0a80, to: 0x0aff },
    ruleLang: "en",
    uiTranslated: false,
    speakersMillions: 55,
  },
  {
    code: "ur",
    bcp47: "ur-IN",
    native: "اردو",
    english: "Urdu",
    promptName: "Urdu (Arabic script)",
    script: { from: 0x0600, to: 0x06ff }, // Arabic
    ruleLang: "en",
    uiTranslated: false,
    speakersMillions: 51,
  },
  {
    code: "kn",
    bcp47: "kn-IN",
    native: "ಕನ್ನಡ",
    english: "Kannada",
    promptName: "Kannada",
    script: { from: 0x0c80, to: 0x0cff },
    ruleLang: "en",
    uiTranslated: false,
    speakersMillions: 43,
  },
  {
    code: "or",
    bcp47: "or-IN",
    native: "ଓଡ଼ିଆ",
    english: "Odia",
    promptName: "Odia (Oriya script)",
    script: { from: 0x0b00, to: 0x0b7f },
    ruleLang: "en",
    uiTranslated: false,
    speakersMillions: 37,
  },
  {
    code: "ml",
    bcp47: "ml-IN",
    native: "മലയാളം",
    english: "Malayalam",
    promptName: "Malayalam",
    script: { from: 0x0d00, to: 0x0d7f },
    ruleLang: "en",
    uiTranslated: false,
    speakersMillions: 34,
  },
  {
    code: "pa",
    bcp47: "pa-Guru-IN",
    native: "ਪੰਜਾਬੀ",
    english: "Punjabi",
    promptName: "Punjabi (Gurmukhi script)",
    script: { from: 0x0a00, to: 0x0a7f },
    ruleLang: "en",
    uiTranslated: false,
    speakersMillions: 33,
  },
  {
    code: "ne",
    bcp47: "ne-NP",
    native: "नेपाली",
    english: "Nepali",
    promptName: "Nepali (Devanagari script)",
    script: { from: 0x0900, to: 0x097f },
    ruleLang: "en",
    uiTranslated: false,
    speakersMillions: 16,
  },
  {
    code: "as",
    bcp47: "as-IN",
    native: "অসমীয়া",
    english: "Assamese",
    promptName: "Assamese (Bengali-Assamese script)",
    script: { from: 0x0980, to: 0x09ff },
    ruleLang: "en",
    uiTranslated: false,
    speakersMillions: 15,
  },
] as const;

export const ANSWER_LANGS: readonly AnswerLang[] = LANGUAGES.map((l) => l.code);

const BY_CODE = new Map<AnswerLang, LanguageDef>(
  LANGUAGES.map((l) => [l.code, l as LanguageDef])
);

/** Some browsers only accept a bare language subtag for a few locales. */
const BY_BCP47 = new Map<string, LanguageDef>(
  LANGUAGES.flatMap((l) => {
    const def = l as LanguageDef;
    return [
      [def.bcp47.toLowerCase(), def],
      [def.code.toLowerCase(), def],
      [def.bcp47.split("-")[0].toLowerCase(), def],
    ] as [string, LanguageDef][];
  })
);

export function isAnswerLang(v: unknown): v is AnswerLang {
  return typeof v === "string" && BY_CODE.has(v as AnswerLang);
}

export function languageOf(code: AnswerLang): LanguageDef {
  return BY_CODE.get(code) ?? (LANGUAGES[0] as LanguageDef);
}

export function bcp47Of(code: AnswerLang): string {
  return languageOf(code).bcp47;
}

/**
 * Coerce anything a client sends into a supported language.
 *
 * Accepts "ta", "TA", "ta-IN" and "ta-in"; returns `fallback` for anything
 * else, including a valid-looking but unsupported code such as "fr". The
 * server must never trust the client to have picked from the list.
 */
export function toAnswerLang(v: unknown, fallback: AnswerLang = "en"): AnswerLang {
  if (typeof v !== "string") return fallback;
  const key = v.trim().toLowerCase();
  if (key === "") return fallback;
  return BY_BCP47.get(key)?.code ?? fallback;
}

/** The two languages the deterministic rule answers are written in. */
export function hasRuleText(code: AnswerLang): boolean {
  return code === "en" || code === "hi";
}

/**
 * Guess the language of a piece of text from its script.
 *
 * Used for two things the voice agent cannot otherwise know:
 *  1. Which TTS voice to read an answer with when the model answered in a
 *     language the client did not ask for (models do drift).
 *  2. Detecting that the browser's speech recogniser transcribed in a language
 *     other than the one selected, so the follow-up can adapt.
 *
 * Latin-script text is not guessable from characters alone, so `fallback`
 * wins — that keeps an English question from being "detected" as something
 * else just because it contains a stray non-ASCII character.
 */
export function detectLangFromText(text: string, fallback: AnswerLang = "en"): AnswerLang {
  if (!text) return fallback;
  const counts = new Map<AnswerLang, number>();
  for (const ch of text) {
    const cp = ch.codePointAt(0);
    if (cp === undefined) continue;
    for (const lang of LANGUAGES) {
      const s = lang.script;
      if (!s) continue;
      if (cp >= s.from && cp <= s.to) {
        counts.set(lang.code, (counts.get(lang.code) ?? 0) + 1);
        break;
      }
    }
  }
  if (counts.size === 0) return fallback;
  // Devanagari is shared by Hindi, Marathi and Nepali. Prefer Hindi — the
  // language the product's clinical content is actually written in — unless
  // another script is present in greater number.
  let best: AnswerLang = fallback;
  let bestN = 0;
  for (const [code, n] of counts) {
    const tieBreak = code === "hi" ? 1.0001 : 1;
    if (n * tieBreak > bestN) {
      bestN = n * tieBreak;
      best = code;
    }
  }
  return best;
}

/** Common imperative forms users type in each supported language. */
const LOCALIZED_LANGUAGE_REQUESTS: readonly [AnswerLang, RegExp][] = [
  ["hi", /(?:हिंदी|हिन्दी)\s*(?:में|मे)\s*(?:जवाब|उत्तर|बोलें|लिखें|बताएं|बताइए)/iu],
  ["bn", /বাংলা(?:য়|য়|তে)\s*(?:উত্তর|জবাব|বলুন|লিখুন)/iu],
  ["ta", /தமிழில்\s*(?:பதில்|விடை|சொல்லுங்கள்|எழுதுங்கள்)/iu],
  ["te", /తెలుగులో\s*(?:సమాధానం|జవాబు|చెప్పండి|రాయండి)/iu],
  ["mr", /मराठ(?:ीत|ीमध्ये|ी भाषेत)\s*(?:उत्तर|जवाब|बोला|लिहा|द्या)/iu],
  ["gu", /ગુજરાતીમાં\s*(?:જવાબ|ઉત્તર|કહો|લખો|આપો)/iu],
  ["kn", /ಕನ್ನಡದಲ್ಲಿ\s*(?:ಉತ್ತರ|ಜವಾಬು|ಹೇಳಿ|ಬರೆಯಿರಿ)/iu],
  ["ml", /മലയാളത്തിൽ\s*(?:മറുപടി|ഉത്തരം|പറയൂ|എഴുതൂ)/iu],
  ["pa", /ਪੰਜਾਬੀ\s*(?:ਵਿੱਚ|ਵਿਚ)\s*(?:ਜਵਾਬ|ਉੱਤਰ|ਦੱਸੋ|ਲਿਖੋ)/iu],
  ["ur", /اردو\s*(?:میں|می)\s*(?:جواب|جملہ|بتائیں|لکھیں)/iu],
  ["or", /ଓଡ଼ିଆରେ\s*(?:ଉତ୍ତର|ଜବାବ|କୁହନ୍ତୁ|ଲେଖନ୍ତୁ)/iu],
  ["as", /অসমীয়াত\s*(?:উত্তৰ|জবাব|কওক|লিখক)/iu],
  ["ne", /नेपालीमा\s*(?:जवाफ|उत्तर|भन्नुहोस्|लेख्नुहोस्)/iu],
];

/**
 * Detect an explicit "answer in <language>" request in a typed question.
 * This is intentionally conservative: ordinary mentions such as "my Hindi
 * report" do not change the answer language unless the user asks for it.
 */
export function requestedLanguageFromQuestion(text: string): AnswerLang | undefined {
  const q = text.trim().toLocaleLowerCase();
  if (!q) return undefined;

  for (const [code, pattern] of LOCALIZED_LANGUAGE_REQUESTS) {
    if (pattern.test(q)) return code;
  }

  for (const language of LANGUAGES) {
    const names = [language.english.toLocaleLowerCase(), language.native.toLocaleLowerCase()];
    for (const name of names) {
      if (
        new RegExp(`(?:\\bin|\\binto|\\busing|\\banswer|\\bwrite|\\bspeak)\\s+${escapeRegExp(name)}(?:\\s+(?:language|mein|में|में जवाब|में उत्तर))?`, "iu").test(q) ||
        q.includes(`${name} में`) ||
        q.includes(`${name} mein`)
      ) {
        return language.code;
      }
    }
  }
  return undefined;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Language a text answer should be SPOKEN in, given what was asked for. */
export function spokenLangFor(answerText: string, requested: AnswerLang): AnswerLang {
  const detected = detectLangFromText(answerText, requested);
  // A single stray glyph (a bullet, a currency mark) should not switch voices.
  const detectedChars = countScriptChars(answerText, detected);
  const requestedChars = countScriptChars(answerText, requested);
  if (languageOf(requested).script && detectedChars < requestedChars) return requested;
  return detected;
}

function countScriptChars(text: string, code: AnswerLang): number {
  const s = languageOf(code).script;
  if (!s) return 0;
  let n = 0;
  for (const ch of text) {
    const cp = ch.codePointAt(0);
    if (cp !== undefined && cp >= s.from && cp <= s.to) n++;
  }
  return n;
}

/** Short, non-secret list for /api/ai/status and the language picker. */
export function describeLanguages() {
  return LANGUAGES.map((l) => ({
    code: l.code,
    bcp47: l.bcp47,
    name: l.native,
    english: l.english,
    rule_fallback: hasRuleText(l.code),
    ui_translated: l.uiTranslated,
  }));
}

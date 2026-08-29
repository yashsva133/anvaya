import assert from "node:assert/strict";
import test from "node:test";

// Node 22 strips the type-only syntax in the small, dependency-free AI helpers.
// The test loader transpiles the same trust-boundary modules used by Next so
// these checks exercise sanitization/anonymization rather than a copy of it.
const { detectConversation } = await import("../src/lib/ai/conversation.ts");
const { GoogleCloudTranslator, protectTokens } = await import("../src/lib/ai/translate.ts");
const { requestedLanguageFromQuestion, toAnswerLang, ANSWER_LANGS } = await import("../src/lib/ai/languages.ts");
const { askAgent, resetSessions } = await import("../src/lib/ai/agent.ts");
const { safetyFooter, safeRedirect, STANDARD_SAFETY_FOOTER } = await import("../src/lib/ai/translations.ts");
const { parseCsvToReportData } = await import("../src/lib/reportCsv.ts");
const { loadAiEnv, describeConfig } = await import("../src/lib/ai/env.ts");
const { guardInput } = await import("../src/lib/ai/guardrails.ts");
const { parseClientReport, computeStatusForRange } = await import("../src/lib/ai/clientReport.ts");
const { buildAnonymisedPayload } = await import("../src/lib/ai/anonymizer.ts");
const { detectTestInQuestion, composeExplanation } = await import("../src/lib/ai/explain.ts");
const { composeMockAnswer } = await import("../src/lib/ai/mock.ts");

test("explicit language requests win over the UI language", () => {
  assert.equal(requestedLanguageFromQuestion("Explain my report in Tamil"), "ta");
  assert.equal(requestedLanguageFromQuestion("हिन्दी में समझाइए"), "hi");
  assert.equal(requestedLanguageFromQuestion("please answer in Urdu"), "ur");
  assert.equal(requestedLanguageFromQuestion("my Urdu report"), undefined);
  assert.equal(toAnswerLang("ta-IN"), "ta");
  assert.equal(toAnswerLang("not-a-language", "bn"), "bn");
});

test("short greetings stay conversational", () => {
  assert.equal(detectConversation("hi"), "greeting");
  assert.equal(detectConversation("வணக்கம்"), "greeting");
  assert.equal(detectConversation("hello, why is my hemoglobin low?"), null);
});

test("protected medical values and labels round-trip unchanged", () => {
  const original = "Hemoglobin is 11.1 g/dL; printed range 12–16 g/dL.";
  const protectedText = protectTokens(original, ["Hemoglobin", "11.1", "g/dL", "12–16"]);
  assert.notEqual(protectedText.masked, original);
  const translated = `हीमोग्लोबिन: ${protectedText.markers.join(" ")}।`;
  const restored = protectedText.restore(
    translated.replace(protectedText.markers.join(" "), protectedText.markers.join(" "))
  );
  assert.deepEqual(restored.missing, []);
  assert.match(restored.text, /Hemoglobin|11\.1|g\/dL|12–16/);
});

test("a provider that drops a protected marker is rejected", () => {
  const protectedText = protectTokens("HbA1c 7.2%", ["HbA1c", "7.2%"]);
  const restored = protectedText.restore("अनुवादित उत्तर");
  assert.equal(restored.missing.length, 2);
});

test("the translation key stays in the server-side request URL", async () => {
  const previousFetch = globalThis.fetch;
  let requestUrl = "";
  let requestBody = "";
  globalThis.fetch = async (input, init) => {
    requestUrl = String(input);
    requestBody = String(init?.body ?? "");
    return new Response(
      JSON.stringify({ data: { translations: [{ translatedText: "नमस्ते" }] } }),
      { status: 200, headers: { "content-type": "application/json" } }
    );
  };
  try {
    const translator = new GoogleCloudTranslator({
      provider: "google",
      apiKey: "server-only-secret",
      baseUrl: "https://translation.example.test/language/translate/v2",
      timeoutMs: 2_000,
      maxChars: 12_000,
    });
    const result = await translator.translate({ text: "hello", source: "auto", target: "hi" });
    assert.equal(result.text, "नमस्ते");
    assert.match(requestUrl, /key=server-only-secret/);
    assert.doesNotMatch(requestBody, /server-only-secret/);
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test("report metadata is sanitized and invalid ranges become unassessed", () => {
  const report = parseClientReport({
    reportId: "not-a-uuid/report",
    dateLabel: "  22\n Aug\u0000 2026  ",
    age: "999",
    gender: "female",
    results: [
      {
        test: "report_ferritin",
        value: "9.5",
        label: " Ferritin\u0000 serum ",
        unit: " ng/mL ",
        reference: { low: "20", high: "10", text: "20–10 ng/mL" },
      },
      {
        test: "report_vitamin_d",
        value: 18,
        label: "Vitamin D",
        unit: "ng/mL",
        reference: { high: "30", text: "below 30 ng/mL" },
      },
      { test: "report_ferritin", value: 8, label: "duplicate" },
      { test: "not a safe id", value: 10 },
    ],
  });

  assert.ok(report);
  assert.equal(report.reportId, undefined);
  assert.equal(report.dateLabel, "22 Aug 2026");
  assert.equal(report.ageBand, undefined);
  assert.equal(report.sex, "female");
  assert.equal(report.results.length, 2);
  assert.deepEqual(report.results[0].reference, { text: "20–10 ng/mL" });
  assert.deepEqual(report.results[1].reference, { high: 30, text: "below 30 ng/mL" });
  assert.equal(computeStatusForRange(9.5, undefined, undefined), "normal");
  assert.equal(computeStatusForRange(28, undefined, 30), "borderline");
  assert.equal(computeStatusForRange(11, 10, undefined), "borderline");
  assert.equal(computeStatusForRange(7, 10, 5), "normal");

  const payload = buildAnonymisedPayload({ lang: "en", report });
  assert.equal(payload.results[0].status_known, false);
  assert.equal(payload.results[0].ref_text, "20–10 ng/mL");
  assert.equal(payload.results[1].status_known, true);
  assert.equal(payload.results[1].ref_high, 30);
  assert.equal(payload.age_band, "unspecified");
  assert.equal(payload.sex, "female");
});

test("unknown-only and mixed report contexts never claim an unassessed value is normal", () => {
  const report = parseClientReport({
    dateLabel: "22 Aug 2026",
    results: [
      {
        test: "report_custom_marker",
        value: 4.2,
        label: "Custom marker",
        unit: "U/L",
        reference: { text: "Not supplied" },
      },
      {
        test: "hemoglobin",
        value: 11.1,
        reference: { low: 12, high: 16, text: "12–16 g/dL" },
      },
    ],
  });
  assert.ok(report);
  const payload = buildAnonymisedPayload({ lang: "en", report });
  const unknown = payload.results.find((result) => result.test === "report_custom_marker");
  assert.ok(unknown);
  assert.equal(unknown.status_known, false);
  assert.equal(unknown.status, "normal");

  const unknownOnly = buildAnonymisedPayload({
    lang: "en",
    report: { ...report, results: [report.results[0]] },
  });
  const unknownText = composeMockAnswer({
    payload: unknownOnly,
    matches: [],
    patterns: [],
    question: "What does this result mean?",
    lang: "ta",
  });
  assert.match(unknownText, /reference range|குறிப்பு வரம்பு/);
  assert.match(unknownText, /4\.2/);
  assert.doesNotMatch(unknownText, /within its printed range/);

  const mixedText = composeMockAnswer({
    payload,
    matches: [
      { id: "guide#report_custom_marker-note", source_code: "test", source_title: "Test", publisher: "Test", url: "https://example.test", heading: "Test", content: "", score: 0, rank: 1, matched_on: "keyword" },
      { id: "guide#hemoglobin-note", source_code: "test", source_title: "Test", publisher: "Test", url: "https://example.test", heading: "Test", content: "", score: 0, rank: 1, matched_on: "keyword" },
    ],
    patterns: [],
    question: "Explain my results",
    lang: "ta",
  });
  assert.match(mixedText, /4\.2/);
  assert.match(mixedText, /11\.1/);
  assert.match(mixedText, /12–16/);
  assert.match(mixedText, /குறிப்பு வரம்பு/);
});

test("every supported mock answer language has an unassessed result phrase", () => {
  const report = parseClientReport({
    dateLabel: "22 Aug 2026",
    results: [{ test: "report_custom", value: 3.1, label: "Custom test", unit: "U/L" }],
  });
  assert.ok(report);
  const payload = buildAnonymisedPayload({ lang: "en", report });
  for (const lang of ANSWER_LANGS) {
    const text = composeMockAnswer({ payload, matches: [], patterns: [], question: "Explain this", lang });
    assert.match(text, /3\.1/);
    assert.ok(text.length > 40, `mock answer for ${lang} was unexpectedly short`);
  }
});

test("localized request forms and ordinary conversation stay on their intended paths", () => {
  assert.equal(requestedLanguageFromQuestion("தமிழில் பதில் சொல்லுங்கள்"), "ta");
  assert.equal(requestedLanguageFromQuestion("తెలుగులో సమాధానం చెప్పండి"), "te");
  assert.equal(requestedLanguageFromQuestion("मराठीत उत्तर द्या"), "mr");
  assert.equal(requestedLanguageFromQuestion("ગુજરાતીમાં જવાબ આપો"), "gu");
  assert.equal(requestedLanguageFromQuestion("ಕನ್ನಡದಲ್ಲಿ ಉತ್ತರಿಸಿ"), "kn");
  assert.equal(requestedLanguageFromQuestion("বাংলায় উত্তর দিন"), "bn");
  assert.equal(requestedLanguageFromQuestion("नेपालीमा जवाफ दिनुहोस्"), "ne");
  assert.equal(detectConversation("how are you?"), "greeting");
  assert.equal(detectConversation("can you help me"), "capability");
  assert.equal(detectConversation("how are you, and why is my hemoglobin low?"), null);
  assert.equal(guardInput("எனக்கு என்ன நோய்?", "ta", "ta").reason, "diagnosis");
  assert.equal(guardInput("மருந்து எவ்வளவு எடுத்துக்கொள்ள வேண்டும்?", "ta", "ta").reason, "dosing");
});

test("structured CSV uploads preserve values and do not trust a status column", () => {
  const parsed = parseCsvToReportData(
    '\ufeffreport_date,test_name,value,unit,ref_low,ref_high,ref_text,status\r\n' +
      '2026-08-28,"LDL, direct",154,mg/dL,0,100,"0-100 mg/dL",normal\r\n' +
      '2026-08-28,Custom marker,4.2,U/L,,,"Not supplied",high\r\n'
  );
  assert.ok(parsed);
  assert.equal(parsed.chart_data.length, 2);
  assert.equal(parsed.chart_data[0].parameter, "LDL, direct");
  assert.equal(parsed.chart_data[0].value, 154);
  assert.equal(parsed.chart_data[0].normal_min, 0);
  assert.equal(parsed.chart_data[0].normal_max, 100);
  assert.equal(parsed.chart_data[0].status, "high");
  assert.equal(parsed.chart_data[1].status, undefined);
  assert.match(parsed.patient_summary, /outside/);
  assert.match(parsed.patient_summary, /no reported range/);
  assert.match(parsed.audio_script, /lab report has been read/);
  assert.equal(parseCsvToReportData("test_name,value\nnot-a-number,nope"), null);
});

function testEnv(provider = "mock", translation = "none") {
  return {
    ai: {
      provider,
      baseUrl: provider === "mock" ? "" : "https://model.example.test",
      model: "medgemma-test",
      temperature: 0.2,
      maxTokens: 256,
      timeoutMs: 2_000,
      topK: 3,
      minScore: 0,
      trustFormula: "0.6*model + 0.4*retrieval",
      rulesFirst: false,
    },
    translation: {
      provider: translation,
      apiKey: translation === "google" ? "server-only-test-key" : undefined,
      baseUrl: "https://translation.example.test/language/translate/v2",
      timeoutMs: 2_000,
      maxChars: 12_000,
    },
    db: {},
    live: provider !== "mock" && provider !== "none",
    persistence: false,
  };
}

function testReport() {
  return parseClientReport({
    reportId: "not-a-real-user-id",
    dateLabel: "28 Aug 2026",
    results: [
      {
        test: "hemoglobin",
        value: 11.1,
        label: "Hemoglobin",
        unit: "g/dL",
        reference: { low: 12, high: 16, text: "12–16 g/dL" },
      },
    ],
  });
}

test("mock generation is labeled honestly and translated answers retain medical tokens", async () => {
  const previousFetch = globalThis.fetch;
  const requests = [];
  globalThis.fetch = async (input, init) => {
    const body = JSON.parse(String(init?.body ?? "{}"));
    requests.push({ input: String(input), body });
    if (body.target === "en") {
      return new Response(JSON.stringify({ data: { translations: [{ translatedText: "Explain my report" }] } }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    // A compatible gateway must preserve the server-generated markers. The
    // agent restores the values, unit, range and canonical safety footer.
    return new Response(
      JSON.stringify({ data: { translations: [{ translatedText: `தமிழ் பதில் ${body.q}` }] } }),
      { status: 200, headers: { "content-type": "application/json" } }
    );
  };
  try {
    resetSessions();
    const answer = await askAgent({
      question: "என் அறிக்கையை விளக்குங்கள்",
      lang: "en",
      answerLang: "ta",
      report: testReport(),
      env: testEnv("mock", "google"),
      sessionId: "test-mock-translation",
    });
    assert.equal(answer.answer_lang, "ta");
    assert.equal(answer.engine, "mock");
    assert.equal(answer.translation?.output_translated, true);
    assert.match(answer.answer, /11\.1/);
    assert.match(answer.answer, /g\/dL/);
    assert.match(answer.answer, /12–16/);
    assert.match(answer.answer, new RegExp(safetyFooter("ta")));
    assert.equal(answer.answer.includes(STANDARD_SAFETY_FOOTER), false);
    assert.ok(requests.length >= 2, "input and output translation should both be server-side calls");
  } finally {
    globalThis.fetch = previousFetch;
    resetSessions();
  }
});

test("translation failure uses a localized report fallback, not a refusal or foreign report", async () => {
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async (_input, init) => {
    const body = JSON.parse(String(init?.body ?? "{}"));
    if (body.target === "en") {
      return new Response(JSON.stringify({ data: { translations: [{ translatedText: "Explain my report" }] } }), {
        status: 200,
      });
    }
    // Drop every marker, including the protected safety footer, on purpose.
    return new Response(JSON.stringify({ data: { translations: [{ translatedText: "अनुवाद विफल" }] } }), {
      status: 200,
    });
  };
  try {
    resetSessions();
    const answer = await askAgent({
      question: "What is in my report?",
      lang: "en",
      answerLang: "hi",
      report: testReport(),
      env: testEnv("mock", "google"),
      sessionId: "test-translation-failure",
    });
    assert.equal(answer.answer_lang, "hi");
    assert.equal(answer.engine, "fallback");
    assert.match(answer.answer, /11\.1/);
    assert.ok(
      answer.guard.safety_flags.includes("fallback:multilingual_report_summary:protected_token_loss")
    );
    assert.doesNotMatch(answer.answer, /अनुवाद विफल/);
  } finally {
    globalThis.fetch = previousFetch;
    resetSessions();
  }
});

test("a model refusal remains a localized safe redirect when output translation is unavailable", async () => {
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response(JSON.stringify({ message: { content: "I cannot answer that request." } }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  try {
    resetSessions();
    const answer = await askAgent({
      question: "Explain my report",
      lang: "en",
      answerLang: "hi",
      report: testReport(),
      env: testEnv("ollama", "none"),
      sessionId: "test-refusal",
    });
    assert.equal(answer.answer_lang, "hi");
    assert.equal(answer.engine, "fallback");
    assert.equal(answer.guard.refusal_detected, true);
    assert.match(answer.answer, /डॉक्टर/);
    assert.equal(answer.answer, safeRedirect("hi"));
    assert.doesNotMatch(answer.answer, /11\.1|12–16/);
  } finally {
    globalThis.fetch = previousFetch;
    resetSessions();
  }
});

test("mock mode is demo provenance and rules answers do not inherit model metadata", () => {
  const keys = ["AI_PROVIDER", "AI_BASE_URL", "AI_MODEL", "MEDGEMMA_MODEL"];
  const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  try {
    process.env.AI_PROVIDER = "mock";
    delete process.env.AI_BASE_URL;
    process.env.AI_MODEL = "medgemma-test";
    delete process.env.MEDGEMMA_MODEL;
    const env = loadAiEnv();
    assert.equal(env.ai.provider, "mock");
    assert.equal(env.live, false);
    assert.equal(describeConfig(env).mode, "demo");
    assert.equal(describeConfig(env).provider, "mock");
  } finally {
    for (const key of keys) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
  }
});

test("translated safety violations are discarded after token restoration", async () => {
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async (_input, init) => {
    const body = JSON.parse(String(init?.body ?? "{}"));
    // Keep every protected marker and the target script present, but add a
    // diagnosis claim around them. The second safety screen must reject it.
    return new Response(
      JSON.stringify({ data: { translations: [{ translatedText: `आप you have diabetes ${body.q}` }] } }),
      { status: 200 }
    );
  };
  try {
    resetSessions();
    const answer = await askAgent({
      question: "Explain my report",
      lang: "en",
      answerLang: "hi",
      report: testReport(),
      env: testEnv("mock", "google"),
      sessionId: "test-translated-safety",
    });
    assert.equal(answer.engine, "fallback");
    assert.ok(answer.guard.safety_flags.includes("fallback:multilingual_report_summary:translated_safety_violation"));
    assert.doesNotMatch(answer.answer, /you have diabetes/);
    assert.match(answer.answer, /11\.1/);
  } finally {
    globalThis.fetch = previousFetch;
    resetSessions();
  }
});

test("a non-English no-report turn is screened without adding report context", async () => {
  const previousFetch = globalThis.fetch;
  const requests = [];
  globalThis.fetch = async (input, init) => {
    const body = JSON.parse(String(init?.body ?? "{}"));
    requests.push({ input: String(input), body });
    return new Response(
      JSON.stringify({ data: { translations: [{ translatedText: "Explain my report" }] } }),
      { status: 200 }
    );
  };
  try {
    resetSessions();
    const answer = await askAgent({
      question: "என் அறிக்கையை விளக்குங்கள்",
      lang: "en",
      answerLang: "ta",
      env: testEnv("none", "google"),
      sessionId: "test-no-report-translation",
    });
    assert.equal(answer.matched, "no_report");
    assert.equal(answer.answer_lang, "ta");
    assert.equal(answer.payload.results.length, 0);
    assert.equal(requests.length, 1);
    assert.doesNotMatch(JSON.stringify(requests[0].body), /11\.1|Hemoglobin/);
  } finally {
    globalThis.fetch = previousFetch;
    resetSessions();
  }
});

test("a named test resolves in Hindi transliteration and plain English", () => {
  assert.equal(detectTestInQuestion("एमसीवी क्या होता है?"), "mcv");
  assert.equal(detectTestInQuestion("what is mcv"), "mcv");
  assert.equal(detectTestInQuestion("एचबीए1सी का मतलब"), "hba1c");
  assert.equal(detectTestInQuestion("bad cholesterol"), "ldl");
  assert.equal(detectTestInQuestion("explain my report"), null);
});

test("a definitional question is answered from the catalogue even with no report", async () => {
  resetSessions();
  const answer = await askAgent({
    question: "एमसीवी क्या होता है?",
    lang: "en",
    answerLang: "hi",
    env: testEnv("none", "none"),
    sessionId: "test-definitional",
  });
  assert.equal(answer.matched, "test:mcv");
  assert.equal(answer.answer_lang, "hi");
  assert.equal(answer.engine, "rules");
  assert.match(answer.answer, /लाल रक्त कोशिका/);
  assert.match(answer.answer, /जीवनशैली/);
  assert.match(answer.answer, new RegExp(safetyFooter("hi")));
  assert.equal(answer.payload.results.length, 0);
});

test("a report question naming a test gets its value, range and lifestyle tips", async () => {
  resetSessions();
  const report = parseClientReport({
    dateLabel: "30 Jul 2026",
    results: [
      {
        test: "hemoglobin",
        value: 15,
        label: "Hemoglobin",
        unit: "g/dL",
        reference: { low: 12, high: 16, text: "12–16 g/dL" },
      },
    ],
  });
  const answer = await askAgent({
    question: "What is hemoglobin?",
    lang: "en",
    answerLang: "en",
    report,
    env: testEnv("none", "none"),
    sessionId: "test-test-explanation",
  });
  assert.equal(answer.matched, "test:hemoglobin");
  assert.match(answer.answer, /15 g\/dL/);
  assert.match(answer.answer, /12–16/);
  assert.match(answer.answer, /Lifestyle & diet tips/);
  assert.match(answer.answer, /discuss these results with your doctor/);
});

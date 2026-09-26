/**
 * Agent B — Semantic Inspector & Pre-Flight Offloader — Regression Tests
 * (Mandat Pelaksanaan 2026-09-26, Fasa 1 & 2 + Mandat Unthrottle)
 *
 * Kontrak yang diuji (parit laporan audit diluluskan):
 *   1. parseInspectorResponse: JSON sah / rosak / berpagar markdown / chatter
 *   2. buildInspectionPayload: blok <en>/<ms> padat, ID global, cap baris
 *   3. Fail-open: panggilan API tergendala → { valid: true, failOpen: true }
 *   4. Circuit breaker: 3 kegagalan berturut → silent mode (tiada panggilan)
 *   5. Payload GLM UNTHROTTLED: reasoning_effort 'low', max_tokens 4096,
 *      timeout berfasa 45s (semakan) / 180s (Fasa 0 — headroom 250k aksara)
 *   6. Integriti enjin apabila agentB = null → 100% laluan Gemini asal
 *   7. Gerbang semantik enjin: valid:false → SATU retry + amaran jenayah;
 *      failOpen → tiada retry; hasil struktur bercacat → tiada semakan
 *   8. Normalisasi config agentB (env fallback + hygiene enabled)
 *   9. Ketahanan pengekstrakan jawapan (Mandat Unthrottle §C): content →
 *      reasoning_content → stringify fallback
 */

const test = require('node:test');
const assert = require('node:assert/strict');

// Stub dependencies sebelum require supaya modul dimuat tanpa Redis/env
process.env.ENTRY_CACHE_SIZE = '100';

const {
  AgentBInspector,
  buildInspectionPayload,
  parseInspectorResponse,
  AGENT_B_PREFLIGHT_TIMEOUT_MS,
  AGENT_B_INSPECTION_TIMEOUT_MS,
  AGENT_B_MAX_OUTPUT_TOKENS,
  AGENT_B_CIRCUIT_THRESHOLD
} = require('./agentBInspector');
const OpenAICompatibleProvider = require('./providers/openaiCompatible');

// Helper: jana entries dummy
function makeEntries(count, textFn) {
  return Array.from({ length: count }, (_, i) => ({
    id: i + 1,
    timecode: `00:00:${String(i % 60).padStart(2, '0')},000 --> 00:00:${String((i + 1) % 60).padStart(2, '0')},000`,
    text: typeof textFn === 'function' ? textFn(i) : `Dialogue line ${i + 1}`
  }));
}

function makeTranslated(count, textFn) {
  return Array.from({ length: count }, (_, i) => ({
    index: i,
    text: typeof textFn === 'function' ? textFn(i) : `Baris dialog ${i + 1}`
  }));
}

// ── 1. parseInspectorResponse ──

test('AgentB: parseInspectorResponse accepts valid:true JSON verbatim', () => {
  const verdict = parseInspectorResponse('{"valid":true}');
  assert.deepEqual(verdict, { valid: true });
});

test('AgentB: parseInspectorResponse parses crimes with type/ids/note', () => {
  const response = JSON.stringify({
    valid: false,
    crimes: [
      { type: 'MERGE', ids: [48, 49], note: 'two lines fused' },
      { type: 'PHANTOM', ids: [50], note: 'invented filler' }
    ]
  });
  const verdict = parseInspectorResponse(response);
  assert.equal(verdict.valid, false);
  assert.equal(verdict.crimes.length, 2);
  assert.equal(verdict.crimes[0].type, 'MERGE');
  assert.deepEqual(verdict.crimes[0].ids, [48, 49]);
  assert.equal(verdict.crimes[1].type, 'PHANTOM');
});

test('AgentB: parseInspectorResponse strips markdown fences and chatter', () => {
  const fenced = '```json\n{"valid":true}\n```';
  assert.deepEqual(parseInspectorResponse(fenced), { valid: true });

  const chatty = 'Here is my verdict:\n{"valid":true}\nHope this helps!';
  assert.deepEqual(parseInspectorResponse(chatty), { valid: true });
});

test('AgentB: parseInspectorResponse returns null on unparseable garbage', () => {
  assert.equal(parseInspectorResponse(''), null);
  assert.equal(parseInspectorResponse(null), null);
  assert.equal(parseInspectorResponse('totally not json at all'), null);
  assert.equal(parseInspectorResponse('{broken json'), null);
  assert.equal(parseInspectorResponse('{"noValidField":1}'), null);
});

test('AgentB: parseInspectorResponse sanitizes crime fields defensively', () => {
  const response = JSON.stringify({
    valid: false,
    crimes: [
      { type: 'merge', ids: ['12', 'x', 13], note: 'note'.repeat(100) }, // lowercase type + junk ids + long note
      { type: 'INVALID_TYPE', ids: [1], note: 'x' },                      // jenis tidak sah → dibuang
      { type: 'DROP', ids: [], note: '' }                                 // tiada id → masih diterima tapi tidak berbahaya
    ]
  });
  const verdict = parseInspectorResponse(response);
  assert.equal(verdict.valid, false);
  // merge (lowercase) dinormalisasi; ids 'x' dibuang; nota di-cap 120
  const merge = verdict.crimes.find(c => c.type === 'MERGE');
  assert.ok(merge, 'lowercase type must normalize to MERGE');
  assert.deepEqual(merge.ids, [12, 13]);
  assert.ok(merge.note.length <= 120, 'note must be capped');
  assert.equal(verdict.crimes.some(c => c.type === 'INVALID_TYPE'), false, 'invalid crime type dropped');
});

test('AgentB: parseInspectorResponse valid:false tanpa crimes boleh diperbetulkan → valid:true', () => {
  const verdict = parseInspectorResponse('{"valid":false}');
  assert.deepEqual(verdict, { valid: true }, 'no salvageable crimes → treat as valid');
});

// ── 2. buildInspectionPayload ──

test('AgentB: buildInspectionPayload builds compact parallel <en>/<ms> blocks with global ids', () => {
  const source = makeEntries(3, (i) => `Hello ${i}`);
  const translated = makeTranslated(3, (i) => `Hai ${i}`);
  const payload = buildInspectionPayload(source, translated);
  assert.ok(payload, 'payload must be built');
  assert.ok(payload.prompt.includes('<en>'), 'must contain <en> block');
  assert.ok(payload.prompt.includes('<ms>'), 'must contain <ms> block');
  assert.ok(payload.prompt.includes('1|Hello 0'), 'source line id|text format');
  assert.ok(payload.prompt.includes('1|Hai 0'), 'translated line id|text format');
  assert.ok(payload.prompt.includes('MERGE'), 'instruction must list MERGE');
  assert.ok(payload.prompt.includes('DROP'), 'instruction must list DROP');
  assert.ok(payload.prompt.includes('PHANTOM'), 'instruction must list PHANTOM');
  assert.ok(payload.prompt.includes('"valid":true'), 'JSON contract must be present');
});

test('AgentB: buildInspectionPayload clamps long lines and rejects empty input', () => {
  const source = makeEntries(1, () => 'A'.repeat(500));
  const translated = makeTranslated(1, () => 'B');
  const payload = buildInspectionPayload(source, translated);
  const longLine = payload.prompt.split('\n').find(l => l.startsWith('1|A'));
  assert.ok(longLine.length <= 202, 'lines must be clamped to ~200 chars + prefix');

  assert.equal(buildInspectionPayload([], []), null);
  assert.equal(buildInspectionPayload(null, null), null);
});

// ── 3. Fail-open + 4. Circuit breaker ──

test('AgentB: runSemanticInspection fails open on API error and counts toward circuit breaker', async () => {
  const inspector = new AgentBInspector({
    apiKey: 'test-key',
    baseUrl: 'https://agentb.example.com/v1'
  });
  // Paksa kegagalan rangkaian: translateSubtitle di-override supaya throw
  inspector.translateSubtitle = async () => { throw new Error('network timeout'); };

  const source = makeEntries(2);
  const translated = makeTranslated(2);

  const v1 = await inspector.runSemanticInspection(source, translated);
  assert.equal(v1.valid, true, 'must fail open');
  assert.equal(v1.failOpen, true, 'must be flagged fail-open');
  assert.equal(inspector.circuitOpen, false, '1 failure — circuit still closed');

  await inspector.runSemanticInspection(source, translated);
  assert.equal(inspector.circuitOpen, false, '2 failures — circuit still closed');

  await inspector.runSemanticInspection(source, translated);
  assert.equal(inspector.circuitOpen, true, `3 failures (threshold ${AGENT_B_CIRCUIT_THRESHOLD}) — circuit OPEN`);

  // Litar terbuka → panggilan seterusnya senyap tanpa menyentuh rangkaian
  let called = false;
  inspector.translateSubtitle = async () => { called = true; return '{"valid":false}'; };
  const v4 = await inspector.runSemanticInspection(source, translated);
  assert.equal(v4.valid, true, 'silent mode returns valid');
  assert.equal(v4.skipped, 'circuit_open');
  assert.equal(called, false, 'no network call while circuit open');

  // Reset membuka sesi baharu
  inspector.resetCircuitBreaker();
  assert.equal(inspector.circuitOpen, false);
});

test('AgentB: runSemanticInspection fails open on unparseable response', async () => {
  const inspector = new AgentBInspector({
    apiKey: 'test-key',
    baseUrl: 'https://agentb.example.com/v1'
  });
  inspector.translateSubtitle = async () => 'garbage response <>.';

  const verdict = await inspector.runSemanticInspection(makeEntries(2), makeTranslated(2));
  assert.equal(verdict.valid, true, 'unparseable → fail open');
  assert.equal(verdict.failOpen, true);
});

test('AgentB: runSemanticInspection returns crimes verdict on valid:false response', async () => {
  const inspector = new AgentBInspector({
    apiKey: 'test-key',
    baseUrl: 'https://agentb.example.com/v1'
  });
  inspector.translateSubtitle = async () =>
    JSON.stringify({ valid: false, crimes: [{ type: 'MERGE', ids: [48, 49], note: 'fused' }] });

  const verdict = await inspector.runSemanticInspection(makeEntries(2), makeTranslated(2));
  assert.equal(verdict.valid, false);
  assert.equal(verdict.crimes[0].type, 'MERGE');
});

test('AgentB: kejayaan reset kaunter kegagalan berturut-turut', async () => {
  const inspector = new AgentBInspector({
    apiKey: 'test-key',
    baseUrl: 'https://agentb.example.com/v1'
  });
  inspector.translateSubtitle = async () => { throw new Error('boom'); };
  await inspector.runSemanticInspection(makeEntries(1), makeTranslated(1)); // failure 1
  await inspector.runSemanticInspection(makeEntries(1), makeTranslated(1)); // failure 2

  inspector.translateSubtitle = async () => '{"valid":true}';
  await inspector.runSemanticInspection(makeEntries(1), makeTranslated(1)); // success → reset

  inspector.translateSubtitle = async () => { throw new Error('boom'); };
  await inspector.runSemanticInspection(makeEntries(1), makeTranslated(1)); // failure 1 semula
  assert.equal(inspector.circuitOpen, false, 'success reset the consecutive counter — circuit still closed');
});

// ── 5. Payload GLM (registry + override) — UNTHROTTLED ──

test('AgentB: GLM payload unthrottled — reasoning_effort low, max_tokens 4096, timeout berfasa 15s/45s', () => {
  const inspector = new AgentBInspector({
    apiKey: 'test-key',
    baseUrl: 'https://agentb.example.com/v1',
    model: 'glm-5.3-flashx'
  });

  assert.equal(inspector.model, 'glm-5.3-flashx');
  assert.equal(inspector.reasoningEffort, 'low', 'glm-5.3-flashx needs reasoning_effort low (thinking always-on)');
  assert.equal(inspector.maxRetries, 0, 'fail fast — no provider-level retries');
  assert.equal(inspector.translationTimeout, AGENT_B_INSPECTION_TIMEOUT_MS, 'inspection timeout 45s');
  assert.equal(inspector.translationTimeout, 45000);
  assert.equal(AGENT_B_INSPECTION_TIMEOUT_MS, 45000, 'semakan batch: 45s (mandat headroom 2026-09-26)');
  assert.equal(AGENT_B_PREFLIGHT_TIMEOUT_MS, 180000, 'Fasa 0: 180s (mandat headroom — 250k aksara)');

  // Siling token dibuka: 4096 (bukan 256 zero-yap lama)
  assert.equal(inspector.getCappedMaxOutputTokens(), AGENT_B_MAX_OUTPUT_TOKENS);
  assert.equal(AGENT_B_MAX_OUTPUT_TOKENS, 4096, 'max_tokens 4096 — ruang reasoning + content');

  // buildChatRequest: body mesti membawa reasoning_effort low + max_tokens 4096
  const { body } = inspector.buildChatRequest('inspector prompt', false, {});
  assert.equal(body.reasoning_effort, 'low', 'registry GLM 5.3 must map effort to low');
  assert.equal(body.max_tokens, 4096, 'max_tokens must honor unthrottled budget');
  assert.equal(body.stream, false);
  assert.ok(Array.isArray(body.messages) && body.messages.length === 1, 'single user message');
});

test('AgentB: runPreflightPass menaikkan timeout kepada 180s dan memulihkannya selepas Fasa 0', async () => {
  const inspector = new AgentBInspector({
    apiKey: 'test-key',
    baseUrl: 'https://agentb.example.com/v1'
  });

  // Fail kecil (< PREFLIGHT_MIN_ENTRIES) → skip cepat; laluan tetap melalui
  // kitaran naik/pulih timeout dalam runPreflightPass.
  assert.equal(inspector.translationTimeout, 45000, 'baseline 45s sebelum Fasa 0');
  await inspector.runPreflightPass(makeEntries(3), 'Malay', 'English');
  assert.equal(inspector.translationTimeout, 45000, 'timeout dipulihkan selepas skip path');

  // Verifikasi kitaran penuh dengan fail besar (panggilan API di-override)
  let observedTimeout = null;
  inspector.translateSubtitle = async () => {
    observedTimeout = inspector.translationTimeout;
    return JSON.stringify({ theme: 'Theme.', terms: [] });
  };
  const result = await inspector.runPreflightPass(makeEntries(50), 'Malay', 'English');
  assert.ok(result, 'preflight context returned');
  assert.equal(observedTimeout, 180000, 'Fasa 0 mesti berjalan pada 180s (headroom 250k aksara)');
  assert.equal(inspector.translationTimeout, 45000, 'pulih kepada 45s selepas Fasa 0');
});

test('AgentB: runPreflightPass memulihkan timeout walaupun panggilan API gagal', async () => {
  const inspector = new AgentBInspector({
    apiKey: 'test-key',
    baseUrl: 'https://agentb.example.com/v1'
  });
  inspector.translateSubtitle = async () => { throw new Error('boom'); };

  const result = await inspector.runPreflightPass(makeEntries(50), 'Malay', 'English');
  assert.equal(result, null, 'kegagalan Fasa 0 → null (non-blocking, kontrak asal)');
  assert.equal(inspector.translationTimeout, 45000, 'finally block sentiasa memulihkan 45s');
});

test('AgentB: buildUserPrompt override menghantar prompt inspector verbatim', () => {
  const inspector = new AgentBInspector({
    apiKey: 'test-key',
    baseUrl: 'https://agentb.example.com/v1'
  });
  const inspectorPrompt = 'INSPECT INSTRUCTION <en>...</en> <ms>...</ms>';
  const promptData = inspector.buildUserPrompt('ignored-content', 'en', inspectorPrompt);
  assert.equal(promptData.userPrompt, inspectorPrompt, 'inspector prompt delivered verbatim');
  assert.equal(promptData.isSelfContained, true);
});

// ── 6. Integriti enjin apabila agentB = null ──

test('AgentB: engine dengan agentB=null kekal 100% Gemini — tiada panggilan inspector, stats sifar', async () => {
  const TranslationEngine = require('./translationEngine');

  const geminiCalls = [];
  const dummyGemini = {
    translateSubtitle: async (content) => {
      geminiCalls.push({ content });
      // Respons penuh 50/50 — laluan pariti sempurna
      return Array.from({ length: 50 }, (_, i) => `<s id="${i + 1}">Terjemahan ${i + 1}</s>`).join('\n');
    },
    streamTranslateSubtitle: async () => '',
    estimateTokenCount: () => 10
  };

  const engine = new TranslationEngine(dummyGemini, 'gemini-2.5-flash', {}, {
    providerName: 'gemini',
    agentB: null // ← DUAL-AI off
  });

  assert.equal(engine.agentB, null);
  assert.equal(engine.translationStats.agentBUsed, false);
  assert.equal(engine.translationStats.agentBFailures, 0);
  assert.equal(engine.translationStats.agentBInspections, 0);
  assert.equal(engine.translationStats.agentBRetries, 0);

  // Batch 3 entri kecil (< PREFLIGHT_MIN_ENTRIES) — Fasa 0 skip, terus batch.
  // Semak gate: tiada panggilan tambahan selepas 3 panggilan penterjemahan.
  const batch = makeEntries(3);
  const result = await engine.translateBatch(batch, 'Malay', null, 0, 1, null, { streaming: false });
  assert.equal(result.length, 3);
  assert.equal(geminiCalls.length, 1, 'only ONE provider call — no inspector call when agentB is null');
  assert.equal(engine.translationStats.agentBFailures, 0);
  assert.equal(engine.translationStats.agentBInspections, 0);
  assert.equal(engine.translationStats.agentBRetries, 0);
});

// ── 7. Gerbang semantik enjin ──

test('AgentB: gerbang enjin — valid:false mencetus SATU retry beramarah + re-verdict; hasil diganti jika lulus', async () => {
  const TranslationEngine = require('./translationEngine');

  // Kiraan panggilan: batch asal → inspector (crime) → retry → inspector (lulus)
  let workerCallCount = 0;
  let inspectorCallCount = 0;
  const verdicts = [
    { valid: false, crimes: [{ type: 'MERGE', ids: [1, 2], note: 'fused' }] }, // semakan pertama
    { valid: true }                                                              // re-verdict
  ];

  const dummyGemini = {
    translateSubtitle: async () => {
      workerCallCount++;
      return '<s id="1">Satu</s>\n<s id="2">Dua</s>\n<s id="3">Tiga</s>';
    },
    streamTranslateSubtitle: async () => '',
    estimateTokenCount: () => 10
  };

  const agentB = {
    circuitOpen: false,
    runPreflightPass: null, // tidak dipanggil dalam ujian ini
    runSemanticInspection: async () => {
      const v = verdicts[Math.min(inspectorCallCount, verdicts.length - 1)];
      inspectorCallCount++;
      return v;
    }
  };

  const engine = new TranslationEngine(dummyGemini, 'gemini-2.5-flash', {}, {
    providerName: 'gemini',
    agentB
  });

  const batch = makeEntries(3);
  const result = await engine.translateBatch(batch, 'Malay', null, 0, 1, null, { streaming: false });

  assert.equal(workerCallCount, 2, 'original + ONE semantic retry');
  assert.equal(inspectorCallCount, 2, 'initial inspection + single re-verdict');
  assert.equal(engine.translationStats.agentBRetries, 1);
  assert.equal(result.length, 3);

  const incident = engine.translationStats.incidents.find(i => i.type === 'AGENT_B_SEMANTIC_RETRY');
  assert.ok(incident, 'incident must be logged');
  assert.equal(incident.outcome, 'recovered', 'retry must close incident as recovered');
});

test('AgentB: gerbang enjin — failOpen tidak mencetus retry', async () => {
  const TranslationEngine = require('./translationEngine');

  let workerCallCount = 0;
  const dummyGemini = {
    translateSubtitle: async () => {
      workerCallCount++;
      return '<s id="1">Satu</s>\n<s id="2">Dua</s>';
    },
    streamTranslateSubtitle: async () => '',
    estimateTokenCount: () => 10
  };

  const agentB = {
    circuitOpen: false,
    runSemanticInspection: async () => ({ valid: true, failOpen: true })
  };

  const engine = new TranslationEngine(dummyGemini, 'gemini-2.5-flash', {}, {
    providerName: 'gemini',
    agentB
  });

  const batch = makeEntries(2);
  await engine.translateBatch(batch, 'Malay', null, 0, 1, null, { streaming: false });

  assert.equal(workerCallCount, 1, 'no retry on fail-open');
  assert.equal(engine.translationStats.agentBFailures, 1);
  assert.equal(engine.translationStats.agentBRetries, 0);
});

test('AgentB: gerbang enjin — hasil struktur bercacat (mismatch) melangkau semakan semantik', async () => {
  const TranslationEngine = require('./translationEngine');

  let inspectorCalled = false;
  const dummyGemini = {
    // Respons bercacat: hanya 1 daripada 2 entri — laluan mismatch aktif
    translateSubtitle: async () => '<s id="1">Satu</s>',
    streamTranslateSubtitle: async () => '',
    estimateTokenCount: () => 10
  };

  const agentB = {
    circuitOpen: false,
    runSemanticInspection: async () => {
      inspectorCalled = true;
      return { valid: true };
    }
  };

  const engine = new TranslationEngine(dummyGemini, 'gemini-2.5-flash', {}, {
    providerName: 'gemini',
    agentB
  });

  const batch = makeEntries(2);
  await engine.translateBatch(batch, 'Malay', null, 0, 1, null, { streaming: false });

  // Gate memerlukan translatedEntries.length === batch.length; hasil bercacat
  // (1/2 walaupun selepas retry mismatch gagal) → tiada semakan semantik.
  assert.equal(inspectorCalled, false, 'semantic gate skipped on structurally broken result');
  assert.equal(engine.translationStats.agentBRetries, 0);
});

test('AgentB: gerbang enjin — circuit breaker terbuka melangkau semakan', async () => {
  const TranslationEngine = require('./translationEngine');

  let inspectorCalled = false;
  const dummyGemini = {
    translateSubtitle: async () => '<s id="1">Satu</s>\n<s id="2">Dua</s>',
    streamTranslateSubtitle: async () => '',
    estimateTokenCount: () => 10
  };

  const agentB = {
    circuitOpen: true, // litar terbuka
    runSemanticInspection: async () => {
      inspectorCalled = true;
      return { valid: true };
    }
  };

  const engine = new TranslationEngine(dummyGemini, 'gemini-2.5-flash', {}, {
    providerName: 'gemini',
    agentB
  });

  const batch = makeEntries(2);
  await engine.translateBatch(batch, 'Malay', null, 0, 1, null, { streaming: false });
  assert.equal(inspectorCalled, false, 'no inspection while circuit breaker open');
});

// ── 8. Normalisasi config agentB ──

test('AgentB: normalizeConfig membina struktur agentB dengan env fallback + hygiene', async () => {
  const { normalizeConfig } = require('../utils/config');

  // Simpan + pulihkan env semasa ujian (elak kebocoran antara-ujian)
  const savedEnv = {
    AGENT_B_BASE_URL: process.env.AGENT_B_BASE_URL,
    AGENT_B_API_KEY: process.env.AGENT_B_API_KEY,
    AGENT_B_MODEL: process.env.AGENT_B_MODEL
  };
  try {
    // Kes 1: config sedia ada menang ke atas env
    process.env.AGENT_B_BASE_URL = 'https://env.example.com/v1';
    process.env.AGENT_B_API_KEY = 'env-key';
    process.env.AGENT_B_MODEL = 'env-model';

    const withConfig = normalizeConfig({
      agentB: { enabled: true, baseUrl: 'https://config.example.com/v1', apiKey: 'config-key', model: 'config-model' }
    });
    assert.equal(withConfig.agentB.baseUrl, 'https://config.example.com/v1');
    assert.equal(withConfig.agentB.apiKey, 'config-key');
    assert.equal(withConfig.agentB.model, 'config-model');
    assert.equal(withConfig.agentB.enabled, true);

    // Kes 2: config kosong → env fallback + auto-enable apabila env lengkap
    const fromEnv = normalizeConfig({});
    assert.equal(fromEnv.agentB.baseUrl, 'https://env.example.com/v1');
    assert.equal(fromEnv.agentB.apiKey, 'env-key');
    assert.equal(fromEnv.agentB.model, 'env-model');
    assert.equal(fromEnv.agentB.enabled, true, 'env lengkap → auto-enable (Fasa 3 belum wujud)');

    // Kes 3: tiada config + tiada env → disabled + default model
    delete process.env.AGENT_B_BASE_URL;
    delete process.env.AGENT_B_API_KEY;
    delete process.env.AGENT_B_MODEL;
    const disabled = normalizeConfig({});
    assert.equal(disabled.agentB.enabled, false);
    assert.equal(disabled.agentB.baseUrl, '');
    assert.equal(disabled.agentB.model, 'glm-5.3-flash', 'default model (CLEAN 2-MODEL)');

    // Kes 4: enabled:true tetapi kredensial tak lengkap → hygiene melumpuhkan
    const partial = normalizeConfig({
      agentB: { enabled: true, baseUrl: 'https://partial.example.com/v1' } // tiada apiKey
    });
    assert.equal(partial.agentB.enabled, false, 'incomplete credentials must disable Agent B');
  } finally {
    // Pulihkan env
    for (const [k, v] of Object.entries(savedEnv)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
});

// ── 9. Ketahanan pengekstrakan jawapan (Mandat Unthrottle §C) ──

test('AgentB: extractChatMessageText — laluan standard content diutamakan', () => {
  const provider = new OpenAICompatibleProvider({ apiKey: 'k', baseUrl: 'https://x.example/v1', providerName: 'custom' });
  assert.equal(
    provider.extractChatMessageText({ content: '{"valid":true}', reasoning_content: 'thinking noise' }),
    '{"valid":true}',
    'content mesti menang ke atas reasoning_content'
  );
  assert.equal(provider.extractChatMessageText({ content: 'plain text' }), 'plain text');
  assert.equal(provider.extractChatMessageText(null), '');
  assert.equal(provider.extractChatMessageText(undefined), '');
});

test('AgentB: extractChatMessageText — reasoning_content dipakai bila content kosong', () => {
  const provider = new OpenAICompatibleProvider({ apiKey: 'k', baseUrl: 'https://x.example/v1', providerName: 'custom' });

  // JSON terus dalam reasoning_content
  assert.equal(
    provider.extractChatMessageText({ content: '', reasoning_content: '{"valid":true}' }),
    '{"valid":true}'
  );

  // JSON berpagar markdown dalam reasoning_content
  const fenced = 'analysis...\n```json\n{"valid":true}\n```\nend';
  assert.equal(
    provider.extractChatMessageText({ content: '', reasoning_content: fenced }),
    '{"valid":true}'
  );

  // reasoning_content proza tanpa blok berstruktur → diguna mentah
  assert.equal(
    provider.extractChatMessageText({ content: '', reasoning_content: 'just prose, no braces' }),
    'just prose, no braces'
  );
});

test('AgentB: extractChatMessageText — fallback stringify mesej penuh bila kedua-dua medan kosong', () => {
  const provider = new OpenAICompatibleProvider({ apiKey: 'k', baseUrl: 'https://x.example/v1', providerName: 'custom' });

  // content bertindih dalam medan luar + braces dalam string mesti tidak pecahkan scanner
  const message = { role: 'assistant', content: '', note: '{"valid":false,"crimes":[{"type":"MERGE","ids":[1,2],"note":"x{y}z"}]}' };
  const extracted = provider.extractChatMessageText(message);
  assert.ok(extracted.includes('"valid":false'), 'blok JSON seimbang mesti diekstrak dari stringify');

  // Tiada blok langsung → ''
  assert.equal(provider.extractChatMessageText({ role: 'assistant', content: '' }), '');
});

test('AgentB: extractStructuredBlock — scanner JSON seimbang tahan braces dalam string', () => {
  const provider = new OpenAICompatibleProvider({ apiKey: 'k', baseUrl: 'https://x.example/v1', providerName: 'custom' });

  const balanced = 'prefix {"a":"has } brace","b":{"c":1}} suffix';
  assert.equal(provider.extractStructuredBlock(balanced), '{"a":"has } brace","b":{"c":1}}');

  // Bracket dalam prosa tanpa ':' → bukan JSON → ''
  assert.equal(provider.extractStructuredBlock('text with (parens) and [brackets] but no object'), '');

  // Fenced block dipilih dahulu
  const fenced = 'x ```json\n{"valid":true}\n``` y {"other":1}';
  assert.equal(provider.extractStructuredBlock(fenced), '{"valid":true}');

  // JSON tidak seimbang → ''
  assert.equal(provider.extractStructuredBlock('{"broken": true'), '');
});

// ── Kontrak preflight offload (Fasa 0) ──

test('AgentB: runPreflightPass mewarisi kontrak runPreflightSemanticPass (non-blocking)', async () => {
  const inspector = new AgentBInspector({
    apiKey: 'test-key',
    baseUrl: 'https://agentb.example.com/v1'
  });

  // Fail terlalu kecil (< 10 entri) → skip, return null — kontrak Fasa 0 asal
  const result = await inspector.runPreflightPass(makeEntries(3), 'Malay', 'English');
  assert.equal(result, null, 'small file must skip preflight (inherited contract)');

  // Guard provider: inspector sendiri memenuhi kontrak translateSubtitle
  assert.equal(typeof inspector.translateSubtitle, 'function');
});

// ── 10. Dual-model failover + zero-swallowed-error (Mandat Observabiliti 2026-09-26) ──

test('AgentB: failover automatik — glm gagal, deepseek-v4.1-flash menyelamatkan semakan', async () => {
  const inspector = new AgentBInspector({
    apiKey: 'test-key',
    baseUrl: 'https://agentb.example.com/v1'
  });
  assert.deepEqual(inspector.modelHierarchy, ['glm-5.3-flash', 'deepseek-v4.1-flash'], 'hierarki: primary + fallback (CLEAN 2-MODEL)');

  const calls = [];
  inspector.translateSubtitle = async function () {
    calls.push(this.model);
    if (this.model === 'glm-5.3-flash') {
      throw Object.assign(new Error('HTTP 502 Bad Gateway from upstream'), { statusCode: 502 });
    }
    return '{"valid":false,"crimes":[{"type":"MERGE","ids":[3,4],"note":"fused"}]}';
  };

  const verdict = await inspector.runSemanticInspection(makeEntries(4), makeTranslated(4), { batchIndex: 0, totalBatches: 2 });
  assert.deepEqual(calls, ['glm-5.3-flash', 'deepseek-v4.1-flash'], 'kedua-dua model dipanggil mengikut hierarki');
  assert.equal(verdict.valid, false, 'verdict dari model sandaran diterima');
  assert.equal(verdict.crimes[0].type, 'MERGE');
  assert.equal(verdict.modelUsed, 'deepseek-v4.1-flash', 'model sandaran direkodkan');
  assert.equal(inspector.model, 'glm-5.3-flash', 'model dipulihkan kepada primary selepas operasi');
  assert.equal(inspector.circuitOpen, false, 'kejayaan sandaran tidak membuka litar');
});

test('AgentB: failover Pre-Flight — primary 504, sandaran menghasilkan konteks Fasa 0', async () => {
  const inspector = new AgentBInspector({
    apiKey: 'test-key',
    baseUrl: 'https://agentb.example.com/v1'
  });
  const calls = [];
  inspector.translateSubtitle = async function () {
    calls.push(this.model);
    if (this.model === inspector.modelHierarchy[0]) {
      throw Object.assign(new Error('gateway timeout'), { statusCode: 504 });
    }
    return '{"theme":"Fallback analysis.","terms":[]}';
  };

  const result = await inspector.runPreflightPass(makeEntries(50), 'Malay', 'English');
  assert.ok(result, 'konteks dari model sandaran diterima');
  assert.equal(result.theme, 'Fallback analysis.');
  // CLEAN 2-MODEL: lalai utama glm-5.3-flash untuk KEDUA-DUA fasa
  assert.deepEqual(calls, ['glm-5.3-flash', 'deepseek-v4.1-flash']);
  assert.equal(inspector.model, 'glm-5.3-flash', 'model aktif dipulihkan kepada primary');
});

test('AgentB: kedua-dua model gagal (rangkaian) → fail-open both_models_failed + 1 kegagalan litar', async () => {
  const inspector = new AgentBInspector({
    apiKey: 'test-key',
    baseUrl: 'https://agentb.example.com/v1'
  });
  let calls = 0;
  inspector.translateSubtitle = async function () { calls++; throw new Error('connection reset by peer'); };

  const verdict = await inspector.runSemanticInspection(makeEntries(2), makeTranslated(2), { batchIndex: 0, totalBatches: 1 });
  assert.equal(calls, 2, 'primary + fallback kedua-duanya dicuba');
  assert.equal(verdict.valid, true, 'fail-open');
  assert.equal(verdict.failOpen, true);
  assert.equal(verdict.error, 'both_models_failed');
  assert.equal(verdict.detail, 'connection reset by peer', 'punca teknikal sebenar dibawa keluar');
  assert.equal(inspector._consecutiveFailures, 1, 'satu operasi gagal = satu kegagalan litar sahaja');
});

test('AgentB: kedua-dua model gagal parse (HTTP 200 sampah) → fail-open selepas raw snippet', async () => {
  const inspector = new AgentBInspector({
    apiKey: 'test-key',
    baseUrl: 'https://agentb.example.com/v1'
  });
  let calls = 0;
  inspector.translateSubtitle = async function () { calls++; return 'garbage not json'; };

  const verdict = await inspector.runSemanticInspection(makeEntries(2), makeTranslated(2));
  assert.equal(calls, 2, 'failover turut berlaku untuk respons rosak (bukan ralat rangkaian)');
  assert.equal(verdict.failOpen, true);
  assert.equal(verdict.error, 'both_models_failed');
});

test('AgentB: logging forensik — raw snippet 500 aksara + pengumuman failover pada WARN', async () => {
  const log = require('../utils/logger');
  const inspector = new AgentBInspector({
    apiKey: 'test-key',
    baseUrl: 'https://agentb.example.com/v1'
  });
  inspector.translateSubtitle = async () => 'G'.repeat(1200);

  const captured = [];
  const originalWarn = log.warn;
  log.warn = (fn) => {
    try { captured.push(typeof fn === 'function' ? String(fn()) : String(fn)); } catch (_) { /* noop */ }
  };
  try {
    const verdict = await inspector.runSemanticInspection(makeEntries(2), makeTranslated(2), { batchIndex: 0, totalBatches: 1 });
    assert.equal(verdict.failOpen, true);

    const snippetLog = captured.find(l => l.includes('Raw snippet'));
    assert.ok(snippetLog, 'raw snippet mesti dicetak pada WARN semasa parse failure');
    assert.ok(snippetLog.includes('G'.repeat(500)), 'snippet dipotong kepada tepat 500 aksara pertama');
    assert.ok(!snippetLog.includes('G'.repeat(501)), 'snippet TIDAK melebihi 500 aksara');

    const failoverLog = captured.find(l => l.includes('Failing over to deepseek-v4.1-flash'));
    assert.ok(failoverLog, 'pengumuman failover kepada model sandaran mesti dicetak');
  } finally {
    log.warn = originalWarn;
  }
});

// ── 11. Pembersihan tag penaakulan (Mandat §3A) ──
// Nota: tag GLM/DeepSeek dibina melalui fromCharCode + hexpair supaya
// literal Unicode tidak rosak oleh pipeline penghantaran (konvensyen projek
// — corak sama digunakan oleh subfaber-context-regression.test.js).

test('AgentB: stripReasoningTags membuang tag penaakulan (tertutup & terbuka)', () => {
  const { stripReasoningTags } = require('./subfaberPreflight');

  // Tag GLM sebenar: THINK = U+1F9E0 (🧠) — dibina dari pasangan UTF-16 surrogates
  const BRAIN = String.fromCharCode(0xD83E, 0xDDE0);          // U+1F9E0
  const THINK_OPEN = `${BRAIN}`;
  const THINK_CLOSE = `</think>`;

  // 1. Blok tertutup: THINK... </think> dibuang, jawapan JSON kekal
  assert.equal(stripReasoningTags(`${THINK_OPEN}chain of thought${THINK_CLOSE}{"valid":true}`), '{"valid":true}');

  // 2. Blok tidak ditutup (stream terpotong): semuanya selepas THINK dibuang
  assert.equal(stripReasoningTags(`${THINK_OPEN}truncated reasoning without close`), '');

  // 3. Berbilang blok + kandungan sah di luar blok
  assert.equal(
    stripReasoningTags(`${THINK_OPEN}a${THINK_CLOSE}pre ${THINK_OPEN}b${THINK_CLOSE}mid{"valid":true}`),
    'pre mid{"valid":true}'
  );

  // 4. <thinking> tertutup & tidak tertutup
  assert.equal(stripReasoningTags('<thinking>reasoning</thinking>{"valid":true}'), '{"valid":true}');
  assert.equal(stripReasoningTags('<thinking>truncated'), '');

  // 5. Tiada tag → kekal; input kosong/null selamat
  assert.equal(stripReasoningTags('{"valid":true}'), '{"valid":true}');
  assert.equal(stripReasoningTags(null), '');
  assert.equal(stripReasoningTags('   '), '');
});

test('AgentB: inspection membersihkan tag THINK sebelum parse — verdict bertahan', async () => {
  const inspector = new AgentBInspector({
    apiKey: 'test-key',
    baseUrl: 'https://agentb.example.com/v1'
  });
  const BRAIN = String.fromCharCode(0xD83E, 0xDDE0);
  inspector.translateSubtitle = async () =>
    `${BRAIN}I need to compare each line carefully... lines 1 and 2 look fine, no merge detected.</think>\n{"valid":true}`;

  const verdict = await inspector.runSemanticInspection(makeEntries(2), makeTranslated(2), { batchIndex: 0, totalBatches: 1 });
  assert.equal(verdict.valid, true);
  assert.equal(verdict.failOpen, undefined, 'parse berjaya — bukan fail-open');
  assert.equal(verdict.modelUsed, 'glm-5.3-flash', 'primary model cukup — tiada failover diperlukan');
});

test('SubFaberPreflight: pembersihan tag dilaksanakan sebelum parse (provider mentah)', async () => {
  const { runPreflightSemanticPass } = require('./subfaberPreflight');
  const BRAIN = String.fromCharCode(0xD83E, 0xDDE0);
  // Provider mentah yang TIDAK membersihkan THINK (corak bukan-openai) —
  // tanggungjawab pembersihan kini pada lapisan preflight sendiri.
  const rawProvider = {
    model: 'glm-5.3-flashx',
    translateSubtitle: async () => `${BRAIN}raw reasoning that would leak into a naive parser</think>{"theme":"Theme X.","terms":[]}`
  };
  const result = await runPreflightSemanticPass(makeEntries(50), 'Malay', 'English', rawProvider);
  assert.ok(result, 'tag THINK mesti dibersihkan sebelum parsePreflightResponse');
  assert.equal(result.theme, 'Theme X.');
});

test('SubFaberPreflight: hook onParseFailure menghantar teks mentah untuk forensik', async () => {
  const { runPreflightSemanticPass } = require('./subfaberPreflight');
  let hookRaw = null;
  const provider = {
    model: 'glm-5.3-flashx',
    translateSubtitle: async () => 'not-json-at-all {broken'
  };
  const result = await runPreflightSemanticPass(makeEntries(50), 'Malay', 'English', provider, {
    onParseFailure: (raw) => { hookRaw = raw; }
  });
  assert.equal(result, null, 'parse gagal → null (non-blocking dipelihara)');
  assert.equal(hookRaw, 'not-json-at-all {broken', 'hook menerima teks mentah yang sama dengan log forensik');
});

// ── 12. Meta batch dari gerbang enjin ──

test('AgentB: gerbang enjin menghantar meta {batchIndex, totalBatches} kepada inspector', async () => {
  const TranslationEngine = require('./translationEngine');
  let capturedMeta = null;
  const dummyGemini = {
    translateSubtitle: async () => '<s id="1">Satu</s>\n<s id="2">Dua</s>',
    streamTranslateSubtitle: async () => '',
    estimateTokenCount: () => 10
  };
  const agentB = {
    circuitOpen: false,
    runSemanticInspection: async (batch, translated, meta) => {
      capturedMeta = meta;
      return { valid: true };
    }
  };
  const engine = new TranslationEngine(dummyGemini, 'gemini-2.5-flash', {}, { providerName: 'gemini', agentB });
  await engine.translateBatch(makeEntries(2), 'Malay', null, 0, 1, null, { streaming: false });
  assert.ok(capturedMeta, 'meta mesti dihantar oleh gerbang enjin');
  assert.equal(capturedMeta.batchIndex, 0);
  assert.equal(capturedMeta.totalBatches, 1);
});

// ── 13. Resilient Pre-Flight JSON Parser (Mandat Pengerasan 2026-09-26 §1) ──
// Forensik Beta Run 3: respons 2101 aksara sah gagal parse akibat anomali
// sintaks biasa LLM — koma tergantung, fences, chatter, control chars.

test('AgentB: parsePreflightResponse selamat dari koma tergantung (trailing comma)', () => {
  const { parsePreflightResponse } = require('./subfaberPreflight');

  // Koma tergantung pada entri array terakhir "terms": [...,]
  const withArrayComma = '{"theme":"Heist drama.","terms":[{"src":"Boss","tgt":"Ketua","note":"n"},]}';
  const parsedArray = parsePreflightResponse(withArrayComma);
  assert.ok(parsedArray, 'koma tergantung dalam array mesti dibersihkan');
  assert.equal(parsedArray.theme, 'Heist drama.');
  assert.equal(parsedArray.terms.length, 1);

  // Koma tergantung pada object: {"theme": "...", }
  const withObjectComma = '{"theme":"T.", "terms":[],}';
  const parsedObject = parsePreflightResponse(withObjectComma);
  assert.ok(parsedObject, 'koma tergantung dalam object mesti dibersihkan');
  assert.equal(parsedObject.theme, 'T.');

  // Kedua-dua serentak + berbilang tahap
  const both = '{"theme":"B.", "terms":[{"src":"A","tgt":"B",},],}';
  const parsedBoth = parsePreflightResponse(both);
  assert.ok(parsedBoth, 'koma tergantung berbilang tahap mesti dibersihkan');
  assert.equal(parsedBoth.terms[0].src, 'A');
});

test('AgentB: parsePreflightResponse selamat dari fences + chatter di luar sempadan', () => {
  const { parsePreflightResponse } = require('./subfaberPreflight');
  const fence = String.fromCharCode(0x60, 0x60, 0x60); // dibina supaya literal tidak rosak

  // ```json ... ``` (fence dibuang sebelum pengekstrakan sempadan)
  const fenced = `${fence}json\n{"theme":"F.","terms":[]}\n${fence}`;
  assert.ok(parsePreflightResponse(fenced), 'fences mesti dibuang');

  // Chatter sebelum DAN selepas JSON
  const chatty = 'Sure! Here is the analysis:\n{"theme":"C.","terms":[{"src":"X","tgt":"Y","note":""}]}\nHope this helps!';
  const parsedChatty = parsePreflightResponse(chatty);
  assert.ok(parsedChatty, 'chatter luar mesti dibuang');
  assert.equal(parsedChatty.theme, 'C.');
  assert.equal(parsedChatty.terms[0].src, 'X');

  // Kombinasi penuh: chatter + fence + koma tergantung (corak Beta Run 3)
  const combined = `Absolutely, here you go:\n${fence}json\n{"theme":"K.","terms":[{"src":"Z","tgt":"Z","note":""},]}\n${fence}\nLet me know!`;
  const parsedCombined = parsePreflightResponse(combined);
  assert.ok(parsedCombined, 'kombinasi anomali mesti selamat');
  assert.equal(parsedCombined.theme, 'K.');
});

test('AgentB: parsePreflightResponse membersihkan aksara kawalan tidak sah', () => {
  const { parsePreflightResponse } = require('./subfaberPreflight');
  // Control chars mentah (0x01, 0x0B) dibina secara programatik — JSON.parse
  // asli menolaknya ("Unexpected token"); parser tahan lasak mesti membuangnya.
  const CTRL_01 = String.fromCharCode(0x01);
  const CTRL_0B = String.fromCharCode(0x0B);
  const ctrl = `{"theme":"Ctrl${CTRL_01}clean${CTRL_0B}now.","terms":[]}`;

  // Semakan awal: JSON.parse asli memang gagal dengan input ini
  let nativeFailed = false;
  try { JSON.parse(ctrl); } catch (_) { nativeFailed = true; }
  assert.ok(nativeFailed, 'precondition: JSON.parse asli mesti gagal');

  const parsed = parsePreflightResponse(ctrl);
  assert.ok(parsed, 'control chars tidak sah mesti dibuang');
  assert.equal(parsed.theme, 'Ctrlcleannow.', '0x01 dan 0x0B dibuang; teks sah kekal');
  assert.ok(!parsed.theme.includes(CTRL_01) && !parsed.theme.includes(CTRL_0B), 'tiada control char tersisa');
});

test('AgentB: parse gagal selepas pembersihan → forensik offset + konteks 100 aksara pada WARN', () => {
  const { parsePreflightResponse } = require('./subfaberPreflight');
  const log = require('../utils/logger');
  const captured = [];
  const originalWarn = log.warn;
  log.warn = (fn) => {
    try { captured.push(typeof fn === 'function' ? String(fn()) : String(fn)); } catch (_) { /* noop */ }
  };
  try {
    // JSON rosak yang TIDAK boleh diselamatkan (string tidak ditutup)
    const result = parsePreflightResponse('{"theme":"broken... no closing quote, "terms":[]}');
    assert.equal(result, null, 'tetap null untuk JSON yang benar-benar rosak');

    const forensic = captured.find(l => l.includes('Resilient parse failed'));
    assert.ok(forensic, 'kegagalan parse mesti dilog dengan forensik');
    assert.ok(/Offset \d+/.test(forensic), 'offset kedudukan aksara mesti dipaparkan');
    assert.ok(forensic.includes('broken'), 'konteks 100 aksara sekitar kawasan bermasalah mesti dipaparkan');
  } finally {
    log.warn = originalWarn;
  }
});

// ── 14. Dynamic Model Swapping — Hot-Swappable (Mandat §2) ──

test('AgentB: hierarki model 100% dinamik — kimi-k3 utama, sandaran custom', async () => {
  const inspector = new AgentBInspector({
    apiKey: 'k',
    baseUrl: 'https://x.example/v1',
    model: 'kimi-k3',
    fallbackModel: 'glm-5.3-flashx'
  });
  assert.deepEqual(inspector.modelHierarchy, ['kimi-k3', 'glm-5.3-flashx'], 'susunan configurable, bukan hardcoded');

  const calls = [];
  inspector.translateSubtitle = async function () {
    calls.push(this.model);
    if (this.model === 'kimi-k3') throw new Error('kimi down');
    return '{"valid":true}';
  };
  const verdict = await inspector.runSemanticInspection(makeEntries(2), makeTranslated(2));
  assert.deepEqual(calls, ['kimi-k3', 'glm-5.3-flashx'], 'failover mengikut hierarki dinamik');
  assert.equal(verdict.modelUsed, 'glm-5.3-flashx');
  assert.equal(verdict.valid, true);
});

test('AgentB: fallbackModel "none" → hierarki model tunggal (tiada failover)', async () => {
  const inspector = new AgentBInspector({
    apiKey: 'k',
    baseUrl: 'https://x.example/v1',
    model: 'deepseek-v4.1-flash',
    fallbackModel: 'none'
  });
  assert.deepEqual(inspector.modelHierarchy, ['deepseek-v4.1-flash'], '"none" = single-model');
  assert.equal(inspector.fallbackModel, null);

  let calls = 0;
  inspector.translateSubtitle = async function () { calls++; throw new Error('primary dead'); };
  const verdict = await inspector.runSemanticInspection(makeEntries(2), makeTranslated(2));
  assert.equal(calls, 1, 'tiada panggilan kedua — failover dimatikan');
  assert.equal(verdict.failOpen, true);
  assert.equal(verdict.error, 'both_models_failed');
});

test('AgentB: fallbackModel sama dengan utama → dedupe kepada hierarki tunggal', () => {
  const inspector = new AgentBInspector({
    apiKey: 'k',
    baseUrl: 'https://x.example/v1',
    model: 'glm-5.3-flashx',
    fallbackModel: 'GLM-5.3-FLASHX' // sama (case-insensitive)
  });
  assert.deepEqual(inspector.modelHierarchy, ['glm-5.3-flashx'], 'duplikat mesti didedup');
  assert.equal(inspector.fallbackModel, null);
});

test('AgentB: lalai tanpa sebarang options — flash utama + deepseek sandaran (CLEAN 2-MODEL)', () => {
  const inspector = new AgentBInspector({ apiKey: 'k', baseUrl: 'https://x.example/v1' });
  assert.deepEqual(inspector.modelHierarchy, ['glm-5.3-flash', 'deepseek-v4.1-flash'], 'lalai utama glm-5.3-flash');
  assert.equal(inspector.fallbackModel, 'deepseek-v4.1-flash');
  assert.equal(inspector.model, 'glm-5.3-flash');
});

test('AgentB: config.js normalisasi agentB — CLEAN 2-MODEL (tiada medan trinity)', async () => {
  const { normalizeConfig } = require('../utils/config');
  const savedEnv = { AGENT_B_MODEL: process.env.AGENT_B_MODEL };
  try {
    // Kes 1: config menang
    const cfg = normalizeConfig({
      agentB: { enabled: true, baseUrl: 'https://c.example/v1', apiKey: 'ck', model: 'm1', fallbackModel: 'm2' }
    });
    assert.equal(cfg.agentB.model, 'm1', 'model = utama tunggal');
    assert.equal(cfg.agentB.fallbackModel, 'm2');
    // Medan trinity dilucutkan daripada struktur tersimpan
    assert.equal(cfg.agentB.preflightModel, undefined, 'preflightModel dimansuhkan');
    assert.equal(cfg.agentB.inspectionModel, undefined, 'inspectionModel dimansuhkan');

    // Kes 2: lalai bersih
    delete process.env.AGENT_B_MODEL;
    const defaults = normalizeConfig({});
    assert.equal(defaults.agentB.model, 'glm-5.3-flash', 'lalai utama glm-5.3-flash');
    assert.equal(defaults.agentB.fallbackModel, 'deepseek-v4.1-flash', 'lalai sandaran deepseek');
    assert.equal(defaults.agentB.preflightModel, undefined);
    assert.equal(defaults.agentB.inspectionModel, undefined);
  } finally {
    if (savedEnv.AGENT_B_MODEL === undefined) delete process.env.AGENT_B_MODEL;
    else process.env.AGENT_B_MODEL = savedEnv.AGENT_B_MODEL;
  }
});

// ── 15. CLEAN 2-MODEL (Mandat Penyatuan Bersih 2026-09-26) ──

test('AgentB: CLEAN 2-MODEL — SATU utama glm-5.3-flash untuk KEDUA-DUA fasa', async () => {
  const inspector = new AgentBInspector({ apiKey: 'k', baseUrl: 'https://x.example/v1' });
  assert.equal(inspector.model, 'glm-5.3-flash', 'utama tunggal glm-5.3-flash');
  assert.deepEqual(inspector.modelHierarchy, ['glm-5.3-flash', 'deepseek-v4.1-flash'], 'hierarki tunggal');
  assert.equal(inspector.fallbackModel, 'deepseek-v4.1-flash');

  const calls = [];
  // Pre-Flight: cuba glm-5.3-flash dahulu, failover deepseek
  inspector.translateSubtitle = async function () {
    calls.push(this.model);
    if (this.model === 'glm-5.3-flash') throw new Error('primary down');
    return '{"theme":"Rescued.","terms":[]}';
  };
  const preflightContext = await inspector.runPreflightPass(makeEntries(50), 'Malay', 'English');
  assert.ok(preflightContext, 'konteks dari penyelamat diterima');
  assert.deepEqual(calls, ['glm-5.3-flash', 'deepseek-v4.1-flash'], 'Pre-Flight hierarki tunggal');

  // Semakan: hierarki YANG SAMA — tiada pemisahan per operasi lagi
  calls.length = 0;
  inspector.translateSubtitle = async function () {
    calls.push(this.model);
    if (this.model === 'glm-5.3-flash') throw new Error('primary down');
    return '{"valid":true}';
  };
  const verdict = await inspector.runSemanticInspection(makeEntries(2), makeTranslated(2));
  assert.equal(verdict.valid, true);
  assert.deepEqual(calls, ['glm-5.3-flash', 'deepseek-v4.1-flash'], 'Semakan hierarki TUNGGAL yang sama');
});

test('AgentB: CLEAN 2-MODEL — hot-swap utama tersuai + sandaran tersuai', () => {
  const inspector = new AgentBInspector({
    apiKey: 'k',
    baseUrl: 'https://x.example/v1',
    model: 'kimi-k3',
    fallbackModel: 'glm-5.3-flash'
  });
  assert.equal(inspector.model, 'kimi-k3');
  assert.equal(inspector.fallbackModel, 'glm-5.3-flash');
  assert.deepEqual(inspector.modelHierarchy, ['kimi-k3', 'glm-5.3-flash']);
  assert.equal(inspector.preflightModel, undefined, 'medan trinity tidak lagi wujud');
  assert.equal(inspector.inspectionModel, undefined, 'medan trinity tidak lagi wujud');
});

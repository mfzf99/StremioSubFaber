/**
 * Agent B — Semantic Inspector & Pre-Flight Offloader — Regression Tests
 * (Mandat Pelaksanaan 2026-09-26, Fasa 1 & 2)
 *
 * Kontrak yang diuji (parit laporan audit diluluskan):
 *   1. parseInspectorResponse: JSON sah / rosak / berpagar markdown / chatter
 *   2. buildInspectionPayload: blok <en>/<ms> padat, ID global, cap baris
 *   3. Fail-open: panggilan API tergendala → { valid: true, failOpen: true }
 *   4. Circuit breaker: 3 kegagalan berturut → silent mode (tiada panggilan)
 *   5. Payload GLM: model glm-5.3-flashx → reasoning_effort 'low',
 *      max_tokens 256 (bukan lantai 65536 keluarga GLM), timeout 4000ms
 *   6. Integriti enjin apabila agentB = null → 100% laluan Gemini asal
 *   7. Gerbang semantik enjin: valid:false → SATU retry + amaran jenayah;
 *      failOpen → tiada retry; hasil struktur bercacat → tiada semakan
 *   8. Normalisasi config agentB (env fallback + hygiene enabled)
 */

const test = require('node:test');
const assert = require('node:assert/strict');

// Stub dependencies sebelum require supaya modul dimuat tanpa Redis/env
process.env.ENTRY_CACHE_SIZE = '100';

const {
  AgentBInspector,
  buildInspectionPayload,
  parseInspectorResponse,
  AGENT_B_TIMEOUT_MS,
  AGENT_B_MAX_OUTPUT_TOKENS,
  AGENT_B_CIRCUIT_THRESHOLD
} = require('./agentBInspector');

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

// ── 5. Payload GLM (registry + override) ──

test('AgentB: GLM payload — reasoning_effort low, max_tokens 256, timeout 4s, no retries', () => {
  const inspector = new AgentBInspector({
    apiKey: 'test-key',
    baseUrl: 'https://agentb.example.com/v1',
    model: 'glm-5.3-flashx'
  });

  assert.equal(inspector.model, 'glm-5.3-flashx');
  assert.equal(inspector.reasoningEffort, 'low', 'glm-5.3-flashx needs reasoning_effort low (thinking always-on)');
  assert.equal(inspector.maxRetries, 0, 'fail fast — no provider-level retries');
  assert.equal(inspector.translationTimeout, AGENT_B_TIMEOUT_MS, 'soft timeout 4s');
  assert.equal(inspector.translationTimeout, 4000);
  assert.equal(AGENT_B_TIMEOUT_MS, 4000);

  // Override lantai 65536 keluarga GLM — inspector mesti zero-yap
  assert.equal(inspector.getCappedMaxOutputTokens(), AGENT_B_MAX_OUTPUT_TOKENS);
  assert.equal(AGENT_B_MAX_OUTPUT_TOKENS, 256);

  // buildChatRequest: body mesti membawa reasoning_effort low + max_tokens 256
  const { body } = inspector.buildChatRequest('inspector prompt', false, {});
  assert.equal(body.reasoning_effort, 'low', 'registry GLM 5.3 must map effort to low');
  assert.equal(body.max_tokens, 256, 'max_tokens must honor inspector cap');
  assert.equal(body.stream, false);
  assert.ok(Array.isArray(body.messages) && body.messages.length === 1, 'single user message');
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
    assert.equal(disabled.agentB.model, 'glm-5.3-flashx', 'default model');

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

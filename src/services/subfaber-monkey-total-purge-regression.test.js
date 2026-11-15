// [TOTAL-PURGE 2026-11-15 — Mandat Owner, pelan diluluskan] Ujian regresi
// pemusnahan lapisan MONKEY + templat terjemahan baharu (v3.36.0).
// Enam kontrak:
//   P1  mechanicalValidator.js DIBUANG — require() mesti throw.
//   P2  Enjin TIDAK lagi menjalankan retry mekanikal: provider yang memulangkan
//       kecacatan keras (bocor skrip CJK) → SATU panggilan sahaja, sifar insiden
//       MECHANICAL_TRANSLATION_RETRY.
//   P3  TRANSLATION_SYSTEM_TEMPLATE = templat pendek Owner (verbatim pin).
//   P4  fewShot baharu Malay (3 contoh Owner) hadir dalam prompt kedua-dua mod.
//   P5  Kunci cache membawa namespace v6 (output prompt lama tidak diservis).
//   P6  Laluan retry semantik Inspector kekal hidup tanpa selectRetryFindings
//       mekanikal (7-jenayah + VERIFIED SLOTS + anchor).
const { test } = require('node:test');
const assert = require('node:assert/strict');

process.env.ENTRY_CACHE_SIZE = '100';

function entry(id, text) {
    return { id, text, timecode: '00:00:01,000 --> 00:00:02,000' };
}

function response(entries) {
    return `<answer>\n${entries.map(({ id, text }) => `<s id="${id}">${text}</s>`).join('\n')}\n</answer>`;
}

function makeEngine(provider, options = {}) {
    const TranslationEngine = require('./translationEngine');
    const engine = new TranslationEngine(
        {
            translateSubtitle: provider.translateSubtitle,
            streamTranslateSubtitle: async () => '',
            estimateTokenCount: () => 10
        },
        'gemini-2.5-flash',
        {},
        { providerName: 'gemini', ...options }
    );
    engine.sourceLanguage = 'English';
    return engine;
}

// P1 — fail validator mesti hilang.
test('P1: mechanicalValidator.js dibuang — require() throw', () => {
    assert.throws(() => require('./utils/mechanicalValidator'), /Cannot find module/);
});

// P2 — tiada retry mekanikal walaupun output bawa kecacatan keras.
test('P2: engine tidak menjalankan retry mekanikal pada kecacatan keras', async () => {
    let calls = 0;
    const engine = makeEngine(
        {
            translateSubtitle: async () => {
                calls++;
                // Kecacatan keras klasyk MONKEY: bocor skrip CJK ke sasaran Rumi.
                return response([
                    { id: 1, text: 'Baris ok.' },
                    { id: 2, text: 'Baris masih これはテストです' }
                ]);
            }
        },
        { trinityMode: 'basic', agentInspector: null }
    );
    const result = await engine.translateBatch(
        [entry(1, 'A fine line.'), entry(2, 'Another fine line.')],
        'Malay',
        null,
        0,
        1,
        null,
        { streaming: false }
    );
    assert.equal(calls, 1, 'no second (mechanical) call may happen');
    const mechanical = (engine.translationStats.incidents || []).find((i) => i.type === 'MECHANICAL_TRANSLATION_RETRY');
    assert.equal(mechanical, undefined, 'no MECHANICAL_TRANSLATION_RETRY incident may be logged');
    assert.equal(engine.translationStats.mechanicalRetries, undefined, 'mechanicalRetries stat removed');
    assert.equal(result.length, 2);
});

// P3 — templat baharu (pembandingan rentetan kunci pada sumber SSOT).
test('P3: TRANSLATION_SYSTEM_TEMPLATE = templat streamline Owner (sifar melalut)', () => {
    const { TRANSLATION_SYSTEM_TEMPLATE } = require('./prompts/trinity/translation/core');
    assert.ok(TRANSLATION_SYSTEM_TEMPLATE.includes('### CORE RULES'));
    assert.ok(TRANSLATION_SYSTEM_TEMPLATE.includes('translate the whole thought first'));
    assert.ok(TRANSLATION_SYSTEM_TEMPLATE.includes('Keep exact counts per slot'));
    assert.ok(TRANSLATION_SYSTEM_TEMPLATE.includes('Translate ONLY the lines inside <input>'));
    assert.ok(TRANSLATION_SYSTEM_TEMPLATE.includes('ZERO markdown code blocks'));
    assert.ok(TRANSLATION_SYSTEM_TEMPLATE.includes('${fewShot}'));
    // Rentetan templat pendek v3.36.0 — mesti hilang (STREAMLINE 2026-11-15).
    assert.ok(!TRANSLATION_SYSTEM_TEMPLATE.includes('[SYSTEM / ROLE]'));
    assert.ok(!TRANSLATION_SYSTEM_TEMPLATE.includes('STRICT 1:1 SLOT PARITY'));
    assert.ok(!TRANSLATION_SYSTEM_TEMPLATE.includes('Anti-calque'));
    // Rentetan lama templat V4 — mesti hilang.
    assert.ok(!TRANSLATION_SYSTEM_TEMPLATE.includes('mentally translate the complete sentence first'));
    assert.ok(!TRANSLATION_SYSTEM_TEMPLATE.includes('ANTI-MERGE'));
    assert.ok(!TRANSLATION_SYSTEM_TEMPLATE.includes('ANTI-SHIFT'));
    assert.ok(!TRANSLATION_SYSTEM_TEMPLATE.includes('ANTI-PHANTOM'));
    assert.ok(!TRANSLATION_SYSTEM_TEMPLATE.includes('ANTI-DROP'));
    assert.ok(!TRANSLATION_SYSTEM_TEMPLATE.includes('ANTI-UNTRANSLATED'));
    assert.ok(!TRANSLATION_SYSTEM_TEMPLATE.includes('Register lock'));
});

// P4 — fewShot baharu hadir pada kedua-dua mod.
test('P4: fewShot baharu Malay hadir untuk Basic dan Pro', () => {
    const { malayPack } = require('./prompts/languagePacks/index');
    assert.ok(malayPack.fewShot.includes('<bad_textbook>'));
    assert.ok(malayPack.fewShot.includes('memang gila lah kau.'));
    assert.ok(malayPack.fewShot.includes('Masa dah suntuk.'));
    assert.ok(!malayPack.fewShot.includes('Biar betul.'));
    // Medan MONKEY/sosiolinguistik lama — mesti tidak wujud pada pack.
    for (const field of [
        'honorificMatrix',
        'canonicalAddressMatrix',
        'creditsExample',
        'specificRules',
        'notLockedGuidance'
    ]) {
        assert.equal(malayPack[field], undefined, `${field} must be removed from the pack`);
    }
    const { genericPack } = require('./prompts/languagePacks/index');
    assert.ok(typeof genericPack.fewShot === 'string');
    for (const field of [
        'honorificMatrix',
        'canonicalAddressMatrix',
        'creditsExample',
        'specificRules',
        'notLockedGuidance'
    ]) {
        assert.equal(genericPack[field], undefined, `${field} must be removed from the generic pack`);
    }
    // Preflight tidak lagi memakan language pack — templat tanpa placeholder pack.
    const { PREFLIGHT_STATIC_TEMPLATE } = require('./prompts/trinity/preflight/core');
    assert.ok(!PREFLIGHT_STATIC_TEMPLATE.includes('${honorificMatrix}'));
    assert.ok(!PREFLIGHT_STATIC_TEMPLATE.includes('${canonicalAddressMatrix}'));
    assert.ok(!PREFLIGHT_STATIC_TEMPLATE.includes('${creditsExample}'));
});

// P5 — namespace cache v7.
test('P5: kunci cache Trinity membawa namespace v7', () => {
    const { generateCacheKeys } = require('../utils/cacheKeys');
    const keys = generateCacheKeys(
        { trinityMode: 'basic', trinity: { mode: 'basic' }, bypassCache: true, bypassCacheConfig: { enabled: true } },
        'subdl_123_s01e15',
        'may'
    );
    const allKeys = [keys.baseKey, keys.cacheKey, keys.runtimeKey].filter((k) => typeof k === 'string');
    assert.ok(allKeys.length > 0, 'at least one cache key must be generated');
    for (const key of allKeys) {
        assert.ok(String(key).includes('-v7_'), `cache key must carry v7 namespace: ${key}`);
    }
});

// P6 — laluan retry semantik Inspector kekal (tanpa mekanikal).
test('P6: Inspector semantic retry kekal dengan VERIFIED SLOTS + anchor', async () => {
    let calls = 0;
    const prompts = [];
    const engine = makeEngine(
        {
            translateSubtitle: async (_c, _s, _t, prompt) => {
                prompts.push(prompt);
                calls++;
                return calls === 1
                    ? response([
                          { id: 1, text: 'Satu ok' },
                          { id: 2, text: 'Dua gabung rosak' }
                      ])
                    : response([
                          { id: 1, text: 'Satu kekal' },
                          { id: 2, text: 'Dua dibaiki' }
                      ]);
            }
        },
        {
            trinityMode: 'pro',
            agentInspector: {
                circuitOpen: false,
                runSemanticInspection: async () =>
                    calls === 1
                        ? { valid: false, crimes: [{ type: 'MERGE', ids: [2], note: 'merged content' }] }
                        : { valid: true }
            }
        }
    );
    const result = await engine.translateBatch(
        [entry(1, 'First line.'), entry(2, 'Second line.')],
        'Malay',
        null,
        0,
        1,
        null,
        { streaming: false }
    );
    assert.equal(calls, 2, 'original + semantic retry');
    assert.ok(prompts[1].includes('ID 2 (MERGE)'), 'semantic crime carried into retry prompt');
    assert.ok(prompts[1].includes('VERIFIED SLOTS (keep verbatim)'));
    assert.ok(prompts[1].trimEnd().endsWith('<answer>\n<s id="1">'));
    assert.equal(result[1].text, 'Dua dibaiki');
    const semantic = engine.translationStats.incidents.find(
        (i) => i.type === 'AGENT_INSPECTOR_SEMANTIC_RETRY' && i.batch === 1
    );
    assert.equal(semantic?.outcome, 'recovered');
});

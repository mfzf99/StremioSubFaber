// Ujian regresi B1 — pasca-TOTAL-PURGE v3.36.0: lapisan mekanikal MONKEY
// dipadam (gate/insiden MECHANICAL_TRANSLATION_RETRY/mechanicalRetries),
// tetapi stats worker dari kilang enjin MESTI kekal menyokong rekod jenayah
// (crimesDetectedByType) dan insiden (incidents) tanpa TypeError pada batch
// worker >= 1 — laluan Agent Inspector semantik sahaja yang tinggal.
const { test } = require('node:test');
const assert = require('node:assert');
const TranslationEngine = require('../services/translationEngine');
const { executeParallelTranslation } = require('./parallelTranslation');

// Provider yang memulangkan jawapan 1:1 berdasarkan ID sebenar dalam input:
// baris pertama setiap batch membawa kandungan diterjemah biasa (tiada gate
// mekanikal lagi selepas purge; parity struktur 1:1 dipelihara supaya tiada
// laluan MISMATCH_RETRY menyala).
function makeCleanProvider() {
    return {
        translateSubtitle: async (input) => {
            const matches = [...String(input).matchAll(/<s id="(\d+)">([^<]*)<\/s>/g)];
            if (matches.length === 0) return '';
            const lines = matches.map((m) => `<s id="${m[1]}">Baris ${m[1]} diterjemah</s>`);
            return `<answer>\n${lines.join('\n')}\n</answer>`;
        },
        estimateTokenCount: () => 10,
        providerName: 'gemini'
    };
}

function makeParallelEngine(provider) {
    return new TranslationEngine(
        provider,
        'gemini-2.5-flash',
        { parallelBatchesEnabled: true, parallelBatchesCount: 2 },
        { providerName: 'gemini' }
    );
}

test('B1 parallel: worker batch ke-2 selesai tanpa TypeError (kilang stats tunggal)', async () => {
    const engine = makeParallelEngine(makeCleanProvider());
    engine.batchSize = 2;
    engine.sourceLanguage = 'English';

    const entries = Array.from({ length: 4 }, (_, i) => ({
        id: i + 1,
        timecode: `00:00:0${i + 1},000 --> 00:00:0${i + 2},000`,
        text: `Hello line ${i + 1} with content.`
    }));

    const result = await executeParallelTranslation(engine, entries, 'Malay', null, null);
    assert.ok(Array.isArray(result), 'parallel translation must resolve with entries');
    assert.equal(result.length, 4, 'all four entries must survive the parallel run');
});

test('B1 parallel: stats worker dari kilang menyokong rekod jenayah & insiden', () => {
    const engine = new TranslationEngine(
        { translateSubtitle: async () => '', estimateTokenCount: () => 10 },
        'gemini-2.5-flash',
        {},
        { providerName: 'gemini' }
    );

    // Klon + kilang stats — persis mekanik worker parallelTranslation.js.
    const workerEngine = Object.assign(Object.create(Object.getPrototypeOf(engine)), engine);
    workerEngine.translationStats = Object.getPrototypeOf(engine).constructor.createDefaultStats(workerEngine);

    // Semua laluan semantik yang tinggal berfungsi tanpa TypeError.
    workerEngine._recordCrime('MERGE', 2);
    assert.equal(
        workerEngine.translationStats.crimesDetectedByType.MERGE,
        1,
        'worker crime recording must increment taxonomy'
    );
    workerEngine._logIncident({
        type: 'AGENT_INSPECTOR_SEMANTIC_RETRY',
        batch: 2,
        recovery: 'x',
        outcome: 'in_progress'
    });
    assert.equal(workerEngine.translationStats.incidents.length, 1, 'worker incident recording must not throw');
    // [TOTAL-PURGE v3.36.0] mechanicalRetries DIBUANG dari skema stats.
    assert.equal(
        workerEngine.translationStats.mechanicalRetries,
        undefined,
        'mechanicalRetries stat must be removed from the worker stats factory'
    );
});

test('B1 parallel: stats worker digabung semula ke enjin induk (crimes, incidents)', async () => {
    const engine = makeParallelEngine(makeCleanProvider());
    engine.batchSize = 2;
    engine.sourceLanguage = 'English';

    const entries = Array.from({ length: 4 }, (_, i) => ({
        id: i + 1,
        timecode: `00:00:0${i + 1},000 --> 00:00:0${i + 2},000`,
        text: `Hello line ${i + 1} with content.`
    }));

    await executeParallelTranslation(engine, entries, 'Malay', null, null);
    assert.equal(
        engine.translationStats.mechanicalRetries,
        undefined,
        'merged parent stats must not carry the removed mechanicalRetries field'
    );
    assert.ok(
        Array.isArray(engine.translationStats.incidents),
        'incidents array must exist and merge cleanly across workers'
    );
});

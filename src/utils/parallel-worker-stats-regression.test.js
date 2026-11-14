// Ujian regresi B1 — hijau selepas fix: crash worker mod selari pada gate
// mekanikal & rekod jenayah (v3.31.0). Dahulu MERAH: stats worker zero-kan
// tanpa incidents/crimesDetectedByType/mechanicalRetries menghidupkan
// TypeError pada _logIncident/_recordCrime batch worker >= 1.
const { test } = require('node:test');
const assert = require('node:assert');
const TranslationEngine = require('../services/translationEngine');
const { executeParallelTranslation } = require('./parallelTranslation');

// Provider yang memulangkan jawapan 1:1 berdasarkan ID sebenar dalam input:
// baris pertama setiap batch sengaja bocor skrip Jepun (SCRIPT_LEAK keras ke
// sasaran Rumi) supaya gate mekanikal menyala pada SETIAP batch — termasuk
// worker — dan retry juga bocor (insiden failed, telemetri penuh tercetus).
function makeLeakyProvider() {
    return {
        translateSubtitle: async (input) => {
            const matches = [...String(input).matchAll(/<s id="(\d+)">([^<]*)<\/s>/g)];
            if (matches.length === 0) return '';
            const lines = matches.map(
                (m, i) => `<s id="${m[1]}">${i === 0 ? 'これはテストです' : `Baris ${m[1]} ok`}</s>`
            );
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

test('B1 parallel: worker batch ke-2 mencetus pengesah mekanikal tanpa TypeError', async () => {
    const engine = makeParallelEngine(makeLeakyProvider());
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

    // Semua laluan yang dahulu TypeError pada stats lama kini berfungsi.
    workerEngine._recordCrime('MERGE', 2);
    assert.equal(
        workerEngine.translationStats.crimesDetectedByType.MERGE,
        1,
        'worker crime recording must increment taxonomy'
    );
    workerEngine._logIncident({
        type: 'MECHANICAL_TRANSLATION_RETRY',
        batch: 2,
        recovery: 'x',
        outcome: 'in_progress'
    });
    assert.equal(workerEngine.translationStats.incidents.length, 1, 'worker incident recording must not throw');
    workerEngine.translationStats.mechanicalRetries++;
    assert.equal(workerEngine.translationStats.mechanicalRetries, 1, 'worker mechanical retry counter must be numeric');
});

test('B1 parallel: stats worker digabung semula ke enjin induk (mechanicalRetries, crimes, incidents)', async () => {
    const engine = makeParallelEngine(makeLeakyProvider());
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
        2,
        'both batches (original + worker) must merge mechanical retry counters back'
    );
    assert.equal(
        engine.translationStats.incidents.filter((i) => i.type === 'MECHANICAL_TRANSLATION_RETRY').length,
        2,
        'mechanical retry incidents from both batches must merge back'
    );
});

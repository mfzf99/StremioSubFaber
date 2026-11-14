// Ujian regresi D1 (insiden tergantung) + R#1 (taksonomi UNTRANSLATED) +
// [M4-FIX 2026-11-14] rujukan pemindahan C1 ke proses terasing.
//
// Definisi kecacatan asal:
//   D1: insiden MECHANICAL_TRANSLATION_RETRY kekal `in_progress` bila kecacatan
//       keras hanya selesai oleh laluan retry semantik Inspector.
//   R#1: kemasukan UNTRANSLATED yang digabung daripada selectRetryFindings()
//       tidak dikira ke crimesDetectedByType.
//   C1 (cache poisoning selepas retry gagal) kini di
//   translation-cache-poisoning-isolated.test.js — node --test menjalankan
//   setiap fail .test.js dalam proses anak tersendiri, jadi env
//   CACHE_TRANSLATIONS=true boleh di-set sana SEBELUM require enjin tanpa
//   sebarang `delete require.cache` (pemindahan ini adalah M4; red probe
//   .tmp/m4-red-probe.test.js membuktikan reload cara-lama meninggalkan
//   salinan modul ber-beza dalam cache proses).
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const TranslationEngine = require('./translationEngine');

function makeEngine(provider) {
    return new TranslationEngine(provider, 'gemini-2.5-flash', {}, { providerName: 'gemini' });
}

function entries(n) {
    return Array.from({ length: n }, (_, i) => ({
        id: i + 1,
        timecode: `00:00:0${i + 1},000 --> 00:00:0${i + 2},000`,
        text: `Source line ${i + 1} with enough content.`
    }));
}

function answerXml(texts, startId = 1) {
    return `<answer>\n${texts.map((t, i) => `<s id="${startId + i}">${t}</s>`).join('\n')}\n</answer>`;
}

test('C1-relocation: ujian cache-poisoning dipindahkan ke fail proses terasing', () => {
    // [M4-FIX] Ujian C1 dipindahkan ke translation-cache-poisoning-isolated.test.js
    // — fail .test.js berasingan dijalankan node --test dalam proses anak tersendiri,
    // jadi env CACHE_TRANSLATIONS=true di-set sana SEBELUM require enjin tanpa
    // manipulasi require.cache. Kontrak discovery: runner (scripts/run-tracked-tests.js)
    // mengutip SEMUA *.test.js bawah src/ — fail baharu ditemui automatik.
    const isolatedPath = require.resolve('./translation-cache-poisoning-isolated.test.js');
    assert.ok(fs.existsSync(isolatedPath), 'fail ujian C1 terasing mesti wujud dan ditemui runner');
    const source = fs.readFileSync(isolatedPath, 'utf8');
    assert.ok(
        source.includes("process.env.CACHE_TRANSLATIONS = 'true'") &&
            source.indexOf("process.env.CACHE_TRANSLATIONS = 'true'") <
                source.indexOf("require('./translationEngine')"),
        'env CACHE_TRANSLATIONS mesti di-set SEBELUM require enjin dalam fail terasing'
    );
    assert.ok(!source.includes('delete require.cache'), 'fail terasing tidak boleh mengandungi manipulasi require.cache');
});

test('D1: insiden MECHANICAL_TRANSLATION_RETRY mencapai status muktamad sebelum peringkat Inspector', async () => {
    let call = 0;
    const provider = {
        // Pertama: kebocoran skrip (hard). Retry: bersih — pulih.
        translateSubtitle: async () =>
            call++ === 0 ? answerXml(['これはテストです', 'Baris ok']) : answerXml(['Ini ujian', 'Baris ok']),
        estimateTokenCount: () => 10
    };
    const engine = makeEngine(provider);
    engine.sourceLanguage = 'English';
    engine.agentInspector = {
        circuitOpen: false,
        runSemanticInspection: async () => ({ valid: true })
    };

    await engine.translateBatch(entries(2), 'Malay', null, 0, 1, null, {});

    const incident = engine.translationStats.incidents.find(
        (i) => i.type === 'MECHANICAL_TRANSLATION_RETRY' && i.batch === 1
    );
    assert.ok(incident, 'mechanical retry incident must exist');
    assert.notEqual(incident.outcome, 'in_progress', 'incident must reach a final status, never stuck in_progress');
});

test('D1: insiden tergantung bila retry mekanikal gagal tetapi Inspector kemudian pulih (varian semantik)', async () => {
    let call = 0;
    const provider = {
        // Pertama: kebocoran skrip (hard). Retry mekanikal: masih bocor → gagal.
        translateSubtitle: async () =>
            call++ === 0 ? answerXml(['これはテストです', 'Baris ok']) : answerXml(['まだ bocor', 'Baris ok']),
        estimateTokenCount: () => 10
    };
    const engine = makeEngine(provider);
    engine.sourceLanguage = 'English';
    // Inspector memberi jenayah pada hasil akal (fallback asal dikekalkan).
    let inspections = 0;
    engine.agentInspector = {
        circuitOpen: false,
        runSemanticInspection: async () => {
            inspections++;
            // Semakan pertama: jenayah. Re-verdict selepas retry semantik: lulus.
            if (inspections === 1) {
                return { valid: false, crimes: [{ type: 'MERGE', ids: [1, 2], note: 'x' }] };
            }
            return { valid: true };
        }
    };

    await engine.translateBatch(entries(2), 'Malay', null, 0, 1, null, {});

    const mechanical = engine.translationStats.incidents.find(
        (i) => i.type === 'MECHANICAL_TRANSLATION_RETRY' && i.batch === 1
    );
    assert.ok(mechanical, 'mechanical retry incident must exist');
    assert.notEqual(
        mechanical.outcome,
        'in_progress',
        'mechanical incident must be closed even when only the semantic path later recovers'
    );
});

test('R#1: UNTRANSLATED yang digabung daripada selectRetryFindings dikira ke crimesDetectedByType', async () => {
    let call = 0;
    const provider = {
        // Pertama: salinan verbatim baris 1 (>5 char, bukan nama/interjeksi) — hard VERBATIM.
        translateSubtitle: async () =>
            call++ === 0
                ? answerXml(['Source line 1 with enough content.', 'Baris ok'])
                : answerXml(['Ini sudah diterjemah', 'Baris ok']),
        estimateTokenCount: () => 10
    };
    const engine = makeEngine(provider);
    engine.sourceLanguage = 'English';
    let inspections = 0;
    engine.agentInspector = {
        circuitOpen: false,
        runSemanticInspection: async () => {
            inspections++;
            if (inspections === 1) {
                // Jenayah semantik pada ID sama dengan kecacatan mekanikal —
                // selectRetryFindings akan menggabungnya sebagai UNTRANSLATED.
                return { valid: false, crimes: [{ type: 'UNTRANSLATED', ids: [1], note: 'lazy copy' }] };
            }
            return { valid: true };
        }
    };

    await engine.translateBatch(entries(2), 'Malay', null, 0, 1, null, {});

    assert.ok(
        engine.translationStats.crimesDetectedByType.UNTRANSLATED >= 1,
        'merged UNTRANSLATED finding from the mechanical gate must be counted in the taxonomy'
    );
});

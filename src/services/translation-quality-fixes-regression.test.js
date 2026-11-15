// Ujian regresi pasca-TOTAL-PURGE v3.36.0.
//   D1 (varian baharu): lapisan MONKEY dipadam — kecacatan keras pada output
//       TIDAK lagi menjana insiden MECHANICAL_TRANSLATION_RETRY langsungan
//       (tiada insiden boleh tergantung in_progress kerana tiada insiden
//       direkodkan; struktur dilindungi MISMATCH_RETRY sahaja).
//   R#1: kemasukan UNTRANSLATED daripada selectRetryFindings() (semantic-only)
//       dikira ke crimesDetectedByType.
//   C1 (cache-poisoning) DIPADAM bersama guard C1 — lapisan mekanikal tidak
//       wujud lagi (pelan diluluskan Owner, plans/subfaber-monkey-total-purge-plan.md §4).
const { test } = require('node:test');
const assert = require('node:assert');
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

test('D1: lapisan mekanikal dipadam — kecacatan keras tidak menjana insiden mekanikal', async () => {
    let call = 0;
    const provider = {
        // Output bocor skrip CJK (dahulu hard SCRIPT_LEAK). Selepas purge:
        // SATU panggilan sahaja, sifar insiden mekanikal.
        translateSubtitle: async () => {
            call++;
            return answerXml(['これはテストです', 'Baris ok']);
        },
        estimateTokenCount: () => 10
    };
    const engine = makeEngine(provider);
    engine.sourceLanguage = 'English';
    engine.agentInspector = {
        circuitOpen: false,
        runSemanticInspection: async () => ({ valid: true })
    };

    await engine.translateBatch(entries(2), 'Malay', null, 0, 1, null, {});

    assert.equal(call, 1, 'no mechanical retry call may happen');
    const incident = engine.translationStats.incidents.find(
        (i) => i.type === 'MECHANICAL_TRANSLATION_RETRY' && i.batch === 1
    );
    assert.equal(incident, undefined, 'no mechanical incident may be recorded at all');
});

test('D1: varian semantik — insiden semantik Inspector muktamad, tiada insiden mekanikal', async () => {
    let call = 0;
    const provider = {
        translateSubtitle: async () => {
            call++;
            return call === 1 ? answerXml(['まだ bocor', 'Baris ok']) : answerXml(['Ini sudah diterjemah', 'Baris ok']);
        },
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
                return { valid: false, crimes: [{ type: 'MERGE', ids: [1, 2], note: 'x' }] };
            }
            return { valid: true };
        }
    };

    await engine.translateBatch(entries(2), 'Malay', null, 0, 1, null, {});

    const mechanical = engine.translationStats.incidents.find(
        (i) => i.type === 'MECHANICAL_TRANSLATION_RETRY' && i.batch === 1
    );
    assert.equal(mechanical, undefined, 'no mechanical incident may be recorded at all');
    const semantic = engine.translationStats.incidents.find(
        (i) => i.type === 'AGENT_INSPECTOR_SEMANTIC_RETRY' && i.batch === 1
    );
    assert.ok(semantic, 'semantic retry incident must exist');
    assert.notEqual(semantic.outcome, 'in_progress', 'semantic incident must reach a final status');
});

test('R#1: UNTRANSLATED yang digabung daripada selectRetryFindings dikira ke crimesDetectedByType', async () => {
    let call = 0;
    const provider = {
        // Pertama: salinan verbatim baris 1 (>5 char, bukan nama/interjeksi).
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
                // Jenayah semantik pada ID sama — selectRetryFindings
                // (semantic-only) membawanya terus ke retry prompt.
                return { valid: false, crimes: [{ type: 'UNTRANSLATED', ids: [1], note: 'lazy copy' }] };
            }
            return { valid: true };
        }
    };

    await engine.translateBatch(entries(2), 'Malay', null, 0, 1, null, {});

    assert.equal(
        (engine.translationStats.crimesDetectedByType.UNTRANSLATED || 0) >= 1,
        true,
        'UNTRANSLATED crimes counted'
    );
});

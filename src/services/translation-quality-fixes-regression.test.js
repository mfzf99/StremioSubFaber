// Ujian regresi merah — C1 (cache poisoning) + D1 (insiden tergantung) + Rendah #1.
// Definisi kecacatan:
//   C1: selepas retry mekanikal gagal, entri bermasalah masih ditulis ke cache.
//   D1: insiden MECHANICAL_TRANSLATION_RETRY kekal `in_progress` bila kecacatan
//       keras hanya selesai oleh laluan retry semantik Inspector.
//   R#1: kemasukan UNTRANSLATED yang digabung daripada selectRetryFindings()
//       tidak dikira ke crimesDetectedByType.
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

test(
    'C1: entri gagal-retry dipulangkan sebagai fallback tetapi TIDAK ditulis ke cache',
    { timeout: 20000 },
    async () => {
        // Cache mesti aktif untuk ujian ini. CACHE_TRANSLATIONS dibaca semasa require,
        // jadi enjin dimuat semula selepas env di-set.
        process.env.CACHE_TRANSLATIONS = 'true';
        delete require.cache[require.resolve('./translationEngine')];
        const FreshEngine = require('./translationEngine');
        // Pulihkan env serta-merta supaya require semula lain tidak terjejas;
        // CACHE_TRANSLATIONS sudah diikat dalam modul FreshEngine ini.
        process.env.CACHE_TRANSLATIONS = 'false';

        let call = 0;
        const provider = {
            // Percubaan pertama: kebocoran skrip pada baris 1 (SCRIPT_LEAK keras).
            // Retry: masih bocor — gagal, fallback asal dikekalkan.
            translateSubtitle: async () =>
                call++ === 0
                    ? answerXml(['これはテストです', 'Baris ok kedua'])
                    : answerXml(['これもまだ bocor', 'Baris ok kedua']),
            estimateTokenCount: () => 10
        };
        const engine = new FreshEngine(provider, 'gemini-2.5-flash', {}, { providerName: 'gemini' });
        engine.sourceLanguage = 'English';

        // Spy pada cacheEntry: rekod sumber mana yang dihantar ke storan cache.
        // (Kunci cache merangkumi prompt penuh, jadi getCachedEntry tidak boleh
        // disoal terus dari luar tanpa prompt yang sama — spy menguji kontrak
        // "sumber mana dicache" secara langsung.)
        const cachedSources = [];
        const originalCacheEntry = engine.cacheEntry.bind(engine);
        engine.cacheEntry = (sourceText, ...rest) => {
            cachedSources.push(sourceText);
            return originalCacheEntry(sourceText, ...rest);
        };

        const batch = entries(2);
        const result = await engine.translateBatch(batch, 'Malay', null, 0, 1, null, {});

        // Baris bermasalah tetap dipulangkan (fallback terbaik) — kontrak pipeline.
        assert.equal(result.length, 2, 'failed-retry entries must still be returned as best-effort fallback');
        // TAPI baris tersebut tidak boleh dicemarkan ke cache.
        assert.equal(
            cachedSources.includes(batch[0].text),
            false,
            'entry with unresolved hard defects must NOT be cached'
        );
        // Baris bersih dalam batch sama kekal dicache seperti biasa.
        assert.equal(cachedSources.includes(batch[1].text), true, 'clean entries in the same batch stay cached');

        // Muat semula modul enjin untuk state CACHE_TRANSLATIONS asal (false)
        // supaya test lain dalam suite ini tidak mewarisi cache aktif.
        delete require.cache[require.resolve('./translationEngine')];
    }
);

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

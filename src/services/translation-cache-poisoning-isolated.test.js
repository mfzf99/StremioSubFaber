// C1 terasing proses (M4-FIX 2026-11-14): fail ujian khusus CACHE_TRANSLATIONS=true.
// node --test menjalankan SETIAP fail .test.js dalam proses anak terpisah —
// env ini di-set SEBELUM require enjin, jadi tiada manipulasi require.cache
// dan keadaan modul dalam proses suite sentiasa bersih/deterministik.
// Definisi kecacatan (daripada audit 50e1a574): selepas retry mekanikal gagal,
// entri bermasalah masih ditulis ke cache (cache poisoning).
const { test } = require('node:test');
const assert = require('node:assert');

process.env.CACHE_TRANSLATIONS = 'true';
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

test('C1: entri gagal-retry dipulangkan sebagai fallback tetapi TIDAK ditulis ke cache', async () => {
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
    const engine = makeEngine(provider);
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
    assert.equal(cachedSources.includes(batch[0].text), false, 'entry with unresolved hard defects must NOT be cached');
    // Baris bersih dalam batch sama kekal dicache seperti biasa.
    assert.equal(cachedSources.includes(batch[1].text), true, 'clean entries in the same batch stay cached');
});

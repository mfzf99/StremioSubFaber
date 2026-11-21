/**
 * Sandbox Chunking & Context Tuning — Regression Tests (v3.39.7 Fasa 1, red-first)
 *
 * Kontrak gelung eksperimen lanjutan (model V4 diluluskan Owner 2026-11-20):
 * tiga medan tuning (batchSize / previousContextSize / futureContextSize)
 * berkongsi KEDUDUKAN yang sama dengan medan prompt sandbox — baris Redis live
 * `sandbox:prompt-config`, suis enabled tunggal, Save/Reset panel sedia ada.
 *
 * Rantaian kontrak yang dipin di sini:
 *   SBX-T1  liveStore.validateRow: integer dalam julat diterima; luar julat /
 *           bukan integer / jenis salah → fieldErrors[]; null/undefined sah.
 *   SBX-T2  liveStore.saveLiveRow/sanitizeRow: medan tuning dikekalkan pada
 *           persist & bacaan; baris LEGASI tanpa medan tuning kekal sah
 *           (backward compatible — semua nilai null).
 *   SBX-T3  resolver resolvePromptSandbox: memulangkan { tuning, tuningActive }
 *           daripada sumber aktif (injection uji-sahaja); enabled=false ATAU
 *           test-context-gated → tuning null (produksi tidak mewarnai CI).
 *   SBX-T4  Enjin: injection tuning {40,5,3} → engine.batchSize=40,
 *           tetingkap konteks 5/3; future=0 → subsequentContent kosong;
 *           previous=0 → previousContent kosong (0 ialah nilai sah eksplisit).
 *   SBX-T5  Enjin: TANPA override → 200/20/10 kekal (pin enjin tunggal).
 *   SBX-T6  Enjin: nilai baris rosak (401 / 'abc' melangkui sanitizeRow lama)
 *           → sanitasi defensif enjin kembali ke julat selamat tanpa gagal.
 *   SBX-T7  cacheKeys: prompt-sahaja aktif → kunci BYTE-IDENTIK dengan hari ini
 *           (universal-v7-sbx-{hash8}, sifar suffix); prompt+tuning → suffix
 *           -t{b|p|f}; tuning-sahaja → universal-v7-t{...}; tiada sandbox →
 *           universal-v7 tulen (kunci produksi tidak pernah tercemar).
 *   SBX-T8  XML hujung-ke-hujung: future=3 → blok <future_source> membawa
 *           tepat 3 baris sumber; previous=0 → tiada blok <previous_translated>.
 */

const test = require('node:test');
const assert = require('node:assert/strict');

process.env.ENTRY_CACHE_SIZE = '100';

const liveStore = require('./promptSandboxLiveStore');
const { __setPromptSandboxForTests, __resetPromptSandboxForTests } = require('../config/promptSandbox');
const TranslationEngine = require('./translationEngine');
const { generateCacheKeys } = require('../utils/cacheKeys');

const TUNING_ROW = {
    enabled: true,
    translationSystemTemplate: 'TEXT ${sourceLabel} -> ${targetLabel} ${fewShot}',
    malayFewShot: null,
    batchSize: 40,
    previousContextSize: 5,
    futureContextSize: 3
};

function makeEngine() {
    const dummyProvider = {
        translateSubtitle: async () => '',
        streamTranslateSubtitle: async () => '',
        estimateTokenCount: () => 10
    };
    return new TranslationEngine(dummyProvider, 'gemini-2.5-flash', {}, { providerName: 'gemini' });
}

function makeEntries(count, startId = 1) {
    return Array.from({ length: count }, (_, i) => ({
        id: startId + i,
        timecode: `00:00:${String(i % 60).padStart(2, '0')},000 --> 00:00:${String((i + 1) % 60).padStart(2, '0')},000`,
        text: `Entry ${startId + i} dialogue text`
    }));
}

test.afterEach(() => {
    __resetPromptSandboxForTests();
    liveStore.__resetLiveRowForTests();
});

// ── SBX-T1: validateRow menerima / menolak medan tuning ──────────────────
test('SBX-T1: validateRow — integer dalam julat sah; luar julat / bukan integer ditolak', () => {
    const ok = liveStore.validateRow({ ...TUNING_ROW, previousContextSize: 0, futureContextSize: 0 });
    assert.equal(ok.fieldErrors.length, 0, '0 ialah nilai sah eksplisit bagi konteks');

    const outOfRange = liveStore.validateRow({ ...TUNING_ROW, batchSize: 401 });
    assert.ok(
        outOfRange.fieldErrors.some((f) => f.field === 'batchSize'),
        'batchSize 401 → fieldErrors (max 400)'
    );
    const prevRange = liveStore.validateRow({ ...TUNING_ROW, previousContextSize: 31 });
    assert.ok(
        prevRange.fieldErrors.some((f) => f.field === 'previousContextSize'),
        'prev 31 → tolak (max 30)'
    );
    const futureRange = liveStore.validateRow({ ...TUNING_ROW, futureContextSize: 16 });
    assert.ok(
        futureRange.fieldErrors.some((f) => f.field === 'futureContextSize'),
        'future 16 → tolak (max 15)'
    );
    const batchMin = liveStore.validateRow({ ...TUNING_ROW, batchSize: 0 });
    assert.ok(
        batchMin.fieldErrors.some((f) => f.field === 'batchSize'),
        'batchSize 0 → tolak (min 1)'
    );

    for (const bad of ['abc', 1.5, true, {}, '40']) {
        const badType = liveStore.validateRow({ ...TUNING_ROW, batchSize: bad });
        assert.ok(
            badType.fieldErrors.some((f) => f.field === 'batchSize'),
            `batchSize ${JSON.stringify(bad)} → tolak (integer sahaja)`
        );
    }

    const nullOk = liveStore.validateRow({
        enabled: true,
        translationSystemTemplate: null,
        malayFewShot: null,
        batchSize: null,
        previousContextSize: null,
        futureContextSize: null
    });
    assert.equal(nullOk.fieldErrors.length, 0, 'null/undefined = default enjin (sah)');
});

// ── SBX-T2: persist + sanitizeRow kekal medan tuning; baris legasi sah ────
test('SBX-T2: saveLiveRow/sanitizeRow — medan tuning dikekalkan; baris legasi kekal sah', async () => {
    const adapterCalls = [];
    let persisted = null;
    liveStore.__setAdapterForTests({
        async get() {
            return persisted;
        },
        async set(_key, value) {
            adapterCalls.push(['set', value]);
            persisted = value;
            return true;
        },
        async delete() {
            persisted = null;
            return true;
        }
    });
    try {
        await liveStore.saveLiveRow({ ...TUNING_ROW });
        assert.equal(persisted.batchSize, 40, 'persist membawa batchSize');
        assert.equal(persisted.previousContextSize, 5, 'persist membawa previousContextSize');
        assert.equal(persisted.futureContextSize, 3, 'persist membawa futureContextSize');

        const row = liveStore.getLiveRow();
        assert.equal(row.batchSize, 40, 'snapshot pasca-save membawa batchSize');

        // Baris legasi (pra-v3.39.7, tiada medan tuning) mesti kekal sah.
        liveStore.__setLiveRowForTests({
            enabled: true,
            translationSystemTemplate: 'LEGACY ${sourceLabel} ${targetLabel} ${fewShot}',
            malayFewShot: null
        });
        const legacy = liveStore.getLiveRow();
        assert.equal(legacy.batchSize, null, 'baris legasi: batchSize null (default enjin)');
        assert.equal(legacy.previousContextSize, null, 'baris legasi: previousContextSize null');
        assert.equal(legacy.futureContextSize, null, 'baris legasi: futureContextSize null');
    } finally {
        liveStore.__setAdapterForTests(null);
        liveStore.__resetLiveRowForTests();
    }
});

// ── SBX-T3: resolver memulangkan tuning daripada sumber aktif ────────────
test('SBX-T3: resolvePromptSandbox — tuning aktif / disabled / test-gated', () => {
    const { resolvePromptSandbox } = require('../config/promptSandbox');
    const official = { officialTemplate: 'OFF', officialMalayFewShot: 'OFF-F' };

    __setPromptSandboxForTests({ ...TUNING_ROW });
    const on = resolvePromptSandbox(official);
    assert.deepEqual(on.tuning, { batchSize: 40, previousContextSize: 5, futureContextSize: 3 }, 'tuning aktif');
    assert.equal(on.tuningActive, true, 'tuningActive benar');

    __setPromptSandboxForTests({ ...TUNING_ROW, enabled: false });
    const off = resolvePromptSandbox(official);
    assert.equal(off.tuning, null, 'enabled=false → tiada tuning (gelung eksperimen tertutup)');
    assert.equal(off.tuningActive, false);

    __setPromptSandboxForTests(null);
    const noRow = resolvePromptSandbox(official);
    assert.equal(noRow.tuning, null, 'tiada baris → tuning null');
    assert.equal(noRow.tuningActive, false);
});

// ── SBX-T4: enjin memakan tuning — geometri & tetingkap konteks ───────────
test('SBX-T4: enjin — batchSize 40 + tetingkap 5/3 daripada baris sandbox', () => {
    __setPromptSandboxForTests({ ...TUNING_ROW });
    const engine = makeEngine();
    assert.equal(engine.batchSize, 40, 'engine.batchSize = 40 (override sandbox)');

    const entries = makeEntries(120);
    const batches = engine.createBatches(entries, engine.batchSize);
    assert.equal(batches.length, 3, 'geometri 3 batch × 40');

    const context = engine._prepareSubfaberContext(batches[1], entries, []);
    assert.equal(context.previousContent.length, 5, 'tetingkap previous = 5 baris');
    assert.equal(context.subsequentContent.length, 3, 'tetingkap future = 3 baris');
});

test('SBX-T4b: enjin — 0 konteks ialah nilai eksplisit (blok context gugur)', () => {
    __setPromptSandboxForTests({ ...TUNING_ROW, previousContextSize: 0, futureContextSize: 0 });
    const engine = makeEngine();
    const entries = makeEntries(90);
    const batches = engine.createBatches(entries, engine.batchSize);
    const context = engine._prepareSubfaberContext(batches[1], entries, []);
    assert.equal(context.previousContent.length, 0, 'previous=0 → tiada baris previous');
    assert.equal(context.subsequentContent.length, 0, 'future=0 → tiada baris future');
});

// ── SBX-T5: pin enjin tunggal — tanpa override kekal 200/20/10 ───────────
test('SBX-T5: enjin — TANPA sandbox aktif kekal 200/20/10 (pin formula Owner)', () => {
    const engine = makeEngine();
    assert.equal(engine.batchSize, 200, 'batchSize kekal 200');
    const entries = makeEntries(450);
    const batches = engine.createBatches(entries, engine.batchSize);
    const context = engine._prepareSubfaberContext(batches[1], entries, []);
    assert.equal(context.previousContent.length, 20, 'previous kekal 20');
    assert.equal(context.subsequentContent.length, 10, 'future kekal 10');
});

// ── SBX-T6: sanitasi defensif enjin terhadap nilai baris rosak ────────────
test('SBX-T6: enjin — nilai rosak (401 / string) disanitasi ke julat selamat tanpa gagal', () => {
    // __setPromptSandboxForTests melangkui validateRow (injection uji-sahaja) —
    // mensimulasikan baris Redis rosak ditulis oleh replika UI lama/hand-edit.
    __setPromptSandboxForTests({ ...TUNING_ROW, batchSize: 401, previousContextSize: 'abc', futureContextSize: -7 });
    const engine = makeEngine();
    assert.equal(engine.batchSize, 200, '401 → default 200 (bukan clamp — TOLAK semasa simpan, DEFAULT semasa baca)');
    assert.equal(engine.previousWindowSize, 20, "'abc' → default 20");
    assert.equal(engine.futureWindowSize, 10, '-7 → default 10');
});

// ── SBX-T7: cacheKeys — suffix geometri HANYA bila tuning hadir ───────────
test('SBX-T7: cacheKeys — prompt-sahaja byte-identik; +tuning → suffix; tuning-sahaja; produksi tulen', () => {
    const official = { officialTemplate: 'OFFICIAL', officialMalayFewShot: 'OFFICIAL-F' };
    const config = { __configHash: 'a'.repeat(64) };
    const { TRANSLATION_SYSTEM_TEMPLATE } = require('./prompts/trinity/translation/core');
    const { getLanguagePack } = require('./prompts/languagePacks');
    const realOfficial = {
        officialTemplate: TRANSLATION_SYSTEM_TEMPLATE,
        officialMalayFewShot: getLanguagePack('Malay').fewShot
    };

    // (a) Prompt-sahaja: kunci mesti BYTE-IDENTIK dengan pra-v3.39.7.
    __setPromptSandboxForTests({
        enabled: true,
        translationSystemTemplate: 'P ${sourceLabel} ${targetLabel} ${fewShot}',
        malayFewShot: null,
        batchSize: null,
        previousContextSize: null,
        futureContextSize: null
    });
    const promptOnly = generateCacheKeys(config, 'tt1', 'Malay');
    const { resolvePromptSandbox } = require('../config/promptSandbox');
    const eff = resolvePromptSandbox(realOfficial);
    assert.ok(promptOnly.baseKey.includes(`universal-v7-sbx-${eff.hash8}`), 'namespace prompt-sahaja kekal');
    assert.ok(!/-t[bpf]/.test(promptOnly.baseKey), 'TIADA suffix tuning bila tuning null');

    // (b) Prompt + tuning → suffix geometri lengkap (hash dikira SEMULA untuk
    // injection kes ini — bukan hash kes (a)).
    __setPromptSandboxForTests({ ...TUNING_ROW });
    const effBoth = resolvePromptSandbox(realOfficial);
    const both = generateCacheKeys(config, 'tt1', 'Malay');
    assert.ok(
        both.baseKey.includes(`universal-v7-sbx-${effBoth.hash8}-tb40p5f3`),
        `prompt+tuning → suffix -tb40p5f3 (actual: ${both.baseKey})`
    );

    // (c) Tuning-sahaja (tiada teks prompt) → namespace tuning tanpa hash prompt.
    __setPromptSandboxForTests({
        enabled: true,
        translationSystemTemplate: null,
        malayFewShot: null,
        batchSize: 40,
        previousContextSize: null,
        futureContextSize: 15
    });
    const tuningOnly = generateCacheKeys(config, 'tt1', 'Malay');
    assert.ok(tuningOnly.baseKey.includes('universal-v7-tb40f15'), 'tuning-sahaja → -tb40f15');
    assert.ok(!tuningOnly.baseKey.includes('-sbx-'), 'tiada hash prompt bila teks prompt null');

    // (d) Produksi (tiada sandbox) → universal-v7 tulen.
    __setPromptSandboxForTests(null);
    const prod = generateCacheKeys(config, 'tt1', 'Malay');
    assert.ok(prod.baseKey.includes('universal-v7'), 'produksi kekal universal-v7');
    assert.ok(!/-t[bpf]/.test(prod.baseKey), 'kunci produksi TIDAK pernah membawa suffix tuning');

    // Rujukan official tidak digunakan langsung oleh (a)-(d) selain hash — jaga.
    assert.ok(official.officialTemplate === 'OFFICIAL');
});

// ── SBX-T8: XML hujung-ke-hujung — blok konteks ikut tetingkap tuning ────
test('SBX-T8: XML — future=3 → <future_source> 3 baris; previous=0 → tiada <previous_translated>', () => {
    __setPromptSandboxForTests({ ...TUNING_ROW, previousContextSize: 0, futureContextSize: 3 });
    const engine = makeEngine();
    const entries = makeEntries(90);
    const batches = engine.createBatches(entries, engine.batchSize);
    const context = engine._prepareSubfaberContext(batches[0], entries, []);
    const batchText = batches[0].map((e) => `<s id="${e.id}">${e.text}</s>`).join('\n');
    const shared = engine._formatSharedContext(context, batchText);
    const futureBlock = shared.substring(shared.indexOf('<future_source'), shared.indexOf('</future_source>'));
    assert.ok(shared.includes('<future_source'), 'blok future hadir');
    assert.equal((futureBlock.match(/<s id="/g) || []).length, 3, 'tepat 3 baris sumber');
    assert.ok(!shared.includes('<previous_translated'), 'previous=0 → blok previous gugur sepenuhnya');
});

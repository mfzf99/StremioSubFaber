/**
 * Scene-Gap Cut Alignment — Regression Tests
 * (Owner Mandate 2026-11-19, Fasa 1 — CHATGPT_IDEAS_EVALUATION_2026-11-19.md §3.3)
 *
 * Kontrak deterministik (Basic & Pro — aras enjin, sifar panggilan AI):
 *   1. Potongan nominal 200-entri beralih ke jurang senyap TERBESAR dalam
 *      koridor ±20 entri (inklusif: [nominal-20, nominal+20]).
 *   2. Jurang senyap < 2,000ms diabaikan (ambang senyap munasabah).
 *   3. Seri (tie) → jurang TERAWAL menang (deterministik penuh).
 *   4. Fail pendek (< batchSize) → satu batch, tiada penjajaran.
 *   5. Timecode rosak/hilang → gap 0 → potongan nominal (defensif).
 *   6. Liputan 1:1: flat() == entries — ID & susunan terpelihara.
 *   7. Mod parallel berkongsi geometri sama (pembina tunggal createBatches).
 *   8. Input sama → geometri sama (dua panggilan, deepEqual).
 */
const test = require('node:test');
const assert = require('node:assert/strict');

// Stub dependencies sebelum require supaya engine dimuat tanpa Redis/env
process.env.ENTRY_CACHE_SIZE = '100';

const TranslationEngine = require('./translationEngine');

function makeEngine(advancedSettings = {}, options = {}) {
    const dummyProvider = {
        translateSubtitle: async () => '',
        streamTranslateSubtitle: async () => '',
        estimateTokenCount: () => 10
    };
    return new TranslationEngine(dummyProvider, 'gemini-2.5-flash', advancedSettings, {
        providerName: 'gemini',
        ...options
    });
}

const SHOW_MS = 1000;
const BASE_GAP_MS = 1000; // jurang lalai antara cue — di bawah ambang 2,000ms

function msToStamp(ms) {
    const h = String(Math.floor(ms / 3600000)).padStart(2, '0');
    const m = String(Math.floor((ms % 3600000) / 60000)).padStart(2, '0');
    const s = String(Math.floor((ms % 60000) / 1000)).padStart(2, '0');
    const t = String(ms % 1000).padStart(3, '0');
    return `${h}:${m}:${s},${t}`;
}

/**
 * Fixture ber masa sebenar. gapAfterMs[j] menambah senyap ekstra selepas
 * entri index j — jurang antara j dan j+1 = BASE_GAP_MS + gapAfterMs[j].
 */
function makeTimedEntries(count, gapAfterMs = {}) {
    const entries = [];
    let cursor = 0;
    for (let i = 0; i < count; i++) {
        entries.push({
            id: i + 1,
            timecode: `${msToStamp(cursor)} --> ${msToStamp(cursor + SHOW_MS)}`,
            text: `Line ${i + 1}`
        });
        cursor += SHOW_MS + BASE_GAP_MS + (gapAfterMs[i] || 0);
    }
    return entries;
}

// ── 1. REPRODUCE-FIRST (RED): pemotongan tegar membelah babak ──────────────
// 450 entri, jurang babak 30s selepas index 195 (dalam koridor potongan
// nominal 200 → [180..220]). Algoritma WAJIB alihkan potongan ke situ:
// batch1 = [0..195] = 196 entri. Batch2 nominal dari 196 (+200=396, koridor
// [376..416] — tiada jurang) = 200. Baki = 54.
test('RED-PROOF SceneGap: rigid 200 cut splits a scene — alignment moves cut to the silent gap', () => {
    const engine = makeEngine({});
    const entries = makeTimedEntries(450, { 195: 29000 });
    const batches = engine.createBatches(entries, engine.batchSize);
    assert.deepEqual(
        batches.map((b) => b.length),
        [196, 200, 54],
        'Cut must land on the 30s scene gap at cue 195; next nominal re-bases from the actual cut (196+200)'
    );
});

// ── 2. Liputan 1:1 + susunan ID ───────────────────────────────────────────
test('SceneGap: aligned batching preserves every entry in original ID order', () => {
    const engine = makeEngine({});
    const entries = makeTimedEntries(450, { 195: 29000 });
    const batches = engine.createBatches(entries, engine.batchSize);
    assert.deepEqual(batches.flat(), entries, 'flat() must equal the source entries (1:1 coverage)');
    assert.deepEqual(
        batches.flat().map((e) => e.id),
        entries.map((e) => e.id),
        'IDs stay in ascending source order'
    );
});

// ── 3. Koridor: sempadan inklusif ±20 ─────────────────────────────────────
test('SceneGap: corridor is inclusive ±20 — batch of 220 moves, 221 does not', () => {
    const engine = makeEngine({});
    // gap selepas index 219 → potongan c=220 → batch1 = 220 entri = +20 (tepisor inklusif)
    const atEdge = engine.createBatches(makeTimedEntries(450, { 219: 29000 }), 200);
    assert.deepEqual(
        atEdge.map((b) => b.length),
        [220, 200, 30],
        'Gap yielding batch length nominal+20 (cut at 220) is inside the corridor'
    );
    // gap selepas index 220 → potongan c=221 → batch1 = 221 entri = +21 (LUAR koridor)
    const outside = engine.createBatches(makeTimedEntries(450, { 220: 29000 }), 200);
    assert.deepEqual(
        outside.map((b) => b.length),
        [200, 200, 50],
        'Gap yielding batch length nominal+21 (cut at 221) must NOT move the cut'
    );
});

// ── 4. Ambang senyap: jurang < 2,000ms diabaikan ──────────────────────────
test('SceneGap: silence below the 2,000ms threshold is ignored (nominal cut kept)', () => {
    const engine = makeEngine({});
    // jurang jumlah = 1000 + 500 = 1500ms < 2000ms → nominal
    const entries = makeTimedEntries(450, { 195: 500 });
    const batches = engine.createBatches(entries, engine.batchSize);
    assert.deepEqual(
        batches.map((b) => b.length),
        [200, 200, 50],
        'Sub-threshold gap (1.5s) must not move the cut'
    );
});

// ── 5. Seri: jurang terawal menang ────────────────────────────────────────
test('SceneGap: equal gaps → earliest cut wins (deterministic tie-break)', () => {
    const engine = makeEngine({});
    const entries = makeTimedEntries(450, { 190: 29000, 210: 29000 });
    const batches = engine.createBatches(entries, engine.batchSize);
    assert.deepEqual(
        batches.map((b) => b.length),
        [191, 200, 59],
        'Two equal 30s gaps in corridor → cut at the earliest (index 190)'
    );
});

// ── 6. Fail pendek: satu batch ────────────────────────────────────────────
test('SceneGap: files shorter than batchSize stay a single batch', () => {
    const engine = makeEngine({});
    const entries = makeTimedEntries(150, { 75: 29000 });
    const batches = engine.createBatches(entries, engine.batchSize);
    assert.deepEqual(
        batches.map((b) => b.length),
        [150],
        'No alignment needed — single batch'
    );
});

// ── 7. Timecode hilang/rosak → defensif nominal ──────────────────────────
test('SceneGap: missing/invalid timecodes degrade to nominal cuts (gap 0)', () => {
    const engine = makeEngine({});
    const bare = Array.from({ length: 450 }, (_, i) => ({ id: i + 1, text: `Line ${i + 1}` }));
    assert.deepEqual(
        engine.createBatches(bare, 200).map((b) => b.length),
        [200, 200, 50],
        'Entries without timecode field → nominal rigid cuts'
    );
    const broken = Array.from({ length: 450 }, (_, i) => ({
        id: i + 1,
        timecode:
            i === 195
                ? 'not-a-timecode'
                : `00:00:${String(i % 60).padStart(2, '0')},000 --> 00:00:${String((i + 1) % 60).padStart(2, '0')},000`,
        text: `Line ${i + 1}`
    }));
    assert.deepEqual(
        engine.createBatches(broken, 200).map((b) => b.length),
        [200, 200, 50],
        'Unparseable timecode → gap 0 → nominal cut (defensive, no throw)'
    );
});

// ── 8. Determinisme penuh ─────────────────────────────────────────────────
test('SceneGap: same input → identical geometry on repeated calls', () => {
    const engine = makeEngine({});
    const entries = makeTimedEntries(450, { 195: 29000, 376: 29000 });
    const run1 = engine.createBatches(entries, engine.batchSize);
    const run2 = engine.createBatches(entries, engine.batchSize);
    assert.deepEqual(run1, run2, 'Deterministic: repeated calls must be identical');
});

// ── 9. Mod parallel berkongsi pembina tunggal ──────────────────────────────
test('SceneGap: parallel path uses the same aligned createBatches geometry', async () => {
    const { executeParallelTranslation } = require('../utils/parallelTranslation');
    const engine = makeEngine({ parallelBatchesCount: 1 });
    engine.enableStreaming = false;
    const lengths = [];
    engine.translateBatch = async (batch) => {
        lengths.push(batch.length);
        return batch.map((entry) => ({ ...entry, text: `Translated ${entry.id}` }));
    };

    const entries = makeTimedEntries(450, { 195: 29000 });
    const result = await executeParallelTranslation(engine, entries, 'Malay', null, null);
    lengths.sort((a, b) => a - b);
    assert.deepEqual(lengths, [54, 196, 200], 'Parallel batches must be 196/200/54 (aligned, re-based grid)');
    assert.deepEqual(
        result.map((e) => e.id),
        entries.map((e) => e.id),
        'Parallel result preserves ordered IDs'
    );
});

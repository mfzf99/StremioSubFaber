/**
 * Deterministic Whole-File Term-Drift Sweep — Regression Tests
 * (Owner Mandate 2026-11-19, Fasa 1 — CHATGPT_IDEAS_EVALUATION_2026-11-19.md §3.2)
 *
 * Kontrak (Pro SAHAYA, read-only telemetry, fail-open):
 *   1. sweepTermDrift(terms, entries) → { checked, consistent, drifted, absent, driftDetails }
 *   2. Padanan selamat imbuhan Melayu: 'Kapten' sepadan 'Kapten', 'Kapten-Kapten',
 *      'Kaptennya', 'sekapten' — sempadan token + toleransi awalan/akhiran.
 *   3. Drift = istilah muncul dalam bentuk SUMBER (untranslated leak) walaupun
 *      bentuk sasaran juga hadir. Absent = tiada bentuk sumber ATAU sasaran.
 *   4. Baca-sahaja: output entries TIDAK diubah (deepEqual sebelum/selepas).
 *   5. Fail-open: input rosak semua → kiraan 0, tiada throw.
 *   6. Mod Basic: gate mod menghalang sweep walaupun preflightContext disuntik.
 *   7. KNP terms + character canonical/direct addresses → senarai istilah dipantau.
 */
const test = require('node:test');
const assert = require('node:assert/strict');

process.env.ENTRY_CACHE_SIZE = '100';

const TranslationEngine = require('./translationEngine');
const { sweepTermDrift, collectDriftTermsFromKnp } = TranslationEngine;

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

// ── 1. Asas: konsisten vs hanyut (REPRODUCE-FIRST) ────────────────────────
test('RED-PROOF DriftSweep: source leak alongside target rendering → drift counted', () => {
    const terms = [
        { source: 'Headquarters', target: 'Ibu pejabat' },
        { source: 'Captain', target: 'Kapten' }
    ];
    const entries = [
        { id: 1, text: 'Ibu pejabat itu terancam.' },
        { id: 2, text: 'Headquarters is still online.' }, // leak sumber → drift
        { id: 3, text: 'Kapten tiba.' },
        { id: 4, text: 'Kapten-Kapten sedang berbincang.' }, // varian imbuhan → masih konsisten
        { id: 5, text: 'Kaptennya sudah sampai.' }
    ];
    const before = JSON.stringify(entries);
    const r = sweepTermDrift(terms, entries);

    assert.deepEqual(
        { checked: r.checked, consistent: r.consistent, drifted: r.drifted, absent: r.absent },
        { checked: 2, consistent: 1, drifted: 1, absent: 0 },
        'Headquarters: target + source leak → drift; Captain: only target-family variants → consistent'
    );
    assert.equal(JSON.stringify(entries), before, 'READ-ONLY: entries must not be mutated');
    assert.ok(Array.isArray(r.driftDetails), 'driftDetails is an array');
    assert.ok(
        r.driftDetails.some((d) => d.source === 'Headquarters'),
        'Drift detail identifies the term'
    );
});

// ── 2. Sempadan perkataan Melayu: imbuhan diterima ───────────────────────
test('DriftSweep: Malay affix tolerance — Kapten variants match one canonical target', () => {
    const terms = [{ source: 'Captain', target: 'Kapten' }];
    const variants = ['Kapten', 'Kapten-Kapten', 'Kaptennya', 'Kapten lah', 'sekapten'];
    const r = sweepTermDrift(
        terms,
        variants.map((t, i) => ({ id: i + 1, text: t }))
    );
    assert.equal(r.drifted, 0, `Affix variants must count as the same rendering: ${variants.join(', ')}`);
    assert.equal(r.consistent, 1);
    assert.equal(r.absent, 0);
});

// ── 3. Enti tiada dalam output → absent, bukan drift ──────────────────────
test('DriftSweep: term absent from output is counted absent, not drift', () => {
    const terms = [
        { source: 'Headquarters', target: 'Ibu pejabat' },
        { source: 'Captain', target: 'Kapten' }
    ];
    const r = sweepTermDrift(terms, [{ id: 1, text: 'Ibu pejabat itu.' }]);
    assert.equal(r.checked, 2, 'Both terms checked');
    assert.equal(r.absent, 1, 'Captain absent → absent counter');
    assert.equal(r.consistent, 1);
    assert.equal(r.drifted, 0, 'Absent is not drift');
});

// ── 4. Fail-open: input rosak ─────────────────────────────────────────────
test('DriftSweep: malformed inputs degrade to zeroes without throwing', () => {
    for (const bad of [null, undefined, 42, 'string']) {
        const r = sweepTermDrift(bad, [{ id: 1, text: 'x' }]);
        assert.equal(r.checked, 0, `terms=${String(bad)} → checked 0`);
        assert.equal(r.drifted, 0);
    }
    for (const bad of [null, undefined, 42]) {
        const r = sweepTermDrift([{ source: 'Captain', target: 'Kapten' }], bad);
        assert.equal(r.checked, 0, `entries=${String(bad)} → checked 0`);
    }
    const r = sweepTermDrift([{ source: 'Captain', target: 'Kapten' }], [null, {}, { text: 42 }]);
    assert.equal(r.checked, 1);
    assert.equal(r.drifted, 0);
});

// ── 5. Stats field wujud dengan nilai selamat ─────────────────────────────
test('DriftSweep: translationStats carries termDrift telemetry fields (default zeros)', () => {
    const engine = makeEngine({});
    assert.deepEqual(
        engine.translationStats.termDrift,
        { checked: 0, consistent: 0, drifted: 0, absent: 0 },
        'Default termDrift telemetry is present and zeroed'
    );
});

// ── 6. BASIC-MODE PURITY — gate mod (observable, bukan sekadar ketiadaan) ─
test('DriftSweep: Basic mode gate blocks sweep even with injected KNP (purity v3.9.51)', () => {
    const engine = makeEngine({}, { trinityMode: 'basic' });
    engine.preflightContext = {
        theme: 'A story.',
        terms: [{ source: 'Captain', type: 'object', target: 'Kapten' }],
        characters: [],
        credits_and_titles: []
    };
    const entries = [
        { id: 1, text: 'Kapten tiba.' },
        { id: 2, text: 'The Captain arrives.' } // kalau sweep jalan → drift
    ];
    const before = JSON.stringify(engine.translationStats.termDrift);
    engine._runTermDriftSweep(entries); // kaedah gate — mesti return awal dalam Basic
    assert.equal(JSON.stringify(engine.translationStats.termDrift), before, 'Basic stats unchanged');
    assert.equal(engine.translationStats.termDrift.drifted, 0);
});

// ── 6b. Pro mode: sweep mengisi stats ─────────────────────────────────────
test('DriftSweep: Pro mode populates termDrift stats from KNP (read-only on entries)', () => {
    const engine = makeEngine({}, { trinityMode: 'pro' });
    engine.preflightContext = {
        theme: 'A story.',
        terms: [{ source: 'Captain', type: 'object', target: 'Kapten' }],
        characters: [],
        credits_and_titles: []
    };
    const entries = [
        { id: 1, text: 'Kapten tiba.' },
        { id: 2, text: 'The Captain arrives.' }
    ];
    const before = JSON.stringify(entries);
    engine._runTermDriftSweep(entries);
    assert.equal(engine.translationStats.termDrift.checked, 1);
    assert.equal(engine.translationStats.termDrift.drifted, 1);
    assert.equal(JSON.stringify(entries), before, 'Sweep must not mutate subtitle entries');
});

// ── 6c. Fail-open peringkat enjin: KNP rosak → stats kekal sifar ──────────
test('DriftSweep: engine-level fail-open — malformed KNP leaves stats zeroed', () => {
    const engine = makeEngine({}, { trinityMode: 'pro' });
    engine.preflightContext = 'bukan objek';
    engine._runTermDriftSweep([{ id: 1, text: 'Kapten tiba.' }]);
    assert.equal(engine.translationStats.termDrift.checked, 0);
    assert.equal(engine.translationStats.termDrift.drifted, 0);
});

// ── 7. KNP terms + character names → senarai istilah ──────────────────────
test('DriftSweep: KNP term + character canonical/direct addresses become monitored terms', () => {
    const knp = {
        theme: 'A drama.',
        terms: [{ source: 'Headquarters', type: 'location', target: 'Ibu pejabat' }],
        characters: [
            { name: 'Shen', canonical_address: 'Puan Shen', direct_address: 'Mak Cik Shen', role: 'mentor' },
            { name: 'Ali', canonical_address: null, direct_address: null, role: 'lead' }
        ],
        credits_and_titles: []
    };
    const terms = collectDriftTermsFromKnp(knp);
    const pairs = terms.map((t) => `${t.source}→${t.target}`);
    assert.ok(pairs.includes('Headquarters→Ibu pejabat'));
    assert.ok(pairs.includes('Shen→Puan Shen'), 'canonical address monitored');
    assert.ok(pairs.includes('Shen→Mak Cik Shen'), 'direct address monitored');
    assert.equal(pairs.filter((p) => p.startsWith('Ali→')).length, 0, 'null addresses are NOT monitored');
    assert.deepEqual(collectDriftTermsFromKnp(null), [], 'null KNP → empty list (fail-open)');
});

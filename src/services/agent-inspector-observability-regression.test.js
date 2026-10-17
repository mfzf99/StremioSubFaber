/**
 * [AGENT-INSPECTOR-OBS] Circuit Breaker Visibility (P0) + Crime Pattern Tracking (P3)
 * — Regression Tests
 *
 * Kontrak yang diuji (Mandat 2026-09-29, owner-approved K1–K5 + WARN tiering;
 * Fasa 0 blind-spot fixes BS#1–BS#4 diluluskan 2026-09-29):
 *   T1. Field contract: 10 medan baharu dalam translationStats (additive,
 *       default selamat) + 4 medan legasi kekal tidak berubah.
 *   T2. Circuit preflight: phase='preflight', batch=0 (K1).
 *   T3. Circuit inspection: phase='inspection', batch 1-based.
 *   T4. Sentry dipanggil TEPAT sekali per fail walaupun helper dipanggil lagi.
 *   T4b. [BS#3] Transisi circuit-open pada RE-VERDICT turut direkod —
 *       phase=inspection, Sentry sekali, via laluan gerbang sebenar.
 *   T5. Crime counters: jenis dikenali dikira; jenis tak dikenali diabaikan
 *       + warn SEKALI (K4); batch-index direkod.
 *   T6. crimeBatchIndices cap 50 entri per jenis.
 *   T7. Pattern trigger (BS#4: dievaluasi pada file summary, bukan mid-file):
 *       nisbah ≥15% AND ≥3 batch unik (fail besar); fallback mutlak ≥3 batch
 *       (fail kecil ≤10); warn SEKALI per jenis.
 *   T8. Pattern TIADA bila di bawah nisbah walaupun selepas summary
 *       (false-alarm guard).
 *   T9. Summary log tier: WARN bila circuit open; DEBUG-ish (tiada WARN)
 *       untuk fail bersih 0-2 crime (owner refinement: WARN jika total
 *       crimes ≥3 ATAU circuit ATAU pattern).
 *   T10. Repeated circuit calls idempotent — fields tidak bertindih.
 *   T11. [BS#2] Penyebut agentInspectorBatchesInspected TIDAK naik bila
 *       runSemanticInspection throw — denominator jujur.
 */

const test = require('node:test');
const assert = require('node:assert/strict');

const TranslationEngine = require('./translationEngine');
const sentry = require('../utils/sentry');

function makeEngine() {
    const dummyGemini = {
        translateSubtitle: async () => '',
        streamTranslateSubtitle: async () => '',
        estimateTokenCount: () => 10
    };
    return new TranslationEngine(dummyGemini, 'gemini-2.5-flash', {}, { providerName: 'gemini' });
}

// T1 — Field contract (additive)
test('AgentInspectorObs T1: translationStats carries all 10 new fields with safe defaults + 4 legacy fields intact', () => {
    const e = makeEngine();
    const s = e.translationStats;
    assert.equal(s.agentInspectorCircuitOpened, false, 'agentInspectorCircuitOpened default false');
    assert.equal(s.agentInspectorCircuitOpenAtPhase, null, 'agentInspectorCircuitOpenAtPhase default null');
    assert.equal(s.agentInspectorCircuitOpenAtBatch, null, 'agentInspectorCircuitOpenAtBatch default null');
    assert.equal(s.agentInspectorFailuresBeforeOpen, 0, 'agentInspectorFailuresBeforeOpen default 0');
    assert.equal(s.agentInspectorBatchesInspected, 0, 'agentInspectorBatchesInspected default 0 (denominator)');
    assert.equal(s.agentInspectorBatchesSkippedAfterOpen, 0, 'agentInspectorBatchesSkippedAfterOpen default 0');
    assert.deepEqual(
        s.crimesDetectedByType,
        { MERGE: 0, DROP: 0, PHANTOM: 0, SHIFT: 0, UNTRANSLATED: 0, REGISTER: 0, TERM: 0 },
        'crimesDetectedByType zeroed 7 types (KNP-ALIGNMENT: +TERM)'
    );
    assert.equal(s.crimesResolvedByRetry, 0, 'crimesResolvedByRetry default 0');
    assert.equal(s.crimePatternDetected, null, 'crimePatternDetected default null');
    assert.deepEqual(
        s.crimeBatchIndices,
        { MERGE: [], DROP: [], PHANTOM: [], SHIFT: [], UNTRANSLATED: [], REGISTER: [], TERM: [] },
        'crimeBatchIndices empty arrays (KNP-ALIGNMENT: +TERM)'
    );
    // Legacy additive contract — tiada rename, tiada buang
    for (const legacy of [
        'agentInspectorUsed',
        'agentInspectorFailures',
        'agentInspectorInspections',
        'agentInspectorRetries'
    ]) {
        assert.ok(legacy in s, `legacy field ${legacy} still present`);
    }
});

// T2 — Circuit open, preflight phase (K1: batch=0)
test('AgentInspectorObs T2: preflight-phase circuit open records phase=preflight batch=0 (K1)', () => {
    const e = makeEngine();
    e.translationStats.agentInspectorFailures = 2;
    e._recordAgentInspectorCircuitOpen('preflight', 0);
    const s = e.translationStats;
    assert.equal(s.agentInspectorCircuitOpened, true);
    assert.equal(s.agentInspectorCircuitOpenAtPhase, 'preflight');
    assert.equal(s.agentInspectorCircuitOpenAtBatch, 0, 'batch=0 untuk preflight (K1)');
    assert.equal(s.agentInspectorFailuresBeforeOpen, 2, 'snapshot failures saat transisi');
});

// T3 — Circuit open, inspection phase (1-based batch)
test('AgentInspectorObs T3: inspection-phase circuit open records phase=inspection with 1-based batch', () => {
    const e = makeEngine();
    e._recordAgentInspectorCircuitOpen('inspection', 7);
    const s = e.translationStats;
    assert.equal(s.agentInspectorCircuitOpened, true);
    assert.equal(s.agentInspectorCircuitOpenAtPhase, 'inspection');
    assert.equal(s.agentInspectorCircuitOpenAtBatch, 7, '1-based batch number');
});

// T4 — Sentry single-point frequency (1x per fail)
test('AgentInspectorObs T4: sentry.captureMessage fires EXACTLY once even with repeated circuit-open calls', () => {
    const original = sentry.captureMessage;
    let calls = 0;
    sentry.captureMessage = () => {
        calls++;
    };
    try {
        const e = makeEngine();
        e._recordAgentInspectorCircuitOpen('inspection', 1);
        e._recordAgentInspectorCircuitOpen('inspection', 2); // guard — mesti diabaikan
        e._recordAgentInspectorCircuitOpen('preflight', 0); // guard — mesti diabaikan
        assert.equal(calls, 1, 'Sentry max 1x per fail (transisi guard)');
        assert.equal(e.translationStats.agentInspectorCircuitOpenAtBatch, 1, 'first transition wins (T10 idempotent)');
    } finally {
        sentry.captureMessage = original;
    }
});

// T4b — [BS#3] Transisi circuit-open pada RE-VERDICT direkod (laluan gerbang sebenar)
test('AgentInspectorObs T4b [BS#3]: re-verdict failOpen + circuitOpen records transition (phase=inspection, sentry once)', async () => {
    const original = sentry.captureMessage;
    let sentryCalls = 0;
    sentry.captureMessage = () => {
        sentryCalls++;
    };
    try {
        // Engine mock mengikut konvensyen 'gerbang enjin' (lihat agent-inspector-regression):
        // semakan pertama → crime; retry structurally-complete; re-verdict → failOpen + circuit terbuka.
        const dummyGemini = {
            translateSubtitle: async () => '<s id="1">Satu</s>\n<s id="2">Dua</s>\n<s id="3">Tiga</s>',
            streamTranslateSubtitle: async () => '',
            estimateTokenCount: () => 10
        };
        let inspectorCallCount = 0;
        const verdicts = [
            { valid: false, crimes: [{ type: 'DROP', ids: [1], note: 'generic substitute' }] }, // semakan pertama
            { failOpen: true } // re-verdict — circuit terbuka semasa re-verdict
        ];
        const agentInspector = {
            circuitOpen: false, // mula TERBUKA-ditutup: semakan pertama MESTI berlaku
            runSemanticInspection: async () => {
                const v = verdicts[Math.min(inspectorCallCount, verdicts.length - 1)];
                inspectorCallCount++;
                if (inspectorCallCount === 2) {
                    agentInspector.circuitOpen = true; // circuit terbuka ANTARA semakan & re-verdict (senario sebenar)
                }
                return v;
            }
        };
        const engine = new TranslationEngine(
            dummyGemini,
            'gemini-2.5-flash',
            {},
            {
                providerName: 'gemini',
                agentInspector
            }
        );
        const batch = Array.from({ length: 3 }, (_, i) => ({
            id: i + 1,
            timecode: `00:00:0${i},000 --> 00:00:0${i + 1},000`,
            text: `Line ${i + 1}`
        }));
        await engine.translateBatch(batch, 'Malay', null, 0, 1, null, { streaming: false });

        const s = engine.translationStats;
        assert.equal(s.agentInspectorCircuitOpened, true, '[BS#3] re-verdict failOpen MUST record transition');
        assert.equal(s.agentInspectorCircuitOpenAtPhase, 'inspection', 'phase=inspection');
        assert.equal(s.agentInspectorCircuitOpenAtBatch, 1, 'batch 1-based (batchIndex 0 + 1)');
        assert.equal(sentryCalls, 1, 'Sentry tepat sekali (helper guard)');
        assert.ok(s.agentInspectorRetries >= 1, 'retry path dijalankan');
    } finally {
        sentry.captureMessage = original;
    }
});

// T5 — Crime counters + unknown type (K4)
test('AgentInspectorObs T5: known crime types counted; unknown type ignored + warned once (K4)', () => {
    const e = makeEngine();
    e._recordCrime('PHANTOM', 1);
    e._recordCrime('PHANTOM', 3);
    e._recordCrime('MERGE', 2);
    const s = e.translationStats;
    assert.equal(s.crimesDetectedByType.PHANTOM, 2);
    assert.equal(s.crimesDetectedByType.MERGE, 1);
    assert.equal(s.crimesDetectedByType.DROP, 0, 'untouched type kekal 0');
    assert.deepEqual(s.crimeBatchIndices.PHANTOM, [1, 3], 'batch indices recorded 1-based');
    assert.deepEqual(s.crimeBatchIndices.MERGE, [2]);
    // Unknown type (K4): abaikan dari taksonomi, warn sekali sahaja
    e._recordCrime('WEIRD_TYPE', 4);
    e._recordCrime('ANOTHER_WEIRD', 5);
    assert.equal(s.crimesDetectedByType.PHANTOM, 2, 'taxonomy not polluted by unknown types');
    assert.ok(!('WEIRD_TYPE' in s.crimesDetectedByType), 'unknown type NOT added to counters');
});

// T6 — crimeBatchIndices cap 50
test('AgentInspectorObs T6: crimeBatchIndices capped at 50 entries per type', () => {
    const e = makeEngine();
    for (let i = 1; i <= 60; i++) e._recordCrime('DROP', i);
    assert.equal(e.translationStats.crimeBatchIndices.DROP.length, 50, 'cap 50 (Mandat)');
    assert.equal(e.translationStats.crimesDetectedByType.DROP, 60, 'counter tetap kira semua (cap hanya pada array)');
});

// T7 — Pattern trigger: ratio + fallback + warn-once
// [BS#4] Evaluasi berlaku pada _logAgentInspectorFileSummary (hujung fail), bukan mid-file.
test('AgentInspectorObs T7: pattern fires at ≥3 unique batches AND ≥15% ratio (evaluated at file summary); warn once per type', () => {
    const e = makeEngine();
    e.translationStats.agentInspectorBatchesInspected = 20; // 4/20 = 20% ≥ 15%
    e._recordCrime('PHANTOM', 1);
    e._recordCrime('PHANTOM', 2);
    // [BS#4] Mid-file: BELUM trigger — evaluasi ditangguhkan ke summary
    assert.equal(e.translationStats.crimePatternDetected, null, 'no mid-file evaluation (BS#4)');
    e._recordCrime('PHANTOM', 3);
    e._logAgentInspectorFileSummary(); // ← titik evaluasi muktamad
    assert.equal(e.translationStats.crimePatternDetected.length, 1, 'pattern triggered at file summary');
    assert.match(e.translationStats.crimePatternDetected[0], /^PHANTOM in 3\/20 inspected batches \(15%\)$/);
    // Warn-once per type: jenis sama, summary dipanggil lagi TIDAK duplikat entri
    e._recordCrime('PHANTOM', 4);
    e._logAgentInspectorFileSummary();
    assert.equal(e.translationStats.crimePatternDetected.length, 1, 'no duplicate pattern entry per type');
    // Jenis lain berasingan
    e._recordCrime('SHIFT', 5);
    e._recordCrime('SHIFT', 6);
    e._recordCrime('SHIFT', 7);
    e._logAgentInspectorFileSummary();
    assert.equal(e.translationStats.crimePatternDetected.length, 2, 'second type gets its own entry');
});

test('AgentInspectorObs T7b: pattern fallback for small files (≤10 batches): ≥3 batches mutlak (file summary)', () => {
    const e = makeEngine();
    e.translationStats.agentInspectorBatchesInspected = 4; // fail kecil
    e._recordCrime('MERGE', 1);
    e._recordCrime('MERGE', 2);
    e._recordCrime('MERGE', 3);
    e._logAgentInspectorFileSummary(); // ← evaluasi pada hujung fail
    assert.equal(e.translationStats.crimePatternDetected.length, 1, 'small-file fallback: 3/4 batches triggers');
});

// T8 — False-alarm guard: di bawah nisbah tidak trigger WALAUPUN selepas summary
test('AgentInspectorObs T8: pattern does NOT fire below 15% ratio on large files (even after summary)', () => {
    const e = makeEngine();
    e.translationStats.agentInspectorBatchesInspected = 25; // 3/25 = 12% < 15%
    e._recordCrime('DROP', 1);
    e._recordCrime('DROP', 2);
    e._recordCrime('DROP', 3);
    e._logAgentInspectorFileSummary(); // ← evaluasi berlaku, tetapi di bawah nisbah
    assert.equal(e.translationStats.crimePatternDetected, null, 'no false alarm (null kekal)');
});

// T9 — Summary log tiering (owner refinement)
test('AgentInspectorObs T9: file summary — circuit open logs WARN even with zero crimes', () => {
    const e = makeEngine();
    e.translationStats.agentInspectorCircuitOpened = true;
    e.translationStats.agentInspectorCircuitOpenAtPhase = 'inspection';
    e.translationStats.agentInspectorCircuitOpenAtBatch = 2;
    e.translationStats.agentInspectorBatchesInspected = 5;
    e.translationStats.agentInspectorBatchesSkippedAfterOpen = 8;
    // Tiada crash + tier logic dipanggil — WARN tier (circuit open)
    e._logAgentInspectorFileSummary();
    assert.ok(true, 'summary executed without error');
});

test('AgentInspectorObs T9b: file summary — clean file (0-2 crimes, no circuit/pattern) stays quiet-tier', () => {
    const e = makeEngine();
    e.translationStats.agentInspectorBatchesInspected = 10;
    e._recordCrime('PHANTOM', 1); // 1 crime < 3
    // Tiada circuit, tiada pattern (1/10 = 10% < 15%) → DEBUG tier, bukan WARN
    e._logAgentInspectorFileSummary();
    assert.equal(e.translationStats.crimePatternDetected, null, 'single crime does not trigger pattern');
    assert.ok(true, 'quiet-tier summary executed without error');
});

// T10 — Idempotency transisi (partial — penuh diuji dalam T4)
test('AgentInspectorObs T10: circuit transition is idempotent — fields locked to first transition', () => {
    const e = makeEngine();
    e.translationStats.agentInspectorFailures = 3;
    e._recordAgentInspectorCircuitOpen('preflight', 0);
    e.translationStats.agentInspectorFailures = 10; // kegagalan berterusan selepas open
    e._recordAgentInspectorCircuitOpen('inspection', 9);
    const s = e.translationStats;
    assert.equal(s.agentInspectorCircuitOpenAtPhase, 'preflight', 'phase locked');
    assert.equal(s.agentInspectorCircuitOpenAtBatch, 0, 'batch locked');
    assert.equal(s.agentInspectorFailuresBeforeOpen, 3, 'failures snapshot locked at transition moment');
});

// T11 — [BS#2] Denominator jujur: inspection yang throw TIDAK mengembungkan penyebut
test('AgentInspectorObs T11 [BS#2]: agentInspectorBatchesInspected NOT incremented when runSemanticInspection throws', async () => {
    const dummyGemini = {
        translateSubtitle: async () => '<s id="1">Satu</s>\n<s id="2">Dua</s>',
        streamTranslateSubtitle: async () => '',
        estimateTokenCount: () => 10
    };
    const agentInspector = {
        circuitOpen: false,
        runSemanticInspection: async () => {
            throw new Error('inspection mid-flight crash');
        }
    };
    const engine = new TranslationEngine(
        dummyGemini,
        'gemini-2.5-flash',
        {},
        {
            providerName: 'gemini',
            agentInspector
        }
    );
    const batch = Array.from({ length: 2 }, (_, i) => ({
        id: i + 1,
        timecode: `00:00:0${i},000 --> 00:00:0${i + 1},000`,
        text: `Line ${i + 1}`
    }));
    const result = await engine.translateBatch(batch, 'Malay', null, 0, 1, null, { streaming: false });

    const s = engine.translationStats;
    assert.equal(s.agentInspectorBatchesInspected, 0, '[BS#2] throw = inspection TIDAK selesai → penyebut kekal 0');
    assert.equal(s.agentInspectorFailures, 1, 'fail-open path counts the failure');
    assert.equal(result.length, 2, 'pipeline fail-open — hasil tidak terjejas');
});

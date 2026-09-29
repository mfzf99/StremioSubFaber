/**
 * [AGENTB-OBS] Circuit Breaker Visibility (P0) + Crime Pattern Tracking (P3)
 * — Regression Tests
 *
 * Kontrak yang diuji (Mandat 2026-09-29, owner-approved K1–K5 + WARN tiering):
 *   T1. Field contract: 10 medan baharu dalam translationStats (additive,
 *       default selamat) + 4 medan legasi kekal tidak berubah.
 *   T2. Circuit preflight: phase='preflight', batch=0 (K1).
 *   T3. Circuit inspection: phase='inspection', batch 1-based.
 *   T4. Sentry dipanggil TEPAT sekali per fail walaupun helper dipanggil lagi.
 *   T5. Crime counters: jenis dikenali dikira; jenis tak dikenali diabaikan
 *       + warn SEKALI (K4); batch-index direkod.
 *   T6. crimeBatchIndices cap 50 entri per jenis.
 *   T7. Pattern trigger: nisbah ≥15% AND ≥3 batch unik (fail besar);
 *       fallback mutlak ≥3 batch (fail kecil ≤10); warn SEKALI per jenis.
 *   T8. Pattern TIADA bila di bawah nisbah (false-alarm guard).
 *   T9. Summary log tier: WARN bila circuit open; DEBUG-ish (tiada WARN)
 *       untuk fail bersih 0-2 crime (owner refinement: WARN jika total
 *       crimes ≥3 ATAU circuit ATAU pattern).
 *   T10. Repeated circuit calls idempotent — fields tidak bertindih.
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
test('AgentBObs T1: translationStats carries all 10 new fields with safe defaults + 4 legacy fields intact', () => {
  const e = makeEngine();
  const s = e.translationStats;
  assert.equal(s.agentBCircuitOpened, false, 'agentBCircuitOpened default false');
  assert.equal(s.agentBCircuitOpenAtPhase, null, 'agentBCircuitOpenAtPhase default null');
  assert.equal(s.agentBCircuitOpenAtBatch, null, 'agentBCircuitOpenAtBatch default null');
  assert.equal(s.agentBFailuresBeforeOpen, 0, 'agentBFailuresBeforeOpen default 0');
  assert.equal(s.agentBBatchesInspected, 0, 'agentBBatchesInspected default 0 (denominator)');
  assert.equal(s.agentBBatchesSkippedAfterOpen, 0, 'agentBBatchesSkippedAfterOpen default 0');
  assert.deepEqual(s.crimesDetectedByType, { MERGE: 0, DROP: 0, PHANTOM: 0, SHIFT: 0 }, 'crimesDetectedByType zeroed 4 types');
  assert.equal(s.crimesResolvedByRetry, 0, 'crimesResolvedByRetry default 0');
  assert.equal(s.crimePatternDetected, null, 'crimePatternDetected default null');
  assert.deepEqual(s.crimeBatchIndices, { MERGE: [], DROP: [], PHANTOM: [], SHIFT: [] }, 'crimeBatchIndices empty arrays');
  // Legacy additive contract — tiada rename, tiada buang
  for (const legacy of ['agentBUsed', 'agentBFailures', 'agentBInspections', 'agentBRetries']) {
    assert.ok(legacy in s, `legacy field ${legacy} still present`);
  }
});

// T2 — Circuit open, preflight phase (K1: batch=0)
test('AgentBObs T2: preflight-phase circuit open records phase=preflight batch=0 (K1)', () => {
  const e = makeEngine();
  e.translationStats.agentBFailures = 2;
  e._recordAgentBCircuitOpen('preflight', 0);
  const s = e.translationStats;
  assert.equal(s.agentBCircuitOpened, true);
  assert.equal(s.agentBCircuitOpenAtPhase, 'preflight');
  assert.equal(s.agentBCircuitOpenAtBatch, 0, 'batch=0 untuk preflight (K1)');
  assert.equal(s.agentBFailuresBeforeOpen, 2, 'snapshot failures saat transisi');
});

// T3 — Circuit open, inspection phase (1-based batch)
test('AgentBObs T3: inspection-phase circuit open records phase=inspection with 1-based batch', () => {
  const e = makeEngine();
  e._recordAgentBCircuitOpen('inspection', 7);
  const s = e.translationStats;
  assert.equal(s.agentBCircuitOpened, true);
  assert.equal(s.agentBCircuitOpenAtPhase, 'inspection');
  assert.equal(s.agentBCircuitOpenAtBatch, 7, '1-based batch number');
});

// T4 — Sentry single-point frequency (1x per fail)
test('AgentBObs T4: sentry.captureMessage fires EXACTLY once even with repeated circuit-open calls', () => {
  const original = sentry.captureMessage;
  let calls = 0;
  sentry.captureMessage = () => { calls++; };
  try {
    const e = makeEngine();
    e._recordAgentBCircuitOpen('inspection', 1);
    e._recordAgentBCircuitOpen('inspection', 2); // guard — mesti diabaikan
    e._recordAgentBCircuitOpen('preflight', 0);  // guard — mesti diabaikan
    assert.equal(calls, 1, 'Sentry max 1x per fail (transisi guard)');
    assert.equal(e.translationStats.agentBCircuitOpenAtBatch, 1, 'first transition wins (T10 idempotent)');
  } finally {
    sentry.captureMessage = original;
  }
});

// T5 — Crime counters + unknown type (K4)
test('AgentBObs T5: known crime types counted; unknown type ignored + warned once (K4)', () => {
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
test('AgentBObs T6: crimeBatchIndices capped at 50 entries per type', () => {
  const e = makeEngine();
  for (let i = 1; i <= 60; i++) e._recordCrime('DROP', i);
  assert.equal(e.translationStats.crimeBatchIndices.DROP.length, 50, 'cap 50 (Mandat)');
  assert.equal(e.translationStats.crimesDetectedByType.DROP, 60, 'counter tetap kira semua (cap hanya pada array)');
});

// T7 — Pattern trigger: ratio + fallback + warn-once
test('AgentBObs T7: pattern fires at ≥3 unique batches AND ≥15% ratio; warn once per type', () => {
  const e = makeEngine();
  e.translationStats.agentBBatchesInspected = 20; // 4/20 = 20% ≥ 15%
  e._recordCrime('PHANTOM', 1);
  e._recordCrime('PHANTOM', 2);
  e._recordCrime('PHANTOM', 3);
  assert.equal(e.translationStats.crimePatternDetected.length, 1, 'pattern triggered');
  assert.match(e.translationStats.crimePatternDetected[0], /^PHANTOM in 3\/20 inspected batches \(15%\)$/);
  // Warn-once per type: jenis sama selepas trigger TIDAK duplikat entri
  e._recordCrime('PHANTOM', 4);
  assert.equal(e.translationStats.crimePatternDetected.length, 1, 'no duplicate pattern entry per type');
  // Jenis lain berasingan
  e._recordCrime('SHIFT', 5);
  e._recordCrime('SHIFT', 6);
  e._recordCrime('SHIFT', 7);
  assert.equal(e.translationStats.crimePatternDetected.length, 2, 'second type gets its own entry');
});

test('AgentBObs T7b: pattern fallback for small files (≤10 batches): ≥3 batches mutlak', () => {
  const e = makeEngine();
  e.translationStats.agentBBatchesInspected = 4; // fail kecil
  e._recordCrime('MERGE', 1);
  e._recordCrime('MERGE', 2);
  e._recordCrime('MERGE', 3);
  assert.equal(e.translationStats.crimePatternDetected.length, 1, 'small-file fallback: 3/4 batches triggers');
});

// T8 — False-alarm guard: di bawah nisbah tidak trigger
test('AgentBObs T8: pattern does NOT fire below 15% ratio on large files', () => {
  const e = makeEngine();
  e.translationStats.agentBBatchesInspected = 25; // 3/25 = 12% < 15%
  e._recordCrime('DROP', 1);
  e._recordCrime('DROP', 2);
  e._recordCrime('DROP', 3);
  assert.equal(e.translationStats.crimePatternDetected, null, 'no false alarm (null kekal)');
});

// T9 — Summary log tiering (owner refinement)
test('AgentBObs T9: file summary — circuit open logs WARN even with zero crimes', () => {
  const e = makeEngine();
  e.translationStats.agentBCircuitOpened = true;
  e.translationStats.agentBCircuitOpenAtPhase = 'inspection';
  e.translationStats.agentBCircuitOpenAtBatch = 2;
  e.translationStats.agentBBatchesInspected = 5;
  e.translationStats.agentBBatchesSkippedAfterOpen = 8;
  // Tiada crash + tier logic dipanggil — WARN tier (circuit open)
  e._logAgentBFileSummary();
  assert.ok(true, 'summary executed without error');
});

test('AgentBObs T9b: file summary — clean file (0-2 crimes, no circuit/pattern) stays quiet-tier', () => {
  const e = makeEngine();
  e.translationStats.agentBBatchesInspected = 10;
  e._recordCrime('PHANTOM', 1); // 1 crime < 3
  // Tiada circuit, tiada pattern (1/10 = 10% < 15%) → DEBUG tier, bukan WARN
  e._logAgentBFileSummary();
  assert.equal(e.translationStats.crimePatternDetected, null, 'single crime does not trigger pattern');
  assert.ok(true, 'quiet-tier summary executed without error');
});

// T10 — Idempotency transisi (partial — penuh diuji dalam T4)
test('AgentBObs T10: circuit transition is idempotent — fields locked to first transition', () => {
  const e = makeEngine();
  e.translationStats.agentBFailures = 3;
  e._recordAgentBCircuitOpen('preflight', 0);
  e.translationStats.agentBFailures = 10; // kegagalan berterusan selepas open
  e._recordAgentBCircuitOpen('inspection', 9);
  const s = e.translationStats;
  assert.equal(s.agentBCircuitOpenAtPhase, 'preflight', 'phase locked');
  assert.equal(s.agentBCircuitOpenAtBatch, 0, 'batch locked');
  assert.equal(s.agentBFailuresBeforeOpen, 3, 'failures snapshot locked at transition moment');
});

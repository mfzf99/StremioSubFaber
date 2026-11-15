const test = require('node:test');
const assert = require('node:assert/strict');

process.env.ENTRY_CACHE_SIZE = '100';

const TranslationEngine = require('./translationEngine');
const { validateMechanicalBatch, getHardMechanicalFindings } = require('./utils/mechanicalValidator');

function entry(id, text) {
    return { id, text, timecode: '00:00:01,000 --> 00:00:02,000' };
}

function translated(index, text) {
    return { index, text };
}

function response(entries) {
    return entries.map(({ id, text }) => `<s id="${id}">${text}</s>`).join('\n');
}

function makeEngine(provider, options = {}) {
    const engine = new TranslationEngine(
        {
            translateSubtitle: provider.translateSubtitle,
            streamTranslateSubtitle: async () => '',
            estimateTokenCount: () => 10
        },
        'gemini-2.5-flash',
        {},
        { providerName: 'gemini', ...options }
    );
    engine.sourceLanguage = 'English';
    return engine;
}

// ── [MONKEY-HARMONY A] Validator vs prompt Rule 4 conflict ──────────────────
// Template rule 4 (trinity/translation/core.js:31): "parenthesized cues like
// (sighs) are localized" — localized SDH cues with uppercase source text
// (e.g. "(IN KOREAN)") must NOT be reported as SPEAKER_LABEL_LOSS.

test('MONKEY-H1A: uppercase Rumi SDH cue localized per Rule 4 is not a speaker-label loss', () => {
    const source = [entry(101, '(IN KOREAN) Any last words?')];
    const output = [translated(0, '(dalam Bahasa Korea) Ada kata-kata terakhir?')];
    assert.deepEqual(getHardMechanicalFindings(validateMechanicalBatch(source, output, 'Malay')), []);
});

test('MONKEY-H1B: uppercase bracketed SDH cue localized per Rule 4 is not a speaker-label loss', () => {
    const source = [entry(102, '[THUNDER RUMBLES] She runs away.')];
    const output = [translated(0, '[Guruh menggagah] Dia lari.')];
    assert.deepEqual(getHardMechanicalFindings(validateMechanicalBatch(source, output, 'Malay')), []);
});

test('MONKEY-H1C: uppercase Rumi character-name label still must be preserved (conflict-free)', () => {
    const source = [entry(103, '(MARCUS) Any last words?')];
    const missing = [translated(0, 'Ada kata-kata terakhir?')];
    const findings = getHardMechanicalFindings(validateMechanicalBatch(source, missing, 'Malay'));
    assert.equal(findings.length, 1);
    assert.equal(findings[0].type, 'SPEAKER_LABEL_LOSS');

    // Preserved verbatim — no finding (existing behaviour stays intact).
    const preserved = [translated(0, '(MARCUS) Ada kata-kata terakhir?')];
    assert.deepEqual(getHardMechanicalFindings(validateMechanicalBatch(source, preserved, 'Malay')), []);
});

// ── [MONKEY-HARMONY B] CJK label SCRIPT_LEAK × SPEAKER_LABEL_LOSS double-bind ──
// A CJK source label （りん） that is preserved verbatim (the retry correction's
// own instruction) must not be re-flagged as SCRIPT_LEAK on a Rumi target:
// the label is a preserved speaker name, not leaked dialogue.

test('MONKEY-H2A: preserved CJK speaker label is exempt from SCRIPT_LEAK on Rumi target', () => {
    const source = [entry(201, '（りん） こんにちは')];
    const preserved = [translated(0, '（りん） Selamat pagi')];
    assert.deepEqual(getHardMechanicalFindings(validateMechanicalBatch(source, preserved, 'Malay')), []);
});

test('MONKEY-H2B: leaked CJK dialogue outside a speaker label still reports SCRIPT_LEAK', () => {
    const source = [entry(202, '（タカシ） 今日は良い天気ですね')];
    const leakedDialogue = [translated(0, '（タカシ） 今日は良い天気です')];
    const findings = getHardMechanicalFindings(validateMechanicalBatch(source, leakedDialogue, 'Malay'));
    assert.equal(findings.length, 1);
    assert.equal(findings[0].type, 'SCRIPT_LEAK');
});

test('MONKEY-H2C: transliterated CJK name on Rumi target is valid (no double-bind)', () => {
    const source = [entry(203, '（タカシ） さようなら')];
    const transliterated = [translated(0, '(Takashi) Selamat tinggal')];
    assert.deepEqual(getHardMechanicalFindings(validateMechanicalBatch(source, transliterated, 'Malay')), []);
});

// ── [MONKEY-HARMONY C] Retry acceptance discards a strictly-better retry ────
// Original defect fixed + one NEW hard defect on a previously-clean entry:
// the retry must still be accepted for the fixed entry, keep the original for
// the newly-defective entry, and the incident must close 'recovered_partial'.

test('MONKEY-H3: hybrid acceptance keeps fixed entries and originals for new defects', async () => {
    const calls = [];
    const engine = makeEngine(
        {
            translateSubtitle: async (_content, _source, _target, prompt) => {
                calls.push(prompt);
                return calls.length === 1
                    ? response([
                          { id: 1, text: '♪ Aku akan jumpa awak' }, // MUSIC_SYMBOL_LOSS (♪ dropped)
                          { id: 2, text: 'Baris bersih asal.' }
                      ])
                    : response([
                          { id: 1, text: '♪ Aku akan jumpa awak ♪' }, // original defect fixed
                          // NEW hard defect on a previously-clean entry: leaked
                          // CJK DIALOGUE (not a preserved speaker label — see
                          // MONKEY-H2B), so SCRIPT_LEAK still applies.
                          { id: 2, text: 'Baris 今日は良い天気です' }
                      ]);
            }
        },
        { trinityMode: 'basic', agentInspector: null }
    );
    const batch = [entry(1, '♪ I will find you ♪'), entry(2, 'A clean source line that translates fine.')];
    const result = await engine.translateBatch(batch, 'Malay', null, 0, 1, null, { streaming: false });

    assert.equal(calls.length, 2, 'mechanical retry must run');
    assert.equal(result[0].text, '♪ Aku akan jumpa awak ♪', 'fixed entry must come from the retry');
    assert.equal(result[1].text, 'Baris bersih asal.', 'newly-defective entry must keep the original');
    const incident = engine.translationStats.incidents.find(
        (i) => i.type === 'MECHANICAL_TRANSLATION_RETRY' && i.batch === 1
    );
    assert.equal(incident?.outcome, 'recovered_partial');
});

// ── [MONKEY-HARMONY D] Telegram outcome labels ─────────────────────────────
// renderIncidentSection must map the closed taxonomy instead of printing raw
// internal strings, and must never present an in_progress incident as
// '✅ recovered'.

test('MONKEY-H4: closed-taxonomy outcomes render human labels; in_progress is not recovered', async () => {
    const { renderIncidentSection } = require('../utils/telegramFinOps');
    const section = renderIncidentSection([
        { type: 'MECHANICAL_TRANSLATION_RETRY', batch: 3, recovery: 'full batch retry', outcome: 'unrecovered' },
        { type: 'MECHANICAL_TRANSLATION_RETRY', batch: 4, recovery: 'full batch retry', outcome: 'failed_structural' },
        {
            type: 'AGENT_INSPECTOR_SEMANTIC_RETRY',
            batch: 1,
            recovery: 'full batch retry',
            outcome: 'unsalvageable — best result kept'
        },
        { type: 'MISMATCH_RETRY', batch: 2, recovery: 'two-pass', outcome: 'recovered_partial' },
        { type: 'MISMATCH_RETRY', batch: 5, recovery: 'two-pass', outcome: 'in_progress' }
    ]);
    assert.ok(!section.includes('unrecovered'), 'raw taxonomy string must not leak');
    assert.ok(!section.includes('failed_structural'), 'raw taxonomy string must not leak');
    assert.ok(!section.includes('unsalvageable — best result kept'), 'raw taxonomy string must not leak');
    assert.ok(section.includes('partially recovered'));
    assert.ok(!section.includes('✅ recovered\n'), 'in_progress must not render as recovered');
});

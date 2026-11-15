const test = require('node:test');
const assert = require('node:assert/strict');

process.env.ENTRY_CACHE_SIZE = '100';

const TranslationEngine = require('./translationEngine');
const {
    buildCrimeCorrections,
    buildRetryDiagnosticBlock,
    injectRetryDiagnostics,
    preserveVerifiedEntries,
    selectRetryFindings
} = require('./utils/retryDiagnostics');

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

// [TOTAL-PURGE v3.36.0] Ujian validator mekanikal MONKEY dipadam bersama
// lapisan tersebut — perlindungan pasca-purge: tiada panggilan retry mekanikal
// (dipin dalam subfaber-monkey-total-purge-regression.test.js P2) dan laluan
// semantik Inspector kekal dipin di bawah.

test('Retry diagnostics map the seven semantic findings to explicit per-ID repairs', () => {
    const findings = [
        { type: 'MERGE', ids: [5, 6] }, // 2 IDs → 2 correction lines
        { type: 'DROP', ids: [7] },
        { type: 'PHANTOM', ids: [8] },
        { type: 'SHIFT', ids: [9] },
        { type: 'REGISTER', ids: [10] },
        { type: 'TERM', ids: [11] },
        { type: 'UNTRANSLATED', ids: [12] }
    ];
    const corrections = buildCrimeCorrections(findings, { targetLanguage: 'Malay' });
    assert.equal(corrections.length, 8);
    for (const finding of findings) {
        for (const id of finding.ids) {
            assert.ok(
                corrections.some((line) => line.startsWith(`- ID ${id} (${finding.type}):`)),
                `${finding.type} must map to ID ${id}`
            );
        }
    }
    assert.ok(corrections.find((line) => line.includes('ID 12'))?.includes('Malay'));
});

test('Punctuation and mechanical types are no longer part of retry diagnostics', () => {
    // [TOTAL-PURGE v3.36.0] Taksonomi mekanikal DIBUANG — entri sedemikian
    // tidak lagi menjana arahan pembetulan.
    const corrections = buildCrimeCorrections(
        [
            { type: 'SCRIPT_LEAK', ids: [1] },
            { type: 'SPEAKER_LABEL_LOSS', ids: [2] },
            { type: 'MUSIC_SYMBOL_LOSS', ids: [3] },
            { type: 'PUNCTUATION_MISMATCH', ids: [4] }
        ],
        { targetLanguage: 'Malay' }
    );
    assert.deepEqual(corrections, []);
});

test('selectRetryFindings is semantic-only and passes crimes through', () => {
    const crimes = [
        { type: 'DROP', ids: [1] },
        { type: 'UNTRANSLATED', ids: [3] }
    ];
    assert.deepEqual(selectRetryFindings(crimes), crimes);
    assert.deepEqual(selectRetryFindings([]), []);
    assert.deepEqual(selectRetryFindings(undefined), []);
});

test('Retry block preserves verified text, escapes markup, and leaves Gemini anchor last', () => {
    const block = buildRetryDiagnosticBlock({
        findings: [{ type: 'DROP', ids: [12] }],
        verifiedEntries: [{ id: 11, text: '<i>Baik & jaga diri</i>' }],
        targetLanguage: 'Malay'
    });
    assert.ok(block.includes('VERIFIED SLOTS (keep verbatim)'));
    assert.ok(block.includes('<s id="11"><i>Baik & jaga diri</i></s>'));
    assert.ok(block.indexOf('DROP') < block.indexOf('VERIFIED SLOTS'));

    const prompt = '<input>\n<s id="11">Source</s>\n</input>\n\n<answer>\n<s id="11">';
    const retryPrompt = injectRetryDiagnostics(prompt, block);
    assert.ok(retryPrompt.indexOf(block) < retryPrompt.lastIndexOf('<answer>'));
    assert.ok(retryPrompt.endsWith('<answer>\n<s id="11">'));
    const openAiRetry = injectRetryDiagnostics('data\n\nBegin your output with the <answer> block.', block);
    assert.ok(openAiRetry.indexOf(block) < openAiRetry.indexOf('Begin your output with the <answer> block.'));
});

test('Verified-slot merge restores the approved original text after a full-batch retry', () => {
    const original = [translated(0, 'Slot lulus'), translated(1, 'Slot rosak')];
    const retry = [translated(0, 'Model mengubah slot lulus'), translated(1, 'Slot dibaiki')];
    assert.deepEqual(preserveVerifiedEntries(original, retry, [0]), [
        translated(0, 'Slot lulus'),
        translated(1, 'Slot dibaiki')
    ]);
});

test('Basic mode never runs the Inspector and keeps the single translation call', async () => {
    let calls = 0;
    const engine = makeEngine(
        {
            translateSubtitle: async () => {
                calls++;
                // Jawapan lengkap 3/3 — tiada mismatch struktur, tiada
                // retry apa-apa jenis; entri bermasalah (dahulu hard
                // MONKEY) diterima seadanya tanpa panggilan kedua.
                return response([
                    { id: 11, text: '(John) Ke mana awak pergi?' },
                    { id: 12, text: 'Saya pulang.' },
                    { id: 13, text: '（りん） Apa yang berlaku!' }
                ]);
            }
        },
        { trinityMode: 'basic', agentInspector: null }
    );
    const batch = [
        entry(11, '(John) Where are you going?'),
        entry(12, 'I am going home.'),
        entry(13, 'What is happening!')
    ];
    const result = await engine.translateBatch(batch, 'Malay', null, 0, 1, null, { streaming: false });

    assert.equal(calls, 1, 'complete structural output → exactly one call, no retry of any kind');
    assert.equal(engine.agentInspector, null);
    assert.equal(engine.translationStats.agentInspectorRetries, 0);
    assert.deepEqual(
        result.map(({ text }) => text),
        ['(John) Ke mana awak pergi?', 'Saya pulang.', '（りん） Apa yang berlaku!']
    );
});

test('Pro retry combines Inspector crimes into per-ID corrections, then restores untouched verified slots', async () => {
    const prompts = [];
    let calls = 0;
    const engine = makeEngine(
        {
            translateSubtitle: async (_content, _source, _target, prompt) => {
                prompts.push(prompt);
                calls++;
                return response([
                    { id: 1, text: calls === 1 ? 'Satu lulus' : 'Satu dibaiki' },
                    { id: 2, text: calls === 1 ? 'Dua rosak' : 'Dua dibaiki' },
                    { id: 3, text: calls === 1 ? 'Tiga lulus' : 'Tiga jangan berubah' }
                ]);
            }
        },
        {
            trinityMode: 'pro',
            agentInspector: {
                circuitOpen: false,
                runSemanticInspection: async () =>
                    calls === 1
                        ? { valid: false, crimes: [{ type: 'MERGE', ids: [2], note: 'merged content' }] }
                        : { valid: true }
            }
        }
    );
    const batch = [entry(1, 'I am going home.'), entry(2, 'Second line'), entry(3, 'Third line')];
    const result = await engine.translateBatch(batch, 'Malay', null, 0, 1, null, { streaming: false });
    assert.equal(calls, 2, 'original + Inspector retry');
    assert.ok(prompts[1].includes('ID 2 (MERGE)'), 'semantic retry carries the Inspector crime verbatim');
    assert.ok(prompts[1].includes('<s id="3">Tiga lulus</s>'));
    assert.equal(result[2].text, 'Tiga lulus');
});

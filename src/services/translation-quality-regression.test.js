const test = require('node:test');
const assert = require('node:assert/strict');

process.env.ENTRY_CACHE_SIZE = '100';

const TranslationEngine = require('./translationEngine');
const { validateMechanicalBatch, getHardMechanicalFindings } = require('./utils/mechanicalValidator');
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

test('Mechanical validator detects only the four objective retry defects', () => {
    const source = [
        entry(41, 'これはテストです'),
        entry(42, '(John) Where are you going?'),
        entry(43, '♪ This is singing ♪'),
        entry(44, 'This sentence must be translated.'),
        entry(45, 'Where are you?')
    ];
    const output = [
        translated(0, 'Ini ialah テスト'),
        translated(1, 'Ke mana awak pergi?'),
        translated(2, 'Ini nyanyian'),
        translated(3, 'This sentence must be translated.'),
        translated(4, 'Ke mana awak?')
    ];

    const findings = validateMechanicalBatch(source, output, 'Malay');
    const hard = getHardMechanicalFindings(findings);
    assert.deepEqual(
        hard.map(({ type, ids }) => ({ type, ids })),
        [
            { type: 'SCRIPT_LEAK', ids: [41] },
            { type: 'SPEAKER_LABEL_LOSS', ids: [42] },
            { type: 'MUSIC_SYMBOL_LOSS', ids: [43] },
            { type: 'VERBATIM_UNTRANSLATED', ids: [44] }
        ]
    );
    assert.equal(
        findings.some(({ type }) => type === 'PUNCTUATION_MISMATCH'),
        false
    );
    assert.equal(
        hard.some(({ ids }) => ids.includes(45)),
        false
    );
});

test('Mechanical validator avoids script, SDH, name, interjection, and punctuation false positives', () => {
    const source = [
        entry(1, 'مرحبا بالعالم'),
        entry(2, 'これはテストです'),
        entry(3, '[sighs]'),
        entry(4, 'São Paulo'),
        entry(5, 'Okay!'),
        entry(6, 'Are you coming?'),
        entry(7, '♪ Singing ♪')
    ];
    const malay = [
        translated(0, 'Helo dunia'),
        translated(1, 'Ini ujian'),
        translated(2, '[mengeluh]'),
        translated(3, 'SãoPaulo'),
        translated(4, 'Okay!'),
        translated(5, 'Awak datang.'),
        translated(6, '♪ Menyanyi ♪')
    ];
    const findings = validateMechanicalBatch(source, malay, 'Malay');
    const hard = getHardMechanicalFindings(findings);
    assert.deepEqual(hard, []);
    assert.deepEqual(
        findings.filter(({ type }) => type === 'PUNCTUATION_MISMATCH').map(({ ids }) => ids),
        [[6]]
    );
    assert.deepEqual(selectRetryFindings(findings), [], 'punctuation alone must never trigger retry');

    const nonRumi = [translated(0, 'مرحبا بالعالم'), translated(1, 'これはテストです')];
    assert.deepEqual(
        getHardMechanicalFindings(
            validateMechanicalBatch([entry(1, 'Hello world')], [{ index: 0, text: nonRumi[0].text }], 'Arabic')
        ),
        []
    );
    const japaneseOutput = [{ index: 0, text: nonRumi[1].text }];
    assert.deepEqual(
        getHardMechanicalFindings(validateMechanicalBatch([entry(1, 'Hello world')], japaneseOutput, 'Japanese')),
        []
    );
});

test('Speaker-label checks accept preserved labels and ignore lowercase sound cues', () => {
    const source = [entry(8, '[MARY] Listen.'), entry(9, '(Dr. Reyes) Come here.'), entry(10, '(sighs)')];
    const output = [
        translated(0, '[MARY] Dengar.'),
        translated(1, '(Dr. Reyes) Mari sini.'),
        translated(2, '(mengeluh)')
    ];
    assert.deepEqual(getHardMechanicalFindings(validateMechanicalBatch(source, output, 'ms')), []);
});

test('Script leakage still retries validly into Rumi targets without misclassifying non-Rumi output', () => {
    assert.equal(
        getHardMechanicalFindings(
            validateMechanicalBatch([entry(1, 'これはテストです')], [translated(0, 'これはテストです')], 'Malay')
        )[0]?.type,
        'SCRIPT_LEAK'
    );
    assert.deepEqual(
        getHardMechanicalFindings(
            validateMechanicalBatch([entry(1, 'これはテストです')], [translated(0, 'これはテストです')], 'Japanese')
        ),
        []
    );
});

test('Retry diagnostics map all mechanical and seven semantic findings to explicit per-ID repairs', () => {
    const findings = [
        { type: 'SCRIPT_LEAK', ids: [1] },
        { type: 'SPEAKER_LABEL_LOSS', ids: [2] },
        { type: 'MUSIC_SYMBOL_LOSS', ids: [3] },
        { type: 'VERBATIM_UNTRANSLATED', ids: [4] },
        { type: 'MERGE', ids: [5, 6] },
        { type: 'DROP', ids: [7] },
        { type: 'PHANTOM', ids: [8] },
        { type: 'SHIFT', ids: [9] },
        { type: 'REGISTER', ids: [10] },
        { type: 'TERM', ids: [11] },
        { type: 'UNTRANSLATED', ids: [12] }
    ];
    const corrections = buildCrimeCorrections(findings, { targetLanguage: 'Malay' });
    assert.equal(corrections.length, 12, 'contextual UNTRANSLATED replaces the duplicate mechanical type');
    for (const finding of findings) {
        for (const id of finding.ids) {
            assert.ok(
                corrections.some((line) => line.startsWith(`- ID ${id} (${finding.type}):`)),
                `${finding.type} must map to ID ${id}`
            );
        }
    }
    assert.ok(corrections.find((line) => line.includes('ID 4'))?.includes('Malay'));
});

test('Piggyback punctuation appears only when another finding already fails the batch', () => {
    const punctuation = [{ type: 'PUNCTUATION_MISMATCH', ids: [3], note: 'question mark differs' }];
    assert.deepEqual(selectRetryFindings(punctuation), []);
    assert.equal(selectRetryFindings(punctuation, [{ type: 'DROP', ids: [1] }]).length, 2);
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

test('Basic mode retries a mechanical defect without Inspector and keeps verified slots unchanged', async () => {
    const prompts = [];
    const contents = [];
    const replies = [
        response([
            { id: 11, text: '(John) Ke mana awak pergi?' },
            { id: 12, text: 'I am going home.' },
            { id: 13, text: 'Apa yang berlaku!' }
        ]),
        response([
            { id: 11, text: '(John) Model merosakkan slot lulus' },
            { id: 12, text: 'Saya pulang.' },
            { id: 13, text: 'Apa yang berlaku!' }
        ])
    ];
    const engine = makeEngine(
        {
            translateSubtitle: async (content, _source, _target, prompt) => {
                contents.push(content);
                prompts.push(prompt);
                return replies[contents.length - 1];
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

    assert.equal(contents.length, 2, 'Basic mechanical retry must run without Inspector');
    assert.equal(contents[1], contents[0], 'retry must resend the complete original input batch');
    assert.deepEqual(
        result.map(({ text }) => text),
        ['(John) Ke mana awak pergi?', 'Saya pulang.', 'Apa yang berlaku!']
    );
    assert.ok(prompts[1].includes('ID 12 (VERBATIM_UNTRANSLATED)'));
    assert.ok(prompts[1].includes('VERIFIED SLOTS (keep verbatim)'));
    assert.ok(prompts[1].trimEnd().endsWith('<answer>\n<s id="11">'));
    assert.equal(engine.agentInspector, null);
    assert.equal(engine.translationStats.agentInspectorRetries, 0);
    const incident = engine.translationStats.incidents.find(({ type }) => type === 'MECHANICAL_TRANSLATION_RETRY');
    assert.equal(incident?.outcome, 'recovered');
});

test('Basic punctuation mismatch alone never spends a retry', async () => {
    let calls = 0;
    const engine = makeEngine(
        {
            translateSubtitle: async () => {
                calls++;
                return '<s id="1">Awak datang.</s>';
            }
        },
        { trinityMode: 'basic', agentInspector: null }
    );
    const result = await engine.translateBatch([entry(1, 'Are you coming?')], 'Malay', null, 0, 1, null, {
        streaming: false
    });
    assert.equal(calls, 1);
    assert.equal(result[0].text, 'Awak datang.');
});

test('Pro retry combines Inspector and JS findings, then restores untouched verified slots', async () => {
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
    assert.ok(!prompts[1].includes('ID 1 (VERBATIM_UNTRANSLATED)'), 'no mechanical finding for a valid translated slot');
    assert.ok(prompts[1].includes('ID 2 (MERGE)'), 'semantic retry carries the Inspector crime verbatim');
    assert.ok(prompts[1].includes('<s id="3">Tiga lulus</s>'));
    assert.equal(result[2].text, 'Tiga lulus');
});

test('An unresolved mechanical retry keeps the original aligned result', async () => {
    let calls = 0;
    const engine = makeEngine(
        {
            translateSubtitle: async () => {
                calls++;
                return '<s id="1">This sentence must be translated.</s>';
            }
        },
        { trinityMode: 'basic', agentInspector: null }
    );
    const result = await engine.translateBatch(
        [entry(1, 'This sentence must be translated.')],
        'Malay',
        null,
        0,
        1,
        null,
        { streaming: false }
    );
    assert.equal(calls, 2);
    assert.equal(result[0].text, 'This sentence must be translated.');
    assert.equal(
        engine.translationStats.incidents.find(({ type }) => type === 'MECHANICAL_TRANSLATION_RETRY')?.outcome,
        'failed'
    );
});

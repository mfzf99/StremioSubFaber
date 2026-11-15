/**
 * Trinity Prompt Matrix Regression (Fasa 2, Mandat Owner 2026-10-19)
 *
 * Matriks 9 sel (3 agen × 3 pintu) — mengunci kontrak channel-native setiap
 * gabungan (plans/trinity-channel-native-prompts.md §4.1):
 *
 *   GEMINI:    systemInstruction-ready (systemPrompt terpisah); prefill
 *              anchor EKSKLUSIF laluan Translation; tiada response_format.
 *   OPENAI:    peranan system/developer; json_schema strict WAJIB bagi
 *              Preflight & Inspector (mazhab rasmi tunggal — sifar sub-mod);
 *              Translation anchor = arahan eksplisit (bukan prefill).
 *   ANTHROPIC: susunan DATA-DAHULU (data di atas, query di hujung);
 *              SIFAR PREFILL; tag XML pembatas.
 *
 * Parity & Anti-Drift: taksonomi core mesti hadir dalam KESEMUHA varian
 * tanpa keciciran (frasa kanonik diuji merentas 9 sel).
 *
 * SIFAR wiring produksi — suite ini menguji wrapper secara unit sahaja.
 */

const test = require('node:test');
const assert = require('node:assert');
const {
    resolveTrinityPrompt,
    getTrinityCore,
    PREFLIGHT_SCHEMA_CONTRACT,
    INSPECTOR_SCHEMA_CONTRACT
} = require('./prompts/trinity');
const { getLanguagePack } = require('./prompts/languagePacks');

// ── Fixtures: interpolasi core seperti runtime produksi ──
// [TOTAL-PURGE v3.36.0] Preflight neutral-global — TIADA interpolasi pack.

function interpolatePreflightSystem() {
    const core = getTrinityCore('preflight');
    return core.PREFLIGHT_STATIC_TEMPLATE.replaceAll('${src}', 'English').replaceAll('${tgt}', 'Malay');
}

function interpolateTranslationSystem() {
    const core = getTrinityCore('translation');
    const pack = getLanguagePack('Malay');
    return core.TRANSLATION_SYSTEM_TEMPLATE.replaceAll('${sourceLabel}', 'English')
        .replaceAll('${targetLabel}', 'Malay')
        .replaceAll('${targetLabelShort}', 'Malay')
        .replaceAll('${fewShot}', pack.fewShot);
}

function interpolateInspectorSystem() {
    const core = getTrinityCore('inspector');
    return core.INSPECTOR_INSTRUCTION;
}

function preflightPayload() {
    return {
        systemText: interpolatePreflightSystem(),
        dataText: '<text>\nDialogue line alpha.\nDialogue line beta.\n</text>',
        queryText: 'Apply the tasks above to this subtitle dialogue and return ONLY the JSON object.'
    };
}

function translationPayload() {
    return {
        systemText: interpolateTranslationSystem(),
        dataText: '## Batch Context\n(Reference only.)\n\n<input>\n<s id="11">Hello there.</s>\n</input>',
        queryText: 'Translate the active entries above.',
        startId: '11'
    };
}

function inspectorPayload() {
    return {
        systemText: interpolateInspectorSystem(),
        dataText: '## Input\n<source>\n11|Hello there.\n</source>\n<translation>\n11|Hai semua.\n</translation>',
        queryText: 'Respond with ONLY the JSON now.'
    };
}

const PAYLOADS = {
    preflight: preflightPayload,
    translation: translationPayload,
    inspector: inspectorPayload
};

// ── 1. Matriks 9 sel: kontrak spesifik pintu ──

test('[MATRIX preflight×gemini] system terpisah, tiada prefill, tiada response_format', () => {
    const build = resolveTrinityPrompt('preflight', 'gemini');
    const out = build(preflightPayload());
    assert.equal(out.channel, 'gemini');
    assert.ok(out.systemPrompt.includes('DECISION DISCIPLINE'), 'static discipline in system');
    assert.ok(!out.systemPrompt.includes('Dialogue line alpha'), 'system bebas data dinamik');
    assert.ok(out.userPrompt.includes('Dialogue line alpha'), 'data dinamik dalam user');
    assert.equal(out.prefill, undefined, 'Gemini preflight TIADA prefill');
    assert.equal(out.responseFormat, undefined, 'Gemini preflight TIADA response_format');
});

test('[MATRIX preflight×openai] json_schema strict wajib (mazhab rasmi tunggal)', () => {
    const build = resolveTrinityPrompt('preflight', 'openai');
    const out = build(preflightPayload());
    assert.equal(out.channel, 'openai');
    assert.equal(out.systemRole, 'system', 'lalai system role standard');
    assert.equal(out.responseFormat.type, 'json_schema');
    assert.equal(out.responseFormat.json_schema.strict, true, 'strict:true WAJIB');
    assert.equal(out.responseFormat.json_schema, PREFLIGHT_SCHEMA_CONTRACT, 'skema dari core kanonik');
    assert.deepEqual(
        out.responseFormat.json_schema.schema.required,
        ['theme', 'terms', 'characters', 'credits_and_titles'],
        '4-tiang wajib dalam skema strict'
    );
    assert.equal(out.prefill, undefined, 'sifar prefill');
});

test('[MATRIX preflight×openai] developer role melalui options (keserasian endpoint)', () => {
    const build = resolveTrinityPrompt('preflight', 'openai');
    const out = build(preflightPayload(), { systemRole: 'developer' });
    assert.equal(out.systemRole, 'developer');
});

test('[MATRIX preflight×anthropic] data-first + sifar prefill + tag XML pembatas', () => {
    const build = resolveTrinityPrompt('preflight', 'anthropic');
    const out = build(preflightPayload());
    assert.equal(out.channel, 'anthropic');
    assert.ok(out.userPrompt.startsWith('<subtitle_text>'), 'data dinamik di BAHAGIAN ATAS');
    const dataIdx = out.userPrompt.indexOf('Dialogue line alpha');
    const queryIdx = out.userPrompt.lastIndexOf('Apply the tasks above');
    assert.ok(dataIdx !== -1 && queryIdx !== -1 && dataIdx < queryIdx, 'query di BAHAGIAN HUJUNG');
    assert.equal(out.prefill, undefined, 'SIFAR PREFILL (Claude 4.6+ / thinking)');
    assert.equal(out.responseFormat, undefined, 'Anthropic tiada response_format');
});

test('[MATRIX translation×gemini] prefill continuation anchor EKSKLUSIF', () => {
    const build = resolveTrinityPrompt('translation', 'gemini');
    const out = build(translationPayload());
    assert.equal(out.channel, 'gemini');
    assert.ok(out.userPrompt.endsWith('<answer>\n<s id="11">'), 'anchor di HUJUNG user content');
    assert.equal(out.prefill, '<answer>\n<s id="11">', 'medan prefill eksplisit');
    // [STREAMLINE 2026-11-15] Templat streamline Owner — kontrak parity baharu.
    assert.ok(
        out.systemPrompt.includes('Output exactly one <s id="N"> per <input> entry'),
        'rules parity dalam system'
    );
    assert.ok(!out.systemPrompt.includes('<s id="11">'), 'system bebas data batch');
});

test('[MATRIX translation×openai] anchor = ARAHAN EKSPLISIT (bukan prefill mekanikal)', () => {
    const build = resolveTrinityPrompt('translation', 'openai');
    const out = build(translationPayload());
    assert.equal(out.channel, 'openai');
    assert.equal(out.prefill, undefined, 'sifar prefill mekanikal');
    assert.equal(out.responseFormat, undefined, 'Translation ialah agent teks — tiada json_schema');
    assert.ok(
        out.userPrompt.includes('Begin your output with the <answer> block, starting with the first entry <s id="11">'),
        'anchor disebut sebagai arahan eksplisit'
    );
    assert.ok(!out.userPrompt.endsWith('<s id="11">'), 'user prompt TIDAK berakhir dengan anchor continuation');
});

test('[MATRIX translation×anthropic] data-first + tag XML + sifar prefill', () => {
    const build = resolveTrinityPrompt('translation', 'anthropic');
    const out = build(translationPayload());
    assert.equal(out.channel, 'anthropic');
    assert.ok(out.userPrompt.startsWith('<subtitle_input>'), 'data dinamik di ATAS (tag XML pembatas)');
    const dataIdx = out.userPrompt.indexOf('<s id="11">');
    const queryIdx = out.userPrompt.lastIndexOf('Write your answer inside a single <answer> block');
    assert.ok(dataIdx !== -1 && queryIdx !== -1 && dataIdx < queryIdx, 'query/anchor directive di HUJUNG');
    assert.equal(out.prefill, undefined, 'SIFAR PREFILL (Claude 4.6+ / thinking)');
    assert.ok(out.userPrompt.includes('<s id="11">'), 'anchor disebut sebagai arahan eksplisit');
});

test('[MATRIX inspector×gemini] system terpisah, tiada prefill/response_format', () => {
    const build = resolveTrinityPrompt('inspector', 'gemini');
    const out = build(inspectorPayload());
    assert.equal(out.channel, 'gemini');
    assert.ok(out.systemPrompt.includes('Detect ONLY these seven violations'), 'taksonomi dalam system');
    assert.ok(out.userPrompt.includes('<translation>'), 'blok data source/translation dalam user');
    assert.equal(out.prefill, undefined);
    assert.equal(out.responseFormat, undefined);
});

test('[MATRIX inspector×openai] json_schema strict wajib', () => {
    const build = resolveTrinityPrompt('inspector', 'openai');
    const out = build(inspectorPayload());
    assert.equal(out.channel, 'openai');
    assert.equal(out.responseFormat.type, 'json_schema');
    assert.equal(out.responseFormat.json_schema.strict, true);
    assert.equal(out.responseFormat.json_schema, INSPECTOR_SCHEMA_CONTRACT, 'skema dari core kanonik');
    assert.deepEqual(
        out.responseFormat.json_schema.schema.properties.crimes.items.properties.type.enum,
        ['MERGE', 'DROP', 'PHANTOM', 'SHIFT', 'UNTRANSLATED', 'REGISTER', 'TERM'],
        'enum 7 jenayah dalam skema strict'
    );
    assert.deepEqual(out.responseFormat.json_schema.schema.required, ['valid', 'crimes']);
    assert.equal(out.prefill, undefined);
});

test('[MATRIX inspector×anthropic] data-first + sifar prefill + tag XML pembatas', () => {
    const build = resolveTrinityPrompt('inspector', 'anthropic');
    const out = build(inspectorPayload());
    assert.equal(out.channel, 'anthropic');
    assert.ok(out.userPrompt.startsWith('<inspection_input>'), 'blok data di ATAS');
    const dataIdx = out.userPrompt.indexOf('11|Hello there.');
    const queryIdx = out.userPrompt.lastIndexOf('Respond with ONLY the JSON now');
    assert.ok(dataIdx !== -1 && queryIdx !== -1 && dataIdx < queryIdx, 'query di HUJUNG');
    assert.equal(out.prefill, undefined, 'SIFAR PREFILL');
});

// ── 2. Parity & Anti-Drift: taksonomi core hadir merentas SEMUA 9 sel ──

const CANONICAL_FRAGMENTS = {
    preflight: [
        'DECISION DISCIPLINE (MANDATORY — READ FIRST)',
        'FACT VS INFERENCE DISCIPLINE (MANDATORY)',
        '4-pillar pre-flight context',
        'lines 1-5'
    ],
    // [STREAMLINE 2026-11-15] Templat streamline Owner — frasa kanonik baharu.
    translation: [
        '### CORE RULES',
        'translate the whole thought first',
        'Keep exact counts per slot',
        'natural, conversational',
        'Return ONLY the <answer> block',
        'ZERO translator notes in parentheses'
    ],
    inspector: [
        'MERGE: Two source lines merged',
        'SHIFT: Dialogue content displaced',
        'PHANTOM: Output slot contains fabricated',
        'Detect ONLY these seven violations',
        'MERGE|DROP|PHANTOM|SHIFT|UNTRANSLATED|REGISTER|TERM'
    ]
};

for (const agent of ['preflight', 'translation', 'inspector']) {
    for (const channel of ['gemini', 'openai', 'anthropic']) {
        test(`[PARITY ${agent}×${channel}] frasa kanonik core hadir tanpa keciciran`, () => {
            const build = resolveTrinityPrompt(agent, channel);
            const out = build(PAYLOADS[agent]());
            for (const fragment of CANONICAL_FRAGMENTS[agent]) {
                assert.ok(
                    out.systemPrompt.includes(fragment) || out.userPrompt.includes(fragment),
                    `frasa kanonik hilang dalam ${agent}×${channel}: "${fragment}"`
                );
            }
        });
    }
}

// ── 3. Harmony Translation↔Inspector (anti-drift antara agen) ──

test('[HARMONY] kontrak templat pendek memetakan 1:1 kepada jenayah Inspector', () => {
    const translationSystem = interpolateTranslationSystem();
    const inspectorSystem = interpolateInspectorSystem();
    // [STREAMLINE 2026-11-15] Templat streamline Owner ↔ taksonomi Inspector:
    // setiap peraturan 1:1 terpakar kepada jenayah yang diauditnya.
    const pairs = [
        ['Output exactly one <s id="N"> per <input> entry', 'MERGE:'],
        ['flow it naturally across those exact slots', 'SHIFT:'],
        ['Keep exact counts per slot', 'PHANTOM:'],
        ['localize [sound effects]', 'DROP:'],
        ['ZERO translator notes in parentheses', 'UNTRANSLATED:']
    ];
    for (const [rule, crime] of pairs) {
        assert.ok(translationSystem.includes(rule), `Translation rule "${rule}" hadir`);
        assert.ok(inspectorSystem.includes(crime), `Inspector crime ${crime} hadir`);
    }
});

// ── 4. Finale Prompt — universal source language, grammar, and few-shot contracts ──

test('[FINALE preflight] direct_address example is source-language neutral', () => {
    const prompt = interpolatePreflightSystem();
    assert.ok(prompt.includes('a source line that addresses them as "Aunt"'));
    assert.ok(!prompt.includes('an English line that addresses them as'));
});

test('[FINALE translation] conversational register and cross-slot flow are explicit (streamline template)', () => {
    const prompt = interpolateTranslationSystem();
    assert.ok(prompt.includes('natural, conversational'));
    assert.ok(prompt.includes('translate the whole thought first'));
    assert.ok(prompt.includes('flow it naturally across those exact slots'));
    assert.ok(prompt.includes('without repeating words or dumping everything into the first slot'));
    assert.ok(prompt.includes('Place each [br] at a natural'));
    assert.ok(!prompt.includes('Translate only the fragment belonging to each slot'));
});
// Nota: pin di atas dikemas kini selaras templat streamline Owner
// (economy + strict slots + reordering clause kekal dipegang).

test('[FINALE few-shot] packs wrap Output examples in <answer> at the pack-declared count', () => {
    // [STREAMLINE 2026-11-15] Malay kini 2 contoh (contoh 1 tambah blok
    // <bad_textbook> anti-calque); generic kekal 3 contoh. Tag pembungkus
    // contoh dinamakan <example_input>/<example_output> supaya TIDAK
    // bertembung dengan blok <input> sebenar.
    const EXPECTED_EXAMPLES = { Malay: 2, Japanese: 3 };
    for (const [language, expected] of Object.entries(EXPECTED_EXAMPLES)) {
        const fewShot = getLanguagePack(language).fewShot;
        assert.equal((fewShot.match(/<example>/g) || []).length, expected, `${language}: ${expected} examples`);
        assert.equal((fewShot.match(/<\/example>/g) || []).length, expected, `${language}: example closers`);
        assert.equal((fewShot.match(/<example_input>/g) || []).length, expected, `${language}: input openers`);
        assert.equal((fewShot.match(/<example_output>/g) || []).length, expected, `${language}: output openers`);
        assert.equal((fewShot.match(/<answer>/g) || []).length, expected, `${language}: answer openers`);
        assert.equal((fewShot.match(/<\/answer>/g) || []).length, expected, `${language}: answer closers`);
        assert.equal((fewShot.match(/<input>/g) || []).length, 0, `${language}: sifar tag <input> dalam few-shot`);
    }
    // Blok <bad_textbook> eksklusif contoh 1 Malay (kontras anti-calque).
    assert.ok(getLanguagePack('Malay').fewShot.includes('<bad_textbook>'), 'Malay: blok <bad_textbook> hadir');
    assert.ok(!getLanguagePack('Japanese').fewShot.includes('<bad_textbook>'), 'generic: TIADA <bad_textbook>');
});

test('[FINALE generic few-shot] meta placeholders avoid square-bracket SDH collisions', () => {
    const fewShot = getLanguagePack('Japanese').fewShot;
    assert.ok(
        fewShot.includes('{translation of "You\'ve got to be kidding me."}'),
        'generic example 1 placeholder hadir'
    );
    assert.ok(fewShot.includes('[{translation of "door slams"}]'), 'generic example 2 SDH placeholder hadir');
    assert.ok(!fewShot.includes('{translation of "Sorry I\'m late."}'), 'contoh legasi example-1 dipensiunkan');
    assert.ok(!fewShot.includes('[translation of'), 'tiada kurungan meta bertabrakan dengan SDH');
    assert.ok(!fewShot.includes('[full merged sentence]'), 'tiada placeholder legasi');
});

// ── 5. Fail-fast registry (sifar silent fallback) ──

test('[REGISTRY] resolveTrinityPrompt fail-fast atas agent/channel tidak dikenali', () => {
    assert.throws(() => resolveTrinityPrompt('agentX', 'gemini'), /Unknown agent/);
    assert.throws(() => resolveTrinityPrompt('preflight', 'pintuX'), /Unknown channel/);
});

test('[REGISTRY] matriks 9 sel lengkap & terbeku (freeze)', () => {
    const { TRINITY_WRAPPERS } = require('./prompts/trinity');
    for (const agent of Object.keys(TRINITY_WRAPPERS)) {
        for (const channel of Object.keys(TRINITY_WRAPPERS[agent])) {
            assert.strictEqual(
                typeof TRINITY_WRAPPERS[agent][channel],
                'function',
                `builder ${agent}×${channel} mesti fungsi`
            );
        }
    }
    assert.equal(Object.keys(TRINITY_WRAPPERS).length, 3, '3 agen');
    assert.ok(Object.isFrozen(TRINITY_WRAPPERS), 'TRINITY_WRAPPERS beku (anti-drift runtime)');
});

// ── 5. Validasi wrapper defensif (payload rosak → fail-fast, bukan silent) ──

test('[VALIDATION] payload rosak ditolak fail-fast oleh semua wrapper', () => {
    assert.throws(() => resolveTrinityPrompt('preflight', 'gemini')({}), /systemText/);
    assert.throws(() => resolveTrinityPrompt('translation', 'gemini')({ systemText: 'x', dataText: 'y' }), /startId/);
    assert.throws(
        () => resolveTrinityPrompt('translation', 'openai')({ systemText: 'x', dataText: 'y', startId: '  ' }),
        /startId/
    );
});

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

function interpolatePreflightSystem() {
    const core = getTrinityCore('preflight');
    const pack = getLanguagePack('Malay');
    const tgt = 'Malay';
    return core.PREFLIGHT_STATIC_TEMPLATE.replaceAll('${src}', 'English')
        .replaceAll('${tgt}', tgt)
        .replaceAll('${honorificMatrix}', pack.honorificMatrix.replaceAll('${tgt}', tgt))
        .replaceAll('${canonicalAddressMatrix}', pack.canonicalAddressMatrix.replaceAll('${tgt}', tgt))
        .replaceAll('${creditsExample}', pack.creditsExample.replaceAll('${tgt}', tgt));
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
        dataText: '## Input\n<en>\n11|Hello there.\n</en>\n<ms>\n11|Hai semua.\n</ms>',
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
    assert.ok(out.systemPrompt.includes('ANTI-MERGE'), 'rules parity dalam system');
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
    assert.ok(out.userPrompt.includes('<ms>'), 'blok data <en>/<ms> dalam user');
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
    translation: [
        'ANTI-MERGE',
        'ANTI-SHIFT',
        'ANTI-PHANTOM',
        'ANTI-DROP',
        'ANTI-UNTRANSLATED',
        'PRESERVE markup',
        'Return ONLY the <answer> block'
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

test('[HARMONY] label jenayah Inspector memetakan 1:1 kepada rules parity Translation', () => {
    const translationSystem = interpolateTranslationSystem();
    const inspectorSystem = interpolateInspectorSystem();
    // ANTI-X ↔ X berpasangan (HARMONY-FIX 2026-09-29):
    const pairs = [
        ['ANTI-MERGE', 'MERGE'],
        ['ANTI-SHIFT', 'SHIFT'],
        ['ANTI-PHANTOM', 'PHANTOM'],
        ['ANTI-DROP', 'DROP'],
        ['ANTI-UNTRANSLATED', 'UNTRANSLATED']
    ];
    for (const [rule, crime] of pairs) {
        assert.ok(translationSystem.includes(rule), `Translation rule ${rule} hadir`);
        assert.ok(inspectorSystem.includes(`${crime}:`), `Inspector crime ${crime} hadir`);
    }
});

// ── 4. Fail-fast registry (sifar silent fallback) ──

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

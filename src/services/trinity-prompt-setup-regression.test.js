/**
 * Regression — single canonical Trinity prompt contract.
 *
 * The former A/B/C registry is intentionally removed. Basic keeps its own
 * standalone wording, while Pro uses the canonical contextual wording.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { PREFLIGHT_STATIC_TEMPLATE } = require('./prompts/trinity/preflight/core');
const {
    TRANSLATION_SYSTEM_TEMPLATE,
    BASIC_TRANSLATION_SYSTEM_TEMPLATE
} = require('./prompts/trinity/translation/core');
const { INSPECTOR_INSTRUCTION } = require('./prompts/trinity/inspector/core');
const { buildPreflightPrompt } = require('./subfaberPreflight');
const { buildInspectionPayload } = require('./agentInspector');
const TranslationEngine = require('./translationEngine');
const { normalizeConfig } = require('../utils/config');
const { generateCacheKeys } = require('../utils/cacheKeys');
const { splitStructuredPrompt } = require('./utils/structuredPrompt');
const { normalizeTargetLanguageForPrompt } = require('./utils/normalizeTargetLanguageForPrompt');

function makeEngine(options = {}) {
    return new TranslationEngine(
        { translateSubtitle: async () => '', estimateTokenCount: () => 10 },
        'gemini-2.5-flash',
        {},
        options
    );
}

test('[TRINITY-CORE-1] Canonical cores retain the approved prompt contracts without setup labels', () => {
    assert.ok(PREFLIGHT_STATIC_TEMPLATE.includes("'terms' are the distinctive vocabulary"));
    assert.ok(PREFLIGHT_STATIC_TEMPLATE.includes('${honorificMatrix}'));
    assert.ok(TRANSLATION_SYSTEM_TEMPLATE.includes('mentally translate the complete sentence first'));
    assert.ok(TRANSLATION_SYSTEM_TEMPLATE.includes('${targetSpecificRules}'));
    assert.ok(TRANSLATION_SYSTEM_TEMPLATE.includes('${fewShot}'));
    assert.ok(INSPECTOR_INSTRUCTION.includes('universal interjections/vocalizations'));
    assert.ok(INSPECTOR_INSTRUCTION.includes('weaving in target-language discourse particles'));
    for (const template of [PREFLIGHT_STATIC_TEMPLATE, TRANSLATION_SYSTEM_TEMPLATE, INSPECTOR_INSTRUCTION]) {
        assert.doesNotMatch(template, /Setup [ABC]|The Invisible Editor/);
    }
});

test('[TRINITY-CORE-2] Preflight and Inspector always use their canonical cores', () => {
    const preflight = buildPreflightPrompt('Dialogue', 'Malay', 'English', 'openai');
    assert.ok(preflight.includes('specializing in English comprehension and Malay expression optimization'));
    assert.ok(preflight.includes("'terms' are the distinctive vocabulary"));
    assert.ok(preflight.includes('"credits_and_titles"'));

    const inspection = buildInspectionPayload([{ id: 1, text: 'Okay, boss' }], [{ index: 0, text: 'Okay, boss' }]);
    assert.ok(inspection.prompt.startsWith(INSPECTOR_INSTRUCTION));
    assert.ok(inspection.prompt.includes('{"valid":true,"crimes":[]}'));
    assert.ok(inspection.prompt.includes('accounting for valid clause reordering'));
});

test('[TRINITY-CORE-3] Legacy setup options and environment values cannot change the active prompt', () => {
    const previousCanonical = process.env.TRINITY_PROMPT_SETUP;
    const previousLegacy = process.env.TRINITY_TRANSLATION_PROMPT_SETUP;
    try {
        process.env.TRINITY_PROMPT_SETUP = 'C';
        process.env.TRINITY_TRANSLATION_PROMPT_SETUP = 'A';
        const control = makeEngine({ trinityMode: 'pro' });
        const legacy = makeEngine({ trinityMode: 'pro', promptSetup: 'A' });
        assert.equal(control.translationTemplate, TRANSLATION_SYSTEM_TEMPLATE);
        assert.equal(legacy.translationTemplate, TRANSLATION_SYSTEM_TEMPLATE);
        control.sourceLanguage = 'English';
        legacy.sourceLanguage = 'English';
        const input = '<s id="1">Hello.</s>';
        assert.equal(
            legacy.createXmlBatchPrompt(input, 'Malay', null, 1, null, 0, 1),
            control.createXmlBatchPrompt(input, 'Malay', null, 1, null, 0, 1)
        );
        assert.equal(
            buildPreflightPrompt('Dialogue', 'Malay', 'English'),
            buildPreflightPrompt('Dialogue', 'Malay', 'English')
        );
    } finally {
        if (previousCanonical === undefined) delete process.env.TRINITY_PROMPT_SETUP;
        else process.env.TRINITY_PROMPT_SETUP = previousCanonical;
        if (previousLegacy === undefined) delete process.env.TRINITY_TRANSLATION_PROMPT_SETUP;
        else process.env.TRINITY_TRANSLATION_PROMPT_SETUP = previousLegacy;
    }
});

test('[TRINITY-CORE-4] Basic uses ONE universal instruction — no language pack, no per-language rules', async () => {
    // [BASIC-UNIVERSAL 2026-11-08] Basic = SATU arahan untuk SEMUA bahasa sasaran.
    assert.notEqual(BASIC_TRANSLATION_SYSTEM_TEMPLATE, TRANSLATION_SYSTEM_TEMPLATE);
    assert.ok(
        BASIC_TRANSLATION_SYSTEM_TEMPLATE.includes(
            'You are a professional Netflix subtitle translator, specializing in localizing subtitles from ${sourceLabel} into ${targetLabel}.'
        )
    );
    // Tiada suntikan bahasa/pack dalam Basic.
    assert.ok(!BASIC_TRANSLATION_SYSTEM_TEMPLATE.includes('${targetSpecificRules}'));
    assert.ok(!BASIC_TRANSLATION_SYSTEM_TEMPLATE.includes('${fewShot}'));
    assert.ok(!BASIC_TRANSLATION_SYSTEM_TEMPLATE.includes('${targetLabelShort}'));
    // Enam peraturan Basic baharu dikekalkan sebagai kontrak literal.
    assert.ok(
        BASIC_TRANSLATION_SYSTEM_TEMPLATE.includes(
            'STRICT 1:1 SLOT PARITY: Return exactly one <s id="N"> per input entry with identical IDs in identical order.'
        ),
        'R1 — ID pariti'
    );
    assert.ok(
        BASIC_TRANSLATION_SYSTEM_TEMPLATE.includes(
            'SPLIT SENTENCES: When a sentence spans multiple consecutive slots, distribute the translated meaning naturally across those exact same slots.'
        ),
        'R2 — ayat dipecah'
    );
    assert.ok(
        BASIC_TRANSLATION_SYSTEM_TEMPLATE.includes(
            'CONVERSATIONAL & UNFILTERED: Convert meaning, not sounds or word order.'
        ),
        'R3 — dialog semula jadi tanpa penapisan'
    );
    assert.ok(
        BASIC_TRANSLATION_SYSTEM_TEMPLATE.includes(
            'when it is Malay, use natural Malaysian Malay cadence, never textbook or Indonesian-dub stiffness.'
        ),
        'R3 — rentak Malaysian Malay tanpa language-pack interpolation'
    );
    assert.ok(
        BASIC_TRANSLATION_SYSTEM_TEMPLATE.includes(
            'NAMES & SDH CAPTIONS: Preserve (Name) and [Name] speaker labels with their exact names and delimiters.'
        ),
        'R4 — label penutur, SDH, tanda baca, dan muzik'
    );
    assert.ok(
        BASIC_TRANSLATION_SYSTEM_TEMPLATE.includes(
            'PRESERVE FORMATTING VERBATIM: Retain every [br], <i>...</i>, and dialogue dash ("-"/"--") exactly, with matching counts per slot.'
        ),
        'R5 — pemeliharaan format'
    );
    assert.ok(
        BASIC_TRANSLATION_SYSTEM_TEMPLATE.includes(
            'ZERO CHATTER: Output ONLY the <answer> block containing the <s> entries, ending with </answer>.'
        ),
        'R6 — tiada catatan penterjemah'
    );
    // Basic mesti menerangkan kontrak sahaja; tiada contoh R2/R3/R4 yang boleh diikat kepada satu ayat sumber.
    assert.ok(!BASIC_TRANSLATION_SYSTEM_TEMPLATE.includes('Example:'), 'Tiada contoh ayat dalam Basic');
    assert.ok(!BASIC_TRANSLATION_SYSTEM_TEMPLATE.includes('I was on my phone'), 'Tiada ayat sumber contoh');
    assert.ok(!BASIC_TRANSLATION_SYSTEM_TEMPLATE.includes('Clause A Clause B'), 'Tiada contoh pengagihan slot');
    assert.ok(
        !BASIC_TRANSLATION_SYSTEM_TEMPLATE.includes('Natural target-language phrasing'),
        'Tiada contoh anti-calque'
    );
    // Kontrak output.
    assert.ok(BASIC_TRANSLATION_SYSTEM_TEMPLATE.includes('Output ONLY the <answer> block'));
    assert.doesNotMatch(
        BASIC_TRANSLATION_SYSTEM_TEMPLATE,
        /pre-?flight|Agent Inspector|Locked Terms?|locked Character Addresses?/i
    );
    // Pro kekalkan pack + few-shot.
    assert.ok(TRANSLATION_SYSTEM_TEMPLATE.includes('${targetSpecificRules}'));
    assert.ok(TRANSLATION_SYSTEM_TEMPLATE.includes('${fewShot}'));
    assert.ok(TRANSLATION_SYSTEM_TEMPLATE.includes('Return ONLY'));

    const injectedInspector = {
        circuitOpen: false,
        runPreflightPass: async () => {
            throw new Error('Basic must not run Preflight');
        },
        runSemanticInspection: async () => {
            throw new Error('Basic must not run Inspector');
        }
    };
    const basic = makeEngine({ trinityMode: 'basic', agentInspector: injectedInspector });
    const pro = makeEngine({ trinityMode: 'pro', agentInspector: injectedInspector });
    assert.equal(basic.translationTemplate, BASIC_TRANSLATION_SYSTEM_TEMPLATE);
    assert.equal(pro.translationTemplate, TRANSLATION_SYSTEM_TEMPLATE);
    assert.equal(basic.agentInspector, null, 'Basic must reject an Inspector even with preserved/imported credentials');
    assert.equal(pro.agentInspector, injectedInspector, 'Pro must retain the configured Inspector');

    const source = '1\n00:00:01,000 --> 00:00:02,000\nHello.\n';
    const basicProvider = {
        translateSubtitle: async () => '<s id="1">Hai.</s>',
        estimateTokenCount: () => 10
    };
    const basicRuntime = new TranslationEngine(
        basicProvider,
        'gemini-2.5-flash',
        {},
        {
            trinityMode: 'basic',
            agentInspector: injectedInspector
        }
    );
    const basicOutput = await basicRuntime.translateSubtitle(source, 'Malay', null, null, 'English');
    assert.ok(basicOutput.includes('Hai.'), 'Basic standalone translation must still complete');
    assert.equal(basicRuntime.preflightContext, null, 'Basic must not create pre-flight context');
    assert.equal(basicRuntime.translationStats.agentInspectorUsed, false);
    assert.equal(basicRuntime.translationStats.agentInspectorBatchesInspected, 0);
});

test('[TRINITY-CORE-5] Canonical language-pack cadence and all runtime placeholders survive interpolation', () => {
    const engine = makeEngine();
    engine.sourceLanguage = 'English';
    const prompt = engine.createXmlBatchPrompt('<s id="1">Hello.</s>', 'Malay', null, 1, null, 0, 1);
    assert.ok(prompt.includes('Spoken Malaysian Cadence'));
    assert.ok(prompt.includes('Register-Gated Loanwords'));
    assert.ok(prompt.includes('Awak ikut kami sekali,'));
    for (const placeholder of [
        '${sourceLabel}',
        '${targetLabel}',
        '${targetLabelShort}',
        '${targetSpecificRules}',
        '${fewShot}'
    ]) {
        assert.equal(prompt.includes(placeholder), false, placeholder);
    }
});

test('[TRINITY-CORE-6] Legacy setup IDs no longer trigger experimental cache bypass', () => {
    for (const trinity of [
        { promptSetup: 'A' },
        { promptSetup: 'B' },
        { promptSetup: 'C' },
        { translation: { promptSetup: 'c' } }
    ]) {
        const cfg = normalizeConfig({ trinity });
        assert.notEqual(cfg.bypassCache, true);
    }
});

test('[TRINITY-CORE-7] Runtime modules no longer expose the retired setup registry', () => {
    assert.equal(fs.existsSync(path.join(__dirname, 'prompts', 'trinity', 'setups')), false);
    assert.equal(fs.existsSync(path.join(__dirname, 'prompts', 'trinity', 'translation', 'setups')), false);
});

test('[TRINITY-CORE-8] Universal Basic cache namespace excludes stale output and retains user/format scoping', () => {
    // [P1 F6 FIX 2026-11-10] Namespace now carries the trinity channel
    // discriminator (`_ch-gemini` for the default Gemini door). Assertions
    // strengthened: exact key strings include the channel segment so the
    // discriminator cannot regress silently.
    const permanent = generateCacheKeys({}, 'tt123_en', 'ms');
    assert.equal(permanent.baseKey, 'tt123_en_ms_trinity-basic-universal-v3_ch-gemini');
    assert.equal(permanent.cacheKey, permanent.baseKey);

    const bypass = generateCacheKeys({ bypassCache: true, __configHash: 'config-hash' }, 'tt123_en', 'ms');
    assert.equal(bypass.cacheKey, 'tt123_en_ms_trinity-basic-universal-v3_ch-gemini__u_config-hash');
    assert.equal(bypass.runtimeKey, bypass.cacheKey);

    const ass = generateCacheKeys({ convertAssToVtt: false }, 'tt123_en', 'ms');
    assert.equal(ass.baseKey, 'tt123_en_ms_trinity-basic-universal-v3_ch-gemini_ass');
});

test('[TRINITY-CORE-9] Pro retains its evidence contract while Basic uses the locked R&D split/entity rules', () => {
    for (const fragment of [
        'These exceptions apply only to the affected entity, never to the surrounding sentence',
        'retaining or transliterating that entity as appropriate',
        'otherwise retain the original title',
        'Distribution follows meaning and readable phrase boundaries, not equal character or word counts',
        'SOURCE-EVIDENCE HIERARCHY',
        'explicit source evidence overrides contradictory Preflight assumptions'
    ]) {
        assert.ok(TRANSLATION_SYSTEM_TEMPLATE.includes(fragment), fragment);
    }
    assert.ok(!TRANSLATION_SYSTEM_TEMPLATE.includes('distribute the clauses proportionally'));
    // Basic universal — kontrak diringkas, tiada jargon metaformer.
    assert.ok(BASIC_TRANSLATION_SYSTEM_TEMPLATE.includes('identical IDs in identical order'));
    assert.ok(
        BASIC_TRANSLATION_SYSTEM_TEMPLATE.includes(
            'distribute the translated meaning naturally across those exact same slots'
        )
    );
    assert.ok(
        BASIC_TRANSLATION_SYSTEM_TEMPLATE.includes(
            'Keep proper nouns, character names, and titles intact unless official localization demands otherwise.'
        )
    );
    assert.ok(BASIC_TRANSLATION_SYSTEM_TEMPLATE.includes('Anything outside <input> is read-only context'));
});

test('[TRINITY-CORE-11] Basic places the exact active-ID manifest before input on every provider door', () => {
    const input = '<s id="8">First.</s>\n<s id="11">Second.</s>\n<s id="19">Last.</s>';
    const manifest =
        'Required output ids in exact order (translate every listed id, including the last one):\n8,11,19\n\n<input>';
    for (const trinityChannel of ['gemini', 'openai', 'anthropic']) {
        const basic = makeEngine({ trinityMode: 'basic', trinityChannel });
        basic.sourceLanguage = 'English';
        const structured = splitStructuredPrompt(basic.createXmlBatchPrompt(input, 'Malay', null, 3, null, 0, 1));
        assert.ok(structured, `${trinityChannel} must retain the structured boundary`);
        assert.ok(structured.user.includes(manifest), `${trinityChannel} must contain the exact manifest`);
        assert.equal(
            structured.user.includes('Required output ids in exact order'),
            true,
            `${trinityChannel} Basic manifest must be present`
        );
        const expectedSystem = basic.translationTemplate
            .replaceAll('${sourceLabel}', 'English')
            .replaceAll('${targetLabel}', 'Malay')
            .replaceAll('${targetLabelShort}', 'Malay');
        assert.equal(structured.system, expectedSystem);
        // [BASIC-UNIVERSAL] Tiada language-pack atau contoh bahasa statik.
        assert.ok(!structured.system.includes('Spoken Malaysian Cadence'));
        assert.ok(!structured.system.includes('Awak ikut kami sekali,'));
        assert.ok(structured.system.includes('when it is Malay, use natural Malaysian Malay cadence'));
        assert.ok(
            structured.system.includes('localizing subtitles from English into Malay.'),
            'Basic Basic-names the actual target language'
        );

        const pro = makeEngine({ trinityMode: 'pro', trinityChannel });
        pro.sourceLanguage = 'English';
        const proPrompt = pro.createXmlBatchPrompt(input, 'Malay', null, 3, null, 0, 1);
        assert.ok(!proPrompt.includes('Required output ids in exact order'), `${trinityChannel} Pro must not change`);
    }
});

test('[TRINITY-CORE-10] Basic instruction is IDENTICAL for every target except the language label', () => {
    const input = '<s id="1">Hello.</s>';
    const basic = makeEngine({ trinityMode: 'basic' });
    basic.sourceLanguage = 'English';

    // Tiada language-pack atau contoh kosa kata statik; satu frasa cadence
    // universal yang menyebut Malay hanya sebagai syarat sasaran dibenarkan.
    // "Malaysian" dilarang dalam normalized kerana klausa bersyarat mesti
    // dibuang sepenuhnya sebelum perbandingan cross-target.
    const forbidden = /ini\/itu\/yang|saya\/awak|aku\/kau|okey\/helo|Malaysian/i;
    const systemByTarget = {};

    for (const targetLanguage of ['Malay', 'Japanese', 'Vietnamese', 'Spanish', 'Indonesian']) {
        const targetLabel = normalizeTargetLanguageForPrompt(targetLanguage);
        const prompt = basic.createXmlBatchPrompt(input, targetLanguage, null, 1, null, 0, 1);
        const structured = splitStructuredPrompt(prompt);
        assert.ok(structured, `${targetLanguage} Basic prompt must stay structured`);
        assert.ok(
            structured.system.includes(`localizing subtitles from English into ${targetLabel}.`),
            `${targetLanguage} Basic prompt must name the actual target language`
        );
        // Klausa bersyarat adalah LITERAL dalam templat dan seragam pada runtime
        // semua sasaran; keseluruhan ayat (termasuk "Indonesian-dub") dibuang
        // sebelum perbandingan cross-target supaya tiada varian kedua wujud.
        const conditional =
            'when it is Malay, use natural Malaysian Malay cadence, never textbook or Indonesian-dub stiffness.';
        assert.equal(
            BASIC_TRANSLATION_SYSTEM_TEMPLATE.split(conditional).length - 1,
            1,
            'Basic template contains the conditional cadence exactly once'
        );
        assert.equal(
            structured.system.split(conditional).length - 1,
            1,
            `${targetLanguage} runtime prompt carries the conditional cadence exactly once`
        );
        const normalized = structured.system.replaceAll(conditional, '').replaceAll(targetLabel, '<TARGET>');
        assert.doesNotMatch(
            normalized,
            forbidden,
            `${targetLanguage} Basic prompt must not contain Malay-specific craft`
        );
        systemByTarget[targetLanguage] = normalized;
    }

    const distinct = new Set(Object.values(systemByTarget));
    assert.equal(
        distinct.size,
        1,
        `Basic system prompt mesti IDENTIK untuk semua bahasa selepas label & klausa bersyarat dibuang; mendapat ${distinct.size} varian`
    );
});

test('[TRINITY-CORE-12] Subtitle handler does not construct Inspector in Basic mode', () => {
    const handlerSource = fs.readFileSync(path.join(__dirname, '..', 'handlers', 'subtitles.js'), 'utf8');
    const constructorGate = handlerSource.match(
        /const isProTrinityMode =[\s\S]*?if \(\s*isProTrinityMode &&\s*config\.agentInspector\?\.enabled === true/
    );
    assert.ok(constructorGate, 'AgentInspector construction must require Pro mode before configuration is consumed');
});

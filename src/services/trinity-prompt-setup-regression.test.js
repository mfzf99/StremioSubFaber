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
    assert.ok(inspection.prompt.includes('{"valid":true}'));
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

test('[TRINITY-CORE-4] Basic uses standalone wording and Pro uses contextual wording', () => {
    assert.notEqual(BASIC_TRANSLATION_SYSTEM_TEMPLATE, TRANSLATION_SYSTEM_TEMPLATE);
    assert.ok(BASIC_TRANSLATION_SYSTEM_TEMPLATE.includes('## Standalone judgment'));
    assert.doesNotMatch(
        BASIC_TRANSLATION_SYSTEM_TEMPLATE,
        /pre-?flight|Agent Inspector|Locked Terms?|locked Character Addresses?/i
    );
    for (const template of [BASIC_TRANSLATION_SYSTEM_TEMPLATE, TRANSLATION_SYSTEM_TEMPLATE]) {
        assert.ok(template.includes('${targetSpecificRules}'));
        assert.ok(template.includes('${fewShot}'));
        assert.ok(template.includes('ZERO translator notes'));
    }

    const basic = makeEngine({ trinityMode: 'basic' });
    const pro = makeEngine({ trinityMode: 'pro' });
    assert.equal(basic.translationTemplate, BASIC_TRANSLATION_SYSTEM_TEMPLATE);
    assert.equal(pro.translationTemplate, TRANSLATION_SYSTEM_TEMPLATE);
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

test('[TRINITY-CORE-8] Cache namespace excludes stale registry output and retains user/format scoping', () => {
    const permanent = generateCacheKeys({}, 'tt123_en', 'ms');
    assert.equal(permanent.baseKey, 'tt123_en_ms_trinity-natural-v1');
    assert.equal(permanent.cacheKey, permanent.baseKey);

    const bypass = generateCacheKeys({ bypassCache: true, __configHash: 'config-hash' }, 'tt123_en', 'ms');
    assert.equal(bypass.cacheKey, 'tt123_en_ms_trinity-natural-v1__u_config-hash');
    assert.equal(bypass.runtimeKey, bypass.cacheKey);

    const ass = generateCacheKeys({ convertAssToVtt: false }, 'tt123_en', 'ms');
    assert.equal(ass.baseKey, 'tt123_en_ms_trinity-natural-v1_ass');
});

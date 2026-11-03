/**
 * Regression — Setup B active runtime with Setup A isolation.
 */

const test = require('node:test');
const assert = require('node:assert/strict');

const setupA = require('./prompts/trinity/setups/setupA');
const setupB = require('./prompts/trinity/setups/setupB');
const { getTrinitySetup } = require('./prompts/trinity/setups');
const { getLanguagePack, malayPack, genericPack } = require('./prompts/languagePacks');
const { buildPreflightPrompt } = require('./subfaberPreflight');
const { buildInspectionPayload } = require('./agentInspector');
const TranslationEngine = require('./translationEngine');
const { PREFLIGHT_STATIC_TEMPLATE } = require('./prompts/trinity/preflight/core');
const { TRANSLATION_SYSTEM_TEMPLATE } = require('./prompts/trinity/translation/core');
const { INSPECTOR_INSTRUCTION } = require('./prompts/trinity/inspector/core');

function makeEngine(promptSetup) {
    return new TranslationEngine(
        { translateSubtitle: async () => '', estimateTokenCount: () => 10 },
        'gemini-2.5-flash',
        {},
        { promptSetup }
    );
}

test('[SETUP-B-1] Setup B berdaftar sebagai bundle lengkap dan default aktif', () => {
    assert.equal(getTrinitySetup('').id, 'B');
    assert.equal(getTrinitySetup('b'), setupB);
    assert.ok(setupB.preflightTemplate.length > 0);
    assert.ok(setupB.translationTemplate.length > 0);
    assert.ok(setupB.inspectorInstruction.length > 0);
});

test('[SETUP-B-2] Setup A dan base packs kekal sebagai kontrak byte-identical', () => {
    assert.equal(setupA.preflightTemplate, PREFLIGHT_STATIC_TEMPLATE);
    assert.equal(setupA.translationTemplate, TRANSLATION_SYSTEM_TEMPLATE);
    assert.equal(setupA.inspectorInstruction, INSPECTOR_INSTRUCTION);
    assert.equal(getLanguagePack('Malay'), malayPack);
    assert.equal(getLanguagePack('Malay', setupA), malayPack);
    assert.equal(getLanguagePack('Japanese'), genericPack);
    assert.equal(getLanguagePack('Japanese', setupA), genericPack);
    assert.ok(malayPack.fewShot.includes('<s id="1">Awak ikut kami,</s>'));
    assert.equal(malayPack.fewShot.includes('Awak ikut kami sekali,'), false);
});

test('[SETUP-B-3] Malay overrides hanya menukar specificRules dan fewShot; semua medan lain diwarisi', () => {
    const pack = getLanguagePack('Malay', setupB);
    assert.notEqual(pack, malayPack);
    assert.equal(pack.honorificMatrix, malayPack.honorificMatrix);
    assert.equal(pack.canonicalAddressMatrix, malayPack.canonicalAddressMatrix);
    assert.equal(pack.creditsExample, malayPack.creditsExample);
    assert.equal(pack.notLockedGuidance, malayPack.notLockedGuidance);
    assert.ok(pack.specificRules.startsWith('7. For Malay'));
    assert.ok(pack.specificRules.includes('Register-Gated Loanwords'));
    assert.ok(pack.specificRules.includes('gue/lu, keren'));
    assert.ok(pack.fewShot.includes('Awak ikut kami sekali,'));
});

test('[SETUP-B-4] Generic override hanya menukar specificRules dan tidak mencemarkan generic few-shot', () => {
    const pack = getLanguagePack('Japanese', setupB);
    assert.equal(pack.fewShot, genericPack.fewShot);
    assert.equal(pack.honorificMatrix, genericPack.honorificMatrix);
    assert.ok(pack.specificRules.startsWith('7. Use natural'));
    assert.ok(pack.specificRules.includes('pro-drop habits'));
});

test('[SETUP-B-5] Preflight B menggunakan distinctive glossary dan schema/output kekal', () => {
    const prompt = buildPreflightPrompt('Dialogue', 'Malay', 'English', 'openai', setupB);
    assert.ok(prompt.includes("'terms' are the distinctive vocabulary"));
    assert.ok(prompt.includes('Exclude generic everyday words or common nouns'));
    assert.ok(prompt.includes('"credits_and_titles"'));
    assert.equal(prompt.includes("'terms' are the vocabulary of the story world ONLY"), false);
});

test('[SETUP-B-6] Translation B menggunakan cadence pack dan few-shot B; A kekal berbeza', () => {
    const engineB = makeEngine('B');
    const engineA = makeEngine('A');
    engineB.sourceLanguage = 'English';
    engineA.sourceLanguage = 'English';
    const promptB = engineB.createXmlBatchPrompt('<s id="1">Hello.</s>', 'Malay', null, 1, null, 0, 1);
    const promptA = engineA.createXmlBatchPrompt('<s id="1">Hello.</s>', 'Malay', null, 1, null, 0, 1);
    assert.ok(promptB.includes('Spoken Malaysian Cadence'));
    assert.ok(promptB.includes('Awak ikut kami sekali,'));
    assert.ok(promptB.includes('mentally translate the complete sentence first'));
    assert.ok(promptA.includes('Awak ikut kami,'));
    assert.equal(promptA.includes('Awak ikut kami sekali,'), false);
    assert.notEqual(promptB, promptA);
});

test('[SETUP-B-7] Inspector B menggunakan pengecualian interjections dan clause-reordering guards', () => {
    const payload = buildInspectionPayload(
        [{ id: 1, text: 'Okay, boss' }],
        [{ index: 0, text: 'Okay, boss' }],
        null,
        null,
        setupB
    );
    assert.ok(payload.prompt.includes('universal interjections/vocalizations'));
    assert.ok(payload.prompt.includes('accounting for valid clause reordering'));
    assert.ok(payload.prompt.includes('weaving in target-language discourse particles'));
    assert.ok(payload.prompt.includes('{"valid":true}'));
});

test('[SETUP-B-8] Semua placeholder runtime B digantikan dan tiada literal interpolation tertinggal', () => {
    const engine = makeEngine('B');
    engine.sourceLanguage = 'English';
    const prompt = engine.createXmlBatchPrompt('<s id="1">Hello.</s>', 'Malay', null, 1, null, 0, 1);
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

/**
 * Regression — Setup C: The Invisible Editor.
 */

const test = require('node:test');
const assert = require('node:assert/strict');

const setupA = require('./prompts/trinity/setups/setupA');
const setupB = require('./prompts/trinity/setups/setupB');
const setupC = require('./prompts/trinity/setups/setupC');
const { getTrinitySetup, listTrinitySetups } = require('./prompts/trinity/setups');
const { getLanguagePack, malayPack } = require('./prompts/languagePacks');
const { buildPreflightPrompt } = require('./subfaberPreflight');
const { buildInspectionPayload } = require('./agentInspector');
const { resolveTrinityPrompt } = require('./prompts/trinity');
const TranslationEngine = require('./translationEngine');

function makeEngine(promptSetup) {
    return new TranslationEngine(
        { translateSubtitle: async () => '', estimateTokenCount: () => 10 },
        'gemini-2.5-flash',
        {},
        { promptSetup }
    );
}

test('[SETUP-C-1] Setup C berdaftar sebagai pilihan eksplisit; default A dan fallback tidak berubah', () => {
    assert.equal(getTrinitySetup('').id, 'A');
    assert.equal(getTrinitySetup('c'), setupC);
    assert.equal(getTrinitySetup('unknown'), setupA);
    assert.deepEqual(
        listTrinitySetups().map((setup) => setup.id),
        ['A', 'B', 'C']
    );
});

test('[SETUP-C-2] Bundle C lengkap dan tidak mengubah objek Setup A/B', () => {
    assert.notEqual(setupC, setupA);
    assert.notEqual(setupC, setupB);
    assert.ok(setupC.preflightTemplate.includes('evidence-based reference'));
    assert.ok(setupC.translationTemplate.includes('INTENT'));
    assert.ok(setupC.inspectorInstruction.includes('Standard of proof'));
    assert.equal(getLanguagePack('Malay', setupC), malayPack);
});

test('[SETUP-C-3] Preflight C menginterpolasi bahasa dan language pack serta mengekalkan skema', () => {
    const prompt = buildPreflightPrompt('Dialogue', 'Malay', 'English', 'openai', setupC);
    assert.ok(prompt.includes('from English into Malay'));
    assert.ok(prompt.includes('direct_address'));
    assert.ok(prompt.includes('credits_and_titles'));
    for (const placeholder of [
        '${src}',
        '${tgt}',
        '${honorificMatrix}',
        '${canonicalAddressMatrix}',
        '${creditsExample}'
    ]) {
        assert.equal(prompt.includes(placeholder), false, placeholder);
    }
});

test('[SETUP-C-4] Translation C menginterpolasi editorial method dan few-shot tanpa sisa placeholder', () => {
    const engine = makeEngine('C');
    engine.sourceLanguage = 'English';
    const prompt = engine.createXmlBatchPrompt('<s id="1">Hello.</s>', 'Malay', null, 1, null, 0, 1);
    assert.ok(prompt.includes('INTENT'));
    assert.ok(prompt.includes('EFFECT'));
    assert.ok(prompt.includes('EXPRESSION'));
    assert.ok(prompt.includes('Awak ikut kami,'));
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

test('[SETUP-C-5] Inspector C mengekalkan tujuh jenis crime dan kontrak JSON', () => {
    const payload = buildInspectionPayload(
        [{ id: 1, text: 'Do not leave.' }],
        [{ index: 0, text: 'Jangan pergi.' }],
        null,
        null,
        setupC
    );
    for (const type of ['MERGE', 'DROP', 'PHANTOM', 'SHIFT', 'UNTRANSLATED', 'REGISTER', 'TERM']) {
        assert.ok(payload.prompt.includes(type), type);
    }
    assert.ok(payload.prompt.includes('{"valid":true}'));
    assert.ok(payload.prompt.includes('adjacent split-sentence slots'));
});

test('[SETUP-C-6] Kesemua sembilan wrapper menerima kandungan C tanpa perubahan core', () => {
    for (const agent of ['preflight', 'translation', 'inspector']) {
        for (const channel of ['gemini', 'openai', 'anthropic']) {
            const builder = resolveTrinityPrompt(agent, channel);
            assert.equal(typeof builder, 'function', `${agent}/${channel}`);
            const wrapped = builder({
                systemText: 'SETUP C EDITORIAL CONTRACT',
                dataText: '<input><s id="1">Hello</s></input>',
                queryText: 'Return only the required output.',
                startId: '1'
            });
            assert.ok(wrapped.systemPrompt.includes('SETUP C EDITORIAL CONTRACT'), `${agent}/${channel}`);
        }
    }
});

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const source = fs.readFileSync('public/js/trinity-agents.js', 'utf8');

function loadFunction(name, dependencies) {
    const start = source.indexOf(`function ${name}(`);
    assert.ok(start >= 0, `${name} must exist`);
    let depth = 0;
    let end = -1;
    for (let i = source.indexOf('{', start); i < source.length; i++) {
        if (source[i] === '{') depth++;
        if (source[i] === '}') depth--;
        if (depth === 0) {
            end = i + 1;
            break;
        }
    }
    assert.ok(end > start, `${name} must have a complete body`);
    const context = vm.createContext({ ...dependencies });
    vm.runInContext(`${source.slice(start, end)}; this.result = ${name};`, context);
    return context.result;
}

test('Gemini native mandatory params survive even when equal to defaults (0.3 and 0.0)', () => {
    const collect = loadFunction('mpCollectDeviatedParams', {
        mpResolveAgentContext: () => ({ providerOrDoor: 'gemini', model: 'gemini-3-flash-preview' }),
        mpCollectFieldValues: () => ({
            temperature: 0.3,
            topP: 0.9,
            thinkingLevel: 'high',
            frequencyPenalty: 0,
            presencePenalty: 0
        }),
        getAgentDefaultParams: () => ({
            temperature: 0.3,
            topP: 0.95,
            thinkingLevel: 'low',
            frequencyPenalty: 0,
            presencePenalty: 0
        }),
        resolveCapabilityProfile: () => ({
            parameters: { temperature: {}, topP: {}, thinkingLevel: {}, frequencyPenalty: {}, presencePenalty: {} }
        }),
        mpIsGeminiNativeContext: () => true,
        MP_GEMINI_MANDATORY_PARAMS: ['temperature', 'topP', 'thinkingLevel', 'frequencyPenalty', 'presencePenalty']
    });
    assert.deepEqual(JSON.parse(JSON.stringify(collect('translation'))), {
        temperature: 0.3,
        topP: 0.9,
        thinkingLevel: 'high',
        frequencyPenalty: 0,
        presencePenalty: 0
    });
});

test('Non-Gemini providers retain deviation-only contract', () => {
    const collect = loadFunction('mpCollectDeviatedParams', {
        mpResolveAgentContext: () => ({ providerOrDoor: 'openai', model: 'gpt-4o' }),
        mpCollectFieldValues: () => ({ temperature: 0.3, topP: 0.95, frequencyPenalty: 0, presencePenalty: 0 }),
        getAgentDefaultParams: () => ({ temperature: 0.3, topP: 0.95, frequencyPenalty: 0, presencePenalty: 0 }),
        resolveCapabilityProfile: () => ({
            parameters: { temperature: {}, topP: {}, frequencyPenalty: {}, presencePenalty: {} }
        }),
        mpIsGeminiNativeContext: () => false,
        MP_GEMINI_MANDATORY_PARAMS: ['temperature', 'topP', 'thinkingLevel', 'frequencyPenalty', 'presencePenalty']
    });
    assert.equal(collect('translation'), null, 'unchanged non-Gemini defaults stay omitted');
});

test('Gemini native context recognizes custom/proxy Gemini models, not arbitrary OpenAI models', () => {
    const check = loadFunction('mpIsGeminiNativeContext', {});
    assert.equal(check({ providerOrDoor: 'gemini', model: 'gemini-3-flash-preview' }), true);
    assert.equal(check({ providerOrDoor: 'custom', model: 'gemini-3-flash-preview' }), true);
    assert.equal(check({ providerOrDoor: 'custom', model: 'gpt-4o' }), false);
});

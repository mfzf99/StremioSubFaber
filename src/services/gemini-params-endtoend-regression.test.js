const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeConfig } = require('../utils/config');
const { createTranslationProvider } = require('./translationProviderFactory');
const { resolveTranslationGeminiKeyConfig } = require('./geminiKeyResolver');
const { createProviderInstance } = require('./translationProviderFactory');

const slot = {
    provider: 'gemini',
    model: 'gemini-3-flash-preview',
    apiKey: 'primary-secret',
    enabled: true,
    apiKeys: ['primary-secret', 'secondary-secret', 'tertiary-secret'],
    keyRotationEnabled: true,
    keyRotationMode: 'per-batch',
    params: { topP: 0.9, thinkingLevel: 'high' }
};

test('[SEND-ALL v2] Old hash with partial params: backend uses Agent Translation defaults, not model flash default 0.5', async () => {
    const cfg = normalizeConfig({
        geminiApiKey: 'primary-secret',
        geminiModel: 'gemini-3-flash-preview',
        geminiApiKeys: ['primary-secret', 'secondary-secret'],
        geminiKeyRotationEnabled: true,
        trinity: { mode: 'basic', translationBasic: slot, translation: slot, translationPro: {} }
    });
    const built = await createTranslationProvider(cfg);
    const rotation = resolveTranslationGeminiKeyConfig(cfg, built.providerName);
    const wire = built.provider.buildGenerationConfig(4096);
    assert.ok('temperature' in wire, 'missing wire temperature');
    assert.ok('topP' in wire, 'missing wire topP');
    assert.equal(typeof wire.thinkingConfig?.thinkingLevel, 'string', 'missing nested thinkingLevel');
    assert.ok('frequencyPenalty' in wire, 'missing wire frequencyPenalty');
    assert.ok('presencePenalty' in wire, 'missing wire presencePenalty');
    assert.equal(
        built.provider.temperature,
        0.3,
        `missing temperature must use agent default 0.3, got ${built.provider.temperature}`
    );
    assert.equal(built.provider.topP, 0.9, 'saved topP preserved');
    assert.equal(built.provider.frequencyPenalty, 0, 'default frequency 0.0');
    assert.equal(built.provider.presencePenalty, 0, 'default presence 0.0');
    assert.equal(
        rotation.advancedSettings.temperature,
        0.3,
        `bulk-key rotation must receive same temperature, got ${rotation.advancedSettings.temperature}`
    );
    assert.equal(rotation.advancedSettings.frequencyPenalty, 0, 'bulk-key rotation frequency 0.0');
    assert.equal(rotation.advancedSettings.presencePenalty, 0, 'bulk-key rotation presence 0.0');
});

test('[SEND-ALL v2] Custom/proxy native door uses same defaults and penalties on rotation', async () => {
    const custom = { ...slot, provider: 'custom', door: 'gemini-native', baseUrl: 'https://proxy.example/v1beta' };
    const cfg = normalizeConfig({
        mainProvider: 'custom',
        multiProviderEnabled: true,
        providers: {
            custom: {
                enabled: true,
                apiKey: 'primary-secret',
                model: 'gemini-3-flash-preview',
                baseUrl: 'https://proxy.example/v1beta',
                door: 'gemini-native'
            }
        },
        trinity: { mode: 'basic', translationBasic: custom, translation: custom, translationPro: {} }
    });
    const agentParams = cfg.trinity.translation.params;
    const customParams = {
        temperature: 0.3,
        topP: agentParams?.topP ?? 0.95,
        thinkingLevel: agentParams?.thinkingLevel ?? 'low',
        frequencyPenalty: agentParams?.frequencyPenalty ?? 0,
        presencePenalty: agentParams?.presencePenalty ?? 0
    };
    const dns = require('node:dns');
    const originalLookup = dns.lookup;
    dns.lookup = (hostname, options, callback) => {
        const cb = typeof options === 'function' ? options : callback;
        if (typeof cb === 'function') cb(null, [{ address: '93.184.216.34', family: 4 }]);
    };
    let built;
    try {
        built = await createProviderInstance(
            'custom',
            {
                apiKey: 'primary-secret',
                model: 'gemini-3-flash-preview',
                baseUrl: 'https://proxy.example/v1beta',
                door: 'gemini-native'
            },
            customParams,
            { ssrfLookup: async () => ({ address: '93.184.216.34', family: 4 }) }
        );
    } finally {
        dns.lookup = originalLookup;
    }
    const rotation = resolveTranslationGeminiKeyConfig(cfg, 'custom');
    assert.ok(built, 'custom native provider built through direct factory path');
    assert.equal(built.temperature, 0.3, 'custom native missing temperature must use 0.3');
    assert.equal(
        rotation.advancedSettings.temperature,
        0.3,
        `custom rotation temperature, got ${rotation.advancedSettings.temperature}`
    );
    assert.equal(rotation.advancedSettings.frequencyPenalty, 0, 'custom rotation frequency');
    assert.equal(rotation.advancedSettings.presencePenalty, 0, 'custom rotation presence');
});

const test = require('node:test');
const assert = require('node:assert/strict');

const keyState = require('../../public/js/trinity-key-state');
const GeminiService = require('./gemini');
const TranslationEngine = require('./translationEngine');
const { AgentInspector } = require('./agentInspector');
const { normalizeConfig } = require('../utils/config');
const { encryptUserConfig, decryptUserConfig } = require('../utils/encryption');
const { sanitizeConfig } = require('../utils/security');
const {
    resolveEffectiveGeminiDoor,
    resolveTranslationGeminiKeyConfig,
    resolveAgentGeminiKeyConfig
} = require('./geminiKeyResolver');

function agentSlot(overrides = {}) {
    return {
        apiKey: 'primary-secret',
        apiKeys: ['primary-secret', 'secondary-secret'],
        keyRotationEnabled: true,
        keyRotationMode: 'per-batch',
        provider: 'gemini',
        door: 'gemini-native',
        format: 'gemini',
        baseUrl: '',
        model: 'gemini-2.5-flash',
        enabled: true,
        ...overrides
    };
}

test('[K1] utiliti pool mengekalkan primary pada indeks 0 dan dedup stabil', () => {
    const pool = keyState.buildGeminiKeyPool({
        primaryKey: ' primary ',
        storedKeys: ['primary', 'second', 'second', '', 'third'],
        keyRotationEnabled: true,
        keyRotationMode: 'invalid'
    });
    assert.deepEqual(pool, {
        apiKey: 'primary',
        apiKeys: ['primary', 'second', 'third'],
        keyRotationEnabled: true,
        keyRotationMode: 'per-batch'
    });
    assert.deepEqual(keyState.getAdditionalGeminiKeys('primary', pool.apiKeys), ['second', 'third']);
});

test('[K2] utiliti menerima array legacy additional-only tanpa kehilangan primary', () => {
    const pool = keyState.buildGeminiKeyPool({ primaryKey: 'primary', storedKeys: ['second', 'third'] });
    assert.deepEqual(pool.apiKeys, ['primary', 'second', 'third']);
    assert.deepEqual(keyState.buildGeminiKeyPool({ storedKeys: ['second'] }).apiKeys, ['second']);
});

test('[K3] normalizeConfig memulihkan primary dan pool per-agent tanpa dedup silang', () => {
    const cfg = normalizeConfig({
        geminiApiKey: 'second',
        geminiApiKeys: ['second'],
        geminiKeyRotationEnabled: true,
        trinity: {
            translation: agentSlot({ apiKey: 'translation-main', apiKeys: ['second', 'translation-extra'] }),
            preflight: agentSlot({ apiKey: 'preflight-main', apiKeys: ['preflight-extra'] }),
            inspector: agentSlot({ apiKey: 'inspector-main', apiKeys: ['inspector-extra'] })
        }
    });
    assert.equal(cfg.geminiApiKey, 'second');
    assert.deepEqual(cfg.trinity.translation.apiKeys, ['translation-main', 'second', 'translation-extra']);
    assert.deepEqual(cfg.trinity.preflight.apiKeys, ['preflight-main', 'preflight-extra']);
    assert.deepEqual(cfg.trinity.inspector.apiKeys, ['inspector-main', 'inspector-extra']);
    assert.equal(cfg.agentInspector.preflightApiKey, 'preflight-main');
    assert.deepEqual(cfg.agentInspector.inspectorApiKeys, ['inspector-main', 'inspector-extra']);
});

test('[K4] door resolver membezakan Gemini Native rasmi/custom daripada OpenAI', () => {
    assert.equal(resolveEffectiveGeminiDoor(agentSlot()), true);
    assert.equal(
        resolveEffectiveGeminiDoor(agentSlot({ provider: 'custom', baseUrl: 'https://proxy.example/v1beta' })),
        true
    );
    assert.equal(resolveEffectiveGeminiDoor(agentSlot({ door: 'openai-compatible', format: 'openai' })), false);
    assert.equal(resolveEffectiveGeminiDoor({ format: 'auto', apiKey: 'sk-generic', model: 'gpt-5-mini' }), false);
});

test('[K5] Translation custom Gemini menerima pool, baseUrl, dan params slot', () => {
    const cfg = {
        geminiApiKey: 'legacy',
        geminiApiKeys: ['legacy'],
        geminiKeyRotationEnabled: false,
        advancedSettings: { translationTimeout: 12345 },
        providers: { custom: { door: 'openai-compatible', baseUrl: 'https://stale.example/v1' } },
        trinity: {
            translation: agentSlot({
                provider: 'custom',
                baseUrl: 'https://proxy.example/v1beta',
                params: { temperature: 0.25 }
            })
        }
    };
    const resolved = resolveTranslationGeminiKeyConfig(cfg, 'custom');
    assert.deepEqual(resolved.keys, ['primary-secret', 'secondary-secret']);
    assert.equal(resolved.advancedSettings.baseUrl, 'https://proxy.example/v1beta');
    assert.equal(resolved.advancedSettings.temperature, 0.25);
    assert.equal(resolved.advancedSettings.translationTimeout, 12345);
});

test('[K6] resolver menolak pool pada custom OpenAI dan mengisolasi agent', () => {
    const openAi = {
        trinity: {
            translation: agentSlot({ provider: 'custom', door: 'openai-compatible', format: 'openai' }),
            preflight: agentSlot({ door: 'openai-compatible', format: 'openai' })
        }
    };
    assert.equal(resolveTranslationGeminiKeyConfig(openAi, 'custom'), null);
    assert.equal(resolveAgentGeminiKeyConfig(openAi, 'preflight'), null);
    assert.deepEqual(resolveAgentGeminiKeyConfig(openAi, 'translation'), null);
});

test('[K7] TranslationEngine mengaktifkan rotasi untuk instance Gemini custom', () => {
    const provider = new GeminiService('primary-secret', 'gemini-2.5-flash', {
        baseUrl: 'https://proxy.example/v1beta'
    });
    const engine = new TranslationEngine(
        provider,
        'gemini-2.5-flash',
        {},
        {
            providerName: 'custom',
            keyRotationConfig: {
                enabled: true,
                mode: 'per-batch',
                keys: ['primary-secret', 'secondary-secret'],
                advancedSettings: { baseUrl: 'https://proxy.example/v1beta' }
            }
        }
    );
    assert.equal(engine.perBatchRotationEnabled, true);
    assert.equal(engine.retryRotationEnabled, true);
});

test('[K8] AgentInspector menggunakan giliran pool fasa dan baseUrl custom tanpa network', () => {
    const inspector = new AgentInspector({
        enabled: true,
        apiKey: 'inspector-main',
        baseUrl: 'https://inspector.example/v1beta',
        format: 'gemini',
        model: 'gemini-2.5-flash',
        preflightApiKey: 'preflight-main',
        preflightBaseUrl: 'https://preflight.example/v1beta',
        preflightFormat: 'gemini',
        preflightModel: 'gemini-2.5-flash',
        inspectorApiKeys: ['inspector-main', 'inspector-extra'],
        inspectorKeyRotationEnabled: true,
        preflightApiKeys: ['preflight-main', 'preflight-extra'],
        preflightKeyRotationEnabled: true
    });

    inspector._enterPhase('preflight');
    const preflightProvider = inspector._getChannelProvider();
    assert.equal(preflightProvider.apiKey, 'preflight-main');
    assert.equal(preflightProvider.baseUrl, 'https://preflight.example/v1beta');
    inspector._exitPhase();

    inspector._enterPhase('preflight');
    assert.equal(inspector._getChannelProvider().apiKey, 'preflight-extra');
    inspector._exitPhase();

    inspector._enterPhase('inspection');
    assert.equal(inspector._getChannelProvider().apiKey, 'inspector-main');
    inspector._exitPhase();
});

test('[K9] pool Trinity disulitkan, dinyahsulit, dan disanitasi untuk log', () => {
    const original = {
        trinity: {
            preflight: agentSlot({ apiKey: 'plain-preflight', apiKeys: ['plain-preflight', 'extra-preflight'] })
        }
    };
    const encrypted = encryptUserConfig(original);
    assert.notEqual(encrypted.trinity.preflight.apiKeys[0], 'plain-preflight');
    const decrypted = decryptUserConfig(encrypted);
    assert.deepEqual(decrypted.trinity.preflight.apiKeys, ['plain-preflight', 'extra-preflight']);
    const safe = sanitizeConfig(original);
    const serialized = JSON.stringify(safe);
    assert.equal(serialized.includes('plain-preflight'), false);
    assert.equal(serialized.includes('extra-preflight'), false);
});

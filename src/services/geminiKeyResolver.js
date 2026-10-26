const { buildGeminiKeyPool } = require('../../public/js/trinity-key-state');
const { detectAgentChannelFormat, FORMAT_GEMINI } = require('./channels/keyDetector');

function resolveEffectiveGeminiDoor(input = {}) {
    const door = String(input.door || '')
        .trim()
        .toLowerCase();
    if (door === 'gemini-native') return true;
    if (door === 'openai-compatible' || door === 'anthropic-messages') return false;

    return (
        detectAgentChannelFormat({
            apiKey: input.apiKey,
            baseUrl: input.baseUrl,
            model: input.model,
            override: input.format
        }).format === FORMAT_GEMINI
    );
}

function resolveGeminiKeyPool(input = {}) {
    return buildGeminiKeyPool({
        primaryKey: input.apiKey,
        storedKeys: input.apiKeys,
        keyRotationEnabled: input.keyRotationEnabled,
        keyRotationMode: input.keyRotationMode
    });
}

function resolveTranslationGeminiKeyConfig(config = {}, providerName = '') {
    const slot = config.trinity?.translation || {};
    const provider = String(providerName || '').toLowerCase();
    const providerConfig = config.providers?.[provider] || {};
    const candidate = provider === 'custom' ? { ...providerConfig, ...slot } : slot;
    const usesGeminiNative =
        (provider === 'gemini' && !String(slot.door || '').toLowerCase()) ||
        resolveEffectiveGeminiDoor({
            ...candidate,
            door: candidate.door || (provider === 'gemini' ? 'gemini-native' : '')
        });
    if (!usesGeminiNative) return null;

    const legacy = {
        apiKey: config.geminiApiKey,
        apiKeys: config.geminiApiKeys,
        keyRotationEnabled: config.geminiKeyRotationEnabled,
        keyRotationMode: config.geminiKeyRotationMode
    };
    const hasSlotPool = Array.isArray(slot.apiKeys) || slot.keyRotationEnabled === true;
    const pool = resolveGeminiKeyPool(hasSlotPool ? { ...legacy, ...slot } : legacy);
    if (!pool.keyRotationEnabled || pool.apiKeys.length === 0) return null;

    return {
        enabled: true,
        mode: pool.keyRotationMode,
        keys: pool.apiKeys,
        advancedSettings: {
            ...(config.advancedSettings || {}),
            ...(config.trinity?.translation?.params || {}),
            ...(typeof candidate.baseUrl === 'string' && candidate.baseUrl.trim()
                ? { baseUrl: candidate.baseUrl.trim() }
                : typeof config.geminiBaseUrl === 'string' && config.geminiBaseUrl.trim()
                  ? { baseUrl: config.geminiBaseUrl.trim() }
                  : {})
        }
    };
}

function resolveAgentGeminiKeyConfig(config = {}, agentKey) {
    const slot = config.trinity?.[agentKey] || {};
    if (!resolveEffectiveGeminiDoor(slot)) return null;
    const pool = resolveGeminiKeyPool(slot);
    if (!pool.keyRotationEnabled || pool.apiKeys.length < 2) return null;
    return pool;
}

module.exports = {
    resolveEffectiveGeminiDoor,
    resolveGeminiKeyPool,
    resolveTranslationGeminiKeyConfig,
    resolveAgentGeminiKeyConfig
};

const { buildGeminiKeyPool } = require('../../public/js/trinity-key-state');
const { detectAgentChannelFormat, FORMAT_GEMINI } = require('./channels/keyDetector');
const { getAgentDefaultParams } = require('../utils/modelCapabilities');
const { getModelSpecificDefaults } = require('../utils/config');

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

    const model = String(slot.model || providerConfig.model || config.geminiModel || '').replace(/^models\//, '');
    const agentDefaults = getAgentDefaultParams('translation', 'gemini-native', model);
    const modelDefaults = getModelSpecificDefaults(model);
    const advanced = config.advancedSettings || {};
    const hasParams = slot.params && typeof slot.params === 'object' && Object.keys(slot.params).length > 0;
    const params = hasParams ? slot.params : {};
    const advancedParams = advanced.enabled === true ? advanced : {};
    const effectiveParams = hasParams
        ? {
              ...agentDefaults,
              thinkingLevel: advanced.thinkingLevel ?? modelDefaults.thinkingLevel,
              temperature: agentDefaults.temperature,
              topP: agentDefaults.topP,
              ...params
          }
        : {
              thinkingBudget: modelDefaults.thinkingBudget,
              thinkingLevel: modelDefaults.thinkingLevel,
              temperature: agentDefaults.temperature,
              topP: agentDefaults.topP,
              frequencyPenalty: agentDefaults.frequencyPenalty,
              presencePenalty: agentDefaults.presencePenalty
          };
    return {
        enabled: true,
        mode: pool.keyRotationMode,
        keys: pool.apiKeys,
        advancedSettings: {
            // [SEND-ALL v2 — Owner 2026-11-20] Per-batch rotation membina
            // GeminiService baharu. Ia mesti menerima hierarki efektif yang
            // SAMA dengan factory; jika tidak, batch pertama guna 0.3 tetapi
            // batch seterusnya jatuh kepada lalai model flash 0.5.
            ...(config.advancedSettings || {}),
            ...advancedParams,
            ...effectiveParams,
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

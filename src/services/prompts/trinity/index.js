/**
 * Trinity Prompt Registry (Fasa 1+2, Mandat Owner 2026-10-19)
 *
 * SATU pintu masuk bagi prompt kanonik Trinity:
 *   - Fasa 1: akses 3 core Single Source of Truth (preflight/translation/inspector).
 *   - Fasa 2: 9 channel-native wrappers (gemini/openai/anthropic per agen) +
 *     resolveTrinityPrompt(agent, channel, options) — STATIC DISPATCH
 *     (pemilihan dikunci pada pembinaan; sifar heuristik runtime gelung
 *     terjemahan; lihat plans/trinity-channel-native-prompts.md §3).
 *
 * Disiplin:
 *   - Wrapper dilarang mengimport wrapper (sifar import lintasan) — semua
 *     komposisi melalui fail ini.
 *   - Wrapper dilarang menyalin taksonomi core — ia hanya membungkus dan
 *     menguatkuasakan format pintu.
 *   - SIFAR wiring enjin produksi dalam Fasa 2 (dispatch aktif Fasa 3).
 */

const preflightCore = require('./preflight/core');
const translationCore = require('./translation/core');
const inspectorCore = require('./inspector/core');

const preflightGemini = require('./preflight/gemini');
const preflightOpenAI = require('./preflight/openai');
const preflightAnthropic = require('./preflight/anthropic');
const translationGemini = require('./translation/gemini');
const translationOpenAI = require('./translation/openai');
const translationAnthropic = require('./translation/anthropic');
const inspectorGemini = require('./inspector/gemini');
const inspectorOpenAI = require('./inspector/openai');
const inspectorAnthropic = require('./inspector/anthropic');

const CHANNELS = new Set(['gemini', 'openai', 'anthropic']);
const AGENTS = new Set(['preflight', 'translation', 'inspector']);

/**
 * Peta statik agent → core module. Static dispatch — tiada heuristik runtime.
 * @type {Object<string, Object>}
 */
const TRINITY_CORES = Object.freeze({
    preflight: preflightCore,
    translation: translationCore,
    inspector: inspectorCore
});

/**
 * Peta statik (agent × channel) → builder wrapper. Freeze — matriks 9 sel
 * tidak boleh diubah runtime (anti-drift).
 * @type {Object<string, Object<string, Function>>}
 */
const TRINITY_WRAPPERS = Object.freeze({
    preflight: Object.freeze({
        gemini: preflightGemini.buildPreflightGeminiPrompt,
        openai: preflightOpenAI.buildPreflightOpenAIPrompt,
        anthropic: preflightAnthropic.buildPreflightAnthropicPrompt
    }),
    translation: Object.freeze({
        gemini: translationGemini.buildTranslationGeminiPrompt,
        openai: translationOpenAI.buildTranslationOpenAIPrompt,
        anthropic: translationAnthropic.buildTranslationAnthropicPrompt
    }),
    inspector: Object.freeze({
        gemini: inspectorGemini.buildInspectorGeminiPrompt,
        openai: inspectorOpenAI.buildInspectorOpenAIPrompt,
        anthropic: inspectorAnthropic.buildInspectorAnthropicPrompt
    })
});

/**
 * Selesaikan core module bagi satu agent Trinity.
 * @param {'preflight'|'translation'|'inspector'} agent
 * @returns {Object} core module
 * @throws {Error} bila agent tidak dikenali (fail-fast — sifar silent fallback)
 */
function getTrinityCore(agent) {
    const core = TRINITY_CORES[agent];
    if (!core) {
        throw new Error(`[TrinityPromptRegistry] Unknown agent: ${agent}`);
    }
    return core;
}

/**
 * Selesaikan pembungkus prompt channel-native secara STATIK.
 * Dipanggil sekali setiap pembinaan provider/engine (Fasa 3 wiring) — hasil
 * di-freeze pada instance; sifar cabangan format dalam gelung terjemahan.
 *
 * @param {'preflight'|'translation'|'inspector'} agent
 * @param {'gemini'|'openai'|'anthropic'} channel
 * @returns {Function} builder wrapper — signature (payload, options?) →
 *   { channel, systemPrompt, userPrompt, prefill?, responseFormat?, systemRole? }
 * @throws {Error} bila agent/channel tidak dikenali (fail-fast)
 */
function resolveTrinityPrompt(agent, channel) {
    if (!AGENTS.has(agent)) {
        throw new Error(`[TrinityPromptRegistry] Unknown agent: ${agent}`);
    }
    if (!CHANNELS.has(channel)) {
        throw new Error(`[TrinityPromptRegistry] Unknown channel: ${channel}`);
    }
    return TRINITY_WRAPPERS[agent][channel];
}

module.exports = {
    TRINITY_CORES,
    TRINITY_WRAPPERS,
    getTrinityCore,
    resolveTrinityPrompt,
    // Re-eksport flattened untuk kemudahan require() satu-baris:
    PREFLIGHT_STATIC_TEMPLATE: preflightCore.PREFLIGHT_STATIC_TEMPLATE,
    PREFLIGHT_SCHEMA_CONTRACT: preflightCore.PREFLIGHT_SCHEMA_CONTRACT,
    TRANSLATION_SYSTEM_TEMPLATE: translationCore.TRANSLATION_SYSTEM_TEMPLATE,
    INSPECTOR_INSTRUCTION: inspectorCore.INSPECTOR_INSTRUCTION,
    INSPECTOR_SCHEMA_CONTRACT: inspectorCore.INSPECTOR_SCHEMA_CONTRACT
};

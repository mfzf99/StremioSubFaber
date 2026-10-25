/**
 * OpenAI Channel — pintu OpenAI-compatible bagi Trinity (Tri-Door Fasa B).
 *
 * [PENYATUAN MUTLAK 2026-10-25 — Mandat Owner] Format muatan kini ditentukan
 * OLEH PROTOKOL PINTU, bukan oleh ejen. Laluan 4-kunci god-tier
 * (universalPayload) MANSUH — Agent Inspector melalui buildChatRequest()
 * standard yang sama dengan Agent Translation & Preflight:
 *   - providerName 'agent-inspector'
 *   - maxRetries 0 (fail fast; retry dikendalikan _callWithFailover)
 *   - enableJsonOutput true (kesahan JSON Inspector melalui response_format
 *     rasmi json_schema/json_object — standard OpenAI)
 *   - SSRF-safe lookup passthrough
 *
 * Streaming policy (kelulusan owner #4): stream KEKAL eksklusif laluan
 * rootsys/Caddy — channel ini pemilik laluan tersebut; geminiChannel &
 * anthropicChannel (Fasa C) dibenarkan non-stream.
 */

const OpenAICompatibleProvider = require('../providers/openaiCompatible');
const { FORMAT_OPENAI } = require('./keyDetector');

/**
 * Bina super-options OpenAICompatibleProvider bagi Agent Inspector.
 *
 * [PENYATUAN MUTLAK 2026-10-25 — Mandat Owner] Input semantik universal
 * sahaja disalurkan (temperature, maxOutputTokens, reasoningEffort);
 * pembinaan muatan sepenuhnya milik lapisan pintu (buildChatRequest
 * standard). Sifar rujukan universalPayload/beastMaxTokens.
 *
 * @param {Object} options - Constructor options AgentInspector
 * @param {number} inspectionTimeoutMs - Had masa semakan (ms)
 * @returns {Object} super-options untuk new OpenAICompatibleProvider(...)
 */
function buildSuperOptions(options = {}, inspectionTimeoutMs = 60000) {
    return {
        apiKey: options.apiKey || '',
        // [HARDCODE-PURGE 2026-10-13] Lalai statik 'deepseek-v4-pro'
        // digugurkan — model datang daripada konfigurasi pengguna/env.
        model: options.inspectionModel || options.model || '',
        baseUrl: options.baseUrl || 'https://api.openai.com/v1',
        providerName: 'agent-inspector',
        // [PENYATUAN MUTLAK 2026-10-25] Input semantik universal —
        // parameter standard disalurkan apa adanya; enjin menghantar HANYA
        // nilai eksplisit (pelayan guna lalai asalnya bila undefined).
        // maxTokens (kontrak warisan AgentInspector) dipetakan kepada
        // maxOutputTokens — siling token tunggal pembina standard.
        temperature: options.temperature,
        maxOutputTokens: options.maxOutputTokens !== undefined ? options.maxOutputTokens : options.maxTokens,
        topP: options.topP,
        presencePenalty: options.presencePenalty,
        frequencyPenalty: options.frequencyPenalty,
        reasoningEffort: options.reasoningEffort,
        translationTimeout: inspectionTimeoutMs / 1000,
        maxRetries: 0, // Fail fast — satu percubaan sahaja per model
        // enableJsonOutput kekal FALSE: skema enableJsonOutput (subtitle_entries)
        // ialah kontrak Agent Translation. Kesahan JSON Inspector menggunakan
        // response_format rasmi melalui meta.responseFormat (INSPECTOR_SCHEMA_
        // CONTRACT kanonik daripada wrapper prompt) — diaktifkan di DALAM
        // buildChatRequest() standard pembina pintu (PENYATUAN MUTLAK 2026-10-25).
        enableJsonOutput: false,
        ssrfLookup: options.ssrfLookup || null
    };
}

/**
 * Bina instance provider transport OpenAI-compatible.
 * @param {Object} options
 * @param {number} [options.inspectionTimeoutMs]
 * @returns {OpenAICompatibleProvider}
 */
function buildProvider(options = {}) {
    const inspectionTimeoutMs = Number(options.inspectionTimeoutMs) || 60000;
    return new OpenAICompatibleProvider(buildSuperOptions(options, inspectionTimeoutMs));
}

module.exports = {
    format: FORMAT_OPENAI,
    buildSuperOptions,
    buildProvider
};

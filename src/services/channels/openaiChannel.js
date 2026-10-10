/**
 * OpenAI Channel — pintu OpenAI-compatible bagi Trinity (Tri-Door Fasa B).
 *
 * Membungkus pengetahuan pengangkutan yang sebelum ini terkurung dalam
 * constructor AgentBInspector (super-options OpenAICompatibleProvider):
 *   - providerName 'agentb', universalPayload god-tier 4-kunci
 *     {model, messages, stream:true, temperature:0.0} (PAYLOAD-GODTIER 2026-09-28)
 *   - maxRetries 0 (fail fast; retry dikendalikan _callWithFailover)
 *   - enableJsonOutput false (kesahan JSON oleh parser tahan lasak)
 *   - SSRF-safe lookup passthrough
 *
 * Streaming policy (kelulusan owner #4): stream KEKAL eksklusif laluan
 * rootsys/Caddy — channel ini pemilik laluan tersebut; geminiChannel &
 * anthropicChannel (Fasa C) dibenarkan non-stream.
 *
 * Fasa B: buildSuperOptions() ialah ekstraksi 1:1 — AgentBInspector
 * menggunakan keluaran ini untuk super() supaya tingkah laku TIDAK berubah
 * (regresi mesti hijau tanpa edit assertion).
 */

const OpenAICompatibleProvider = require('../providers/openaiCompatible');
const { FORMAT_OPENAI } = require('./keyDetector');

/**
 * Bina super-options OpenAICompatibleProvider bagi Agent B.
 * Ekstraksi verbatim daripada agentBInspector.js constructor (Fasa B) —
 * tingkah laku kekal 1:1 dengan laluan pra-refactor.
 *
 * @param {Object} options - Constructor options AgentBInspector
 * @param {number} inspectionTimeoutMs - Had masa semakan (ms)
 * @param {number} beastMaxTokens - Legacy no-op (dikekalkan kontrak warisan)
 * @returns {Object} super-options untuk new OpenAICompatibleProvider(...)
 */
function buildSuperOptions(options = {}, inspectionTimeoutMs = 60000, beastMaxTokens = undefined) {
    return {
        apiKey: options.apiKey || '',
        model: options.inspectionModel || options.model || 'deepseek-v4-pro',
        baseUrl: options.baseUrl || 'https://api.openai.com/v1',
        providerName: 'agentb',
        universalPayload: true, // Muatan BEAST sejagat (Mandat §A + BETA RUN 10)
        beastMaxTokens, // [AUDIT-WARISAN 2026-09-29] no-op — builder 4-kunci god-tier tidak membaca beastMaxTokens
        translationTimeout: inspectionTimeoutMs / 1000,
        maxRetries: 0, // Fail fast — satu percubaan sahaja per model
        enableJsonOutput: false, // Parse JSON manual (kompatibilitas maksimum endpoint)
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
    return new OpenAICompatibleProvider(buildSuperOptions(options, inspectionTimeoutMs, options.beastMaxTokens));
}

module.exports = {
    format: FORMAT_OPENAI,
    buildSuperOptions,
    buildProvider
};

/**
 * Gemini Channel — pintu Gemini Native bagi Trinity (Tri-Door Fasa C, 2026-10-10)
 *
 * Mandat owner Fasa C:
 *   - systemInstruction WAJIB top-level (PROHIBITED: masuk dalam contents)
 *   - hormati getModelFamily ground truth sepenuhnya (3.x-strict strip sampling;
 *     3.x-legacy hantar user temperature/topP; 2.5 full sampling + thinkingBudget
 *     integer; rujuk plans/gemini-sampling-ground-truth-2026.md)
 *   - non-stream default (kelulusan owner #4 — stream eksklusif rootsys/Caddy)
 *
 * Dua peranan:
 *   1. buildRequest() — pembina payload tulen (bentuk boleh diuji tanpa rangkaian)
 *   2. buildProvider() — GeminiService duck-typed (translateSubtitle menerima
 *      prompt bersempadan SUBFABER_PROMPT_BOUNDARY; split system/user terbina
 *      dalam buildUserPrompt — kontrak sama dengan runPreflightSemanticPass)
 */

const GeminiService = require('../gemini');
const { FORMAT_GEMINI } = require('./keyDetector');

/**
 * Bina payload REST v1beta generateContent (non-stream).
 * Menggunakan GeminiService.buildGenerationConfig sebagai SATU sumber kebenaran
 * sampling/thinking supaya ground truth getModelFamily sentiasa dipatuhi.
 *
 * @param {Object} input
 * @param {string} input.model - Model Gemini (cth. 'gemini-3.7-flash')
 * @param {string} input.userPrompt - Kandungan dinamik (user role)
 * @param {string} [input.systemPrompt] - Arahan statik → systemInstruction top-level
 * @param {number} [input.maxOutputTokens] - Anggaran output (lalai 65536)
 * @param {Object} [input.advancedSettings] - thinkingLevel/thinkingBudget dll.
 * @returns {{url:string, body:Object, headers:Object}}
 */
function buildRequest({ model, userPrompt, systemPrompt = '', maxOutputTokens = 65536, advancedSettings = {} } = {}) {
    // [FASE-0 EMPIRIKAL] thinkingLevel 'low' lalai channel (6.4s vs DQ 300s
    // pada high) — melainkan pemanggil memberi nilai eksplisit.
    const { thinkingLevel, ...rest } = advancedSettings;
    const svc = new GeminiService('channel-dummy-key', String(model || '').trim() || 'gemini-2.5-flash', {
        // Non-stream + tiada retry pada lapisan channel (retry diuruskan
        // _callWithFailover AgentB — pariti dengan maxRetries:0 openaiChannel).
        maxRetries: 0,
        ...(thinkingLevel !== undefined ? { thinkingLevel } : { thinkingLevel: 'low' }),
        ...rest
    });
    const generationConfig = svc.buildGenerationConfig(maxOutputTokens);

    const contents = [
        {
            role: 'user',
            parts: [{ text: String(userPrompt || '') }]
        }
    ];

    // INVARIANT (rule #1): systemInstruction KEKAL medan top-level —
    // DILARANG digabung ke dalam contents atau digabung dengan user prompt.
    const body = { contents, generationConfig };
    if (systemPrompt && String(systemPrompt).trim()) {
        body.systemInstruction = { parts: [{ text: String(systemPrompt) }] };
    }

    return {
        url: `${svc.baseUrl}/models/${svc.model}:generateContent`,
        body,
        headers: { 'x-goog-api-key': 'CHANNEL_KEY_PLACEHOLDER', 'Content-Type': 'application/json' }
    };
}

/**
 * Bina transport GeminiService duck-typed untuk delegasi AgentB.
 * translateSubtitle(content, source, target, customPrompt) menerima customPrompt
 * bersempadan SUBFABER_PROMPT_BOUNDARY → split system/user dijalankan dalaman.
 *
 * @param {Object} options - Constructor options AgentBInspector
 * @returns {GeminiService}
 */
function buildProvider(options = {}) {
    const model = String(options.model || options.preflightModel || 'gemini-2.5-flash').trim();
    return new GeminiService(options.apiKey || '', model, {
        maxRetries: 0, // Fail fast — retry dikendalikan _callWithFailover AgentB
        thinkingLevel: options.thinkingLevel || 'low' // empirikal Fasa 0: low = 6.4s, high DQ 300s
    });
}

module.exports = {
    format: FORMAT_GEMINI,
    buildRequest,
    buildProvider
};

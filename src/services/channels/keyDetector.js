/**
 * Key Detector — autodetect format pintu API (Tri-Door Surgery Fasa A, 2026-10-10)
 * plans/tri-door-provider-surgery-plan.md — kelulusan owner:
 *   - Prefix kuat menang: AIza→gemini, sk-ant-→anthropic
 *   - Default selamat: openai-compatible (tiada padanan tepat)
 *   - Override manual SENTIASA diutamakan
 *   - Keputusan ber-source (transparan, bukan senyap) untuk logging
 */

const FORMAT_GEMINI = 'gemini';
const FORMAT_OPENAI = 'openai';
const FORMAT_ANTHROPIC = 'anthropic';
const VALID_FORMATS = new Set([FORMAT_GEMINI, FORMAT_OPENAI, FORMAT_ANTHROPIC]);

/**
 * Normalize manual override value ('auto'/kosong → null = tiada override).
 * @param {string} raw
 * @returns {string|null}
 */
function normalizeFormatOverride(raw) {
    const val = String(raw || '')
        .trim()
        .toLowerCase();
    if (!val || val === 'auto') return null;
    return VALID_FORMATS.has(val) ? val : null;
}

/**
 * Prefix kuat pada API key (keputusan paling dipercayai selepas override).
 * @param {string} apiKey
 * @returns {string|null}
 */
function detectFromApiKey(apiKey) {
    const key = String(apiKey || '').trim();
    if (!key) return null;
    if (key.startsWith('AIza')) return FORMAT_GEMINI;
    if (key.startsWith('sk-ant-')) return FORMAT_ANTHROPIC;
    // 'sk-' adalah prefix generik OpenAI-style (OpenAI, DeepSeek, Moonshot,
    // rootsys, relay lain) — bukan padanan TEPAT mana-mana vendor tunggal;
    // biar baseUrl/model menentukan, fallback default openai nanti.
    return null;
}

/**
 * Hint daripada baseUrl (kedua paling dipercayai).
 * @param {string} baseUrl
 * @returns {string|null}
 */
function detectFromBaseUrl(baseUrl) {
    const url = String(baseUrl || '')
        .trim()
        .toLowerCase();
    if (!url) return null;
    if (url.includes('generativelanguage')) return FORMAT_GEMINI;
    if (url.includes('anthropic')) return FORMAT_ANTHROPIC;
    if (
        url.includes('api.openai.com') ||
        url.includes('openrouter') ||
        url.includes('deepseek') ||
        url.includes('moonshot') ||
        url.includes('kimi') ||
        url.includes('groq') ||
        url.includes('xai') ||
        url.includes('openai')
    ) {
        return FORMAT_OPENAI;
    }
    return null;
}

/**
 * Hint pengukuhan daripada nama model (paling lemah).
 * @param {string} model
 * @returns {string|null}
 */
function detectFromModel(model) {
    const m = String(model || '')
        .trim()
        .toLowerCase();
    if (!m) return null;
    if (/^gemini-/.test(m)) return FORMAT_GEMINI;
    if (/^claude/.test(m)) return FORMAT_ANTHROPIC;
    return null;
}

/**
 * Autodetect format pintu untuk kredensial yang diberikan.
 *
 * @param {Object} input
 * @param {string} [input.apiKey] - Kunci API mentah
 * @param {string} [input.baseUrl] - Base URL endpoint
 * @param {string} [input.model] - Nama model (hint)
 * @param {string} [input.override] - Pilihan manual ('gemini'|'openai'|'anthropic'|'auto')
 * @returns {{format:string, source:string}} sentiasa sah; source ∈
 *   'override' | 'key-prefix' | 'baseUrl' | 'model' | 'default'
 */
function detectAgentChannelFormat(input = {}) {
    const { apiKey = '', baseUrl = '', model = '', override = '' } = input || {};
    const manual = normalizeFormatOverride(override);
    if (manual) return { format: manual, source: 'override' };

    const byKey = detectFromApiKey(apiKey);
    if (byKey) return { format: byKey, source: 'key-prefix' };

    const byUrl = detectFromBaseUrl(baseUrl);
    if (byUrl) return { format: byUrl, source: 'baseUrl' };

    const byModel = detectFromModel(model);
    if (byModel) return { format: byModel, source: 'model' };

    // Kelulusan owner #3: fallback selamat = openai-compatible.
    return { format: FORMAT_OPENAI, source: 'default' };
}

module.exports = {
    detectAgentChannelFormat,
    normalizeFormatOverride,
    detectFromApiKey,
    detectFromBaseUrl,
    detectFromModel,
    FORMAT_GEMINI,
    FORMAT_OPENAI,
    FORMAT_ANTHROPIC,
    VALID_FORMATS
};

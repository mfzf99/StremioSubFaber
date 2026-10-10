/**
 * AgentChannel — kontrak duck-typed untuk pengangkutan Trinity (Tri-Door Fasa B).
 *
 * Kontrak: setiap channel membina provider transport bagi Agent Preflight /
 * Agent Inspector / Agent Translation. Tujuan akhirnya ialah setiap enjin
 * Trinity boleh berjalan di atas mana-mana daripada 3 pintu format rasmi:
 *   1. Gemini Native (systemInstruction top-level, REST v1beta)
 *   2. OpenAI /chat/completions (messages, universalPayload god-tier)
 *   3. Anthropic Messages (system top-level, x-api-key)
 *
 * Fasa B (keputusan kelulusan owner 2026-10-10): channel berperanan sebagai
 * PEMBINA provider + sumber maklumat format; pewarisan AgentBInspector kekal
 * (regresi 40+ ujian mesti hijau tanpa edit assertion). Fasa C akan
 * memperkenalkan geminiChannel + anthropicChannel dan suntikan channel
 * sepenuhnya melalui komposisi.
 *
 * Kontrak kaedah (duck-typing, tiada interface JS):
 *   buildProvider(options) → instance provider transport
 *   format                 → 'gemini' | 'openai' | 'anthropic'
 */

const { detectAgentChannelFormat, FORMAT_OPENAI } = require('./keyDetector');

/**
 * Selesaikan channel daripada kredensial: override manual > autodetect
 * (key-prefix > baseUrl > model) > default openai-compatible.
 * @param {Object} input
 * @param {string} [input.override] - 'auto'|'gemini'|'openai'|'anthropic'
 * @param {string} [input.apiKey]
 * @param {string} [input.baseUrl]
 * @param {string} [input.model]
 * @returns {{format:string, source:string}}
 */
function resolveChannelFormat(input = {}) {
    return detectAgentChannelFormat(input);
}

/**
 * Default apabila tiada apa-apa hint langsung (keputusan owner #3).
 * @returns {string}
 */
function defaultChannelFormat() {
    return FORMAT_OPENAI;
}

module.exports = {
    resolveChannelFormat,
    defaultChannelFormat
};

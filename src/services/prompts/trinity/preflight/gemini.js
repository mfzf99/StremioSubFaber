/**
 * Trinity Wrapper — Agent Preflight × Gemini Native (Fasa 2, Mandat Owner 2026-10-19)
 *
 * Kontrak rasmi pintu (plans/trinity-channel-native-prompts.md §2.1):
 *   - systemText → systemInstruction top-level `{ parts: [{ text }] }`
 *     (Rule #1 BACKEND — HARAM digabung ke contents).
 *   - User content: data dinamik <text> + arahan penutup.
 *   - Tiada prefill (prefill ialah ciri eksklusif Translation Gemini).
 *   - Tiada response_format — kesahan JSON dijamin parser tahan lasak
 *     (stripReasoningTags + resilientParseJson).
 *
 * Output: { channel, systemPrompt, userPrompt } — pemanggil (Fasa 3 wiring)
 * memetakan systemPrompt ke requestBody.systemInstruction.
 */

const { assertTrinityPayload, joinUserContent } = require('../wrapperUtils');

const channel = 'gemini';

/**
 * @param {{systemText:string, dataText:string, queryText?:string}} payload
 * @returns {{channel:string, systemPrompt:string, userPrompt:string}}
 */
function buildPreflightGeminiPrompt(payload) {
    assertTrinityPayload(payload, 'preflight/gemini');
    return {
        channel,
        systemPrompt: String(payload.systemText),
        userPrompt: joinUserContent(payload)
    };
}

module.exports = {
    channel,
    buildPreflightGeminiPrompt
};

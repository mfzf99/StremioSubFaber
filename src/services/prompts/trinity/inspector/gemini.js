/**
 * Trinity Wrapper — Agent Inspector × Gemini Native (Fasa 2, Mandat Owner 2026-10-19)
 *
 * Kontrak rasmi pintu (plans/trinity-channel-native-prompts.md §2.1):
 *   - systemText (INSPECTOR_INSTRUCTION + konteks Pre-Flight terinterpolasi)
 *     → systemInstruction top-level `{ parts: [{ text }] }`.
 *   - User content: blok data <en>/<ms> + arahan penutup.
 *   - Tiada prefill; tiada response_format — kesahan JSON dijamin
 *     parseInspectorResponse tahan lasak.
 */

const { assertTrinityPayload, joinUserContent } = require('../wrapperUtils');

const channel = 'gemini';

/**
 * @param {{systemText:string, dataText:string, queryText?:string}} payload
 * @returns {{channel:string, systemPrompt:string, userPrompt:string}}
 */
function buildInspectorGeminiPrompt(payload) {
    assertTrinityPayload(payload, 'inspector/gemini');
    return {
        channel,
        systemPrompt: String(payload.systemText),
        userPrompt: joinUserContent(payload)
    };
}

module.exports = {
    channel,
    buildInspectorGeminiPrompt
};

/**
 * Trinity Wrapper — Agent Preflight × Anthropic Messages (Fasa 2, Mandat Owner 2026-10-19)
 *
 * Kontrak rasmi pintu (plans/trinity-channel-native-prompts.md §2.3):
 *   - systemText → medan `system` top-level (Anthropic Messages API).
 *   - SUSUNAN DATA-DAHULU: data dinamik (<text> dibalut <subtitle_text>) di
 *     BAHAGIAN ATAS user content; arahan penutup (query) di BAHAGIAN HUJUNG —
 *     best practice rasmi Anthropic ("longform data at the top, queries at
 *     the end — up to +30% response quality").
 *   - SIFAR PREFILL: dilarang assistant prefill (patuh Claude 4.6+ & mod
 *     thinking). Tag XML eksplisit sebagai pembatas data.
 *   - Kesahan JSON: arahan eksplisit dalam system + parser tahan lasak
 *     (Anthropic tiada response_format).
 *
 * Output: { channel, systemPrompt, userPrompt } — pemanggil (Fasa 3)
 * memetakan systemPrompt ke body.system, userPrompt ke messages[0].
 */

const { assertTrinityPayload } = require('../wrapperUtils');

const channel = 'anthropic';

/**
 * @param {{systemText:string, dataText:string, queryText?:string}} payload
 * @returns {{channel:string, systemPrompt:string, userPrompt:string}}
 */
function buildPreflightAnthropicPrompt(payload) {
    assertTrinityPayload(payload, 'preflight/anthropic');
    // Data-first: balut data dinamik dengan tag XML pembatas; arahan dihujungkan.
    const dataBlock = `<subtitle_text>\n${String(payload.dataText)}\n</subtitle_text>`;
    const query = String(payload.queryText || '').trim();
    const userPrompt = query
        ? `${dataBlock}\n\n${query}`
        : `${dataBlock}\n\nApply the tasks above to this subtitle dialogue and return ONLY the JSON object.`;
    return {
        channel,
        systemPrompt: String(payload.systemText),
        userPrompt
    };
}

module.exports = {
    channel,
    buildPreflightAnthropicPrompt
};

/**
 * Trinity Wrapper — Agent Inspector × Anthropic Messages (Fasa 2, Mandat Owner 2026-10-19)
 *
 * Kontrak rasmi pintu (plans/trinity-channel-native-prompts.md §2.3):
 *   - systemText → medan `system` top-level.
 *   - SUSUNAN DATA-DAHULU: blok <en>/<ms> di BAHAGIAN ATAS user content;
 *     arahan penutup di BAHAGIAN HUJUNG.
 *   - SIFAR PREFILL: dilarang assistant prefill (patuh Claude 4.6+ & mod
 *     thinking). Tag XML eksplisit sebagai pembatas data.
 *   - Kesahan JSON: arahan eksplisit (Output Contract dalam system) +
 *     parser tahan lasak.
 */

const { assertTrinityPayload } = require('../wrapperUtils');

const channel = 'anthropic';

/**
 * @param {{systemText:string, dataText:string, queryText?:string}} payload
 * @returns {{channel:string, systemPrompt:string, userPrompt:string}}
 */
function buildInspectorAnthropicPrompt(payload) {
    assertTrinityPayload(payload, 'inspector/anthropic');
    // Data-first: blok data dibalut tag XML pembatas di atas.
    const dataBlock = `<inspection_input>\n${String(payload.dataText)}\n</inspection_input>`;
    const query = String(payload.queryText || '').trim();
    const userPrompt = query ? `${dataBlock}\n\n${query}` : `${dataBlock}\n\nRespond with ONLY the JSON now.`;
    return {
        channel,
        systemPrompt: String(payload.systemText),
        userPrompt
    };
}

module.exports = {
    channel,
    buildInspectorAnthropicPrompt
};

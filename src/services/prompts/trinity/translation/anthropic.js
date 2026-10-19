/**
 * Trinity Wrapper — Agent Translation × Anthropic Messages (Fasa 2, Mandat Owner 2026-10-19)
 *
 * Kontrak rasmi pintu (plans/trinity-channel-native-prompts.md §2.3):
 *   - systemText → medan `system` top-level.
 *   - SUSUNAN DATA-DAHULU: <subtitle_input> (Bible context + batch aktif) di
 *     BAHAGIAN ATAS; arahan penutup di BAHAGIAN HUJUNG.
 *   - SIFAR PREFILL: dilarang assistant prefill (patuh Claude 4.6+ & mod
 *     thinking). Anchor <answer> dijahit sebagai arahan eksplisit dalam
 *     arahan penutup — bukan mekanisme continuation.
 *   - Tag XML eksplisit sebagai pembatas data.
 *
 * Output: { channel, systemPrompt, userPrompt }.
 */

const { assertTrinityPayload, assertStartId } = require('../wrapperUtils');

const channel = 'anthropic';

/**
 * @param {{systemText:string, dataText:string, queryText?:string, startId:string|number}} payload
 * @returns {{channel:string, systemPrompt:string, userPrompt:string}}
 */
function buildTranslationAnthropicPrompt(payload) {
    assertTrinityPayload(payload, 'translation/anthropic');
    assertStartId(payload);
    // Data-first: data dinamik dibalut tag XML pembatas di atas.
    const dataBlock = `<subtitle_input>\n${String(payload.dataText)}\n</subtitle_input>`;
    const query = String(payload.queryText || '').trim();
    // Anchor eksplisit — arahan teks (sifar prefill), query di hujung.
    const anchorDirective = `Write your answer inside a single <answer> block: one <s id="N"> per input id, same ids, same order, beginning with <s id="${payload.startId}">.`;
    const userPrompt = query ? `${dataBlock}\n\n${query}\n\n${anchorDirective}` : `${dataBlock}\n\n${anchorDirective}`;
    return {
        channel,
        systemPrompt: String(payload.systemText),
        userPrompt
    };
}

module.exports = {
    channel,
    buildTranslationAnthropicPrompt
};

/**
 * Trinity Wrapper — Agent Translation × Gemini Native (Fasa 2, Mandat Owner 2026-10-19)
 *
 * Kontrak rasmi pintu (plans/trinity-channel-native-prompts.md §2.1):
 *   - systemText → systemInstruction top-level `{ parts: [{ text }] }`.
 *   - PREFILL CONTINUATION ANCHOR — ciri EKSKLUSIF Gemini: user content
 *     berakhir dengan `\n\n<answer>\n<s id="${startId}">` supaya model
 *     menyambung terus slot pertama (enjin sebenar; Smart Preamble Scrubber
 *     membersihkan preambel patuh). Tiada pintu lain dibenarkan prefill.
 *
 * Output: { channel, systemPrompt, userPrompt, prefill } — pemanggil (Fasa 3)
 * menghantar userPrompt (yang sudah berakhir dengan anchor) sebagai user
 * content; medan prefill disediakan sebagai kontrak eksplisit bagi
 * pengesahan/ujian.
 */

const { assertTrinityPayload, assertStartId } = require('../wrapperUtils');

const channel = 'gemini';

/**
 * @param {{systemText:string, dataText:string, queryText?:string, startId:string|number}} payload
 * @returns {{channel:string, systemPrompt:string, userPrompt:string, prefill:string}}
 */
function buildTranslationGeminiPrompt(payload) {
    assertTrinityPayload(payload, 'translation/gemini');
    assertStartId(payload);
    const data = String(payload.dataText || '');
    const query = String(payload.queryText || '').trim();
    const base = query ? `${data}\n\n${query}` : data;
    // Prefill continuation anchor — EKSKLUSIF Gemini (hujung user content).
    const anchor = `<answer>\n<s id="${payload.startId}">`;
    const userPrompt = `${base}\n\n${anchor}`;
    return {
        channel,
        systemPrompt: String(payload.systemText),
        userPrompt,
        prefill: anchor
    };
}

module.exports = {
    channel,
    buildTranslationGeminiPrompt
};

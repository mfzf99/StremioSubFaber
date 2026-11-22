/**
 * Trinity Wrapper — Agent Translation × Gemini Native (Fasa 2, Mandat Owner 2026-10-19)
 *
 * Kontrak rasmi pintu (plans/trinity-channel-native-prompts.md §2.1):
 *   - systemText → systemInstruction top-level `{ parts: [{ text }] }`.
 *   - [PREFILL-PURGE 2026-11-22 — Mandat Owner] SIFAR PREFILL: jahitan
 *     continuation anchor (`\n\n<answer>\n<s id="${startId}">`) di hujung user
 *     content DIBUANG — ia mengganggu fasa reasoning/thought tokens Gemini 3.x
 *     dan melemahkan pematuhan ID pariti 1:1. Gemini kini selari 100% dengan
 *     pintu OpenAI/Anthropic: arahan penutup teks EKSKLISITIT dan model
 *     memulangkan blok <answer>...</answer> penuh dari awal giliran model
 *     sendiri. Kes PROHIBITED_CONTENT kekal dilindungi protokol pemulihan
 *     2 peringkat + fallback sedia ada.
 *
 * Output: { channel, systemPrompt, userPrompt } — pemanggil (Fasa 3)
 * menghantar userPrompt sebagai user content; payload ke API Gemini
 * berakhir dengan role `user` sahaja (tiada giliran `model` praisi).
 */

const { assertTrinityPayload, assertStartId } = require('../wrapperUtils');

const channel = 'gemini';

/**
 * @param {{systemText:string, dataText:string, queryText?:string, startId:string|number}} payload
 * @returns {{channel:string, systemPrompt:string, userPrompt:string}}
 */
function buildTranslationGeminiPrompt(payload) {
    assertTrinityPayload(payload, 'translation/gemini');
    assertStartId(payload);
    const data = String(payload.dataText || '');
    const query = String(payload.queryText || '').trim();
    const base = query ? `${data}\n\n${query}` : data;
    // Anchor eksplisit — arahan teks (sifar prefill), selari OpenAI/Anthropic.
    const anchorDirective = `Begin your output with the <answer> block, starting with the first entry <s id="${payload.startId}">.`;
    const userPrompt = `${base}\n\n${anchorDirective}`;
    return {
        channel,
        systemPrompt: String(payload.systemText),
        userPrompt
    };
}

module.exports = {
    channel,
    buildTranslationGeminiPrompt
};

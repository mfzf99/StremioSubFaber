/**
 * Trinity Wrapper — Agent Translation × OpenAI-Compatible (Fasa 2, Mandat Owner 2026-10-19)
 *
 * MAZHAB RASMI TUNGGAL (keputusan muktamad Owner 2026-10-19):
 *   - Peranan: mesej statik sebagai role 'system' standard ('developer'
 *     melalui options.systemRole bila endpoint menyokong). Hierarki
 *     developer/system > user — bobot arahan parity dinaikkan.
 *   - Translation ialah agent TEKS (output sari kata XML) → TIADA
 *     response_format (Structured Outputs tidak terpakai pada output teks).
 *   - ANCHOR SEBAGAI ARAHAN EKSPLISIT: permintaan blok <answer> bermula
 *     dengan entri pertama `<s id="${startId}">` disebut sebagai arahan teks
 *     dalam query — BUKAN prefill mekanikal (API OpenAI tiada continuation).
 */

const { assertTrinityPayload, assertStartId } = require('../wrapperUtils');

const channel = 'openai';

/**
 * @param {{systemText:string, dataText:string, queryText?:string, startId:string|number}} payload
 * @param {{systemRole?:'system'|'developer'}} [options]
 * @returns {{channel:string, systemPrompt:string, systemRole:string, userPrompt:string}}
 */
function buildTranslationOpenAIPrompt(payload, options = {}) {
    assertTrinityPayload(payload, 'translation/openai');
    assertStartId(payload);
    const systemRole = options.systemRole === 'developer' ? 'developer' : 'system';
    const data = String(payload.dataText || '');
    const query = String(payload.queryText || '').trim();
    // Anchor eksplisit — arahan teks, bukan prefill mekanikal.
    const anchorDirective = `Begin your output with the <answer> block, starting with the first entry <s id="${payload.startId}">.`;
    const userPrompt = query ? `${data}\n\n${query}\n\n${anchorDirective}` : `${data}\n\n${anchorDirective}`;
    return {
        channel,
        systemPrompt: String(payload.systemText),
        systemRole,
        userPrompt
    };
}

module.exports = {
    channel,
    buildTranslationOpenAIPrompt
};

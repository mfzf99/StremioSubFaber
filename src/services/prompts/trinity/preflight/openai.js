/**
 * Trinity Wrapper — Agent Preflight × OpenAI-Compatible (Fasa 2, Mandat Owner 2026-10-19)
 *
 * MAZHAB RASMI TUNGGAL (keputusan muktamad Owner 2026-10-19 — sifar sub-mod):
 *   - Peranan: mesej statik dihantar sebagai role 'system' standard
 *     (keserasian chat/completions terluas); 'developer' dipilih melalui
 *     options.systemRole bila endpoint membuktikan sokongan.
 *   - Preflight ialah agent JSON → WAJIB response_format
 *     { type: 'json_schema', strict: true } dijana daripada skema kanonik
 *     PREFLIGHT_SCHEMA_CONTRACT (core.js). Tiada pengecualian, tiada mod ganti.
 *   - User content: data dinamik + arahan penutup.
 *
 * Output: { channel, systemPrompt, systemRole, userPrompt, responseFormat } —
 * pemanggil (Fasa 3) memetakan kepada messages[] + body.response_format.
 */

const { assertTrinityPayload, joinUserContent } = require('../wrapperUtils');
const { PREFLIGHT_SCHEMA_CONTRACT } = require('./core');

const channel = 'openai';

/**
 * Bina response_format json_schema strict daripada skema kanonik core.
 * @returns {{type:string, json_schema:Object}}
 */
function buildPreflightJsonSchemaResponseFormat() {
    return {
        type: 'json_schema',
        json_schema: PREFLIGHT_SCHEMA_CONTRACT
    };
}

/**
 * @param {{systemText:string, dataText:string, queryText?:string}} payload
 * @param {{systemRole?:'system'|'developer'}} [options]
 * @returns {{channel:string, systemPrompt:string, systemRole:string, userPrompt:string, responseFormat:Object}}
 */
function buildPreflightOpenAIPrompt(payload, options = {}) {
    assertTrinityPayload(payload, 'preflight/openai');
    const systemRole = options.systemRole === 'developer' ? 'developer' : 'system';
    return {
        channel,
        systemPrompt: String(payload.systemText),
        systemRole,
        userPrompt: joinUserContent(payload),
        responseFormat: buildPreflightJsonSchemaResponseFormat()
    };
}

module.exports = {
    channel,
    buildPreflightOpenAIPrompt,
    buildPreflightJsonSchemaResponseFormat
};

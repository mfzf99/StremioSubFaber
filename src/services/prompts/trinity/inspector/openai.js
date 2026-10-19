/**
 * Trinity Wrapper — Agent Inspector × OpenAI-Compatible (Fasa 2, Mandat Owner 2026-10-19)
 *
 * MAZHAB RASMI TUNGGAL (keputusan muktamad Owner 2026-10-19 — sifar sub-mod):
 *   - Peranan: 'system' standard ('developer' via options.systemRole bila
 *     endpoint menyokong).
 *   - Inspector ialah agent JSON → WAJIB response_format
 *     { type: 'json_schema', strict: true } dijana daripada skema kanonik
 *     INSPECTOR_SCHEMA_CONTRACT (core.js). Tiada pengecualian.
 *   - User content: blok data <en>/<ms> + arahan penutup.
 */

const { assertTrinityPayload, joinUserContent } = require('../wrapperUtils');
const { INSPECTOR_SCHEMA_CONTRACT } = require('./core');

const channel = 'openai';

/**
 * Bina response_format json_schema strict daripada skema kanonik core.
 * @returns {{type:string, json_schema:Object}}
 */
function buildInspectorJsonSchemaResponseFormat() {
    return {
        type: 'json_schema',
        json_schema: INSPECTOR_SCHEMA_CONTRACT
    };
}

/**
 * @param {{systemText:string, dataText:string, queryText?:string}} payload
 * @param {{systemRole?:'system'|'developer'}} [options]
 * @returns {{channel:string, systemPrompt:string, systemRole:string, userPrompt:string, responseFormat:Object}}
 */
function buildInspectorOpenAIPrompt(payload, options = {}) {
    assertTrinityPayload(payload, 'inspector/openai');
    const systemRole = options.systemRole === 'developer' ? 'developer' : 'system';
    return {
        channel,
        systemPrompt: String(payload.systemText),
        systemRole,
        userPrompt: joinUserContent(payload),
        responseFormat: buildInspectorJsonSchemaResponseFormat()
    };
}

module.exports = {
    channel,
    buildInspectorOpenAIPrompt,
    buildInspectorJsonSchemaResponseFormat
};

/**
 * Trinity Wrapper Utils (Fasa 2, Mandat Owner 2026-10-19)
 *
 * Util validasi payload BERSAMA bagi ketiga-tiga pembungkus pintu setiap agen.
 * Bukan wrapper — hanya helper. Disiplin DRY: wrapper dilarang menyalin
 * taksonomi core; ia hanya membungkus dan menguatkuasakan format pintu.
 *
 * Kontrak payload input (dijana pemanggil daripada core + data runtime):
 *   {
 *     systemText: string,   // arahan statik TERINTERPOLASI daripada core agent
 *     dataText: string,     // blok data dinamik (dibalut tag XML oleh pemanggil)
 *     queryText?: string,   // arahan penutup ringkas (data-first Anthropic)
 *     startId?: string|number, // Translation sahaja — anchor prefill/eksplisit
 *   }
 *
 * Kontrak output wrapper (semua pintu):
 *   {
 *     channel: 'gemini'|'openai'|'anthropic',
 *     systemPrompt: string,        // → systemInstruction / system role / system field
 *     userPrompt: string,          // kandungan user (susunan ikut pintu)
 *     prefill?: string,            // EKSKLUSIF Gemini Translation (anchor continuation)
 *     responseFormat?: object,     // EKSKLUSIF OpenAI JSON agents (json_schema strict)
 *     systemRole?: 'system'|'developer' // OpenAI sahaja
 *   }
 */

/**
 * Validasi payload asas untuk semua wrapper. Fail-fast — sifar silent fallback.
 * @param {Object} payload
 * @param {string} agent - nama agent (untuk mesej ralat)
 */
function assertTrinityPayload(payload, agent) {
    if (!payload || typeof payload !== 'object') {
        throw new Error(`[trinity/${agent}] payload mesti objek`);
    }
    if (typeof payload.systemText !== 'string' || !payload.systemText.trim()) {
        throw new Error(`[trinity/${agent}] systemText (string tak kosong) wajib`);
    }
    if (typeof payload.dataText !== 'string') {
        throw new Error(`[trinity/${agent}] dataText (string) wajib`);
    }
    if (payload.queryText !== undefined && typeof payload.queryText !== 'string') {
        throw new Error(`[trinity/${agent}] queryText mesti string apabila diisi`);
    }
}

/**
 * Validasi tambahan wrapper Translation: startId wajib (anchor).
 * @param {Object} payload
 */
function assertStartId(payload) {
    const id = payload?.startId;
    const ok = typeof id === 'string' ? id.trim().length > 0 : Number.isFinite(id);
    if (!ok) {
        throw new Error('[trinity/translation] startId wajib (string tak kosong / nombor terhingga)');
    }
}

/**
 * Gabung kandungan user: data dahulu, query di hujung (Anthropic data-first;
 * susunan sama selamat untuk Gemini/OpenAI — arahan statik sudah berada di
 * saluran system, bukan dalam user content).
 * @param {Object} payload
 * @returns {string}
 */
function joinUserContent(payload) {
    const data = String(payload.dataText || '');
    const query = String(payload.queryText || '').trim();
    return query ? `${data}\n\n${query}` : data;
}

module.exports = {
    assertTrinityPayload,
    assertStartId,
    joinUserContent
};

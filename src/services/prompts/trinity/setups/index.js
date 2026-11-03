/**
 * Trinity Prompt Setup Registry (Mandat Owner 2026-11-03)
 *
 * Satu setup memilih bundle lengkap Agent Preflight, Agent Translation dan
 * Agent Inspector. Semua ejen menerima bundle yang sama untuk menghalang
 * campuran setup dalam satu aliran terjemahan.
 *
 * Keutamaan runtime dikendalikan pemanggil: trinity.promptSetup →
 * TRINITY_PROMPT_SETUP → Setup A. Id tidak dikenali fail-safe ke Setup A.
 */

const log = require('../../../../utils/logger');
const setupA = require('./setupA');
const setupB = require('./setupB');
const setupC = require('./setupC');

const TRINITY_PROMPT_SETUPS = [setupA, setupB, setupC];
const DEFAULT_TRINITY_PROMPT_SETUP_ID = 'A';
const FALLBACK_TRINITY_PROMPT_SETUP_ID = 'A';

function normalizeSetupId(raw) {
    return String(raw || '')
        .trim()
        .toUpperCase();
}

/**
 * Resolve bundle prompt Trinity mengikut id.
 * @param {string} rawId - id setup (cth. 'A', 'B', 'C'); kosong → default 'A'.
 * @returns {{id: string, label: string, preflightTemplate: string, translationTemplate: string, inspectorInstruction: string}}
 */
function getTrinitySetup(rawId) {
    const id = normalizeSetupId(rawId) || DEFAULT_TRINITY_PROMPT_SETUP_ID;
    const found = TRINITY_PROMPT_SETUPS.find((setup) => setup && setup.id === id);
    if (found) return found;
    log.warn(
        () =>
            `[PromptSetup] Unknown Trinity prompt setup '${rawId}' — falling back to Setup '${FALLBACK_TRINITY_PROMPT_SETUP_ID}' (${setupA.label})`
    );
    return setupA;
}

function listTrinitySetups() {
    return TRINITY_PROMPT_SETUPS.map((setup) => ({ id: setup.id, label: setup.label }));
}

module.exports = {
    DEFAULT_TRINITY_PROMPT_SETUP_ID,
    FALLBACK_TRINITY_PROMPT_SETUP_ID,
    getTrinitySetup,
    listTrinitySetups
};

/**
 * Prompt Setup Registry — Agent Translation (Mandat Owner 2026-10-30)
 *
 * Registry templat statik prompt batch Agent Translation. Owner boleh
 * menyimpan beberapa setup prompt (A = baseline Finale v3.25.1; B/C =
 * eksperimen) dan menukar antara setup melalui config
 * trinity.translation.promptSetup atau env TRINITY_TRANSLATION_PROMPT_SETUP
 * — tanpa edit kod, tanpa redeploy.
 *
 * Kontrak resolver:
 *   - getTranslationSetup(id) → { id, label, template } setup berdaftar.
 *   - id tidak sah/tidak dikenali → FAIL-SAFE fallback ke Setup A dengan
 *     log warn eksplisit (jangan crash aliran terjemahan; Setup A ialah
 *     baseline terbukti).
 *   - listTranslationSetups() → susunan kanonik untuk dokumentasi/UI masa
 *     depan (id + label sahaja; templat tidak didedahkan secara pukal).
 *
 * Disiplin:
 *   - Setup A TIDAK boleh diubah tanpa mandat Owner eksplisit (baseline
 *     pembandingan; assertion literal suite regresi menguncinya).
 *   - Setup baharu: cipta setupX.js dalam direktori ini, eksport objek
 *     { id, label, template } dengan placeholder yang sama
 *     (${sourceLabel}/${targetLabel}/${targetLabelShort}/
 *     ${targetSpecificRules}/${fewShot}), kemudian daftarkan di TRANSLATION_
 *     PROMPT_SETUPS di bawah.
 *   - Placeholder wajib kekal supaya interpolasi translationEngine
 *     (createXmlBatchPrompt) berfungsi untuk semua setup.
 */

const log = require('../../../../../utils/logger');

const setupA = require('./setupA');

// Susunan kanonik: A sentiasa pertama (baseline + fallback).
const TRANSLATION_PROMPT_SETUPS = [setupA];

const DEFAULT_TRANSLATION_PROMPT_SETUP_ID = 'A';

function normalizeSetupId(raw) {
    const trimmed = String(raw || '')
        .trim()
        .toUpperCase();
    return trimmed;
}

/**
 * Resolve setup prompt Agent Translation mengikut id.
 * @param {string} rawId - id setup (cth. 'A', 'B'); kosong → default 'A'.
 * @returns {{id: string, label: string, template: string}} setup terpilih (fallback A).
 */
function getTranslationSetup(rawId) {
    const id = normalizeSetupId(rawId) || DEFAULT_TRANSLATION_PROMPT_SETUP_ID;
    const found = TRANSLATION_PROMPT_SETUPS.find((s) => s && s.id === id);
    if (found) return found;
    log.warn(
        () =>
            `[PromptSetup] Unknown translation prompt setup '${rawId}' — falling back to Setup '${DEFAULT_TRANSLATION_PROMPT_SETUP_ID}' (${setupA.label})`
    );
    return setupA;
}

/**
 * Senarai setup berdaftar (id + label) — untuk dokumentasi/UI masa depan.
 * @returns {Array<{id: string, label: string}>}
 */
function listTranslationSetups() {
    return TRANSLATION_PROMPT_SETUPS.map((s) => ({ id: s.id, label: s.label }));
}

module.exports = {
    DEFAULT_TRANSLATION_PROMPT_SETUP_ID,
    getTranslationSetup,
    listTranslationSetups
};

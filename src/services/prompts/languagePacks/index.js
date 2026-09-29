/**
 * [UNIVERSAL-FIX] Language Pack Loader
 *
 * getLanguagePack(targetLang) — the single entry point for target-conditional
 * prompt composition. Resolves ANY of the 433 supported target languages to a
 * pack:
 *   - Malay family (ms/my/mya/zsm/zzm/Malay/Bahasa Melayu/...) → malay.js
 *   - everything else                                          → generic.js
 *
 * Resolution strategy (defence in depth, no new dependencies):
 *   1. Normalized ISO-639 code prefix match against pack.aliases
 *      (handles 'ms-MY', 'mya', 'zsm', 'ms-Arab' variants).
 *   2. Display-name substring match ('Malay', 'Bahasa Melayu').
 *   3. Generic fallback.
 *
 * Used by:
 *   - subfaberPreflight.buildPreflightPrompt (P1)
 *   - translationEngine.createXmlBatchPrompt (P2)
 *   - gemini.DEFAULT_TRANSLATION_PROMPT composer (P8)
 */

const malayPack = require('./malay');
const genericPack = require('./generic');

const PACKS = [malayPack];

/** Normalize a language label/code to comparable lowercase key. */
function normalizeLangKey(value) {
  return String(value || '').trim().toLowerCase();
}

/**
 * Malay detection — matches ISO-639 codes (ms, my, mya, zsm, zzm) and any
 * code variant rooted in them (ms-MY, ms-Arab, zsm-BN), plus display names.
 * 'may' (ISO-639-2/B for Malay) is included explicitly.
 */
function isMalayTarget(targetLang) {
  const raw = normalizeLangKey(targetLang);
  if (!raw) return false;

  // Display-name match: "Malay", "Bahasa Melayu", "Malay (Jawi script)"...
  if (raw === 'malay' || raw === 'bahasa melayu' || raw === 'melayu' ||
      raw.includes('malay') || raw.includes('bahasa melayu') || raw.includes('melayu')) {
    return true;
  }

  // Code match: take the primary subtag before '-'/'_' and test membership.
  const primary = raw.split(/[-_]/)[0];
  const malayCodes = new Set(['ms', 'my', 'mya', 'may', 'zsm', 'zzm', 'mly']);
  return malayCodes.has(primary);
}

/**
 * Resolve the language pack for a target language.
 * @param {string} targetLang - Bahasa sasaran (kod ISO atau nama paparan)
 * @returns {{code, aliases, honorificMatrix, canonicalAddressMatrix,
 *            creditsExample, fewShot, specificRules, notLockedGuidance}}
 */
function getLanguagePack(targetLang) {
  if (isMalayTarget(targetLang)) return malayPack;
  return genericPack;
}

module.exports = {
  getLanguagePack,
  isMalayTarget,
  malayPack,
  genericPack
};

/**
 * Cache key generation utilities
 *
 * Provides a single source of truth for cache key generation across the application.
 * This ensures consistent scoping for bypass vs permanent cache and prevents
 * cache key mismatches that could break partial cache delivery or cause
 * user isolation issues.
 */

const log = require('./logger');
// [PROMPT-SANDBOX v3.38.0 — pengetatan Owner #2] Resolusi DINAMIK per
// panggilan (bukan cache module-level) supaya injection uji-sahaja
// (__setPromptSandboxForTests) mempengaruhi kunci dalam unit test. Resolusi
// deterministik: hasil sama untuk pasangan rasmi/eksperimen yang sama.
const { resolvePromptSandbox } = require('../config/promptSandbox');
const { TRANSLATION_SYSTEM_TEMPLATE } = require('../services/prompts/trinity/translation/core');
const { getLanguagePack } = require('../services/prompts/languagePacks');

function normalizeUserHash(rawHash) {
    if (!rawHash || typeof rawHash !== 'string') return '';
    const trimmed = rawHash.trim();
    if (!trimmed || trimmed === 'anonymous') return '';
    return trimmed;
}

/* Generate-cache-keys JSDoc kini melekat terus pada fungsi (lihat bawah). */
/**
 * [A1 FIX 2026-11-14] Resolve the trinity channel a config will actually
 * translate through, for the `_ch-<door>` cache-key discriminator.
 *
 * Live defect: nothing ever populated `config.trinityChannel` at runtime, so
 * every cache key defaulted to `_ch-gemini` — including custom/OpenAI and
 * custom/Anthropic runs (cross-door namespace poisoning in the shared
 * permanent cache; observed live: deepseek-v4-pro @ rootsys stored under
 * ch-gemini). The handler now populates the field via this resolver before
 * key generation, and generateCacheKeys derives it defensively as well so
 * every call site (hasCachedTranslation, radar, xEmbed) stays consistent.
 * Priority: explicit `config.trinityChannel` > active custom provider door
 * (`providers.<main>.door`) > native provider door > gemini legacy default
 * (existing permanent caches must never be orphaned).
 * @param {object} config normalized user configuration
 * @returns {'gemini'|'openai'|'anthropic'}
 */
function resolveTrinityChannelForConfig(config) {
    const explicit = String(config?.trinityChannel || '')
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, '');
    if (explicit) return explicit;

    const mainProvider = String(config?.mainProvider || 'gemini').toLowerCase();
    if (mainProvider === 'gemini') return 'gemini';
    if (mainProvider === 'anthropic') return 'anthropic';

    const slot = config?.providers?.[mainProvider] || config?.providers?.custom;
    if (slot && typeof slot === 'object') {
        const door = String(slot.door || '').toLowerCase();
        if (door === 'gemini-native') return 'gemini';
        if (door === 'anthropic-messages') return 'anthropic';
        if (door === 'openai-compatible') return 'openai';
    }

    // Native transports of the remaining provider keys; anything unrecognized
    // keeps the historical gemini namespace (defensive, never orphans keys).
    if (
        mainProvider === 'openai' ||
        mainProvider === 'xai' ||
        mainProvider === 'deepseek' ||
        mainProvider === 'custom'
    ) {
        return 'openai';
    }
    return 'gemini';
}

/**
 * [STRUCTURE-V5 2026-11-14 — Owner D8] Resolve the trinity MODE for cache-key
 * derivation. Pro output is KNP-guided (Preflight context) and must never be
 * served to Basic runs — cross-mode cache poisoning — so the namespace carries
 * `trinity-basic-` vs `trinity-pro-` alongside the channel discriminator.
 * Priority: explicit `config.trinityMode` > `config.trinity.mode` > basic
 * default (legacy configs and the current UI runtime stay on Basic).
 * Mirrors resolveTrinityChannelForConfig (single source of truth, re-exported
 * by the factory) so every call site derives the same mode.
 * @param {Object} config
 * @returns {'basic'|'pro'}
 */
function resolveTrinityModeForConfig(config) {
    const explicit = String(config?.trinityMode || '')
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, '');
    if (explicit === 'pro' || explicit === 'basic') return explicit;

    const nested = String(config?.trinity?.mode || '')
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, '');
    if (nested === 'pro' || nested === 'basic') return nested;

    return 'basic';
}

/**
 * [GEN-PARAMS-KEY 2026-11-22 — Mandat Owner] Normalize the generation
 * parameters that influence LLM output into a deterministic key segment so
 * silent A/B parameter changes never serve stale cached translations.
 *
 * Resolution order mirrors the runtime provider factory: explicit
 * `trinity.translation.params` (Trinity agent card) OVERRIDES
 * `advancedSettings`; values absent from both fall back to the model's
 * effective defaults and are omitted from the segment — a config that never
 * set a parameter keeps the exact historical key (no needless forking).
 * Segment format: `_g-t{temp}p{topP}k{thinkingLevel}f{freq}r{pres}` with
 * only explicitly-set components included.
 * @param {Object} config normalized user configuration
 * @returns {string} cache-key segment ('' when no explicit params)
 */
function buildGenerationParamsSegment(config) {
    const advanced = config?.advancedSettings || {};
    const agentParams = config?.trinity?.translation?.params;
    const picks = [
        ['t', 'temperature'],
        ['p', 'topP'],
        ['k', 'thinkingLevel'],
        ['f', 'frequencyPenalty'],
        ['r', 'presencePenalty']
    ];
    const parts = [];
    for (const [tag, field] of picks) {
        let value;
        if (agentParams && agentParams[field] !== undefined) {
            value = agentParams[field];
        } else if (advanced[field] !== undefined) {
            value = advanced[field];
        }
        if (value === undefined || value === null || value === '') continue;
        if (typeof value === 'number') {
            if (!Number.isFinite(value)) continue;
            value = Number(value.toFixed(4));
        } else {
            value = String(value).trim();
            if (!value) continue;
        }
        parts.push(`${tag}${value}`);
    }
    return parts.length > 0 ? `_g-${parts.join('')}` : '';
}

/**
 * Generate cache keys for translation caching
 *
 * @param {Object} config - User configuration
 * @param {string} sourceFileId - Source file identifier (e.g., "imdb123_en")
 * @param {string} targetLang - Target language code (e.g., "es")
 * @returns {Object} Cache key information
 * @returns {string} .baseKey - Base key without user scoping (e.g., "imdb123_en_es")
 * @returns {string} .cacheKey - Primary cache key (bypass uses user scope, permanent uses shared base)
 * @returns {string} .runtimeKey - Key used for in-flight tracking/partials (scoped per config when available)
 * @returns {boolean} .bypass - Whether bypass mode is enabled in config
 * @returns {boolean} .bypassEnabled - Whether bypass mode is actually active (requires userHash)
 * @returns {string} .userHash - User configuration hash (empty string if not available)
 * @returns {boolean} .allowPermanent - Whether permanent cache reads/writes are allowed (requires userHash)
 */
function generateCacheKeys(config, sourceFileId, targetLang) {
    // Prompt-semantic namespace prevents output produced under an earlier
    // Basic prompt (Malay-hardcoded, then editorial-craft, then the
    // Malay-conditional cadence clause) from being served under the current
    // single universal Basic instruction.
    // [P1 F6 FIX 2026-11-10] Channel discriminator: the key now carries the
    // trinity channel that will actually generate the translation, so the
    // same file+language under different doors (gemini/openai/anthropic)
    // never shares one permanent cache entry (cross-door poisoning).
    // Default 'gemini' preserves the runtime default and keeps legacy
    // configs reading the same namespace as trinityChannel:'gemini'.
    // User and ASS/SRT scoping remain unchanged below.
    const trinityChannel = resolveTrinityChannelForConfig(config);
    // [STRUCTURE-V5 2026-11-14] Mode discriminator: Pro output is KNP-guided
    // and must never be served to Basic runs (cross-mode poisoning). The
    // redesigned prompt (v5) also guarantees stale v4 output is not served.
    // [TOTAL-PURGE v3.36.0] Namespace maju ke v6: templat pendek baharu +
    // few-shot baharu — output prompt lama (v5 dan ke bawah) tidak diservis.
    // [STREAMLINE v3.37.0] Namespace maju ke v7: templat streamline baharu +
    // few-shot Melayu baharu — output prompt lama (v6 dan ke bawah) tidak
    // diservis (kontrak penghijrahan yang sama seperti v5→v6).
    const trinityMode = resolveTrinityModeForConfig(config);
    // [PROMPT-SANDBOX v3.38.0] Namespace EFEKTIF: rasmi kekal v7 (pin ujian
    // tidak berubah); sandbox aktif → v7-sbx-{hash8} (auto cache-busting —
    // satu aksara eksperimen berubah = kunci baharu; cache rasmi tidak pernah
    // tercemar kunci eksperimen). Hash = pasangan EFEKTIF (template +
    // malayFewShot selepas fall-back) — keputusan Owner #2: SHA-256 UTF-8 ke
    // atas JSON.stringify pasangan, 8 hex pertama.
    const promptSandbox = resolvePromptSandbox({
        officialTemplate: TRANSLATION_SYSTEM_TEMPLATE,
        officialMalayFewShot: getLanguagePack('Malay').fewShot,
        // [TARGET-LANGUAGE-RULES 2026-11-21] Feed ketiga supaya hash8
        // 3-tuple merangkumi rules eksperimen (auto cache-busting).
        officialMalayTargetLanguageRules: getLanguagePack('Malay').targetLanguageRules
    });
    // [SANDBOX-TUNING v3.39.7] Suffix geometri chunking/konteks HANYA bila
    // medan tuning diisi pada baris sandbox: -tb{batch}p{prev}f{future}
    // (komponen null digugurkan). Eksperimen batch 40 tidak berkongsi cache
    // dengan batch 200; teks-prompt-sahaja & produksi kekal BYTE-IDENTIK
    // dengan pra-v3.39.7 (pin SBX-T7). Enjin yang membaca kunci inilah yang
    // membina geometri — kedua-duanya diselesaikan daripada baris sandbox
    // yang sama, jadi kunci dan geometri tidak boleh berpisah.
    const tuningParts = [];
    if (promptSandbox.tuningActive) {
        const t = promptSandbox.tuning || {};
        if (t.batchSize !== null && t.batchSize !== undefined) tuningParts.push(`b${t.batchSize}`);
        if (t.previousContextSize !== null && t.previousContextSize !== undefined)
            tuningParts.push(`p${t.previousContextSize}`);
        if (t.futureContextSize !== null && t.futureContextSize !== undefined)
            tuningParts.push(`f${t.futureContextSize}`);
    }
    const tuningSuffix = tuningParts.length > 0 ? `-t${tuningParts.join('')}` : '';
    const promptNamespace = promptSandbox.active
        ? `universal-v7-sbx-${promptSandbox.hash8}${tuningSuffix}`
        : tuningSuffix.length > 0
          ? `universal-v7${tuningSuffix}`
          : 'universal-v7';
    // [GEN-PARAMS-KEY 2026-11-22 — Mandat Owner] Parameter generasi aktif
    // (temperature/topP/thinkingLevel/penalti) memisahkan kunci cache supaya
    // ujian A/B tidak dipulangkan hasil cache lama. Segment kosong bila tiada
    // parameter eksplisit → kunci legacy byte-identik.
    const genParamsSuffix = buildGenerationParamsSegment(config);
    const sourceKey = `${sourceFileId}_${targetLang}_trinity-${trinityMode}-${promptNamespace}${genParamsSuffix}_ch-${trinityChannel}`;
    // When ASS passthrough is enabled, append format discriminator to prevent
    // ASS-format cached translations from being served to users expecting SRT
    const assPassthrough = config.convertAssToVtt === false && config.forceSRTOutput !== true;
    const baseKey = assPassthrough ? `${sourceKey}_ass` : sourceKey;

    // Determine bypass mode
    const bypass = config.bypassCache === true;
    const bypassCfg = config.bypassCacheConfig || config.tempCache || {}; // Support both old and new names
    let bypassEnabled = bypass && bypassCfg.enabled !== false;

    // Get user hash for user-scoped caching
    // CRITICAL: userHash must be a valid non-empty string for bypass cache
    // If missing, bypass cache would be shared across all users!
    const rawHash =
        config && typeof config.__configHash === 'string' && config.__configHash.length > 0 ? config.__configHash : '';
    const userHash = normalizeUserHash(rawHash);
    const hasUserHash = userHash.length > 0;
    // Only allow permanent caching when we have a scoped config hash
    let allowPermanent = hasUserHash;

    // Security: Fall back to permanent cache if no userHash (prevents sharing bypass cache across users)
    if (bypass && bypassEnabled && !userHash) {
        log.warn(
            () =>
                `[CacheKeys] Bypass cache requested but no valid configHash available for ${baseKey} - disabling bypass`
        );
        bypassEnabled = false;
        allowPermanent = false; // do not permit permanent cache writes/reads without a config hash
    }

    // Generate scoped cache key
    // Bypass mode: User-scoped key (e.g., "imdb123_en_es__u_abc123")
    // Permanent mode: Shared key (baseKey) for storage, but runtime tracking is config-scoped when possible
    let cacheKey = baseKey;
    if (bypass && bypassEnabled && hasUserHash) {
        cacheKey = `${baseKey}__u_${userHash}`; // User-scoped for bypass mode
    } else {
        cacheKey = `${baseKey}`;
    }

    // Runtime/in-flight tracking key:
    // - bypass: user-scoped key
    // - permanent: shared base key so all users see in-flight status
    const runtimeKey = bypass && bypassEnabled ? cacheKey : baseKey;

    if (bypass && bypassEnabled) {
        log.debug(() => `[CacheKeys] Generated user-scoped bypass cache key: ${cacheKey}`);
    } else {
        log.debug(() => `[CacheKeys] Using shared translation cache key for ${baseKey}`);
    }

    return {
        baseKey, // Base key without user scoping (e.g., "imdb123_en_es")
        cacheKey, // Scoped key for cache operations (e.g., "imdb123_en_es__u_abc123")
        runtimeKey, // Key for in-flight/partial tracking (scoped when possible)
        bypass, // Whether bypass mode is enabled in config
        bypassEnabled, // Whether bypass mode is actually active (requires userHash)
        userHash, // User configuration hash (empty string if not available)
        allowPermanent // Whether permanent cache access is allowed
    };
}

module.exports = {
    generateCacheKeys,
    resolveTrinityChannelForConfig,
    resolveTrinityModeForConfig
};

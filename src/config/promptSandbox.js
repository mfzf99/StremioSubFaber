/**
 * Prompt Sandbox — Suis Eksperimen Owner (Mandat 2026-11-16, v3.38.0)
 *
 * Satu-satunya fail eksperimen Owner: sunting teks di sini melalui GitHub web,
 * redeploy, dan uji terus di Stremio. CI kekal hijau (gate test-context) dan
 * cache terjemahan auto berubah (namespace -sbx-{hash8}).
 *
 * KONTRAK (keputusan Owner D1–D4 + laporan audit v2):
 *   - enabled TUNGGAL mengaktifkan; false = pengeluaran 100% rasmi.
 *   - Medan null = guna teks rasmi (core.js / malay.js TIDAK disentuh).
 *   - Format placeholder rasmi TUNGGAL: \${...} (sourceLabel, targetLabel,
 *     targetLabelShort, fewShot, targetLanguageRules) — selari core.js +
 *     templat eksperimen Owner (v3.39.2 + TLR 2026-11-21).
 *   - Teks verbatim di hantar ke wayar; sifar mutasi eksport rasmi.
 *   - Hash8 = SHA-256(JSON.stringify([template, fewShot, rules])) 8 hex
 *     pertama — dipakai cacheKeys untuk auto cache-busting sandbox
 *     (3-tuple sejak TLR 2026-11-21; eksperimen pra-TLR dibust sekali).
 *   - Sandbox global per-deploy (D1): kuat selepas redeploy/restart.
 *
 * KESELAMATAN:
 *   - Gate test-context (NODE_ENV/npm_lifecycle_event/NODE_TEST_CONTEXT/
 *     --test execArgv): ujian SELALU melihat teks rasmi walaupun fail ini
 *     diaktifkan di GitHub — CI kekal hijau.
 *   - Fall-back penuh: enabled tanpa teks sah → rasmi + WARN (sifar senyap,
 *     sifar eksperimen separuh jalan).
 *   - Sentinel SUBFABER_PROMPT_BOUNDARY HARAM dalam teks override (split
 *     system/user akan salah belah).
 */

'use strict';

const crypto = require('crypto');

const log = require('../utils/logger');

// Sentinel mustahil wujud dalam arahan — kehadirannya membelahkan system/user.
const { SUBFABER_PROMPT_BOUNDARY } = require('../services/utils/structuredPrompt');

/**
 * Konfigurasi eksperimen Owner — SUNTING DI SINI melalui GitHub web.
 *
 * Contoh siap sedia (template literal backtick — jangan biarkan ${...} tanpa
 * backslash dalam template literal JavaScript):
 *
 * // enabled: true,
 * // translationSystemTemplate: `You are a professional Netflix subtitle translator.
 * // \${sourceLabel} -> \${targetLabel} \${targetLabelShort}
 * // \${fewShot}
 * // ZERO markdown code blocks.`,
 * // malayFewShot: `<example>...</example>`
 */
const promptSandboxConfig = {
    enabled: false,
    translationSystemTemplate: null,
    malayFewShot: null,
    // [TARGET-LANGUAGE-RULES 2026-11-21] Rules khusus BM (token
    // ${targetLanguageRules}); null = rasmi (malay.js pack).
    malayTargetLanguageRules: null,
    // [SANDBOX-TUNING v3.39.7] Medan turun-naik (nullable) pada konfigurasi
    // fail penghantaran — selari dengan baris live Redis; null = default enjin.
    batchSize: null,
    previousContextSize: null,
    futureContextSize: null
};

// [SANDBOX-TUNING v3.39.7 — Mandat Owner 2026-11-20] Julat selamat medan
// tuning chunking/konteks. SSUT tunggal: liveStore (pengesahan simpanan),
// panel UI (had input), enjin (sanitasi defensif) membaca julat ini.
// batchSize max 400 = default produksi 200 + margin (keputusan Owner).
// [v3.39.9 — Mandat Owner] previous/future dinaikkan 0–30/0–15 → 0–50.
// 0 konteks = nilai sah eksplisit.
const TUNING_LIMITS = Object.freeze({
    batchSize: { min: 1, max: 400 },
    previousContextSize: { min: 0, max: 50 },
    futureContextSize: { min: 0, max: 50 }
});

// ── Gate test-context (pengetatan Owner #1) ─────────────────────────────
// node --test telanjang tidak melalui scripts/run-tracked-tests.js; deteksi
// meliputi SEMUA laluan supaya teks eksperimen tidak pernah mewarnakan CI.
// [FASA 1 v3.39.0] Gate kini SSUT KONGSI: promptSandboxLiveStore memakai
// isTestContext() ini (lazy require) supaya override ujian (@_setTestContextForTests)
// menyegerakkan kedua-dua lapisan resolver dan live store.

let testContextCache = null;
let testContextOverride = null; // null = auto-deteksi; true/false = paksaan ujian
function isTestContext() {
    if (testContextOverride !== null) return testContextOverride === true;
    if (testContextCache !== null) return testContextCache;
    try {
        testContextCache =
            process.env.NODE_ENV === 'test' ||
            process.env.npm_lifecycle_event === 'test' ||
            !!process.env.NODE_TEST_CONTEXT ||
            (Array.isArray(process.execArgv) && process.execArgv.some((a) => String(a).includes('--test')));
    } catch (_) {
        testContextCache = false;
    }
    return testContextCache;
}

/** Uji-sahaja: paksa nilai gate (null = pulihkan auto-deteksi). */
function __setTestContextForTests(value) {
    testContextOverride = value === true || value === false ? value : null;
}

// Injection uji-sahaja (bypass gate; dipulihkan oleh reset). Kontrak
// eksplisit suite sandbox — bukan API runtime; tiada input luar diterima.
let testOverride = null;

function __setPromptSandboxForTests(override) {
    testOverride = override && typeof override === 'object' ? { ...override } : null;
}

function __resetPromptSandboxForTests() {
    testOverride = null;
}

// ── Validasi medan ──────────────────────────────────────────────────────

function resolveField(rawValue, fieldName, reasons) {
    if (rawValue === null || rawValue === undefined) return null; // official default
    if (typeof rawValue !== 'string' || rawValue.trim().length === 0) {
        reasons.push(`[PromptSandbox] ${fieldName} is invalid (not a non-empty string) — field stays official.`);
        return null;
    }
    if (rawValue.includes(SUBFABER_PROMPT_BOUNDARY)) {
        reasons.push(
            `[PromptSandbox] ${fieldName} rejected: contains the SUBFABER_PROMPT_BOUNDARY sentinel (it would break the system/user split).`
        );
        return null;
    }
    return rawValue; // verbatim — .trim() is only used for the checks above
}

function computeHash8(effectiveTemplate, effectiveMalayFewShot, effectiveRules) {
    return crypto
        .createHash('sha256')
        .update(JSON.stringify([effectiveTemplate, effectiveMalayFewShot, effectiveRules]), 'utf8')
        .digest('hex')
        .slice(0, 8);
}

// Log sekali per proses (nama + sahaja — sifar dump teks prompt penuh).
let bootLogged = false;

/**
 * Selesaikan pasangan EFEKTIF (official + sandbox) — SSUT tunggal bagi enjin
 * dan kunci cache. Panggilan kekal MURAH & DETERMINISTIK; tiada mutasi input.
 * [FASA 1 v3.39.0] Keutamaan: injection uji-sahaja > baris live Redis
 * (promptSandboxLiveStore — panel web, berkuasa selepas Simpan tanpa restart)
 * > fail konfigurasi penghantaran > official. Baris live DIABAIKAN sepenuhnya
 * dalam test context (jaminan v3.38.0: CI kekal 100% hijau walau baris Redis
 * aktif secara live).
 *
 * @param {{officialTemplate:string, officialMalayFewShot:string}} official
 * @returns {{template:string, malayFewShot:string, active:boolean, hash8:string|null, reasons:string[]}}
 */
function resolvePromptSandbox(official) {
    const officialTemplate = String(official?.officialTemplate ?? '');
    const officialMalayFewShot = String(official?.officialMalayFewShot ?? '');
    // [TARGET-LANGUAGE-RULES 2026-11-21] Rules official (pack malay.js;
    // dipanggil dari malay pack .targetLanguageRules — nama medan official*
    // kekal prefix malayFewShot-style).
    const officialRules = String(official?.officialMalayTargetLanguageRules ?? '');

    // Lazy require elak kitaran modul (liveStore pula mengimport gate ini).
    const { getLiveRow } = require('../services/promptSandboxLiveStore');

    const isInjection = testOverride !== null;
    const liveRow = isInjection || isTestContext() ? null : getLiveRow();
    const source = isInjection ? testOverride : (liveRow ?? promptSandboxConfig);
    const reasons = [];
    if (!isInjection && liveRow) {
        reasons.push('[PromptSandbox] Live Redis row active (web panel) — overrides the configuration file.');
    }

    const enabled = source.enabled === true;
    // Injection eksplisit uji-sahaja MEMUTUSKAN gate sendiri (suite sandbox
    // memerlukan wayar eksperimen diuji DALAM test context); gate hanya
    // menghalang KONFIGURASI PRODUKSI daripada mewarnakan ujian/CI.
    const wantsSandbox = isInjection ? enabled : enabled && !isTestContext();
    if (!isInjection && enabled && isTestContext()) {
        reasons.push('[PromptSandbox] Test context detected — sandbox NOT activated (CI/tests stay on official text).');
    }

    // Per-medan bebas; medan rosak diberi reason, rakan sihat tidak terjejas.
    const sbxTemplate = wantsSandbox
        ? resolveField(source.translationSystemTemplate, 'translationSystemTemplate', reasons)
        : null;
    const sbxFewShot = wantsSandbox ? resolveField(source.malayFewShot, 'malayFewShot', reasons) : null;
    // [TARGET-LANGUAGE-RULES 2026-11-21] Medan ketiga — semantik sama seperti
    // fewShot: null = rasmi pack; string kosong/whitespace ditolak (bukan
    // eksperimen senyap) — Owner yang mahu tiada rules membuang token
    // daripada templat.
    const sbxRules = wantsSandbox
        ? resolveField(source.malayTargetLanguageRules, 'malayTargetLanguageRules', reasons)
        : null;

    // [SANDBOX-TUNING v3.39.7] Tuning chunking/konteks berkongsi suis enabled
    // dengan teks prompt. Medan integer sahaja; nilai rosak → reason + null
    // (sifar eksperimen separuh jalan senyap). 0 konteks ialah nilai sah.
    const tuningFields = ['batchSize', 'previousContextSize', 'futureContextSize'];
    const tuning = { batchSize: null, previousContextSize: null, futureContextSize: null };
    if (wantsSandbox) {
        for (const field of tuningFields) {
            const raw = source[field];
            if (raw === null || raw === undefined) continue;
            const limits = TUNING_LIMITS[field];
            if (typeof raw !== 'number' || !Number.isInteger(raw) || raw < limits.min || raw > limits.max) {
                reasons.push(
                    `[PromptSandbox] ${field} is invalid (${JSON.stringify(raw)}) — stays at the engine default.`
                );
                continue;
            }
            tuning[field] = raw;
        }
    }
    const tuningActive = wantsSandbox && tuningFields.some((f) => tuning[f] !== null);

    const effectiveTemplate = sbxTemplate ?? officialTemplate;
    const effectiveMalayFewShot = sbxFewShot ?? officialMalayFewShot;
    // [TARGET-LANGUAGE-RULES OPT-OUT 2026-11-21 — Mandat Owner] Dalam gelung
    // eksperimen (sandbox aktif), rules ialah OPT-OUT TULen: kotak kosong
    // (null) = rules TIDAK dihantar ('' — token digugurkan), JANGAN
    // fallback kepada teks rasmi. Fall-back official hanya untuk laluan
    // bukan-eksperimen (sandbox tidak aktif) — di sana templat official
    // tidak mempunyai token, jadi nilai tidak pernah sampai ke wayar.
    const effectiveRules = wantsSandbox ? (sbxRules ?? '') : (sbxRules ?? officialRules);
    const active = wantsSandbox && (sbxTemplate !== null || sbxFewShot !== null || sbxRules !== null);

    if (wantsSandbox && !active) {
        reasons.push(
            '[PromptSandbox] enabled=true but translationSystemTemplate/malayFewShot/malayTargetLanguageRules has no valid text — full fallback to the official template/pack (zero half-experiments).'
        );
    }

    const hash8 = active ? computeHash8(effectiveTemplate, effectiveMalayFewShot, effectiveRules) : null;

    if (active && !bootLogged) {
        bootLogged = true;
        log.warn(
            () =>
                `[PromptSandbox] AKTIF — teks eksperimen Owner di wayar (hash8=${hash8}). Cache terjemahan: v7-sbx-${hash8}.`
        );
    }

    return {
        template: effectiveTemplate,
        malayFewShot: effectiveMalayFewShot,
        // [TARGET-LANGUAGE-RULES 2026-11-21] Pasangan EFEKTIF 3-tuple.
        malayTargetLanguageRules: effectiveRules,
        active,
        hash8,
        reasons,
        // [SANDBOX-TUNING v3.39.7] Raw tervalidasi — DEFAULT ENJIN TIDAK
        // diduplikasi di sini; pengguna (translationEngine/cacheKeys) yang
        // memiliki nilai default masing-masing. null bila tidak aktif
        // (konvensyen sama seperti hash8).
        tuning: tuningActive ? tuning : null,
        tuningActive
    };
}

module.exports = {
    promptSandboxConfig,
    resolvePromptSandbox,
    isTestContext,
    TUNING_LIMITS,
    __setTestContextForTests,
    __setPromptSandboxForTests,
    __resetPromptSandboxForTests
};

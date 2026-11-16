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
 *   - Kedua-dua bentuk placeholder disokong oleh enjin: \${...} dan {{...}}
 *     (sourceLabel, targetLabel, targetLabelShort, fewShot).
 *   - Teks verbatim di hantar ke wayar; sifar mutasi eksport rasmi.
 *   - Hash8 = SHA-256(JSON.stringify([template, fewShot])) 8 hex pertama —
 *     dipakai cacheKeys untuk auto cache-busting sandbox.
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
 * Contoh siap sedia (template literal backtick, kedua-dua bentuk placeholder
 * disokong — jangan biarkan ${...} tanpa backslash dalam template literal,
 * ATAU guna {{...}} yang bebas risiko interpolasi JavaScript):
 *
 * // enabled: true,
 * // translationSystemTemplate: `You are a professional Netflix subtitle translator.
 * // {{sourceLabel}} -> {{targetLabel}} {{targetLabelShort}}
 * // {{fewShot}}
 * // ZERO markdown code blocks.`,
 * // malayFewShot: `<example>...</example>`
 */
const promptSandboxConfig = {
    enabled: false,
    translationSystemTemplate: null,
    malayFewShot: null
};

// ── Gate test-context (pengetatan Owner #1) ─────────────────────────────
// node --test telanjang tidak melalui scripts/run-tracked-tests.js; deteksi
// meliputi SEMUA laluan supaya teks eksperimen tidak pernah mewarnakan CI.

let testContextCache = null;
function isTestContext() {
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
    if (rawValue === null || rawValue === undefined) return null; // lalai rasmi
    if (typeof rawValue !== 'string' || rawValue.trim().length === 0) {
        reasons.push(`[PromptSandbox] ${fieldName} tidak sah (bukan string tidak-kosong) — medan kekal rasmi.`);
        return null;
    }
    if (rawValue.includes(SUBFABER_PROMPT_BOUNDARY)) {
        reasons.push(
            `[PromptSandbox] ${fieldName} ditolak: mengandungi sentinel SUBFABER_PROMPT_BOUNDARY (memusnahkan split system/user).`
        );
        return null;
    }
    return rawValue; // verbatim — .trim() hanya untuk pemeriksaan di atas
}

function computeHash8(effectiveTemplate, effectiveMalayFewShot) {
    return crypto
        .createHash('sha256')
        .update(JSON.stringify([effectiveTemplate, effectiveMalayFewShot]), 'utf8')
        .digest('hex')
        .slice(0, 8);
}

// Log sekali per proses (nama + sahaja — sifar dump teks prompt penuh).
let bootLogged = false;

/**
 * Selesaikan pasangan EFEKTIF (official + sandbox) — SSUT tunggal bagi enjin
 * dan kunci cache. Panggilan kekal MURAH & DETERMINISTIK; tiada mutasi input.
 *
 * @param {{officialTemplate:string, officialMalayFewShot:string}} official
 * @returns {{template:string, malayFewShot:string, active:boolean, hash8:string|null, reasons:string[]}}
 */
function resolvePromptSandbox(official) {
    const officialTemplate = String(official?.officialTemplate ?? '');
    const officialMalayFewShot = String(official?.officialMalayFewShot ?? '');

    const isInjection = testOverride !== null;
    const source = isInjection ? testOverride : promptSandboxConfig;
    const reasons = [];

    const enabled = source.enabled === true;
    // Injection eksplisit uji-sahaja MEMUTUSKAN gate sendiri (suite sandbox
    // memerlukan wayar eksperimen diuji DALAM test context); gate hanya
    // menghalang KONFIGURASI PRODUKSI daripada mewarnakan ujian/CI.
    const wantsSandbox = isInjection ? enabled : enabled && !isTestContext();
    if (!isInjection && enabled && isTestContext()) {
        reasons.push('[PromptSandbox] Test context dikesan — sandbox TIDAK diaktifkan (CI/ujian kekal teks rasmi).');
    }

    // Per-medan bebas; medan rosak diberi reason, rakan sihat tidak terjejas.
    const sbxTemplate = wantsSandbox
        ? resolveField(source.translationSystemTemplate, 'translationSystemTemplate', reasons)
        : null;
    const sbxFewShot = wantsSandbox ? resolveField(source.malayFewShot, 'malayFewShot', reasons) : null;

    const effectiveTemplate = sbxTemplate ?? officialTemplate;
    const effectiveMalayFewShot = sbxFewShot ?? officialMalayFewShot;
    const active = wantsSandbox && (sbxTemplate !== null || sbxFewShot !== null);

    if (wantsSandbox && !active) {
        reasons.push(
            '[PromptSandbox] enabled=true tetapi translationSystemTemplate/malayFewShot tiada teks sah — fall-back penuh ke templat/pack rasmi (sifar eksperimen separuh jalan).'
        );
    }

    const hash8 = active ? computeHash8(effectiveTemplate, effectiveMalayFewShot) : null;

    if (active && !bootLogged) {
        bootLogged = true;
        log.warn(
            () =>
                `[PromptSandbox] AKTIF — teks eksperimen Owner di wayar (hash8=${hash8}). Cache terjemahan: v7-sbx-${hash8}.`
        );
    }

    return { template: effectiveTemplate, malayFewShot: effectiveMalayFewShot, active, hash8, reasons };
}

module.exports = {
    promptSandboxConfig,
    resolvePromptSandbox,
    __setPromptSandboxForTests,
    __resetPromptSandboxForTests
};

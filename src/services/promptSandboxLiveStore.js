/**
 * Prompt Sandbox Live Store (Fasa 1 Panel Visual — Mandat Owner 2026-11-16, v3.39.0)
 *
 * Snapshot module-level bagi baris Redis live `sandbox:prompt-config`
 * (jenis SESSION — no-expiry, kalis purge terjemahan/pembersihan storan)
 * supaya panel web Owner menukar teks eksperimen SECARA LIVE tanpa restart.
 *
 * Reka bentuk (Rangka A–Z diluluskan + pengetatan Owner):
 *   - HOT PATH SIFAR REDIS: `getLiveRow()` SYNC — dibaca oleh resolver
 *     promptSandbox pada setiap pembinaan enjin/kunci cache.
 *   - Micro-cache 2 saat (`refreshIfStale`, fire-and-forget) untuk konverjens
 *     lintas-replica; simpan/reset pada REPLIKA INI menyegerakkan snapshot
 *     TERUS (pengetatan Owner #1 — bacaan seterusnya serta-merta).
 *   - GATE MUTLAK: dalam test context (`isTestContext`), baris live TIDAK
 *     PERNAH dibaca — CI/ujian kekal 100% teks rasmi walau Redis aktif
 *     (jaminan v3.38.0 terpelihara).
 *   - Fall-back selamat: Redis tiada/gagal → null → laluan fail → official.
 *     Terjemahan tidak pernah gagal kerana sandbox.
 *
 * Antara muka:
 *   getLiveRow()            — sync snapshot (null bila tiada/test context)
 *   refreshRow()            — baca adapter + kemas kini snapshot; null selamat
 *   refreshIfStale()        — fire-and-forget ber-TTL 2s; NO-OP test context
 *   invalidate()            — kosongkan snapshot (paksa bacaan seterusnya)
 *   saveLiveRow(row)        — pengesahan penuh + persist SESSION (TTL null)
 *                             + SNAPSHOT DISGERAKAN SEBELUM resolve (Owner #1)
 *   deleteLiveRow()         — reset: padam baris + kosongkan snapshot
 *   __setLiveRowForTests    — suntikan snapshot uji-sahaja (bypass gate pada
 *                             lapisan ini; resolver masih menghormati
 *                             isTestContext untuk pengeluaran)
 *   __setAdapterForTests    — suntikan adapter palsu untuk unit test
 */

'use strict';

const log = require('../utils/logger');
const { StorageAdapter, StorageFactory } = require('../storage');
const { SUBFABER_PROMPT_BOUNDARY } = require('./utils/structuredPrompt');
// Gate SSUT KONGSI dari resolver — override uji-sahaja (__setTestContextForTests)
// menyegerakkan kedua-dua lapisan. Kitaran require selamat: promptSandbox
// hanya lazy-mem-require modul ini DALAM resolvePromptSandbox.
const { isTestContext } = require('../config/promptSandbox');

const SANDBOX_REDIS_KEY = 'sandbox:prompt-config';
const SNAPSHOT_TTL_MS = 2000; // Tetingkap micro-cache lintas-replica
const MAX_FIELD_CHARS = 50000; // Had aksara per medan (413/400 terlalu besar)

/** Ralat pengesahan medan sandbox — membawa fieldErrors[] mesra frontend. */
class SandboxFieldError extends Error {
    constructor(fieldErrors) {
        super('Sandbox field validation failed');
        this.name = 'SandboxFieldError';
        this.fieldErrors = fieldErrors;
    }
}

// ── Snapshot module-level ────────────────────────────────────────────────
// { row: {schema,enabled,translationSystemTemplate,malayFewShot,savedAt}|null,
//   fetchedAt: number }
let snapshot = { row: null, fetchedAt: 0 };
let testRow = null; // Suntikan uji-sahaja (__setLiveRowForTests)
let testAdapter = null; // Adapter palsu uji-sahaja (__setAdapterForTests)
let adapterPromise = null; // Adapter produksi lazy-sekali
let lastWarnAt = 0; // Throttle WARN kegagalan storan (pola rateLimitRedisStore)

async function resolveAdapter() {
    if (testAdapter) return testAdapter;
    if (!adapterPromise) {
        adapterPromise = StorageFactory.getStorageAdapter().catch((err) => {
            adapterPromise = null;
            throw err;
        });
    }
    return adapterPromise;
}

function warnThrottled(message) {
    const now = Date.now();
    if (now - lastWarnAt < 60_000) return;
    lastWarnAt = now;
    log.warn(() => `[PromptSandboxLiveStore] ${message}`);
}

/**
 * Baca snapshot semasa — SYNC, sifar rangkaian.
 * [GATE MILIK RESOLVER] getLiveRow TIDAK di-gate: ia pembacaan memori sahaja;
 * resolver promptSandbox.js yang mengabaikan baris live dalam test context
 * (`liveRow = isTestContext() ? null : getLiveRow()`) — jaminan CI 100% teks
 * rasmi kekal utuh di lapisan yang betul, manakala snapshot boleh diuji unit.
 */
function getLiveRow() {
    if (testRow) return testRow;
    return snapshot.row;
}

/**
 * Baca baris Redis dan kemas kini snapshot. Baris rosak → null (defensive).
 * @returns {Promise<Object|null>}
 */
async function refreshRow() {
    if (isTestContext()) return null;
    try {
        const adapter = await resolveAdapter();
        const raw = await adapter.get(SANDBOX_REDIS_KEY, StorageAdapter.CACHE_TYPES.SESSION);
        const row = sanitizeRow(raw);
        snapshot = { row, fetchedAt: Date.now() };
        return row;
    } catch (err) {
        // RESILIENSI: kegagalan BACA memelihara snapshot aktif — Redis down
        // tidak boleh menukar teks wayar secara tiba-tiba; hanya baris sah
        // yang dibaca (atau baris rosak sanitize→null) mengemas kini snapshot.
        warnThrottled(`bacaan live gagal (snapshot aktif dipelihara): ${err?.message || err}`);
        return null;
    }
}

/**
 * Fire-and-forget dengan tetingkap TTL: dipanggil di SATU titik laluan
 * terjemahan (permintaan baharu) — paling banyak satu bacaan Redis setiap
 * 2 saat merentas keseluruhan proses. Tidak pernah melempar.
 */
async function refreshIfStale() {
    if (isTestContext()) return;
    if (Date.now() - snapshot.fetchedAt < SNAPSHOT_TTL_MS) return;
    try {
        await refreshRow();
    } catch (_) {
        /* refreshRow sudah swallow + log — kontrak tidak melempar */
    }
}

/** Kosongkan snapshot — bacaan semula d paksa pada refreshIfStale seterusnya. */
function invalidate() {
    snapshot = { row: null, fetchedAt: 0 };
}

/**
 * Pengesahan baris (dipakai oleh saveLiveRow dan sanitizeRow pembacaan).
 * @returns {{fieldErrors: Array, warnings: Array}} keputusan pengesahan.
 */
function validateRow(row) {
    const fieldErrors = [];
    const warnings = [];
    const checkTextField = (field, value) => {
        if (value === null || value === undefined) return true; // sah: kembali official
        if (typeof value !== 'string') {
            fieldErrors.push({ field, code: 'invalid_type', message: `${field} must be a string or null.` });
            return false;
        }
        if (value.trim().length === 0) {
            fieldErrors.push({
                field,
                code: 'empty_or_whitespace',
                message: `${field} cannot be empty (use null to fall back to the official text).`
            });
            return false;
        }
        if (value.includes(SUBFABER_PROMPT_BOUNDARY)) {
            fieldErrors.push({
                field,
                code: 'boundary_sentinel_forbidden',
                message: `${field} contains a forbidden system boundary — it would break the instruction split.`
            });
            return false;
        }
        if (value.length > MAX_FIELD_CHARS) {
            fieldErrors.push({
                field,
                code: 'too_large',
                message: `${field} exceeds the ${MAX_FIELD_CHARS}-character limit.`
            });
            return false;
        }
        return true;
    };

    if (typeof row?.enabled !== 'boolean') {
        fieldErrors.push({
            field: 'enabled',
            code: 'invalid_type',
            message: 'enabled must be a boolean (true / false).'
        });
    }
    const templateOk = checkTextField('translationSystemTemplate', row?.translationSystemTemplate);
    const fewShotOk = checkTextField('malayFewShot', row?.malayFewShot);

    // AMARAN MESRA (bukan ralat): placeholder tertinggal — terjemahan tetap
    // berjalan; Owner kekal bebas (keputusan D4). Bila kedua-dua medan rosak,
    // skip semakan placeholder (tiada apa yang akan disimpan).
    if (templateOk && typeof row?.translationSystemTemplate === 'string' && row.translationSystemTemplate.length > 0) {
        // [v3.39.2 — Mandat Owner] SATU format placeholder rasmi sahaja: ${...}
        // (selari 100% dengan core.js). Bentuk {{...}} dibersihkan daripada
        // kontrak; pengesan hanya menyemak bentuk rasmi ini.
        for (const [field, value] of [
            ['translationSystemTemplate', row.translationSystemTemplate],
            ['malayFewShot', typeof row?.malayFewShot === 'string' ? row.malayFewShot : null]
        ]) {
            if (field === 'malayFewShot' && !fewShotOk) continue;
            if (!value) continue;
            for (const name of ['sourceLabel', 'targetLabel', 'targetLabelShort', 'fewShot']) {
                if (!value.includes(`\${${name}}`)) {
                    warnings.push({
                        code: 'placeholder_missing',
                        field,
                        placeholder: name,
                        message: `The \${${name}} placeholder is missing — translation will still run, but this instruction will not be adjusted automatically.`
                    });
                    break; // satu amaran per medan cukup
                }
            }
        }
    }

    return { fieldErrors, warnings };
}

/** Sanitasi baris yang dibaca dari storan (edisi tangan / replika lama). */
function sanitizeRow(raw) {
    if (!raw || typeof raw !== 'object') return null;
    if (typeof raw.enabled !== 'boolean') return null;
    const t = raw.translationSystemTemplate;
    const f = raw.malayFewShot;
    if (t !== null && t !== undefined && typeof t !== 'string') return null;
    if (f !== null && f !== undefined && typeof f !== 'string') return null;
    return {
        schema: 1,
        enabled: raw.enabled,
        translationSystemTemplate: typeof t === 'string' ? t : null,
        malayFewShot: typeof f === 'string' ? f : null,
        savedAt: typeof raw.savedAt === 'string' ? raw.savedAt : null
    };
}

/**
 * Simpan baris: pengesahan → persist (SESSION, TIDAK TTL) → SNAPSHOT
 * DISGERAKAN SEBELUM pulangan (pengetatan Owner #1) supaya bacaan
 * terjemahan seterusnya pada replika ini melihat teks baharu serta-merta.
 * @throws {SandboxFieldError} bila pengesahan gagal (400 route).
 */
async function saveLiveRow(row) {
    const { fieldErrors } = validateRow(row);
    if (fieldErrors.length > 0) throw new SandboxFieldError(fieldErrors);

    const adapter = await resolveAdapter();
    const persist = {
        schema: 1,
        enabled: row.enabled === true,
        translationSystemTemplate: row.translationSystemTemplate ?? null,
        malayFewShot: row.malayFewShot ?? null,
        savedAt: new Date().toISOString()
    };
    await adapter.set(SANDBOX_REDIS_KEY, persist, StorageAdapter.CACHE_TYPES.SESSION, null);

    // Pengetatan Owner #1: snapshot segerak DALAM pengendali save — jangan
    // tunggu tetingkap TTL. (resolveAdapter boleh gagal di atas — pengendali
    // route menukar ia kepada 503; snapshot tidak disentuh bila gagal.)
    snapshot = { row: sanitizeRow(persist), fetchedAt: Date.now() };
    return snapshot.row;
}

/** Reset: padam baris + kosongkan snapshot (kembali kepada fail → official). */
async function deleteLiveRow() {
    const adapter = await resolveAdapter();
    await adapter.delete(SANDBOX_REDIS_KEY, StorageAdapter.CACHE_TYPES.SESSION);
    invalidate();
}

// ── Suntikan uji-sahaja ────────────────────────────────────────────────

function __setLiveRowForTests(row) {
    testRow = sanitizeRow(row);
}

function __resetLiveRowForTests() {
    testRow = null;
    invalidate();
}

function __setAdapterForTests(adapter) {
    testAdapter = adapter;
    adapterPromise = null;
}

module.exports = {
    getLiveRow,
    refreshRow,
    refreshIfStale,
    invalidate,
    saveLiveRow,
    deleteLiveRow,
    validateRow,
    SandboxFieldError,
    SANDBOX_REDIS_KEY,
    SNAPSHOT_TTL_MS,
    MAX_FIELD_CHARS,
    __setLiveRowForTests,
    __resetLiveRowForTests,
    __setAdapterForTests
};

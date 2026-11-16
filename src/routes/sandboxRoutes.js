/**
 * Sandbox Routes — Panel Visual Prompt Sandbox (Fasa 1, Mandat Owner 2026-11-16, v3.39.0)
 *
 * REST API panel eksperimen Owner. Keselamatan:
 *   - Kunci env SANDBOX_ADMIN_KEY; perbandingan masa-terlar constantTimeCompare
 *     (utils/security). Tidak di-set → 503 (fail-closed, tanpa kebocoran info).
 *   - Kunci HANYA melalui header X-Sandbox-Key — query string ditolak keras
 *     (bocor melalui log/riwayat pelayar).
 *   - Rate limit express-rate-limit (fallback memori automatik bila bukan
 *     Redis; test context TIDAK menyentuh Redis langsung).
 *   - Setiap respons: no-store (pola setNoStore repo). Sifar echo kunci.
 *   - Teks prompt hanya selepas auth lulus; shell halaman kosong tanpa data.
 *
 * Struktur handler: SATU handler async per endpoint yang MENUNGGU penuh
 * (limiter via await-promise; kunci sync boolean) supaya respons ditulis
 * sebelum promise selesai — harness ujian dan Express sama-sama melihat
 * respons final, sifar race tulis-tertunda.
 *
 * Pengetatan Owner Fasa 1:
 *   #1 PUT/reset menyegerakkan snapshot SEBELUM 200 — bacaan terjemahan
 *      seterusnya pada replika ini melihat teks baharu serta-merta.
 *   #2 GET config SENTIASA memulangkan officialTemplate + officialMalayFewShot
 *      (v3.37.0) bersama nilai aktif — kotak UI tidak pernah kelihatan kosong.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { constantTimeCompare } = require('../utils/security');

// ── Konstanta kontrak ───────────────────────────────────────────────────
const SANDBOX_PAGE_PATH = path.join(__dirname, '..', '..', 'public', 'sandbox.html');
const ASSET_VERSION_PLACEHOLDER = '__SBX_ASSET_VERSION__';

// Lazy require berat (live store → storage factory) supaya require modul
// ini kekal murah untuk pendaftaran awal dan ujian unit.
function loadLiveStore() {
    return require('../services/promptSandboxLiveStore');
}
function loadResolver() {
    return require('../config/promptSandbox');
}

/** Pulangkan true bila kunci sah; false bila respons ralat sudah ditulis. */
function checkSandboxKey(req, res) {
    const adminKey = process.env.SANDBOX_ADMIN_KEY;
    if (!adminKey) {
        res.status(503).json({ error: 'sandbox_admin_key_not_configured' });
        return false;
    }
    // Query string sengaja TIDAK diperiksa — header sahaja diterima.
    const provided = req?.headers?.['x-sandbox-key'];
    if (typeof provided !== 'string' || !constantTimeCompare(provided, adminKey)) {
        res.status(401).json({ error: 'invalid_key' });
        return false;
    }
    return true;
}

/** Tunggu limiter express-rate-limit selesai (increment + headers). */
function runLimiter(limiter, req, res) {
    return new Promise((resolve, reject) => {
        limiter(req, res, (err) => (err ? reject(err) : resolve()));
    });
}

/**
 * Daftar semua laluan sandbox pada app Express.
 * @param {object} app - Instance Express.
 * @param {{log:object, setNoStore:Function, respondStorageUnavailable:Function, packageVersion:string}} deps
 */
function registerSandboxRoutes(app, deps = {}) {
    if (!app) {
        throw new Error('Express app instance is required to register sandbox routes');
    }
    const log = deps.log;
    if (!log || typeof deps.setNoStore !== 'function') {
        throw new Error('Missing dependencies for sandbox routes');
    }
    const setNoStore = deps.setNoStore;
    const respondStorageUnavailable =
        typeof deps.respondStorageUnavailable === 'function' ? deps.respondStorageUnavailable : null;
    const packageVersion = typeof deps.packageVersion === 'string' && deps.packageVersion ? deps.packageVersion : '';

    // Rate limiter: 10 cubaan auth/min, 30 tulisan/min (pola repo). Test
    // context memilih fallback memori — sifar percubaan sambungan Redis pada
    // runner ujian (socket hang). Kegagalan membina limiter TIDAK mematikan
    // panel (auth kekal wajib; tulisan tanpa limiter).
    let authLimiter = null;
    let saveLimiter = null;
    try {
        const { rateLimit, ipKeyGenerator } = require('express-rate-limit');
        const { createRateLimitRedisStore } = require('../utils/rateLimitRedisStore');
        const { isTestContext } = loadResolver();
        const storeFor = (prefix) => {
            if (isTestContext()) return undefined;
            try {
                return createRateLimitRedisStore(prefix, {});
            } catch (_) {
                return undefined;
            }
        };
        const baseLimiter = { standardHeaders: true, legacyHeaders: false, keyGenerator: ipKeyGenerator };
        authLimiter = rateLimit({ ...baseLimiter, windowMs: 60_000, limit: 10, store: storeFor('sandbox-auth') });
        saveLimiter = rateLimit({ ...baseLimiter, windowMs: 60_000, limit: 30, store: storeFor('sandbox-save') });
    } catch (err) {
        log.warn?.(() => `[SandboxRoutes] Rate limiter tidak tersedia — laluan tanpa limiter: ${err?.message || err}`);
    }

    function replaceAssetVersion(html, version) {
        const safeVersion = String(version || '').replace(/[^0-9a-zA-Z.-]/g, '');
        return String(html).replaceAll(ASSET_VERSION_PLACEHOLDER, safeVersion);
    }

    // ── Status efektif — SSUT resolver + snapshot live ────────────────────
    function effectiveSnapshot() {
        const liveStore = loadLiveStore();
        const { resolvePromptSandbox, promptSandboxConfig } = loadResolver();
        const { TRANSLATION_SYSTEM_TEMPLATE } = require('../services/prompts/trinity/translation/core');
        const { getLanguagePack } = require('../services/prompts/languagePacks');
        const officialTemplate = TRANSLATION_SYSTEM_TEMPLATE;
        const officialMalayFewShot = getLanguagePack('Malay').fewShot;
        const eff = resolvePromptSandbox({ officialTemplate, officialMalayFewShot });
        const liveRow = liveStore.getLiveRow();
        return {
            officialTemplate,
            officialMalayFewShot,
            enabled: liveRow ? liveRow.enabled === true : promptSandboxConfig.enabled === true,
            translationSystemTemplate: liveRow ? liveRow.translationSystemTemplate : null,
            malayFewShot: liveRow ? liveRow.malayFewShot : null,
            active: eff.active,
            hash8: eff.hash8,
            reasons: eff.reasons,
            source: liveRow ? 'redis' : 'file'
        };
    }

    // ── GET /sandbox — shell halaman (awam, tanpa data; UI minta kunci) ──
    app.get('/sandbox', async (req, res) => {
        setNoStore(res);
        try {
            const html = fs.readFileSync(SANDBOX_PAGE_PATH, 'utf8');
            res.status(200).send(replaceAssetVersion(html, packageVersion));
        } catch (_) {
            // Fasa 2 (Kimi) membekalkan fail; sebelum itu shell minimum supaya
            // route tetap hidup (200, bukan 500) — tiada data sensitif di dalam.
            res.status(200).send(
                replaceAssetVersion(
                    '<!doctype html><html lang="ms"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>SubFaber Sandbox</title></head><body><main data-sandbox-shell="pending-frontend"><h1>Panel Sandbox</h1><p>Halaman frontend belum dipasang (Fasa 2).</p></main></body></html>',
                    packageVersion
                )
            );
        }
    });

    // ── POST /api/sandbox/auth — sahkan kunci, pulangkan sumber ──────────
    app.post('/api/sandbox/auth', async (req, res) => {
        setNoStore(res);
        if (authLimiter) {
            try {
                await runLimiter(authLimiter, req, res);
            } catch (_) {
                /* limiter gagal → teruskan kepada auth (fail-open limiter,
                   fail-closed kunci) */
            }
        }
        if (!checkSandboxKey(req, res)) return;
        const snap = effectiveSnapshot();
        res.status(200).json({ ok: true, source: snap.source });
    });

    // ── GET /api/sandbox/config — nilai aktif + rasmi (kotak sentiasa terisi) ──
    app.get('/api/sandbox/config', async (req, res) => {
        setNoStore(res);
        if (!checkSandboxKey(req, res)) return;
        res.status(200).json(effectiveSnapshot());
    });

    // ── PUT /api/sandbox/config — simpan + snapshot segerak SEBELUM 200 ──
    app.put('/api/sandbox/config', async (req, res) => {
        setNoStore(res);
        if (!checkSandboxKey(req, res)) return;
        if (saveLimiter) {
            try {
                await runLimiter(saveLimiter, req, res);
            } catch (_) {
                /* fail-open limiter, fail-closed kunci */
            }
        }
        const liveStore = loadLiveStore();
        const body = req.body || {};
        const row = {
            enabled: body.enabled,
            translationSystemTemplate: body.translationSystemTemplate ?? null,
            malayFewShot: body.malayFewShot ?? null
        };
        try {
            const warnings = liveStore.validateRow(row).warnings;
            await liveStore.saveLiveRow(row); // snapshot disegerakkan di dalam
            const snap = effectiveSnapshot();
            log.info?.(() => `[SandboxRoutes] Config disimpan (active=${snap.active}, hash8=${snap.hash8 ?? '-'})`);
            res.status(200).json({ saved: true, warnings, effective: snap });
        } catch (err) {
            if (err instanceof liveStore.SandboxFieldError) {
                res.status(400).json({ fieldErrors: err.fieldErrors, warnings: [] });
                return;
            }
            log.warn?.(() => `[SandboxRoutes] Simpan gagal: ${err?.message || err}`);
            if (respondStorageUnavailable) {
                respondStorageUnavailable(res);
                return;
            }
            res.status(503).json({ error: 'storage_unavailable' });
        }
    });

    // ── POST /api/sandbox/reset — padam baris + snapshot segerak ─────────
    app.post('/api/sandbox/reset', async (req, res) => {
        setNoStore(res);
        if (!checkSandboxKey(req, res)) return;
        if (saveLimiter) {
            try {
                await runLimiter(saveLimiter, req, res);
            } catch (_) {
                /* fail-open limiter, fail-closed kunci */
            }
        }
        const liveStore = loadLiveStore();
        try {
            await liveStore.deleteLiveRow(); // invalidate snapshot terbina dalam
            const snap = effectiveSnapshot();
            log.info?.(() => '[SandboxRoutes] Config direset ke lalai (baris Redis dipadam)');
            res.status(200).json({ reset: true, effective: snap });
        } catch (err) {
            log.warn?.(() => `[SandboxRoutes] Reset gagal: ${err?.message || err}`);
            if (respondStorageUnavailable) {
                respondStorageUnavailable(res);
                return;
            }
            res.status(503).json({ error: 'storage_unavailable' });
        }
    });
}

module.exports = { registerSandboxRoutes, SANDBOX_PAGE_PATH, ASSET_VERSION_PLACEHOLDER };

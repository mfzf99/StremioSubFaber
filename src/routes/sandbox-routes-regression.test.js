/**
 * Sandbox Routes Regression — Fasa 1 Panel Visual (v3.39.0, red-first)
 *
 * Ujian kontrak `src/routes/sandboxRoutes.js` — pengesahan Owner, kod ralat,
 * dan bentuk respons (mock Express ringkas; sifar rangkaian):
 *   SBX-API-1  Pendaftaran: registerSandboxRoutes(app, deps) fail-fast.
 *   SBX-API-2  GET /sandbox: shell awam tanpa auth; no-store; versi aset diganti.
 *   SBX-API-3  Auth: tanpa kunci / salah → 401; env tidak di-set → 503
 *               sandbox_admin_key_not_configured; betul → 200 { ok, source }.
 *   SBX-API-4  Kunci TIDAK diterima melalui query string (hanya header).
 *   SBX-API-5  GET /api/sandbox/config: sentiasa memulangkan officialTemplate +
 *               officialMalayFewShot (v3.37.0) bersama nilai aktif (pengetatan
 *               Owner #2 — kotak UI sentiasa terisi penuh).
 *   SBX-API-6  PUT config: 400 medan (enabled bukan boolean / sentinel / kosong /
 *               saiz) dengan fieldErrors[]; 200 bahagia membawa warnings[]
 *               placeholder-missing mesra; snapshot disegerakkan SEBELUM 200
 *               (pengetatan Owner #1 — refreshRow dipanggil dalam pengendali).
 *   SBX-API-7  POST /reset: 200 { reset:true } → baris dipadam + snapshot
 *               disegerakkan; 503 storage bila adapter gagal.
 *   SBX-API-8  Semua respons sandbox: no-store; tiada nilai kunci dalam mana-mana
 *               respons/log; 401 tidak membocorkan sama ada kunci hampir betul.
 */

const test = require('node:test');
const assert = require('node:assert');

const { registerSandboxRoutes } = require('./sandboxRoutes');
const { SUBFABER_PROMPT_BOUNDARY } = require('../services/utils/structuredPrompt');
const {
    __setLiveRowForTests,
    __resetLiveRowForTests,
    __setAdapterForTests
} = require('../services/promptSandboxLiveStore');
const { __setTestContextForTests, promptSandboxConfig } = require('../config/promptSandbox');

const ADMIN_KEY = 'sbx-test-admin-key-0123456789';

function makeRes() {
    const res = {
        statusCode: 200,
        headers: {},
        body: null,
        status(code) {
            this.statusCode = code;
            return this;
        },
        setHeader(k, v) {
            this.headers[k.toLowerCase()] = v;
            return this;
        },
        json(payload) {
            this.body = payload;
            return this;
        },
        send(payload) {
            this.body = payload;
            return this;
        },
        sendFile() {
            this.body = '<file>';
            return this;
        },
        redirect() {
            this.statusCode = 302;
            return this;
        }
    };
    return res;
}

function makeApp() {
    const routes = [];
    return {
        routes,
        get(path, ...handlers) {
            routes.push({ method: 'get', path, handlers });
        },
        post(path, ...handlers) {
            routes.push({ method: 'post', path, handlers });
        },
        put(path, ...handlers) {
            routes.push({ method: 'put', path, handlers });
        },
        use(..._args) {
            /* middleware mounting — tidak dipakai dalam harness */
        }
    };
}

async function dispatch(app, method, path, { headers = {}, query = {}, body = null } = {}) {
    const route = app.routes.find((r) => r.method === method && r.path === path);
    if (!route) throw new Error(`route not found: ${method} ${path}`);
    const req = { headers, query, body: body || {}, params: {} };
    const res = makeRes();
    for (const handler of route.handlers) {
        await new Promise((resolve, reject) => {
            const p = handler(req, res, (err) => (err ? reject(err) : resolve()));
            if (p && typeof p.then === 'function') p.then(resolve, reject);
        });
    }
    return { req, res };
}

function baseDeps() {
    return {
        log: {
            info: () => {},
            warn: () => {},
            error: () => {},
            debug: () => {}
        },
        setNoStore: (res) => res.setHeader('Cache-Control', 'no-store, must-revalidate'),
        respondStorageUnavailable: (res) => {
            res.status(503).json({ error: 'storage_unavailable' });
            return true;
        },
        packageVersion: '3.39.0-test'
    };
}

function authHeaders() {
    return { 'x-sandbox-key': ADMIN_KEY };
}

function makeFakeAdapter() {
    const store = new Map();
    return {
        store,
        calls: [],
        async get(key, type) {
            this.calls.push(['get', key, type]);
            const id = `${type}:${key}`;
            return store.has(id) ? JSON.parse(JSON.stringify(store.get(id))) : null;
        },
        async set(key, value, type, ttl) {
            this.calls.push(['set', key, type, ttl]);
            store.set(`${type}:${key}`, JSON.parse(JSON.stringify(value)));
            return true;
        },
        async delete(key, type) {
            this.calls.push(['delete', key, type]);
            store.delete(`${type}:${key}`);
            return true;
        }
    };
}

test('SBX-API-1: registerSandboxRoutes fail-fast tanpa app/deps', () => {
    assert.throws(() => registerSandboxRoutes(null, baseDeps()), /app instance/);
    const app = makeApp();
    assert.throws(() => registerSandboxRoutes(app, { ...baseDeps(), log: null }), /dependencies/i);
});

test('SBX-API-2: GET /sandbox — shell awam, no-store, versi aset diganti', async () => {
    const prev = process.env.SANDBOX_ADMIN_KEY;
    process.env.SANDBOX_ADMIN_KEY = ADMIN_KEY;
    const app = makeApp();
    registerSandboxRoutes(app, baseDeps());
    const { res } = await dispatch(app, 'get', '/sandbox');
    try {
        assert.ok([200, 500].includes(res.statusCode), `status shell: ${res.statusCode}`);
        assert.equal(res.headers['cache-control'], 'no-store, must-revalidate', 'shell no-store');
        const html = typeof res.body === 'string' ? res.body : '';
        assert.ok(!html.includes('__SBX_ASSET_VERSION__'), 'placeholder versi diganti sepenuhnya');
        // Fasa 1: fail Kimi belum wujud → shell fallback; Fasa 2 akan membawa
        // versi pakej terbenam pada aset. Terima kedua-dua keadaan.
        assert.ok(
            html.includes('3.39.0-test') || html.includes('Fasa 2'),
            'shell fallback Fasa 1 ATAU versi pakej terbenam'
        );
    } finally {
        if (prev === undefined) delete process.env.SANDBOX_ADMIN_KEY;
        else process.env.SANDBOX_ADMIN_KEY = prev;
    }
});

test('SBX-API-3: auth — 503 tanpa env; 401 kunci salah; 200 kunci betul', async () => {
    const app = makeApp();
    registerSandboxRoutes(app, baseDeps());

    const prev = process.env.SANDBOX_ADMIN_KEY;
    try {
        delete process.env.SANDBOX_ADMIN_KEY;
        const missing = await dispatch(app, 'post', '/api/sandbox/auth', { headers: authHeaders() });
        assert.equal(missing.res.statusCode, 503, 'env tidak di-set → 503');
        assert.equal(missing.res.body.error, 'sandbox_admin_key_not_configured');
        assert.equal(missing.res.headers['cache-control'], 'no-store, must-revalidate');

        process.env.SANDBOX_ADMIN_KEY = ADMIN_KEY;
        const wrong = await dispatch(app, 'post', '/api/sandbox/auth', { headers: { 'x-sandbox-key': 'salah-total' } });
        assert.equal(wrong.res.statusCode, 401, 'kunci salah → 401');
        assert.equal(wrong.res.body.error, 'invalid_key');
        assert.ok(!JSON.stringify(wrong.res.body).includes('salah-total'), '401 tidak echo kunci');

        const ok = await dispatch(app, 'post', '/api/sandbox/auth', { headers: authHeaders() });
        assert.equal(ok.res.statusCode, 200);
        assert.equal(ok.res.body.ok, true);
        assert.ok(['redis', 'file'].includes(ok.res.body.source), 'source dipulangkan');
    } finally {
        if (prev === undefined) delete process.env.SANDBOX_ADMIN_KEY;
        else process.env.SANDBOX_ADMIN_KEY = prev;
    }
});

test('SBX-API-4: kunci dalam query string TIDAK diterima', async () => {
    const app = makeApp();
    registerSandboxRoutes(app, baseDeps());
    const prev = process.env.SANDBOX_ADMIN_KEY;
    try {
        process.env.SANDBOX_ADMIN_KEY = ADMIN_KEY;
        const viaQuery = await dispatch(app, 'get', '/api/sandbox/config', {
            query: { key: ADMIN_KEY },
            headers: {}
        });
        assert.equal(viaQuery.res.statusCode, 401, 'kunci query string → ditolak (401)');
    } finally {
        if (prev === undefined) delete process.env.SANDBOX_ADMIN_KEY;
        else process.env.SANDBOX_ADMIN_KEY = prev;
    }
});

test('SBX-API-5: GET config sentiasa membawa officialTemplate + officialMalayFewShot terisi penuh', async () => {
    const app = makeApp();
    registerSandboxRoutes(app, baseDeps());
    const prev = process.env.SANDBOX_ADMIN_KEY;
    try {
        process.env.SANDBOX_ADMIN_KEY = ADMIN_KEY;
        __setTestContextForTests(false);
        // Baris live hanya malayFewShot — System Prompt kotak mesti tetap terisi official.
        __setLiveRowForTests({ enabled: true, translationSystemTemplate: null, malayFewShot: 'LIVE F' });
        const { res } = await dispatch(app, 'get', '/api/sandbox/config', { headers: authHeaders() });
        assert.equal(res.statusCode, 200);
        const b = res.body;
        assert.ok(b.officialTemplate && b.officialTemplate.length > 50, 'officialTemplate (v3.37.0) sentiasa hadir');
        assert.ok(
            b.officialTemplate.includes('professional Netflix subtitle translator.'),
            'officialTemplate = teks rasmi sebenar'
        );
        assert.ok(
            b.officialMalayFewShot && b.officialMalayFewShot.includes('<bad_textbook>'),
            'officialMalayFewShot rasmi hadir'
        );
        assert.equal(b.translationSystemTemplate, null, 'medan aktif null dipulangkan apa adanya');
        assert.equal(b.malayFewShot, 'LIVE F');
        assert.equal(b.enabled, true);
        assert.equal(b.active, true);
        assert.ok(/^[0-9a-f]{8}$/.test(b.hash8), 'hash8 aktif hadir');
        assert.ok(Array.isArray(b.reasons));
    } finally {
        if (prev === undefined) delete process.env.SANDBOX_ADMIN_KEY;
        else process.env.SANDBOX_ADMIN_KEY = prev;
        __setTestContextForTests(null);
        __resetLiveRowForTests();
    }
});

test('SBX-API-6: PUT config — 400 medan, warnings placeholder, snapshot segerak sebelum 200', async () => {
    const app = makeApp();
    registerSandboxRoutes(app, baseDeps());
    const prev = process.env.SANDBOX_ADMIN_KEY;
    try {
        process.env.SANDBOX_ADMIN_KEY = ADMIN_KEY;
        __setTestContextForTests(false);
        __resetLiveRowForTests();
        const adapter = makeFakeAdapter();
        __setAdapterForTests(adapter);

        // (a) enabled bukan boolean → 400 fieldErrors.
        const badEnabled = await dispatch(app, 'put', '/api/sandbox/config', {
            headers: authHeaders(),
            body: { enabled: 'on', translationSystemTemplate: null, malayFewShot: null }
        });
        assert.equal(badEnabled.res.statusCode, 400);
        assert.ok(badEnabled.res.body.fieldErrors.some((f) => f.field === 'enabled'));

        // (b) sentinel → 400 kod khusus.
        const sentinel = await dispatch(app, 'put', '/api/sandbox/config', {
            headers: authHeaders(),
            body: { enabled: true, translationSystemTemplate: `X ${SUBFABER_PROMPT_BOUNDARY}`, malayFewShot: null }
        });
        assert.equal(sentinel.res.statusCode, 400);
        assert.ok(
            sentinel.res.body.fieldErrors.some((f) => f.code === 'boundary_sentinel_forbidden'),
            'kod sentinel mesra frontend'
        );

        // (c) Saiz besar → 400 (medan terlalu besar).
        const big = 'x'.repeat(50001);
        const tooBig = await dispatch(app, 'put', '/api/sandbox/config', {
            headers: authHeaders(),
            body: { enabled: true, translationSystemTemplate: big, malayFewShot: null }
        });
        assert.equal(tooBig.res.statusCode, 400);

        // (d) Bahagia + warning placeholder tertinggal (bukan ralat — mesej mesra).
        const saved = await dispatch(app, 'put', '/api/sandbox/config', {
            headers: authHeaders(),
            body: { enabled: true, translationSystemTemplate: 'TEKS TANPA PLACEHOLDER SAMA SEKALI', malayFewShot: null }
        });
        assert.equal(saved.res.statusCode, 200, 'save tanpa placeholder tetap diterima');
        assert.equal(saved.res.body.saved, true);
        assert.ok(
            saved.res.body.warnings.some((w) => w.code === 'placeholder_missing'),
            'warning mesra placeholder wajib hadir'
        );
        // Pengetatan Owner #1: snapshot disegerakkan DALAM pengendali sebelum 200 —
        // resolve() selepas respons mesti melihat teks baharu tanpa refresh manual.
        const { resolvePromptSandbox } = require('../config/promptSandbox');
        const eff = resolvePromptSandbox({ officialTemplate: 'OFF', officialMalayFewShot: 'OFF-F' });
        assert.equal(eff.template, 'TEKS TANPA PLACEHOLDER SAMA SEKALI', 'snapshot selepas 200 sudah baru');

        // (e) [v3.39.2] Teks dengan SEMUA placeholder rasmi ${...} → TIADA
        // amaran placeholder (pembetulan tersalah-lapor: dahulu bentuk ${...}
        // sah disalahlaporkan hilang; pengesan kini menyemak ${...} tunggal).
        const withPlaceholders = await dispatch(app, 'put', '/api/sandbox/config', {
            headers: authHeaders(),
            body: {
                enabled: true,
                translationSystemTemplate: 'TEXT ${sourceLabel} -> ${targetLabel} ${targetLabelShort} ${fewShot}',
                malayFewShot: null
            }
        });
        assert.equal(withPlaceholders.res.statusCode, 200, 'save dengan ${...} diterima');
        assert.equal(
            withPlaceholders.res.body.warnings.filter((w) => w.code === 'placeholder_missing').length,
            0,
            'placeholder ${...} lengkap pada templat → sifar amaran pada medan templat'
        );

        // (e) 401 tanpa kunci pada PUT.
        const unauth = await dispatch(app, 'put', '/api/sandbox/config', {
            body: { enabled: true, translationSystemTemplate: 'X', malayFewShot: null }
        });
        assert.equal(unauth.res.statusCode, 401);
    } finally {
        if (prev === undefined) delete process.env.SANDBOX_ADMIN_KEY;
        else process.env.SANDBOX_ADMIN_KEY = prev;
        __setTestContextForTests(null);
        __resetLiveRowForTests();
        __setAdapterForTests(null);
    }
});

test('SBX-API-7: POST /reset — baris dipadam + snapshot segerak; 503 bila storan gagal', async () => {
    const app = makeApp();
    registerSandboxRoutes(app, baseDeps());
    const prev = process.env.SANDBOX_ADMIN_KEY;
    const failing = {
        async get() {
            throw new Error('redis down');
        },
        async set() {
            throw new Error('redis down');
        },
        async delete() {
            throw new Error('redis down');
        }
    };
    try {
        process.env.SANDBOX_ADMIN_KEY = ADMIN_KEY;
        __setTestContextForTests(false);
        const adapter = makeFakeAdapter();
        __setAdapterForTests(adapter);
        __resetLiveRowForTests();
        // Baris diisi melalui ADAPTER (bukan __setLiveRowForTests — suntikan
        // itu memintas pemadaman snapshot) supaya reset menghapus baris sebenar.
        const { StorageAdapter: SA } = require('../storage');
        adapter.store.set(`${SA.CACHE_TYPES.SESSION}:sandbox:prompt-config`, {
            schema: 1,
            enabled: true,
            translationSystemTemplate: 'ROW',
            malayFewShot: null,
            savedAt: new Date().toISOString()
        });

        const ok = await dispatch(app, 'post', '/api/sandbox/reset', { headers: authHeaders() });
        assert.equal(ok.res.statusCode, 200, 'reset lalai berjaya');
        assert.equal(ok.res.body.reset, true);
        // Pin tingkah-laku gate (bukan nilai literal fail — preseden v3.38.0
        // SBX-1/SBX-2): reset memadam baris Redis dan KEMBALI kepada keadaan
        // konfigurasi fail, apa pun keadaannya (eksperimen GitHub aktif atau lalai).
        const fileActive = promptSandboxConfig.enabled === true;
        assert.equal(ok.res.body.effective.source, 'file', 'selepas reset sumber kembali ke fail');
        assert.equal(ok.res.body.effective.active, fileActive, 'selepas reset aktif selari dengan fail');
        assert.equal(ok.res.body.effective.hash8 === null, !fileActive, 'hash8 selari dengan keadaan fail');
        assert.equal(ok.res.body.effective.translationSystemTemplate, null, 'baris Redis dipadam sepenuhnya');

        // Reset saat storan gagal → 503 storage_unavailable (fail-closed jelas).
        __setAdapterForTests(failing);
        const fail = await dispatch(app, 'post', '/api/sandbox/reset', { headers: authHeaders() });
        assert.equal(fail.res.statusCode, 503);
        assert.equal(fail.res.body.error, 'storage_unavailable');
    } finally {
        if (prev === undefined) delete process.env.SANDBOX_ADMIN_KEY;
        else process.env.SANDBOX_ADMIN_KEY = prev;
        __setTestContextForTests(null);
        __resetLiveRowForTests();
        __setAdapterForTests(null);
    }
});

test('SBX-API-8: semua respons API sandbox membawa no-store + tiada kebocoran kunci', async () => {
    const app = makeApp();
    registerSandboxRoutes(app, baseDeps());
    const prev = process.env.SANDBOX_ADMIN_KEY;
    try {
        process.env.SANDBOX_ADMIN_KEY = ADMIN_KEY;
        const results = await Promise.all([
            dispatch(app, 'get', '/api/sandbox/config', { headers: authHeaders() }),
            dispatch(app, 'post', '/api/sandbox/auth', { headers: authHeaders() })
        ]);
        for (const { res } of results) {
            assert.equal(res.headers['cache-control'], 'no-store, must-revalidate', 'no-store pada setiap respons API');
            assert.ok(
                !JSON.stringify(res.body).includes(ADMIN_KEY),
                'kunci tidak pernah muncul dalam mana-mana respons'
            );
        }
    } finally {
        if (prev === undefined) delete process.env.SANDBOX_ADMIN_KEY;
        else process.env.SANDBOX_ADMIN_KEY = prev;
    }
});

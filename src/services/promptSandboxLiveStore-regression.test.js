/**
 * Prompt Sandbox Live Store Regression — Fasa 1 Panel Visual (v3.39.0, red-first)
 *
 * Ujian kontrak `src/services/promptSandboxLiveStore.js` — snapshot module-level
 * bagi baris Redis live `sandbox:prompt-config` (jenis SESSION, no-expiry):
 *   SBX-LIVE-1  API + pemalar kontrak (kunci, TTL 2s, had aksara).
 *   SBX-LIVE-2  Lalai getLiveRow() null; injection uji-sahaja (__setLiveRowForTests).
 *   SBX-LIVE-3  saveLiveRow: pengesahan penuh (boolean/string/sentinel/saiz) +
 *               persist adapter (SESSION, TIADA TTL) + SNAPSHOT DISGERAKAN
 *               SEBELUM resolve (pengetatan Owner #1 — simpan = bacaan seterusnya
 *               serta-merta pada replika ini, tanpa menunggu tetingkap 2s).
 *   SBX-LIVE-4  refreshRow membaca + menyahtoksan baris (baris rosak → null,
 *               fall-back selamat ke fail/official).
 *   SBX-LIVE-5  refreshIfStale: NO-OP mutlak dalam test context (jangan sentuh
 *               adapter); tetingkap TTL 2s (satu bacaan sahaja); invalidate
 *               memaksa bacaan semula; kegagalan adapter TIDAK melempar &
 *               TIDAK memusnahkan snapshot lama (resiliensi hot path).
 *   SBX-LIVE-6  deleteLiveRow memadam baris + snapshot (reset → kembali ke fail).
 *   SBX-LIVE-7  Integrasi resolver: keutamaan testOverride > baris live > fail
 *               > official; sekatan mutlak isTestContext() terhadap baris live.
 */

const test = require('node:test');
const assert = require('node:assert');

const {
    getLiveRow,
    refreshRow,
    refreshIfStale,
    saveLiveRow,
    deleteLiveRow,
    invalidate,
    __setLiveRowForTests,
    __resetLiveRowForTests,
    __setAdapterForTests,
    SANDBOX_REDIS_KEY,
    SNAPSHOT_TTL_MS,
    MAX_FIELD_CHARS,
    SandboxFieldError
} = require('./promptSandboxLiveStore');
const {
    resolvePromptSandbox,
    __setPromptSandboxForTests,
    __resetPromptSandboxForTests,
    __setTestContextForTests
} = require('../config/promptSandbox');
const { StorageAdapter } = require('../storage');
const { SUBFABER_PROMPT_BOUNDARY } = require('./utils/structuredPrompt');

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

test('SBX-LIVE-1: API liveStore + pemalar kontrak', () => {
    assert.equal(typeof getLiveRow, 'function');
    assert.equal(typeof refreshRow, 'function');
    assert.equal(typeof refreshIfStale, 'function');
    assert.equal(typeof saveLiveRow, 'function');
    assert.equal(typeof deleteLiveRow, 'function');
    assert.equal(typeof invalidate, 'function');
    assert.equal(typeof __setLiveRowForTests, 'function');
    assert.equal(typeof __resetLiveRowForTests, 'function');
    assert.equal(typeof __setAdapterForTests, 'function');
    assert.equal(SANDBOX_REDIS_KEY, 'sandbox:prompt-config', 'kunci logik kontrak');
    assert.equal(SNAPSHOT_TTL_MS, 2000, 'tetingkap micro-cache 2 saat');
    assert.equal(MAX_FIELD_CHARS, 50000, 'had aksara per medan');
    assert.equal(typeof SandboxFieldError, 'function', 'kelas ralat medan sandbox');
});

test('SBX-LIVE-2: lalai getLiveRow() null + injection uji-sahaja', () => {
    __resetLiveRowForTests();
    assert.equal(getLiveRow(), null, 'tiada baris → null');
    __setLiveRowForTests({ enabled: true, translationSystemTemplate: 'T', malayFewShot: null });
    const row = getLiveRow();
    assert.equal(row.enabled, true, 'injection terbaca serta-merta');
    assert.equal(row.translationSystemTemplate, 'T');
    __resetLiveRowForTests();
    assert.equal(getLiveRow(), null, 'reset → null semula');
});

test('SBX-LIVE-3: saveLiveRow mengesahkan, persist (SESSION, sifar TTL) dan menyegerakkan snapshot', async () => {
    const adapter = makeFakeAdapter();
    __setAdapterForTests(adapter);
    __resetLiveRowForTests();

    // Pengesahan: enabled mesti boolean.
    await assert.rejects(
        () => saveLiveRow({ enabled: 'yes', translationSystemTemplate: null, malayFewShot: null }),
        (err) => {
            assert.ok(err instanceof SandboxFieldError);
            assert.ok(err.fieldErrors.some((f) => f.field === 'enabled'));
            return true;
        },
        'enabled bukan boolean → SandboxFieldError'
    );

    // Pengesahan: templat kosong.
    await assert.rejects(
        () => saveLiveRow({ enabled: true, translationSystemTemplate: '   ', malayFewShot: null }),
        (err) =>
            err instanceof SandboxFieldError && err.fieldErrors.some((f) => f.field === 'translationSystemTemplate'),
        'templat kosong → ditolak'
    );

    // Pengesahan: sentinel sempadan HARAM.
    await assert.rejects(
        () =>
            saveLiveRow({
                enabled: true,
                translationSystemTemplate: `X ${SUBFABER_PROMPT_BOUNDARY}`,
                malayFewShot: null
            }),
        (err) =>
            err instanceof SandboxFieldError &&
            err.fieldErrors.some(
                (f) => f.field === 'translationSystemTemplate' && f.code === 'boundary_sentinel_forbidden'
            ),
        'sentinel → ditolak dengan kod khusus'
    );

    // Pengesahan: had saiz.
    const big = 'a'.repeat(MAX_FIELD_CHARS + 1);
    await assert.rejects(
        () => saveLiveRow({ enabled: true, translationSystemTemplate: big, malayFewShot: null }),
        (err) => err instanceof SandboxFieldError,
        'melebihi had aksara → ditolak'
    );

    // Laluan bahagia: persist SESSION tanpa TTL + snapshot disegerakkan sebelum resolve.
    assert.equal(getLiveRow(), null, 'prasyarat: snapshot kosong');
    const saved = await saveLiveRow({ enabled: true, translationSystemTemplate: 'LIVE T', malayFewShot: 'LIVE F' });
    assert.equal(saved.translationSystemTemplate, 'LIVE T');
    const setCall = adapter.calls.find((c) => c[0] === 'set');
    assert.ok(setCall, 'adapter.set dipanggil');
    assert.equal(setCall[1], SANDBOX_REDIS_KEY, 'kunci logik betul');
    assert.equal(setCall[2], StorageAdapter.CACHE_TYPES.SESSION, 'jenis SESSION (no-expiry, kalis purge)');
    assert.equal(setCall[3], null, 'TTL null — kekal selamanya');
    const persisted = adapter.store.get(`${StorageAdapter.CACHE_TYPES.SESSION}:${SANDBOX_REDIS_KEY}`);
    assert.equal(persisted.schema, 1, 'skema versi 1');
    assert.equal(persisted.translationSystemTemplate, 'LIVE T');
    assert.ok(typeof persisted.savedAt === 'string', 'savedAt ISO direkodkan');
    // Pengetatan Owner #1: snapshot memori dikemas kini TERUS — bacaan seterusnya
    // pada replika ini melihat teks baharu TANPA refresh/TTL.
    const row = getLiveRow();
    assert.equal(row.translationSystemTemplate, 'LIVE T', 'snapshot segerak selepas save');
    assert.equal(row.malayFewShot, 'LIVE F');

    // Pembersihan.
    await deleteLiveRow();
    assert.equal(getLiveRow(), null);
});

test('SBX-LIVE-4: refreshRow membaca + menyahtoksan (baris rosak → null)', async () => {
    const adapter = makeFakeAdapter();
    __setAdapterForTests(adapter);
    __resetLiveRowForTests();
    // refreshRow di-gate (elak adapter sebenar dalam CI) — paksa mod produksi
    // uji-sahaja untuk menguji laluan bacaan; pulihkan dalam finally.
    __setTestContextForTests(false);

    // Tiada baris.
    assert.equal(await refreshRow(), null, 'Redis kosong → null');

    // Baris sah melalui adapter luaran (cth. replika lain).
    adapter.store.set(`${StorageAdapter.CACHE_TYPES.SESSION}:${SANDBOX_REDIS_KEY}`, {
        schema: 1,
        enabled: true,
        translationSystemTemplate: 'FROM OTHER REPLICA',
        malayFewShot: null,
        savedAt: new Date().toISOString()
    });
    const row = await refreshRow();
    assert.equal(row.translationSystemTemplate, 'FROM OTHER REPLICA');
    assert.equal(getLiveRow().translationSystemTemplate, 'FROM OTHER REPLICA', 'snapshot dikemas kini');

    // Baris rosak (diedit tangan) → defensive null, fall-back selamat.
    adapter.store.set(`${StorageAdapter.CACHE_TYPES.SESSION}:${SANDBOX_REDIS_KEY}`, {
        schema: 1,
        enabled: 'bukan-boolean',
        translationSystemTemplate: 12345
    });
    assert.equal(await refreshRow(), null, 'baris rosak → null (sifar pecah runtime)');
    assert.equal(getLiveRow(), null, 'snapshot tidak menyimpan baris rosak');
});

test('SBX-LIVE-5: refreshIfStale — NO-OP test context, tetingkap TTL, invalidate, resiliensi adapter', async () => {
    const adapter = makeFakeAdapter();
    __setAdapterForTests(adapter);
    __resetLiveRowForTests();

    // (a) NO-OP mutlak dalam test context (penjaga CI): TIDAK menyentuh adapter.
    __setTestContextForTests(true);
    try {
        const before = adapter.calls.length;
        await refreshIfStale();
        assert.equal(adapter.calls.length, before, 'test context → sifar panggilan adapter');

        // (b) Tetingkap TTL dengan gate dipaksa production (uji-sahaja):
        // dua refreshIfStale berturut dalam tetingkap 2s → SATU bacaan sahaja.
        __setTestContextForTests(false);
        adapter.store.set(`${StorageAdapter.CACHE_TYPES.SESSION}:${SANDBOX_REDIS_KEY}`, {
            schema: 1,
            enabled: true,
            translationSystemTemplate: 'TTL ROW',
            malayFewShot: null,
            savedAt: new Date().toISOString()
        });
        await refreshIfStale();
        const getsAfterFirst = adapter.calls.filter((c) => c[0] === 'get').length;
        await refreshIfStale();
        const getsAfterSecond = adapter.calls.filter((c) => c[0] === 'get').length;
        assert.equal(getsAfterSecond, getsAfterFirst, 'dalam TTL 2s → tiada bacaan tambahan');
        assert.equal(getLiveRow().translationSystemTemplate, 'TTL ROW');

        // (c) invalidate memaksa bacaan semula pada panggilan seterusnya.
        invalidate();
        assert.equal(getLiveRow(), null, 'invalidate → snapshot dikosongkan');
        await refreshIfStale();
        assert.equal(getLiveRow().translationSystemTemplate, 'TTL ROW', 'bacaan semula selepas invalidate');

        // (d) Kegagalan adapter TIDAK melempar & TIDAK memusnahkan snapshot aktif.
        const goodAdapter = makeFakeAdapter();
        __setAdapterForTests(goodAdapter);
        __resetLiveRowForTests(); // snapshot aktif, bukan suntikan testRow
        goodAdapter.store.set(`${StorageAdapter.CACHE_TYPES.SESSION}:${SANDBOX_REDIS_KEY}`, {
            schema: 1,
            enabled: true,
            translationSystemTemplate: 'SNAPSHOT AKTIF',
            malayFewShot: null,
            savedAt: new Date().toISOString()
        });
        await refreshRow(); // snapshot = SNAPSHOT AKTIF (baris sah dibaca)
        const badAdapter = {
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
        __setAdapterForTests(badAdapter);
        const preserved = await refreshRow();
        assert.equal(preserved, null, 'bacaan gagal → null dipulangkan');
        assert.equal(
            getLiveRow()?.translationSystemTemplate,
            'SNAPSHOT AKTIF',
            'snapshot aktif DIPELIHARA semasa kegagalan bacaan (Redis down tidak menukar teks wayar)'
        );
        await assert.doesNotReject(() => refreshIfStale(), 'fire-and-forget juga tidak melempar');
        assert.equal(
            getLiveRow()?.translationSystemTemplate,
            'SNAPSHOT AKTIF',
            'kekal dipelihara selepas refreshIfStale gagal'
        );
    } finally {
        __setTestContextForTests(null);
        __setAdapterForTests(null);
        __resetLiveRowForTests();
    }
});

test('SBX-LIVE-6: deleteLiveRow memadam baris + snapshot (reset → kembali ke fail)', async () => {
    const adapter = makeFakeAdapter();
    __setAdapterForTests(adapter);
    __resetLiveRowForTests();
    await saveLiveRow({ enabled: true, translationSystemTemplate: 'TO DELETE', malayFewShot: null });
    assert.ok(adapter.store.has(`${StorageAdapter.CACHE_TYPES.SESSION}:${SANDBOX_REDIS_KEY}`), 'baris wujud');

    await deleteLiveRow();
    assert.ok(!adapter.store.has(`${StorageAdapter.CACHE_TYPES.SESSION}:${SANDBOX_REDIS_KEY}`), 'baris dipadam');
    assert.equal(getLiveRow(), null, 'snapshot dikosongkan');
    const delCall = adapter.calls.find((c) => c[0] === 'delete');
    assert.equal(delCall[2], StorageAdapter.CACHE_TYPES.SESSION, 'pemadaman pada jenis SESSION');
});

test('SBX-LIVE-7: keutamaan resolver — injection > baris live > fail; sekatan mutlak test context', () => {
    const official = { officialTemplate: 'OFFICIAL T', officialMalayFewShot: 'OFFICIAL F' };
    try {
        // (a) Baris live mengatasi fail apabila resolver berjalan dalam mod produksi
        //     (gate dipaksa false — uji-sahaja).
        __setTestContextForTests(false);
        __setLiveRowForTests({ enabled: true, translationSystemTemplate: 'LIVE T', malayFewShot: 'LIVE F' });
        const prod = resolvePromptSandbox(official);
        assert.equal(prod.template, 'LIVE T', 'baris live mengatasi fail');
        assert.equal(prod.malayFewShot, 'LIVE F');
        assert.equal(prod.active, true, 'aktif');
        assert.ok(/^[0-9a-f]{8}$/.test(prod.hash8), 'hash8 dijana');

        // (b) Injection uji-sahaja mengatasi baris live.
        __setPromptSandboxForTests({ enabled: true, translationSystemTemplate: 'INJ T', malayFewShot: null });
        const inj = resolvePromptSandbox(official);
        assert.equal(inj.template, 'INJ T', 'injection > baris live');
        assert.equal(inj.malayFewShot, 'OFFICIAL F', 'medan injection null → official');

        // (c) SEKATAN MUTLAK: dalam test context, baris live TIDAK PERNAH dibaca —
        //     resolver memulangkan official walau snapshot berisi baris aktif.
        __resetPromptSandboxForTests();
        __setTestContextForTests(true);
        const gated = resolvePromptSandbox(official);
        assert.equal(gated.template, 'OFFICIAL T', 'test context → baris live diabaikan');
        assert.equal(gated.active, false, 'test context → tidak aktif');
        assert.equal(gated.hash8, null, 'test context → sifar namespace sandbox');

        // (d) Baris live disabled → official (toggle OFF serta-merta).
        __setTestContextForTests(false);
        __setLiveRowForTests({ enabled: false, translationSystemTemplate: 'LIVE T', malayFewShot: 'LIVE F' });
        const off = resolvePromptSandbox(official);
        assert.equal(off.template, 'OFFICIAL T', 'enabled:false pada baris → official');
        assert.equal(off.active, false);
    } finally {
        __resetPromptSandboxForTests();
        __setTestContextForTests(null);
        __resetLiveRowForTests();
    }
});

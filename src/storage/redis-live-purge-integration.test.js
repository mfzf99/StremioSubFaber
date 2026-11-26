/**
 * [v3.41.2 — TUGASAN 1] Integrasi LIVE REDIS: kontrak kebenaran delete() dan
 * kitaran penuh purgeTranslationCacheByKeys() terhadap ioredis + skrip Lua
 * yang SEBENAR (bukan stub).
 *
 * Sebab ujian ini wujud:
 *   v3.41.1 membetulkan `RedisStorageAdapter.delete()` untuk memulangkan
 *   `contentDeleted > 0` (W9), tetapi buktinya HANYA datang daripada stub
 *   `subfaberAtomicCacheDelete` (redis-delete-truthiness-regression.test.js).
 *   Bentuk nilai pulangan Lua sebenar pada ioredis TIDAK pernah disahkan
 *   secara empirikal — Owner meminta pengesahan live (0 tekaan).
 *
 * PAGAR KESELAMATAN (Owner): sandbox berkongsi Redis tempatan.
 *   - DB 15 sahaja (bukan DB 0 = sandbox). Dihantar terus ke ioredis
 *     (`db: restOptions.db || …`, RedisStorageAdapter.js:198).
 *   - Prefix kunci ujian unik `subfaber-purge-test:<pid>:` — padam hanya
 *     kunci sendiri.
 *   - `REDIS_PREFIX_MIGRATION` dipaksa 'false' supaya imbasan migrasi
 *     merentas-prefix TIDAK berjalan (initialize() :546).
 *   - DILARANG KERAS: sebarang arahan flush seluruh-pangkalan-data.
 *     Tiada satu pun di sini (LIVE-G2 menguatkuasakan ini secara mekanikal).
 *   - BUKTI sandbox utuh: kiraan kunci DB 0 diambil SEBELUM dan SELEPAS
 *     keseluruhan fail, dan mesti sama.
 *
 * Gate: `skip` hanya apabila REDIS_INTEGRATION_PORT tidak ditetapkan
 * (konvensyen sama seperti redis-command-timeout-regression.test.js:377).
 */

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const os = require('node:os');
const fs = require('node:fs');

const Redis = require('ioredis');

const StorageAdapter = require('./StorageAdapter');
const RedisStorageAdapter = require('./RedisStorageAdapter');
const FilesystemStorageAdapter = require('./FilesystemStorageAdapter');
const { getTranslationStorageKey } = require('../utils/cacheKeys');

const integrationPort = Number(process.env.REDIS_INTEGRATION_PORT) || 0;
const REDIS_HOST = '127.0.0.1';
const TEST_DB = 15;
const SANDBOX_DB = 0;
const PREFIX = `subfaber-purge-test:${process.pid}:`;

// Klien pemerhati MENTAH (tiada prefix, tiada skrip khusus) untuk membaca
// keadaan Redis sebenar — bebas daripada logik adapter yang sedang diuji.
function observer(db) {
    return new Redis({ host: REDIS_HOST, port: integrationPort, db, lazyConnect: true, maxRetriesPerRequest: 1 });
}

function makeAdapter() {
    return new RedisStorageAdapter({
        host: REDIS_HOST,
        port: integrationPort,
        db: TEST_DB,
        keyPrefix: PREFIX
    });
}

// Nama kunci sandbox (bukan nilai — nilai boleh membawa data pengguna) yang
// wujud SEBELUM ujian. Pagar melindungi KEKUNCI INI sahaja, bukan "setiap
// kunci dalam DB 0": fail ujian lain (cth. ujian kuota sedia ada) boleh
// jalan serentak dalam arahan `node --test` yang sama dan menulis kunci
// ujianannya sendiri ke DB 0 — mengira semua kunci akan memberikan gagal
// palsu yang menyalahkan ujian ini.
let sandboxKeysBefore = null;
let sandboxBaselineError = null;
let tempDir = null;

// SATU adapter bagi keseluruhan fail — bukan satu bagi setiap ujian.
// subtitles.js:95 dan embeddedCache.js:17 meng-cache `storageAdapter` pada
// panggilan getStorageAdapter() PERTAMA dan memegangnya sepanjang umur
// proses. Jika setiap ujian membina & menutup adapter sendiri, modul itu
// kekal memegang adapter yang SUDAH DITUTUP → purge gagal dengan
// "Storage adapter not initialized" / "Connection is closed" (inilah punca
// D1/E1/F1 gagal pada larian kedua; C1 lulus kerana ia ujian purge pertama).
// Satu adapter yang hidup sepanjang fail = sama seperti produksi (satu
// adapter bagi satu proses) dan tiada cache basi.
let sharedAdapter = null;

async function scanKeys(client, match = '*') {
    const out = [];
    let cursor = '0';
    do {
        const [next, keys] = await client.scan(cursor, 'MATCH', match, 'COUNT', 500);
        cursor = next;
        for (const k of keys) out.push(k);
    } while (cursor !== '0');
    return out.sort();
}

// Kunci yang TIDAK dimiliki oleh mana-mana ujian = kunci sandbox sebenar.
// JANGAN tambah pengecualian lain di sini. Pagar ini adalah SEHALA
// (kunci sandbox yang wujud SEBELUM mesti MASIH wujud selepas) — kunci BAHARU
// yang muncul dibenarkan, jadi kunci yang ditulis oleh fail ujian lain
// (cth. `stremio:keyrotation:default` dari config.js) tidak akan memalsukan
// kegagalan dan tidak perlu dikecualikan. Meluaskan senarai ini akan
// MELEMAHKAN pagar, bukan memperbaikinya.
const isTestOwnedKey = (key) => /^subfaber-purge-test:|^subfaber-quota-test:/.test(key);

before(async () => {
    // PENTING: jika ujian dilangkau (REDIS_INTEGRATION_PORT tidak ditetapkan),
    // jangan sentuh Redis LANGSUNG. Setiap test() dalam fail ini memakai
    // `skip: integrationPort === 0`, jadi kitaran hidup mesti mengikut syarat
    // yang SAMA. Tanpa pengawal ini, before()/after() masih membuka sambungan
    // — di persekitaran tanpa Redis (cth. pre-commit hook / CI) sambungan
    // gagal dan after() melempar "Connection is closed", mengubah FAIL
    // KESELURUHAN FAIL menjadi kegagalan walaupun semua ujian dilangkau.
    // Ini juga memelihara pagar keselamatan Owner: tiada sambungan ke Redis
    // berkongsi melainkan ia diminta secara eksplisit.
    if (integrationPort === 0) return;

    // Migrasi prefix dimatikan supaya initialize() tidak mengimbas/memindah
    // kunci merentas prefix (initialize() RedisStorageAdapter.js:546).
    process.env.REDIS_PREFIX_MIGRATION = 'false';

    const obs = observer(SANDBOX_DB);
    await obs.connect();
    try {
        sandboxKeysBefore = (await scanKeys(obs)).filter((key) => !isTestOwnedKey(key));
    } catch (error) {
        // Jangan biarkan kegagalan pengukuran garis dasar berubah menjadi
        // "lulus" secara senyap — rekod dan biarkan LIVE-G1 gagal kuat.
        sandboxBaselineError = error;
    } finally {
        await obs.quit();
    }

    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'subfaber-live-purge-'));

    // Adapter kongsi: dibina SEKALI, dipasang ke StorageFactory SEKALI,
    // supaya cache modul dalam subtitles.js/embeddedCache.js menunjuk ke
    // sambungan yang hidup sepanjang fail ini.
    sharedAdapter = makeAdapter();
    await sharedAdapter.initialize();
    const StorageFactory = require('./StorageFactory');
    StorageFactory.instance = sharedAdapter;
});

after(async () => {
    // Pengawal yang SAMA seperti before(): jika tiada Redis diminta, tiada
    // apa yang perlu dibersihkan dan tiada sambungan boleh dibuka.
    if (integrationPort === 0) return;

    // Kunci ujian dibersihkan oleh each-test; sisa dibuang di sini sebagai
    // jaring keselamatan — HANYA kunci berprefix ujian sendiri.
    const testObs = observer(TEST_DB);
    await testObs.connect();
    try {
        let cursor = '0';
        do {
            const [next, keys] = await testObs.scan(cursor, 'MATCH', `${PREFIX}*`, 'COUNT', 500);
            cursor = next;
            if (keys.length > 0) await testObs.unlink(...keys);
        } while (cursor !== '0');
    } finally {
        await testObs.quit();
    }

    // Tutup adapter kongsi SELEPAS kunci ujian dibersihkan.
    if (sharedAdapter) {
        try {
            await sharedAdapter.close();
        } catch (_) {
            // adapter mungkin sudah tertutup; abaikan
        }
        sharedAdapter = null;
    }

    if (tempDir) fs.rmSync(tempDir, { recursive: true, force: true });
});

async function withAdapter(fn) {
    if (!sharedAdapter || !sharedAdapter.initialized) {
        throw new Error('adapter kongsi belum diinisialisasi (before() gagal?)');
    }
    return fn(sharedAdapter);
}

// Klien MENTAH tanpa prefix untuk bacaan pada aras storan. `adapter.client`
// membawa `keyPrefix`, jadi menghantar kunci yang sudah dibubuhi prefix
// kepadanya akan menyebabkan DOUBLE-PREFIX dan membaca nama yang salah
// (inilah punca 8 kegagalan larian live pertama). Idiom `duplicate()` ini
// diambil terus daripada kod produksi (RedisStorageAdapter.js:758).
// Kitaran hidup diuruskan di sini supaya tiada sambungan bocor.
async function withRawClient(adapter, fn) {
    const raw = adapter.client.duplicate({ keyPrefix: '', lazyConnect: true });
    await raw.connect();
    try {
        return await fn(raw);
    } finally {
        await raw.quit();
    }
}

async function purgeModule() {
    // StorageFactory.instance telah dipasang SEKALI dalam before() supaya
    // cache modul-tertakluk dalam subtitles.js / embeddedCache.js menunjuk
    // kepada adapter yang sama dan masih hidup.
    return require('../handlers/subtitles');
}

// ── A. Kontrak delete() pada ioredis sebenar ─────────────────────────────────

test(
    'LIVE-A1 delete() kunci WUJUD → true (Lua contentDeleted=1)',
    { skip: integrationPort === 0, timeout: 20000 },
    async () => {
        await withAdapter(async (adapter) => {
            const T = StorageAdapter.CACHE_TYPES.TRANSLATION;
            assert.equal(await adapter.set('a1-present', 'hello', T), true);
            assert.equal(
                await adapter.delete('a1-present', T),
                true,
                'kunci yang wujud mesti dipadam dan dilaporkan true'
            );
            assert.equal(await adapter.exists('a1-present', T), false);
        });
    }
);

test(
    'LIVE-A2 delete() kunci TIADA → false (Lua contentDeleted=0)',
    { skip: integrationPort === 0, timeout: 20000 },
    async () => {
        await withAdapter(async (adapter) => {
            const T = StorageAdapter.CACHE_TYPES.TRANSLATION;
            assert.equal(
                await adapter.delete('a2-never-written', T),
                false,
                'kunci yang tidak pernah wujud mesti pulang false — punca W9'
            );
        });
    }
);

test(
    'LIVE-A3 delete() kunci SUDAH EXPIRED → false (TTL luput, DEL=0)',
    { skip: integrationPort === 0, timeout: 20000 },
    async () => {
        await withAdapter(async (adapter) => {
            const T = StorageAdapter.CACHE_TYPES.TRANSLATION;
            assert.equal(await adapter.set('a3-expiring', 'temp', T, 1), true);
            assert.equal(await adapter.exists('a3-expiring', T), true);
            await new Promise((resolve) => setTimeout(resolve, 1400));
            assert.equal(await adapter.exists('a3-expiring', T), false, 'kunci mesti luput selepas TTL');
            assert.equal(
                await adapter.delete('a3-expiring', T),
                false,
                'kunci yang sudah expired mesti pulang false, bukan true'
            );
        });
    }
);

test(
    'LIVE-A4 delete() dua kali berturut → true kemudian false (idempoten jujur)',
    { skip: integrationPort === 0, timeout: 20000 },
    async () => {
        await withAdapter(async (adapter) => {
            const T = StorageAdapter.CACHE_TYPES.TRANSLATION;
            await adapter.set('a4-twice', 'x', T);
            assert.equal(await adapter.delete('a4-twice', T), true, 'padam pertama: true');
            assert.equal(await adapter.delete('a4-twice', T), false, 'padam kedua: false (bukan true keras lama)');
        });
    }
);

// ── B. Bentuk mentah balasan Lua (bukti empirikal, bukan andaian) ────────────

test(
    'LIVE-B1 balasan mentah subfaberAtomicCacheDelete ialah [1,1,size] / [0,0,0]',
    { skip: integrationPort === 0, timeout: 20000 },
    async () => {
        await withAdapter(async (adapter) => {
            const T = StorageAdapter.CACHE_TYPES.TRANSLATION;
            await adapter.set('b1-raw', '12345', T);
            {
                // Skrip dipanggil pada `adapter.client` dengan kunci TANPA
                // prefix — BENTUK YANG SAMA seperti produksi
                // (RedisStorageAdapter.js:1188; redisKey = _getKey(), tanpa
                // prefix). Ia bukan `duplicate()`: arahan `defineCommand`
                // hanya wujud pada instance asal (LIVE-B1 larian ke-2:
                // "raw.subfaberAtomicCacheDelete is not a function").
                const key = `${T}:b1-raw`;
                const present = await adapter.client.subfaberAtomicCacheDelete(
                    key,
                    `${key}:meta`,
                    `lru:${T}`,
                    `size:${T}`,
                    adapter.getSessionIndexKey(),
                    key,
                    1,
                    0
                );
                assert.ok(Array.isArray(present), 'Lua mesti pulang array kepada ioredis');
                assert.equal(Number(present[0]), 1, 'contentDeleted=1 bila kunci wujud');
                assert.equal(Number(present[1]), 1, 'metadataDeleted=1 bila meta wujud');
                assert.equal(Number(present[2]), 5, 'oldSize = panjang payload "12345"');

                const absent = await adapter.client.subfaberAtomicCacheDelete(
                    `${T}:b1-never`,
                    `${T}:b1-never:meta`,
                    `lru:${T}`,
                    `size:${T}`,
                    adapter.getSessionIndexKey(),
                    `${T}:b1-never`,
                    1,
                    0
                );
                assert.ok(Array.isArray(absent));
                assert.deepEqual(
                    absent.map((v) => Number(v)),
                    [0, 0, 0],
                    'kunci tiada → [0,0,0]; inilah sebab delete() lama (return true) berbohong'
                );
            }
        });
    }
);

// ── C. Kitaran penuh purge — cache KEKAL ─────────────────────────────────────

test(
    'LIVE-C1 kitaran penuh KEKAL: tulis → purge → tiada (translation:t2s__*)',
    { skip: integrationPort === 0, timeout: 30000 },
    async () => {
        await withAdapter(async (adapter) => {
            const subtitles = await purgeModule();
            const T = StorageAdapter.CACHE_TYPES.TRANSLATION;
            const baseKey = 'c1-permanent';

            // Tulis melalui helper SSUT — inilah kunci yang SEBENAR digunakan.
            const storageKey = getTranslationStorageKey(baseKey);
            assert.equal(await adapter.set(storageKey, 'TERJEMAHAN-KEKAL', T), true);
            assert.equal(await adapter.exists(storageKey, T), true, 'cache kekal mesti wujud sebelum purge');

            const result = await subtitles.purgeTranslationCacheByKeys({ baseKey, runtimeKey: baseKey });
            assert.equal(result.deleted, 1, 'tepat 1 kunci (t2s__ kekal) terpadam');
            assert.equal(await adapter.exists(storageKey, T), false, 'cache kekal mesti TIADA selepas purge');

            // Kunci lama yang salah (tanpa prefix) tidak pernah wujud.
            assert.equal(await adapter.exists(baseKey, T), false);
        });
    }
);

// ── D. Kitaran penuh purge — cache BYPASS ────────────────────────────────────

test(
    'LIVE-D1 kitaran penuh BYPASS: tulis → purge → tiada (bypass:*__u_*)',
    { skip: integrationPort === 0, timeout: 30000 },
    async () => {
        await withAdapter(async (adapter) => {
            const subtitles = await purgeModule();
            const B = StorageAdapter.CACHE_TYPES.BYPASS;
            const baseKey = 'd1-bypass';
            const runtimeKey = `${baseKey}__u_abc123`;

            assert.equal(await adapter.set(runtimeKey, 'TERJEMAHAN-BYPASS', B), true);
            assert.equal(await adapter.exists(runtimeKey, B), true);

            const result = await subtitles.purgeTranslationCacheByKeys({
                baseKey,
                runtimeKey,
                bypass: true,
                userHash: 'abc123'
            });
            assert.equal(result.deleted, 1, 'bypass + tiada partial → 1 kunci');
            assert.equal(await adapter.exists(runtimeKey, B), false, 'bypass mesti TIADA selepas purge');

            // P6: cache KEKAL bagi baseKey sama TIDAK boleh terganggu.
            const keep = getTranslationStorageKey(baseKey);
            await adapter.set(keep, 'KEKAL', StorageAdapter.CACHE_TYPES.TRANSLATION);
            await adapter.set(runtimeKey, 'BYPASS-LAGI', B);
            const second = await subtitles.purgeTranslationCacheByKeys({
                baseKey,
                runtimeKey,
                bypass: true,
                userHash: 'abc123'
            });
            assert.equal(await adapter.exists(keep, StorageAdapter.CACHE_TYPES.TRANSLATION), true, 'kekal kekal utuh');
            assert.equal(second.deleted, 1);
        });
    }
);

// ── E. Kitaran penuh purge — PARTIAL ─────────────────────────────────────────

test(
    'LIVE-E1 kitaran penuh PARTIAL: tulis → purge → tiada (partial:*)',
    { skip: integrationPort === 0, timeout: 30000 },
    async () => {
        await withAdapter(async (adapter) => {
            const subtitles = await purgeModule();
            const P = StorageAdapter.CACHE_TYPES.PARTIAL;
            const baseKey = 'e1-partial';

            assert.equal(await adapter.set(baseKey, { isComplete: false }, P), true);
            assert.equal(await adapter.exists(baseKey, P), true);

            const result = await subtitles.purgeTranslationCacheByKeys({ baseKey, runtimeKey: baseKey });
            assert.equal(await adapter.exists(baseKey, P), false, 'partial mesti TIADA selepas purge');
            assert.equal(result.deleted, 1, 'hanya partial wujud → deleted=1');
        });
    }
);

// ── F. Kitaran penuh purge — xEMBED ──────────────────────────────────────────

test(
    'LIVE-F1 kitaran penuh xEMBED: simpan → purge → tiada + listEmbeddedTranslations kosong',
    { skip: integrationPort === 0, timeout: 30000 },
    async () => {
        // `_adapter` sengaja tidak digunakan: F1 beroperasi sepenuhnya melalui
        // modul embeddedCache/subtitles (yang memegang adapter kongsi sendiri).
        // withAdapter() masih dipanggil supaya ujian ini gagal kuat jika
        // adapter kongsi belum diinisialisasi.
        await withAdapter(async (_adapter) => {
            const subtitles = await purgeModule();
            const embedded = require('../utils/embeddedCache');
            const videoHash = 'f1livevideodata0000000000000000000000000000000000000000000000000000ffff';
            const baseKey = 'f1-xembed';

            // saveTranslatedEmbedded() memulangkan OBJEK `{ cacheKey, entry }`
            // (embeddedCache.js:204), bukan rentetan. Ujian ini dahulu
            // mengambil nilai pulangan itu terus sebagai cacheKey → objek
            // dihantar sebagai kunci → bacaan semula null. Tegasan `typeof`
            // di bawah dipaksa supaya kesilapan jenis ini tidak boleh lulus
            // secara senyap lagi (assert.ok(objek) adalah benar!).
            const saved = await embedded.saveTranslatedEmbedded(videoHash, 7, 'en', 'ms', 'TERJEMAHAN-EMBEDDED');
            assert.equal(typeof saved, 'object', 'saveTranslatedEmbedded mesti pulang objek');
            const cacheKey = saved && saved.cacheKey;
            assert.equal(typeof cacheKey, 'string', 'saved.cacheKey mesti rentetan');
            assert.ok(cacheKey.length > 0, 'saved.cacheKey tidak boleh kosong');

            // getEmbeddedByCacheKey() memulangkan OBJEK `{ cacheKey, ...entry }`
            // (embeddedCache.js:238), bukan rentetan mentah.
            const readBack = await embedded.getEmbeddedByCacheKey(cacheKey);
            assert.ok(readBack, 'entri yang baru disimpan mesti boleh dibaca semula');
            assert.equal(readBack.cacheKey, cacheKey, 'cacheKey mesti dipulangkan semula');
            assert.equal(readBack.content, 'TERJEMAHAN-EMBEDDED', 'kandungan terjemahan mesti sepadan');
            const listedBefore = await embedded.listEmbeddedTranslations(videoHash);
            assert.equal(listedBefore.length, 1, 'indeks mesti mengandungi 1 terjemahan sebelum purge');

            const result = await subtitles.purgeTranslationCacheByKeys({
                baseKey,
                runtimeKey: baseKey,
                embeddedKeys: [{ videoHash, cacheKey }]
            });

            assert.equal(await embedded.getEmbeddedByCacheKey(cacheKey), null, 'kunci embedded mesti TIADA');
            const listedAfter = await embedded.listEmbeddedTranslations(videoHash);
            assert.equal(listedAfter.length, 0, 'listEmbeddedTranslations mesti kosong selepas purge');
            assert.equal(result.deleted, 1, '1 kunci embedded terpadam');
        });
    }
);

// ── G. PAGAR KESELAMATAN — sandbox mesti utuh ────────────────────────────────

test(
    'LIVE-G1 PAGAR: tiada kunci sandbox sedia ada yang dipadam oleh ujian live',
    { skip: integrationPort === 0, timeout: 20000 },
    async () => {
        // Gagal KUAT jika garis dasar tidak dapat diukur — jangan sekali-kali
        // berubah menjadi perbandingan kosong yang lulus secara senyap.
        if (sandboxBaselineError) {
            throw new Error(`garis dasar sandbox gagal diukur: ${sandboxBaselineError.message}`);
        }
        assert.ok(Array.isArray(sandboxKeysBefore), 'garis dasar sandbox mesti diambil sebelum ujian');

        const obs = observer(SANDBOX_DB);
        await obs.connect();
        try {
            const after = new Set((await scanKeys(obs)).filter((key) => !isTestOwnedKey(key)));
            // SEHALA sahaja: kunci sandbox yang wujud SEBELUM mesti MASIH wujud.
            // Kunci baharu dibenarkan (sandbox sebenar boleh menulis serentak).
            // Kunci yang hilang = ujian ini telah memadam data sandbox.
            const missing = sandboxKeysBefore.filter((key) => !after.has(key));
            assert.deepEqual(
                missing,
                [],
                `kunci sandbox sedia ada dipadam oleh ujian live: ${JSON.stringify(missing)}`
            );
        } finally {
            await obs.quit();
        }
    }
);

test(
    'LIVE-G2 PAGAR: tiada kunci ujian bocor ke DB 0 dan tiada arahan flush dipanggil',
    { skip: integrationPort === 0, timeout: 20000 },
    async () => {
        const obs = observer(SANDBOX_DB);
        await obs.connect();
        try {
            let cursor = '0';
            let leaked = 0;
            do {
                const [next, keys] = await obs.scan(cursor, 'MATCH', `${PREFIX}*`, 'COUNT', 500);
                cursor = next;
                leaked += keys.length;
            } while (cursor !== '0');
            assert.equal(leaked, 0, 'kunci ujian tidak boleh wujud di DB 0');
        } finally {
            await obs.quit();
        }

        // Kuatkuasa secara mekanikal bahawa fail ini tidak memanggil arahan
        // flush seluruh-DB pada mana-mana klien. Corong corak dibina daripada
        // cebisan yang disambung masa-jalan supaya SUMBER fail ini tidak
        // pernah memuatkan bentuk yang sepadan — jika tidak, tegasan ini akan
        // memadankan komen/regexnya sendiri (dikesan semasa penulisan).
        const join = String.fromCharCode(46); // titik
        const verb = ['flu', 'sh'].join('');
        const suffix = ['d', 'b'].join('');
        const alt = ['a', 'll'].join('');
        const forbiddenCall = new RegExp(`${join}${verb}(${suffix}|${alt})\\s*\\(`, 'i');
        const source = fs.readFileSync(__filename, 'utf8');
        assert.equal(forbiddenCall.test(source), false, 'fail ujian tidak boleh memanggil arahan flush seluruh-DB');
    }
);

// ── H. Pariti Redis ↔ Filesystem pada delete() ───────────────────────────────

test(
    'LIVE-H1 pariti: delete() tiada → false pada KEDUA-DUA adapter',
    { skip: integrationPort === 0, timeout: 20000 },
    async () => {
        const T = StorageAdapter.CACHE_TYPES.TRANSLATION;
        const fsAdapter = new FilesystemStorageAdapter({ cacheDir: tempDir });
        await fsAdapter.initialize();
        try {
            assert.equal(await fsAdapter.delete('h1-absent', T), false, 'Filesystem: tiada → false');
        } finally {
            await fsAdapter.close();
        }
        await withAdapter(async (adapter) => {
            assert.equal(await adapter.delete('h1-absent', T), false, 'Redis: tiada → false');
        });
    }
);

// ── I. Kitaran penuh pada aras storan mentah ─────────────────────────────────

test(
    'LIVE-I1 tulis → padam → semak tiada pada aras mentah (bukan melalui adapter.delete)',
    { skip: integrationPort === 0, timeout: 20000 },
    async () => {
        await withAdapter(async (adapter) => {
            const T = StorageAdapter.CACHE_TYPES.TRANSLATION;
            await adapter.set('i1-raw-cycle', 'payload', T);
            const rawKey = `${PREFIX}${T}:i1-raw-cycle`;
            // Baca melalui klien TANPA prefix — `adapter.client` akan
            // membubuhi PREFIX sekali lagi dan membuat kunci kelihatan tiada.
            await withRawClient(adapter, async (raw) => {
                assert.equal(await raw.exists(rawKey), 1, 'kunci mentah mesti wujud');

                await adapter.delete('i1-raw-cycle', T);
                assert.equal(await raw.exists(rawKey), 0, 'kunci mentah mesti TIADA selepas delete');
                assert.equal(await raw.exists(`${rawKey}:meta`), 0, 'meta mesti TIADA selepas delete');
            });
        });
    }
);

/**
 * [CACHE-COHERENCE-SWEEP v3.41.1 — Peringkat 2] Regression: purge pusat,
 * penormalan entri registry (migrasi bypass lama), zombie gate, dan
 * pendawaian Telegram → purge pusat.
 *
 * Konteks (plans/cache-coherence-sweep-plan.md §3 Peringkat 2):
 *   W1  — Telegram memadam `translation:{runtimeKey}` tetapi cache kekal
 *         disimpan sebagai `translation:t2s__{baseKey}` → tidak pernah kena.
 *   W2  — `sourceFileId` dalam `keys[]` ialah komponen kunci, bukan kunci.
 *   W3  — status in-flight / lock / zombie write tidak dikendalikan.
 *   W5  — SUBTITLE_SEARCH_REV (per-userHash) tidak dibump selepas padam.
 *   W9  — bot melaporkan "berjaya" tanpa semak nilai pulangan delete.
 *
 * Gate test-context: subtitles.js memegang `storageAdapter` modul-tertakluk;
 * ujian menyuntik adapter memori melalui StorageFactory.instance supaya
 * tiada Redis diperlukan. Kod produksi TIDAK diubah untuk ujian.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');

const StorageFactory = require('../storage/StorageFactory');
const StorageAdapter = require('../storage/StorageAdapter');
const { normalizeRegistryEntry, getTranslationStorageKey } = require('../utils/cacheKeys');

// Adapter memori: kunci disimpan sebagai `${cacheType}:${key}` (bentuk Redis
// tanpa prefix), delete() pulang boolean SEBENAR (kontrak selepas fix W9).
function makeMemoryAdapter() {
    const store = new Map();
    const counters = new Map();
    return {
        store,
        async get(key, type) {
            return store.has(`${type}:${key}`) ? store.get(`${type}:${key}`) : null;
        },
        async set(key, value, type) {
            store.set(`${type}:${key}`, value);
            return true;
        },
        async delete(key, type) {
            return store.delete(`${type}:${key}`);
        },
        async exists(key, type) {
            return store.has(`${type}:${key}`);
        },
        async list() {
            return [];
        },
        async cleanup() {
            return { deleted: 0, bytesFreed: 0 };
        },
        async close() {},
        getClient() {
            return null;
        },
        // incrementCounter (sharedCache) menggunakan raw client; stub cukup
        // untuk merekod bump rev tanpa Redis.
        __counters: counters
    };
}

// sharedCache.incrementCounter → adapter.client; memory adapter tiada client,
// jadi bump rev akan swallow + log (kontrak sedia ada: fail-open). Ujian rev
// disemak melalui spy pada modul sharedCache.

// subtitles.js meng-cache `storageAdapter` modul-tertakluk pada first call
// (getStorageAdapter(): `if (!storageAdapter) storageAdapter = await
// StorageFactory.getStorageAdapter()`). Adapter memori mesti dipasang
// SEBELUM sebarang getStorageAdapter() dipanggil dalam proses ini, dan
// kekal sepanjang fail ujian (satu adapter kongsi, map dibersihkan antara
// ujian). Ia TIDAK dikembalikan kepada instance sebelumnya kerana
// subtitles.js sudah memegang rujukan padanya — memulihkan instance lama
// tidak mengubah apa yang subtitles.js guna.
const memoryAdapter = makeMemoryAdapter();
StorageFactory.instance = memoryAdapter;
const subtitles = require('../handlers/subtitles');

async function withMemoryAdapter(fn) {
    memoryAdapter.store.clear();
    try {
        return await fn(memoryAdapter, subtitles);
    } finally {
        memoryAdapter.store.clear();
    }
}

// ── normalizeRegistryEntry: entri baharu & lama ─────────────────────────────

test('CCS-P2-N1: entri BAHARU kekal — runtimeKey === baseKey, bypass false', () => {
    const e = normalizeRegistryEntry({ baseKey: 'X', runtimeKey: 'X', bypass: false, userHash: 'abc' });
    assert.equal(e.baseKey, 'X');
    assert.equal(e.runtimeKey, 'X');
    assert.equal(e.bypass, false);
    assert.equal(e.userHash, 'abc');
});

test('CCS-P2-N2: entri BAHARU bypass — runtimeKey kekal baseKey__u_hash (tiada double-append)', () => {
    const e = normalizeRegistryEntry({
        baseKey: 'X',
        runtimeKey: 'X__u_abc',
        bypass: true,
        userHash: 'abc'
    });
    assert.equal(e.baseKey, 'X');
    assert.equal(e.runtimeKey, 'X__u_abc');
    assert.equal(e.bypass, true);
    assert.equal(e.userHash, 'abc');
    assert.ok(!e.runtimeKey.includes('__u_abc__u_'), 'tiada double-append __u_x__u_x');
});

test('CCS-P2-N3: PIN MIGRASI — entri bypass LAMA {keys:["X__u_abc"]} tanpa bypass/userHash', () => {
    const e = normalizeRegistryEntry({ id: 'sub_1', keys: ['X__u_abc', 'src-id'] });
    assert.equal(e.baseKey, 'X');
    assert.equal(e.runtimeKey, 'X__u_abc', 'runtimeKey sah dipulangkan untuk entri lama');
    assert.equal(e.bypass, true, 'bypass dikesan daripada akhiran __u_');
    assert.equal(e.userHash, 'abc', 'userHash diekstrak daripada akhiran');
});

test('CCS-P2-N4: entri kekal LAMA {keys:["X","src-id"]} — bypass false, userHash kosong', () => {
    const e = normalizeRegistryEntry({ id: 'sub_2', keys: ['X', 'src-id'] });
    assert.equal(e.baseKey, 'X');
    assert.equal(e.runtimeKey, 'X');
    assert.equal(e.bypass, false);
    assert.equal(e.userHash, '');
});

// ── purgeTranslationCacheByKeys: W1 / W2 / jenis-entri ──────────────────────

test('CCS-P2-P1: entri KEKAL — padam translation:t2s__X (W1) + partial:X, bukan translation:X', async () => {
    await withMemoryAdapter(async (adapter, subtitles) => {
        await adapter.set(
            getTranslationStorageKey('X'),
            { content: 'terjemahan' },
            StorageAdapter.CACHE_TYPES.TRANSLATION
        );
        await adapter.set('X', { content: 'partial' }, StorageAdapter.CACHE_TYPES.PARTIAL);

        const { deleted, entry } = await subtitles.purgeTranslationCacheByKeys({ baseKey: 'X', runtimeKey: 'X' });

        assert.equal(entry.bypass, false);
        assert.equal(
            await adapter.exists(getTranslationStorageKey('X'), StorageAdapter.CACHE_TYPES.TRANSLATION),
            false,
            't2s__X mesti terpadam'
        );
        assert.equal(await adapter.exists('X', StorageAdapter.CACHE_TYPES.PARTIAL), false, 'partial mesti terpadam');
        assert.equal(deleted, 2);
    });
});

test('CCS-P2-P2: entri BYPASS — padam bypass:X__u_abc + partial, JANGAN sentuh translation:t2s__X (P6)', async () => {
    await withMemoryAdapter(async (adapter, subtitles) => {
        await adapter.set('X__u_abc', { content: 'b' }, StorageAdapter.CACHE_TYPES.BYPASS);
        await adapter.set('X__u_abc', { content: 'p' }, StorageAdapter.CACHE_TYPES.PARTIAL);
        await adapter.set(getTranslationStorageKey('X'), { content: 'kekal' }, StorageAdapter.CACHE_TYPES.TRANSLATION);

        const { deleted } = await subtitles.purgeTranslationCacheByKeys({
            baseKey: 'X',
            runtimeKey: 'X__u_abc',
            bypass: true,
            userHash: 'abc'
        });

        assert.equal(await adapter.exists('X__u_abc', StorageAdapter.CACHE_TYPES.BYPASS), false);
        assert.equal(await adapter.exists('X__u_abc', StorageAdapter.CACHE_TYPES.PARTIAL), false);
        assert.equal(
            await adapter.exists(getTranslationStorageKey('X'), StorageAdapter.CACHE_TYPES.TRANSLATION),
            true,
            'cache kekal TIDAK boleh tersentuh oleh purge bypass'
        );
        assert.equal(deleted, 2);
    });
});

test('CCS-P2-P3: PIN MIGRASI end-to-end — entri bypass LAMA {keys:["X__u_abc"]} dipadam betul, t2s__X kekal', async () => {
    await withMemoryAdapter(async (adapter, subtitles) => {
        await adapter.set('X__u_abc', { content: 'b' }, StorageAdapter.CACHE_TYPES.BYPASS);
        await adapter.set('X__u_abc', { content: 'p' }, StorageAdapter.CACHE_TYPES.PARTIAL);
        await adapter.set(getTranslationStorageKey('X'), { content: 'kekal' }, StorageAdapter.CACHE_TYPES.TRANSLATION);

        const { deleted, entry } = await subtitles.purgeTranslationCacheByKeys({
            id: 'sub_old',
            keys: ['X__u_abc', 'src-id']
        });

        assert.equal(entry.runtimeKey, 'X__u_abc');
        assert.equal(await adapter.exists('X__u_abc', StorageAdapter.CACHE_TYPES.BYPASS), false);
        assert.equal(await adapter.exists('X__u_abc', StorageAdapter.CACHE_TYPES.PARTIAL), false);
        assert.equal(await adapter.exists(getTranslationStorageKey('X'), StorageAdapter.CACHE_TYPES.TRANSLATION), true);
        // Tiada kunci __u_abc__u_ yang pernah cuba dibina/dipadam.
        assert.ok(![...adapter.store.keys()].some((k) => k.includes('__u_abc__u_')));
        assert.equal(deleted, 2);
    });
});

test('CCS-P2-P4: W9 — kunci sudah tiada → deleted 0 (bot boleh laporkan "sudah bersih")', async () => {
    await withMemoryAdapter(async (_adapter, subtitles) => {
        const { deleted } = await subtitles.purgeTranslationCacheByKeys({ baseKey: 'never', runtimeKey: 'never' });
        assert.equal(deleted, 0);
    });
});

// ── Zombie gate (W3) ────────────────────────────────────────────────────────

// PIN SKOP (2026-11-24, ditemui semasa gate release v3.41.1): tangkapan
// `translationGen` pernah diletakkan di dalam handleTranslation() manakala
// keempat-empat titik semakan berada di dalam performTranslation() — fungsi
// SIBLING peringkat-atas, bukan nested. `const` function-scoped → setiap
// tulisan cache produksi akan dilempar `ReferenceError: translationGen is not
// defined` (ditelan try/catch → penterjemahan GAGAL selepas token dibelanja).
// node --check DAN eslint tidak menangkapnya (config hanya ada no-unused-vars,
// tiada no-undef). Ujian ini memetakan skop secara mekanikal.
test('CCS-P2-Z4: translationGen dideklarasi DALAM fungsi yang sama yang menggunakannya (tiada ReferenceError skop)', () => {
    const src = require('node:fs').readFileSync(
        require('node:path').join(__dirname, '..', 'handlers', 'subtitles.js'),
        'utf8'
    );
    const lines = src.split('\n');

    // Fungsi peringkat-atas: bermula pada lajur 0.
    const topLevelFn = (lineIndex) => {
        for (let j = lineIndex; j >= 0; j--) {
            const m = /^(?:async\s+)?function\s+(\w+)\s*\(/.exec(lines[j]);
            if (m) return m[1];
        }
        return '<module>';
    };

    const declIdx = lines.findIndex((l) => /const translationGen = getTranslationGeneration\(runtimeKey\);/.test(l));
    assert.notEqual(declIdx, -1, 'tangkapan generasi mesti wujud tepat sekali');
    assert.equal(
        lines.filter((l) => /const translationGen = getTranslationGeneration\(/.test(l)).length,
        1,
        'tangkapan generasi mesti tepat sekali (tiada dua punca generasi)'
    );
    const declFn = topLevelFn(declIdx);

    const useIdx = lines
        .map((l, i) => [l, i])
        .filter(([l]) => /isTranslationGenerationCurrent\(runtimeKey, translationGen\)/.test(l))
        .map(([, i]) => i);
    assert.equal(useIdx.length, 4, 'zombie gate mesti kekal di 4 titik tulisan cache (partial/bypass/kekal/error)');

    for (const i of useIdx) {
        assert.equal(
            topLevelFn(i),
            declFn,
            `semakan zombie gate di baris ${i + 1} berada di luar skop \`translationGen\` (dideklarasi dalam ${declFn}) → ReferenceError runtime`
        );
    }
    assert.notEqual(
        declFn,
        'handleTranslation',
        'tangkapan di handleTranslation tidak kelihatan kepada performTranslation'
    );
});

test('CCS-P2-Z1: bump generasi → isTranslationGenerationCurrent palsu sehingga ditangkap semula', async () => {
    await withMemoryAdapter(async (_adapter, subtitles) => {
        const { bumpTranslationGeneration, isTranslationGenerationCurrent, getTranslationGeneration } =
            subtitles.__testing;
        const gen0 = getTranslationGeneration('ZK');
        assert.equal(gen0, 0);
        assert.equal(isTranslationGenerationCurrent('ZK', gen0), true);
        const gen1 = bumpTranslationGeneration('ZK');
        assert.equal(gen1, 1, 'monotonic +1');
        assert.equal(isTranslationGenerationCurrent('ZK', gen0), false, 'kerja lama (gen0) kini stale');
        assert.equal(isTranslationGenerationCurrent('ZK', gen1), true);
        const gen2 = bumpTranslationGeneration('ZK');
        assert.equal(gen2, 2, 'monotonic +1 lagi (bukan Date.now collision)');
    });
});

test('CCS-P2-Z2: purge menaikkan generasi runtimeKey — in-flight lama menjadi stale', async () => {
    await withMemoryAdapter(async (_adapter, subtitles) => {
        const { getTranslationGeneration } = subtitles.__testing;
        assert.equal(getTranslationGeneration('ZP'), 0);
        await subtitles.purgeTranslationCacheByKeys({ baseKey: 'ZP', runtimeKey: 'ZP' });
        assert.equal(getTranslationGeneration('ZP'), 1);
    });
});

test('CCS-P2-Z3: purge BYPASS tidak menganggu generasi in-flight Kekal untuk baseKey sama (kunci runtimeKey)', async () => {
    await withMemoryAdapter(async (_adapter, subtitles) => {
        const { getTranslationGeneration } = subtitles.__testing;
        await subtitles.purgeTranslationCacheByKeys({
            baseKey: 'ZS',
            runtimeKey: 'ZS__u_abc',
            bypass: true,
            userHash: 'abc'
        });
        assert.equal(getTranslationGeneration('ZS'), 0, 'kekal ZS tidak diganggu');
        assert.equal(getTranslationGeneration('ZS__u_abc'), 1);
    });
});

// ── Pendawaian Telegram → purge pusat ───────────────────────────────────────

// ── Peringkat 3: metadata registry + dedup selamat ───────────────────────────

test('CCS-P3-D1: registerCompletedSubtitle — 2 entri tajuk SAMA dengan baseKey BERBEZA → kedua kekal (W10)', async () => {
    const StorageFactory = require('../storage/StorageFactory');
    const prev = StorageFactory.instance;
    const store = new Map();
    StorageFactory.instance = {
        async get(k, t) {
            return store.has(`${t}:${k}`) ? store.get(`${t}:${k}`) : null;
        },
        async set(k, v, t) {
            store.set(`${t}:${k}`, v);
            return true;
        },
        async delete(k, t) {
            return store.delete(`${t}:${k}`);
        },
        async list() {
            return [];
        },
        async cleanup() {
            return { deleted: 0, bytesFreed: 0 };
        },
        async close() {},
        getClient() {
            return null;
        }
    };
    try {
        const bot = require('./telegramBot');
        const id1 = await bot.registerCompletedSubtitle({
            title: 'Show.S01E01',
            provider: 'SubDL',
            targetLang: 'ms',
            baseKey: 'A',
            runtimeKey: 'A',
            bypass: false,
            userHash: 'u1',
            trinityMode: 'basic',
            trinityChannel: 'gemini'
        });
        const id2 = await bot.registerCompletedSubtitle({
            title: 'Show.S01E01',
            provider: 'SubDL',
            targetLang: 'ms',
            baseKey: 'B',
            runtimeKey: 'B',
            bypass: false,
            userHash: 'u1',
            trinityMode: 'pro',
            trinityChannel: 'openai'
        });
        const list = store.get(`translation:stremio:sub_registry`) || [];
        assert.equal(list.length, 2, 'dedup tajuk lama akan buang satu — kedua mesti kekal');
        assert.notEqual(id1, id2);
        assert.equal(list.filter((e) => e.baseKey === 'A').length, 1);
        assert.equal(list.filter((e) => e.baseKey === 'B').length, 1);
    } finally {
        StorageFactory.instance = prev;
    }
});

test('CCS-P3-D2: registerCompletedSubtitle — entri (baseKey,bypass,userHash) IDENTIK menggantikan yang lama', async () => {
    const StorageFactory = require('../storage/StorageFactory');
    const prev = StorageFactory.instance;
    const store = new Map();
    StorageFactory.instance = {
        async get(k, t) {
            return store.has(`${t}:${k}`) ? store.get(`${t}:${k}`) : null;
        },
        async set(k, v, t) {
            store.set(`${t}:${k}`, v);
            return true;
        },
        async delete(k, t) {
            return store.delete(`${t}:${k}`);
        },
        async list() {
            return [];
        },
        async cleanup() {
            return { deleted: 0, bytesFreed: 0 };
        },
        async close() {},
        getClient() {
            return null;
        }
    };
    try {
        const bot = require('./telegramBot');
        await bot.registerCompletedSubtitle({
            title: 'T',
            provider: 'P',
            targetLang: 'ms',
            baseKey: 'K',
            runtimeKey: 'K',
            bypass: false,
            userHash: 'u1'
        });
        await bot.registerCompletedSubtitle({
            title: 'T',
            provider: 'P',
            targetLang: 'ms',
            baseKey: 'K',
            runtimeKey: 'K',
            bypass: false,
            userHash: 'u1'
        });
        const list = store.get(`translation:stremio:sub_registry`) || [];
        assert.equal(list.length, 1, 'kunci identik → satu entri sahaja');
    } finally {
        StorageFactory.instance = prev;
    }
});

test('CCS-P3-D3: registerCompletedSubtitle — Kekal dan Bypass untuk baseKey sama TIDAK saling menimpa', async () => {
    const StorageFactory = require('../storage/StorageFactory');
    const prev = StorageFactory.instance;
    const store = new Map();
    StorageFactory.instance = {
        async get(k, t) {
            return store.has(`${t}:${k}`) ? store.get(`${t}:${k}`) : null;
        },
        async set(k, v, t) {
            store.set(`${t}:${k}`, v);
            return true;
        },
        async delete(k, t) {
            return store.delete(`${t}:${k}`);
        },
        async list() {
            return [];
        },
        async cleanup() {
            return { deleted: 0, bytesFreed: 0 };
        },
        async close() {},
        getClient() {
            return null;
        }
    };
    try {
        const bot = require('./telegramBot');
        await bot.registerCompletedSubtitle({
            title: 'T',
            provider: 'P',
            targetLang: 'ms',
            baseKey: 'K',
            runtimeKey: 'K',
            bypass: false,
            userHash: 'u1'
        });
        await bot.registerCompletedSubtitle({
            title: 'T',
            provider: 'P',
            targetLang: 'ms',
            baseKey: 'K',
            runtimeKey: 'K__u_u1',
            bypass: true,
            userHash: 'u1'
        });
        const list = store.get(`translation:stremio:sub_registry`) || [];
        assert.equal(list.length, 2, 'kekal dan bypass ialah dua entri berasingan');
    } finally {
        StorageFactory.instance = prev;
    }
});

test('CCS-P3-M1: entri baharu menyimpan metadata + keys=[runtimeKey] sahaja (tiada sourceFileId sebagai kunci — W2)', async () => {
    const StorageFactory = require('../storage/StorageFactory');
    const prev = StorageFactory.instance;
    const store = new Map();
    StorageFactory.instance = {
        async get(k, t) {
            return store.has(`${t}:${k}`) ? store.get(`${t}:${k}`) : null;
        },
        async set(k, v, t) {
            store.set(`${t}:${k}`, v);
            return true;
        },
        async delete(k, t) {
            return store.delete(`${t}:${k}`);
        },
        async list() {
            return [];
        },
        async cleanup() {
            return { deleted: 0, bytesFreed: 0 };
        },
        async close() {},
        getClient() {
            return null;
        }
    };
    try {
        const bot = require('./telegramBot');
        await bot.registerCompletedSubtitle({
            title: 'T',
            provider: 'P',
            targetLang: 'ms',
            baseKey: 'K',
            runtimeKey: 'K',
            bypass: false,
            userHash: 'u1',
            trinityMode: 'pro',
            trinityChannel: 'anthropic',
            embeddedKeys: [{ videoHash: 'vh', cacheKey: 'ck' }, { bad: true }]
        });
        const list = store.get(`translation:stremio:sub_registry`) || [];
        const e = list[0];
        assert.equal(e.baseKey, 'K');
        assert.equal(e.runtimeKey, 'K');
        assert.equal(e.bypass, false);
        assert.equal(e.userHash, 'u1');
        assert.equal(e.trinityMode, 'pro');
        assert.equal(e.trinityChannel, 'anthropic');
        assert.deepEqual(e.keys, ['K'], 'keys hanya runtimeKey — tiada sourceFileId');
        assert.deepEqual(e.embeddedKeys, [{ videoHash: 'vh', cacheKey: 'ck' }], 'embeddedKeys ditapis');
    } finally {
        StorageFactory.instance = prev;
    }
});

test('CCS-P3-M2: pemanggil LAMA yang hanya hantar keys:["X__u_abc","src"] tetap dinormalkan (bypass=true, userHash=abc)', async () => {
    const StorageFactory = require('../storage/StorageFactory');
    const prev = StorageFactory.instance;
    const store = new Map();
    StorageFactory.instance = {
        async get(k, t) {
            return store.has(`${t}:${k}`) ? store.get(`${t}:${k}`) : null;
        },
        async set(k, v, t) {
            store.set(`${t}:${k}`, v);
            return true;
        },
        async delete(k, t) {
            return store.delete(`${t}:${k}`);
        },
        async list() {
            return [];
        },
        async cleanup() {
            return { deleted: 0, bytesFreed: 0 };
        },
        async close() {},
        getClient() {
            return null;
        }
    };
    try {
        const bot = require('./telegramBot');
        await bot.registerCompletedSubtitle({
            title: 'T',
            provider: 'P',
            targetLang: 'ms',
            keys: ['X__u_abc', 'src-id']
        });
        const e = (store.get(`translation:stremio:sub_registry`) || [])[0];
        assert.equal(e.baseKey, 'X');
        assert.equal(e.runtimeKey, 'X__u_abc');
        assert.equal(e.bypass, true);
        assert.equal(e.userHash, 'abc');
        assert.deepEqual(e.keys, ['X__u_abc'], 'src-id dibuang daripada keys');
    } finally {
        StorageFactory.instance = prev;
    }
});

// ── Peringkat 4: xEmbed ─────────────────────────────────────────────────────

test('CCS-P4-X1: deleteTranslatedEmbedded memadam kunci + keluarkan daripada indeks; original kekal', async () => {
    const StorageFactory = require('../storage/StorageFactory');
    const prev = StorageFactory.instance;
    const store = new Map();
    StorageFactory.instance = {
        async get(k, t) {
            return store.has(`${t}:${k}`) ? store.get(`${t}:${k}`) : null;
        },
        async set(k, v, t) {
            store.set(`${t}:${k}`, v);
            return true;
        },
        async delete(k, t) {
            return store.delete(`${t}:${k}`);
        },
        async exists(k, t) {
            return store.has(`${t}:${k}`);
        },
        async list() {
            return [];
        },
        async cleanup() {
            return { deleted: 0, bytesFreed: 0 };
        },
        async close() {},
        getClient() {
            return null;
        }
    };
    try {
        const ec = require('../utils/embeddedCache');
        assert.equal(typeof ec.deleteTranslatedEmbedded, 'function');
        await ec.saveOriginalEmbedded('vh', 't1', 'eng', ' ORIGINAL ', {});
        const saved = await ec.saveTranslatedEmbedded('vh', 't1', 'eng', 'ms', ' TERJEMAHAN ', {});
        assert.ok(saved.cacheKey);
        assert.equal((await ec.listEmbeddedTranslations('vh')).length, 1);

        const ok = await ec.deleteTranslatedEmbedded('vh', saved.cacheKey);
        assert.equal(ok, true);
        assert.equal(await ec.getTranslatedEmbedded('vh', 't1', 'eng', 'ms'), null, 'terjemahan dipadam');
        assert.equal((await ec.listEmbeddedTranslations('vh')).length, 0, 'indeks dikemas kini');
        const orig = await ec.getOriginalEmbedded('vh', 't1', 'eng');
        assert.ok(orig && orig.content, 'original embedded KEKAL');
    } finally {
        StorageFactory.instance = prev;
    }
});

test('CCS-P4-X2: purgeTranslationCacheByKeys dengan embeddedKeys memadam terjemahan embedded (W4)', async () => {
    await withMemoryAdapter(async (adapter, subtitles) => {
        const ec = require('../utils/embeddedCache');
        await ec.saveOriginalEmbedded('vh2', 't1', 'eng', ' ORIGINAL ', {});
        const saved = await ec.saveTranslatedEmbedded('vh2', 't1', 'eng', 'ms', ' TERJEMAHAN ', {});

        const { deleted } = await subtitles.purgeTranslationCacheByKeys({
            runtimeKey: 'partial:xembed:vh2:t1',
            userHash: 'u9',
            embeddedKeys: [{ videoHash: 'vh2', cacheKey: saved.cacheKey }]
        });
        assert.ok(deleted >= 1, 'sekurang-kurangnya embedded terpadam');
        assert.equal(await ec.getTranslatedEmbedded('vh2', 't1', 'eng', 'ms'), null);
        assert.ok(await ec.getOriginalEmbedded('vh2', 't1', 'eng'), 'original kekal');
    });
});

test('CCS-P3-R1: renderRegistryPage dilaksana TANPA ReferenceError dan memaparkan badge namespace (K3)', async () => {
    // PIN Runtuh-Dijana semula (2026-11-24): apply_diff pernah melaporkan
    // "Applied 1 of 2" sedangkan blok `badge` TIDAK dimasukkan — baris
    // `${badge}` kekal tanpa pengisytiharan. node --check + eslint LULUS
    // (rujukan dalam template literal ialah sintaks sah); hanya pelaksanaan
    // sebenar menangkap ReferenceError. Ujian ini memanggil fungsi itu sendiri.
    const StorageFactory = require('../storage/StorageFactory');
    const axios = require('axios');
    const prevInstance = StorageFactory.instance;
    const prevPost = axios.post;
    const sent = [];
    const registry = [
        {
            id: 'sub_pro',
            title: 'Show & Title',
            provider: 'SubDL',
            targetLang: 'MS',
            baseKey: 'A',
            runtimeKey: 'A',
            bypass: false,
            userHash: 'u1',
            trinityMode: 'pro',
            trinityChannel: 'anthropic',
            keys: ['A']
        },
        {
            id: 'sub_byp',
            title: 'Show.S01E01',
            provider: 'SubDL',
            targetLang: 'MS',
            baseKey: 'B',
            runtimeKey: 'B__u_u2',
            bypass: true,
            userHash: 'u2',
            keys: ['B__u_u2']
        },
        { id: 'sub_old', title: 'Legacy Entry', provider: 'X', targetLang: 'EN', keys: ['C__u_u3', 'src-id'] }
    ];
    StorageFactory.instance = {
        async get(k) {
            return k === 'stremio:sub_registry' ? registry : null;
        },
        async set() {
            return true;
        },
        async delete() {
            return true;
        },
        async list() {
            return [];
        },
        async cleanup() {
            return { deleted: 0, bytesFreed: 0 };
        },
        async close() {},
        getClient() {
            return null;
        }
    };
    axios.post = async (url, body) => {
        sent.push({ url, body });
        return { data: { ok: true } };
    };
    try {
        const bot = require('./telegramBot');
        assert.equal(typeof bot.__testing?.renderRegistryPage, 'function');
        await bot.__testing.renderRegistryPage('chat1', 0, 1, 'TOKEN');

        const edit = sent.find((s) => s.url.endsWith('/sendMessage'));
        assert.ok(edit, 'sendMessage dihantar');
        const text = edit.body.text;
        assert.ok(!/ReferenceError/.test(text), 'tiada ralat runtime dalam teks');
        assert.ok(text.includes('Pro · anthropic · Kekal'), 'badge entri Pro/Anthropic/Kekal');
        assert.ok(text.includes('— · — · Bypass'), 'badge entri bypass tanpa mode/pintu');
        assert.ok(text.includes('Lama · Bypass'), 'entri lama dilabel "Lama" + jenis dikesan daripada __u_');
        assert.ok(!text.includes('<b>Source:</b>'), 'format lama 📥 Source digugurkan');
    } finally {
        axios.post = prevPost;
        StorageFactory.instance = prevInstance;
    }
});

test('CCS-P2-T1: telegramBot del_reg/flush_do memanggil purgeTranslationCacheByKeys (bukan 6-delete tanpa prefix)', () => {
    const src = require('node:fs').readFileSync(require('node:path').join(__dirname, 'telegramBot.js'), 'utf8');
    assert.ok(/purgeTranslationCacheByKeys/.test(src), 'telegramBot mesti memanggil purge pusat');
    assert.ok(
        !/for \(const key of item\.keys(\s*\|\|\s*\[\])?\)\s*\{[^}]*CACHE_TYPES\.EMBEDDED/s.test(src),
        'gelung 6-delete lama (EMBEDDED/SYNC/AUTOSUB/BYPASS/PARTIAL/TRANSLATION) mesti dibuang'
    );
    // P3: lazy require DALAM callback (tiada import top-level subtitles).
    const topLevelImport = /^const\s*\{[^}]*\}\s*=\s*require\('\.\.\/handlers\/subtitles'\);/m.test(src);
    assert.equal(topLevelImport, false, 'telegramBot tidak boleh mengimport subtitles pada top-level (kitaran)');
});

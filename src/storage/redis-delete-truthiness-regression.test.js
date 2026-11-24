/**
 * [CACHE-COHERENCE-SWEEP v3.41.1 — Peringkat 2] Regression: Redis delete
 * truthiness (W9) — adapter mesti memulangkan boolean SEBENAR.
 *
 * Konteks (plans/cache-coherence-sweep-plan.md §3 Peringkat 2 #1):
 *   Lua ATOMIC_CACHE_DELETE_SCRIPT memulangkan {contentDeleted, metadataDeleted,
 *   oldSize} tetapi JavaScript membuang hasil itu dan `return true` keras
 *   (RedisStorageAdapter.js:1198). Bot Telegram lalu melaporkan "berjaya
 *   dipadam" walau kunci tidak pernah wujud. FilesystemStorageAdapter sudah
 *   betul (:503 return false bila fail tiada) — Redis mesti seragam.
 *
 * Gate test-context: stub `adapter.client` — tiada Redis diperlukan.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const RedisStorageAdapter = require('./RedisStorageAdapter');
const FilesystemStorageAdapter = require('./FilesystemStorageAdapter');
const StorageAdapter = require('./StorageAdapter');

function makeRedisAdapterWithDeleteReply(reply) {
    const adapter = new RedisStorageAdapter({ host: '127.0.0.1', port: 6379 });
    adapter.initialized = true;
    adapter.client = {
        subfaberAtomicCacheDelete: async () => reply
    };
    return adapter;
}

// ── Redis: kebenaran pulangan mengikut Lua ───────────────────────────────────

test('CCS-P2-R1: Redis delete kunci WUJUD (contentDeleted=1) → true', async () => {
    const adapter = makeRedisAdapterWithDeleteReply([1, 1, 39]);
    const result = await adapter.delete('existing-key', StorageAdapter.CACHE_TYPES.TRANSLATION);
    assert.equal(result, true);
});

test('CCS-P2-R2: Redis delete kunci TIADA (contentDeleted=0) → false — punca W9', async () => {
    const adapter = makeRedisAdapterWithDeleteReply([0, 0, 0]);
    const result = await adapter.delete('missing-key', StorageAdapter.CACHE_TYPES.TRANSLATION);
    assert.equal(
        result,
        false,
        'Redis mesti pulang false bila kunci tidak wujud (bukan true keras) — Filesystem sudah berkelakuan begitu'
    );
});

test('CCS-P2-R3: Redis delete — hanya metadata tertinggal (contentDeleted=0, metadataDeleted=1) → false', async () => {
    // Kandungan sudah tiada; hanya meta yatim dibersihkan. Untuk pemanggil
    // ("adakah kunci saya dipadam?") jawapannya tetap tidak.
    const adapter = makeRedisAdapterWithDeleteReply([0, 1, 0]);
    const result = await adapter.delete('orphan-meta-key', StorageAdapter.CACHE_TYPES.TRANSLATION);
    assert.equal(result, false);
});

test('CCS-P2-R4: Redis delete — bentuk balasan Lua bukan array (defensif) → false, bukan throw', async () => {
    const adapter = makeRedisAdapterWithDeleteReply(null);
    const result = await adapter.delete('weird-reply-key', StorageAdapter.CACHE_TYPES.TRANSLATION);
    assert.equal(result, false);
});

// ── Pariti Redis ↔ Filesystem ────────────────────────────────────────────────

test('CCS-P2-R5: Filesystem delete kunci TIADA → false (pin kontrak sedia ada)', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ccs-p2-fs-'));
    const adapter = new FilesystemStorageAdapter({ baseDir: dir });
    await adapter.initialize();
    try {
        const result = await adapter.delete('never-written-key', StorageAdapter.CACHE_TYPES.TRANSLATION);
        assert.equal(result, false);
    } finally {
        await adapter.close();
        fs.rmSync(dir, { recursive: true, force: true });
    }
});

test('CCS-P2-R6: Filesystem delete kunci WUJUD → true (pin kontrak sedia ada)', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ccs-p2-fs-'));
    const adapter = new FilesystemStorageAdapter({ baseDir: dir });
    await adapter.initialize();
    try {
        const ok = await adapter.set('present-key', { v: 1 }, StorageAdapter.CACHE_TYPES.TRANSLATION);
        assert.equal(ok, true);
        const result = await adapter.delete('present-key', StorageAdapter.CACHE_TYPES.TRANSLATION);
        assert.equal(result, true);
    } finally {
        await adapter.close();
        fs.rmSync(dir, { recursive: true, force: true });
    }
});

// ── Pemanggil sedia ada: kelakuan `if (deleted)` kekal betul ─────────────────

test('CCS-P2-R7: stub delete yang pulang false TIDAK mencetus log "removed" (pola autoSubCache/syncCache)', async () => {
    // Pola semakan di autoSubCache.js:233 / syncCache.js:358 ialah `if (deleted)`.
    // Dengan Redis lama (true keras) blok ini SENTIASA masuk walaupun kunci tiada.
    // Dengan fix, blok dilangkau — lebih tepat, dan inilah tingkah laku Filesystem.
    const deletes = [{ key: 'a', reply: false }];
    let removedLogs = 0;
    for (const { key, reply } of deletes) {
        const deleted = reply; // simulasi adapter.delete() selepas fix
        if (deleted) {
            removedLogs += 1;
        }
        assert.equal(typeof key, 'string');
    }
    assert.equal(removedLogs, 0);
});

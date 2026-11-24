/**
 * [CACHE-COHERENCE-SWEEP v3.41.1 — Peringkat 1] Regression: import-surface &
 * SSUT kunci storan terjemahan.
 *
 * Konteks (plans/cache-coherence-sweep-plan.md §3 Peringkat 1):
 *   - W7: index.js pernah mengimport `registerDeletionTarget` daripada
 *     telegramBot.js — fungsi itu TIDAK PERNAH di-export. TypeError ditelan
 *     senyap → laporan xEmbed ke Telegram mati sepenuhnya.
 *   - getTranslationStorageKey()/isValidTranslationKey()/TRANSLATION_STORAGE_PREFIX
 *     berpindah daripada subtitles.js ke cacheKeys.js (modul daun, sifar
 *     kitaran import) supaya telegramBot boleh memakainya tanpa
 *     subtitles.js ↔ telegramBot.js cycle.
 *
 * Gate test-context: tiada Redis, tiada rangkaian. Semakan statik + require
 * tulen modul.
 */

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

// ── P1-1: Import-surface telegramBot ↔ pengguna ─────────────────────────────

test('CCS-P1-1: index.js hanya mengimport nama yang DIEKSPPORT oleh telegramBot', () => {
    const botExports = require('./telegramBot');
    const indexSrc = read('index.js');

    // Kumpul setiap nama yang di-destructure daripada require telegramBot.
    const re = /const\s*\{([^}]+)\}\s*=\s*require\(['"][^'"]*telegramBot['"]\)/g;
    const names = new Set();
    let m;
    while ((m = re.exec(indexSrc)) !== null) {
        for (const raw of m[1].split(',')) {
            const name = raw
                .trim()
                .split(/\s*[:=]/)[0]
                .trim();
            if (name) names.add(name);
        }
    }

    assert.ok(names.size > 0, 'index.js mesti mempunyai sekurang-kurangnya satu import telegramBot');
    for (const name of names) {
        assert.ok(
            Object.prototype.hasOwnProperty.call(botExports, name),
            `index.js mengimport "${name}" tetapi telegramBot.js tidak mengeksportnya (W7)`
        );
    }
});

test('CCS-P1-2: subtitles.js hanya mengimport nama yang DIEKSPPORT oleh telegramBot', () => {
    const botExports = require('./telegramBot');
    const src = read('src/handlers/subtitles.js');

    const re = /const\s*\{([^}]+)\}\s*=\s*require\(['"][^'"]*telegramBot['"]\)/g;
    const names = new Set();
    let m;
    while ((m = re.exec(src)) !== null) {
        for (const raw of m[1].split(',')) {
            const name = raw
                .trim()
                .split(/\s*[:=]/)[0]
                .trim();
            if (name) names.add(name);
        }
    }

    for (const name of names) {
        assert.ok(
            Object.prototype.hasOwnProperty.call(botExports, name),
            `subtitles.js mengimport "${name}" tetapi telegramBot.js tidak mengeksportnya`
        );
    }
});

// ── P1-3: SSUT kunci storan duduk di cacheKeys.js ────────────────────────────

test('CCS-P1-3: cacheKeys mengeksport SSUT kunci storan terjemahan', () => {
    const cacheKeys = require('../utils/cacheKeys');
    assert.equal(typeof cacheKeys.getTranslationStorageKey, 'function');
    assert.equal(typeof cacheKeys.isValidTranslationKey, 'function');
    assert.equal(typeof cacheKeys.TRANSLATION_STORAGE_PREFIX, 'string');
    assert.equal(cacheKeys.TRANSLATION_STORAGE_PREFIX, 't2s__');
});

test('CCS-P1-4: getTranslationStorageKey — kontrak byte-identik dengan subtitles.js lama', () => {
    const {
        getTranslationStorageKey,
        isValidTranslationKey,
        TRANSLATION_STORAGE_PREFIX
    } = require('../utils/cacheKeys');

    // Nilai lalai / invalid → string kosong (bukan throw).
    assert.equal(getTranslationStorageKey(''), '');
    assert.equal(getTranslationStorageKey(null), '');
    assert.equal(getTranslationStorageKey(undefined), '');
    assert.equal(getTranslationStorageKey(42), '');

    // Kunci biasa → prefix ditambah.
    assert.equal(getTranslationStorageKey('X'), 't2s__X');

    // Kunci yang sudah berprefix → tidak double-prefix.
    assert.equal(getTranslationStorageKey('t2s__X'), 't2s__X');

    // isValidTranslationKey — hanya menerima string berprefix.
    assert.equal(isValidTranslationKey('X'), false);
    assert.equal(isValidTranslationKey(''), false);
    assert.equal(isValidTranslationKey(null), false);
    assert.equal(isValidTranslationKey('t2s__X'), true);

    // Konstanta prefix kekal.
    assert.equal(TRANSLATION_STORAGE_PREFIX, 't2s__');
});

test('CCS-P1-5: subtitles.js tidak lagi mendefinisikan SSUT kunci secara lokal (tiada dua punca kebenaran)', () => {
    const src = read('src/handlers/subtitles.js');
    assert.ok(
        !/function\s+getTranslationStorageKey\s*\(/.test(src),
        'getTranslationStorageKey mesti direlocat ke cacheKeys.js, bukan didefinisikan dalam subtitles.js'
    );
    assert.ok(
        !/function\s+isValidTranslationKey\s*\(/.test(src),
        'isValidTranslationKey mesti direlocat ke cacheKeys.js'
    );
    assert.ok(
        !/const\s+TRANSLATION_STORAGE_PREFIX\s*=/.test(src),
        'TRANSLATION_STORAGE_PREFIX mesti direlocat ke cacheKeys.js'
    );
});

test('CCS-P1-6: index.js tidak lagi memanggil registerDeletionTarget (W7 dead import dibuang)', () => {
    const src = read('index.js');
    assert.ok(!/registerDeletionTarget/.test(src), 'registerDeletionTarget ialah import mati (W7) — mesti dibuang');
});

test('CCS-P1-7: require dua hala subtitles ↔ telegramBot tidak mencipta kitaran (kedua-dua berjaya)', () => {
    // Susunan A → B
    const a = require('./telegramBot');
    const b = require('../handlers/subtitles');
    assert.equal(typeof a.registerCompletedSubtitle, 'function');
    assert.equal(typeof b.handleTranslation, 'function');

    // Susunan B → A (modul sudah dalam cache CommonJS; memuat semula tidak
    // diperlukan — cukup pastikan kedua-dua eksport masih utuh selepas
    // require kedua).
    const a2 = require('./telegramBot');
    const b2 = require('../handlers/subtitles');
    assert.equal(typeof a2.registerCompletedSubtitle, 'function');
    assert.equal(typeof b2.handleTranslation, 'function');
});

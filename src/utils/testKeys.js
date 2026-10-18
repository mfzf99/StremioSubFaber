/**
 * Test Keys Loader — infrastruktur penyimpanan & pengesahan live test keys
 * (Mandat Owner 2026-10-18: "Infrastruktur Penyimpanan & Pengesahan Test Keys")
 *
 * SKOP (diwarisi daripada audit pra-pelaksanaan yang diluluskan):
 *   - Memuatkan `.env.test.local` dari punca projek (ditolak oleh .gitignore,
 *     corak `.env.*.local` — disahkan melalui `git check-ignore -v`).
 *   - Domain penggunaan: pengesahan sambungan (ping / model list) dan suntikan
 *     borang Custom Provider oleh Playwright Frontend sahaja.
 *   - DILARANG untuk larian terjemahan pukal (zero bulk translation runs).
 *
 * KONTRAK "ZERO SECRET LOGGING" (dikuatkuasakan oleh modul ini):
 *   - TIDAK ADA sebarang `console.log/warn/error` yang menerima nilai kunci mentah.
 *   - Status kehadiran kunci hanya dilaporkan sebagai Boolean atau panjang string
 *     (`hasTestKey()`, `describeTestKey()` → "present(len=N)" / "absent").
 *   - API tidak mengembalikan senarai kunci untuk di-iterate secara pukal
 *     (`getTestKeysSnapshot()` memulangkan peta Boolean sahaja).
 *
 * PENGASINGAN DOMAIN (dinding anti-crossover):
 *   - Prefix `SUBFABER_TEST_*` sengaja diasingkan daripada env produksi
 *     (`GEMINI_*`, `OPENSUBTITLES_API_KEY`, dsb.). Modul ini TIDAK membaca
 *     pemboleh ubah produksi dan TIDAK menyuntik apa-apa ke dalam pipeline
 *     `normalizeConfig()` pengguna — kunci ujian hidup hanya dalam ingatan
 *     proses ujian.
 *   - `require('dotenv').config()` global dalam `index.js` memuatkan `.env`
 *     sahaja; dotenv tidak menimpa nilai `process.env` yang sedia wujud,
 *     maka suntikan terminal (Playwright MCP) sentiasa diutamakan.
 *
 * FORMAT SENARAI (v3.14.x — bekalan berbilang kunci Gemini oleh Owner):
 *   - `SUBFABER_TEST_GEMINI_KEYS` ialah senarai dipisahkan koma
 *     (format lama `AIza...` + format baru `AQ....`, kedua-duanya diterima).
 *     Guna `getTestKeyList('GEMINI_KEYS')` untuk array ternormalisasi
 *     (trim + dedup + buang kosong). JANGAN log elemen array.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const TEST_ENV_FILENAME = '.env.test.local';

/**
 * Nama pemboleh ubah yang dikenali. Kunci baharu mesti didaftarkan di sini
 * DAN dalam templat `.env.test.example` supaya kekal seiring.
 */
const KNOWN_TEST_VARS = Object.freeze({
    GEMINI_KEY: 'SUBFABER_TEST_GEMINI_KEY',
    GEMINI_KEYS: 'SUBFABER_TEST_GEMINI_KEYS',
    ROOTSYS_KEY: 'SUBFABER_TEST_ROOTSYS_KEY',
    ROOTSYS_BASE_URL: 'SUBFABER_TEST_ROOTSYS_BASE_URL',
    ROOTSYS_ANTHROPIC_BASE_URL: 'SUBFABER_TEST_ROOTSYS_ANTHROPIC_BASE_URL',
    CRAZYROUTER_KEY: 'SUBFABER_TEST_CRAZYROUTER_KEY',
    CRAZYROUTER_BASE_URL: 'SUBFABER_TEST_CRAZYROUTER_BASE_URL',
    CRAZYROUTER_OPENAI_BASE_URL: 'SUBFABER_TEST_CRAZYROUTER_OPENAI_BASE_URL'
});

let loaded = false;

/**
 * Muatkan `.env.test.local` sekali sahaja (idempotent). Gagal senyap jika
 * fail tiada — kehadiran kunci kemudiannya dilaporkan sebagai `false`.
 * @returns {void}
 */
function ensureLoaded() {
    if (loaded) return;
    loaded = true;
    try {
        const dotenv = require('dotenv');
        const envPath = path.resolve(__dirname, '..', '..', TEST_ENV_FILENAME);
        if (fs.existsSync(envPath)) {
            // Perhatian: dotenv TIDAK menimpa process.env sedia ada —
            // suntikan terminal (Playwright MCP) kekal diutamakan.
            dotenv.config({ path: envPath, quiet: true });
        }
    } catch (_) {
        // Kegagalan muat fail tidak boleh memecahkan suite ujian —
        // semua getter akan memulangkan null/undefined dengan selamat.
    }
}

/**
 * Baca satu kunci ujian (trim). Tidak pernah log nilainya.
 * @param {string} name - Nama logik (cth. 'ROOTSYS_KEY') ATAU nama env penuh
 * @returns {string|null} Nilai kunci atau null jika tiada/kosong
 */
function getTestKey(name) {
    ensureLoaded();
    const envName = KNOWN_TEST_VARS[name] || (typeof name === 'string' ? name.trim() : '');
    if (!envName) return null;
    const raw = process.env[envName];
    if (typeof raw !== 'string') return null;
    const trimmed = raw.trim();
    return trimmed.length > 0 ? trimmed : null;
}

/**
 * Baca senarai kunci dipisahkan koma (cth. GEMINI_KEYS) sebagai array
 * ternormalisasi: split koma → trim → buang kosong → dedup (kekal order).
 * Elemen array TIDAK BOLEH dilog oleh caller (kontrak Zero Secret Logging).
 * @param {string} name - Nama logik (cth. 'GEMINI_KEYS')
 * @returns {string[]} Array kunci (kosong jika tiada)
 */
function getTestKeyList(name) {
    const value = getTestKey(name);
    if (value === null) return [];
    const seen = new Set();
    const list = [];
    for (const item of value.split(',')) {
        const trimmed = item.trim();
        if (trimmed.length > 0 && !seen.has(trimmed)) {
            seen.add(trimmed);
            list.push(trimmed);
        }
    }
    return list;
}

/**
 * Baca base URL ujian dengan normalisasi ringan (buang trailing slash).
 * URL bukan rahsia tetapi dirawat dengan disiplin yang sama.
 * @param {string} name - Nama logik (cth. 'ROOTSYS_BASE_URL')
 * @returns {string|null} URL ternormalisasi atau null
 */
function getTestBaseUrl(name) {
    const value = getTestKey(name);
    if (!value) return null;
    return value.replace(/\/+$/, '');
}

/**
 * Adakah kunci tertentu tersedia? (selamat untuk dilog — Boolean sahaja)
 * @param {string} name - Nama logik
 * @returns {boolean}
 */
function hasTestKey(name) {
    return getTestKey(name) !== null;
}

/**
 * Pemerian status tanpa nilai: "present(len=N)" / "absent" / "list(count=N)".
 * Ini SATU-SATUNYA bentuk teks status yang dibenarkan keluar dari modul.
 * @param {string} name - Nama logik
 * @returns {string}
 */
function describeTestKey(name) {
    if (name === 'GEMINI_KEYS') {
        const list = getTestKeyList(name);
        return list.length === 0 ? 'absent' : `list(count=${list.length})`;
    }
    const value = getTestKey(name);
    return value === null ? 'absent' : `present(len=${value.length})`;
}

/**
 * Snapshot kehadiran SEMUA kunci dikenali sebagai peta Boolean.
 * Selamat untuk ditulis ke laporan ujian / diagnostik.
 * @returns {Record<string, boolean>}
 */
function getTestKeysSnapshot() {
    const snapshot = {};
    for (const [logicalName, envName] of Object.entries(KNOWN_TEST_VARS)) {
        if (logicalName === 'GEMINI_KEYS') {
            snapshot[envName] = getTestKeyList(logicalName).length > 0;
        } else {
            snapshot[envName] = getTestKey(logicalName) !== null;
        }
    }
    return snapshot;
}

/**
 * Jejak identiti pendek untuk kunci (SHA-256, 8 heks) — membolehkan tes
 * membandingkan "kunci sama/different" tanpa pernah mendedahkan nilai.
 * @param {string} name - Nama logik
 * @returns {string|null} Hash 8 aksara atau null jika kunci tiada
 */
function fingerprintTestKey(name) {
    const value = getTestKey(name);
    if (value === null) return null;
    return crypto.createHash('sha256').update(value).digest('hex').substring(0, 8);
}

module.exports = {
    TEST_ENV_FILENAME,
    KNOWN_TEST_VARS,
    getTestKey,
    getTestKeyList,
    getTestBaseUrl,
    hasTestKey,
    describeTestKey,
    getTestKeysSnapshot,
    fingerprintTestKey
};

# Pelan Pembedahan: Bulk Import Gemini Key Vault (Zero-Network Guardrail)

> **Status:** PROPOSAL — menunggu kelulusan sebelum pembedahan.
> **Skop:** 100% frontend (`public/`) + **ZERO perubahan** kepada laluan enkripsi/rotasi backend (infra sedia ada sudah memenuhi keperluan keselamatan).
> **Keutamaan #1:** Sifar risiko key di-block / IP di-flag oleh Google semasa import.

---

## 1. DAPATAN AUDIT (Ground Truth Sedia Ada)

### 1.1 Laluan Data Key (UI → Redis → Rotation)

| Peringkat | Fail | Bukti Baris | Status |
|---|---|---|---|
| Key 1 (single field) | `public/partials/main.html` | L484 (`#geminiApiKey`) | Wujud |
| Key 2+ (rotation rows) | `public/partials/main.html` | L506–522 (`#geminiApiKeysContainer` → `#geminiApiKeysList`) | Wujud |
| Butang `+ Add Key` | `public/partials/main.html` | L516–518 (`#addGeminiKeyBtn`) | Wujud — titik sisipan Bulk Import |
| Toggle rotation | `public/partials/main.html` | L597–606 (`#geminiKeyRotationEnabled`) | Wujud |
| Pengumpulan keys | `public/config.js` | L9271 `getGeminiApiKeys()` — gabung Key 1 + rows | Wujud |
| Add row DOM | `public/config.js` | L9131 `addGeminiKeyInput(value)` | Wujud (perlu varian batch) |
| Kiraan / had max | `public/config.js` | L9026 `MAX_GEMINI_API_KEYS` (fetch dari `/api/session-stats`), L9250 `updateGeminiKeysCount()` | Wujud |
| Simpan ke session | `public/config.js` | L11270–11272 → `geminiApiKeys` dalam POST body | Wujud |
| Endpoint simpan | `index.js` | L3627 `POST /api/update-session/:token` + L1381 `MAX_CONFIG_BYTES = 120KB` | Wujud |
| Enkripsi at-rest | `src/utils/encryption.js` | L401–405 — **setiap key** dalam `geminiApiKeys[]` dienkripsi berasingan (AES-256-GCM) | Wujud ✓ |
| Sanitasi backend | `src/utils/config.js` | L618–659 — trim, dedup (`seenKeys`), had `MAX_GEMINI_API_KEYS` | Wujud ✓ |
| Rotation engine | `src/services/translationEngine.js` | L503 `_rotateToNextKey()` — bina `GeminiService` baharu setiap rotasi | Wujud ✓ |
| Cooldown / quarantine | `src/utils/sharedCache.js` L281 + `translationEngine.js` L397 | 5 errors → cooldown ~1 jam (Redis, merentas pod) | **Wujud ✓ (Keperluan #2 SUDAH TERLAKSANA)** |
| Key dalam URL Stremio | `index.js` L3646 + `src/utils/providerUrlToken.js` | URL hanya bawa token 32-hex; download URL sealed AES-256-GCM | **Wujud ✓ (Keperluan #3 SUDAH TERLAKSANA)** |
| Auto-detect jenis key | `src/services/gemini.js` | L418–423 `detectKeyType()` — `sk-` → CrazyRouter, selainnya Google | Wujud ✓ |

### 1.2 Dapatan Kritikal Berkaitan Keselamatan

1. **`/api/validate-gemini` (`index.js` L3378) membuat panggilan HTTP SEBENAR ke Google.**
   → Inilah SATU-SATU punaya risiko burst-detection. Bulk import **WAJIB tidak memanggilnya**.
2. **CoD cooldown sedia ada sudah "lazy"**: `_markKeyError()` hanya dicetus bila translation berjalan dan terima 429/503; key yang cooling-down dilangkau secara senyap oleh `_rotateToNextKey()` tanpa probe. → **Tiada hammering, tiada perubahan perlu.**
3. **Payload 120KB mencukupi**: 99 key × ~55 byte ≈ 6KB + JSON overhead ≈ 8KB. Jauh di bawah had.
4. **Mix key Google + CrazyRouter dalam satu array adalah selamat**: setiap rotasi bina `GeminiService` baharu → `detectKeyType()` semula → baseUrl & header auth bertukar dengan betul (`x-goog-api-key` vs `Authorization: Bearer`).
5. **Format key baru Google (`AQ.Ab8...`)**: `detectKeyType()` pulangkan `'google'` → digunakan dengan header `x-goog-api-key` seperti biasa. Tiada perubahan backend.

---

## 2. MODEL ANCAMAN & GUARDRAIL

| Ancaman | Mitigasi Dalam Reka Bentuk |
|---|---|
| Google abuse-detection / IP flag akibat 99 GET `models` serentak | **Zero-network**: parser 100% regex dalam browser. Tiada `fetch()` dalam laluan import. Butang "Test" per-key kekal manual (user-initiated, satu-satu) |
| Key bocor ke URL / referrer / history | Keys hanya dalam POST body `/api/update-session`; URL Stremio bawa token 32-hex sahaja (sedia ada) |
| Key bocor ke localStorage / disk browser | **Tiada persistence client-side** — keys hidup dalam DOM + memory sahaja sehingga "Save" |
| Shoulder-surfing semasa paste | Textarea auto-clear selepas import; preview memaparkan versi bertopeng (`AIzaSy•••••4w`) |
| Ramuan/JS injection dari teks mentah | Parser guna regex token-scan — aksara selain token diabaikan, tiada `innerHTML` dengan teks mentah |
| Log server membocorkan key | Backend sedia ada guna `_redactKey()`; frontend pula **tidak perlu** log nilai penuh |
| Spam session (update berulang) | Import hanya mengisi UI — simpan tetap melalui aliran "Save" sedia ada dengan `sessionUpdateLimiter` (60/jam) |

---

## 3. KEPUTUSAN REKA BENTUK

### 3.1 Regex Pengesanan (Versioned, Tanpa Rangkaian)

```js
// public/js/bulk-key-import.js
const KEY_PATTERNS = [
    { type: 'google-legacy', re: /\bAIzaSy[A-Za-z0-9_-]{33}\b/g },        // 39 aksara
    { type: 'google-new',    re: /\bAQ\.Ab8[A-Za-z0-9_-]{35,}\b/g },      // panjang boleh ubah, anchor AQ.Ab8
    { type: 'crazyrouter',   re: /\bsk-[A-Za-z0-9]{32,64}\b/g }           // sk- + 48 contoh
];
```

**Kenapa token-scan, bukan split-per-baris?** Teks mentah user mungkin bernombor (`1. AIzaSy...`), ber-tab, ber-koma, JSON array, atau bercampur dengan nama/nombor lain. Token-scan regex secara semula jadi mengabaikan semua itu — nombor baris tidak pernah menyertai key kerana `.` dan space bukan sebahagian `[A-Za-z0-9_-]`.

### 3.2 Semantik Import: **MERGE + DEDUP**, Bukan Replace

- Keys sedia ada dalam UI **dikekalkan**; hasil import digabung.
- Dedup dua peringkat: (a) dalam hasil parse, (b) terhadap keys sedia ada UI (`getGeminiApiKeys()`).
- Had muktamad: `MAX_GEMINI_API_KEYS` dari `/api/session-stats` (backend default `Infinity`; jika env ditetapkan, import berhenti di had + amaran).
- Key pertama hasil gabung → field `#geminiApiKey` (Key 1); bakinya → rows `#geminiApiKeysList`.

### 3.3 Cron Router Key (`sk-...`)

Masuk rotation array seperti biasa. Ia akan dilangkau/dipilih secara semula jadi oleh cooldown engine; bila dipilih, `detectKeyType()` tukar laluan ke `cn.crazyrouter.com`. Satu key cukup kerana ia meliputi semua model.

### 3.4 Peraturan Nyah-Aktivasi Rangkaian

Import **TIDAK** akan:
- memanggil `/api/validate-gemini`,
- men-trigger fetch model (`populateGeminiModelDropdowns`),
- auto-save session.

Pengesahan keaslian key tetap berlaku secara **lazy semasa translation** melalui rantaian sedia ada: 429 → `_markKeyError()` → cooldown Redis ~1h → rotasi ke key sihat seterusnya.

---

## 4. FASA PELAKSANAAN (Pembedahan)

### Fasa A — `public/js/bulk-key-import.js` (FAIL BAHARU, modul tulen)

Modul bebas tanpa kebergantungan supaya **boleh di-unit-test melalui Node** (dieksport bersyarat):

```js
(function (root) {
    'use strict';

    const KEY_PATTERNS = [ /* ... seperti 3.1 ... */ ];

    /**
     * Parse teks mentah → { keys: string[], stats: {...} }
     * ZERO network. ZERO DOM. Tulen string-in/array-out.
     */
    function parseBulkKeys(rawText, opts = {}) {
        const text = String(rawText || '');
        const found = [];
        const seen = new Set();
        const existing = new Set(opts.existingKeys || []);
        const maxKeys = Number.isFinite(opts.maxKeys) ? opts.maxKeys : Infinity;
        const stats = {
            scanned: true, duplicatesInText: 0, duplicatesExisting: 0,
            truncated: false, byType: { 'google-legacy': 0, 'google-new': 0, 'crazyrouter': 0 }
        };

        for (const { type, re } of KEY_PATTERNS) {
            re.lastIndex = 0;
            let m;
            while ((m = re.exec(text)) !== null) {
                const key = m[0];
                if (seen.has(key)) { stats.duplicatesInText++; continue; }
                if (existing.has(key)) { stats.duplicatesExisting++; continue; }
                seen.add(key);
                if (found.length >= maxKeys) { stats.truncated = true; break; }
                stats.byType[type]++;
                found.push(key);
            }
        }
        return { keys: found, stats };
    }

    /** Preview bertopeng untuk UI: AIzaSy•••••DI4w */
    function maskKey(key) {
        if (key.length <= 12) return '•'.repeat(key.length);
        return key.slice(0, 8) + '•'.repeat(Math.min(8, key.length - 12)) + key.slice(-4);
    }

    const api = { parseBulkKeys, maskKey, KEY_PATTERNS };
    if (typeof module !== 'undefined' && module.exports) { module.exports = api; } // Node test
    root.SubMakerBulkKeyImport = api;                                              // Browser
})(typeof window !== 'undefined' ? window : globalThis);
```

### Fasa B — `public/partials/main.html` (2 sisipan kecil)

1. **Butang Bulk Import** — dalam flex-row sama dengan `#addGeminiKeyBtn` (L515–519):

```html
<div style="display: flex; justify-content: flex-end; gap: 0.5rem; margin-top: 0.5rem;">
    <button type="button" id="bulkImportKeysBtn" class="btn btn-secondary btn-sm">
        <span>📋</span> <span data-i18n="config.gemini.keyRotation.bulkImport">Bulk Import</span>
    </button>
    <button type="button" id="addGeminiKeyBtn" class="btn btn-secondary btn-sm">
        <span>+</span> <span data-i18n="config.gemini.keyRotation.addKey">Add Key</span>
    </button>
</div>
```

2. **Modal** — sertakan dalam `public/partials/overlays.html` (mengikut corak overlay sedia ada):

```html
<div class="modal-overlay" id="bulkImportModal" style="display:none;" role="dialog" aria-modal="true">
    <div class="modal-box">
        <h3 data-i18n="config.gemini.bulkImport.title">Bulk Import API Keys</h3>
        <p class="label-description" data-i18n="config.gemini.bulkImport.hint">
            Paste any format — numbered lines, mixed text, JSON. Keys are detected locally
            in your browser. No network validation is performed during import.
        </p>
        <textarea id="bulkImportTextarea" rows="10" autocomplete="off" autocapitalize="none"
            autocorrect="off" spellcheck="false" wrap="off"></textarea>
        <div id="bulkImportPreview" class="bulk-import-preview" aria-live="polite"></div>
        <div class="modal-actions">
            <button type="button" id="bulkImportCancelBtn" class="btn btn-secondary">Cancel</button>
            <button type="button" id="bulkImportConfirmBtn" class="btn btn-primary" disabled>
                Import <span id="bulkImportCount"></span>
            </button>
        </div>
    </div>
</div>
```

### Fasa C — `public/css/configure.css` (gaya modal + preview)

- `.bulk-import-preview` — mono font, scroll maksimum ~6 baris, baris bertopeng.
- Nada amaran untuk `stats.truncated` (kuning) dan ringkasan jenis key (badge kecil: `97 Google · 1 Google (baru) · 1 CrazyRouter`).
- Ikut token tema sedia ada (`--surface-light`, `--border`, `--primary`).

### Fasa D — `public/config.js` (3 fungsi + 1 wayar)

1. **`openBulkImportModal()` / `closeBulkImportModal()`** — toggle `display`, fokus textarea, `Escape` & klik-luar untuk tutup.
2. **Preview live** (`input` event pada textarea, *debounce 250ms*):
   ```js
   const result = window.SubMakerBulkKeyImport.parseBulkKeys(text, {
       existingKeys: getGeminiApiKeys(),
       maxKeys: remainingSlot()   // MAX_GEMINI_API_KEYS - getGeminiApiKeys().length
   });
   ```
   Render preview bertopeng + kiraan; `#bulkImportConfirmBtn.disabled = result.keys.length === 0`.
3. **`applyBulkImport(result)`**:
   - Jika `getGeminiApiKeys().length === 0` → key pertama ke `#geminiApiKey`; bakinya `addGeminiKeyInput(key)`.
   - **Varian batch** `addGeminiKeyInputBatch(values)`: bina `DocumentFragment`, **tanpa** `input.focus()` per baris & **satu** `updateGeminiKeysCount()` sahaja di akhir — elak 98× reflow & 98× focus steal.
   - Auto-tick `#geminiKeyRotationEnabled` + `toggleGeminiKeyRotationUI(true)` jika import ≥ 1 key dan rotation belum aktif (UI-only, tiada network).
   - Kosongkan textarea + preview; tutup modal; `showAlert` ringkasan.
   - **SYNC KE SINGLE FIELD**: panggil `syncFirstKeyToSingleInput()` sedia ada (L9119) supaya dropdown model tahu key aktif.
4. **Wayar event** — bersebelahan wayar `addGeminiKeyBtn` sedia ada (L7723–7728).

### Fasa E — i18n (`locales/*.json`)

Tambah kekunci `config.gemini.bulkImport.*` (`title`, `hint`, `importCta`, `cancelCta`, `previewNone`, `previewFound`, `warnTruncated`, `warnDuplicates`). Semua panggilan `tConfig()` disertakan fallback Inggeris supaya modal berfungsi walaupun locale lama.

### Fasa F — `public/configure.html` (1 baris)

Sisip `<script src="/js/bulk-key-import.js"></script>` **sebelum** `/config.js` (mengikut corak pemuatan `combobox.js` dll.), dan daftar dalam senarai aset cache `index.js` L2401 `configUiAssets` jika diperlukan (semak corak sw.js/configUiAssets).

---

## 5. KES-TEPI YANG DILIPUTI

| Kes | Perlakuan |
|---|---|
| Teks kosong / tiada key sah | Butang Import dinyahaktif; preview: "0 keys found" |
| 99 key + had `MAX_GEMINI_API_KEYS` ditetapkan | Import berhenti di had; amaran `warnTruncated` + statistik terpotong |
| Duplicate dalam teks & vs UI | Dikira dalam `stats`, tidak diimport; amaran lembut |
| Format bernombor `1. AIzaSy…` / JSON / koma / tab | Regex token-scan abaikan automatik |
| Key baru `AQ.Ab8…` panjang berbeza | `{35,}` fleksibel, anchor `AQ.Ab8` menghalang false-positive |
| Paste semula selepas import | `duplicatesExisting` → 0 diimport (idempotent) |
| Modal tertutup tanpa import | Textarea dikosongkan (tiada kekal dalam DOM/memory lebih lama dari perlu) |
| Import bila rotation OFF | Auto-aktifkan toggle + container (UI sahaja) |

---

## 6. PELAN UJIAN

1. **Unit test baharu** `public/js/bulk-key-import-parser-regression.test.js` (Node, guna `module.exports` guard):
   - 3 format (lama/baru/sk-), campuran bernombor, JSON, tab/CRLF;
   - dedup dalam-teks & vs `existingKeys`;
   - had `maxKeys` + `stats.truncated`;
   - `maskKey()` tidak mendedahkan >8 aksara awal/4 akhir.
2. **Regresi sedia ada**: `npm test` — baseline wajib **92 PASS / 0 FAIL** (tiada fail backend diubah → tiada kesan sampingan dijangka).
3. **Ujian manual smoke**: import 99 key → Save → semak Redis menyimpan `geminiApiKeys` terenkripsi (`looksEncrypted` = `1:iv:tag:ct` 4 bahagian) → muat semula page → 99 rows terhydral melalui L10796–10803.

---

## 7. RISIKO & ROLLBACK

- **Risiko hampir sifar pada backend**: tiada fail `src/` atau `index.js` (kecuali 1 baris senarai aset statik, pilihan) disentuh.
- **Rollback**: buang 1 baris `<script>` + fail `bulk-key-import.js` + blok modal; `config.js` berfungsi seperti asal kerana semua cara baharu berpagar pada kewujudan `window.SubMakerBulkKeyImport` (feature-detect, bukan hard dependency).
- **Keserasian tokenVault UI**: modal berasingan daripada Token Vault rail; tiada pertindihan ID/selectors.

---

## 8. RINGKASAN PEMENUHAN 4 KEPERLUAN USER

| # | Keperluan | Cara Dipenuhi |
|---|---|---|
| 1 | Zero-Network Syntax Validation | Parser regex tulen dalam browser; import tidak memanggil sebarang endpoint; butang Test kekal manual per-key |
| 2 | Lazy Failover / Cooldown | **Sudah wujud** — `sharedCache` Redis (5-error threshold, ~1h TTL), `_rotateToNextKey` langkau key cooling-down tanpa probe. Tiada ubah |
| 3 | Session Vault Protection | **Sudah wujud** — POST body → `encryptConfig` AES-256-GCM per key → Redis; URL Stremio bawa token 32-hex sahaja. Tiada ubah |
| 4 | Clean UI Integration | Butang `Bulk Import` bersebelahan `+ Add Key`; modal textarea; auto-populate rotation array; preview bertopeng |

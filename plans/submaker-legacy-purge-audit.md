# 🔍 LAPORAN AUDIT: PENYINGKIRAN MAZHAB LEGASI SUBMAKER

**Status:** AUDIT SELESAI — MENUNGGU KELULUSAN. ZERO KOD DIMODIFIKASI.
**Tarikh:** 2026-09-25
**Audiitor:** GLM 5.3 (Backend & Architect Lead)
**Mandat:** Penyingkiran Mazhab Legasi SubMaker (SubFaber = enjin tunggal)

---

## 1. RINGKASAN FAIL TERCEMAR MAZHAB SUBMAKER LAMA

| # | Fail | Tahap Pencemaran | Kategori |
|---|---|---|---|
| 1 | [`src/services/translationEngine.js`](../src/services/translationEngine.js) | SEDANG-TINGGI | Cabang dual-engine + prompt legacy dalam komen |
| 2 | [`src/utils/config.js`](../src/utils/config.js) | SEDANG | Normalisasi dual-flag + env fallback legacy |
| 3 | [`index.js`](../index.js) | SEDANG | Per-request override untuk kedua-dua flag legacy |
| 4 | [`public/partials/main.html`](../public/partials/main.html) | TINGGI (UI) | 3 elemen form legasi + label "SubMaker Database" |
| 5 | [`public/config.js`](../public/config.js) | TINGGI (UI) | Rehydration/save untuk 3 elemen legasi |
| 6 | [`src/utils/fileUploadPageGenerator.js`](../src/utils/fileUploadPageGenerator.js) | SEDANG (UI) | Toggle SubFaber + Batch Context di halaman File Upload |
| 7 | [`src/utils/toolboxPageGenerator.js`](../src/utils/toolboxPageGenerator.js) | SEDANG (UI) | Toggle Batch Context di Embedded/AutoSubs steps |
| 8 | [`src/utils/parallelTranslation.js`](../src/utils/parallelTranslation.js) | RENDAH | Guard `enableBatchContext` di 2 lokasi |
| 9 | [`src/utils/validation.js`](../src/utils/validation.js) | RENDAH | Joi schema `enableBatchContext` legacy |
| 10 | [`locales/*.json`](../locales/en.json) (5 fail) | SEDANG | i18n keys untuk toggle legasi + "SubMaker Database" |
| 11 | [`src/utils/smdbPageGenerator.js`](../src/utils/smdbPageGenerator.js) | RENDAH (branding) | Tajuk halaman "SubMaker Database" |
| 12 | [`src/utils/smdbCache.js`](../src/utils/smdbCache.js) | RENDAH (branding) | Komen header |
| 13 | [`src/storage/StorageAdapter.js`](../src/storage/StorageAdapter.js) | RENDAH (branding) | Komen `SMDB: 'SubMaker Database'` |
| 14 | [`src/services/telegramBot.js`](../src/services/telegramBot.js) | RENDAH (branding) | 2 mesej "SubMaker" |
| 15 | [`public/js/panel-nav.js`](../public/js/panel-nav.js), [`public/js/quick-setup.js`](../public/js/quick-setup.js), [`public/js/subtitle-menu.js`](../public/js/subtitle-menu.js), [`public/js/bulk-key-import.js`](../public/js/bulk-key-import.js), [`public/js/config-page-state.js`](../public/js/config-page-state.js) | RENDAH (branding) | Global names + teks "SubMaker" |

---

## 2. TEMUAN TERPERINCI (BEDAH SIASAT)

### 2.A CABANG KOD BACKEND — `translationEngine.js`

**A1. Cabang dual-engine `if (this.subfaberEnabled)` vs legacy — 5 lokasi aktif:**

| Lokasi | Kod | Fungsi |
|---|---|---|
| [L164](../src/services/translationEngine.js:164) | `this.subfaberEnabled = this.advancedSettings.subfaberEnabled === true` | Flag dual-engine di constructor |
| [L172-174](../src/services/translationEngine.js:172) | `if (this.subfaberEnabled) { this.batchSize = 50; }` | Batch size 50 (SubFaber) vs 200 (legacy `UNIVERSAL_BATCH_SIZE`) |
| [L741](../src/services/translationEngine.js:741) | `if (this.subfaberEnabled && !this.isNativeBatchProvider)` | Guard Fasa 0 Pre-Flight |
| [L1142-1144](../src/services/translationEngine.js:1142) | `if (this.subfaberEnabled ...) return this._prepareSubfaberContext(...)` | Routing context builder SubFaber vs legacy |
| [L2231](../src/services/translationEngine.js:2231) | `if (this.subfaberEnabled && context && ...)` | Guard blok `<previous_content>`/`<subsequent_content>` dalam `prepareBatchXml()` |

**A2. Legacy context path yang masih hidup (mati hanya bila SubFaber ON):**

- [`prepareContextForBatch()` L1145-1194](../src/services/translationEngine.js:1145) — seluruh legacy `<m>` memory builder (backward-only, `contextSize` window, `batchIndex === 0` skip). **Bertembung terus** dengan `_prepareSubfaberContext()` (prev 3 / next 2 hardcode).
- [`prepareBatchXml()` L2267-2278](../src/services/translationEngine.js:2267) — blok `[PREVIOUS_TRANSLATION_MEMORY]` + `<m id><src><dst>` — hanya tercapai bila SubFaber OFF.
- [`translateBatch()` L1466-1504](../src/services/translationEngine.js:1466) — auto-chunk second-half context builder guna `this.contextSize` + `this.enableBatchContext` guard.
- [L1501](../src/services/translationEngine.js:1501) — `secondHalfContext` legacy untuk auto-split path.

**A3. Prompt legacy 7-rule — SUDAH MATI tetapi bangkai masih ada:**

- Prompt aktif ([L2314-2340](../src/services/translationEngine.js:2314)) ialah **SubFaber tulen** (VideoLingo persona + `<translation_principles>` + `<answer>` kontrak) — dijana TANPA mengira flag (test [`subfaber-context-regression.test.js:282`](../src/services/subfaber-context-regression.test.js:282) mengesahkan "pure SubFaber prompt is the ABSOLUTE DEFAULT").
- **BANGKAI:** Blok komen [L2342-2412](../src/services/translationEngine.js:2342) — 70 baris petikan penuh 7-rule NEVER/INSTEAD rulebook + `[OUTPUT_FORMAT]` anchor lama, dikekalkan "untuk sejarah sahaja". Ini leteran token lapuk dalam bentuk komen — perlu dibuang.
- Komen rujukan Rule 4/7-rule masih bertaburan: [L2225](../src/services/translationEngine.js:2225), [L2426-2427](../src/services/translationEngine.js:2426).

**A4. Logik batching jika SubFaber dijadikan enjin TUNGGAL:**

- Semasa: `getBatchSizeForModel()` ([L101-128](../src/services/translationEngine.js:101)) resolve `TRANSLATION_BATCH_SIZE` env → `UNIVERSAL_BATCH_SIZE=200`, kemudian constructor menindih kepada 50 bila SubFaber ON ([L172-174](../src/services/translationEngine.js:172)).
- Pelan tunggal: **hardcode `SUBFABER_BATCH_SIZE = 50`** sebagai satu-satunya batch size. Buang `UNIVERSAL_BATCH_SIZE`, buang `getBatchSizeForModel()`, buang override conditional. `TRANSLATION_BATCH_SIZE` env var boleh dikekalkan sebagai escape hatch opsional ATAU dibuang sepenuhnya (keputusan Lead).
- `singleBatchMode` (auto-split 120k token) — **kekalkan**; ia orthogonal (saiz chunk, bukan konteks) dan digunakan oleh File Upload + Toolbox UI.

### 2.B CONFIG ENGINE — `src/utils/config.js`

- [L559](../src/utils/config.js:559): `subfaberEnabled: advSettings.subfaberEnabled !== false` — normalisasi "default ON, explicit false dihormati". Selepas purge: field ini boleh **dibuang terus** (atau dikunci `subfaberEnabled: true` untuk satu release transition — keputusan Lead).
- [L1058-1059](../src/utils/config.js:1058): env fallback `ENABLE_BATCH_CONTEXT` + `BATCH_CONTEXT_SIZE` — **dibuang**.
- `enableBatchContext`/`contextSize` tidak dinormalisasi dalam blok `mergedConfig.advancedSettings` (L548-564) — mereka hanya pass-through via spread `...advSettings`. Selepas purge: tambah `delete` eksplisit atau biarkan Joi strip.

### 2.C INDEX.JS — Per-request override plumbing

- [L4177-4198](../index.js:4177): `enableBatchContextRequested` + forwarding — **dibuang** (File Upload API).
- [L4181-4203](../index.js:4181): `subfaberRequested` + forwarding — **dibuang** (atau dikunci true).
- [L6441-6490](../index.js:6441): Embedded Translate API — `enableBatchContext` param + `hasLegacyBatchContext` + assignment — **dibuang**.
- [L7480-7488](../index.js:7480): Auto-Translate — sama pola — **dibuang**.
- [L7648-7653](../index.js:7648): cache metadata matching `meta.enableBatchContext` — **dibuang** (cache key tidak lagi berbeza).
- [L8125-8127](../index.js:8125): response metadata — **dibuang**.

### 2.D FRONTEND & CONFIG ENGINE

**Elemen HTML untuk dibuang terus:**

| Elemen | Lokasi | Nota |
|---|---|---|
| Toggle `#subfaberEnabled` | [`main.html:1424-1434`](../public/partials/main.html:1424) | SubFaber ON kekal — toggle jadi placebo |
| Toggle `#enableBatchContext` | [`main.html:1411-1422`](../public/partials/main.html:1411) | Redundant dengan sliding window SubFaber |
| Input `#contextSize` + `#contextSizeGroup` | [`main.html:1833-1842`](../public/partials/main.html:1833) | Placebo — SubFaber hardcode prev 3 / next 2 |
| Label "SubMaker Database" | [`main.html:1436-1457`](../public/partials/main.html:1436) | Rebrand → "SubFaber Database" (databaseMode select kekal) |

**Rujukan JS `public/config.js` untuk dibuang/selaraskan:**

- [L1544-1545](../public/config.js:1544): defaults `enableBatchContext`/`contextSize` — buang.
- [L6621-6646](../public/config.js:6621): `updateBypassCacheForAdvancedSettings()` — `batchCtxChanged`/`ctxSizeChanged` logic — buang.
- [L8077-8100](../public/config.js:8077): event listeners toggle batch context + context size — buang.
- [L11523-11535](../public/config.js:11523): rehydration batch context + context size — buang.
- [L11539-11542](../public/config.js:11539): rehydration subfaber — buang (atau kunci true).
- [L11875-11877](../public/config.js:11875): save path ketiga-tiga field — buang.
- [L1599](../public/config.js:1599), [L6444-6445](../public/config.js:6444): localStorage keys `submaker_*` — **kekalkan** (data pengguna sedia ada; rename = kehilangan preferensi).

**Halaman File Upload ([`fileUploadPageGenerator.js`](../src/utils/fileUploadPageGenerator.js)):**

- Toggle `#subfaberEnabled` [L2535-2543](../src/utils/fileUploadPageGenerator.js:2535) — **buang**; SSE opt-in mesti sentiasa aktif (`useSse = true` kekal, atau berdasarkan `translationDefaults.subfaberEnabled` yang kini sentiasa true).
- Toggle `#enableBatchContext` [L2525-2533](../src/utils/fileUploadPageGenerator.js:2525) — **buang**.
- Defaults plumbing [L93-97](../src/utils/fileUploadPageGenerator.js:93), [L157-162](../src/utils/fileUploadPageGenerator.js:157), [L3085-3090](../src/utils/fileUploadPageGenerator.js:3085), [L4338-4367](../src/utils/fileUploadPageGenerator.js:4338) — selaraskan.
- Toggle `#singleBatchMode` [L2515-2523](../src/utils/fileUploadPageGenerator.js:2515) — **kekalkan** (fungsi berbeza: saiz chunk).

**Toolbox ([`toolboxPageGenerator.js`](../src/utils/toolboxPageGenerator.js)):**

- Toggle `#batch-context-toggle` (Embedded step 2) [L3320-3322](../src/utils/toolboxPageGenerator.js:3320), [L4101](../src/utils/toolboxPageGenerator.js:4101) — **buang**.
- Toggle `#autoBatchContext` (AutoSubs) [L9807-9810](../src/utils/toolboxPageGenerator.js:9807), [L6195](../src/utils/toolboxPageGenerator.js:6195) — **buang**.
- Plumbing [L5640-5641](../src/utils/toolboxPageGenerator.js:5640), [L6045-6047](../src/utils/toolboxPageGenerator.js:6045), [L7186-7188](../src/utils/toolboxPageGenerator.js:7186), [L8192-8194](../src/utils/toolboxPageGenerator.js:8192), [L8510-8512](../src/utils/toolboxPageGenerator.js:8510) — selaraskan.

**i18n keys (5 lokal) untuk dibuang:** `config.advancedGemini.subfaber.*`, `config.advancedGemini.batchContext.*`, `config.advancedGemini.contextSize.*`. Untuk rebrand: `config.translationSettings.database.*` ("SubMaker Database" → "SubFaber Database").

### 2.E BRANDING "SubMaker" SISA (tidak memecah fungsi, wajib selaras mandat rebrand)

- [`smdbPageGenerator.js`](../src/utils/smdbPageGenerator.js:326) — title tag + h1 "SubMaker Database".
- [`smdbCache.js`](../src/utils/smdbCache.js:2), [`StorageAdapter.js:235`](../src/storage/StorageAdapter.js:235) — komen.
- [`telegramBot.js:393, 673`](../src/services/telegramBot.js:393) — mesej Telegram "SubMaker".
- [`public/js/`](../public/js/panel-nav.js): `window.SubMakerConfigPageState`, `window.SubMakerBulkKeyImport`, `window.SubMakerGeminiModelUi`, footer "SubMaker" ([subtitle-menu.js:1228](../public/js/subtitle-menu.js:1228)), changelog parser "## SubMaker v" ([panel-nav.js:360](../public/js/panel-nav.js:360) — **HATI-HATI**: regex ini mem-parse CHANGELOG.md sejarah; menukar ia memecah paparan changelog lama).
- [`toolboxPageGenerator.js:1380`](../src/utils/toolboxPageGenerator.js:1380) — butang "SubMaker Database".

---

## 3. KESAN KEPADA TEST SUITE

| Fail ujian | Ketergantungan legacy | Tindakan |
|---|---|---|
| [`subfaber-context-regression.test.js:44-55`](../src/services/subfaber-context-regression.test.js:44) | Assert `subfaberEnabled` default OFF + strict-boolean reading | **Tulis semula**: selepas purge, flag mungkin dibuang — assert context builder sentiasa SubFaber |
| [`subfaber-context-regression.test.js:114-118`](../src/services/subfaber-context-regression.test.js:114) | Assert batch size 200 bila OFF | **Tulis semula**: batch size sentiasa 50 |
| [`subfaber-context-regression.test.js:235-245`](../src/services/subfaber-context-regression.test.js:235) | Test "legacy `<m>` memory block still works when SubFaber OFF" | **BUANG** — laluan legacy tidak wujud lagi |
| [`subfaber-context-regression.test.js:282-302`](../src/services/subfaber-context-regression.test.js:282) | Test "pure SubFaber prompt is ABSOLUTE DEFAULT" dengan `subfaberEnabled: false` | **Kekal/selaraskan** — prompt memang sudah flag-agnostic; hanya buang param `subfaberEnabled: false` |
| [`subfaber-preflight-regression.test.js`](../src/services/subfaber-preflight-regression.test.js) | Tiada — semua test SubFaber-native | **Kekal 100%** |
| [`gemini-auth-model-regression.test.js`](../src/services/gemini-auth-model-regression.test.js) | Tiada kaitan flag | **Kekal** |
| 15 fail regression lain | Tiada kaitan | **Kekal** |

**Baseline selepas purge:** 149 tests → ~145-147 selepas buang/tulis semula 3-4 test legacy. Mesti kekal 100% PASS (0 FAIL).

---

## 4. PELAN TINDAKAN PEMOTONGAN (SELEPAS KELULUSAN)

### Fasa 1 — Backend core (hari 1)
1. `translationEngine.js`: buang bangkai komen 7-rule (L2342-2412), buang legacy path `prepareContextForBatch` (L1145-1194) — jadikan `_prepareSubfaberContext` satu-satunya, buang guard `subfaberEnabled` di 5 lokasi (sentiasa true), hardcode `SUBFABER_BATCH_SIZE = 50`, buang `UNIVERSAL_BATCH_SIZE` + `getBatchSizeForModel()`, buang `enableBatchContext`/`contextSize` fields, selaraskan auto-chunk second-half context (L1466-1504) untuk guna sliding window SubFaber.
2. `config.js`: buang `subfaberEnabled` normalization (atau kunci true), buang env `ENABLE_BATCH_CONTEXT`/`BATCH_CONTEXT_SIZE`.
3. `index.js`: buang per-request override plumbing di 4 call sites + cache metadata matching.
4. `parallelTranslation.js`: guard `enableBatchContext` → panggil context builder terus.
5. `validation.js`: buang `enableBatchContext` dari Joi.

### Fasa 2 — Frontend (hari 1-2)
6. `main.html`: buang 3 elemen form legasi, rebrand "SubMaker Database" → "SubFaber Database".
7. `config.js` (public): buang rehydration/save/listener untuk 3 elemen, selaraskan `updateBypassCacheForAdvancedSettings()`.
8. `fileUploadPageGenerator.js`: buang 2 toggle, kunci SSE opt-in aktif.
9. `toolboxPageGenerator.js`: buang 2 toggle Batch Context + plumbing.
10. `locales/*.json` (5 fail): buang keys legasi, rebrand database keys.

### Fasa 3 — Branding sisa + tests (hari 2)
11. Rebrand teks "SubMaker" → "SubFaber" (smdbPageGenerator, smdbCache, StorageAdapter komen, telegramBot, toolbox button, subtitle-menu footer, quick-setup copy).
12. Tulis semula 3-4 test legacy dalam `subfaber-context-regression.test.js`.
13. `npm test` — sahkan 100% PASS.

### Yang DIKEKALKAN
- `singleBatchMode` (saiz chunk, bukan konteks) + semua UI-nya.
- `mismatchRetries` + 3-pass retry + Smart Preamble Scrubber + parser `<s id>` + anchor prefill.
- localStorage keys `submaker_*` (data pengguna).
- Regex changelog parser `## SubMaker v` (mem-parse sejarah CHANGELOG.md — menukar ia memecah paparan entri lama).
- `databaseMode` select (Use/Bypass) — hanya label di-rebrand.
- SSE branch + Pre-Flight HUD + Parity Monitor + Dwi-Panel (kini sentiasa aktif).

---

## 5. RISIKO PEMECahan KOD & MITIGASI

| Risiko | Tahap | Mitigasi |
|---|---|---|
| Config lama pengguna membawa `subfaberEnabled: false` tersimpan di Redis → selepas purge field diabaikan, enjin jadi SubFaber — **ini dikehendaki** (set-and-forget) | Rendah | Tiada tindakan; dokumentasikan dalam CHANGELOG |
| Cache translation lama di-SMDB dengan metadata `enableBatchContext` — matching metadata dibuang → cache hit rate berubah | Rendah | Metadata matching di-buang di kedua-dua belah (write+read); entri lama masih hit melalui hash+lang key |
| `parallelTranslation.js` (Dev Mode) memanggil `prepareContextForBatch` dengan signature lama | Sederhana | Selaraskan kedua-dua call site (L71, L164) untuk laluan SubFaber terus |
| Test `subfaberEnabled defaults OFF` gagal selepas flag dibuang | Pasti berlaku | Tulis semula test dalam Fasa 3 (sudah dirancang) |
| Toolbox Embedded/AutoSubs JS rujuk `els.batchContext` selepas HTML dibuang | Sederhana | Null-check sedia ada (`if (els.batchContext)`) melindungi, tetapi buang rujukan bersih dalam Fasa 2 |
| Off-by-one regression berulang (postmortem v2) jika anchor/scrubber diusik | Tinggi | **Pembedahan ini TIDAK menyentuh** parser/scrubber/anchor — hanya context builder + flag plumbing |
| Telegram bot + halaman SMDB kehilangan identiti jika rebrand terlepas | Rendah | Audit grep akhir `submaker` (case-insensitive) sebelum commit |
| `TRANSLATION_BATCH_SIZE` env var di-VPS production tidak lagi berkesan | Sederhana | Kekalkan env var sebagai override sahaja ATAU maklumkan dalam CHANGELOG (keputusan Lead) |

---

## 6. KEPUTUSAN YANG PERLU KELULUSAN LEAD

1. **Field `subfaberEnabled` dalam config:** buang terus (enjin tunggal, tiada flag) ATAU kunci `true` selama satu release untuk transition? → **Syorkan: buang terus** (mandat "set-and-forget").
2. **`TRANSLATION_BATCH_SIZE` env var:** kekalkan sebagai escape hatch ATAU buang? → **Syorkan: buang** — hardcode 50 (Golden Standard).
3. **Regex changelog `## SubMaker v`** di panel-nav.js: kekal (mem-parse sejarah) ATAU migrate CHANGELOG.md sepenuhnya? → **Syorkan: kekal** sehingga CHANGELOG di-migrate.
4. **localStorage keys `submaker_*`:** kekal (data pengguna) ATAU migrate dengan fallback baca-legacy? → **Syorkan: kekal** — kos rename tiada nilai.

---

**LAPORAN AUDIT SELESAI — ZERO KOD DIMODIFIKASI. MENUNGGU KELULUSAN PENUH SEBELUM PEMBEDAHAN DIMULAKAN.**

# Pelan Pembedahan v3.41.3 — Mengunci `no-undef`

> **Status:** DILULUSKAN Owner dan DILAKSANAKAN sepenuhnya dalam v3.41.3 (lihat `CHANGELOG.md` dan `docs/SESSION_LEDGER.md`). Semasa dilaksanakan, dua keputusan tambahan diluluskan: empat defek sebenar yang asalnya diklasifikasi sebagai "konfigurasi sahaja" (D1–D4) **dibaiki**, bukan diisytihar sebagai global; dan devDependencies dipasang secara tempatan. Semakan senarai dalam §6 telah selesai.
> **Disediakan:** 2026-11-26, atas arahan Owner ("buat plan pembedahan penuh dulu untuk aku review").
> **Siapa yang buat:** Pelan disediakan oleh sesi perancangan; dilaksanakan oleh sesi berasingnya (SubFaber Principal Engineer) atas arahan Owner. Penyimpangan daripada draf asal direkodkan dalam §2.1 dan §3 analisis risiko.
> **Parent HEAD:** `ae5b7108` (v3.41.2, CI hijau Run `45822470973`).

---

## 0. Ringkasan Satu Perenggan

ESLint dalam projek ini ada fungsi untuk tangkap "pemboleh ubah yang ditulis tapi tak wujud" — nama dia `no-undef`. Fungsi itu **belum pernah dihidupkan**. Akibatnya tiga pepijat `ReferenceError` dah terlepas ke produksi. Ketiga-tiga dah dibaiki (v3.41.1 dan v3.41.2), tapi **pintu masuknya masih terbuka**. Pembedahan ini menutup pintu itu: hidupkan `no-undef: 'error'` supaya pepijat kelas ini mustahil lulus senyap lagi.

---

## 1. Latar Belakang — Kenapa Ini Penting

**Bukti ia berlaku (3 kali, semua dah dibaiki):**

| # | Pepijat | Punca | Kesan | Dibaiki |
|---|---|---|---|---|
| 1 | `badge` dalam `renderRegistryPage()` | pemboleh ubah dirujuk sebelum diisytiharkan | Senarai sarikata Telegram gagal senyap, `POSTS_SENT=0` | v3.41.1 |
| 2 | `translationGen` | diisytiharkan dalam `handleTranslation()`, digunakan dalam fungsi *saudara* `performTranslation()` | Semua tulisan cache produksi dilempar `ReferenceError` **lepas token dibelanja** | v3.41.1 |
| 3 | `geminiAuthFailureCacheKey` | `const` dalam blok `try`, dirujuk dalam blok `catch` bersaudara | Permintaan `/api/validate-gemini` tergantung; cache kegagalan-auth tak tertulis | v3.41.2 |

**Kenapa semua alat semak kantoi:** `node --check` dan ESLint hanya semak *sintaks*. Rujukan kepada pemboleh ubah yang tak wujud ialah sintaks yang sah — ia hanya ranap masa runtime. Satu-satunya cara tangkap awal ialah `no-undef`.

**Keadaan semasa:** 3 pin sumber dah wujud dalam `src/utils/no-undef-scope-regression.test.js` (ND-1, ND-2, ND-3). Ia jaga **kes yang dah diketahui sahaja** — ia tak jaga kes baharu. Pembedahan ini menukar daripada "jaga 2 kes" kepada "jaga semua kes".

---

## 2. Skop — Apa Yang Kena Buat

### 2.1 Bilangan Sebenar (disahkan pada pokok semasa)

Audit penuh (`npx eslint --rule "no-undef:error"`) jumpa **2,624 lintasan** pada **128 fail**. Selepas isytihar globals yang sah, baki ialah **277**. Pecahan:

| # | Punca | Kiraan | Kena ubah kod? | Risiko |
|---|---|---|---|---|
| **A** | Fungsi pelayar web yang dibenamkan melalui `.toString()` | **212** | **Tidak** — konfigurasi sahaja | Hampir sifar |
| **B** | `window.` globals + satu fungsi tempatan | **5** | **Tidak** — konfigurasi sahaja | Hampir sifar |
| **C** | Pengecam Telegram — **DUA fungsi berbeza, bukan satu corak** | **55** | **Ya** | Sederhana — lihat §2.3 |
| **D** | Bug sebenar | **1** | Sudah dibaiki (v3.41.2) | — |

**Jumlah kerja kod betul: 55 baris dalam 2 fungsi.** 217 daripada 277 (78%) ialah kerja konfigurasi.

> **Pembetulan terhadap penerangan ringkas yang diberi kepada Owner:** 55 itu *bukan* "satu corak seragam diulang 55 kali". Rujukan yang dilindungi `typeof` dilindungi oleh `typeof` pada **baris sebelumnya**, bukan pada baris yang sama. Kiraannya tepat; penerangan pendeknya tak tepat. Butiran dalam §2.3.

### 2.2 Kategori A & B — Konfigurasi (217 lintasan, risiko hampir sifar)

**Apa masalahnya:** `src/utils/toolboxPageGenerator.js` membina fungsi `autoSubsRuntime()` (baris 6302) dan **membenamkannya sebagai teks** ke dalam HTML melalui `.toString()` (baris 10565). Fungsi itu dijalankan dalam **pelayar**, bukan dalam Node. Jadi `document`, `window`, `PAGE` dan lain-lain ialah globals pelayar yang sah — tapi ESLint memeriksanya seolah-olah kod Node, jadi ia menganggap ia tak wujud.

**Cara betul:** beritahu ESLint bahawa fail itu mengandungi kod pelayar. **Jangan** tambah nama itu ke globals Node — itu akan membungkam pepijat sebenar merata-rata.

**Konfigurasi dalam `eslint.config.mjs`:**

- Nyatakan globals Node (`process`, `Buffer`, `require`, `__dirname`, `console`, dan lain-lain) untuk semua fail JS.
- Tambah globals pelayar (`document`, `window`, `localStorage`, dan lain-lain) **hanya untuk `public/**`** dan untuk fail penjana yang membenamkan skrip.
- **Jangan** guna pakej `globals` npm — tiada kebergantungan baharu (invarian SSOT). Isytihar secara eksplisit.
- Abaikan `plans/redesign-backup/**` dan `plans/prompt-refactor-backup/**` — snapshot sandaran yang tak pernah dimuatkan, bukan kod aktif.

**Kerja dah separuh siap:** konfigurasi ini dah ditulis dan **disimpan dalam `stash@{0}`** ("v3.41.3-wip: eslint no-undef globals config"). Sesi baharu mula dengan `git stash pop` — jangan tulis semula dari kosong.

### 2.3 Kategori C — Dua Fungsi Telegram (55 lintasan, bahagian berisiko)

Ini **satu-satunya** bahagian yang menyentuh logik aplikasi. Ia berada dalam laluan yang membina laporan Telegram selepas terjemahan siap.

**Lokasi (disahkan pada pokok semasa, selepas v3.41.2):**

| Fail | Baris | Laluan |
|---|---|---|
| `index.js` | 9008–9066 | xEmbed (`/api/translate-embedded`) |
| `src/handlers/subtitles.js` | 6985–7048 | terjemahan biasa (`performTranslation`) |

**Ini DUA fungsi berbeza — bukan satu corak yang diduplikasi.** Dua perbezaan yang mesti dihormati:

1. **`subtitles.js` ada `activeApiKey`** (baris 6985): `let detectedKeys = activeApiKey ? [activeApiKey] : [];`
   **`index.js` takde** (baris 9008): `let detectedKeys = [];`
2. **`subtitles.js` ada `translationEngine` dan `geminiService` dalam skop** (baris 7007) — objek yang benar-benar wujud.
   **`index.js` merujuk nama yang sama, tapi objek itu TAK wujud dalam skop fungsi tersebut.**

**Ini menjelaskan kenapa rantaian `typeof` wujud:** seseorang salin-tampal blok ini dan guna `typeof` untuk sorok hakikat bahawa separuh daripada nama itu tak wujud di situ. Jangan tulis semula dengan andaian ia seragam — ia akan membuang rujukan yang sah atau membiarkan yang tak sah.

**Nama yang dirujuk (semuanya dilindungi `typeof` pada baris sebelumnya):**
`config`, `userConfig`, `geminiApiKeys`, `geminiApiKey`, `apiKey`, `translationEngine`, `geminiService`, `teleMsg`, `telegramMessage`, `message`, `caption`, `text`, `walletSection`.

**Pendekatan selamat (disyorkan): tukar kepada penyelesai eksplisit.**

Bukan buang `typeof` dan berharap nama itu wujud. Sebaliknya:

```js
// SEBELUM (index.js:9008–9024) — 13 nama dirujuk; sebahagiannya tak wujud dalam skop
let detectedKeys = [];
if (typeof config !== 'undefined') { /* guna config */ }
if (typeof userConfig !== 'undefined') { /* guna userConfig */ }
if (typeof geminiApiKeys !== 'undefined') { /* guna geminiApiKeys */ }

// SELEPAS — satu penyelesai; hanya nama yang BETUL-BETUL wujud dalam skop
const detectedKeys = resolveDetectedKeys({
    config: typeof config !== 'undefined' ? config : null,
    userConfig: typeof userConfig !== 'undefined' ? userConfig : null
});
```

**Kenapa ini selamat:** tingkah laku tak berubah bagi setiap nama yang benar-benar wujud. Bagi nama yang tak wujud, `typeof` masih memulangkan `'undefined'` tanpa dilempar — jadi hasilnya sama seperti sebelum (tiada kunci dikesan). Yang berubah cuma: nama yang tak wujud **tak lagi dirujuk secara terus**, jadi `no-undef` tak melaporkannya.

**Peraturan keras untuk sesi baharu:**

- Jangan ubah tingkah laku. Jika sesuatu nama tak wujud dalam skop, kekalkan `undefined` — jangan tukar kepada `null` atau `[]` kalau itu mengubah hasil.
- Semak setiap nama **terhadap skop fungsi sebenar**, bukan terhadap fungsi kembar.
- **Jangan** isytihar `config`, `message`, atau `text` sebagai globals Node — itu akan membungkam pepijat sebenar merata-rata (dilarang Owner).
- **Jangan** guna `/* eslint-disable no-undef */` untuk sorok (dilarang Owner).

---

## 3. Analisis Risiko

| Bahagian | Risiko | Sebab |
|---|---|---|
| A & B (konfigurasi) | **Hampir sifar** | Tiada logik berubah. Cuma beri tahu ESLint apa yang sah. |
| C — `subtitles.js` | **Rendah** | `activeApiKey`, `translationEngine`, `geminiService` betul-betul wujud dalam skop — penyelesai boleh guna terus. |
| C — `index.js` | **Sederhana** | Sebahagian nama tak wujud dalam skop. Mesti pastikan penyelesai tak ubah hasil. |

**Batas yang mesti Owner tahu (jujur):**

- **Ujian tingkah laku Telegram lemah.** Tiada ujian yang betul-betul hantar laporan Telegram. Jadi jaring keselamatan ialah ujian sedia ada plus semakan teliti, **bukan** ujian baharu yang khusus. Kalau tersilap, ia mungkin tak nampak dalam ujian — hanya nampak bila Owner guna bot itu.
- **Cadangan ujian baharu:** tambah satu ujian yang panggil fungsi pembina laporan dengan nama yang **tak** wujud dalam skop, dan tegaskan ia tak dilempar. Ini akan jaga kes baharu, bukan cuma kes yang diketahui.

---

## 4. Pelan Pelaksanaan — 5 Peringkat, RED → GREEN → PIN

> Setiap peringkat: tulis ujian **dulu**, pastikan MERAH, baru ubah kod, pastikan HIJAU, **pin** dengan ujian tetap.

### Peringkat 1 — Konfigurasi (A & B) — Selamat

1. `git stash pop` → dapat semula `eslint.config.mjs` yang dah separuh siap.
2. Sahkan semua 217 lintasan A & B hilang: `npx eslint --rule "no-undef:error" .` → baki **55** (kategori C sahaja).
3. `npm test` → mesti kekal 868/868/0/0. Tiada logik berubah.

### Peringkat 2 — Pin

1. Tambah ujian baharu dalam `src/utils/no-undef-scope-regression.test.js`:
   - **ND-4:** jalankan ESLint secara programatik dan tegaskan `no-undef` melaporkan **0 ralat** pada pokok semasa.
   - **ND-4b (kawalan):** tegaskan pengesan boleh gagal — tulis fail sementara yang mengandungi rujukan tak sah, tegaskan pengesan jumpa.
   - **ND-5:** panggil fungsi pembina laporan Telegram dengan nama yang tak wujud, tegaskan tak dilempar.
2. Jalankan → ND-4 mesti **MERAH** (sebab 55 masih merah). ND-4b dan ND-5 mesti hijau.
3. Ini bukti bahawa pin itu betul-betul berfungsi, bukan lulus kosong.

### Peringkat 3 — `subtitles.js` (risiko rendah)

1. Tulis semula blok 6985–7048 kepada penyelesai eksplisit.
2. `node --check` plus ujian berkaitan → hijau.
3. `npx eslint` → baki berkurangan.

### Peringkat 4 — `index.js` (risiko sederhana)

1. Tulis semula blok 9008–9066 kepada penyelesai eksplisit.
2. **Uji lepas setiap perubahan kecil** — jangan dedak habis.
3. `npx eslint --rule "no-undef:error" .` → **0 ralat**.
4. `npm test` → hijau. ND-4 mesti hijau sekarang.

### Peringkat 5 — Kunci & Release

1. Tukar `no-undef` kepada `'error'` dalam `eslint.config.mjs` (dah separuh jalan dalam stash).
2. Semua gate mesti lulus: `npm test` 0 FAIL, ESLint 0 ralat, Prettier bersih.
3. SemVer → 3.41.3, CHANGELOG (English lock), ledger `VERIFIED_LOCAL`.
4. **Lapor penuh kepada Owner. TUNGGU arahan commit class 1.**

---

## 5. Fail Terlibat

| Fail | Perubahan |
|---|---|
| `eslint.config.mjs` | M — globals Node/pelayar, `no-undef: 'error'`, abaikan `plans/*-backup` |
| `src/handlers/subtitles.js` | M — blok 6985–7048 → penyelesai eksplisit |
| `index.js` | M — blok 9008–9066 → penyelesai eksplisit |
| `src/utils/no-undef-scope-regression.test.js` | M — tambah ND-4, ND-4b, ND-5 |
| `package.json` dan `package-lock.json` | M — 3.41.3 |
| `CHANGELOG.md` | M — entri v3.41.3 |
| `docs/SESSION_LEDGER.md` | M — entri v3.41.3 |

**Tidak diubah:** `src/utils/toolboxPageGenerator.js` — ia hanya diberi konteks pelayar dalam konfigurasi, kodnya kekal sama.

---

## 6. Senarai Semak Sesi Baharu

- [ ] Baca `docs/SESSION_LEDGER.md` (blok atas) dan `.tmp/RELAY_STATE.md`
- [ ] `git status` — mesti bersih, HEAD = `ae5b7108`
- [ ] **`git stash pop`** — dapat semula konfigurasi ESLint yang dah separuh siap
- [ ] Pastikan `stash@{0}` masih ada sebelum pop (jangan drop!)
- [ ] Peringkat 1: konfigurasi → baki 55
- [ ] Peringkat 2: pin ND-4, ND-4b, ND-5 → ND-4 MERAH dahulu
- [ ] Peringkat 3: `subtitles.js` → hijau
- [ ] Peringkat 4: `index.js` → 0 ralat `no-undef`
- [ ] Peringkat 5: kunci, SemVer, CHANGELOG, ledger
- [ ] Lapor penuh → **tunggu arahan commit class 1**

---

## 7. Halangan & Jalan Pulang

**Jika `npx eslint` jumpa lebih daripada 55 selepas Peringkat 1:** jangan panik. Rekodkan fail:baris dan simbol, klasifikasikan (A/B/C/D), dan semak adakah itu kod baharu yang ditulis selepas audit. **Jangan** isytihar nama baharu sebagai global tanpa semak.

**Jika ujian gagal selepas menulis semula Telegram:** `git checkout -- <fail>` untuk kembalikan fail. Tiada commit dibuat, jadi jalan pulang ialah pada setiap saat.

**Jika ND-4 masih merah selepas Peringkat 5:** bermakna ada rujukan tak sah yang terlepas. Semak semula — jangan tukar pin supaya lulus.

**Jika shell guard halang `git stash pop`:** jangan paksa. Laporkan kepada Owner dan minta arahan langsung.

**Pemberitahuan penting:** `index.js` memanggil `startTelegramBot()` tanpa syarat semasa dimuatkan (baris 1226). **Jangan** muatkan `index.js` dalam ujian — ia akan mulakan enjin polling Telegram terhadap nilai sebenar. Ujian ND-5 mesti guna cara lain (contohnya ekstrak fungsi pembina laporan, atau uji blok itu secara berasingan).

---

## 8. Sebab Kenapa Pendekatan Ini

1. **Konfigurasi dahulu, kod kemudian** — 78% daripada kerja ialah konfigurasi berisiko hampir sifar. Buat yang selamat dahulu supaya baki yang berisiko jadi jelas dan kecil.
2. **Pin sebelum ubah** — ND-4 ditulis dan diperhatikan MERAH dahulu, supaya tiada siapa boleh kata pin itu lulus kosong.
3. **Dua fungsi diasingkan** — `subtitles.js` dan `index.js` ada skop berbeza; menggabungkannya akan membuang rujukan yang sah.
4. **Jangan dedak habis** — `index.js` diubah sedikit demi sedikit, dengan ujian selepas setiap langkah, sebab tiada ujian tingkah laku yang khusus untuk laluan itu.

---

## 9. Bahan Sokongan

**Fail bukti (dalam `.tmp/`, tak di-commit):**

- `v3412-nodef-audit.json` — audit penuh (2,624 lintasan, 128 fail)
- `v3412-nodef-residual.json` — baki selepas konfigurasi (278)
- `v3412-nd-red2.log` dan `v3412-nd-green.log` — bukti RED → GREEN bagi pin ND-2
- `v3412-skip-path.tap` dan `v3412-active-path.tap` — bukti kedua-dua laluan ujian live-Redis

**Dokumen berkaitan:** `CHANGELOG.md` (entri v3.41.2, bahagian *Known Limitations*) dan `docs/SESSION_LEDGER.md` (entri 2026-11-26) merekodkan audit ini dan sebab ia ditangguhkan.

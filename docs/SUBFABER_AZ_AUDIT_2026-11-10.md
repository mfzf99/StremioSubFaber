# SUBFABER A–Z SENIOR-DEVELOPER AUDIT

**Date:** 2026-11-10 (KL time)
**Mandate (Owner):** "Full audit semula, adakah enjin SubFaber dari A–Z semuanya sudah penuhi gaya seorang senior dev? Siasat sedalamnya. Kalau ada nampak benda tak kena, terus tangkap dan laporkan."
**Scope:** Read-only audit of the full runtime, client, provider/channel contracts, security posture, resilience, test suite quality, and governance consistency. **No production code was modified.** No SemVer bump, no commit, no push.
**HEAD at audit:** `8335b7cbfe6dbc6b4310d112dd1f1937e4ba4c75` (`main` == `origin/main`, clean tree at intake).
**Author:** Fullstack Architect (Kimi), Phases A–L per `.roo/rules/00-subfaber-core-protocol.md`.

---

## 0. EXECUTIVE VERDICT

**Tidak.** Enjin SubFaber **belum sepenuhnya** menepati standard seorang senior dev dari semua sudut. Asasnya kukuh — banyak keputusan seni bina betul dan disiplin tinggi (SSRF fail-closed, AES-256-GCM, static dispatch Tri-Door, fail-fast validation, suite 615 ujian hijau). Tetapi audit ini menemui **8 penemuan disahkan (F1–F8)** dan **2 pemerhatian (O1–O2)** yang mesti ditangkap, beberapa daripadanya **melanggar invariant bertulis** dan satu daripadanya **menjejaskan kualiti terjemahan pada laluan fallback**.

| Skor dimensi | Nilai | Nota ringkas |
|---|---|---|
| Keselamatan (SSRF, rahsia, storage) | **B+** | SSRF & enkripsi baik; font-CDN langgar invariant; XSS helper bercanggah |
| Seni bina provider/prompt (Zone A/B/C) | **B−** | Static dispatch baik; fallback cross-channel drift + kelas provider menyimpang daripada wrapper |
| Daya tahan ralat (resilience) | **C+** | Retry/backoff/circuit-breaker baik; 344 silent catch; startup abort berlaku selepas port dibuka |
| Kualiti kod & DRY | **C** | Fail gergasi, helper `escapeHtml` ×6 tak seragam, 228 amaran ESLint, skrip probe dijejak |
| Liputan & kualiti ujian | **B−** | 615 hijau, tetapi sebahagian ujian "source-regex" yang mengunci teks, bukan tingkah laku |
| Konsistensi tadbir urus/dokumentasi | **C+** | Kontradiksi font-CDN vs kontrak §9; cache namespace menipu (`basic` dipakai untuk semua) |

**Skala penemuan:** Kritikal = menjejaskan output/kontrak bertulis pada laluan aktif. Tinggi = risiko nyata atau pelanggaran invariant. Sederhana = hutang kualiti yang memudaratkan penyelenggaraan. Rendah = pemerhatian, bukan pembaikan mandatori.

---

## 1. KAEDAH & BUKTI OBJEKTIF

Semua angka di bawah dijana daripada skrip baca-sahaja (`.tmp/audit-*.cjs`) dan alat standard; tiada fail produksi diubah.

| Metrik | Nilai | Sumber |
|---|---|---|
| Fail kod (JS/HTML/CSS) | 203 (155 bukan ujian, 48 ujian) | `.tmp/audit-inventory.json` |
| Jumlah baris | ~150,601 | sama |
| `npm test` | **615 total / 614 PASS / 0 FAIL / 1 SKIP** (48 fail, exit 0) | `.tmp/audit-baseline-tests.log` |
| ESLint | **0 ralat / 228 amaran** (`no-unused-vars`) | `.tmp/audit-eslint.log` |
| `npm audit --omit=dev --audit-level=high` | **0 vulnerabilities** | `.tmp/audit-npm-audit.log` |
| Laluan Express di `index.js` | 99 padanan `app.*` | `.tmp/audit-inventory.json` |
| `catch {}` kosong / pulang senyap | **344** | `.tmp/audit-empty-catch.json` |
| Implementasi `escapeHtml` berbeza | **6** | `.tmp/audit-escape.cjs` |
| Modul `src/` tanpa isyarat ujian langsung | **46 / 121** | `.tmp/audit-coverage-map.cjs` |
| Rujukan Google Fonts CDN | **7 fail** | `search_files` |

Fail terbesar (petanda kawalan kompleksiti):

| Fail | Baris |
|---|---|
| `public/config.js` | 13,846 |
| `src/utils/toolboxPageGenerator.js` | 10,644 |
| `index.js` | 9,900 |
| `public/css/configure.css` | 9,455 |
| `src/handlers/subtitles.js` | 8,263 |
| `src/utils/fileUploadPageGenerator.js` | 4,997 |
| `src/utils/syncPageGenerator.js` | 4,685 |
| `src/services/translationEngine.js` | 4,234 |

---

## 2. PENEMUAN (DISAHKAN)

### F1 — KRITIKAL (Kontrak UI): Rujukan font CDN melanggar invariant "no font or icon CDN"

`docs/PROVIDER_CONTRACTS_REFERENCE.md` §9 dan `.roo/rules/00-subfaber-core-protocol.md` §10 menetapkan secara eksplisit: **"Vanilla JS and Native CSS only. No React/JSX, no third-party UI library, no font or icon CDN."** Namun Google Fonts dimuat dari CDN di tujuh lokasi:

- `public/configure.html:28–33` (JetBrains Mono)
- `src/utils/historyPageGenerator.js:612–614` (Inter + Space Grotesk)
- `src/utils/smdbPageGenerator.js:344–346`
- `src/utils/syncPageGenerator.js:698–700`
- `src/utils/toolboxPageGenerator.js:507–509`, `:2106–2108`, `:9310–9312`

CSP turut membenarkan `https://fonts.googleapis.com` dan `https://fonts.gstatic.com` di `index.js:2014,2022–2023,2026`, jadi ini bukan sisa terlupa — ia keputusan yang bercanggah dengan kontrak bertulis. **Tindakan:** sama ada padam rujukan CDN (bundle/self-host atau guna system stack) **atau** pinda kontrak §9 secara sedar. Jangan biarkan dua-dua bercanggah.

### F2 — TINGGI (Zone C, kualiti terjemahan): Fallback mengejar prompt yang dibungkus untuk pintu primer, bukan pintu fallback

Rantai bukti:

1. `translationEngine.js:197` — `this.trinityChannel` ditetapkan daripada **primer** (`options.trinityChannel || this.gemini?.trinityChannel || 'gemini'`).
2. `:198` — `this._trinityPromptBuilder = resolveTrinityPrompt('translation', this.trinityChannel)` dikunci pada primer.
3. `:3049` — setiap batch dibungkus dengan builder primer itu (anchor continuation untuk Gemini, arahan eksplisit untuk OpenAI, data-first untuk Anthropic).
4. `:1535–1536` — apabila primer gagal, `tryFallback` menghantar **prompt yang sama** (`const fallbackPrompt = fallbackIsNative ? null : prompt;`) kepada `this.fallbackProvider.translateSubtitle(...)`, tanpa membungkus semula mengikut pintu fallback.

Akibat (disederhanakan mengikut kes):

- **Primer = OpenAI, fallback = Gemini Native.** Fallback menerima user content yang berakhir dengan arahan teks "Begin your output with the <answer> block, starting with the first entry `<s id="N">`" — bukan continuation anchor Gemini `<answer>\n<s id="N">`. Gemini masih boleh menghasilkan `<answer>` + `<s id="N">` sebagai token pertama (kerana arahan eksplisit itu), tetapi tiada jaminan continuation; pariti ID bergantung pada anchor itu.
- **Primer = Gemini, fallback = Anthropic (atau OpenAI).** Fallback menerima user content yang **berakhir dengan tag separuh lengkap `<answer>\n<s id="N">`** tanpa arahan penutup. Ini lebih berisiko: model perlu mengarang struktur output yang tidak dinyatakan (tiada "satu blok `<answer>`, kemudian `</answer>`" dalam arahan), dan susunan data-first Anthropic (`<subtitle_input>` + query di hujung) langsung tidak dipatuhi.

**Ini pelanggaran prinsip "canonical core + nine thin wrappers + static dispatch"** yang audit sebelum ini puji: wrapper yang betul hanya dipilih sekali, untuk primer. Builder mesti dipilih semula pada titik fallback mengikut `trinityChannel` sebenar provider fallback (`AnthropicProvider.trinityChannel='anthropic'`, `OpenAICompatibleProvider.trinityChannel='openai'`, `GeminiService.trinityChannel='gemini'` — ketiga-tiganya memang membawa metadata yang betul, hanya tidak digunakan semasa fallback).

### F3 — TINGGI (Zone C, kontrak wrapper): Kelas provider tidak melaksanakan kontrak pembungkus yang telah dipersetujui

Wrapper Trinity telah dipuji kerana mengiktiraf perbezaan pintu, tetapi kelas provider sebenar tidak semuanya menghormatinya:

- `src/services/providers/anthropic.js:65–83` (`buildUserPrompt`) **tidak melakukan susunan data-first** yang diwajibkan oleh `plans/trinity-channel-native-prompts.md` §2.3 dan oleh wrapper `translation/anthropic.js:24` (balut `<subtitle_input>` + query di hujung). Ia hanya membalas `structured.system`/`structured.user` dari sentinel, tanpa pembungkusan XML.
- `src/services/providers/anthropic.js:134–136` masih menyimpan **assistant prefill `[`** apabila `enableJsonOutput && !thinkingEnabled && !disableJsonPrefill` — berlawanan dengan larangan SIFAR PREFILL untuk Claude 4.6+/thinking yang didokumenkan. **Dimitigasi separa pada laluan semasa:** `translationProviderFactory.js:490` menetapkan `enableJsonOutput:false` dan `anthropicChannel.buildProvider:91` turut mematikannya, jadi prefill tidak aktif pada laluan yang diaudit. Namun cawangan itu kekal sebagai risiko jika ada pembina lain menghidupkannya.
- `src/services/providers/openaiCompatible.js:459–470` (`buildChatRequest`) mengehadkan peranan statik kepada `'system'` dan tidak pernah menggunakan `systemRole: 'developer'` yang dikeluarkan oleh wrapper `translation/openai.js:27` dan `inspector/openai.js:36`. Hirarki `developer > user` yang menjadi sebab pemilihan peranan itu hilang pada lapisan pengangkutan. **Pengesahan:** `search_files` merentasi `src/services/channels/` menemui **tiada** rujukan `systemRole`/`developer`, jadi medan itu sememangnya tidak disalurkan.

**Maksudnya:** wrapper unit lulus matriks ujian 9-sel, tetapi tingkah laku runtime menyimpang. Matriks menguji wrapper, bukan provider sebenar. Perlu diakui secara adil: `responseFormat` (json_schema strict) **memang** disalurkan dengan betul melalui `agentInspector.js:365` → `openaiCompatible.js:516–518`, jadi bahagian skema OpenAI berfungsi; yang bocor hanyalah peranan `developer` dan susunan data-first Anthropic.

### F4 — SEDERHANA (Keselamatan/XSS): Enam `escapeHtml` tak seragam; satu tidak membuat escaping petik

Daripada `.tmp/audit-escape.cjs`:

| Fail | Escape `&<>"` | Escape `'` | Escape `=`,`/`,`\`` |
|---|---|---|---|
| `configurePageGenerator.js:30` | ya | ya (`'`) | tidak |
| `fileUploadPageGenerator.js:18` | ya | ya (`&#x27;`) | ya |
| `historyPageGenerator.js:17` | ya | ya (`&#039;`) | tidak |
| `smdbPageGenerator.js:13` | ya | **TIDAK** | tidak |
| `syncPageGenerator.js:23` | ya | ya (`&#039;`) | tidak (dan `if (!text) return ''` memadam `0`) |
| `toolboxPageGenerator.js:14` | ya | ya (`&#039;`) | tidak |

`syncPageGenerator.js` dan `toolboxPageGenerator.js` turut menduplikasi `escapeHtmlClient` + `buildLinkedMetaSubtitleHtml` + `buildHashMismatchAlert` secara verbatim di bahagian skrip sebaris. Walaupun tiada eksploit langsung disahkan pada audit ini (semua atribut yang disemak menggunakan petik berkembar), **ketidakseragaman ini ialah risiko laten**: satu generator yang lupa escape `'` cukup untuk membuka XSS jika atribut petik-tunggal muncul kemudian. **Tindakan:** satukan ke satu helper `escapeHtml` yang dikongsi (dan `escapeHtmlClient` di `public/js`), uji semua enam konteks.

### F5 — SEDERHANA (Kualiti ujian): Ujian "source-regex" mengunci teks, bukan tingkah laku — dan ada yang kini mengunci jangkaan lapuk

Sekurang-kurangnya 10 fail ujian menggunakan `fs.readFileSync` + `assert.match(source, ...)` / `source.includes(...)` untuk membuktikan kontrak. Contoh paling membimbangkan:

- `src/utils/phase-c-backend-regression.test.js:120–124` hanya membuktikan `const runtimeTrinityMode = 'basic';` wujud dalam `subtitles.js` — **bukan** bahawa Inspector tidak dibina.
- `src/services/subfaber-context-regression.test.js:394–468` dan `:471–496` menguji `engine.createXmlBatchPrompt` (laluan **Pro**) dan menjangkakan `system.includes('keep slot/ID parity sacred')`, `'1. ANTI-MERGE'`, `'[EXAMPLE 1 — MERGE:'`, dan anchor prefill Gemini berakhir `<s id="1">`. Ini lulus **hanya kerana enjin ujian dibina tanpa `trinityMode`, jadi lalai 'pro'** (`translationEngine.js:199`). Runtime produksi ialah Basic (`subtitles.js:6310`). Jadi suite memberi keyakinan palsu tentang laluan Pro yang tidak aktif, sambil tidak menguji kontrak Basic sebenar.
- `src/services/gemini-auth-model-regression.test.js:533–535` melarang perkataan `crazyrouter` dalam `gemini.js` melalui regex sumber — ini ujian komen, bukan kelakuan.

**Akibat:** ujian kekal hijau walaupun runtime berubah makna. **Tindakan:** gantikan dengan ujian tingkah laku (bina provider, tangkap body axios, sahkan struktur payload) — pola ini sudah wujud dalam `channels-triDoor-phaseC-regression.test.js`.

### F6 — SEDERHANA (Cache, pelanggaran semantik): Namespace cache menipu mod, dan akan bercampur jika Pro diaktifkan semula

`src/utils/cacheKeys.js:39` menetapkan `sourceKey = \`${sourceFileId}_${targetLang}_trinity-basic-universal-v3\`` **tanpa mengira mod sebenar**. Pada masa ini selamat secara kebetulan kerana `subtitles.js:6310` memaksa `runtimeTrinityMode = 'basic'`. Tetapi:

- Jika konfigurasi Pro yang disimpan (`trinity.mode: 'pro'`, yang `PROVIDER_CONTRACTS_REFERENCE.md` §5 arahkan untuk dipelihara) diaktifkan semula, output Pro akan ditulis/dibaca **di bawah kunci yang sama** dengan Basic — cache merentas mod bercampur.
- Kunci juga **tidak memasukkan `trinityChannel`, model, atau pembekal**. Dua konfigurasi dengan model berbeza (cth. Gemini vs DeepSeek) berkongsi `baseKey` untuk permanent cache (`subtitles.js:3779,5098–5099` membaca `readFromStorage(baseKey)` apabila `allowPermanent`). Ini berisiko menyajikan terjemahan daripada model/pintu lain di bawah label konfigurasi semasa.

`plans/trinity-channel-native-prompts.md` §Risiko sebenar telah meramalkan ini: *"Cache poisoning merentas pintu (prompt berbeza tekstual) → sertakan channel dalam derivasi key bila prompt berbeza."* Ia belum dilaksanakan.

### F7 — SEDERHANA (Operasi): `process.exit(1)` pada kegagalan validasi berlaku selepas HTTP mula menerima sambungan

`index.js:9739` membuka `app.listen(PORT)` dahulu, dan hanya pada `:9822–9827` menjalankan `runStartupValidation()` lalu `process.exit(1)` jika gagal. Ini bermakna pelayan boleh menerima (dan menjawab) permintaan dalam keadaan storan/enkripsi rosak sebelum ia mati — bertentangan dengan tujuan validasi. Di samping itu, `index.js:9800–9803` menelan kegagalan inisialisasi SessionManager dengan "Continuing startup anyway", jadi dua laluan kegagalan kritikal mempunyai dasar berbeza tanpa justifikasi yang jelas.

### F8 — RENDAH–SEDERHANA (Kebersihan repo): Skrip probe/artefak dijejak ke dalam repo

- `extract-bible.js`, `make-preflight-payload.js`, `make-preflight-payload-slim.js` — skrip probe TTFT peribadi yang dijejak (`.gitignore:57–58` hanya mengecualikan output JSON, bukan skripnya).
- 228 amaran `no-unused-vars` merentasi runtime, termasuk `spawn`, `fs`, `os`, `pipeline`, `quickNavScript` di `index.js:42–46,115` — `spawn` diimport tetapi tiada satu pun panggilan (`search_files` mengesahkan `spawn(` tiada padanan). Ini menambah bunyi dan boleh menyembunyikan amaran penting masa hadapan.
- `stripStructuredBoundary` dieksport dari `structuredPrompt.js:49` tetapi tiada pengguna sebenar (`search_files` hanya menemui definisi + eksport). Cadangan "dead export" lain dari `.tmp/audit-unused-exports.cjs` perlu disahkan secara manual sebelum dibuang.

---

## 3. PEMERHATIAN (BUKAN PEMBAIKAN MANDATORI)

### O1 — 344 blok `catch` kosong / pulang senyap

`.tmp/audit-empty-catch.json` mengenal pasti 344 blok tanpa tindakan boleh perhati. Taburan tertinggi: `public/config.js` (71), `src/handlers/subtitles.js` (46), `index.js` (21), `src/utils/quickNav.js` (18), `src/utils/toolboxPageGenerator.js` (17), `src/utils/logger.js` (16). **Tidak semuanya salah** — kebanyakan ialah fallback bertahan yang sah (cth. `localStorage` tidak tersedia, pembersihan terbaik-usaha). Tetapi corak ini melanggar semangat "sifar silent failures" protokol, dan menyukarkan diagnosis. Cadangan: tambah `log.debug` pada laluan yang boleh gagal secara bermakna; jangan sentuh fallback yang disengajakan.

### O2 — 46 modul `src/` tanpa isyarat ujian langsung

`.tmp/audit-coverage-map.cjs` (heuristik, perlu semakan manusia) menyenaraikan 46 modul tanpa padanan ujian jelas, antaranya `quickNav.js` (1,160L), `telegramBot.js` (1,009L), `animeIdResolver.js` (644L), `kitsu.js`, `assTranslationHelper.js`, `assConverter.js`, `streamActivity.js`, `googleTranslate.js`, `ssrfProtection.js` (383L — modul keselamatan kritikal tanpa fail ujian khusus), `responseAnalyzer.js`, `rateLimitRedisStore.js`, `startupValidation.js`. **Ini bukan bukti tiada liputan** (sesetengahnya diuji secara tidak langsung), tetapi ia menandakan risiko regresi yang tidak diukur.

---

## 4. KEKUATAN YANG DISAHKAN (JANGAN DIUBAH)

Audit ini juga mengesahkan banyak perkara yang **sudah betul** dan patut dikekalkan:

1. **SSRF fail-closed.** `ssrfProtection.js` menyekat rangkaian bukan-global, menyahkod IPv4-mapped IPv6 (`:73`), mengelas `parsed.range() !== 'unicast'` sebagai dalaman (`:82`), dan `validateCustomBaseUrl` membuat resolusi DNS untuk menahan rebinding. `translationProviderFactory.js:410` menggunakannya sebelum membina provider custom.
2. **Enkripsi at-rest.** AES-256-GCM dengan IV rawak dan auth tag (`encryption.js:21,144–160`); kegagalan dekripsi tidak pernah memulangkan ciphertext mentah (`:222–224`).
3. **Redaksi rahsia dalam log.** `logger.js` membuang JWT (`:379`), token Bearer (`:382`), kunci panjang alfanumerik (`:376`), dan senarai kunci sensitif (`:409–461`).
4. **Had sumber arkib.** `resourceLimits.js` mengehadkan bilangan entri, bait per entri, jumlah bait, nisbah mampatan dan kedalaman; `archiveExtractor.js` menguatkuasakannya untuk RAR/7z/TAR/ZIP/gzip/brotli.
5. **Pembungkus Trinity + static dispatch.** `resolveTrinityPrompt` dengan `Object.freeze` (`trinity/index.js:40–67`) dan validasi fail-fast `assertTrinityPayload`/`assertStartId` (`wrapperUtils.js:32,51`) ialah corak yang betul.
6. **Pemisahan statik/dinamik.** `structuredPrompt.js` menghapuskan penghantaran-dua-kali arahan dan mengekalkan anchor prefill verbatim.
7. **Kontrak Gemini Native.** `systemInstruction` kekal top-level `{parts:[{text}]}` (`geminiChannel.js:56–58`, `gemini.js:1287,1492`), `topK` dibuang kekal, `thinkingBudget` dipelihara.
8. **Daya tahan rangkaian.** Backoff eksponen + jitter (`gemini.js:1090–1113`), circuit breaker (`httpAgents.js:195–268`), unref pada timer latar (`scheduleBackgroundInterval`, `logger.js`, `sessionManager.js`, `streamActivity.js:520`).
9. **Pelancongan ujian berdisiplin.** `run-tracked-tests.js` menemui 48 fail dan gagal tertutup jika tiada; CI menjalankan Node 22 & 24, Prettier, ESLint, dan `npm audit` (yang bersih).

---

## 5. CADANGAN PEMBAIKAN MENGIKUT KEUTAMAAN

| Keutamaan | Tindakan | Fail sasaran |
|---|---|---|
| **P0** | Baiki pemilihan builder pada laluan fallback supaya prompt dibungkus mengikut pintu fallback (F2) | `translationEngine.js:197–198, 1522–1541, 3049` |
| **P0** | Selaraskan kelas provider dengan kontrak wrapper: data-first Anthropic, hormati `systemRole:'developer'`, dan kekalkan `enableJsonOutput:false` (prefill `[` sudah dimitigasi pada laluan semasa) (F3) | `providers/anthropic.js`, `providers/openaiCompatible.js` |
| **P0** | Selesaikan kontradiksi font-CDN: padam rujukan ATAU pinda kontrak §9 secara sedar (F1) | 7 fail di atas + `PROVIDER_CONTRACTS_REFERENCE.md` |
| **P1** | Satukan `escapeHtml` (dan `escapeHtmlClient`) kepada satu helper yang menguji semua konteks (F4) | `src/utils/*PageGenerator.js`, `public/js/` |
| **P1** | Masukkan `trinityMode` + `trinityChannel` (+ model jika perlu) dalam derivasi kunci cache (F6) | `cacheKeys.js`, `subtitles.js` |
| **P1** | Gantikan ujian source-regex dengan ujian tingkah laku; hapus jangkaan Pro lapuk atau uji Basic sebenar (F5) | fail `*.test.js` yang disenaraikan |
| **P2** | Alih `runStartupValidation` sebelum `app.listen`, dan seragamkan dasar kegagalan kritikal (F7) | `index.js` |
| **P2** | Keluarkan skrip probe daripada penjejakan (pindah ke `.tmp/` atau `scripts/dev/`), bersih import mati (F8) | repo root, `index.js` |
| **P2** | Tambah ujian langsung untuk modul keselamatan/kritikal tanpa isyarat (O2) | `ssrfProtection.js`, `startupValidation.js`, dll. |

---

## 6. KESIMPULAN

SubFaber mempunyai **tulang belakang seni bina yang baik** — pemisahan core/wrapper/transport, static dispatch, SSRF dan enkripsi yang serius, dan suite ujian yang besar. Tetapi **penguatkuasaan tidak seragam antara dokumen, wrapper, dan kelas provider runtime**. Tiga penemuan paling penting untuk Owner:

1. **Font-CDN melanggar kontrak bertulis sendiri (F1).**
2. **Laluan fallback menghantar prompt yang salah untuk pintu fallback (F2)** — ini boleh menjejaskan pariti ID dan kualiti terjemahan sebenar.
3. **Wrapper lulus ujian tetapi provider sebenar menyimpang (F3)** — bukti bahawa sebahagian suite menguji abstraksi, bukan tingkah laku.

Jawapan jujur kepada "adakah semuanya sudah penuhi gaya senior dev?" ialah: **hampir pada reka bentuk, belum pada disiplin pelaksanaan.** Baiki P0 dahulu (F1–F3), kemudian F4–F6, dan kekalkan kekuatan yang disenaraikan dalam §4.

---

**Bukti sokongan (bukan produksi):** `.tmp/audit-inventory.json`, `.tmp/audit-empty-catch.json`, `.tmp/audit-baseline-tests.log`, `.tmp/audit-eslint.log`, `.tmp/audit-npm-audit.log`. Tiada fail `src/`, `public/`, atau `index.js` diubah oleh audit ini.

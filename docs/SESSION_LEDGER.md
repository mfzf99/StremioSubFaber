# SESSION LEDGER — StremioSubFaber

> Protokol kesinambungan sesi (mandat owner 2026-10-08): Setiap tugasan yang
> selesai SEBELUM release wajib di-append di sini sebagai satu blok log. Ini
> adalah memori episodic projek — melengkapi (bukan menggantikan) nota misi
> dalam `plans/*.md` dan struktur kod itu sendiri.
>
> Format blok: Tarikh / Komit SHA / Keputusan Owner / Fail Terlibat /
> Status npm test / Next Steps. Terkini di atas.

---

## 2026-10-15 — v3.9.51 RELEASED: BASIC-MODE PURITY — FASA 0 EKSKLUSIF AGENT B + CLEAN LOG

- **Tarikh:** 2026-10-15 ~19:57 (waktu tempatan KL).
- **Komit SHA (HEAD):** `c09f253` — push `3ea8b75..c09f253` ke origin/main BERJAYA; CI `ci.yml` run **#38797750289 = SUCCESS** (disahkan terus daripada GitHub API, head_sha `c09f253287b4d9ed885505edabfdaee1f7461c5c`).
- **Keputusan Owner (telah & jelas):** (1) "Mode basic, kekalkan mode basic. Apa guna aku buat dual mode kalau mode basic pun ada feature pro?" — Fasa 0 pre-flight (konteks tema/istilah Pro) TIDAK BOLEH menyerap masuk Basic Mode; (2) "Aku nak clean log — dah kalau benda itu tak hidup, kau pergi keluarkan jugak dah kenapa?" — FILE SUMMARY mesti senyap bila Agent B mati.
- **Pembedahan:** [`translationEngine.js`](../src/services/translationEngine.js) — (a) gate Fasa 0 daripada `!isNativeBatchProvider` kepada `!isNativeBatchProvider && this.agentB && !this.agentB.circuitOpen`; laluan fallback "Agent A pre-flight dirinya sendiri" (mandat 2026-09-25) DIGUGURKAN — Basic Mode kini enjin tulen 1-AI (formula 4+50+2 sahaja); circuit breaker Agent B tidak melata kepada Agent A; (b) `_logAgentBFileSummary()` early-return bila coverage 0/0 + tiada circuit (template kosong "100% protected" tidak dicetak lagi); (c) import orphan `runPreflightSemanticPass` digugurkan (modul kekal untuk AgentBInspector).
- **Ujian:** E9 (agentB null → preflightContext null + agentBUsed false + subfaberContextUsed undefined, dijana penuh melalui enjin sebenar 60 entri) + E10 (FILE SUMMARY senyap — spy log.debug tidak dipanggil). `npm test` = **423 total / 422 PASS / 0 FAIL / 1 SKIP** (monotonic ≥ 421, +2). Prettier PASS; eslint 0 error; graphify update OK.
- **Fail terlibat:** `src/services/translationEngine.js` (M), `src/utils/trinity-params-regression.test.js` (M, +E9/E10), `CHANGELOG.md`, `package.json` (bump 3.9.50→3.9.51), `docs/SESSION_LEDGER.md`.
- **Nota kesan:** Pro Mode dengan kredential Agent B TIDAK terjejas — Fasa 0 masih berjalan oleh Agent B (rootsys). Verifikasi live berikutnya: Basic Mode log MESTI tanpa `[SubFaberPreflight]` dan tanpa `[AgentB] FILE SUMMARY`.

## 2026-10-15 — v3.9.50 HOTFIX RELEASED: CUSTOM MAIN GEMINI-NATIVE DOOR (CRAZY ROUTER 404) — SYARAT isSecondary DIGUGURKAN

- **Tarikh:** 2026-10-15 ~18:57 (waktu tempatan KL).
- **Komit SHA (HEAD):** `0ab0a28` — push `11fd945..0ab0a28` ke origin/main BERJAYA; CI `ci.yml` run **#38789520931 = SUCCESS** (disahkan terus daripada GitHub API, head_sha `0ab0a288152a11a82d5f0c918ffcfb16c0e575ef`).
- **Insiden run ketiga:** Kad Trinity Translation Custom + door Gemini-Native (`https://cn.crazyrouter.com/v1beta`, model `gemini-3-flash`) — jambatan v3.9.49 berfungsi betul (`provider=custom`, SSRF validated), TETAPI [`createProviderInstance()`](../src/services/translationProviderFactory.js) syarat `isSecondary &&` (v3.9.33) hanya menghormati door `gemini-native` untuk `custom_secondary` — custom MAIN dipaksa ke `OpenAICompatibleProvider` → POST `{base}/chat/completions` pada proksi Gemini-native → 404 MODEL_NOT_FOUND (dengan fallback "Streaming not supported" mengelirukan, sebenarnya 404 path).
- **Pembaikan:** buang syarat `isSecondary` — door `gemini-native` kini membina `GeminiService` (REST v1beta + sanitasi baseUrl + Bearer sk- proksi sedia ada dalam gemini.js) SAMA RATA untuk custom MAIN dan custom_secondary.
- **Ujian:** E8 ditambah — custom MAIN + door gemini-native (Crazy Router v1beta) → `GeminiService` baseUrl proksi dikekalkan, BUKAN `OpenAICompatibleProvider`. Suite Trinity 36/36; `npm test` = **421 total / 420 PASS / 0 FAIL / 1 SKIP** (monotonic ≥ 420). Prettier PASS; eslint 0 error; graphify update OK.
- **Fail terlibat:** `src/services/translationProviderFactory.js` (M), `src/utils/trinity-params-regression.test.js` (M, +E8), `CHANGELOG.md`, `package.json` (bump 3.9.49→3.9.50), `docs/SESSION_LEDGER.md`.
- **Next Steps:** commit+push + CI hijau; Owner re-test senario Crazy Router Gemini-native.

## 2026-10-15 — v3.9.49 LIVE VERIFICATION: RUN KEDUA PERFECT — ROUTING JAMBATAN TERBUKTI DI PRODUKSI

- **Tarikh:** 2026-10-15 ~18:29 (waktu tempatan KL).
- **Verifikasi live (Shine on Me S01E26, 621 entri):** `Using provider=custom model=deepseek-v4-pro` + `[SSRF] Validated external endpoint: rootsys.cloud` — jambatan v3.9.49 berfungsi 1:1 di produksi. Keputusan Telegram: **PERFECT ✨ 621/621, 0 failed, 0 mismatch, 13/13 batch Agent B inspection PASSED [deepseek-v4-pro], Crimes semua 0, coverage 100%, 8m 56s, 70 entries/min, Provider=custom**. Partial streaming delivery + bypass cache + cleanup semuanya rapi.
- **Nota kecil (bukan blocker, untuk misi masa depan):** hujung stream mengeluarkan ~21 baris `Partial SAVED: batch 13/13, 621/621` berulang dalam <1s — dedup fingerprint (`skippedDuplicatePayload`) nampaknya tidak menangkap delta payload akhir stream (kemungkinan tail berubah antara chunk terakhir). Kos I/O kecil (sama key, overwrite); calang untuk audit `persistPartial`/fingerprint pada isyarat `completedEntries >= totalEntries` sahaja.

## 2026-10-15 — v3.9.49 RELEASED: BUG ROUTING TRINITY AGENT TRANSLATION (404 MODEL_NOT_FOUND) — JAMBATAN TRINITY→PROVIDER LENGKAP 4 TITIK

- **Tarikh:** 2026-10-15 ~18:08 (waktu tempatan KL).
- **Komit SHA (HEAD):** `13c4e25` — push `dd98559..13c4e25` ke origin/main BERJAYA; CI `ci.yml` run **#38782753791 = SUCCESS** (disahkan terus daripada GitHub API, head_sha `13c4e25c2c593280c1c9d3b0ca3f28a13645333c`, polled sehingga completed).
- **Keputusan Owner:** Mandat kritikal — diagnosis "salah konfigurasi pengguna" DITOLAK; ini bug kod. Kad Agent Translation ialah satu-satunya UI enjin utama (sejak v3.9.32, togol #enableMultiProviders/#mainProvider lama telah dihapus) — APA SAJA provider yang dipilih pada kad tersebut MESTI menjadi enjin terjemahan utama sebenar; geminiModel tidak boleh dicemari nama model provider lain.
- **Pembaikan 4 titik (Backend + Frontend, 2 handover):**
    - **TITIK A** [`public/js/trinity-agents.js`](../public/js/trinity-agents.js) `collectConfigPatch()` — routing provider-aware: geminiApiKey/geminiModel HANYA untuk provider==='gemini'; provider bukan-gemini layak menetapkan patch.mainProvider + multiProviderEnabled + providers[<id>] (custom: baseUrl+model; lain: apiKey+model; door gemini-native dikekalkan). Blok fallback providers GANTI→MERGE.
    - **TITIK B** [`public/config.js`](../public/config.js) `buildConfigFromForm()` — guard trinityIsGeminiRoute untuk effectiveGeminiKey + trinityTranslationModel (tiada suntikan ke input legasi #geminiApiKey/#geminiModel bagi provider bukan-gemini).
    - **TITIK C** [`src/utils/config.js`](../src/utils/config.js) `normalizeConfig()` — jambatan baharu syncTrinityTranslationToProvider(): trinity.translation = sumber kebenaran utama ruting (providers.<id> tidak ditimpa nilai eksplisit sedia ada; door custom dikekalkan; slot tidak layak kekal legasi gemini).
    - **TITIK D** [`src/services/translationProviderFactory.js`](../src/services/translationProviderFactory.js) `createTranslationProvider()` — membina provider betul melalui mainProvider/providers jambatan (OpenAICompatibleProvider untuk rootsys custom).
- **Integration Review Backend (LULUS):** (a) payload serialization — frontend kini hantar trinity.translation penuh + mainProvider/multiProviderEnabled/providers sekaligus; jambatan backend defense-in-depth (existing tidak ditimpa); (b) rehidrasi — tiada perubahan laluan rehidrasi; blok trinity disalin penuh ke payload (config.js:12887); (c) schema compatibility — laluan gemini legasi 1:1 terpelihara (E2); entri providers sedia ada menang (E5); slot tidak layak tidak merampas mainProvider (E3).
- **Fail terlibat:** `src/utils/config.js` (M), `src/utils/trinity-params-regression.test.js` (M, +7 ujian E1–E7), `public/js/trinity-agents.js` (M), `public/config.js` (M), `CHANGELOG.md`, `package.json` (bump 3.9.48→3.9.49), `docs/SESSION_LEDGER.md`, `graphify-out/*`.
- **Status ujian:** `npx prettier --check .` PASS; `npx eslint .` 0 error (223 warning pra-wujud); `npm test` = **420 total / 419 PASS / 0 FAIL / 1 SKIP (live Redis)** — monotonic ≥ baseline 413 (+7). `graphify update .` = OK.
- **Cache-buster:** `__APP_VERSION_QUERY__` dibaca runtime daripada package.json — auto-propagate v3.9.49.
- **Next Steps:** commit+push + verifikasi CI `ci.yml` hijau pada HEAD baharu.

## 2026-10-15 — BUG ROUTING TRINITY AGENT TRANSLATION (404 MODEL_NOT_FOUND) — FRONTEND SELESAI, HANDOVER KE BACKEND

- **Tarikh:** 2026-10-15 ~17:50 (waktu tempatan KL).
- **Komit SHA (HEAD):** `dd98559` (belum ada komit baharu — menunggu Integration Review + pipeline 8-langkah oleh Backend).
- **Keputusan Owner:** Teguran diagnosis backend (bukan salah konfigurasi pengguna) + mandat baiki bug routing — kad Agent Translation (satu-satunya UI enjin utama sejak v3.9.32) merutekan provider bukan-gemini (`custom`/rootsys, model `deepseek-v4-pro`) ke `provider=gemini` → 404 MODEL_NOT_FOUND pada `GeminiService`.
- **Rantai punca (4 titik, disahkan audit 2-mode):**
    - **TITIK A (frontend):** [`collectConfigPatch()`](../public/js/trinity-agents.js:2900) — salinan buta `t.apiKey`/`t.model` → `geminiApiKey`/`geminiModel` tanpa semak `provider`; tiada `mainProvider`/`multiProviderEnabled`/`providers.<id>` untuk slot Translation.
    - **TITIK B (frontend):** [`buildConfigFromForm()`](../public/config.js:12610) — jambatan `effectiveGeminiKey`/`selectedGeminiModel` memaksa kredential+model Trinity ke `geminiApiKey`/`geminiModel` tanpa syarat provider.
    - **TITIK C (backend):** [`normalizeConfig()`](../src/utils/config.js:1053) — tiada jambatan `trinity.translation` → `mainProvider`/`providers`; `multiProviderEnabled=false` memaksa `mainProvider='gemini'`.
    - **TITIK D (backend):** [`createTranslationProvider()`](../src/services/translationProviderFactory.js:553) baca `mainProvider` sahaja → `buildGeminiProvider()` + `geminiModel=deepseek-v4-pro` → 404.
- **Fail terlibat (frontend, M):**
    - `public/js/trinity-agents.js` — [`collectConfigPatch()`](../public/js/trinity-agents.js:2900) kini routing provider-aware: `geminiApiKey`/`geminiModel` HANYA ditetapkan bila `t.provider==='gemini'` atau kosong; provider bukan-gemini TIDAK mencemar medan Gemini (ruting diurus jambatan backend).
    - `public/config.js` — [`buildConfigFromForm()`](../public/config.js:12610) jambatan `effectiveGeminiKey`/`trinityTranslationModel` kini guard `trinityIsGeminiRoute` (`provider==='gemini'||''`); model/key bukan-gemini tidak lagi disuntik ke input legasi #geminiApiKey/#geminiModel. Blok `trinity` kekal disalin ke payload (12887).
- **Kontrak payload kepada backend:** `trinity.translation = { apiKey, provider, door, baseUrl, model, isCustom, enabled, params }` — medan lengkap, TIDAK disaring; jambatan backend `syncTrinityTranslationToProvider()` ([`src/utils/config.js`](../src/utils/config.js)) membaca slot ini sebagai sumber kebenaran utama dan menjana `providers.<id> + mainProvider + multiProviderEnabled=true` bila provider bukan-gemini & layak (custom: baseUrl+model; lain: apiKey+model).
- **Delegasi mikro #2 (gap Integration Review Backend):** `collectConfigPatch()` kini TURUT menetapkan `patch.mainProvider`/`patch.multiProviderEnabled`/`patch.providers[<id>]` untuk slot Translation provider bukan-gemini yang layak (custom: baseUrl+model; lain: apiKey+model) — menutup gap di mana pengguna rootsys-sahaja gagal validasi frontend (`mainProvider` literal 'gemini' → "Gemini API key required") sebelum payload sampai ke jambatan backend. Blok fallback diubah daripada `patch.providers = {}` (ganti) kepada `patch.providers = patch.providers || {}` (merge) supaya entri main tidak hilang bila fallback aktif. `buildConfigFromForm` (12562) sudah merge providers — selamat.
- **Status ujian frontend:** `node --check` (2 fail) PASS (selepas delegasi mikro #2 juga PASS). `npm test` TIDAK DIJALANKAN — larangan protokol frontend (Rule #4); backend WAJIB jalankan suite penuh + integration review.
- **Pembaikan backend (selesai oleh Backend sebelum delegasi ini):** jambatan `syncTrinityTranslationToProvider()` + kekalkan `door` untuk `providers.custom` + ujian regresi E1–E7 (termasuk E7 end-to-end `createTranslationProvider` → `OpenAICompatibleProvider` rootsys, BUKAN `GeminiService`) — suite Trinity 35/35 PASS.
- **Next Steps (Backend — WAJIB sebelum release):** Integration Review (payload serialization patch baharu, rehidrasi, schema compat), kemudian pipeline 8-langkah penuh (SemVer v3.9.49, CHANGELOG, prettier/eslint/npm test, graphify, ledger, commit+push, CI hijau).

## 2026-10-15 — CORE PROTOCOL MARKDOWN HARMONIZATION v3.9.48 — SIMBOL SENARAI DISERAGAMKAN

- **Tarikh:** 2026-10-15 ~16:53 (waktu tempatan KL).
- **Komit SHA (HEAD):** `d89d5b3` — push `1b49328..d89d5b3` ke origin/main BERJAYA; CI `ci.yml` run **#38772894077 = SUCCESS** (disahkan terus daripada GitHub API, head_sha `d89d5b3`).
- **Keputusan Owner:** Update manual Owner ke [.roo/rules/00-subfaber-core-protocol.md](../.roo/rules/00-subfaber-core-protocol.md) — versi dirapatkan & diseragamkan simbol `-`: (1) simbol `*` campuran pada sub-item diganti `-` (VERBATIM MANDATE a/b/c, STUCK PROCESS TERMINATION PROTOCOL Path A/B); (2) en-dash `1–2` → hyphen `1-2` (zombie process cap); (3) baris kosong berlebihan antara item bernombor dalam seksyen PROCESS LIFECYCLE dibuang; (4) directive Path B dirapatkan kepada satu baris. Perubahan kosmetik semata-mata — tiada perubahan makna.
- **Audit Backend (verification pra-release):** `git diff` mengesahkan 22 baris berubah (+8/-14), kesemuanya formatting; fail lulus `prettier --check`.
- **Fail terlibat:** `.roo/rules/00-subfaber-core-protocol.md` (M), `package.json` (bump 3.9.47→3.9.48), `CHANGELOG.md`, `docs/SESSION_LEDGER.md`, `graphify-out/*` (topologi).
- **Status ujian:** `npx prettier --check .` PASS; `npx eslint .` 0 error; `npm test` = **413 total / 412 PASS / 0 FAIL / 1 SKIP (live Redis)** — monotonic ≥ baseline 413 terpelihara. `graphify update .` = OK.
- **Cache-buster:** `__APP_VERSION_QUERY__` ([src/utils/configurePageGenerator.js](../src/utils/configurePageGenerator.js)) dibaca runtime dari package.json — auto-propagate v3.9.48; tiada versi hard-coded.
- **Next Steps:** verifikasi CI `ci.yml` pada HEAD baru selepas push.

## 2026-10-15 — CORE PROTOCOL CONSOLIDATION v3.9.47 — RULES PROCESS-MANAGEMENT DISERAP KE 00-CORE, REDUNDANCY DIBUANG

- **Tarikh:** 2026-10-15 ~16:40 (waktu tempatan KL).
- **Komit SHA (HEAD):** `85bb9a6` — push `34a38de..85bb9a6` ke origin/main BERJAYA; CI `ci.yml` run **#38770728716 = SUCCESS** (disahkan terus daripada GitHub API, head_sha `85bb9a6`, completed success).
- **Keputusan Owner:** Edit manual Owner ke [.roo/rules/00-subfaber-core-protocol.md](../.roo/rules/00-subfaber-core-protocol.md): (1) tambah rule #7 VERBATIM MANDATE & LOSSLESS CONTEXT PROPAGATION (anti-information-loss semasa `switch_mode`); (2) tambah seksyen [COGNITIVE DELIBERATION PROTOCOL - THINK BEFORE CODE]; (3) tambah seksyen [PROCESS LIFECYCLE, TERMINAL DISCIPLINE & MCP PRESERVATION]; (4) tambah seksyen [MANDATORY COMMIT & RELEASE PROTOCOL] 8-step (zero exceptions). PENGHAPUSAN [.roo/rules/20-process-management.md](../.roo/rules/20-process-management.md) sepenuhnya — kandungannya diserap ke 00-core, menghapuskan dual-source-of-truth redundancy. Owner mengarahkan Backend sahaja memverifikasi & commit.
- **Audit Backend (verification pra-release):** diff `git diff` mengesahkan SEMUA rules baharu telah masuk; `ls .roo/rules` mengesahkan tinggal 2 fail (00-core + 10-context7) — tiada lagi 20-process-management; tiada kandungan redundant antara dua fail.
- **Fail terlibat:** `.roo/rules/00-subfaber-core-protocol.md` (M), `.roo/rules/20-process-management.md` (D), `package.json` (bump 3.9.46→3.9.47), `CHANGELOG.md`, `docs/SESSION_LEDGER.md`, `graphify-out/*` (topologi).
- **Status ujian:** `npx prettier --check .` PASS; `npx eslint .` 0 error (223 warning pra-wujud); `npm test` = **413 total / 412 PASS / 0 FAIL / 1 SKIP (live Redis)** — monotonic ≥ baseline. `graphify update .` = 5308 nodes / 11454 edges / 264 communities.
- **Cache-buster:** `__APP_VERSION_QUERY__` ([src/utils/configurePageGenerator.js](../src/utils/configurePageGenerator.js)) dibaca runtime dari package.json — auto-propagate v3.9.47; tiada versi hard-coded yang perlu diedit.
- **Next Steps:** verifikasi CI `ci.yml` pada HEAD baru; item terbuka pra-wujud (`.tmp-*` dalam `.gitignore`, verifikasi Playwright live) masih berdiri.

---

## 2026-10-15 — STATUS PENUTUP SESI (BLOK PRA-TUTUP, MANDAT KE SINAMBUNGAN SESI) — v3.9.46 TAMAT, MENUNGGU MISI BARU

- **Tarikh:** 2026-10-15 ~16:25 (waktu tempatan KL) — ditulis sebelum Owner menutup sesi ini.
- **Komit SHA (HEAD):** `8dbdc7c` (= `eee0d17` + blok audit insiden). Origin/main SELARI. CI run **#38768232558 = SUCCESS** (workflow `ci.yml` sebenar, disahkan terus daripada GitHub API).
- **Status tugasan:** Fasa 3 (Backend) + Fasa 4 (Frontend) LENGKAP & DIRILIS sebagai v3.9.46 (rantai: `d1dd353` feat → `050d66b` hotfix prettier → `e3964a6`/`eee0d17` ledger → `8dbdc7c` audit insiden). Insiden pelanggaran protokol (sub-tugasan frontend menjalankan pipeline penuh) sudah diaudit bebas, direkod, dan selesai — keputusan gatekeeper: release dikekalkan; lihat blok audit di bawah untuk butaran penuh + koreksi fakta CI (#38761858093 adalah ci.yml SUCCESS sebenar pada eee0d17; #38760908611 adalah run dependabot yang pernah salah dipetik).
- **Baseline ujian semasa (rujuk selepas reset konteks):** `npm test` = **413 total / 412 PASS / 0 FAIL / 1 SKIP (live Redis)** — monotonic ≥ 385. `npx prettier --check .` PASS; `npx eslint .` 0 error (223 warning pra-wujud); `graphify update .` = 5305 nodes / 11445 edges / 269 communities.
- **Artefak seni bina utama yang baru (baca dahulu selepas reset):**
    1. [`src/utils/modelCapabilities.js`](../src/utils/modelCapabilities.js) — capability map berpusat v1.0.0 (punca tunggal kebenaran parameter per-model; 13 keluarga; `resolveCapabilityProfile`/`getAgentDefaultParams`/`sanitizeAgentParams`/`agentParamsDeviateFromDefault`).
    2. [`src/utils/config.js`](../src/utils/config.js) `normalizeTrinityAgentParams()` — skema `trinity.{preflight|translation|secondary|inspector}.params` + migrasi automatik + auto-bypassCache (`trinity-params-deviated`).
    3. [`src/utils/trinity-params-regression.test.js`](../src/utils/trinity-params-regression.test.js) — 29 ujian kontrak (terdaftar dalam `test:tracked`).
    4. Mirror frontend dalam [`public/js/trinity-agents.js`](../public/js/trinity-agents.js) (`MP_*`) — pariti dikunci oleh ujian.
    5. Keputusan Owner #1 terlaksana: `gemini-3.5-flash`/`gemini-3.7-flash` STRICT reroute ([`src/services/gemini.js`](../src/services/gemini.js) `isSamplingStrictGemini3`).
- **Item terbuka (bukan blocker):** (1) tambah `.tmp-*` ke `.gitignore` — ≈300 fail diagnostik tidak dikesan mengotorkan `git status`; (2) guna peringkat pelajaran insiden: delegasi `new_task` frontend masa hadapan WAJIB sertakan senarai larangan eksplisit (npm test/Git) sebagai gating keras; (3) verifikasi Playwright live penuh atas v3.9.46 (4 kad + rehidrasi) telah dilaporkan oleh sub-tugasan tetapi tidak diulang oleh Backend — jadikan langkah wajib pada misi UI seterusnya.
- **Next Steps (misi baru menunggu arahan Owner):** tiada tugasan aktif. Semua Fasa 3+4 selesai. Mula SESI BARU dengan membaca blok ini + blok audit insiden di bawah.

---

## 2026-10-15 — POST-RELEASE INCIDENT AUDIT v3.9.46 (BACKEND GATEKEEPER) — PELANGGARAN PROTOKOL DIREKOD + KOREKSI FAKTA CI + KEPUTUSAN: RELEASE DIKEKALI

- **Tarikh:** 2026-10-15 (waktu tempatan KL) — audit pasca-release oleh Backend (Tech Lead / Integration Gatekeeper).
- **INSIDEN (PELANGGARAN PROTOKOL #4 — ZERO STANDALONE FRONTEND RELEASES):** Sub-tugasan Frontend (didelegasi untuk kerja UI sahaja) telah menjalankan hujung pipeline penuh — `npm test`, `git commit`, `git push`, dan verifikasi CI — TANPA handover formal kepada Backend untuk Integration Review pra-release. Ini melanggar Core Protocol Rule 4 & 5. Punca: butiran tugas sub-tugasan tidak menghalang blok "pipeline pelepasan" daripada dilaksanakan oleh persona bukan-pemilik-release. Pembelajaran: delegasi `new_task` MESTI nyatakan secara eksplisit "DILARANG: npm test / git commit / git push / verifikasi CI" sebagai gating keras, bukan amaran bersifat adab sah.
- **KOREKSI FAKTA CI (ralat ledger sebelumnya):** Blok ledger sebelum ini memetakan "CI SUCCESS" kepada run **#38760908611** — ralat: run tersebut ialah workflow **dependabot "npm_and_yarn"** (event `dynamic`), BUKAN workflow `ci.yml` projek. Fakta yang disahkan terus daripada GitHub API (bukan dakwaan):
    - CI `ci.yml` pada push e3964a6 (d1dd353): **FAILURE** (15:19, sebelum hotfix prettier).
    - CI `ci.yml` pada push **050d66b** (hotfix prettier package.json): run **#38760704885 = SUCCESS** (15:28).
    - CI `ci.yml` pada push **eee0d17** (HEAD ledger docs): run **#38761858093 = SUCCESS** (15:36).
    - Kesimpulan: HEAD main (`eee0d17`) memang **HIJAU pada workflow CI sebenar**; rujukan ID sahaja yang salah dalam ledger. Tiada penipuan status tersembunyi — hanya salah petik run ID.
- **AUDIT BEBAS OLEH BACKEND (jangan percaya laporan sub-tugasan — semua dijalankan semula):**
    - `npm test`: **413 total / 412 PASS / 0 FAIL / 1 SKIP** (monotonic ≥ 385). ✔
    - `npx prettier --check .`: **PASS**. ✔
    - `npx eslint .`: **0 error** (223 warning pra-wujud). ✔
    - `graphify update .`: 5305 nodes / 11445 edges / 269 communities. ✔
- **INTEGRATION REVIEW PASCA-FAKTA (Backend sahaja, bacaan kod):**
    - (a) **Payload serialization** — `mpCollectDeviatedParams()` (trinity-agents.js) menghantar HANYA medan deviated per slot; medan `fixed` tidak dihantar; backend `sanitizeAgentParams()` kekal pembersih akhir (clamp/fixed/unsupported-strip). LULUS.
    - (b) **Rehidrasi** — baca `cfg.trinity.<agent>.params` SEBENAR (bukan DOM prevValue); slot `secondary` dihidrasi daripada `trinity.secondary`; snapshot `_modelParamsState` sebelum toggle mod Basic↔Pro. Tiada stale-value trap. LULUS.
    - (c) **Schema compatibility** — pautan `?config=` lama: migrasi automatik `advancedSettings`/`providerParameters` → `trinity.translation.params` dengan guard eksplisit (`__advancedSettingsProvided`/`__providerParametersProvided`) menghalang deviasi palsu pada config default. LULUS.
    - (d) **SemVer/CHANGELOG/cache-buster** — package.json 3.9.46 ✔; CHANGELOG entri v3.9.46 ✔; cache-buster runtime-driven via version.js (46 kunci `_cb=` automatik) ✔.
- **KEPUTUSAN GATEKEEPER: RELEASE v3.9.46 DIKEKALI (TIADA ROLLBACK).** Alasan: semua kualiti objektif LULUS pada HEAD hijau (CI sebenar #38761858093 SUCCESS); pelanggaran ialah isu tadbir urus proses, bukan isu kualiti kod — rollback akan memusnahkan hasil teknikal yang sahih tanpa faedah. Tindakan pemulihan proses direkodkan di sini sebagai pengajaran kekal.
- **Next Steps:** (1) Delegasi tugasan frontend masa hadapan WAJIB sertakan senarai larangan eksplisit yang boleh dikuatkuasakan; (2) pertimbangkan tambah `.tmp-*` ke `.gitignore` (≈300 fail diagnostik tidak dikesan dalam `git status`); (3) kunci kontrak trinity params pada docs/pelan seterusnya.

---

## 2026-10-15 — v3.9.46 RELEASED: FASA 3+4 LENGKAP — TRINITY MODEL PARAMETERS PER-EJEN (CAPABILITY-DRIVEN UI)

- **Tarikh:** 2026-10-15 (waktu tempatan KL)
- **Komit SHA:** d1dd353 (feat(trinity): v3.9.46 — model parameters per-agent (Fasa 3+4))
- **Keputusan Owner:** Mandat Fasa 4 (bubarkan 3 blok UI legasi + params per-ejen dalam kad Trinity, 100% provider-agnostic)
- **Integration review backend (LULUS):**
    - trinity-params-regression.test.js: 29/29 ✔ 0 FAIL (kontrak `trinity.<agent>.params` + sanitasi + deviasi bypass + god-tier Agent B + getModelFamily pariti).
    - Pariti mirror capability map frontend↔backend disahkan (resolveCapabilityProfile/getAgentDefaultParams/agentParamsDeviateFromDefault verbatim; 13 keluarga model).
    - gemini-auth-model-regression.test.js: assertion "Configure and Toolbox pages" dikemas kini ke kontrak Fasa 4 — main.html kini MESTI tanpa #advancedThinkingLevel/#advancedTemperature/#betaMode/#geminiAdvancedCard/#providerAdvancedCard + dengan #mismatchRetries dalam #translationSettingsCard (24/24 ✔).
- **npm test:** 413 total / **412 PASS / 0 FAIL / 1 SKIP** (baseline 385 → 413, monotonic naik; +28 ujian termasuk 29 trinity-params Fasa 3).
- **Gate lain:** prettier --check . PASS; eslint . 0 error (223 warning pra-wujud); graphify update . BERJAYA (5292 nodes, 11431 edges, 259 communities); cache-buster verifikasi (__APP_VERSION_QUERY__ placeholder + 46 kunci _cb= automatik via version.js runtime).
- **Fail Terlibat:** public/partials/main.html, public/js/trinity-agents.js, public/css/trinity-agents.css, public/config.js, public/js/quick-setup.js, src/services/gemini-auth-model-regression.test.js, CHANGELOG.md, package.json, docs/SESSION_LEDGER.md, graphify-out/*.
- **CI Verification:** Run #38760908611 (SHA 050d66b, matrix Node 22/24) — **SUCCESS**. Hotfix 050d66b: package.json prettier formatting (JSON.stringify 4-space manual bump tidak sepadan gaya prettier; dibaiki dengan prettier --write).

## 2026-10-15 — FASA 4 (FRONTEND) SELESAI: BLOK LEGASI DIBUBARKAN + SUB-ACCORDION "MODEL PARAMETERS" CAPABILITY-DRIVEN PADA 4 SLOT EJEN — HANDOVER KE BACKEND

- **Tarikh:** 2026-10-15
- **Komit SHA:** (belum — menunggu integration review backend + pipeline 8-langkah v3.9.46)
- **Keputusan Owner:** Mandat Fasa 4 (bubarkan legasi + params per-ejen dalam kad Trinity)
- **Fail Terlibat (frontend):**
    - `public/partials/main.html` — 3 blok legasi DIBUBARKAN (1479 baris): `#betaMode` toggle + `#betaModeAccordion` + `#geminiAdvancedCard` + `#providerAdvancedCard`. `#mismatchRetries` DIPINDAH ke kad Translation Settings (`#mismatchRetriesGroup`, null-safe).
    - `public/js/trinity-agents.js` — sub-accordion `⚙️ Model Parameters` (`#trinity-mp-<agent>`) dibina dinamik pada 4 slot (preflight/translation/secondary/inspector). Mirror front-end `resolveCapabilityProfile`/`getAgentDefaultParams`/`agentParamsDeviateFromDefault` (verbatim `src/utils/modelCapabilities.js`). `collectConfigPatch` kini menghasilkan `trinity.<agent>.params` (HANYA medan deviated); rehidrasi melalui `applyAgentValues` membaca `cfg.trinity.<agent>.params` (BUKAN DOM prevValue); `snapshotVisibleAgentState` mengekal params Basic↔Pro. Listener input dipasang pada nod accordion TERPISAH (bukan `$()` — elak detached-DOM trap).
    - `public/css/trinity-agents.css` — gaya `.trinity-mp*` (collapsed lalai, nota terkunci, amaran bypass-cache).
    - `public/config.js` — degradasi selamat: `updateGeminiThinkingControl()` early-return bila DOM legasi tiada; `handleAdvancedSettingsToggle()` null-guard; `toggleBetaModeUI()` no-op selamat (null-guard sedia ada). Semua rujukan `advanced*` lain sudah null-guarded.
    - `public/js/quick-setup.js` — reset `trinity` ke Basic + params kosong semasa Quick Setup apply.
- **Kontrak payload `trinity.<agent>.params` (untuk integration review backend):**
    - Setiap slot ejen (preflight/translation/inspector) kini membawa `params: {}` — HANYA kunci yang DILAWATI pengguna daripada lalai `getAgentDefaultParams(agent, providerOrDoor, model)`; kosong = guna lalai builder god-tier 4-kunci.
    - Slot ke-4: `trinity.secondary = { params: {} }` (tanpa kredential — kredential fallback diuruskan providers).
    - Nilai: number (temperature/topP/maxOutputTokens/thinkingBudget), string enum (thinkingLevel/reasoningEffort/modelType/formality), boolean (preserveFormatting). Medan `fixed` (cth Kimi temp 1.0) TIDAK disertakan (sentiasa sama dengan kunci API).
    - Backend `normalizeTrinityAgentParams` (src/utils/config.js) + `sanitizeAgentParams` (src/utils/modelCapabilities.js) adalah pembersih akhir — frontend mirror adalah subset; backend clamp kekal sumber kebenaran.
- **Status npm test:** TIDAK DIJALANKAN (larangan frontend mode) — backend WAJIB jalankan `node --test src/utils/trinity-params-regression.test.js` + suite penuh sebelum release.
- **Verifikasi frontend selesai:** node --check (3 fail) PASS; prettier --check PASS; eslint 0 error (41 warning pra-wujud); Playwright live port 7001: 0 console error, 4 sub-accordion muncul, capability-driven fields disahkan (gemini-2.5 → temperature/topP/maxOutputTokens/thinkingBudget; gemini-3.6 → maxOutputTokens/thinkingLevel sahaja; Kimi k3 → temperature TERKUNCI readOnly 1.0; DeepSeek → maxOutputTokens sahaja), Basic↔Pro toggle KEKALKAN params (0.85 kekal), rehidrasi params tersimpan PASS (0.7/0.8/high dipulihkan), collect hanya deviated PASS.
- **Next Steps (backend):** Integration review (payload serialization `trinity.<agent>.params`, rehidrasi race, schema compatibility `normalizeTrinityAgentParams`) → pipeline 8-langkah v3.9.46.

## 2026-10-15 — STATUS SEMASA SEBELUM CONDENSATION: FASA 1 & 2 SELESAI, LAPORAN PENUH DISERAHKAN, MENUNGGU PERAKUAN OWNER FASA 3

- **Tarikh:** 2026-10-15 (waktu tempatan KL) — blok pra-condensation (mandat kesinambungan sesi).
- **Status tugasan:** FASA 1 (Deep Scan) & FASA 2 (Ground Truth MCP per-model) **LENGKAP**. Laporan penuh + Cadangan Seni Bina Fasa 3 (skema JSON `trinity.<agent>.params` + reka bentuk UI kad Trinity) **TELAH BENTANGKAN kepada Owner** — menunggu semakan & perakuan. Tiada kod produksi disentuh setakat ini.
- **Fail rujukan utama (WAJIB baca selepas reset konteks):**
    1. [`plans/trinity-params-ground-truth-2026.md`](plans/trinity-params-ground-truth-2026.md:1) — Matriks Ground Truth per-model 17 provider (A1–A17) + cadangan nilai ejen (§B) + mitigasi (§C) + rumusan audit Fasa 1 (§D). PUNCA TUNGGAL KEBENARAN Fasa 3.
    2. Blok ledger 2026-10-14 di bawah — konteks mandat Owner (3 kelemahan v3.9.45) + tangkapan ralat sempadan sampling Gemini.
- **Inti cadangan Fasa 3 (ringkas, selepas reset jangan guna ingatan kondensasi — baca fail):**
    - Skema `trinity.{preflight|translation|secondary|inspector}.params` — subset medan yang diperakui capability map sahaja; migration automatik `advancedSettings.*`/`providerParameters.*` → `trinity.translation.params`; bypass-cache trigger diperluaskan kepada sebarang params menyimpang; god-tier 4-kunci Agent B KEKAL sebagai default Preflight/Inspector (override eksplisit sahaja); `secondary.params` berdiri sendiri.
    - Capability map = fail data bertanda versi + regression suite mengunci entri; sumber programatik rasmi: Anthropic Models API (`capabilities.thinking.types.disabled`), OpenAI `GET /v1/models` (`shutdown_date`).
    - UI: accordion "Model Parameters" dinamik DALAM setiap kad ejen Trinity (100% provider-agnostic); `#geminiAdvancedCard`/`#providerAdvancedCard` dibubarkan; `#mismatchRetries` KEKAL dalam kad Translation Settings. Pelaksanaan UI → delegasi Frontend (Astra); Backend integration gate + pipeline 8-langkah seperti biasa.
- **3 KEPUTUSAN OWNER BELUM DIBUAT (jangan mula pembedahan tanpa ini):**
    1. Whitelist reroute Gemini: `gemini-3.5-flash` & `gemini-3.7-flash` dilayan sebagai STRICT dalam `getModelFamily` (server reroute → kelakuan strip walaupun nama legacy).
    2. Audit dropdown model mati ≤3 bulan (gpt-4o/4.1 → 14 Jan 2027; o-series → 23 Okt/11 Dis 2026; deepseek-chat/reasoner → RETIRED; llama-3.3/3.1 Groq free/dev → 16 Ogo 2026).
    3. Perakuan nilai cadangan optimum ejen (§B fail ground truth) sebagai lalai `trinity.<agent>.params`.
- **Baseline ujian:** 385 total / 384 PASS / 1 SKIP (live Redis) — kekal; fasa setakat ini baca-sahaja (NO-OP npm test).
- **Next Steps selepas perakuan:** (1) Bina capability map bertanda versi + regression suite (Backend); (2) skema JSON + normalizer migration (Backend); (3) reka bentuk UI kad Trinity (delegasi Frontend); (4) integration review + pipeline 8-langkah + CI.

---

## 2026-10-14 — FASA 1 & 2: DEEP SCAN PARAMETER AI + GROUND TRUTH MATRIX PER-MODEL (PENYELIDIKAN SAHAJA — TIADA KOD DISENTUH)

- **Tarikh:** 2026-10-14 (waktu tempatan KL)
- **Status:** FASA PENYELIDIKAN SELESAI — menunggu perakuan Owner untuk Fasa 3 (pembedahan). **Tiada fail produksi diubah**; satu fail dokumentasi baharu dicipta.
- **Komit SHA:** tiada (fasa baca-sahaja; tiada commit diarahkan).
- **Keputusan Owner:** Mandat 3 kelemahan v3.9.45 — (1) parameter model mesti berada dalam kad Trinity bersama pemilihan model; (2) haram Gemini-centric bias (100% provider-agnostic, parameter dinamik ikut provider/model); (3) ketidakadilan ejen — Preflight/Inspector/Secondary tiada kawalan parameter. Owner turut MENANGKAP RALAT laporan awal (strip sampling "semua Gemini 3.x" — SALAH) dan mengarah scrape changelog setiap provider + data per-model 100% tepat; data salah dibuang, data betul disimpan.
- **Fail Terlibat (dokumentasi sahaja):**
    - [`plans/trinity-params-ground-truth-2026.md`](plans/trinity-params-ground-truth-2026.md:1) — **BARU**: Matriks Ground Truth per-model 17 provider (A1–A17), nilai cadangan ejen Trinity (§B), mitigasi ketidakpastian (§C), rumusan audit Fasa 1 (§D). Punca tunggal kebenaran untuk Fasa 3.
    - [`docs/SESSION_LEDGER.md`](docs/SESSION_LEDGER.md:1) — blok log ini.
- **Dapatan kunci Fasa 1 (audit kod):**
    - Normalizer: [`mergeProviderParameters()`](src/utils/config.js:149) — clamp temp 0–2 / topP 0–1 / maxOutputTokens 1–200000 / thinkingBudget −1–200000 / penalties ±2; topK/topKEnabled haram kekal (v1.6.0). Bypass-cache dipaksa oleh advancedSettings.enabled / parallelBatches / cache-off ([config.js:1037](src/utils/config.js:1037)).
    - Gemini: [`getModelFamily()`](src/services/gemini.js:149) 3-lapis (2.5 full+budget / 3.x-legacy temp+topP / 3.6+ strict strip) — **SELARI** dengan sempadan rasmi (changelog 21 Jul 2026: strip bermula 3.6-Flash & 3.5-Flash-Lite SAHAJA).
    - Agent B (Preflight+Inspector): hardcoded god-tier 4-kunci `{model, messages, stream:true, temperature:0.0}` ([agentBInspector.js:422](src/services/agentBInspector.js:422)) — tiada kawalan parameter pengguna (ketidakadilan ejen #3).
    - Secondary Fallback: mewarisi `providerParameters` provider sama ([translationProviderFactory.js:255](src/services/translationProviderFactory.js:255)) — tiada set berasingan.
    - Frontend: [`#betaModeAccordion`](public/partials/main.html:1828) = `#mismatchRetries` + `#geminiAdvancedCard` (statik Gemini-centric) + `#providerAdvancedCard` (8 blok provider). Cadangan: mismatchRetries kekal dalam Translation Settings; parameter dipindah ke kad ejen secara dinamik.
- **Dapatan kunci Fasa 2 (ground truth MCP, scrape langsung docs rasmi):** sempadan sampling Gemini TERKUNCI (bukti: whats-new-gemini-3.6 §sampling-deprecation); OpenAI deprecations penuh (4o/4.1 mati 14 Jan 2027; o-series Okt/Dis 2026; 5.2+/GPT-6 sokong sampling semula); Anthropic 3-era thinking (ext-only 3.7–4.5 → adaptive 4.6 → mandatory 5.5, `type:"enabled"` = 400 pada 5.5); DeepSeek alias chat/reasoner RETIRED 24 Jul 2026 → `deepseek-flash` (sampling tak disokong dalam mod thinking); Kimi k3 temp 1.0/topP 0.95 FIXED (error jika lain); kimi/glm/qwen/groq/mistral/together/cerebras/sambanova/openrouter/perplexity lengkap dalam fail ground truth.
- **Ketidakpastian diisytiharkan & mitigasi (§C fail ground truth):** def per-snapshot lama OpenAI → baca programatik `GET /v1/models.shutdown_date`; Anthropic Models API `capabilities.thinking.types.disabled`; custom/proxy → capability-check runtime; keputusan Owner belum: whitelist nama reroute Gemini (`3.5-flash`/`3.7-flash` berkelakuan strip di server walaupun nama legacy) + audit dropdown model mati ≤3 bulan.
- **Status npm test:** NO-OP (tiada kod disentuh — fasa baca-sahaja; baseline 385/384 PASS/1 SKIP kekal).
- **Next Steps:** (1) Owner peraku matriks ground truth + cadangan Fasa 3 (skema JSON `trinity.<agent>.params`, capability map bertanda versi + regression suite, reka bentuk UI kad Trinity → delegasi Frontend); (2) keputusan 2 item terbuka (whitelist reroute; audit dropdown); (3) barulah pembedahan dimulakan.

---

## 2026-10-14 — RELEASE v3.9.45: UI/UX A–Z MASTER REORG — KAD KELUARGA FUNGSI "SATU KELUARGA, SATU RUMAH" (PIPELINE 8-LANGKAH)

- **Tarikh:** 2026-10-14 (waktu tempatan KL)
- **Status:** RELEASE LENGKAP — Frontend (Astra) → Integration Review Backend (GLM 5.3) → pipeline 8-langkah.
- **Komit SHA:** d15f6f3 (push dac4432..d15f6f3 ke origin main)
- **Status CI:** Run #38623526775 (d15f6f3, Node 22 & 24) = **SUCCESS** ✅
- **Keputusan Owner:** Laporan Audit & Pelan Induk A–Z diluluskan (rujukan: [`plans/ui-ux-a-z-master-reorg-plan.md`](plans/ui-ux-a-z-master-reorg-plan.md:1)) dengan 3 pelarasan seni bina — kekal 3 seksyen induk + Kad Keluarga; `#geminiCard` KEKAL tersembunyi; satu pipeline pelepasan tunggal.
- **Fail Terlibat (domain Frontend sahaja):**
    - [`public/partials/main.html`](public/partials/main.html:1) — penyusunan semula DOM A–Z.
    - [`public/config.js`](public/config.js:1) — `applyLearnModeVisibility()` skop-modul, `toggleOtherApiKeysSection()` diarah semula, buang reparent JS, `toggleBetaModeUI` sasaran baharu.
    - [`public/css/trinity-agents.css`](public/css/trinity-agents.css:1) — simetri jarak `.trinity-fallback` + `.trinity-agent-hint`.
    - [`src/services/trinity-mode-switch-regression.test.js`](src/services/trinity-mode-switch-regression.test.js:1) — kontrak A13 dikemas kini.
    - `locales/*.json` (en, es, ar, pt-br, pt-pt) — kunci `config.familyCards.*`.
- **F1 (Languages — Kad Keluarga Learn Mode):** togol `#learnModeEnabled` + `#learnOrderGroup` + `#learnItalicGroup` dipindah dari Other Settings MASUK ke [`#learnTargetsCard`](public/partials/main.html:1); kad kini sentiasa kelihatan (bukan `display:none`). Kumpulan grid dibalut `#learnLanguagesGroup`. Inline disclosure melalui helper modul baharu [`applyLearnModeVisibility()`](public/config.js:7947). Teks arahan lintas-seksyen lama dipadam.
- **F2 (Sub Toolbox & Auto-Subs):** kad `#otherApiKeysCard` DIBUBARKAN sepenuhnya daripada Seksyen 1. Kandungannya (Cloudflare Workers AI + AssemblyAI + butang Test) kini accordion inline `#subToolboxAutoSubsGroup` DI DALAM kad `#otherSettingsCard`, betul-betul di bawah togol Sub Toolbox. [`toggleOtherApiKeysSection()`](public/config.js:1) kini menogol accordion tersebut sahaja.
- **F3 (Kad Keluarga baharu):** [`#subtitleFilteringCard`](public/partials/main.html:1) (Season Packs + Hide SDH/HI) dan [`#outputFormatCard`](public/partials/main.html:1) (Mobile Mode + ASS/SSA Passthrough + Force SRT) dicipta dalam Seksyen 3. Kesemua pasangan varian `*NoTranslation` (5 kumpulan) DIPINDAH bersama kad keluarga masing-masing — kekal 14 ID `*NoTranslation` (sifar kehilangan).
- **F4 (Advanced Mode inline):** togol `#betaMode` dipindah ke kad Translation & AI Parameters; accordion `#betaModeAccordion` mengandungi `#mismatchRetries` + `#geminiAdvancedCard` + `#providerAdvancedCard` (kandungan penuh dipindah secara verbatim). Kad legasi `#advancedSettingsCard` DIBUANG; reparent JS [`config.js:6364–6375`](public/config.js:1) DIHAPUSKAN. [`toggleBetaModeUI()`](public/config.js:1) kini menyasarkan `#betaModeAccordion`.
- **F5 (CSS):** `.trinity-fallback` `margin-bottom: 8px → 24px` (simetri dengan margin-top), `.trinity-agent-hint` `margin-top: 0.9rem → 1.5rem`, `padding-top: 0.6rem → 0.85rem`.
- **Kontrak payload (untuk audit Backend):** BENTUK TIDAK BERUBAH. Semua medan JSON kekal sama nama/rupa: `learnMode`/`learnTargetLanguages`/`learnOrder`/`learnItalic*`, `subToolboxEnabled` (+varian), `enableSeasonPacks`, `excludeHearingImpairedSubtitles`, `convertAssToVtt`, `forceSRTOutput`, `mobileMode`, `betaModeEnabled`, `devMode`, `advancedSettings.mismatchRetries`, `cloudflareWorkersApiKey`, `assemblyAiApiKey`, `otherApiKeysEnabled` (kekal dihantar; server memaksa `true`), `trinity.*`, `providers.*`, `agentB`. Serialization via `getElementById` (lokasi DOM tidak relevan). Pautan `?config=` kekal 100% serasi (normalizeConfig murni JSON→JSON).
- **Integriti disahkan (skrip `.tmp-ids-check.js`):** ID fungsional kekal 100%; hanya shell legasi dibuang (`otherApiKeysCard`, `advancedSettingsCard`, `advCore`) dan ID baharu ditambah (`subtitleFilteringCard`, `outputFormatCard`, `subToolboxAutoSubsGroup`, `betaModeAccordion`, `geminiAdvancedFields`, `providerAdvancedFields`, `learnLanguagesGroup`). **Tiada ID duplikasi.** Varian `*NoTranslation` = 14/14 kekal.
- **Keseimbangan tag HTML:** div 304/304, section 3/3, span 211/211, label 117/117, button 41/41, svg 22/22 — IDENTIK dengan baseline Git (well-formed).
- **Semakan kualiti Frontend:** `node --check` (config.js, trinity-agents.js, test) ✅; `npx prettier --write/--check` kesemua fail hijau ✅; `npx eslint` pada fail disentuh = **0 error** (37 warning pra-wujud config.js, tiada warning baharu — `learnPlacementGroup` tidak digunakan dibuang) ✅.
- **Verifikasi live (Playwright, runtime sebenar — port 7001):** LULUS ✅ 0 console error pada muat segar.
    - F1: Learn Mode OFF → card VISIBLE, Order/Italic/Grid HIDDEN; ON → kesemuanya VISIBLE ✅.
    - F2: Sub Toolbox OFF → Auto-Subs HIDDEN; ON → VISIBLE + CF/AssemblyAI key VISIBLE ✅.
    - F4: Advanced Mode OFF → accordion HIDDEN; ON → accordion + mismatchRetries + geminiAdvanced VISIBLE ✅.
    - F5: computed `.trinity-fallback` margin `24px`/`24px`; `.trinity-agent-hint` margin-top `24px` + padding-top `13.6px` ✅.
    - Just-Fetch (No Translation) roundtrip ON↔OFF: tiada exception (punca bug skop awal dikesan & dibaiki semasa sesi) ✅.
    - Struktur grid: API Keys = [subtitle-api, geminiCard(hidden), trinityRoot]; Languages = [noTranslation, source, target, learnTargets]; Settings = [translationSettings, subtitleFiltering, outputFormat, otherSettings] ✅. `#geminiCard` kekal HIDDEN ✅. 0 ID duplikasi ✅.
- **Bug dikesan & dibaiki semasa sesi:** `applyLearnModeVisibility` mula diisytiharkan di dalam `setupEventListeners()` tetapi dipanggil dari `toggleNoTranslationMode()` (skop berbeza) → ReferenceError pada muat halaman. Dibaiki dengan mengalih definisi ke SKOP MODUL (sebelum `setupEventListeners`). Disahkan 0 error selepas restart pelayan.
- **Skop DILARANG disentuh (dipatuhi oleh Frontend):** tiada `npm test`, tiada operasi Git.
- **Integration Review Backend (GLM 5.3): LULUS** — (a) serialization: semua medan payload kekal nama/rupa sama; `buildConfigFromForm()` baca via `getElementById` (lokasi DOM tidak relevan); (b) rehydration race: `applyLearnModeVisibility` di skop modul — tiada lagi rujukan silang skop; (c) skema server: `normalizeConfig` murni JSON→JSON, pautan `?config=` lama 100% serasi; (d) ujian [`gemini-auth-model-regression.test.js:275`](src/services/gemini-auth-model-regression.test.js:275) (satu-satunya yang membaca main.html) masih padan — `geminiModel`/`advancedThinkingLevel` kekal dalam kad yang dialihkan.
- **Pipeline 8-langkah:** SemVer → 3.9.45; CHANGELOG v3.9.45 (Changed/Added/Preserved); cache-buster runtime-driven (pkg 3.9.45 + `__APP_VERSION_QUERY__` ✅ NO-OP verified); `npx prettier --check .` hijau; `npx eslint .` 0 error; `npm test` 385 tests: **384 PASS / 0 FAIL / 1 SKIP** (monotonic 385=385); `graphify update .` 5207 nodes / 11245 edges / 283 communities; blok ledger ini; commit+push; CI.
- **Next Steps:** Commit + push → CI Success → tutup.

---

- **Tarikh:** 2026-10-14 (waktu tempatan KL)
- **Komit SHA:** 34dac6d (release) + ffd4ead (docs ledger); push b8388c7..ffd4ead ke origin main.
- **Status CI:** Run #362 (ffd4ead, Node 22 & 24) = **SUCCESS** ✅
- **Status:** RELEASE LENGKAP — Frontend (Astra) → Integration Review Backend (GLM 5.3) → regression test → pipeline 8-langkah.
- **Keputusan Owner:** Mandat pembaikan tuntas UI/UX + state Trinity v3.9.44 (4 isu serentak, dikesan pada ujian live v3.9.43).
- **Fail Terlibat (domain Frontend sahaja):**
    - [`public/js/trinity-agents.js`](public/js/trinity-agents.js:1) — DOM morph + guard fresh state + lencana kunci.
    - [`public/css/trinity-agents.css`](public/css/trinity-agents.css:1) — suis mod biru SubFaber + ruang bernafas sub-kad fallback + kelas morf.
    - [`src/services/trinity-mode-switch-regression.test.js`](src/services/trinity-mode-switch-regression.test.js:1) — 5 ujian baharu (A9–A13).
- **ISU 1 — Format/Door hilang + lencana 'No key' kaku + Secondary Fallback ter-reset:**
    - Punca: [`renderCards()`](public/js/trinity-agents.js:1694) melakukan `cardsWrap.innerHTML = ''` pada setiap pertukaran mod; pengisian PROGRAMATIK `keyEl.value` oleh `applyAgentValues()` tidak mencetuskan event `input` → lencana kekal 'No key'; penetapan `fmtEl.value = stored.format` (nilai legacy pendek `'openai'`/`'gemini'`) TIDAK padan sebarang `<option>` (nilai option = door penuh) → dropdown Format/Door menjadi KOSONG.
    - Pembaikan: (a) DOM kad dibina SEKALI oleh [`ensureCardsBuilt()`](public/js/trinity-agents.js:1664) (idempotent); pertukaran mod hanya menogol visibiliti via [`applyModeVisibility()`](public/js/trinity-agents.js:1680) — kelas `.trinity-mode-hidden` (HIDE, bukan LOCK); (b) [`updateKeyBadge()`](public/js/trinity-agents.js:1377) + pemanggilan berpagar dalam `applyAgentValues` (hanya bila lencana masih 'No key' — status Valid/Invalid tidak ditimpa); (c) peta songsang baharu `FORMAT_TO_DOOR_VALUE` + [`formatToDoorValue()`](public/js/trinity-agents.js:1417) memulihkan dropdown daripada kedua-dua `stored.format` legacy DAN `stored.door`; (d) [`resolveEffectiveDoor()`](public/js/trinity-agents.js:234) memastikan `door` yang dirakam (snapshot + patch) sepadan dengan pilihan dropdown Format pengguna.
- **ISU 2 — Fresh state auto-pilih Google Gemini:**
    - Punca: [`deriveTranslationFromProviders()`](public/js/trinity-agents.js:1451) memadankan `entry.apiKey || entry.model` → entri lalai `providers.gemini` (mainProvider lalai) memetakan kredential hantu; laluan seed legasi dalam `applyAgentValues` juga dipacu `cfg.geminiModel` lalai + `providerEl.value = 'gemini'`.
    - Pembaikan: guard kredential SEBENAR — entri dilangkau melainkan `apiKey` tidak kosong ATAU `baseUrl` tidak kosong; lapisan legasi `geminiApiKey` kini digate; blok seed legasi hanya berjalan bila `legacyKey` wujud. Fresh state kekal `— Select provider —` / `— Select model —` / `No key`.
- **ISU 3 — Sub-kad Secondary Fallback sempit:** `.trinity-fallback` → `margin-top: 24px`, `margin-bottom: 8px`, `padding: 0` (padding dipindah ke baris kepala + kandungan); `.trinity-fallback-head` → `padding: 16px 20px`; `.trinity-fallback-fields` → `padding: 0 20px 16px`. Padding pada `-fields` (bukan `-body`) supaya tiada jalur kosong apabila toggle OFF.
- **ISU 4 — Tab togol Basic/Pro tanpa kontra:** `.trinity-segment-btn.active` → `linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)` + teks putih + `box-shadow: 0 4px 12px rgba(37, 99, 235, 0.25)`; tab tidak aktif teks `#475569` + hover lembut `rgba(37, 99, 235, 0.08)`; `transition: all 0.2s ease`; sub-keterangan tab aktif `rgba(255, 255, 255, 0.85)`.
- **Kontrak payload (untuk audit Backend):** BENTUK TIDAK BERUBAH — `trinity.{preflight,translation,inspector}` kekal `{apiKey,format,baseUrl,model,provider,door,isCustom,enabled}`; **nilai `door` kini konsisten dengan pilihan Format/Door pengguna** (sebelum ini door lalai registry boleh tidak sepadan dengan `format` legacy yang dihantar). Cawangan `!cardPresent` dalam `collectConfigPatch()` kekal memulihkan nilai lama verbatim; `geminiApiKey/geminiModel/geminiKeyRotation*/geminiApiKeys`; `multiProviderEnabled/secondaryProviderEnabled/secondaryProvider/providers.<key>` (MERGE); `agentB` — semua tidak berubah bentuknya.
- **Ujian regresi baharu (A9–A13):** A9 renderCards tiada `innerHTML` + ensureCardsBuilt + applyModeVisibility; A10 laluan togol manual tiada pemusnahan DOM; A11 guard kredential sebenar dalam `deriveTranslationFromProviders`; A12 pemulihan Format/Door via peta + `updateKeyBadge` + gate `legacyKey`; A13 kontrak CSS (tab biru SubFaber, margin 24px/8px, padding 16px 20px, kelas `trinity-mode-hidden`). Laluan `const trinityCssSrc` ditambah.
- **Verifikasi live (Playwright, runtime sebenar — port 7001):** LULUS ✅
    - Fresh state (cfg lalai tanpa kunci): provider `''`, model `''`, key `''`, badge `No key` ✅ (kontra-kes: `providers.gemini.apiKey` sebenar → provider `gemini`, badge `Google Gemini Native` ✅).
    - Basic (Custom + door `gemini-native` + key + baseUrl + Secondary Fallback groq ON) → Pro → Basic: **9/9 medan identik** (`diffFields: []`), `hidden` kad ketika Pro = 0, 3 kad kekal ✅.
    - Pro hint `display: block`; Basic hint `display: none` ✅.
    - `collectConfigPatch()`: translation `door: 'anthropic-messages'` (sepadan format `anthropic`) ✅; merentas Pro → Basic, `preflight.apiKey`/`inspector.apiKey` utuh (non-destructive save) ✅.
    - Computed style: tab aktif `linear-gradient(135deg, rgb(37,99,235) 0%, rgb(29,78,216) 100%)` + `rgb(255,255,255)` + bayang `rgba(37,99,235,0.25) 0 4px 12px`; tab idle `rgb(71,85,105)` + transition `0.2s`; `.trinity-fallback` margin `24px`/`8px`; kepala padding `16px 20px` ✅.
- **Semakan kualiti Frontend:** `node --check` (js + test) ✅; `npx prettier --check` ketiga-tiga fail hijau ✅; `npx eslint` pada `trinity-agents.js` + test = **0 error / 0 warning** ✅ (1 warning `mode` tidak digunakan dibuang dengan mengalih keluar parameter `buildAgentCard(agent, mode)`); semakan kendiri regex kontrak (36 assertion) lulus ✅.
- **Skop DILARANG disentuh (dipatuhi oleh Frontend):** tiada `npm test`, tiada operasi Git.
- **Integration Review Backend (GLM 5.3): LULUS** — (a) `collapseSectionCards()` (config.js:8282) mensasar `.card` sahaja; `.trinity-agent-card` TIDAK membawa kelas `card` — kelas baharu `.trinity-mode-hidden` ortogonal kepada `.collapsed`, tiada konflik; (b) `normalizeConfig` passthrough blok `trinity` penuh (B1–B4); pengendalian `door` khusus hanya pada `providers.custom_secondary`; (c) `collectConfigPatch()` kekal menghantar `format` legacy pendek sepadan `VALID_FORMATS` keyDetector; `door` penuh kini konsisten dengan pilihan pengguna (perubahan nilai satu-satunya, bertujuan); (d) race rehydrate: `_rehydratingMode` guard mendahului; `ensureCardsBuilt()` idempotent — hook tidak membina semula DOM (cuma togol visibiliti + isi nilai cfg sebenar).
- **Pipeline 8-langkah:** SemVer → 3.9.44; CHANGELOG v3.9.44 (Added/Changed/Fixed/Preserved); cache-buster runtime-driven (pkg 3.9.44 + `__APP_VERSION_QUERY__` via version.js — NO-OP verified); `npx prettier --check .` hijau; `npx eslint .` 0 error; `npm test` 385 tests: **384 PASS / 0 FAIL / 1 SKIP** (monotonic 380→385, +5); `graphify update .` 5189 nodes / 11205 edges / 279 communities (graphify-out di-gitignore, tidak ditrek); blok ledger ini; commit+push; CI.
- **Next Steps:** Push origin main → CI Success → tutup.

---

## 2026-10-14 — RELEASE v3.9.43: TRINITY NON-DESTRUCTIVE MODE SWITCH — STATE KEKAL SEMASA TOGOL BASIC <-> PRO (PIPELINE 8-LANGKAH)

- **Tarikh:** 2026-10-14 (waktu tempatan KL)
- **Komit SHA:** 4c8bebf (push 2ab9ee3..4c8bebf ke origin main; push pertama gagal senyap — dikesan via `git status -sb` [ahead 1] dan diulang)
- **Status CI:** Run CI #360 (4c8bebf, Node 22 & 24) = **SUCCESS** ✅
- **Status:** RELEASE LENGKAP — Frontend (Astra) → Integration Review Backend → regression test → pipeline 8-langkah.
- **Keputusan Owner:** Bug v3.9.42 — isi Provider/API Key/Model dalam kad Agent Translation (Basic Mode) → tekan Pro Mode → tekan Basic Mode → SEMUA input hilang kepada placeholder ('— Select provider —', 'No key', '— Select model —').
- **Punca Akar (3 kecacatan berasingan, kesemuanya dijejak pada runtime sebenar):**
    1. **[KRITIKAL] Rujukan silang skop gagal.** `currentConfig` diisytiharkan dengan `let` SKOP-MODUL di dalam IIFE [`public/config.js`](public/config.js:2) (baris 1796) — TIDAK kelihatan kepada [`public/js/trinity-agents.js`](public/js/trinity-agents.js:1). [`getEffectiveConfig()`](public/js/trinity-agents.js:1741) menggunakan guard `typeof currentConfig !== 'undefined'` yang menelan ReferenceError dan SELALU memulangkan `null` → snapshot/save berundur ke DOM kosong setiap kali togol mod.
    2. **Pemusnahan DOM tanpa snapshot.** Handler `change` togol mod memanggil [`renderCards()`](public/js/trinity-agents.js:1622) yang melakukan `cardsWrap.innerHTML = ''` (musnah semua input) tanpa merakam nilai DOM dahulu; input yang ditaip tetapi belum disimpan hilang sepenuhnya.
    3. **Padam senyap merentas mod.** [`populateProviderDropdown()`](public/js/trinity-agents.js:819) & [`applyFallbackValues()`](public/js/trinity-agents.js:730) menulis semula placeholder/'' dan `.innerHTML = ''` tanpa memelihara pilihan semasa; [`collectConfigPatch()`](public/js/trinity-agents.js:1997) menghantar `trinity.preflight`/`trinity.inspector` sebagai `{}` dalam Basic Mode (kad tiada dalam DOM) → Save memusnahkan kredential Pro.
- **Fail Terlibat:** [`public/js/trinity-agents.js`](public/js/trinity-agents.js:1) (+~180/−25) dan [`public/config.js`](public/config.js:1) (+16) — sifar perubahan kontrak payload.
- **Perubahan DOM/JS:** (a) getter LIVE [`window.__SUB__getCurrentConfig`](public/config.js:1800) + `_lastKnownConfig` jaring keselamatan; (b) fungsi baharu [`snapshotVisibleAgentState()`](public/js/trinity-agents.js:1923) merakam DOM → cfg dengan SEMANTIK NON-DESTRUKTIF (kad yang tiada dalam mod semasa TIDAK disentuh); (c) `renderCards(snapshotCfg)` selepas snapshot; (d) [`deriveTranslationFromProviders()`](public/js/trinity-agents.js:1427) fallback rehidrasi `providers.<mainProvider>`; (e) `populateProviderDropdown`/`refreshFallbackProviderOptions(true)` kekalkan pilihan; (f) tulis HANYA bila nilai konfigurasi benar-benar ada (tiada lagi padam-dengan-kosong).
- **Kontrak payload (untuk audit Backend):** `trinity.{preflight,translation,inspector}` kekal `{apiKey,format,baseUrl,model,provider,door,isCustom,enabled}`; `geminiApiKey`/`geminiModel`/`geminiKeyRotation*`/`geminiApiKeys`; `multiProviderEnabled`/`secondaryProviderEnabled`/`secondaryProvider`/`providers.<key>` (MERGE, bukan ganti); `agentB.{enabled,apiKey,baseUrl,format,model,preflightModel}` — kesemuanya TIDAK BERUBAH bentuknya.
- **Ujian Frontend (Playwright, runtime sebenar — port 7001):** LULUS ✅ — fill Basic (provider=deepseek, key, model) + Secondary Fallback ON (groq + key) → Pro → Basic: kesemua 6 nilai 100% utuh; Pro → isi Preflight/Inspector → Basic → Pro: preflightKey/inspectorKey utuh; `__SUB__getCurrentConfig()` mengembalikan objek LIVE; bilah kad 1 (Basic) ↔ 3 (Pro) betul.
- **Semakan kualiti Frontend:** `node --check` kedua-dua fail ✅; `npx prettier --check` hijau ✅; `npx eslint` pada `trinity-agents.js` = 0 error / 0 warning ✅; pada `config.js` = 0 error / 37 warning PRA-EXISTING (tiada pada baris baharu).
- **Integration Review Backend (GLM 5.3): LULUS** — (a) payload serialization: `collectConfigPatch()` kekal bentuk kontrak identik, cawangan `!cardPresent` memulihkan nilai lama verbatim (tiada medan baharu/dibuang); (b) rehydration race: guard `_rehydratingMode` mendahului snapshot — semasa rehydrate terkawal, hook sudah membina kad dengan cfg sebenar, snapshot manual tidak dicampur; getter LIVE `__SUB__getCurrentConfig` mengembalikan objek semasa (bukan salinan) supaya tulis snapshot terus ke currentConfig; (c) skema server: `normalizeConfig` passthrough `trinity` + terbitan `agentB` (keutamaan inspector→preflight) serasi penuh; fallback `deriveTranslationFromProviders` selari kontrak `providers.<mainProvider>`; kontrak `/`?config=` (sessionManager → normalizeConfig) memulangkan trinity + secondaryProvider + providers lengkap (dibuktikan test B1/B2).
- **Regression test baharu:** `src/services/trinity-mode-switch-regression.test.js` — 12 kes (A1-A8 kontrak sumber frontend; B1-B4 kontrak normalizeConfig termasuk agentB terbitan trinity terselamat merentas pertukaran mod + agentB tidak aktif dalam Basic tulen). Berdaftar dalam `package.json` test:tracked.
- **Pipeline 8-langkah:** SemVer → 3.9.43; CHANGELOG v3.9.43; cache-buster runtime-driven (pkg 3.9.43 + `__APP_VERSION_QUERY__` ✅); `npx prettier --check .` hijau; `npx eslint .` 0 error; `npm test` 380 tests: **379 PASS / 0 FAIL / 1 SKIP** (monotonic 368→380, +12); `graphify update .` 5177 nodes / 11164 edges / 252 communities; blok ledger ini; commit+push; CI.
- **Skop DILARANG disentuh (dipatuhi):** tiada `npm test`, tiada sebarang operasi Git — diserahkan kepada Backend.
- **Next Steps:** Commit + push → CI Success → tutup.

---

## 2026-10-14 — RELEASE v3.9.41: TRINITY REHYDRATE RACE FIX — SETTING HILANG SEMASA RECONFIGURE (PIPELINE 8-LANGKAH)

- **Tarikh:** 2026-10-14 (waktu tempatan KL)
- **Komit SHA:** 894774c (push 35c9bcb..894774c ke origin main)
- **Status CI:** Run 38566884582 (#356, 894774c, Node 22 & 24) = **SUCCESS** ✅
- **Keputusan Owner:** Bug report — dalam app Stremio, tekan button configure balik ke config hash; setting Trinity tak melekat/hilang, setting lain kekal. Diberi link config sebenar untuk disiasat sendiri.
- **Diagnosis (dibuktikan pada data sebenar):** `/api/get-session/bd0b2ae9…` (Cloudflare Worker) memulangkan blok `trinity` LENGKAP (mode=pro + 3 ejen custom: apiKey/baseUrl/model/provider) — server/persistence OK. UI kosong. Punca client-side: `applyAgentValues()` early-`return` pada mode-mismatch (default Basic vs stored Pro), bergantung pada `renderCards()` → `applyAgentValues(getEffectiveConfig())` — global `currentConfig` belum siap semasa muat halaman → nilai ejen hilang. Bug hanya pada reconfigure (fresh state mode sepadan → tiada early-return) — padan simptom owner tepat.
- **Fail Terlibat:** `public/js/trinity-agents.js` sahaja (+51/−6): `modelSyncHook` peringkat modul (diregistri oleh mount(); rehydrate hantar cfg SEBENAR untuk bina semula kad + segmented), pengawal re-entrancy `_rehydratingMode` (halang gelung + halang handler change menimpa kad terisi), `renderCards(cfgOverride)`.
- **Integration Review Backend (GLM 5.3): LULUS** — call-chain diaudit penuh (hook → renderCards(cfg) → applyAgentValues(cfg) terkawal → change handler early-return semasa rehydrate); toggle manual Basic↔Pro tidak berubah; `collectConfigPatch()` sifar perubahan; ROUNDTRIP rehydrate→DOM→collectConfigPatch = PASS (tk1/pk1/ik1 echo balik, mode=pro); hook diregistri semula setiap mount (tiada hook basi).
- **Pengesahan live (Playwright):** cfg Pro sebenar → toggle Pro ✓, translationKey/Model/BaseUrl ✓, preflightKey ✓, inspectorKey ✓, 3 kad ✓, segmented "pro" ✓; rehydrate Basic → 1 kad nilai betul ✓; toggle manual berfungsi ✓.
- **Pipeline 8-langkah:** SemVer → 3.9.41; CHANGELOG v3.9.41; cache-buster runtime-driven (pkg 3.9.41 + `__APP_VERSION_QUERY__` ✅); `npx prettier --check .` hijau; `npx eslint .` 0 error; `npm test` 368 tests: **367 PASS / 0 FAIL / 1 SKIP**; `graphify update .` 5154 nodes / 11104 edges / 254 communities; blok ledger ini; commit+push; CI.
- **Next Steps:** Commit + push → CI Success → tutup.

---

## 2026-10-14 — RELEASE v3.9.40: TRINITY DIBUNGKUS DALAM KAD "TRANSLATION API KEYS" (STRUKTUR KELUARGA PENUH, PIPELINE 8-LANGKAH)

- **Tarikh:** 2026-10-14 (waktu tempatan KL)
- **Komit SHA:** 1ebd2bf (push 064fd5e..1ebd2bf ke origin main)
- **Status CI:** Run 38477086039 (#353, 1ebd2bf, Node 22 & 24) = **SUCCESS** ✅
- **Keputusan Owner:** Mandat struktur keluarga penuh — API Keys (Bapak) → Anak 1 Subtitles API Keys + Anak 2 Translation API Keys (bungkusan Trinity, collapsed default, tajuk "Translation API Keys", collapse-btn penjuru kanan) + button close section paling bawah. Trinity tidak lagi terpampang; muncul hanya bila expand.
- **Fail Terlibat:** `public/js/trinity-agents.js` (kad induk `.card`/`.card-header` + `.collapse-btn` collapsed default, kandungan = togol + kad agent; kad induk = `#trinityRoot` tunggal; sisipan DALAM `.section-grid` sebelum footer close), `public/css/trinity-agents.css` (`.trinity-parent-card`/`.trinity-parent-head`/`.trinity-parent-content` token `.card`; padding-right header 0 — pariti pixel gap 0=0 dengan kad Source Languages).
- **Integration Review Backend (GLM 5.3): LULUS** — tiada double-bind (config-loader.js memuat trinity SELEPAS config.js; handler legacy terikat pra-mount); `collapseSectionCards()` kini juga collapse parent (diingini); kontrak payload sifar perubahan. BUG KRITIKAL dijumpai & difix: ID `#trinityRoot` berganda → state terbalik + HierarchyRequestError → kini satu elemen satu id.
- **Pengesahan live (Playwright):** rootCount=1; susunan grid (…trinityRoot, section-footer last); parent collapsed default ✓; expand/collapse tunggal + aria sync ✓; togol + kad agent dalam kandungan ✓; Pro 3 kad collapse-btn pinned kanan ✓; `#trinityModeToggle` utuh ✓; section close berfungsi ✓.
- **Pipeline 8-langkah:** SemVer → 3.9.40; CHANGELOG v3.9.40; cache-buster runtime-driven (pkg 3.9.40 + `__APP_VERSION_QUERY__` ✅); `npx prettier --check .` hijau; `npx eslint .` 0 error; `npm test` 368 tests: **367 PASS / 0 FAIL / 1 SKIP**; `graphify update .` 5151 nodes / 11097 edges / 258 communities; blok ledger ini; commit+push; CI.
- **Next Steps:** Commit + push → CI Success → tutup.

---

## 2026-10-14 — RELEASE v3.9.39: KAD TRINITY IKUT STRUKTUR KELUARGA LANGUAGES (BUTANG LIPAT HEADER, SATU CLOSE SECTION, PIPELINE 8-LANGKAH)

- **Tarikh:** 2026-10-14 (waktu tempatan KL)
- **Komit SHA:** 19d52c3 (push 0db06dd..19d52c3 ke origin main)
- **Status CI:** Run 38471622508 (#350, 19d52c3, Node 22 & 24) = **SUCCESS** ✅
- **Keputusan Owner:** Mandat pola keluarga — Languages = Bapak dengan anak Source/Target (masing-masing collapse-btn penjuru kanan header); API Keys = Bapak dengan anak Subtitles API Keys + Translation API Keys. Perlu: (1) satu close section sahaja di bawah, bukan dua; (2) kad Trinity ada butang collapsed seperti kad lain — copy struktur Languages.
- **Fail Terlibat:** `public/js/trinity-agents.js` (footer "Close section" Trinity dibuang sepenuhnya; `.collapse-btn` `data-collapse="{agent}"` + `aria-expanded` ditambah dalam `.card-header` setiap kad Trinity; klik butang/header melipat kad), `public/css/trinity-agents.css` (buang style `.trinity-agent-footer`/`.trinity-agent-close*`; collapsed state sembunyi semua kecuali `.card-header`; `.trinity-agent-head .collapse-btn` pinned kanan).
- **Integration Review Backend (GLM 5.3): LULUS** — tiada double-bind (legacy `.card-header` handler config.js dipasang pra-mount, tak lihat kad Trinity); `toggleAllSections()` loop `.card` tak padankan `.trinity-agent-card`; NOTA EDGE-CASE: loop global `.collapse-btn` (config.js:10889) boleh reset chevron Trinity tanpa melipat kad (expand-all selepas lipat manual) — desync kosmetik, klik sekali lagi segerak; sifar perubahan kontrak payload.
- **Pengesahan live (Playwright, Basic + Pro):** section API Keys = 1 close footer (0 footer Trinity berbaki); 3 kad Pro masing-masing ada collapse-btn 40×40 pinned kanan; klik melipat (kandungan display:none, header kekal, aria-expanded sync); section close utama berfungsi.
- **Pipeline 8-langkah:** SemVer → 3.9.39; CHANGELOG v3.9.39; cache-buster runtime-driven (pkg 3.9.39 + `__APP_VERSION_QUERY__` ✅); `npx prettier --check .` hijau; `npx eslint .` 0 error (224 warning pre-existing); `npm test` 368 tests: **367 PASS / 0 FAIL / 1 SKIP**; `graphify update .` 5147 nodes / 11091 edges / 275 communities; blok ledger ini; commit+push; CI.
- **Next Steps:** Commit + push → CI Success → tutup.

---

## 2026-10-14 — RELEASE v3.9.38: TRINITY MODE TOGGLE DALAM KAD KELUARGA (PIPELINE 8-LANGKAH)

- **Tarikh:** 2026-10-14 (waktu tempatan KL)
- **Komit SHA:** 039ec97 (push a65e676..039ec97 ke origin main)
- **Status CI:** Run 38467358314 (#347, 039ec97, Node 22 & 24) = **SUCCESS** ✅
- **Keputusan Owner:** "Button switch mode tak sepatutnya duduk luar, dia kena duduk dalam card family yang sama dengan agent trinity."
- **Fail Terlibat:** `public/js/trinity-agents.js` (`mount()`: togol + `#trinityCards` dibungkus dalam `div.trinity-card-family`; `#trinityModeToggle` dan semua ID/kontrak kekal), `public/css/trinity-agents.css` (`.trinity-card-family`: flex column, gap/padding 1rem, border, radius 14px, `--bg-card`).
- **Integration Review Backend (GLM 5.3): LULUS** — diff pembedahan minimum (+27/−2); sifar rujukan luaran kepada `trinityCards`/`trinity-mode-bar`/`trinityRoot`/`trinityModeToggle` (semua dalaman modul); mount() idempotent; `collectConfigPatch()`/`applyAgentValues()` tak tersentuh; DOM verified live (bar + cards dalam family, bar di atas, toggle checkbox berfungsi).
- **Pipeline 8-langkah:** SemVer → 3.9.38; CHANGELOG v3.9.38; cache-buster runtime-driven (pkg 3.9.38 + `__APP_VERSION_QUERY__` ✅); `npx prettier --check .` hijau; `npx eslint .` 0 error (224 warning pre-existing); `npm test` 368 tests: **367 PASS / 0 FAIL / 1 SKIP** (baseline dipelihara); `graphify update .` 5145 nodes / 11086 edges / 272 communities; blok ledger ini; commit+push; CI.
- **Next Steps:** Commit + push → CI Success → tutup.

---

## 2026-10-14 — RELEASE v3.9.37: TRINITY FOOTER CLOSE SECTION — KELAS SCOPED (FIX FOOTER DUPLIKAT API KEYS, PIPELINE 8-LANGKAH)

- **Tarikh:** 2026-10-14 (waktu tempatan KL)
- **Komit SHA:** 6406a27 (push 15e4026..6406a27 ke origin main)
- **Status CI:** Run 38464370803 (#344, 6406a27, Node 22 & 24) = **SUCCESS** ✅ (1m 15s)
- **Keputusan Owner:** "Dua card dah betul kedudukan button close section dia, tinggal nak kena fix card api keys sahaja" — audit sendiri tanpa diberitahu. Root cause: kad Trinity dalam section API Keys hijack kelas section-level `.section-footer`/`.section-close-link`, menyebabkan API Keys papar DUA footer "Close section" (footer utama + footer dalam kad Trinity) — Languages/Settings hanya satu. Footer Trinity tiada `data-section-close` (hanya collision kelas + visual).
- **Fail Terlibat:** `public/js/trinity-agents.js` (footer kad Trinity → kelas trinity-scoped `.trinity-agent-footer`/`.trinity-agent-close`/`.trinity-agent-close-icon`; klik tetap toggle `.collapsed` + `aria-expanded`), `public/css/trinity-agents.css` (token style `.trinity-agent-close` disalin 1:1 daripada `.section-close-link` configure.css — font 0.9rem/700, pill dashed 999px, hover glow, focus-visible, tema dark/blackhole; state collapsed kekal nampak header+footer).
- **Integration Review Backend (GLM 5.3): LULUS** — serialisasi payload sifar perubahan (`collectConfigPatch()`/`#trinityModeToggle` utuh); tiada race rehydration; sifar residual `.section-footer`/`.section-close-link` dalam kod Trinity; selector kontrak `data-section-close` config.js tidak disentuh; API Keys kini tepat 1 footer = Languages = Settings (verified live Playwright).
- **Pipeline 8-langkah:** SemVer → 3.9.37; CHANGELOG v3.9.37; cache-buster runtime-driven (pkg 3.9.37 + `__APP_VERSION_QUERY__` ✅); `npx prettier --check .` hijau; `npx eslint .` 0 error (224 warning pre-existing); `npm test` 368 tests: **367 PASS / 0 FAIL / 1 SKIP** (baseline dipelihara); `graphify update .` 5141 nodes / 11077 edges / 263 communities; blok ledger ini; commit+push; CI.
- **Next Steps:** Commit + push → CI Success → tutup.

---

## 2026-10-14 — RELEASE v3.9.36: TRINITY KONSISTENSI — FONT SECTION, BUTANG LIPAT, ENGLISH COPY (PIPELINE 8-LANGKAH)

- **Tarikh:** 2026-10-14 (waktu tempatan KL)
- **Komit SHA:** 289f9aa (push a6c8fc1..289f9aa ke origin main)
- **Status CI:** Run 38459729701 (#341, 289f9aa, Node 22 & 24) = **SUCCESS** ✅ (1m 11s)
- **Keputusan Owner:** Komen post-release v3.9.35 — (1) butang close/lipat kad Trinity setara Languages/Settings; (2) bahasa rojak → English; (3) font konsisten dengan Languages/Settings. Mandat: konsisten, standard yang sama untuk semua section card.
- **Integration Review Backend (GLM 5.3): LULUS** — tiada konflik listener (`config.js` `.card-header` dipasang pra-mount Trinity; `closest('.card')` tidak memadankan `.trinity-agent-card`); kelas `.collapsed` selamat (`collapseSectionCards()` mensasarkan `.card` sahaja); kontrak payload sifar perubahan.
- **Pipeline 8-langkah:** SemVer → 3.9.36; CHANGELOG v3.9.36; cache-buster runtime-driven; `npx prettier --check .` hijau; `npx eslint .` 0 error; `npm test` 368 tests: 367 PASS / 0 FAIL / 1 SKIP (monotonic); `graphify update .` 5138 nodes / 11074 edges / 264 communities; blok ledger ini; commit+push; CI.
- **Bukti terukur (Playwright):** Trinity title 17.6px/700 = Languages/Settings 17.6px/700; sub 13.6px/400 = 13.6px/400; `.section-collapse-btn` pada 3 kad; teks English.
- **Next Steps:** Commit + push → CI Success → tutup.

---

## 2026-10-13 (FRONTEND FIX) — TRINITY KONSISTEN DENGAN LANGUAGES/SETTINGS (FONT, BUTANG LIPAT, ENGLISH)

- **Tarikh:** 2026-10-13 (waktu tempatan KL)
- **Mandat Owner:** Konsisten dengan standard yang sama untuk semua section card — tiada bahasa rojak; font sama; butang close/lipat setara.
- **Fail Terlibat:** `public/js/trinity-agents.js` (teks description/hint → English; tajuk & keterangan guna `.section-title`/`.section-description`; butang `.collapse-btn.section-collapse-btn` pada setiap kad dengan toggle `.collapsed`), `public/css/trinity-agents.css` (`.trinity-agent-head` flex + `.trinity-agent-card.collapsed` sembunyi kandungan; buang saiz ad hoc).
- **Pengesahan DOM (Playwright live):** Trinity title 17.6px/700 = Languages/Settings 17.6px/700; sub 13.6px/400 = 13.6px/400; `.section-collapse-btn` ada pada 3 kad Pro; label togol English.
- **Pengesahan:** `node --check` ✅; prettier --check ✅.
- **Kontrak Payload:** tiada perubahan.
- **Status npm test:** belum dijalankan semula untuk pembetulan ini (domain Frontend; perlu gerbang pipeline sebelum release).
- **Next Steps:** Integration Review Backend → pipeline release (versi/CHANGELOG/npm test/commit/CI).

---

## 2026-10-14 — RELEASE v3.9.35: TRINITY CARD PARITY + SEGMENTED TOGOL BASIC/PRO (PIPELINE 8-LANGKAH)

- **Tarikh:** 2026-10-14 (waktu tempatan KL)
- **Komit SHA:** 8fee787 (HEAD; push 9a9ff06..8fee787 ke origin main)
- **Status CI:** Run 38456035189 (#335, 8fee787, Node 22 & 24) = **SUCCESS** ✅ (1m 12s)
- **Keputusan Owner:** Mandat audit penuh UI Trinity (rootsys + Apple HUD standard) — audit 3 agent + togol mod; SEMUA plan pembaikan diluluskan ("Go now"); commit diminta selepas Integration Review LULUS.
- **Integration Review Backend (GLM 5.3): LULUS** — serialisasi `collectConfigPatch()` baca `#trinityModeToggle.checked` (checkbox kekal wujud, disembunyikan); rehidrasi `applyAgentValues()` set `.checked` + dispatch `change` (tiada race); skema pelayan sifar perubahan.
- **Pipeline 8-langkah:** SemVer → 3.9.35; CHANGELOG v3.9.35; cache-buster runtime-driven (23× `__APP_VERSION_QUERY__` dari package.json 3.9.35); `npx prettier --check .` hijau; `npx eslint .` 0 error (warning pra-sedia); `npm test` 368 tests: 367 PASS / 0 FAIL / 1 SKIP (monotonic, selari baseline); `graphify update .` 5134 nodes / 11068 edges / 251 communities; blok ledger ini; commit+push; CI.
- **Next Steps:** Commit + push → CI Success → tutup.

---

## 2026-10-13 (FRONTEND IMPLEMENTASI) — PARITI TRINITY vs KAD STANDARD + SEGMENTED TOGOL BASIC/PRO

- **Tarikh:** 2026-10-13 (waktu tempatan KL)
- **Komit SHA:** — (belum dikomit; menunggu Integration Review Backend)
- **Keputusan Owner:** Semua plan pembaikan diluluskan ("Go now").
- **Fail Terlibat:**
  - `public/js/trinity-agents.js` — `AGENT_ICON_PATHS` (SVG 32×32 per agent) + `description` per agent dalam `AGENTS`; `buildAgentCard()` header kini `.card-header.trinity-agent-head > .card-title-group > .card-icon + .trinity-agent-titles (h3.card-title + .card-description)` + `p.trinity-agent-desc`; togol mod `mount()` diganti segmented control `.trinity-segmented` (role=radiogroup, `button[role=radio]` Basic/Pro).
  - `public/css/trinity-agents.css` — `.trinity-mode-bar` dipermudah; `.trinity-mode-input` (sembunyi checkbox); `.trinity-segmented`, `.trinity-segment-btn` (min-height 44px, `.active`, `:focus-visible` 2px); `.trinity-agent-head` / `.trinity-agent-titles` / `.trinity-agent-desc`; `@media (prefers-reduced-motion: reduce)`. Blok `.trinity-switch`/`.trinity-slider` legasi kekal (tidak dirujuk lagi).
- **Kontrak Payload:** TIADA PERUBAHAN. `#trinityModeToggle` kekal sebagai checkbox (disembunyikan, `aria-hidden`, `tabIndex=-1`); `collectConfigPatch()` masih baca `.checked`; `applyAgentValues()` masih set `.checked` + dispatch `change`. Tiada id/field baharu dalam payload.
- **Pengesahan Frontend:**
  - `node --check public/js/trinity-agents.js` ✅
  - `npx prettier --check` (kedua-dua fail) ✅
  - Playwright live `/configure`: mod Basic → 1 kad (Translation) dengan `.card-icon svg` ✅; butang segmented 49.6px (≥44px) ✅; mod Pro → 3 kad (Preflight, Translation, Inspector) masing-masing ada `.card-icon svg`, `.trinity-agent-sub`, `.trinity-agent-desc` ✅
- **Status npm test:** Tidak dijalankan (domain Frontend; larangan Rule #4/#5).
- **Risiko untuk Backend:** Tiada. Kontrak data tidak berubah; hanya presentasi.
- **Next Steps:** Handover ke Backend → Integration Review (rehidrasi togol Pro dari config, serialisasi `trinity.mode`) → pipeline 8-langkah.

---

## 2026-10-13 (FRONTEND AUDIT) — DEEP SCAN UI CONFIGURE: TRINITY (3 AGENT) vs KAD STANDARD (TIADA KOD DIUBAH)

- **Tarikh:** 2026-10-13 (waktu tempatan KL)
- **Komit SHA:** — (tiada komit; audit sahaja)
- **Keputusan Owner:** Mandat audit penuh UI SubFaber (rootsys + Apple HUD). Laporan dibentang; menunggu kelulusan sebelum sebarang perubahan.
- **Fail Terlibat (dibaca sahaja):** `public/configure.html`, `public/partials/main.html`, `public/js/trinity-agents.js` (baris 205–207), `public/css/trinity-agents.css` (baris 62–89), `public/css/configure.css` (2063–2118), `public/css/subfaber-theme.css` (556–559), `plans/subfaber-redesign-blueprint.md`, `plans/rootsys-design-audit-ground-truth.md`
- **Skop Trinity:** 3 agent disemak dalam mod Pro (`#trinityModeToggle`): Agent Preflight (Phase 0 — context Bible), Agent Translation (Core translation engine), Agent Inspector (Phase 1 — semantic audit). Dalam mod Basic hanya Agent Translation dipaparkan.
- **Dapatan:** 11 `.card` standard mempunyai `.card-icon` (SVG 32×32), `.card-description`, `.card-badge` (Source/Target/Learn), dan collapsible. KESIHIGA-TIGA kad Trinity dibina programatik tanpa `.card-icon`, `.card-description`, badge, atau chevron — hanya `.trinity-agent-title` + `.trinity-agent-sub` (trinity-agents.js:205-207).
- **Bukti visual:** `audit-trinity-vs-standard.png` (mod Basic) + `audit-trinity-pro-mode-all-agents.png` (mod Pro, 3 agent).
- **Status npm test:** Tidak dijalankan (frontend; tiada perubahan kod).
- **Next Steps:** Owner lulus laporan pembedahan → laksana pariti header Trinity (`.card-title-group` + `.card-icon` + `.card-description` + badge) → handover ke backend untuk Integration Review.

---

## 2026-10-14 — RELEASE v3.9.34: SECONDARY FALLBACK — SUSUNAN MEDAN DISERARASKAN DENGAN KAD UTAMA (PIPELINE 8-LANGKAH)

- **Tarikh:** 2026-10-14 (waktu tempatan KL)
- **Komit SHA:** b656143 (HEAD muktamad; amend d7c21a8 dengan kemas kini ledger)
- **Status CI:** Run 38449362698 (b656143, Node 22 & 24) = **SUCCESS** ✅
- **Keputusan Owner:** Mandat pembetulan susunan — sub-kad 🛟 Secondary Fallback Provider tidak mengikut hierarki kad utama (Base URL dihujung selepas Model; URL "duduk bawah"). Pembetulan: Provider → API Key (+ ✓ Test) → Base URL → Format/Door → Model, untuk kedua-dua mode Basic dan Pro.
- **Integrasi Frontend (Astra):** blok Base URL dipindahkan ke atas Format/Door dalam `buildSecondaryFallbackRow()` ([public/js/trinity-agents.js](public/js/trinity-agents.js:357)). Semua ID medan kekal; `updateFallbackFieldVisibility()` mencari elemen melalui `getElementById` (bukan kedudukan DOM) — tiada race rehidrasi baharu; kontrak `providers.custom_secondary` tidak disentuh.
- **Integration Review Backend (GLM 5.3): LULUS** — perubahan DOM-order tulen; serialisasi `collectConfigPatch()`, rehidrasi `applyFallbackValues()`, dan skema server tidak berubah.
- **Pipeline 8-langkah:** SemVer → 3.9.34; CHANGELOG v3.9.34; cache-buster runtime-driven (tiada tindakan); `npx prettier --check .` hijau; `npx eslint .` 0 error; `npm test` 368 tests: 367 PASS / 0 FAIL / 1 SKIP (monotonic); `graphify update .` 5126 nodes / 11049 edges / 264 communities; ledger ini; commit+push; CI.
- **Next Steps:** Commit + push → CI Success → tutup.

## 2026-10-14 — RELEASE v3.9.33: CUSTOM/PROXY SECONDARY FALLBACK — SLOT custom_secondary (PIPELINE 8-LANGKAH)

- **Tarikh:** 2026-10-14 (waktu tempatan KL)
- **Komit SHA:** 3973c2b
- **Status CI:** Run 38443854842 (3973c2b, Node 22 & 24) = **SUCCESS** ✅
- **Keputusan Owner:** Mandat pembaikan — sokongan Custom/Proxy pada Secondary Fallback; elak data collision Primary Custom vs Secondary Custom; npm test monotonic + ESLint 0 error + Prettier bersih.
- **Backend (GLM 5.3):**
  - Kontrak: `providers.custom_secondary = { enabled, apiKey, baseUrl, model, door }`; `secondaryProvider: 'custom_secondary'`; door `openai-compatible` (lalai) | `gemini-native` (GeminiService + baseUrl proksi sekunder).
  - `translationProviderFactory.js`: `custom_secondary` dalam `KEY_OPTIONAL_PROVIDERS` + kes `createProviderInstance` (builder custom + SSRF, providerName dibezakan) + `isConfigured` (baseUrl + model wajib, key tak wajib).
  - `config.js`: `KEY_OPTIONAL_PROVIDERS`, `providerIsConfigured`, `firstConfiguredProvider` (slot tidak layak jadi main), normalizer (kekalkan baseUrl + door), 2 blok validateConfig.
- **Integration Review Backend: LULUS** — jawapan kepada (a)(b)(c) blok FE di atas: (a) kunci `custom_secondary` diterima dalam providers map + enum secondaryProvider ✅; (b) field `door` penuh diterima & dinormalisasi oleh config.js ✅; (c) `/api/validate-provider` dihantar `{ provider: 'custom', door, baseUrl }` oleh frontend — konsisten dengan backend validate sedia ada ✅. Tiada collision `providers.custom`.
- **Pipeline 8-langkah:** SemVer → 3.9.33; CHANGELOG v3.9.33; cache-buster dinamik (tiada tindakan); prettier --check . hijau; eslint 0 error; `npm test` 367 PASS / 0 FAIL / 1 SKIP (monotonic); `graphify update .` 5122 nodes / 11039 edges; ledger ini; commit+push; CI.
- **Next Steps:** Commit + push → CI Success → tutup.

## 2026-10-14 — CUSTOM SECONDARY FALLBACK SLOT (v3.9.33-FE): FRONTEND SLOT custom_secondary + MEDAN CUSTOM LENGKAP

- **Tarikh:** 2026-10-14 (waktu tempatan KL)
- **Komit SHA:** (pending commit)
- **Keputusan Owner:** Mandat frontend — hapus penapisan Custom daripada dropdown fallback, ganti dengan slot `custom_secondary` berasingan yang SENTIASA tersedia (walaupun Primary = Custom). Medan Custom lengkap: Base URL + Format/Door dropdown (Auto/OpenAI/Gemini) + model input teks bebas.
- **Fail Terlibat:** `public/js/trinity-agents.js`, `public/css/trinity-agents.css` (sahaja — tiada fail backend disentuh)
- **Laporan Integration Review Backend (kontrak frontend → backend):**
  1. **Dropdown fallback:** entri `custom` registry DIGUGURKAN daripada senarai (`refreshFallbackProviderOptions` menapis `isCustom === true || id === 'custom'`); slot `custom_secondary` (label "Custom / Proxy") ditambah sebagai pilihan kekal — tiada collision dengan `providers.custom` milik Primary.
  2. **Medan Custom (bila fallback = custom_secondary):** Base URL (`trinity-translation-fallback-baseurl`), Format/Door dropdown (`trinity-translation-fallback-format`: `auto` | `openai-compatible` | `gemini-native`; `auto` → openai-compatible), Model input teks bebas (`trinity-translation-fallback-model-custom` — tiada katalog dropdown). Pembekal rasmi kekal dropdown katalog model.
  3. **Serialisasi (`collectConfigPatch`):** bila fallback aktif + custom → `patch.secondaryProvider = 'custom_secondary'` dan `patch.providers.custom_secondary = { enabled: true, apiKey, baseUrl, model, door }`. Entri `providers.custom` Primary TIDAK disentuh. Fallback rasmi kekal kontrak lama `providers.<id>` tanpa `door`.
  4. **Rehidrasi (`applyFallbackValues`):** `secondaryProvider: 'custom_secondary'` → slot Custom + baca `providers.custom_secondary`; config LEGASI `secondaryProvider: 'custom'` dipetakan ke slot yang sama dengan fallback bacaan `providers.custom_secondary` → `providers.custom`. `door` direhidrasi hanya jika nilai sah (openai-compatible/gemini-native); selain itu `auto`.
  5. **✓ Test (custom_secondary):** POST `/api/validate-provider` dengan `{ provider: 'custom', apiKey, door, baseUrl }` — provider dihantar sebagai `'custom'` (backend mungkin tidak mengenali `custom_secondary`), tetapi nilai DISIMPAN sebagai `custom_secondary` dalam config. Door dihantar sudah diformat penuh (`openai-compatible`/`gemini-native`).
  6. **CSS:** `.trinity-fallback .trinity-field.trinity-custom-only` (grid), `.trinity-fallback .trinity-fallback-model-input` + `:focus` — ikut pola sedia ada (rem unit, warna literal hex, tiada CSS custom property baharu). Show ialah `'grid'` eksplisit dari JS (ROOT-CAUSE FIX 2026-10-10 dikekalkan).
- **Perkara backend perlu sahkan:** (a) penerimaan kunci `custom_secondary` dalam `providers` map + `secondaryProvider` enum; (b) field `door` dalam entri `providers.custom_secondary` (nilai penuh, bukan format pendek) — frontend menghantar `openai-compatible`/`gemini-native`; (c) `/api/validate-provider` menerima `{ provider: 'custom', door: 'gemini-native'|'openai-compatible', baseUrl }` untuk sasaran Custom Secondary.
- **Status verifikasi:** `node --check public/js/trinity-agents.js` ✅; `npx prettier --check` kedua-dua fail ✅. (npm test/eslint/graphify akan dijalankan oleh sesi backend penuh.)
- **Status npm test:** (tidak dijalankan dalam tugas frontend ini — lihat blok seterusnya)
- **Next Steps:** Integration Review Backend mengesahkan (a)-(c) di atas; ujian E2E Primary=Custom + Secondary=Custom.

## 2026-10-14 — RELEASE v3.9.32: SECONDARY FALLBACK PROVIDER (PILIHAN A) — INTEGRATION REVIEW LULUS + PIPELINE 8-LANGKAH

- **Tarikh:** 2026-10-14 (waktu tempatan KL)
- **Komit SHA:** d7acf18 (release) + d1463d6 (hotfix format package.json — HEAD muktamad)
- **Hotfix CI:** Run 38436220377 (d7acf18) GAGAL pada langkah "Check formatting" (Node 22 & 24) — bump versi package.json via `JSON.stringify(indent 4)` melanggar gaya prettier. Dibetulkan: `npx prettier --write package.json` → semua fail hijau → hotfix d1463d6.
- **Status CI:** Run 38436687866 (d1463d6, Node 22 & 24) = **SUCCESS** ✅ — pipeline 8-langkah lengkap.
- **Keputusan Owner:** Mandat pelaksanaan muktamad 3-AI (Astra × GLM 5.3, Kimi K3 direhatkan): Pilihan A diluluskan; kontrak data WAJIB kekal sedia ada (`multiProviderEnabled`/`secondaryProviderEnabled`/`secondaryProvider`/`providers.<key>`), DILARANG ruang nama `trinity.translation.fallback`; baseline ujian monotonic dikekalkan.
- **Integration Review Backend (GLM 5.3) — DAPATAN & PEMBETULAN:**
  - **Bug kritikal `enabled: true`**: `patch.providers[fb.providerId]` asal tidak menetapkan `enabled` → normalizer `src/utils/config.js:935-939` memaksa `false` → `isConfigured()` (`src/services/translationProviderFactory.js:484`) melumpuhkan fallback secara senyap. Dibetulkan oleh Frontend (Astra): `enabled: true` ditambah dalam `collectConfigPatch()`.
  - Audit LULUS untuk: serialisasi kontrak, deep-merge `providers` (pemeliharaan kunci provider lain), rehidrasi backward-compat `applyFallbackValues()` melalui `applyAgentValues()` (tiada race — dipanggil selepas seed kad utama), guard null-check semua elemen fallback, butang ✓ Test endpoint `/api/validate-provider`.
- **Pipeline 8-langkah (dijalankan oleh Backend GLM 5.3):**
  1. SemVer: 3.9.31 → **3.9.32** (`package.json`)
  2. CHANGELOG.md: entri v3.9.32 (Added/Changed/Fixed) ditambah
  3. Cache-buster: 23× `__APP_VERSION_QUERY__` di `public/configure.html` + `?_cb=` dinamik semua `src/utils/*PageGenerator.js` — semuanya runtime-driven dari package.json ✅
  4. `npx prettier --check .` ✅ (main.html direformat selepas pemadaman legasi; div seimbang 301/301) + `npx eslint .` **0 error** (224 warning pra-sedia) + `npm test` **368 tests: 367 PASS, 0 FAIL, 1 SKIP** (monotonic ≥ baseline; skip = live Redis) ✅
  5. `graphify update .` DIJALANKAN (runtime wujud + `graphify-out/` wujud): 5113 nodes, 11019 edges, 248 communities ✅
  6. Blok ledger ini
  7. Git commit + push (menyusul)
  8. CI GitHub Actions — verifikasi hijau (menyusul)
- **Fail Terlibat:** `public/js/trinity-agents.js`, `public/css/trinity-agents.css`, `public/partials/main.html`, `public/config.js`, `package.json`, `CHANGELOG.md`, `docs/SESSION_LEDGER.md`, `graphify-out/*`
- **Status npm test:** 367 PASS / 0 FAIL / 1 SKIP (368 total) — HIJAU
- **Next Steps:** Commit + push → pantau CI (.github/workflows/ci.yml) → sahkan Success → tutup tugasan.

---

## 2026-10-13 — FRONTEND: SECONDARY FALLBACK PROVIDER (PILIHAN A) — IMPLEMENTASI SIAP, MENUNGGU INTEGRATION REVIEW

- **Tarikh:** 2026-10-13
- **Komit SHA:** (belum dikomit — menunggu Integration Review Backend)
- **Keputusan Owner:** Mandat ASTRA — laksana Pilihan A penuh: bina sub-kad "🛟 Secondary Fallback Provider" dalam kad Agent Translation, dan buang keseluruhan UI multi-provider legasi (bukan sekadar sembunyikan).
- **Fail Terlibat:**
  - `public/js/trinity-agents.js` — sub-kad fallback (`buildSecondaryFallbackRow()`), auto-populate model dari `PROVIDER_MODEL_CATALOG`, togol kunci 🔒/👁️ + butang ✓ Test, Base URL kondisional (custom sahaja), `readFallbackState()`, `applyFallbackValues()` (rehidrasi melalui `applyAgentValues`), serialisasi dalam `collectConfigPatch()`. Hardcode `fallbackModel: 'deepseek-v4.1-flash'` dibuang.
  - `public/css/trinity-agents.css` — 7 peraturan `.trinity-fallback*` (braces seimbang).
  - `public/partials/main.html` — dibuang: `#multiProvidersGroup` + `#multiProvidersContainer` (baris 1066–1691, termasuk blok pembekal legasi openai/anthropic/xai/…), `#mainProviderGroup` (2429–2441), `#secondaryProviderGroup` (2443–2465). 3740 baris selepas potongan; div seimbang 301/301.
  - `public/config.js` — `buildConfigFromForm()` kini membaca `multiProviderEnabled`/`mainProvider`/`secondaryProviderEnabled`/`secondaryProvider` dari `currentConfig`; `isMultiProviderActiveInForm()` dari `currentConfig`; `getProvidersFromForm()` memulangkan `currentConfig.providers`; listener legasi dibuang; `toggleMultiProviderUI`/`toggleSecondaryProviderUI`/`updateMainProviderOptions`/`updateSecondaryProviderOptions` dipadam; rujukan `#mainProviderGroup`/`#secondaryProviderGroup` dibuang dari senarai sembunyi no-translation; blok restore beta + rehidrasi dibersihkan; `multiProviderToggleChecked` (pemboleh ubah yatim) dibuang.
- **Pembetulan kritikal semasa audit:** (1) `multiProviderToggleChecked` masih dirujuk di `config.js` selepas pemboleh ubahnya dibuang → `ReferenceError`; dibuang. (2) `patch.providers = {}` dalam `collectConfigPatch()` akan MENGGANTI seluruh peta `providers` dan memadam kunci pembekal lain → kini MERGE (`Object.assign`) dalam gelung aplikasi patch `buildConfigFromForm()`.
- **Kontrak Payload:** TIADA PERUBAHAN SKEMA — medan `multiProviderEnabled`/`mainProvider`/`secondaryProviderEnabled`/`secondaryProvider`/`providers.<key>.{apiKey,model,baseUrl}` kekal sama; hanya sumber nilai berubah (DOM legasi → `currentConfig`).
- **Status pengesahan:** `node --check` LULUS untuk `public/config.js`, `public/js/trinity-agents.js`, `public/js/quick-setup.js`. Imbasan `public/` — TIADA id legasi tinggal dalam kod. `npm test` TIDAK dijalankan (di luar domain Frontend).
- **Next Steps:** Integration Review Backend (GLM 5.3) — sahkan serialisasi payload, perlumbaan rehidrasi, dan keserasian skema pelayan sebelum sebarang commit.

---

## 2026-10-13 (BRAINSTORMING) — FRONTEND UI/UX PROPOSAL: SECONDARY FALLBACK PROVIDER

- **Tarikh:** 2026-10-13 (23:02 MYT)
- **Mod:** Frontend (Kimi K3) — sesi brainstorming Owner-supervised; TIADA kod produksi disentuh
- **Keputusan Owner (pending):** Menunggu keputusan muktamad Owner + Backend Lead (GLM 5.3)
- **Fail Terlibat (cadangan sahaja):** `plans/frontend-secondary-fallback-ui-proposal.md` (laporan lengkap)
- **Ringkasan:** Audit kod legasi (`main.html` ~1067-1148, ~2443-2465; `config.js` ~9071-9243, ~13207-13302) vs Trinity (`public/js/trinity-agents.js`, `public/css/trinity-agents.css`). Dapatan: kotak semak hantu `#enableSecondaryProvider` wujud tetapi tiada medan kunci/model/baseUrl untuk provider sekunder; keseluruhan seksyen digated oleh beta mode. Cadangan: sub-seksyen collapsible "🛟 Secondary Fallback Provider" dalam kad Agent Translation (Pilihan A), mengguna semula pola komponen Trinity (togol, input kunci 🔒/👁️, butang ✓ Test, dropdown model, Base URL kondisional). Pelan pembersihan elemen legacy dan mitigasi rehidrasi/race DOM lifecycle disertakan.
- **Status npm test:** N/A — brainstorming sahaja
- **Next Steps:** Owner gabungkan dengan laporan backend untuk keputusan muktamad; jika diluluskan, frontend implementasi + handover ke backend untuk integration review.

---

## 2026-10-13 (RELEASE v3.9.31) — HARDCODE PURGE: DYNAMIC 3-TIER AGENT B INJECTION + GRACEFUL BYPASS

- **Tarikh:** 2026-10-13 (22:22 MYT)
- **Komit SHA:** `db31604` (push de7e6c2..db31604 ke origin main; CI run id 38412959351 — **SUCCESS** hijau)
- **Keputusan Owner (Mandat Backend):** Siasatan & pembersihan kod hardcoded bagi Agent Preflight (Kimi-K3) & Agent Inspector (DeepSeek-V4-Pro/rootsys) — saki-baki fasa ujian awal pra-Web UI Trinity. Audit imbasan `src/`: TIADA kunci API mentah (`sk-` sebenar) dalam kod (semua padanan = fixture ujian dummy / heuristik keyDetector); `rootsys.cloud` tinggal dalam komen forensik sahaja. Hardcode sebenar = nama model lalai statik — DIGUGURKAN sepenuhnya.
- **Fail Terlibat:** `src/utils/config.js` (blok agentB dibina semula: 3-tier trinity UI → agentB langsung → env `AGENT_B_*`/`PREFLIGHT_*`/`INSPECTOR_*` → bypass; flag ema per-fasa `preflightEnabled`/`inspectorEnabled`; hygiene melumpuhkan Agent B tanpa model), `src/handlers/subtitles.js` (pembinaan AgentBInspector tanpa lalai statik + log bypass senyap), `src/services/agentBInspector.js` (konstanta lalai → `''`; guard bypass `runPreflightPass`/`runSemanticInspection` tanpa panggilan rangkaian), `src/services/channels/openaiChannel.js` (fallback statik digugurkan), `src/services/agentB-inspector-regression.test.js` (20+ ujian → kontrak dinamik suntikan eksplisit), `.env.example` (dokumentasi 3-tier + alias env Trinity baharu, tiada kunci sebenar), `package.json` (3.9.30 → 3.9.31), `CHANGELOG.md`, `graphify-out/`.
- **Graceful bypass:** Preflight kosong → `[INFO] [Preflight] Skipped (not configured / disabled by user)`; Inspector kosong → `[INFO] [AgentB] Inspector skipped (not configured / disabled by user)` — terjemahan Agent A jalan terus, tiada audit paksa.
- **Status npm test:** **368 tests — 367 PASS, 0 FAIL, 1 SKIP** (live Redis) — selari baseline ✓; monotonic ✓. Prettier ✓; ESLint 0 error (221 warning pra-wujud) ✓. Cache-buster runtime = 3.9.31 ✓. graphify update (5039 nodes, 10920 edges) ✓. Tiada fail `public/` disentuh.
- **Next Steps:** Git commit + push + CI verify.

## 2026-10-13 (RELEASE v3.9.30) — VIDEOLINGO-GRADE PERSONA & REFLECT-IN-ONE-PASS (AGENT A PROMPT)

- **Tarikh:** 2026-10-13 (21:24 MYT)
- **Komit SHA:** `e95eef3` (push 819ece0..e95eef3 ke origin main; CI run id 38404886262 — **SUCCESS** hijau)
- **Keputusan Owner (Mandat Backend):** Audit deep-scan nota VideoLingo (`plans/ground-truth-videolingo-vs-srtaitranslator-full.md`, `plans/videolingo-sampling-ground-truth.md`) disusuli mandat Opseyen 2 — integrasi persona VideoLingo + prinsip adaptasi budaya + teknik two-step mental reflection dalam SATU panggilan API (Reflect-in-One-Pass). Dua mandat kekal: ID pariti 100% (no desync) + kualiti ayat Netflix. Verbatim penuh prompt VideoLingo DITOLAK dalam audit (kontrak JSON konflik fatal dengan XML contract SubFaber; tiada [br] preservation; two-pass mahal).
- **Fail Terlibat:** `src/services/translationEngine.js` — `createXmlBatchPrompt()` systemPart sahaja: (1) Role generik diganti persona "professional Netflix subtitle translator, fluent in both ${sourceLabel} and ${targetLabel}, as well as their respective cultures" + kefahaman slanga/humor/metafora/subteks emosi; (2) blok `<translation_principles>` baharu (idiomatic fidelity + natural conversational flow); (3) bahagian Style "Reflect-in-One-Pass" — mental draft → reflect as native speaker → emit final only, dilarang output draf/teks berfikir. `package.json` (3.9.29 → 3.9.30), `CHANGELOG.md`, `graphify-out/`.
- **InvariAN 100% kekal:** kontrak `<answer><s id="N">` + prefill anchor `<s id="START">` (tiada JSON); rule PRESERVE [br]/<i>/dash (kiraan terkunci, reposisi adaptif); formula keramat 4+50+2 (`SUBFABER_BATCH_SIZE=50`, window 4/2); Agent B 6-crime inspector; tiada fail `public/` disentuh; assertion regression lama (parity sacred, native speaker, never inject titles) semua dipenuhi tanpa ubah test.
- **Status npm test:** **368 tests — 367 PASS, 0 FAIL, 1 SKIP** (live Redis) — selari baseline ✓. Prettier ✓; ESLint 0 error (6 warning pra-wujud) ✓; graphify update (5034 nodes, 10913 edges) ✓.
- **Next Steps:** Git commit + push + CI verify.

## 2026-10-12 (RELEASE v3.9.29) — DYNAMIC BASE URL INJECTION: USER CONFIG → GEMINI SERVICE

- **Tarikh:** 2026-10-12 (03:35 MYT)
- **Komit SHA:** `8e21b23` (push 52588c9..8e21b23 ke origin main; CI run id 38168653588 — **SUCCESS** hijau)
- **Keputusan Owner (mandat seni bina):** v3.9.28 membuktikan baseUrl Web UI (Custom/Proxy) TIDAK disuntik ke GeminiService — permintaan pergi ke Google rasmi melainkan env global diset. Mandat: suntik baseUrl pengguna secara dinamik; keutamaan `userConfig.baseUrl` → `process.env.GEMINI_API_BASE` → Google rasmi; multi-user mesra (tiada kunci pada .env global).
- **Fail Terlibat:**
  - `src/utils/config.js` — medan baharu `geminiBaseUrl` (sumber: medan langsung ATAU `trinity.translation.baseUrl` UI), sanitasi SSRF-lite (`http(s)` sahaja, nilai lain dibuang senyap).
  - `src/services/gemini.js` — constructor menerima `advancedSettings.baseUrl`; keutamaan tiga lapis; melalui `sanitizeGeminiBaseUrl()` (trailing-slash, `/v1beta` berganda, auto-append root-form).
  - `src/services/translationProviderFactory.js` — `getGeminiAdvancedSettings()` menyuntik `config.geminiBaseUrl`; `createProviderInstance('gemini')` menerima `providerConfig.baseUrl`/`providerParams.baseUrl`; `findSecondaryConfig('gemini')` membawa baseUrl (fallback secondary).
  - `src/handlers/subtitles.js` — `keyRotationConfig.advancedSettings` membawa `baseUrl` supaya setiap instance GeminiService semasa rotasi kunci menghormati gateway pengguna.
- **Kontrak Payload:** TIADA BERUBAH — medan `baseUrl` hanya dalam advancedSettings (bukan payload Gemini REST); systemInstruction top-level kekal; tiada parameter pensampelan disentuh; tiada fail `public/` disentuh.
- **Status npm test:** **368 tests — 367 PASS, 0 FAIL, 1 SKIP** (live Redis) — selari baseline ✓. Prettier ✓; ESLint 0 error (warning pra-wujud) ✓; graphify update (5029 nodes, 10907 edges) ✓.
- **Next Steps:** Git commit + push + CI verify.

## 2026-10-12 (RELEASE v3.9.28) — HOTFIX: STREAM CIRCULAR JSON + PROXY ROOT-FORM baseUrl + MISCONFIG GUARD

- **Tarikh:** 2026-10-12 (03:19 MYT)
- **Komit SHA:** `d869930` (push 35f560a..d869930 ke origin main; CI run id 38167550852 — **SUCCESS** hijau)
- **Keputusan Owner (forensik log produksi v3.9.27):** Log debug baharu membongkar dua punca: (1) payload 400 `domain: googleapis.com` — kunci `sk-` gateway dihantar ke Google rasmi kerana `GEMINI_API_BASE` tidak diset; (2) `Converting circular structure to JSON` — `JSON.stringify` pada `error.response.data` ReadableStream (laluan stream) throw TypeError yang menelan ralat 400 asal. Contoh curl admin gateway disahkan: root `https://crazyrouter.com` + `/v1beta/...` + `?key=`.
- **Fail Terlibat:** `src/services/gemini.js` — `logGemini400Debug()` dibungkus try/catch safe-stringify (fallback teks ringkas, ralat asal kekal); `sanitizeGeminiBaseUrl()` append `/v1beta` automatik untuk root-form URL; constructor guard — amaran jelas bila kunci `sk-` + baseUrl googleapis.com (misconfiguration). `.env.example` — dokumentasi `GEMINI_API_BASE` baharu untuk gateway Gemini-native. `package.json` (3.9.27 → 3.9.28), `CHANGELOG.md`, `docs/SESSION_LEDGER.md`, `graphify-out/`.
- **Kontrak Payload:** TIADA BERUBAH — hanya pertahanan logging/sanitasi; systemInstruction top-level kekal; tiada parameter pensampelan disentuh.
- **Status npm test:** **368 tests — 367 PASS, 0 FAIL, 1 SKIP** (live Redis) — selari baseline ✓. Prettier ✓; ESLint 0 error ✓; graphify update (5024 nodes, 10899 edges) ✓.
- **Next Steps:** Git commit + push + CI verify. NOTA OPERASI: owner mesti set `GEMINI_API_BASE=https://crazyrouter.com` (dan kunci `sk-` gateway) dalam env deployment — tanpa itu, token gateway akan terus ditolak oleh Google.

## 2026-10-11 (RELEASE v3.9.27) — GEMINI NATIVE 400 BAD REQUEST: DEBUG PAYLOAD, SANITASI baseUrl, DEFENSIVE countTokens, BEARER PROKSI

- **Tarikh:** 2026-10-12 (02:57 MYT)
- **Komit SHA:** `bd7901a` (push a010cb1..bd7901a ke origin main; CI run id 38166044989 — **SUCCESS** hijau)
- **Keputusan Owner:** Siasat & pembetulan 400 Bad Request Gemini Native (dipercayai melalui proksi gateway) — 4 mandat: (1) cetak response body penuh ralat 400; (2) sanitasi baseUrl (`/v1beta` berganda, `models/` berganda); (3) kegagalan countTokens/model-limits TIDAK membatalkan terjemahan; (4) header `Authorization: Bearer` untuk custom baseUrl dengan kunci `sk-`. Ground truth disiasat terperinci daripada docs.crazyrouter.com/llms.txt + halaman Gemini-native: endpoint proksi hanya `POST /v1beta/models/{model}:generateContent|streamGenerateContent`, auth menerima `?key=` URL param.
- **Fail Terlibat:** `src/services/gemini.js` (satu-satunya fail kod): `logGemini400Debug()` baharu mencetak `JSON.stringify(err.response?.data)` pada setiap catch 400 (countTokens, getModel ×2, generateContent, streamGenerateContent); `sanitizeGeminiBaseUrl()` meruntuhkan trailing-slash + `/v1beta` berganda; `normalizeGeminiModelId()` kini `/^(?:models\/)+/i` (anti `models/models/`); `getAuthHeaders()` menghantar `Authorization: Bearer` bersama `x-goog-api-key` bila host bukan googleapis.com DAN kunci `sk-`; fallback countTokens/model-limits kekal senyap (tiada perubahan aliran, hanya log tambahan). `package.json` (3.9.26 → 3.9.27), `CHANGELOG.md` (header v3.9.27), `docs/SESSION_LEDGER.md` (blok ini), `graphify-out/` (topologi).
- **Kontrak Payload:** TIADA BERUBAH — systemInstruction kekal top-level { parts: [{ text }] }; tiada parameter pensampelan/thinkingBudget disentuh; topK kekal diharamkan; ujian purge `no crazyrouter references` kekal hijau (semua komen baharu guna istilah generik "gateway proksi pihak ketiga").
- **Status npm test:** **368 tests — 367 PASS, 0 FAIL, 1 SKIP** (live Redis) — selari baseline; jumlah monotonic ✓. Prettier ✓ (semua fail); ESLint **0 error** (221 warning pra-wujud) ✓; cache-buster: versi dijana runtime ✓; graphify update . berjalan (5020 nodes, 10891 edges, 250 communities) ✓.
- **Next Steps:** Git commit + push origin main + verify CI hijau.

## 2026-10-11 (RELEASE v3.9.26) — PROMPT AGENT A: "STREAMING-GRADE" → "CINEMA-GRADE"

- **Tarikh:** 2026-10-11 (19:19 MYT)
- **Komit SHA:** `be52fdd` (push ac40744..be52fdd ke origin main; CI run id 38163355501 — **SUCCESS** hijau)
- **Keputusan Owner:** Tukar arahan kualiti bahasa dalam seksyen `## Style` prompt Agent A — "at streaming-grade quality" → "at cinema-grade quality" — menaik taraf siling jangkaan kualiti terjemahan kepada tahap pawagam.
- **Fail Terlibat:** `src/services/translationEngine.js` (satu-satunya kemunculan "streaming-grade" dalam `src/` — perubahan leksikal satu frasa dalam templat prompt; klausa lain tak tersentuh), `package.json` (bump 3.9.25 → 3.9.26), `CHANGELOG.md`, `docs/SESSION_LEDGER.md`, `graphify-out/` (topologi).
- **Kontrak Payload:** TIADA BERUBAH — literal teks prompt sahaja; systemInstruction kekal top-level; tiada parameter pensampelan/thinkingBudget diubah; no test fixture bergantung pada frasa tersebut (dipahkan oleh regresi penuh).
- **Status npm test:** **368 tests — 367 PASS, 0 FAIL, 1 SKIP** (live Redis) — selari baseline; jumlah monotonic ✓. Prettier ✓; ESLint 0 error (221 warning pra-wujud) ✓; cache-buster: tiada versi hardcoded dalam src/ (dijana runtime daripada package.json) ✓; graphify update . berjalan (5013 nodes, 10874 edges) ✓.
- **Next Steps:** CI verification GitHub Actions (npm test + prettier + eslint + audit, Node 22/24).

## 2026-10-11 (RELEASE v3.9.25) — HOTFIX: SAVE GAGAL "Please select a Gemini model" WALAUPUN MODEL TRINITY DIPILIH

- **Tarikh:** 2026-10-11 (16:10 MYT)
- **Komit SHA:** `1b5b28c` (push 7090402..1b5b28c ke origin main; CI run id 38154385645 — **SUCCESS** hijau)
- **Keputusan Owner (laporan pengguna):** Config tidak boleh disimpan walaupun model telah dipilih pada kad Trinity — banner ralat "Please select a Gemini model" muncul semasa Save Configuration.
- **Punca Akar:** `saveCurrentConfig` → `buildConfigFromForm()` membina `selectedGeminiModel` daripada dropdown **legacy** `#geminiModel` (kad Gemini disembunyikan oleh Trinity UI — nilai kosong). Walaupun `TrinityAgents.collectConfigPatch()` mengisi `currentConfig.geminiModel` dengan betul (baris 12741), nilai itu **ditimpa** oleh `config.geminiModel = selectedGeminiModel` (string kosong) pada literal payload. Pengesahan `validateGeminiModel()` (baris 13141) turut membaca `#geminiModel` legacy — dua-dua laluan gagal serentak. Kunci API tidak terjejas kerana jambatan `effectiveGeminiKey` (baris 12823) wujud — tetapi **tiada jambatan setara untuk model**.
- **Fix — Trinity Model Bridge (cermin jambatan kunci API):** dalam `buildConfigFromForm`, selepas blok sinkronisasi kunci legasi: (1) baca `trinity.translation.model` daripada `trinityPayload` (sudah digabung daripada `collectConfigPatch`); (2) sinkronkan dropdown legacy `#geminiModel` — nilai disuntik sebagai `<option>` jika tiada dalam senarai, kemudian `.value` ditetapkan (supaya `validateGeminiModel()` membaca nilai sama); (3) `selectedGeminiModel = normalizeGeminiModelForBaseSelect(trinityTranslationModel || legacy)`. **Pembetulan kedua (dikesan oleh E2E):** blok asal diletakkan SEBELUM pengisytiharan `trinityPayload` → `ReferenceError: Cannot access 'trinityPayload' before initialization` — disusun semula SELEPAS blok tersebut.
- **Fail Terlibat:** `public/config.js` (`buildConfigFromForm` — Trinity Model Bridge selepas blok effectiveGeminiKey; kedudukan TDZ diperbetulkan).
- **Verifikasi E2E Playwright (localhost:7001/configure):** kunci + model Trinity `gemini-3-flash-preview` dipilih, legacy `#geminiModel` dikosongkan, butang Save Configuration diklik dengan fetch `/api/update-session` dicegat: **payload `geminiModel: "gemini-3-flash-preview"`** ✓, `trinity.translation.model` konsisten ✓, dropdown legacy disinkronkan ✓, **`errorBanner: false`** (tiada mesej ralat) ✓, **0 ralat konsol** terkini ✓ (ralat TDZ lama pada sesi sebelumnya ialah bukti E2E mengesan bug susunan asal sebelum diperbetulkan). `node --check` ✓ + Prettier ✓ + ESLint **0 error** (35 warning pra-wujud). TIADA npm test/git (peraturan #5).
- **Kontrak Payload:** TIDAK BERUBAH — `geminiModel` kekal string nama model (normalized); backend `normalizeConfig` menerima seadanya. Jambatan hanya memastikan nilai select Trinity sampai ke medan yang sama seperti sebelum Trinity wujud.
- **Next Steps:** Backend Integration Audit → release v3.9.25.

## 2026-10-11 (RELEASE v3.9.24) — TRINITY FASA V: IKON MANGGA/MATA & GELUNG HIJAU KUNCI UTAMA

- **Tarikh:** 2026-10-11 (15:25 MYT)
- **Komit SHA:** `1283f87` (push 4cfa2a2..1283f87 ke origin main; CI run id 38151217719 — **SUCCESS** hijau)
- **Keputusan Owner:** (1) Togol ikon mangga semasa password & mata semasa text (buang eye-slash generik) pada kunci utama DAN semua baris Additional API Keys — auto-switch apabila diklik. (2) Konsistensi gelung hijau/merah pada kotak kunci utama — `.is-valid`/`.is-invalid` disapukan dalam `runAgentValidate` (valid/invalid/catch) dan dibersihkan semula apabila nilai ditaip.
- **Fail Terlibat:**
  - `public/js/trinity-agents.js`: (a) `eyeIconSvg(hidden)` kini memulangkan **Lock SVG** (rect+shackle) semasa `hidden=true` (password) dan **Eye SVG** semasa kelihatan — eye-slash dibuang sepenuhnya; digunakan di kunci utama + baris; (b) `runAgentValidate` — `keyInput.classList` `.is-valid` (cabang valid) / `.is-invalid` (cabang invalid + catch), kelas bertentangan dibuang dahulu; (c) `wireAutodetect.refresh` — reset `is-valid/is-invalid` pada setiap input (menaip/kosong membatalkan status ujian terdahulu).
  - `public/css/trinity-agents.css`: pemilih status border diluaskan + dinaikkan kekhususan kepada rantai `.trinity-field` (0,7,0) dengan `!important` — `.trinity-field .trinity-key-entry .trinity-key-input.is-valid/.is-invalid, .trinity-field .trinity-input-wrap .trinity-key-input.is-valid/.is-invalid`. NOTA AUDIT: tahap (0,3,0) TIDAK mencukupi pada input kunci utama — `rootify.css`/`subfaber-theme.css` menetapkan shorthand `border: var(--border) !important` generik; (0,7,0) adalah tahap minimum yang terbukti menang (ujian empirikal suntikan).
- **Verifikasi E2E Playwright (localhost:7001/configure):** ikon utama: password/rect(mangga) → klik → text/circle(mata) → klik → password/rect ✓; baris kunci: peralihan sama ✓; kunci utama `is-valid` → computed `rgb(21,128,61)` + `rgba(21,128,61,0.18) 0 0 0 2px` ✓; `is-invalid` → `rgb(185,28,28)` + shadow merah ✓; **`uniform: true`** — kunci utama & baris sepadan tepat ✓; taip semula → kelas dibersihkan ✓; **0 ralat konsol** ✓; tangkapan skrin `v3924-lock-eye-green-loop.png`. Pelayan dimulakan semula (kill-port 7001) untuk cache in-memory templat — peraturan #20 dipatuhi (tiada taskkill global). `node --check` ✓ + Prettier ✓ + ESLint **0 error**. TIADA npm test/git (peraturan #5).
- **Kontrak Payload:** TIADA BERUBAH — kelas CSS status semata-mata; tiada medan config baharu; `collectConfigPatch` tidak terjejas.
- **Next Steps:** Backend Integration Audit → release v3.9.24.

## 2026-10-11 (RELEASE v3.9.23) — TRINITY FASA IV: BUTANG TEST PER-KUNCI + BORDER STATUS + SVG EYE + SERAGAM 'TEST'

- **Tarikh:** 2026-10-11 (14:42 MYT)
- **Komit SHA:** `03b12d2` (push 419c6dd..03b12d2 ke origin main; CI run id 38148342499 — **SUCCESS** hijau)
- **Keputusan Owner:** (1) Buang emoji monyet 🙈 — ikon mata SVG profesional (eye/eye-slash, stroke currentColor). (2) Kembalikan butang Test per-baris Additional API Keys — susunan [input][mata][test][padam]; klik → POST /api/validate-provider dengan konteks agent (provider/door/baseUrl custom); spinner '…' semasa menguji; sah → border input HIJAU + butang ✓ hijau; tidak sah → border MERAH + butang ✕ merah + toast "Invalid API key — <mesej>". (3) Seragamkan butang utama "Validate" → "Test" (ikon ✓ kekal). (4) Butang ikon padat petak seragam 32px.
- **Fail Terlibat:**
  - `public/js/trinity-agents.js`: (a) helper `eyeIconSvg(hidden)` — dua varian SVG (open/slash) digunakan di medan API Key utama DAN setiap baris kunci (emoji 👁/🙈 dibuang sepenuhnya); (b) label butang utama `Validate` → `Test` (dataset.agentValidate kekal untuk wireValidate); (c) `addRotationKeyInput` — tambah butang `.trinity-key-test-btn` (✓) antara mata dan padam; (d) fungsi baharu `testRotationKey(agentKey, input, testBtn)` — baca konteks provider/door/baseUrl kad (sama seperti runAgentValidate), fetch `/api/validate-provider`, kelas `.is-valid`/`.is-invalid` pada input + butang, kunci kosong → invalid serta-merta tanpa rangkaian, `showAlert` toast bila tersedia; butang disabled semasa ujian (spinner '…').
  - `public/css/trinity-agents.css`: (a) `.trinity-key-icon-btn` — petak 32×32 flex, radius 6px, border subtle, hover; (b) `.trinity-key-test-btn.is-valid` (hijau #15803d) / `.is-invalid` (merah #b91c1c); (c) status border `.trinity-key-entry .trinity-key-input.is-valid/.is-invalid` dengan **!important** — WAJIB kerana `subfaber-theme.css` & `rootify.css` menetapkan border + `box-shadow:none` generik input dengan `!important` (punca sebenar border tidak berubah dikesan semasa E2E: computed kekal rgb(236,239,244) walaupun kekhususan (0,3,0)).
- **Verifikasi E2E Playwright (localhost:7001/configure):** struktur baris [INPUT][BUTTON eye][BUTTON test][BUTTON ×] ✓; label utama "✓Test" ✓; **tiada emoji 🙈 dalam DOM** ✓; eye = SVG ✓; kunci kosong → is-invalid/✕ tanpa rangkaian ✓; kunci palsu → spinner '…' semasa fetch → is-invalid/✕ (satu log rangkaian HTTP 400 — maklumat DevTools standard untuk respons 4xx ujian kunci tidak sah, BUKAN pengecualian JS; 0 ralat JavaScript) ✓; computed border: invalid `rgb(185,28,28)` + shadow merah, valid `rgb(21,128,61)` + shadow hijau ✓; tangkapan skrin `v3923-key-test-borders.png`. `node --check` ✓ + Prettier ✓ + ESLint **0 error**. TIADA npm test/git (peraturan #5).
- **Kontrak Payload:** TIADA BERUBAH — ujian per-baris bersifat baca-sahaja (POST /api/validate-provider); tiada medan config baharu; endpoint sedia ada menerima {provider, apiKey, door, baseUrl} (skema sejak v3.9.7).
- **Next Steps:** Backend Integration Audit → release v3.9.23.

## 2026-10-11 (RELEASE v3.9.22) — TRINITY FASA III: DEDUPLIKASI KUNCI PINTAR + BUTANG MATA PER-BARIS + POLISH 4 BUTANG

- **Tarikh:** 2026-10-11 (13:54 MYT)
- **Komit SHA:** `f57a91e` (push 6118d09..f57a91e ke origin main; CI run id 38145033124 — **SUCCESS** hijau)
- **Keputusan Owner:** (1) Smart deduplication dalam modal Bulk Import — saring kunci pendua terhadap API Key utama + senarai Additional API Keys sedia ada + dedup dalaman tampal; mesej status bilangan diimport/disaring. (2) Butang mata (visibility toggle) untuk setiap baris Additional API Keys (password/text + ikon sepadan). (3) Polish profesional 4 butang: + Add Key & Bulk Import… (bekas flex gap 10px/margin-top 10px, butang sekunder moden 6px 14px/radius 6px/hover); Cancel & Import modal (footer justify-end gap 12px/margin-top 16px; Cancel neutral 8px 16px; Import primer biru SubFaber 8px 18px + bayang lembut + hover).
- **Fail Terlibat:**
  - `public/js/trinity-agents.js`: (a) callback `window.BulkKeyImport.open` dalam `buildKeyRotationRow` kini melakukan **dedup silang** — Set diisi dengan nilai `#trinity-{agent}-key` (primary) + semua `.trinity-key-input` sedia ada; hanya kunci unik baharu dipanggil `addRotationKeyInput`; callback memulangkan `{imported, skipped}`; (b) modal Import handler — modal **kekal terbuka** selepas import berjaya dengan status `is-success` hijau "Imported X keys · Y duplicates filtered out.", textarea dikosongkan (anti re-import ganda); status error kekal merah `is-error`; `closeBulkImportModal` menetap semula kelas status; (c) `addRotationKeyInput` — setiap baris kini menyertakan butang mata `.trinity-eye-btn` (👁 password / 🙈 text, aria-label dinamik) sebelum butang × padam; (d) kelas butang + Add Key/Bulk Import…/Cancel/Import ditukar daripada `btn-sm btn-secondary/btn-primary` generik kepada `.trinity-btn-secondary`/`.trinity-btn-primary` berdedikasi.
  - `public/css/trinity-agents.css`: `.trinity-keys-actions` (gap 10px, margin-top 10px); `.trinity-btn-secondary` (padding 6px 14px, radius 6px, border subtle, hover/active); `.trinity-btn-primary` (biru #2563eb jenama, teks putih, padding 8px 18px, radius 6px, bayang lembut, hover/active); `.trinity-bulk-actions` (justify-end, gap 12px, margin-top 16px); `.trinity-bulk-status` dipecah `.is-error` (merah) / `.is-success` (hijau); `.trinity-key-entry .trinity-eye-btn` (padding/radius seragam baris).
- **Verifikasi E2E Playwright (localhost:7001/configure):** primary P + existing E disediakan; tampal 5 baris (P, E, N1, M, N1) → **"Imported 2 keys · 2 duplicates filtered out."** (parser menapis dup dalaman N1; callback menapis P+E; baris akhir E/N/M = 3) ✓; modal kekal terbuka dengan status `is-success` ✓; butang mata: password/👁 → text/🙈 → password/👁 ✓; computed style bekas butang `gap:10px; margin-top:10px`, butang `padding:6px 14px; border-radius:6px` ✓; **0 ralat konsol** ✓; tangkapan skrin `v3922-bulk-modal-polish.png`. `node --check` ✓ + Prettier ✓ + ESLint **0 error**. TIADA npm test/git (peraturan #5).
- **Kontrak Payload:** TIDAK BERUBAH — `geminiApiKeys` kekal string[] daripada `.trinity-key-input`; dedup hanya menapis kemasukan UI (backend `normalizeConfig` turut dedup — pertahanan dua lapisan selari).
- **Next Steps:** Backend Integration Audit → release v3.9.22.

## 2026-10-11 (RELEASE v3.9.21) — TRINITY FASA II: PULIHAN <select> MODEL + MODAL BULK IMPORT BERFUNGSI

- **Tarikh:** 2026-10-11 (09:48 MYT)
- **Komit SHA:** `06026f9` (push 8c05936..06026f9 ke origin main; CI run #298 id 38129678487 — **SUCCESS** hijau)
- **Keputusan Owner:** (1) Kembalikan dropdown Model `<select>` piawai (buang input+datalist v3.9.20); nilai disimpan/disegerakkan ke config payload. (2) Selesaikan butang "Bulk Import…" yang tidak berfungsi — modal textarea + import kunci automatik ke baris "Additional API Keys".
- **Langkah 0 Integration Audit (Backend):** LULUS — (a) Payload: `collectConfigPatch` membaca `.value` `#trinity-{agent}-model` (API seragam select/input); rotation patch (`geminiKeyRotationEnabled`/`geminiKeyRotationMode`/`geminiApiKeys`) tak berubah, disahkan E2E 3 kunci. (b) Rehydration: `ensureModelOption` menjamin nilai stored melekat pada `<select>`; anti-duplikasi keysList v3.9.20 kekal. (c) Race/lifecycle: modal dijana sekali (guard `document.body.contains`), butang confirm di-clone setiap pembukaan (anti-listener-belonggok), modal dalam `document.body` (selamat daripada `renderCards()` reset), `window.BulkKeyImport` dipasang pada load IIFE.
- **Fail Terlibat:** `public/js/trinity-agents.js` (Model `<select>` + `populateModelDropdown` option-based + `ensureModelOption` + modal bulk import dinamik + bridge `window.BulkKeyImport`), `public/css/trinity-agents.css` (gaya `.trinity-bulk-*`; `.trinity-model-input` digantikan), `package.json` (3.9.20 → 3.9.21), `CHANGELOG.md` (header v3.9.21), `docs/SESSION_LEDGER.md` (blok ini).
- **Status pipeline:** Prettier ✓ (semua fail, termasuk package.json reformat) + ESLint **0 error** (warning pra-wujud sahaja) + npm test **368 tests / 367 PASS / 0 FAIL / 1 SKIP** — baseline kekal (monotonic >= 367). Graphify: DIJALANKAN — rebuilt 4988 nodes / 10818 edges / 233 communities. E2E Playwright 6/6 lulus, **0 ralat konsol**.
- **Next Steps:** Git commit + push origin main + verify CI hijau.

## 2026-10-11 (FASA II — FRONTEND HANDOVER) — PULIHKAN <select> MODEL + SELESAIKAN MODAL BULK IMPORT TRINITY

- **Tarikh:** 2026-10-11 (09:43 MYT)
- **Komit SHA:** (menunggu serahan Backend — handover Frontend)
- **Keputusan Owner:** (1) Buang `<input list>` + `<datalist>` Model; kembalikan `<select>` piawai dalam `buildAgentCard`; kemas kini `populateModelDropdown` untuk mengisi `<option value>`; nilai model mesti disimpan/disegerakkan ke config payload. (2) Selesaikan butang "Bulk Import…" yang tidak berfungsi: pastikan modal terbuka dengan textarea, dan kunci yang diimport masuk terus ke baris "Additional API Keys".
- **Punca Akar (2):** (a) Tugasan 1 — implementasi datalist v3.9.20 digantikan atas mandat owner dengan `<select>` bersih. (b) Tugasan 2 — butang merujuk `window.BulkKeyImport.open` yang TIDAK PERNAH wujud (hanya `console.warn`); skrip `bulk-key-import.js` memang dimuatkan dalam `configure.html:214` tetapi hanya mengeksport `window.SubMakerBulkKeyImport` (parser tulen, tanpa DOM); modal legacy dalam `config.js` (openBulkImportModal) mensasarkan DOM legacy `#geminiApiKeysList` yang disembunyikan oleh Trinity — salah sasaran untuk UI Trinity.
- **Fail Terlibat:**
  - `public/js/trinity-agents.js`: (a) `buildAgentCard` — Model kini `<select class="trinity-model-select">` dengan placeholder "— Select model —"; datalist dibuang sepenuhnya. (b) `populateModelDropdown` — mengisi `<option>` (dedup + strip `models/` + placeholder); nilai sedia ada dipelihara sebagai option tambahan supaya `.value` melekat. (c) Helper baharu `ensureModelOption(select, value)` — `applyAgentValues` memanggilnya sebelum set `.value` (stored.model + legacy cfg.geminiModel) — memastikan rehydrate `<select>` berfungsi walaupun model tiada dalam katalog. (d) Modal bulk import dinamik baharu: `ensureBulkImportModal` / `openBulkImportModal` / `closeBulkImportModal` — overlay + textarea + status + Import/Cancel; tutup via Escape/klik overlay; parser zero-network `window.SubMakerBulkKeyImport.parseBulkKeys`; confirm di-clone setiap pembukaan (anti-pendengar-berlonggok); callback `onKeys` → `addRotationKeyInput`. (e) Bridge global `window.BulkKeyImport = { open }` — kontrak yang dijangka butang sedia ada (baris 419) kini dipenuhi. `collectConfigPatch` TIDAK diubah (`.value` `<select>` bersifat seragam dengan input).
  - `public/css/trinity-agents.css`: blok `.trinity-model-input` digantikan dengan gaya modal baharu (`.trinity-bulk-modal[.show]`, `.trinity-bulk-box`, `.trinity-bulk-textarea`, `.trinity-bulk-status`, `.trinity-bulk-actions`); `.trinity-model-select` sudah bergaya sedia ada (baris 182).
- **Verifikasi E2E Playwright (localhost:7001/configure):** (1) Model = tag SELECT, datalist tiada, id kekal `trinity-translation-model` ✓; (2) bridge + parser wujud ✓; (3) rotation ON → butang Bulk Import… → modal `.show` + textarea fokus ✓; (4) tampal 3 kunci (AIzaSy×2 + sk-) → Import → modal tutup + 3 baris `.trinity-key-input` diisi ✓; (5) `collectConfigPatch` → `geminiKeyRotationEnabled:true` + `geminiApiKeys` (3 kunci) + `trinity.translation.model` mencerminkan pilihan `<select>` ✓; (6) **0 ralat konsol** sepanjang aliran ✓. `node --check` ✓ + Prettier ✓ + ESLint **0 error**. TIADA npm test/git (peraturan #5).
- **Kontrak Payload:** TIDAK BERUBAH berbanding v3.9.20 — `trinity.{preflight,translation,inspector}.{apiKey,format,baseUrl,model,provider,door,isCustom,enabled}`, `geminiApiKey`, `geminiModel`, `geminiKeyRotationEnabled` (boolean), `geminiKeyRotationMode` ('per-batch'|'per-request'), `geminiApiKeys` (string[]). Modal Trinity menulis ke baris `.trinity-key-input` yang sama dikutip `collectConfigPatch` — tiada laluan payload baharu.
- **Next Steps:** Backend Integration Audit → release v3.9.21.

## 2026-10-11 (RELEASE v3.9.20) — TRINITY FASA I: SUSUNAN MEDAN CUSTOM + SEARCHABLE MODEL + PEMULIHAN KEY ROTATION

- **Tarikh:** 2026-10-11 (09:02 MYT)
- **Komit SHA:** `7528ce1` (push 9edb93c..7528ce1 ke origin main; CI run #38127083660 — **SUCCESS** hijau)
- **Keputusan Owner:** Mandat Fasa I: (1) susun semula medan Custom mengikut hierarki (Model di bawah Base URL & Format); (2) Model naik taraf kepada searchable/editable input (datalist); (3) pulihkan UI putaran kunci Gemini (checkbox + frequency + additional keys + bulk import modal).
- **Langkah 0 Integration Audit (Backend):** LULUS — payload rotation selari skema backend (`geminiKeyRotationEnabled` boolean, `geminiKeyRotationMode` enum, `geminiApiKeys` string[] — semua diterima normalizeConfig terus); model input mentah diterima (Custom model bebas); **FIX ANTI-DUPLIKASI** — `applyAgentValues` kini mengosongkan senarai keys (`keysList.innerHTML = ''`) sebelum rehydrate (config.js boleh memanggil rehydrate berulang kali — tanpa ini, kunci duplikasi pada setiap panggilan).
- **Fail Terlibat:** `public/js/trinity-agents.js` (susunan DOM baharu; `<input list>` + `<datalist>` untuk Model; `buildKeyRotationRow` + `addRotationKeyInput`; `updateVisibility` mengurus `.trinity-gemini-only`; rotation rehydration + collectConfigPatch rotation patch; audit fix anti-duplikasi), `public/css/trinity-agents.css` (`.trinity-gemini-only`, `.trinity-model-input`, gaya rotation/keys), `package.json` (3.9.19 → 3.9.20), `CHANGELOG.md` (header v3.9.20).
- **Verifikasi:** E2E Playwright 3/3 (Custom: URL idx 3 < Format idx 4 < Model idx 5; Model = INPUT + DATALIST; Gemini: rotation row + toggle → freq + keys). `node --check` + prettier ✓ + eslint **0 error** (221 warning pra-wujud) + npm test **368 tests / 367 PASS / 0 FAIL / 1 SKIP** — baseline kekal. Graphify: NO-OP.
- **Next Steps:** Push v3.9.20 → origin main, verify CI hijau.

## 2026-10-11 (FASA I — FRONTEND HANDOVER) — SUSUNAN MEDAN CUSTOM, SEARCHABLE MODEL, PEMULIHAN KEY ROTATION

- **Tarikh:** 2026-10-11 (08:56 MYT)
- **Komit SHA:** (menunggu serahan Backend — handover Frontend)
- **Keputusan Owner:** (1) Susun semula medan Custom: Provider → API Key → Base URL → Format/Door → Model (Model sentiasa di bawah); (2) Naik taraf Model kepada searchable/editable input (`<input list>` + `<datalist>` — taip untuk tapis masa nyata + input bebas tersuai); (3) Kembalikan UI putaran kunci Gemini (checkbox Enable + frequency per-batch/per-request + additional keys + bulk import modal).
- **Fail Terlibat:**
  - `public/js/trinity-agents.js`: (a) susunan DOM baharu dalam `buildAgentCard` — Model dipindah ke hujung (idx 5) selepas Format/Door (idx 4); (b) Model kini `<input type="text" list="...">` + `<datalist id="...">` dengan placeholder "Type to search or enter any model…"; `populateModelDropdown` dikemas kini untuk datalist (dedup + preserve nilai); (c) `buildKeyRotationRow` baharu — checkbox Enable Gemini API key rotation (ikat `geminiKeyRotationEnabled`), frequency select (ikat `geminiKeyRotationMode`), senarai keys dinamik (`addRotationKeyInput`) dengan butang + Add Key / × remove, butang Bulk Import… (sambung `window.BulkKeyImport.open` callback ke `addRotationKeyInput`); (d) `updateVisibility` kini juga mengurus `.trinity-gemini-only` (rotation row hanya untuk provider gemini); (e) `applyAgentValues` — rotation rehydration (toggle checked + mode + keys array) untuk stored provider gemini DAN legacy translation; (f) `collectConfigPatch` — rotation patch (`geminiKeyRotationEnabled`, `geminiKeyRotationMode`, `geminiApiKeys` array dari `.trinity-key-input`) dengan fallback false/[] apabila disabled.
  - `public/css/trinity-agents.css`: `.trinity-gemini-only { display: none }`, `.trinity-model-input` (gaya input model), `.trinity-rotation-toggle`, `.trinity-keys-list/.trinity-key-entry/.trinity-key-remove`, `.trinity-keys-actions`.
- **Verifikasi E2E Playwright (localhost:7001):** (1) Custom → Base URL idx 3 < Format idx 4 < Model idx 5 ✓; (2) Model = INPUT + DATALIST dengan 4 opsyen katalog ✓; (3) Gemini → rotation row muncul; toggle → frequency + keys muncul ✓. `node --check` + Prettier ✓ + ESLint **0 error**. TIADA npm test/git (peraturan #5).
- **Kontrak Payload:** rotation patch kekal selari skema backend v3.9.19 (`geminiKeyRotationEnabled` boolean, `geminiKeyRotationMode` enum, `geminiApiKeys` string[]). Bulk import callback memanggil `addRotationKeyInput` untuk setiap kunci yang diimport.
- **Next Steps:** Backend Integration Audit → release v3.9.20.

## 2026-10-11 (RELEASE v3.9.19) — SOKONGAN KUNCI GEMINI 'AQ.' + LAPORAN AUDIT KEY ROTATION

- **Tarikh:** 2026-10-11 (08:14 MYT)
- **Komit SHA:** `40a61bf` (push 3c9cd63..40a61bf ke origin main; CI run #38124224840 — **SUCCESS** hijau)
- **Keputusan Owner:** (1) Tugasan 1: kunci Google AI Studio terkini berawalan `AQ.` mesti dikenali sebagai Gemini Native oleh keyDetector; (2) Tugasan 2: audit penuh ciri key rotation (asal-usul, skema, status) untuk laporan Frontend.
- **Tugasan 1 — Fail Terlibat:** `src/services/channels/keyDetector.js` (`detectFromApiKey`: +corak `^AQ\.[A-Za-z0-9_-]+$` & `^AQ[A-Za-z0-9_-]+$` → FORMAT_GEMINI; AIza kekal diutamakan, sk-ant- anthropic, sk- generik jatuh baseUrl/model), `src/services/channels-keyDetector-regression.test.js` (+ujian AQ.: bentuk berbintik + tanpa bintik → gemini; ketidakrosakan AIza/sk-ant-/sk-; rentetan AQ-like rosak tidak dipadankan).
- **Tugasan 2 — AUDIT KEY ROTATION (laporan penuh dalam CHANGELOG v3.9.19):** (a) Asal-usul git: diperkenalkan v1.4.49 (2026-02-10) → v1.4.84; bulk import modal v1.5.8 (c7a4b42, 2026-09-22); kekal dalam Rootify v1.9.12; (b) Skema backend UTUH: `geminiApiKeys: string[]` (getDefaultConfig + normalizeConfig dedup/sanitasi), `geminiKeyRotationEnabled` + `geminiKeyRotationMode: per-request|per-batch` (lalai per-batch), `selectGeminiApiKey()` (Redis INCR `keyrotation:{hash}` TTL 24j / fallback memori; call-site handlers/subtitles.js:6691 + statistik batch :6303), `MAX_GEMINI_API_KEYS` env; (c) bulk-key-import.js frontend (korak AIzaSy 39-char + AQ.Ab8 + sk-) tidak disentuh. **Kesimpulan: enjin putaran penuh berfungsi — Frontend boleh memadankan UI terus kepada skema sedia ada tanpa perubahan backend.**
- **Status pipeline:** prettier ✓ + eslint **0 error** (221 warning pra-wujud) + npm test **368 tests / 367 PASS / 0 FAIL / 1 SKIP** — **BASELINE BAHARU** (>= 367 monotonic dipatuhi). Fail `public/` TIDAK disentuh. Graphify: NO-OP.
- **Next Steps:** Push v3.9.19 → origin main, verify CI hijau.

## 2026-10-11 (HOTFIX v3.9.18) — REFERENCEERROR 'agents is not defined' DALAM fetchGeminiCatalogFromV1

- **Tarikh:** 2026-10-11 (07:30 MYT)
- **Komit SHA:** `99a95e1` (push f911738..99a95e1 ke origin main; CI run #38121684011 — **SUCCESS** hijau)
- **Keputusan Owner:** Bukti log produksi v3.9.17: `[validate-provider] Gagal override katalog Gemini dari /v1: agents is not defined` — ReferenceError serta-merta memaksa kecemasan statik pada semua validasi /v1beta.
- **Punca:** `agents` ialah `const` **block-scoped** dalam blok `try {}` utama endpoint, tetapi `fetchGeminiCatalogFromV1` (ditakrifkan SEBELUM blok tersebut) merujuknya melalui closure merentas sempadan blok — gagal pada runtime.
- **Fix:** `agents` dihantar sebagai **parameter eksplisit** merentasi rantai: `smartGeminiFallback(…, agents)` → `fetchGeminiCatalogFromV1(…, networkAgents)` → `probeDoor('openai-compatible', v1Url, apiKey, networkAgents)`. Sifar rujukan closure merentas blok.
- **Fail Terlibat:** `index.js` (signature 3 fungsi + call-site hantar `agents`), `src/services/validate-provider-regression.test.js` (+VP-21 replika struktur skop dengan parameter eksplisit — tiada ReferenceError, agents sah, katalog dipulangkan; VP-19 assertion signature dikemas kini), `package.json` (3.9.17 → 3.9.18), `CHANGELOG.md` (header v3.9.18).
- **Status pipeline:** prettier ✓ + eslint **0 error** (221 warning pra-wujud) + npm test **367 tests / 366 PASS / 0 FAIL / 1 SKIP** — **BASELINE BAHARU** (>= 366 monotonic dipatuhi). Fail `public/` TIDAK disentuh. Graphify: NO-OP.
- **Next Steps:** Push v3.9.18 → origin main, verify CI hijau.

## 2026-10-11 (RELEASE v3.9.17) — FIXED: DELEGASI probeDoor UNTUK OVERRIDE KATALOG /v1

- **Tarikh:** 2026-10-11 (04:38 MYT)
- **Komit SHA:** `007feca` (push 9a486eb..007feca ke origin main; CI run #38112292127 — **SUCCESS** hijau)
- **Keputusan Owner:** Bug produksi v3.9.16 — `/v1beta` Custom masih jatuh ke kecemasan: `fetchGeminiCatalogFromV1` axios manual gagal parsing `res.data.data` / timeout → tatasusunan kosong → fallback statik. Mandat: delegasi kepada `probeDoor('openai-compatible', v1Url)` yang terbukti stabil + log eksplisit kegagalan.
- **Fail Terlibat:** `index.js` (`fetchGeminiCatalogFromV1` kini `probeDoor('openai-compatible', v1Url, apiKey, agents)` + tapis `String(m).toLowerCase().includes('gemini')`; `smartGeminiFallback` catch → `console.error('[validate-provider] Gagal override katalog Gemini dari /v1:', ...)`), `src/services/validate-provider-regression.test.js` (VP-20: replika delegasi probeDoor penuh + katalog dinamik A-Z; VP-19: assertion String-coerced), `package.json` (3.9.16 → 3.9.17), `CHANGELOG.md` (header v3.9.17).
- **Status pipeline:** prettier ✓ + eslint **0 error** (221 warning pra-wujud) + npm test **366 tests / 365 PASS / 0 FAIL / 1 SKIP** — baseline kekal (monotonic >= 366). Fail `public/` TIDAK disentuh. Graphify: NO-OP.
- **Next Steps:** Push v3.9.17 → origin main, verify CI hijau.

## 2026-10-11 (RELEASE v3.9.16) — PROACTIVE /v1/models OVERRIDE: KATALOG GEMINI DINAMIK TERUS

- **Tarikh:** 2026-10-11 (03:48 MYT)
- **Komit SHA:** `882c6d3` (push cc6112f..882c6d3 ke origin main; CI run #38109606087 — **SUCCESS** hijau)
- **Keputusan Owner:** Mandat pintasan terus: `/v1beta/models` gerbang SEMEMANGNYA pincang dan tidak boleh diharap untuk menyenaraikan — katalog sebenar (termasuk gemini-3.5-flash, gemini-3.8-flash) hanya wujud di `/v1/models`. Pintu gemini-native mesti menyenaraikan TERUS dari `/v1`; kecemasan hanya jalan terakhir.
- **Fail Terlibat:** `index.js` (helper baharu `fetchGeminiCatalogFromV1` — rewrite `/v1beta`→`/v1`, Bearer, tapis includes('gemini'); `smartGeminiFallback` keutamaan: (1) katalog proaktif /v1, (2) senarai /v1beta sihat, (3) kecemasan 6 model LAST RESORT; laluan inferens runtime KEKAL gemini-native), `src/services/validate-provider-regression.test.js` (VP-20 ditulis semula: katalog dinamik penuh A-Z termasuk 3.5/3.8 + panggilan /v1 Bearer disahkan; VP-19: semakan statik keutamaan + kontrak rewrite + inferens), `package.json` (3.9.15 → 3.9.16), `CHANGELOG.md` (header v3.9.16).
- **Status pipeline:** prettier ✓ + eslint **0 error** (221 warning pra-wujud) + npm test **366 tests / 365 PASS / 0 FAIL / 1 SKIP** — baseline kekal (monotonic >= 366; VP-19/20 dikemas kini in-place, sifar ujian dibuang). Fail `public/` TIDAK disentuh. Graphify: NO-OP.
- **Next Steps:** Push v3.9.16 → origin main, verify CI hijau.

## 2026-10-11 (RELEASE v3.9.15) — FIXED: PINTU GEMINI-NATIVE MEMULANGKAN SENARAI GEMINI BERSIH A-Z

- **Tarikh:** 2026-10-11 (03:22 MYT)
- **Komit SHA:** `2ed04d9` (push 26ed898..2ed04d9 ke origin main; CI run #38108252408 — **SUCCESS** hijau)
- **Keputusan Owner:** Bug v3.9.14 — pintu `/v1beta` (gemini-native) masih memulangkan data mentah (deepseek/kimi/glm) tanpa susunan dan SIFAR Gemini. Mandat: sinkronkan cawangan gemini-native dengan `/v1/models` (tapis includes('gemini')), senarai kecemasan 6 model, susunan wajib A-Z.
- **Punca Akar (3):** (1) `smartGeminiFallback` v3.9.14 membuat probeDoor BERULANG selepas probe utama — kegagalan panggilan kedua (rate-limit/network) ditelan try/catch luar → senarai mentah pincang dikembalikan tanpa pemulihan; (2) tapisan padu `startsWith('gemini')` terlalu ketat (spesifikasi: `includes`); (3) senarai kecemasan tiada `gemini-3.1-flash-lite`.
- **Fail Terlibat:** `index.js` (`smartGeminiFallback(resolvedDoor, baseUrl, key, currentModels)` — terima models sedia ada, sifar probe berulang; tapisan includes; 6 model kecemasan; `cleanAndSortModels` berjalan semua pintu Custom), `src/services/validate-provider-regression.test.js` (VP-19 dikemas kini; +VP-20 bukti hujung-ke-hujung axios mock: pincang → padu → hanya Gemini A-Z, deepseek/kimi/glm DILARANG), `package.json` (3.9.14 → 3.9.15), `CHANGELOG.md` (header v3.9.15).
- **Status pipeline:** prettier ✓ + eslint **0 error** (221 warning pra-wujud) + npm test **366 tests / 365 PASS / 0 FAIL / 1 SKIP** — **BASELINE BAHARU** (>= 365 monotonic dipatuhi). Fail `public/` TIDAK disentuh. Graphify: NO-OP.
- **Next Steps:** Push v3.9.15 → origin main, verify CI hijau.

## 2026-10-11 (RELEASE v3.9.14) — SMART MODEL LIST SANITIZATION + PEMULIHAN SENARAI GEMINI PINCANG

- **Tarikh:** 2026-10-11 (02:26 MYT)
- **Komit SHA:** `e7c8fff` (push 7d39701..e7c8fff ke origin main; CI run #38105228311 — **SUCCESS** hijau)
- **Keputusan Owner:** Ground truth audit Crazy Router (docs.crazyrouter.com/llms.txt + pricing): (1) `/v1beta/models` gerbang pincang — adaptor ujian sahaja, SIFAR Gemini, walaupun `:generateContent` menyokong penuh; (2) `/v1/models` memuntahkan 300+ model mentah (suno/kling/seedance/seedream/embedding) tanpa susunan — Gemini tertimbus. Mandat: clean & sort + smart fallback.
- **Fail Terlibat:** `index.js` (`/api/validate-provider`: helper `cleanAndSortModels` — tapis 9 kata kunci bukan-teks + dedup + `localeCompare` A-Z; helper `smartGeminiFallback` — pintu gemini-native + senarai sifar 'gemini' → padu `{base}/v1/models` Bearer tapis `gemini*` → fallback senarai standard 5 model; kedua-duanya digunakan hanya untuk Custom), `src/services/validate-provider-regression.test.js` (+VP-18 penapisan/susunan/dedup; +VP-19 repro pincang + padu + standard), `package.json` (3.9.13 → 3.9.14), `CHANGELOG.md` (header v3.9.14).
- **Status pipeline:** prettier ✓ + eslint **0 error** (221 warning pra-wujud) + npm test **365 tests / 364 PASS / 0 FAIL / 1 SKIP** — **BASELINE BAHARU** (>= 363 monotonic dipatuhi). Fail `public/` TIDAK disentuh. Graphify: NO-OP.
- **Next Steps:** Push v3.9.14 → origin main, verify CI hijau.

## 2026-10-10 (RELEASE v3.9.13) — TRINITY FASA H: REAKTIF URL-TO-DOOR + SINKRONISASI RESOLVEDDOOR

- **Tarikh:** 2026-10-10 (20:00 MYT)
- **Komit SHA:** `8e759a3` (push ddc957e..8e759a3 ke origin main; CI run #38082136296 — **SUCCESS** hijau)
- **Keputusan Owner:** Mandat Fasa H: dropdown Format/Door bertindak balas serta-merta pada input Base URL (`/v1beta` → Gemini Native; `/v1` → OpenAI-Compatible) + sync `resolvedDoor` backend selepas Validate berjaya.
- **Langkah 0 Integration Audit (Backend):** **REGRESI KRITIKAL DICEGAH** — `collectConfigPatch()` Custom path menghantar nilai dropdown mentah; sejak Fasa E dropdown membawa nilai door penuh (`gemini-native` dll) dan Fasa H (reaktif/resolvedDoor) menetapkannya — `normalizeFormatOverride` keyDetector akan MEMBUANG override secara senyap (VALID_FORMATS = legacy pendek). Fix: Custom path kini melalui `doorToFormat(format)` dengan `'auto'` dikekalkan.
- **Fail Terlibat:** `public/js/trinity-agents.js` (Fasa H Frontend: `DOOR_TO_FORMAT_VALUE`, listener input/change Base URL Custom-sahaja, resolvedDoor sync; Audit fix: `effectiveFormat` Custom mapped), `package.json` (3.9.12 → 3.9.13), `CHANGELOG.md` (header v3.9.13).
- **Verifikasi:** E2E Playwright 2/2 (URL `/v1beta` → `gemini-native`; `/v1` → `openai-compatible`); node --check + prettier ✓ + eslint **0 error**; npm test **363 tests / 362 PASS / 0 FAIL / 1 SKIP** — baseline kekal. Graphify: NO-OP.
- **Next Steps:** Push v3.9.13 → origin main, verify CI hijau.

## 2026-10-10 (FASA H — FRONTEND HANDOVER) — REAKTIF URL-TO-DOOR & SINKRONISASI RESOLVEDDOOR

- **Tarikh:** 2026-10-10 (19:55 MYT)
- **Komit SHA:** (menunggu serahan Backend — handover Frontend)
- **Keputusan Owner:** Mandat frontend Fasa H: (1) dropdown Format/Door bertindak balas serta-merta apabila pengguna menaip/menampal Base URL (`/v1beta` → Gemini Native; `/v1` → OpenAI-Compatible); (2) sync `resolvedDoor` selepas Validate berjaya supaya pengguna melihat pintu sebenar yang berjaya disahkan.
- **Fail Terlibat:** `public/js/trinity-agents.js` sahaja — (a) `DOOR_TO_FORMAT_VALUE` pemetaan door backend → nilai dropdown; (b) `wireAutodetect()` + listener `input`/`change` pada `.trinity-baseurl-input` (hanya aktif untuk Custom/Proxy; tiada watcher berterusan — pengguna bebas menukar semula selepasnya); (c) `runAgentValidate()` sync `data.resolvedDoor` → `fmtSelect.value` selepas valid berjaya.
- **Verifikasi:** `node --check` + Prettier ✓ + ESLint **0 error**. E2E Playwright (localhost:7001): taip `/v1beta` → Format auto `gemini-native` ✓; taip `/v1` → Format auto `openai-compatible` ✓; medan Custom muncul ✓. TIADA npm test/git (peraturan #5).
- **Kontrak DOM:** `resolvedDoor` backend dipetakan selari dengan nilai option Fasa E (`gemini-native`/`openai-compatible`/`anthropic-messages`) — tiada konflik format legacy.
- **Next Steps:** Backend Integration Audit → release v3.9.13.

## 2026-10-10 (RELEASE v3.9.12) — STRICT URL PRECEDENCE + EXPANDED DUAL-DOOR PROBE

- **Tarikh:** 2026-10-10 (19:44 MYT)
- **Komit SHA:** `17a11c3` (push c35fa05..17a11c3 ke origin main; CI run #38080993281 — **SUCCESS** hijau)
- **Keputusan Owner:** Bug v3.9.11 — Custom `https://cn.crazyrouter.com/v1beta` + kunci `sk-...` gagal validasi 401 dalam mod Auto. Mandat: (1) keutamaan mutlak heuristik laluan URL atas format kunci; (2) luaskan jaringan fallback dwipintu kepada 401/403/404/400.
- **Fail Terlibat:** `index.js` (`/api/validate-provider`: komen + peneguhan STRICT URL PRECEDENCE pada cawangan `/v1beta` — keyDetector hanya dalam else tiada-hint; `isProbeRetryable` dikembangkan `404||400||401||403`), `src/services/validate-provider-regression.test.js` (+VP-16 repro sk-+/v1beta→gemini-native & keutamaan susunan kod; +VP-17 primer 401 dipulihkan fallback dengan axios mock; VP-14 dikemas kini 401/403 retryable), `package.json` (3.9.11 → 3.9.12), `CHANGELOG.md` (header v3.9.12).
- **Status pipeline:** prettier ✓ + eslint **0 error** (221 warning pra-wujud) + npm test **363 tests / 362 PASS / 0 FAIL / 1 SKIP** — **BASELINE BAHARU** (>= 361 monotonic dipatuhi). SSRF: `validateCustomBaseUrl` kekal sebelum rangkaian pada setiap variasi URL. Graphify: NO-OP.
- **Next Steps:** Push v3.9.12 → origin main, verify CI hijau.

## 2026-10-10 (RELEASE v3.9.11) — SELF-HEALING VALIDATION: HEURISTIK URL PINTAR + DUAL-DOOR PROBING

- **Tarikh:** 2026-10-10 (19:10 MYT)
- **Komit SHA:** `a331fa8` (push d950dd3..a331fa8 ke origin main; CI run #38078779450 — **SUCCESS** hijau)
- **Keputusan Owner:** Mandat heuristik URL pintar & self-healing validation untuk Custom Provider: mode 'auto' tidak lagi memerlukan pengguna menukar Format/Door manual — Crazy Router & proksi New API/One API disahkan automatik.
- **Fail Terlibat:** `index.js` (refactor `/api/validate-provider`: helper `probeDoor`, sanitization `cleanBaseUrl`, heuristik `/v1beta`→gemini-native / `/v1`→openai-compatible / tiada hint→keyDetector `detectAgentChannelFormat`, dual-door fallback 404/400, append `/v1/models` untuk URL versionless, respons `resolvedDoor`), `src/services/validate-provider-regression.test.js` (+VP-10..VP-15; VP-2/3/4 dikemas kini struktur helper), `package.json` (3.9.10 → 3.9.11), `CHANGELOG.md` (header v3.9.11).
- **Status pipeline:** prettier ✓ + eslint **0 error** (221 warning pra-wujud) + npm test **361 tests / 360 PASS / 0 FAIL / 1 SKIP** — **BASELINE BAHARU** (naik daripada 355/354; monotonic >= 355 dipatuhi). SSRF: setiap variasi URL melalui `validateCustomBaseUrl` sebelum rangkaian. Graphify: NO-OP (runtime tiada).
- **Next Steps:** Push v3.9.11 → origin main, verify CI hijau.

## 2026-10-10 (RELEASE v3.9.10) — BUG FIX: VISIBILITY CUSTOM PROVIDER (DUA PUNCA AKAR)

- **Tarikh:** 2026-10-10 (18:14 MYT)
- **Komit SHA:** `1b19813` (push c3f996d..1b19813 ke origin main; CI run #38074985823 — **SUCCESS** hijau)
- **Keputusan Owner:** Bug kritikal v3.9.9 — memilih "Custom / Proxy" gagal memaparkan medan Base URL & Format/Door. Handover Frontend Fasa G (susunan panggilan) diserahkan kepada Backend Integration Audit; forensik Backend menemui DUA punca akar sebenar:
  1. **Detached-DOM race (KRITIKAL):** `renderCards()` dipanggil SEBELUM `trinityRoot` disisip ke document. `wireAutodetect()`/`wireValidate()` guna `document.getElementById()` → NULL pada pokok detached → return awal → SIFAR listener dipasang (change/input/Validate; hanya eye button berfungsi kerana closure). Fix: susunan `mount()` diterbalik — sisip root SEBELUM renderCards.
  2. **CSS specificity:** `style.display = ''` tidak mengatasi rule `.trinity-custom-only { display: none }`. Fix: `updateVisibility()` set `'grid'` (nilai asal .trinity-field) untuk SHOW.
- **Fail Terlibat:** `public/js/trinity-agents.js` (susunan mount + updateVisibility grid), `package.json` (3.9.9 → 3.9.10), `CHANGELOG.md` (header v3.9.10).
- **Verifikasi E2E Playwright (localhost:7001):** (1) badge AIza → "Google Gemini Native" ✓; (2) Custom → Base URL + Format muncul `display: grid` ✓; (3) tukar balik Gemini → medan hilang ✓. `node --check` + prettier ✓ + eslint **0 error** (221 warning pra-wujud) + npm test **355 tests / 354 PASS / 0 FAIL / 1 SKIP** — baseline kekal.
- **Langkah 5 (graphify):** Runtime TIADA — NO-OP direkod.
- **Next Steps:** Push v3.9.10 → origin main, verify CI hijau.

## 2026-10-10 (FASA G — FRONTEND HANDOVER) — BUG FIX: VISIBILITY CUSTOM PROVIDER GAGAL PAPAR

- **Tarikh:** 2026-10-10 (17:52 MYT)
- **Komit SHA:** (menunggu serahan Backend — handover Frontend)
- **Keputusan Owner:** Bug kritikal dalam v3.9.9 — memilih "Custom / Proxy" pada dropdown Provider gagal memaparkan medan Base URL dan Format / Door (Smart Visibility tidak berfungsi).
- **Punca Bug:** `updateVisibility()` dipanggil **SEBELUM** `applyAgentValues()` dalam `renderCards()` dan sebelum populate dropdown dalam `fetchProviderRegistry().then()`. Apabila `applyAgentValues()` menetapkan `providerEl.value = stored.provider` (cth: 'custom') daripada config, tiada lagi panggilan `updateVisibility()` — medan kekal `display: none` walaupun provider Custom dipilih.
- **Fail Terlibat:** `public/js/trinity-agents.js` sahaja — 2 lokasi perubahan:
  1. `renderCards()` (baris 545): `updateVisibility()` dipindah SELEPAS `applyAgentValues(getEffectiveConfig())` — visibility kini mencerminkan nilai provider yang telah direhydrate.
  2. `mount()` `fetchProviderRegistry().then()` (baris 490): `updateVisibility()` dipanggil SELEPAS `populateProviderDropdown()` — registry sudah wujud, visibility dikemas kini dengan data penuh.
- **Verifikasi:** `node --check` lulus; Prettier lulus; ESLint 0 error. TIADA npm test/git (peraturan Frontend #5).
- **Kontrak DOM:** Tiada perubahan struktur — hanya susunan panggilan fungsi (race condition fix). Event listener `change` pada provider dropdown kekal dalam `wireAutodetect()` (tidak disentuh).
- **Next Steps:** Backend Integration Audit → paip release 8-langkah (v3.9.10).

## 2026-10-10 (RELEASE v3.9.9) — PROTOCOL: PERATURAN #4 MONOTONIC BASELINE (edit owner .roomodes)

- **Tarikh:** 2026-10-10 (17:10 MYT)
- **Komit SHA:** `5537770` (push 3d38c3e..5537770 ke origin main; CI run #38070698389 — **SUCCESS** hijau)
- **Keputusan Owner:** Edit manual owner pada `.roomodes` — peraturan #4 TEST BASELINE ditulis semula daripada angka statik (346/345) kepada **MONOTONIC BASELINE**: invariant 0 FAIL / max 1 SKIP; jumlah ujian mesti monotonik (>= baseline terkini dalam docs/SESSION_LEDGER.md; tidak boleh berkurang tanpa kelulusan bertulis owner). Lebih tahan lasak — tiada lagi angka lapuk untuk dikemas kini setiap kali jumlah berubah.
- **Validasi .roomodes (gate PyYAML insiden 2026-10-08):** parse OK; 2 modes (frontend 3097 chars / backend 4301 chars); groups=[read,edit,command,mcp] kedua-dua mode; source=project. `.roo/rules/*.md` disahkan tiada angka baseline lapuk. PASS.
- **Fail Terlibat:** `.roomodes` (sahaja) + `package.json` (3.9.8 → 3.9.9, patch — protokol) + `package-lock.json` (sync) + `CHANGELOG.md` (header v3.9.9).
- **Status pipeline:** prettier ✓ (All matched files use Prettier code style — `.roomodes` tiada parser YAML, gate sebenar ialah PyYAML yang LULUS). Sifar fail kod berubah → npm test tidak wajib diulang (baseline v3.9.8 terkini: 355/354/0/1); graphify NO-OP (runtime tiada).
- **Next Steps:** Push v3.9.9 → origin main, verify CI hijau. Baseline semasa ledger: 355 tests / 354 PASS / 0 FAIL / 1 SKIP (v3.9.8).

## 2026-10-10 (RELEASE v3.9.8) — UNIVERSAL PROVIDER VALIDATION ENDPOINT + TRINITY FASA F

- **Tarikh:** 2026-10-10 (17:00 MYT)
- **Komit SHA:** `9f59def` (push 186af14..9f59def ke origin main; CI run #38069717358 — **SUCCESS** hijau)
- **Keputusan Owner:** Mandat backend: bina endpoint sejagat `POST /api/validate-provider` menggantikan had `/api/validate-gemini` — door dispatcher 3 pintu (gemini-native | openai-compatible | anthropic-messages) + SSRF. Mandat frontend Fasa F: sambungkan butang Validate Trinity ke endpoint baharu.
- **Langkah 0 Integration Audit (Backend):** LULUS — payload `{ provider, apiKey, door, baseUrl }` konsisten dua lapis (frontend derive door dari registry; backend re-derive); Custom door 'auto' → door registry; respons `valid` boolean sentiasa JSON; parse bukan-JSON dilindungi try/catch; tiada stale trap/race baharu.
- **Fail Terlibat:** `index.js` (+endpoint `POST /api/validate-provider`: validationLimiter + setNoStore + SSRF gate `validateCustomBaseUrl` sebelum rangkaian + dispatcher 3 pintu + respons standard), `src/services/validate-provider-regression.test.js` (BAHARU VP-1..VP-9), `package.json` (3.9.7 → 3.9.8 + daftar test:tracked), `public/js/trinity-agents.js` (Fasa F: runAgentValidate → /api/validate-provider), `CHANGELOG.md` (header v3.9.8).
- **Status pipeline:** prettier ✓ + eslint **0 error** (221 warning pra-wujud) + npm test **355 tests / 354 PASS / 0 FAIL / 1 SKIP** — **BASELINE BAHARU** (naik daripada 346/345; 9 ujian VP). Cache buster: sifar rigid `?_cb=`, token auto tidak berubah.
- **Langkah 5 (graphify):** Runtime TIADA — **NO-OP direkod** (perubahan melibatkan fail kod; peta tidak disegerakkan sehingga runtime dipasang).
- **Next Steps:** Push v3.9.8 → origin main, verify CI hijau. **Arahan mod baseline perlu dikemas kini kepada 355/354/0/1 oleh owner (peraturan #4).**

## 2026-10-10 (FASA F — FRONTEND HANDOVER) — BUTANG VALIDATE SAMBUNG KE /api/validate-provider

- **Tarikh:** 2026-10-10 (16:53 MYT)
- **Komit SHA:** (menunggu serahan Backend — handover Frontend)
- **Keputusan Owner:** Sambungkan butang Validate Trinity ke endpoint sejagat backend `POST /api/validate-provider` (siap Fasa F backend: door dispatcher 3 pintu + SSRF). Buang panggilan legasi `/api/validate-gemini`.
- **Fail Terlibat:** `public/js/trinity-agents.js` sahaja — `runAgentValidate()`: (1) payload baharu `{ provider, apiKey, door, baseUrl }` — untuk Custom, door/baseUrl diambil daripada medan manual (door 'auto' → door registry); untuk rasmi, door daripada registry, baseUrl kosong; (2) kontrak respons baharu — `data.valid === true` → lencana HIJAU `Valid ✓ (provider-id)` + isi `data.models` automatik ke dropdown Model (fallback katalog statik jika kosong); `valid === false` → lencana MERAH `Invalid: <res.error>` (60 aksara); ralat rangkaian → `Failed: network error`.
- **Verifikasi:** `node --check` lulus; Prettier lulus; ESLint 0 error. TIADA npm test/git (peraturan Frontend #5).
- **Kontrak DOM:** tiada perubahan struktur kad — hanya endpoint + pengendalian respons. `data.success` tidak disemak (backend sentiasa kembalikan `valid` boolean); respons bukan-JSON dilindungi try/catch parse.
- **Next Steps:** Backend Integration Audit → paip release 8-langkah (kemas kini baseline arahan mod kepada 355/354/0/1 mengikut peraturan #4).

## 2026-10-10 (RELEASE v3.9.7) — TRINITY FASA E: REKA BENTUK SEMULA KAD + REGISTRI PEMBEKAL DINAMIK

- **Tarikh:** 2026-10-10 (23:58 MYT)
- **Komit SHA:** `04f69d5` (push 1df5447..04f69d5 ke origin main; CI run #38065764663 — **SUCCESS**, Node 22 + Node 24 hijau)
- **Keputusan Owner:** Mandat frontend Fasa E: hapuskan kekeliruan "Test" vs "Load" (satu butang Validate), susun atur hierarki kad (Provider → API Key+Validate → Model → BaseURL/Format), Smart Visibility (sembunyi medan teknikal untuk pembekal rasmi), integrasi dinamik `GET /api/providers/registry` + fallback statik, rehydration tanpa race.
- **Langkah 0 Integration Audit (Backend):** (1) **KRITIKAL DIBETULKAN** — payload `trinity.{agent}.format` asal membawa nilai door penuh (`gemini-native` dll) yang akan DIBUANG SENYAP oleh `normalizeFormatOverride` keyDetector (VALID_FORMATS = gemini/openai/anthropic sahaja) dan enum `agentB.format`; fix: pemetaan `DOOR_TO_FORMAT` menghasilkan nilai legacy pendek untuk pembekal rasmi; (2) Validate untuk pembekal openai-compatible masih melalui `/api/validate-gemini` (had API semasa — key DeepSeek/Groq mungkin "Failed" walaupun sah; dicatat sebagai known limitation, bukan blocker); (3) Rehydration warisan (geminiApiKey/geminiModel/format legacy) disahkan selamat — pemetaan legacy → provider id.
- **Fail Terlibat:** `public/js/trinity-agents.js` (rewrite penuh Fasa E + audit fix DOOR_TO_FORMAT), `public/css/trinity-agents.css` (`.trinity-custom-only` Smart Visibility + `.trinity-provider-select`), `package.json` (3.9.6 → 3.9.7), `CHANGELOG.md` (header v3.9.7).
- **Status pipeline:** prettier ✓ (All matched files use Prettier code style) + eslint **0 error** (221 warning pra-wujud) + npm test **346 tests / 345 PASS / 0 FAIL / 1 SKIP** — baseline tepat. Cache buster: 23 token `__APP_VERSION_QUERY__` auto, sifar rigid `?_cb=`.
- **Langkah 5 (graphify):** Runtime TIADA (disahkan awal sesi ini) — **NO-OP direkod**.
- **Next Steps:** Push v3.9.7 → origin main, verify CI hijau. Known limitation pasca-release: endpoint validasi universal (bukan Gemini sahaja) untuk pembekal openai-compatible perlu dibina dalam fasa berikut.

## 2026-10-10 (FASA E — FRONTEND HANDOVER) — REKA BENTUK SEMULA KAD TRINITY + INTEGRASI REGISTRI PEMBEKAL

- **Tarikh:** 2026-10-10 (23:52 MYT)
- **Komit SHA:** (menunggu serahan Backend — handover Frontend)
- **Keputusan Owner:** Mandat frontend: (1) Hapuskan kekeliruan dua butang ("Test" vs "Load") — satukan kepada satu butang "Validate"; (2) Susun semula hierarki kad: Provider (atas) → API Key + Validate → Model → Base URL/Format (hanya Custom); (3) Smart Visibility — sembunyikan Base URL & Format/Door untuk pembekal rasmi, paparkan hanya untuk Custom/Proxy; (4) Integrasi dinamik GET /api/providers/registry dengan fallback statik; (5) Rehydration sempurna tanpa race conditions.
- **Fail Terlibat:**
  - `public/js/trinity-agents.js` (REWRITE PENUH — Fasa E): (a) `fetchProviderRegistry()` — panggil `/api/providers/registry` dengan cache + fallback statik 16 pembekal; (b) `buildAgentCard()` susun atur baharu — Baris 1 Provider, Baris 2 API Key + Validate (butang Load dihapus), Baris 3 Model, Baris 4/5 Base URL & Format (kelas `.trinity-custom-only`); (c) `updateVisibility()` — Smart Visibility display:none untuk rasmi, papar untuk Custom; (d) `populateModelDropdown()` — model auto-populate dari API atau katalog per-provider; (e) `collectConfigPatch()` — payload termasuk `provider`, `door`, `isCustom` untuk kontrak backend baharu; (f) `applyAgentValues()` — rehydrate provider + model + visibility.
  - `public/css/trinity-agents.css`: `.trinity-custom-only { display: none }` (Smart Visibility lalai), `.trinity-provider-select` gaya selaras.
- **Verifikasi:** `node --check` lulus; ESLint 0 error (1 warning konfigurasi CSS standard — diabaikan). Struktur DOM disahkan: 7/7 semakan elemen kritikal (provider-select, agent-validate, trinity-custom-only, fetchProviderRegistry, FALLBACK_PROVIDERS, updateVisibility, PROVIDER_MODEL_CATALOG) lulus.
- **Kontrak Payload (untuk Backend audit):** `trinity.{preflight|translation|inspector}` kini membawa `{ apiKey, format, baseUrl, model, provider, door, isCustom, enabled }`. Untuk pembekal rasmi: `format=door`, `baseUrl=''`. Untuk Custom: `format` daripada dropdown manual, `baseUrl` daripada input pengguna.
- **Next Steps:** Backend jalankan Integration Audit (payload serialization, rehydration races, state sync), kemudian paip release 8-langkah.

## 2026-10-10 (RELEASE v3.9.6) — PEMISAHAN ENJIN RASMI: PURE GOOGLE GEMINI NATIVE + REGISTRI PEMBEKAL LLM SEJAGAT (16 PEMBEKAL)

- **Tarikh:** 2026-10-10 (23:30 MYT)
- **Komit SHA:** `382af6c` (push 06ffe87..382af6c ke origin main; CI run #38063995642 — **SUCCESS**, Node 22 + Node 24 hijau)
- **Keputusan Owner:** Mandat backend diterima 100%: (1) Purge seluruh logik hardcoded Crazy Router daripada `src/services/gemini.js` — perkhidmatan kembali kepada Google Gemini Native REST v1beta rasmi; proksi persendirian hanya melalui Custom Provider (Base URL pengguna); (2) Bina Provider Registry berpusat 16 pembekal (15 rasmi global + Custom/Proxy); (3) Endpoint passthrough `GET /api/providers/registry` untuk Frontend dinamik; (4) Jangan sentuh fail `public/` — asas backend bersih dahulu.
- **Fail Terlibat:** `src/services/gemini.js` (buang: `detectKeyType`/`keyType`, URL `cn.crazyrouter.com` + env `CRAZYROUTER_API_BASE`, `getCrazyRouterAvailableModels`, `getCrazyRouterGoogleModelList`, `warnIfModelUnavailable`, `_canonicalModelCandidates`/`_isCanonicalModelListed`, `isGoogleModel`, `CRAZYROUTER_GEMINI_MODELS`, intercept `getModelLimits`, pintu `countTokens`, `providerRoute` tagging, header Bearer → sentiasa `x-goog-api-key`), `src/utils/providerRegistry.js` (BAHARU — 16 entri: gemini-native/openai/anthropic-messages/openai-compatible ×12 + Custom isCustom), `index.js` (buang cabang validasi proksi `/api/validate-gemini-key`; tambah `GET /api/providers/registry`), `src/services/gemini-auth-model-regression.test.js` (CR-B1..B4 + WF-2 ditulis semula kontrak native/registri — kiraan kekal), `package.json` (3.9.5 → 3.9.6), `CHANGELOG.md` (header v3.9.6).
- **Status pipeline:** prettier ✓ (All matched files use Prettier code style) + eslint **0 error** (221 warning pra-wujud — sepadan baseline) + npm test **346 tests / 345 PASS / 0 FAIL / 1 SKIP** — baseline tepat, sifar regresi. Cache buster: 23 token `__APP_VERSION_QUERY__` auto (configure.html 23 + configurePageGenerator 1), sifar rigid `?_cb=` versi lapuk.
- **Langkah 5 (graphify):** `graphify-out/` wujud TAPI runtime tetap TIADA (`import graphify` → ModuleNotFoundError). Mengikut protokol v3.9.2: **NO-OP serta-merta direkod** — sifar skrip ad-hoc. Nota: perubahan melibatkan fail kod (gemini.js/providerRegistry.js/index.js); peta topologi tidak disegerakkan sehingga runtime dipasang (tindakan berasingan).
- **Next Steps:** Push v3.9.6 → origin main, verify CI hijau (ci.yml, Node 22/24). Selepas CI Success, owner boleh alihkan mod ke Frontend untuk integrasi dinamik dengan `GET /api/providers/registry` (dropdown pembekal 16 entri).

## 2026-10-10 (HOTFIX SUSULAN) — Trinity UI: bahasa English penuh + kedudukan kad (Subtitles API Keys atas)

- **Tarikh:** 2026-10-10 (18:46 MYT)
- **Komit SHA:** (menunggu serahan Backend — handover Frontend)
- **Keputusan Owner:** (1) Bahasa UI Trinity dikesan bahasa Melayu pada skrin configure — owner mahu 100% English mengikut selekoh UI sedia ada; (2) "Subtitles API Keys" mesti kekal atas sekali — togol + kad Trinity dipindah SELEPAS kad provider.
- **Fail Terlibat:** `public/js/trinity-agents.js` (semua teks skrin → English: Basic/Pro Mode, placeholder key/baseurl, badge "No key"/"Valid ✓"/"Failed", aria-label, hint, dropdown Auto (Recommended), model select "— Select model —"; mount: insert SELEPAS .section-grid dalam #apiKeysSection). Bukti visual: trinity-final-clean.png (Subtitles API Keys atas; Basic/Pro Mode English).
- **Verifikasi:** Playwright E2E — rootAfterGrid=true, subtitleCardBeforeTrinity=true, modeLabels English, placeholders English, badge English, `#geminiCard` display:none kekal. Prettier lulus; ESLint 0 error.
- **Next Steps:** Backend jalankan pipeline release (prettier+eslint+npm test, bump patch, komit, push, CI). Fasa E menyusul.

---

---

## 2026-10-10 (RELEASE v3.9.4) — PROTOKOL INTEGRASI DUA-PIHAK: TWO-MAN INTEGRATION GATE + LANGKAH 0 INTEGRATION AUDIT

- **Tarikh:** 2026-10-10 (18:18 MYT)
- **Komit SHA:** (komit release v3.9.4 ini — SHA direkod selepas push)
- **Keputusan Owner:** Edit manual owner pada Mode-specific Custom Instructions (.roomodes) + .roo/rules/00-subfaber-core-protocol.md: (1) Frontend rule #5 ditulis semula sebagai MANDATORY HANDOVER & ZERO-COMMIT ENFORCEMENT (Frontend diharamkan npm test/git commit/push; wajib append ledger + switch_mode ke backend dengan laporan handover berstruktur); (2) Backend rule #6 pipeline menerima Langkah 0 FRONTEND INTEGRATION AUDIT (payload serialization, rehydration & state persistence, race conditions & DOM lifecycle) + `git add` diperketat kepada specific-files; (3) Core protocol items #4 (Two-Man Integration Gate, zero standalone frontend releases) + #5 (Backend as Tech Lead & Integration Gatekeeper) + #6 (Mode-Activation diperketat: refuse & handover). Backend membetulkan indentasi item #6 core protocol yang tersasar sebagai sub-bullet item 5.
- **Fail Terlibat:** `.roomodes` (Frontend rule #5 rewrite + Backend rule #6 Langkah 0), `.roo/rules/00-subfaber-core-protocol.md` (items #4/#5 baharu, #6 tighten + indent fix), `package.json` (3.9.3 → 3.9.4, patch — protokol sahaja) + `package-lock.json` (sync) + `CHANGELOG.md` (header v3.9.4).
- **Validasi .roomodes (gate PyYAML insiden 2026-10-08):** parse OK; 2 modes (Frontend 3097 chars / Backend 4262 chars customInstructions); groups=[read,edit,command,mcp] kedua-dua mode; source=project. PASS.
- **Status pipeline:** prettier ✓ (All matched files use Prettier code style) + eslint 0 error (221 warning pra-wujud) + npm test **346 tests / 345 PASS / 0 FAIL / 1 SKIP** — baseline tepat. Cache buster: 23 token `__APP_VERSION_QUERY__` auto, sifar rigid `?_cb=` versi lapuk.
- **Langkah 5 (graphify):** Runtime graphify TIADA (`import graphify` gagal — ModuleNotFoundError). Mengikut protokol v3.9.2: **NO-OP serta-merta direkod** — sifar fail kod berubah dalam v3.9.4 (docs/config sahaja), peta topologi tidak terjejas.
- **Next Steps:** Push v3.9.4 ke origin main + verify CI hijau (workflow ci.yml, matrix Node 22/24). Pelbagai fail .tmp-*/artefak untracked pra-wujud di working tree kekal di luar skop (tidak di-add).

## 2026-10-10 (HOTFIX v3.9.3) — Trinity UI gagal mount: insertBefore anchor defensif

- **Tarikh:** 2026-10-10 (17:56 MYT)
- **Komit SHA:** (komit hotfix ini — SHA direkod selepas push)
- **Keputusan Owner:** Owner laporkan UI configure masih "zaman lama". Forensik Playwright tempatan (localhost:7001) menemui punca sebenar: `trinity-agents.js` mount gagal SENYAP dengan `NotFoundError: insertBefore` — anchor `.card[data-card="subtitle-api"]` bersarang dalam struktur main.html dan BUKAN anak langsung `#apiKeysSection`. (Nota: tangkapan skrin owner menunjukkan deployment workers.dev versi lama — kod Fasa D memang belum sampai ke deployment itu; tetapi bug mount tempatan ini juga nyata dan telah dibetulkan.)
- **Fail Terlibat:** `public/js/trinity-agents.js` (anchor resolution defensif: anak langsung pertama yang memenuhi kriteria; fallback insertBefore section.firstChild). `package.json` (3.9.2 → 3.9.3) + `CHANGELOG.md` (header v3.9.3).
- **Verifikasi:** Playwright E2E — Basic: 1 kad translation + `#geminiCard` display:none; Pro: 3 kad (preflight/translation/inspector) lengkap dengan dropdown Format/BaseURL/Model/Test/Load; badge autodetect `AIza…` → "Google Gemini Native (auto)" tone-blue. npm test 346/345/0/1 hijau; prettier lulus; eslint 0 error.
- **Next Steps:** Deployment (VPS/workers.dev) perlu `git pull` ke HEAD untuk melihat UI Trinity; Fasa E mengikut pelan.

---

## 2026-10-10 (RELEASE v3.9.2) — PROTOKOL GRAPHIFY NO-OP BERSYARAT + PEMBETULAN TYPO PIPELINE

- **Tarikh:** 2026-10-10 (16:57 MYT)
- **Komit SHA:** (komit release v3.9.2 ini — SHA direkod selepas push)
- **Keputusan Owner:** Penambahbaikan protokol selepas insiden v3.9.1 — Langkah 5 pipeline kini BERSYARAT: `graphify update .` hanya jika runtime graphify ada + `graphify-out/` wujud; jika tiada, NO-OP serta-merta. Larangan keras skrip Python ad-hoc (`.tmp-*`) / workaround manual. Typo dwi-nombor `6. 6.` pada header peraturan #6 `.roomodes` dibetulkan.
- **Fail Terlibat:**
  - `.roomodes` (rule #6 Langkah 5 conditional NO-OP + typo fix; rule #6 header)
  - `.roo/rules/00-subfaber-core-protocol.md` (Langkah 5 selari — NO-OP segera runtime/direktori tiada)
  - `package.json` (3.9.1 → 3.9.2, patch — protokol sahaja) + `package-lock.json` (sync) + `CHANGELOG.md` (header v3.9.2)
- **Validasi .roomodes (gate PyYAML):** parse OK; 2 modes; groups=[read,edit,command,mcp] kedua-dua; source=project. PASS.
- **Status pipeline:** prettier ✓ (All matched files use Prettier code style) + eslint 0 error (warning pra-wujud) + npm test **346 tests / 345 PASS / 0 FAIL / 1 SKIP** — baseline tepat. Cache buster: 0 rigid `?_cb=`.
- **Langkah 5 (graphify):** `graphify-out/` kini WUJUD (output topologi dari sesi lain ada: graph.json, manifest.json, GRAPH_REPORT.md) TAPI runtime tetap TIADA (tiada `.graphify_python` marker, `import graphify` gagal pada interpreter python). Mengikut protokol baharu: **NO-OP serta-merta direkod** — sifar fail kod berubah dalam v3.9.2 (docs/config sahaja), peta tidak terjejas.
- **Next Steps:** Push v3.9.2 ke origin main + verify CI hijau. Runtime graphify perlu dipasang/dilokasi untuk release masa depan yang melibatkan fail kod (tindakan berasingan).

## 2026-10-10 (RELEASE v3.9.1) — PENYEGERAKAN PROTOKOL RELEASE UNIVERSAL (Arahan Mod & Core Protocol)

- **Tarikh:** 2026-10-10 (16:36 MYT)
- **Komit SHA:** (komit release v3.9.1 ini — SHA direkod selepas push)
- **Keputusan Owner:** Kemaskini Backend Mode-specific Custom Instructions + Workspace Rules — baseline ujian dikemas kini kepada 346/345/0/1 (Trinity Tri-Door); peraturan #6 ditulis semula sebagai Universal Release & Commit Pipeline 8-langkah (wajib untuk SEMUA komit: backend/hotfix/frontend handover; larangan keras komit terasing); peraturan #7 sebagai Session Continuity & Context Resets. Core protocol (00-subfaber-core-protocol.md) menerima blok Mandatory Commit & Release Protocol (Zero Exceptions).
- **Fail Terlibat:**
  - `.roomodes` (rule #4 baseline 305/304 → 346/345; rule #6 rewrite Universal Pipeline; rule #7 restructure Session Continuity)
  - `.roo/rules/00-subfaber-core-protocol.md` (+ blok Mandatory Commit & Release Protocol)
  - `public/css/configure.css` (+ komen penanda `/* TRINITY FASA D 2026-10-10 */` sahaja, sifar perubahan peraturan)
  - `package.json` (3.9.0 → 3.9.1, patch — protokol/docs sahaja) + `CHANGELOG.md` (header v3.9.1)
- **Validasi .roomodes (gate PyYAML insiden 2026-10-08):** parse OK; 2 modes (Frontend 2767 chars / Backend 3750 chars customInstructions); groups=[read,edit,command,mcp] kedua-dua mode; source=project. PASS.
- **Status pipeline:** prettier ✓ (All matched files use Prettier code style) + eslint 0 error (221 warning pra-wujud) + npm test **346 tests / 345 PASS / 0 FAIL / 1 SKIP** — baseline tepat. Cache buster: 23 token `__APP_VERSION_QUERY__` auto, 0 rigid `?_cb=`, 0 rujukan 3.9.0 lapuk.
- **Kelainan Langkah 5 (graphify):** Runtime graphify TIADA dalam environment ini (tiada `graphify-out/.graphify_python`, tiada modul Python `graphify` — hanya rujukan skill di `.codebuddy/skills/graphify/`). Oleh sebab perubahan v3.9.1 adalah docs/config sahaja (sifar fail kod), peta topologi tidak terjejas — langkah dilangkau dengan justifikasi direkod. Untuk release masa depan yang melibatkan fail kod, runtime graphify perlu dipasang/dilokasi dahulu.
- **Next Steps:** Push v3.9.1 ke origin main + verify CI hijau (workflow ci.yml, matrix Node 22/24). Nota environment: pelbagai fail .tmp-*/artefak untracked masih ada di working tree (pra-wujud, bukan skop tugasan ini — tidak di-add dalam komit release ini melainkan owner arahkan pembersihan berasingan).

## 2026-10-10 (RELEASE v3.9.0 — TRI-DOOR FASA A+B+C+D) — UI TRINITY: Dual Mode Toggle + Modular Trinity Cards

- **Tarikh:** 2026-10-10 (16:08 MYT)
- **Komit SHA:** `e11f816` (Fasa D) + `93f58aa` (ledger) + `b6a9016` (pelan E) + komit release v3.9.0 ini; CI #255 HIJAU — Success, 2 jobs Node 22+24, 1m 20s, sifar error
- **Release pipeline (koreksi owner):** BUMP 3.8.42 → **3.9.0** (SemVer minor — feature tri-door) + CHANGELOG.md baharu di bawah header v3.9.0 (Added/Changed/Fixed) + cache buster auto (`__APP_VERSION_QUERY__` token, sifar hardcoded rigid) + prettier ✓ + eslint 0 error ✓ + npm test 346/345/0/1 ✓ sebelum komit.
- **Keputusan Owner:** Mandat Frontend Fasa D — rombakan besar UI: togol dwimod (Basic=1 kad Translation + formula legasi 4/50/2; Pro=3 kad modular Preflight/Translation/Inspector), autodetect badge masa nyata (AIza→Gemini blue, sk-ant-→Anthropic orange, sk-/lain→OpenAI green), dropdown Format/Pintu, Base URL editable, butang Test Key. Pembersihan legasi: borang Gemini hardcoded + multi-providers (beta) disembunyikan (kad #geminiCard display:none — input kekal dalam DOM untuk keserasian simpanan).
- **Fail Terlibat (Frontend):**
  - `public/js/trinity-agents.js` (BAHARU — modul penuh: mount/collectConfigPatch/rehydrate; kad modular programatik defensif)
  - `public/css/trinity-agents.css` (BAHARU — togol suis, kad, badge tone)
  - `public/js/config-loader.js` (muat trinity-agents.js selepas config.js + mount pada partialsReady)
  - `public/configure.html` (link CSS trinity)
  - `public/config.js` (3 titik suntikan: buildConfigFromForm patch, payload literal, loadConfigToForm rehydrate)
- **Fail Terlibat (Backend — atas keputusan owner "kekalkan perubahan"):**
  - `index.js` (senarai cache-bust + /css/trinity-agents.css + /js/trinity-agents.js)
  - `src/utils/config.js` (passthrough blok mergedConfig.trinity — agentB.format Fasa C sedia membaca)
- **ULASAN BACKEND (3 fix kritikal dikenal pasti & dilaksana):**
  1. **Payload race FIXED** — literal payload config dibina SEGAR dari input borang; patch currentConfig tidak mengalir. Fix: geminiApiKey Trinity Translation kini mengatasi input legasi (disegerak balik ke #geminiApiKey supaya validasi/rotation baca nilai sama); blok trinity + agentB disalin eksplisit ke payload (deep-copy JSON).
  2. **Rehydration race FIXED** — mount awal berlaku sebelum config server tiba. Fix: loadConfigToForm memanggil TrinityAgents.rehydrate(currentConfig) di hujung.
  3. **Mode toggle sync FIXED** — applyAgentValues kini menyegerak trinityModeToggle dengan trinity.mode tersimpan (dispatch change → renderCards semula).
- **Status npm test:** 346 tests / 345 PASS / 0 FAIL / 1 SKIP (skip = live Redis). Prettier lulus; ESLint 0 error (warning pra-wujud). Tiada regresi.
- **Next Steps:** Komit Fasa D atas arahan owner (cadangan: `feat(ui): Trinity dual-mode toggle + modular agent cards (Phase D)`); smoke test manual di /configure (mount kad, togol mod, autodetect badge, simpan/muat semula round-trip); Fasa E (validasi produksi VPS). Nota: butang Test Key guna endpoint /api/validate-gemini sedia ada — endpoint validasi format-agnostik per pintu boleh dipertimbangkan dalam Fasa E.

---

## 2026-10-10 (FASA C SELESAI) — TRI-DOOR: geminiChannel + anthropicChannel + wiring config.agentB.format

- **Tarikh:** 2026-10-10 (14:20 MYT)
- **Komit SHA:** (Fasa A+B komited `6eafdbf`; Fasa C komit menyusul serta-merta)
- **Keputusan Owner:** Mandat Fasa C — geminiChannel (systemInstruction top-level, hormati getModelFamily, non-stream default), anthropicChannel (system top-level, max_tokens mandatori, kekangan temperature/thinking), wiring config.agentB.format + autodetect keyDetector, regresi payload kedua pintu. npm test mesti hijau penuh.
- **Fail Terlibat:**
  - `src/services/channels/geminiChannel.js` (BAHARU — buildRequest: systemInstruction TOP-LEVEL {parts:[{text}]}, contents user tunggal, generationConfig via GeminiService.buildGenerationConfig = satu sumber kebenaran getModelFamily; default thinkingLevel 'low' (empirikal Fasa 0: 6.4s vs DQ 300s); buildProvider: GeminiService maxRetries 0 duck-typed)
  - `src/services/channels/anthropicChannel.js` (BAHARU — buildRequest: system string top-level, max_tokens MANDATORI clamp cap 64000, messages user tunggal, endpoint /v1/messages + anthropic-version 2023-06-01; buildProvider: AnthropicProvider thinking adaptive, kekangan temp/thinking terpelihara oleh provider)
  - `src/services/agentBInspector.js` (constructor: detectAgentChannelFormat → channelFormat/channelFormatSource + log telus [AgentB][AgentChannel]; _getChannelProvider() lazy; translateSubtitle() override — format gemini/anthropic didelegasikan ke channel transport, format openai kekal super() 1:1 laluan rootsys)
  - `src/utils/config.js` (agentB.format: 'auto' lalai + env AGENT_B_FORMAT + lowercase)
  - `src/handlers/subtitles.js` (suntikan format: config.agentB.format ke AgentBInspector)
  - `src/services/channels-triDoor-phaseC-regression.test.js` (BAHARU — 15 test: payload Gemini [systemInstruction top-level haram-dalam-contents, :generateContent non-stream, 3.7 strict strip sampling + thinkingLevel low, 2.5 legacy sampling], payload Anthropic [system top-level, max_tokens mandatori + clamp, header version], delegasi AgentB per pintu [openai super() 1:1, gemini/anthropic via channel stub], override mengatasi autodetect, split sempadan prompt pada kedua channel, config normalize)
  - `package.json` (test:tracked + channels-triDoor-phaseC-regression.test.js)
- **Status npm test:** 346 tests / 345 PASS / 0 FAIL / 1 SKIP (skip = live Redis). +15 test Fasa C; 40+ regresi AgentB + semua baseline kekal HIJAU. Prettier lulus; ESLint 0 error (warning pra-wujud). Baseline 331→346.
- **Next Steps:** Fasa D (UI dropdown format Agent B + paparan keputusan autodetect — delegasi Frontend mode); Fasa E (validasi produksi VPS Trinity pada pintu bukan-rootsys). Komit Fasa C push ke origin + CI verify.

---

## 2026-10-10 (FASA A+B SELESAI) — PEMBEDAHAN MAJOR TRI-DOOR: keyDetector + openaiChannel (Trinity Engine 3 pintu format)

- **Tarikh:** 2026-10-10 (14:05 MYT)
- **Komit SHA:** (belum di-commit — Fasa A+B siap, Fasa C menyusul)
- **Keputusan Owner:** Laporan plans/tri-door-provider-surgery-plan.md DILULUSKAN. Kelulusan: (1) struktur `src/services/channels/`; (2) Fasa B komposisi dibenarkan dengan syarat 40+ regresi AgentB kekal hijau TANPA edit assertion; (3) fallback default = openai-compatible bila tiada padanan; (4) non-stream dibenarkan untuk channel Gemini & Anthropic rasmi (stream kekal eksklusif rootsys/Caddy). Penemuan utama laporan: Agent Translation sudah 3 pintu; barah sebenar ialah Agent Preflight + Agent Inspector terkurung pada OpenAI sahaja (AgentBInspector extends OpenAICompatibleProvider universalPayload) + tiada autodetect key.
- **Fail Terlibat:**
  - `src/services/channels/keyDetector.js` (BAHARU — detectAgentChannelFormat: override > key-prefix (AIza/sk-ant-) > baseUrl > model > default openai; ber-source untuk log telus; defensif null/undefined)
  - `src/services/channels/agentChannel.js` (BAHARU — kontrak duck-typed resolveChannelFormat/defaultChannelFormat)
  - `src/services/channels/openaiChannel.js` (BAHARU — ekstraksi 1:1 super-options AgentB: providerName agentb, universalPayload god-tier 4-kunci, maxRetries 0, enableJsonOutput false, SSRF passthrough)
  - `src/services/agentBInspector.js` (MODIFIKASI MINIMAL — super() kini melalui openaiChannel.buildSuperOptions; tingkah laku 1:1; require openaiChannel ditambah)
  - `src/services/channels-keyDetector-regression.test.js` (BAHARU — 18 test: prefix kuat, sk- generik tidak memilih vendor, keutamaan berperingkat, hygiene input, normalizeFormatOverride, integrasi agentChannel)
  - `package.json` (test:tracked + channels-keyDetector-regression.test.js)
  - `plans/tri-door-provider-surgery-plan.md` (BAHARU — laporan pembedahan penuh, diluluskan owner)
- **Status npm test:** 331 tests / 330 PASS / 0 FAIL / 1 SKIP (skip = live Redis). +18 test baharu; 40+ regresi AgentB HIJAU tanpa satu assertion diubah (syarat Fasa B dipenuhi). Prettier: lulus. ESLint: 0 error (217 warning pra-wujud). Baseline dikemas kini 313→331. Graphify: tiada graphify-out/ wujud (graf belum dibina di workspace ini) — update no-op, tiada API cost.
- **Next Steps:** FASA C — geminiChannel.js + anthropicChannel.js (payload systemInstruction top-level / system top-level, thinkingLevel low default, non-stream dibenarkan) + wiring config.agentB.format (autodetect via keyDetector) + regresi payload per pintu; kemudian Fasa D (UI dropdown format, delegasi Frontend) & Fasa E (validasi produksi VPS). Commit Fasa A+B bersama Fasa C atau atas arahan owner.

---

## 2026-10-09 (SELESAI) — EDIT PROMPT AGENT A: Blok Style "natural, idiomatic" → "natural, conversational"

- **Tarikh:** 2026-10-10 (00:55 MYT)
- **Komit SHA:** (belum di-commit — edit prompt kecil, commit susulan)
- **Keputusan Owner:** Ayat blok `## Style` dalam system prompt Agent A diperhalus: "natural, idiomatic" diganti "natural, conversational" (arah gaya lebih mesra/perbualan). Baki ayat (streaming-grade, Never calque, preserve character voice, register lock titles/pronouns) dikekalkan verbatim.
- **Fail Terlibat:**
  - `src/services/translationEngine.js` (baris ~2954, blok `## Style` system prompt Agent A)
  - `src/services/subfaber-context-regression.test.js` (assertion `natural, idiomatic` → `natural, conversational`, line 375-376, dengan anotasi OWNER MANUAL EDIT 2026-10-09)
- **Status npm test:** 313 tests / 312 PASS / 0 FAIL / 1 SKIP (skip = live Redis). Prettier: lulus kedua-dua fail. ESLint: 0 error, 6 warning pra-wujud (bukan dari edit ini).
- **Next Steps:** Commit & push bersama perubahan lain sesi ini jika ada; CI (Node 22/24 matrix) perlu hijau. Baseline test dikemas kini 305→313 (termasuk test baru dari sesi sebelumnya).

---

## 2026-10-09 (SELESAI) — VALIDASI PRODUKSI PENUH: Trinity pipeline ALL-GREEN + format rasmi Moonshot disahkan

- **Tarikh:** 2026-10-10 (00:28 MYT)
- **Komit SHA:** (docs-only, commit susulan)
- **Keputusan Owner:** Sambungan sesi ground truth. Owner sahkan 3 mazhab payload rasmi (OpenAI/Anthropic/Google) dan minta verifikasi SubFaber terhadap skema rasmi; kemudian minta contoh rasmi Moonshot untuk kimi-k3, test curl sendiri di VPS, dan akhirnya jalankan translation penuh untuk validasi hujung-ke-hujung.
- **Keputusan penting sesi ini:**
  1. Audit compliance: SubFaber 100% patuh ketiga-tiga mazhab skema rasmi (gemini.js / openaiCompatible.js / anthropic.js) — tiada penyimpangan, hanya penggunaan parameter optional yang disengajakan.
  2. Docs rasmi Moonshot (platform.kimi.ai) dis scrape: skema kimi-k3 menyatakan reasoning_effort top-level rasmi (low/high/max, lalai max); temperature TIDAK dalam skema kimi-k3; role system sah; multi-turn rasmi mengesahkan format.
  3. Owner curl 3 varian payload (A=minimal rasmi, B=god-tier semasa, C=rasmi+reasoning_effort:low) di VPS: SEMUA HTTP 200, masa 30-38s (vs benchmark pagi 135-275s muatan sama) — kesimpulan: latensi kimi-k3 tidak menentu, faktor beban pelayan Moonshot, bukan payload. Gateway menerima reasoning_effort (tiada 400).
  4. Kualiti Bible (parser produksi): Varian B juara — 20 terms (A=13, C=14), gelaran paling tepat (Koperal Jung, Peguam Kook), theme paling lengkap, characters Jaccard 1.00 merentas semua varian. KEPUTUSAN: kekal Varian B (muatan god-tier semara) — tiada perubahan kod.
  5. VALIDASI PRODUKSI PENUH (VPS, 16:05-16:10 UTC): Shine on Me S01E30, 646 entri/13 batch — Preflight kimi-k3 selesai 44s (20 terms, 18 characters, 1 credits); Translation gemini-3.5-flash 89-key rotation sifar mismatch; Inspector deepseek-v4-pro 13/13 PASSED, SEMUA jenayah sifar; credits Bible diaplikasikan (entry pertama = DIADAPTASI DARIPADA NOVEL GU MAN); 4m46s, $0.18, 136 entri/min. TRINITY ALL-GREEN.
- **Fail Terlibat:** Tiada perubahan kod produksi (sesi 100% verifikasi). Probe: .tmp-bench/make-official-variants.js, .tmp-bench/analyze-official.js, .tmp-bench/KIMI-OFFICIAL-TEST-GUIDE.md (tidak di-commit, gitignored). VPS diselaraskan git pull ke 292491c.
- **Status npm test:** Tidak diulang (tiada perubahan kod; baseline 313/312/0/1 berkuat kuasa).
- **Next Steps:** Sesi ditutup oleh owner. Nota untuk sesi akan datang: (a) reasoning_effort:low terbuka sebagai eksperimen waktu-puncak jika latensi kimi kronik lambat; (b) ground truth Q3 dua-dalam-satu sebaharnya tercapai pada waktu pelayan murah hati — faktor waktu Moonshot > parameter; (c) pembersihan fail .tmp-* lapuk boleh dipertimbangkan tugasan kecil.

---

## 2026-10-09 (SELESAI) — GROUND TRUTH SUSULAN Q1-Q3: streaming, model baru 3.5/3.8, dua-dalam-satu

- **Tarikh:** 2026-10-09 (20:09 MYT)
- **Komit SHA:** `a16e60e`
- **Keputusan Owner:** 3 soalan susulan pasca-laporan A/B: (1) stream on/off untuk Gemini Fasa 0? (2) adakah model baru 3.5+ fix overthinking? (3) boleh ke dua-dalam-satu (laju + bible padu)?
- **Keputusan empirikal (harness .tmp-bench-followup.js, korpus/prompt identik):**
  - Q1: **OFF** — TTFT dikuasai thinking server-side (3.5-med stream TTFT 13.6s ≈ total 15.4s; 3fp-high+stream TTFT 179.9s, hampir sama buruk dengan Kimi). Preflight = satu JSON, tiada nilai UX partial. Kimi produksi guna stream hanya untuk hidupkan sambungan Caddy gateway, bukan UX.
  - Q2: **YA, disahkan** — 3.5-flash high 23.1s / 3.8-flash high 33.5s (tiada DQ 300s seperti 3.0); thoughts 1.5k-5k token terkawal; nullCanon muncul semula (1/7 pada 3.5 high). TAPI kekayaan bible JATUH: terms 5-7 / chars 5-7 (vs 3.0-low 10-11/10, Kimi 16-21/10). Rotation key teruji real-world (2× 503 → key#1).
  - Q3: **TIDAK pada prompt P1 semasa** — tiada konfigurasi Gemini menyentuh kekayaan Kimi; model baru bergerak menjauh. Bottleneck = prompt bukan model: P1 menghalang overthinking tetapi tidak mendorong kekayaan (tiada kuota istilah, tiada few-shot, tiada arahan sweep vocabulary). Laluan: tweak P1 (kuota 15-30 istilah domain + few-shot + kekal REASONING-DISCIPLINE) → ulang harness → barulah nilai sama ada dua-dalam-satu tercapai.
- **Fail Terlibat:** plans/kimi-k3-vs-gemini-3-flash-preflight-ground-truth.md (seksyen 6 baharu, +57 baris). TIADA perubahan kod produksi.
- **Status npm test:** Tidak diulang (docs-only; baseline 313/312/0/1 dari commit sebelumnya masih berkuat kuasa — tiada fail ujian/kod berubah).
- **Next Steps:** Jika owner mahu dua-dalam-satu: tugasan berasingan tweak P1 di src/services/subfaberPreflight.js + update regresi; keputusan interim = kekal kimi-k3.

---

## 2026-10-09 (SELESAI) — GROUND TRUTH A/B: Kimi K3 vs Gemini 3 Flash — Agent Preflight

- **Tarikh:** 2026-10-09 (19:45 MYT)
- **Komit SHA:** `ebfbc7d`
- **Keputusan Owner:** Owner minta ground truth empirikal "siapa lebih padu untuk kerja agent preflight" antara Kimi K3 vs Gemini 3 Flash; kelulusan metodologi kesamarataan didelegasikan ("kau buat lah keputusan sendiri"). 10 key Gemini free-tier diserahkan untuk benchmark; SRT Happiness E1 (Downloads) diberikan sebagai korpus.
- **Metodologi:** Harness `.tmp-bench-run.js` (probe, tidak di-commit) — prompt laluan produksi VERBATIM (buildPreflightPrompt + splitStructuredPrompt, system 7,119ch + user 25,399ch, bait identik kedua-dua model); Kimi = muatan god-tier 4-kunci (temp 0.0, SSE stream); Gemini = REST v1beta generateContent (systemInstruction top-level, temp 0.0, thinkingLevel low ×3 + high ×2); validator = parsePreflightResponse() produksi; 3 run per model.
- **Keputusan empirikal (korpus 745 entri / 25,302 aksara):**
  - Latency: Gemini-low **6.4s avg** vs Kimi **207.4s avg** (32×); Kimi TTFT 110-247s.
  - Gemini-high: **DQ — 2/2 timeout 300s** (siling Caddy). thinkingLevel low WAJIB jika Gemini dipilih.
  - Kesahan JSON: seri 3/3 vs 3/3 (parser produksi).
  - Stabiliti terms: Gemini 0.75-1.00 vs Kimi 0.44-0.58 Jaccard; characters: Kimi 1.00 vs Gemini 0.82-1.00.
  - Kekayaan: Kimi terms union 29 vs Gemini 12; theme Kimi spesifik (nama entiti) vs Gemini generik.
  - **Halusinasi forensik: Gemini 1/30 entri watak ("Park Seo-yoon" — 0 bukti tekstual, kebocoran training data); Kimi 0/30.** Gemini juga mengisi canonical_address 100% (termasuk tekaan "Cik Min-ji" atas 1 vocative); Kimi NULL 20-40%.
  - Temp 0.0 disahkan selamat empirikal kedua-dua model (tiada gelung; determinisme R1≡R3 Gemini).
- **VERDICT:** Operasi Agent Preflight = **Gemini 3 Flash low lebih padu** (32× laju, stabil, 100% sah). Kualiti bible 4-tiang = **Kimi K3 masih lebih baik** (istilah kaya, theme spesifik, disiplin NULL). Rekomendasi berstrata di dokumen: status quo kimi-k3 kekal jika bible quality diutamakan; pertukaran Gemini wajib disertai post-filter halusinasi watak + kunci thinkingLevel low.
- **Fail Terlibat:** `plans/kimi-k3-vs-gemini-3-flash-preflight-ground-truth.md` (BAHARU, 133 baris — laporan penuh + papan skor + rekomendasi). Probe `.tmp-bench*` tidak di-commit. TIADA perubahan kod produksi.
- **Status npm test:** 313 tests / 312 PASS / 0 FAIL / 1 SKIP (baseline dipelihara; docs-only commit).
- **Next Steps:** Owner buat keputusan strategik (kekal kimi-k3 / migrasi Gemini low + post-filter halusinasi); jika migrasi — rancang filter bukti-textual dalam parsePreflightResponse dan kunci thinkingLevel default.

---

## 2026-10-09 (SELESAI) — ARCHITECTURAL TAXONOMY STANDARDIZATION: nama rasmi 3 komponen enjin

- **Tarikh:** 2026-10-09 (16:23 MYT)
- **Komit SHA:** `7d0864f`
- **Keputusan Owner:** Mandat taksonomi — selaraskan nama panggilan 3 komponen enjin SubFaber bagi menghapuskan kekeliruan istilah. Nama rasmi berkuat kuasa serta-merta: (1) Preflight → **Agent Preflight**; (2) Enginetranslation / Agent A → **Agent Translation**; (3) Inspection / Agent B → **Agent Inspector**. Semua perbincangan seni bina, log, dan interaksi ejen seterusnya wajib guna nama rasmi.
- **Fail Terlibat:** `docs/ENGINE_COMPONENT_TAXONOMY.md` (BAHARU, 71 baris — single source of truth taksonomi: jadual 3 komponen + peranan, pemetaan alias deprecated → rasmi, peraturan penggunaan 5 item, nota seni bina dual-role Agent Inspector sebagai pelaksana fizikal Fasa 0).
- **KEKALAN KOD (mandat eksplisit):** TIADA nama fail fizikal atau signature fungsi dalam `src/` diubah — `src/services/subfaberPreflight.js` (= Agent Preflight), `src/services/translationEngine.js` (= Agent Translation), `src/services/agentBInspector.js` (= Agent Inspector) kekal verbatim; entri sejarah `plans/*.md` & ledger lama kekal verbatim (arkib — tafsir via pemetaan §2 dokumen taksonomi).
- **Status npm test:** 313 tests / 312 PASS / 0 FAIL / 1 SKIP (baseline dipelihara; docs-only commit). Prettier --check . PASS · ESLint 0 error (warning no-unused-vars pre-existing).
- **Next Steps:** Semua sesi/dokumen/log baharu guna nama rasmi; dokumen taksonomi dikemas kini sekiranya komponen enjin baharu ditambah. CI dijangka hijau (docs-only).

---

## 2026-10-09 (SELESAI) — Core Protocol seksyen 5 refine: rule #1 TRACE & MAP → TRACE & AUDIT TRAIL

- **Tarikh:** 2026-10-09 (15:43 MYT)
- **Komit SHA:** `f96dca5`
- **Keputusan Owner:** Owner refine langkah 1 seksyen [COGNITIVE DELIBERATION PROTOCOL] — dari "Mentally or explicitly trace" (pilihan) kepada mandate eksplisit: call-chain + dependent callers WAJIB dinyatakan dalam response sebagai auditable proof sebelum sebarang modify code / mutate shared signatures. Compliance kini boleh diaudit, bukan sekadar dipercayai.
- **Fail Terlibat:** `.roo/rules/00-subfaber-core-protocol.md` (1 baris, langkah 1 sahaja; langkah 2-4 tidak berubah).
- **Status npm test:** 313 tests / 312 PASS / 0 FAIL / 1 SKIP (baseline dipelihara). Prettier --check . PASS. `.roomodes` tidak tersentuh — tiada validation gate PyYAML diperlukan.
- **Next Steps:** Tiada — docs-only refine, CI dijangka hijau.

---

## 2026-10-09 (SELESAI) — Core Protocol seksyen 5 (COGNITIVE DELIBERATION PROTOCOL) + .roomodes reorder frontend-first

- **Tarikh:** 2026-10-09 (15:06 MYT)
- **Komit SHA:** `299248b`
- **Keputusan Owner:** Owner edit manual + tambah seksyen 5 dalam `.roo/rules/00-subfaber-core-protocol.md` — diluluskan untuk commit selepas verifikasi penuh.
- **Fail Terlibat:**
  - `.roo/rules/00-subfaber-core-protocol.md` — seksyen baharu [COGNITIVE DELIBERATION PROTOCOL - THINK BEFORE CODE]: 4 langkah wajib sebelum sebarang edit fail/diff kod (TRACE & MAP call-chain, ADVERSARIAL AUDIT failure modes, INVARIANT & REGRESSION CHECK, ATOMIC & COMPLETE EXECUTION tanpa placeholder). Fail kini 5 seksyen: MULTI-AGENT, LANGUAGE, SESSION CONTINUITY, .ROOMODES DISCIPLINE, COGNITIVE DELIBERATION.
  - `.roomodes` — reorder customModes: frontend kini entri pertama, backend kedua (kandungan setiap modul 100% tidak berubah; susunan menentukan paparan dropdown mode).
- **Validation gate .roomodes (wajib per protokol):** Skrip PyYAML read-only — PASS: 2 customModes (frontend=6 rules, backend=7 rules), groups=[read,edit,command,mcp] kedua-duanya, source=project kedua-duanya. LF warning dari git adalah kosmetik (autocrlf), tidak menjejaskan parse.
- **Status npm test:** 313 tests / 312 PASS / 0 FAIL / 1 SKIP (baseline dipelihara). Prettier --check . PASS · ESLint 0 error (215 warning no-unused-vars pre-existing, bukan blocker).
- **Next Steps:** Owner perlu sahkan CI GitHub Actions run berikutnya hijau (docs-only commit, risiko rendah).

---

## 2026-10-09 (SELESAI) — CI FIX: prettier gagal pada .codebuddy/skills/graphify (7 fail) — .prettierignore dibaiki

- **Tarikh:** 2026-10-09 (14:51 MYT)
- **Komit SHA:** `ee8de02`
- **Punca CI merah (run #239/#240, step 7 "Check formatting"):** 7 fail `.codebuddy/skills/graphify/` (SKILL.md + 6 references) tidak mematuhi prettier — dipulihkan verbatim dari komit dangling `91dd8d4` semasa insiden `f70a627` tanpa pemformatan; `.prettierignore` tiada entri `.codebuddy` (hanya .roo/.kilo/.github/.vscode). `npx prettier --check .` gagal di kedua-dua matriks (Node 22/24, exit 1 pada step:7:14).
- **Pembaikan:** `.prettierignore` + entri `.codebuddy` (fail skill agent = metadata bukan kod projek; konsisten dengan .roo/.kilo yang sudah dikecualikan). Kandungan graphify TIDAK diformat semula (elak diff mengelirukan pada fail skill).
- **Pengesahan lokal (spiegel CI):** prettier --check . PASS · eslint . PASS · npm test 313/312 PASS/0 FAIL/1 SKIP — ALL-GREEN.
- **Pengesahan CI (GitHub API check-runs):** run #241 pada `ee8de02` — Node.js 22 `conclusion: success` + Node.js 24 `conclusion: success` — CI HIJAU disahkan 06:53 UTC.
- **Next Steps:** Tiada — CI pulih sepenuhnya.

---

## 2026-10-09 (SELESAI) — v3.8.42 Pariti Retry-Backoff 1:1 Gemini (cadangan diluluskan owner, diimplementasikan)

- **Tarikh:** 2026-10-09 (14:38 MYT)
- **Komit SHA:** `4c67898`
- **Keputusan Owner:** "Cadangan diluluskan" — backoff exponential 1:1 Gemini dilaksanakan pada semua gelung retry provider.
- **Fail Terlibat:**
  - `src/services/providers/retryBackoff.js` (BAHARU, 92 baris) — modul tunggal formula backoff: base×2^attempt, jitter 0.8-1.2x, floor 50ms; keutamaan options.retryBackoffBaseMs > env PROVIDER_RETRY_BACKOFF_BASE_MS > lalai 3000 (= Gemini); 0 eksplisit = melumpuhkan.
  - `src/services/providers/openaiCompatible.js` — import + constructor (retryBackoffBaseMs) + await sleepRetryBackoff pada 2 gelung retry (non-stream baris ~966, stream baris ~1224). Keluarga terkesan: openai/xai/deepseek/mistral/openrouter/cfworkers/custom.
  - `src/services/providers/anthropic.js` — sama, 2 gelung retry.
  - `src/services/providers/deepl.js` — sama, 1 gelung retry.
  - `src/services/provider-retry-backoff-regression.test.js` (BAHARU, 8 ujian) — keutamaan konfig, growth exponential, BERDELAY semua gelung, tingkah laku-lama bila 0, pariti formula ≡ Gemini baris-demi-baris. Didaftarkan dalam test:tracked.
  - `package.json` — 3.8.41 → 3.8.42 + pendaftaran test.
  - `CHANGELOG.md` — header v3.8.42.
  - GoogleTranslate TIDAK dipatch (ada sleep+backoff sendiri 4s/8s sejak asal).
- **Status npm test:** 313 tests / 312 PASS / 0 FAIL / 1 SKIP (baseline 304 → 312; +8 ujian backoff). Prettier bersih (fail baru diformat). ESLint 0 error (3 warning DEFAULT_TRANSLATION_PROMPT pre-existing).
- **Next Steps:** Owner boleh uji semula translation rootsys — 502 transient kini pulih sendiri melalui window 3s/6s/12s.

---

## 2026-10-09 — FORENSIK LOG 502 CUSTOM PROVIDER (rootsys.cloud): diagnosis, tiada perubahan kod

- **Tarikh:** 2026-10-09 (14:18 MYT)
- **Komit SHA:** `d16979c` (HEAD semasa; diagnosis read-only)
- **Trigger:** Owner hantar log translation live via custom provider (deepseek-v4-pro, rootsys.cloud): batch 1-9/13 lancer, Agent B inspection PASS semua, pre-flight kimi-k3 101s lengkap; batch 10 gagal `502` → 3 retry dalam 37ms → job mati pada 450/648 (69%).
- **Dapatan forensik:**
  1. **Punca primer:** upstream rootsys.cloud pulangkan HTTP 502 (gateway/upstream down sekejap — bukan bug SubFaber, bukan payload). Semua batch sebelumnya lancer + Agent B sendu ke endpoint sama berjaya sebelum & selepas → transient.
  2. **Gap pariti sebenar dikenal pasti (satu-satunya):** gelung retry `OpenAICompatibleProvider.streamTranslateSubtitle()` TIADA backoff delay — 3 percubaan meluru dalam 37ms; Gemini `retryWithBackoff()` ada 3s/6s/12s + jitter. Untuk 502 transient (gateway restart/hot-reload), 37ms terlalu cepat — window pemulihan tidak ditangkap. Gelung `translateSubtitle()` non-stream & DeepL juga tiada delay (pariti bug antara mereka, tapi Gemini satu-satunya yang betul).
  3. **502 = retryable mengikut apiErrorHandler** (statusCode >= 500 → server_error, isRetryable: true) — klasifikasi betul; kelemahan pada TIMING sahaja.
  4. **Model [kimi-k3] dalam pre-flight bukan bug:** pre-flight menggunakan model Agent B (inspector), translator utama deepseek-v4-pro — seni bina Dual-AI (SubFaberPreflight baris 558).
  5. **Agent B "CRIME DETECTED REGISTER" batch 1 (baris 37-38):** behaviour direka — inspector tangkap kesalahan semantik (Cik Nie vs Pak Cik), trigger retry, retry PASS dalam 2.1s. Sistem bekerja seperti dijadualkan.
  6. **Tiada fallback secondary provider aktif** → kegagalan membunuh job terus (cache partial dibersihkan). Ini pilihan konfigurasi, bukan bug.
- **Cadangan pembaikan (menunggu keputusan owner):** tambah exponential backoff + jitter pada kedua-dua gelung retry openaiCompatible.js (selari Gemini 3s→6s→12s ×0.8-1.2). Dengan backoff, 502 8-minit pun sebahagian boleh pulih.
- **Fail Terlibat (audit sahaja):** src/services/providers/openaiCompatible.js (baris 1179-1225, 899-969), src/services/gemini.js (retryWithBackoff), src/utils/apiErrorHandler.js (status>=500), src/services/subfaberPreflight.js
- **Status npm test:** Tak dijalankan semula (tiada kod produksi disentuh — diagnosis sahaja).
- **Next Steps:** Owner sahkan sama ada mahu backoff parity fix diimplementasikan.

---

## 2026-10-09 — AUDIT PARITI PAYLOAD LANJUTAN: SEMUA 10 SENARIO PROVIDER vs GEMINI (laparan penuh, tiada perubahan kod produksi)

- **Tarikh:** 2026-10-09 (14:05 MYT)
- **Komit SHA:** `67d068f` (HEAD; audit read-only — entri ledger ini dikomit di atasnya)
- **Keputusan Owner:** Owner meminta pengesahan 1:1 verbatim bagi SEMUA provider UI: (1) Gemini [official + CrazyRouter], (2) Multiple providers beta: OpenAI, Anthropic, xAI, DeepSeek, DeepL, Mistral, Cloudflare Workers AI, OpenRouter, Google Translate, Custom Provider.
- **Dapatan per senario:**
  - **Gemini Direct & Gemini CrazyRouter** — kelas `GeminiService` sama verbatim; bezanya hanya baseUrl + header auth (x-goog-api-key vs Bearer). Payload contents/generationConfig/systemInstruction 100% identik. PARITI PENUH.
  - **OpenAI, xAI, DeepSeek, Mistral, OpenRouter, Custom** — semua kelas `OpenAICompatibleProvider`: splitStructuredPrompt modul sama, messages[role:system|user], sampling 0.2/0.95. PARITI PENUH (adaptasi skema chat/completions wajib). GPT-5* omit sampling (parallel dengan Gemini 3.x-strict strip).
  - **Anthropic** — splitStructuredPrompt sama; field `system` top-level; temp 0.2/top_p 0.95 aktif (thinkingBudget default 0 = OFF). PARITI PENUH (kekangan thinking→temp 1.0 bila aktif).
  - **Cloudflare Workers AI** — pariti dengan family OpenAI-compat; topP 0.9 (kekangan vendor); laluan translation model berasingan (m2m100/nllb). PARITI DENGAN PENGECUALIAN TERDOKUMENTASI.
  - **DeepL & Google Translate** — NATIVE-BATCH providers (`NATIVE_BATCH_PROVIDER_NAMES`): BUKAN LLM, tiada prompt/sampling dihantar (SRT mentah → entries → skema vendor `text[]/target_lang` atau `client/sl/tl`). Pariti payload LLM tidak terpakai secara fizikal — BY DESIGN.
- **Divergensi sebenar dikenal pasti (deliberate, bukan drift):** default `maxOutputTokens` keluarga beta LLM = 32768 (vs Gemini 65536) — vendor-aware (gpt-4o output cap 16K; hantar 65536 = HTTP 400). Model reasoning (deepseek/kimi/glm/claude/gpt-5/o1/o3/minimax/hy3) di-floor ke 65536 oleh `getCappedMaxOutputTokens()` → pariti efektif dengan Gemini bagi semua model reasoning.
- **Fail Terlibat (audit sahaja):** src/services/translationEngine.js (native-batch gate), src/services/translationProviderFactory.js, src/utils/config.js (PROVIDER_PARAMETER_DEFAULTS penuh), src/services/providers/{openaiCompatible,anthropic,deepl,googleTranslate}.js
- **Status npm test:** 305 / 304 PASS / 0 FAIL / 1 SKIP (dijalankan 05:45 UTC sesi ini; tiada kod produksi berubah selepas itu).
- **Next Steps:** Tiada perubahan kod diperlukan. Keputusan owner sahaja bila mahu samakan default maxOutputTokens beta LLM ke 65536 (risiko: model non-reasoning cap rendah akan 400).

---

## 2026-10-09 — AUDIT PARITI PAYLOAD: Custom Provider vs Gemini (laporan, tiada perubahan kod produksi)

- **Tarikh:** 2026-10-09 (13:45 MYT)
- **Komit SHA:** `82898f6` (HEAD semasa; audit read-only — hanya entri ledger ini dikomit)
- **Keputusan Owner:** Owner meminta pengesahan sama ada custom provider berkongsi struktur API payload 1:1 dengan main provider Gemini.
- **Dapatan:** PARITI DIJAMIN pada semua dimensi portable — (1) split static/dynamic prompt melalui modul tunggal `splitStructuredPrompt` (Gemini: systemInstruction top-level {parts:[{text}]}; OpenAI-compat: messages[0] role:system; Anthropic: field system); (2) sampling default universal temperature 0.2 / topP 0.95 merentas SEMUA provider (`PROVIDER_PARAMETER_DEFAULTS` src/utils/config.js); (3) maxOutputTokens 65536; (4) nama kunci payload diadaptasi mengikut skema API vendor (wajib — skema v1beta Gemini tidak diterima endpoint chat/completions). Divergensi terdokumentasi (deliberate): cfworkers topP 0.9; Anthropic class-fallback temperature 0.4 (dead path — factory sentiasa inject 0.2); frontier rules kimi (drop sampling + max_tokens 16384) / glm-5.3 penuh (temp 0.0/top_p 0.1) per Mandat Frontier 2026-09-26; Anthropic thinking memaksa temperature=1 (kekangan API Claude); prefill model-role Gemini-sahaja (model ≤3.1).
- **Fail Terlibat (audit sahaja):** src/services/gemini.js, src/services/utils/structuredPrompt.js, src/services/providers/openaiCompatible.js, src/services/providers/anthropic.js, src/services/translationProviderFactory.js, src/utils/config.js
- **Status npm test:** 305 / 304 PASS / 0 FAIL / 1 SKIP — baseline kekal utuh.
- **Next Steps:** Tiada perubahan kod diperlukan — pariti sedia ada memenuhi mandat "semua LLM berkongsi setup sama dengan main provider Gemini 1:1".

---

## 🧪 STATUS SEMASA SEBELUM MANUAL CONDENSATION (owner announcement 2026-10-09 00:39 MYT)

- **Tujuan blok ini:** Owner mengumumkan manual condensation sebagai UJIAN LANGSUNG prosedur rule #7. Blok ini ditulis SEBELUM butang ditekan, mengikut prosedur.
- **HEAD Git:** `a65a6cb` — semua kerja didorong ke origin/main, working tree bersih dari perubahan track.
- **Status tugasan:** Misi "Perfect Coherence" 2026-10-08 LENGKAP — TIADA tugasan tergendala.
  - Global rules: `.roo/rules/` (00-core-protocol + 10-context7 + 20-process-management) — semua dikomit & didorong (`74f2ad9`, `747f611`)
  - `.roomodes`: backend 7 + frontend 6 rules — condensation-proof (`5f12e1c`)
  - Ledger: lengkap sehingga `a65a6cb`
  - Graphify: skill + topology dalam repo (`f70a627`), graph dibina dari `5d0274f`
- **npm test baseline:** 305 / 304 PASS / 0 FAIL / 1 SKIP (terakhir disahkan semasa Fasa H; tiada kod produksi berubah sejak itu).
- **Ujian yang owner sedang jalankan:** Selepas condensation, owner dijangka menyuruh AI menyemak sama ada AI (pasca-condense) masih "sedar" keadaan melalui ledger ini. Inilah pengesahan empirikal prinsip "a summary is not a memory - verify against the ledger."
- **Arahan untuk AI pasca-condensation:** Baca blok ini, sahkan HEAD semasa dengan `git log --oneline -1` (sepatutnya `a65a6cb` atau lebih baharu), kemudian jawab owner dalam BM standard tanpa berhalusinasi. Semua yang kau perlu tahu ada dalam repo — bukan dalam ringkasan context kau.

---

## 2026-10-08 (SELESAI) — 2 rules user-global dipindahkan ke workspace — SEMUA rules kini version-controlled

- **Tarikh:** 2026-10-09 (00:29 MYT)
- **Komit SHA:** `747f611`
- **Keputusan Owner:** 2 rules user-global (`context7-docs.md` + `process-management.md`) dipindahkan MANUAL oleh owner ke workspace sebagai `10-context7-docs.md` + `20-process-management.md`; global `C:/Users/khaty/.roo/rules/` dikosongkan (zero-duplikasi). Sebelum ini owner juga mengosongkan Custom Instructions for All Modes UI — ujian AI baharu LULUS (4 sections dikenal pasti, source "Rules from .roo directories", jawapan dalam BM standard mengikut LANGUAGE POLICY).
- **Fail Terlibat:** `.roo/rules/10-context7-docs.md` (+6), `.roo/rules/20-process-management.md` (+16)
- **Pengesahan AI:** Kandungan kedua-dua fail utuh (ZERO TOLERANCE taskkill node.exe + Context7 discipline); global kosong (0 files); susunan abjad 00→10→20 betul.
- **Status npm test:** Tak dijalankan semula (tiada kod produksi disentuh sepanjang misi coherence).
- **Next Steps:** TIADA — misi "Perfect Coherence" 2026-10-08 lengkap. Sesi AI seterusnya mewarisi: 3 fail rules repo + .roomodes (7+6 rules) + ledger + Graphify topology — semuanya version-controlled.

---

## 2026-10-08 (final+++) — Rule #5 MODE-ACTIVATION AWARENESS + .roo/rules/00-subfaber-core-protocol.md

- **Tarikh:** 2026-10-08 (23:10 MYT)
- **Komit SHA:** `5f12e1c` (frontend #6 self-sufficient) + `74f2ad9` (fail core protocol)
- **Keputusan Owner:**
  1. Rule #5 MODE-ACTIVATION AWARENESS ditambah dalam Custom Instructions UI (kesan forensik pelanggaran: commit dibuat semasa mode Frontend aktif — kelompongan: tiada arahan bila arahan owner bercanggah dengan domain mode; AI wajib flag dulu, owner sahkan override, tak pernah senyap).
  2. Frontend rule #6 diperkukuh prosedur amaran condensation (self-sufficient — customInstructions di-inject per-mode; frontend tak nampak rules backend).
  3. Fail `.roo/rules/00-subfaber-core-protocol.md` (24 baris) ditambah MANUAL oleh owner (workspace, general rules) — 4 seksyen: MULTI-AGENT PROTOCOL 5 item + LANGUAGE POLICY + SESSION CONTINUITY + .ROOMODES DISCIPLINE (pelajaran insiden). Global instructions kini version-controlled.
  4. Perbincangan `.roo/rules/`: kelebihan (version-controlled, ikut repo, modul alphabetical, AGENTS.md support) + kos (token per sesi, satu sumber kebenaran). Owner akan kosongkan UI global selepas sahkan fail load pada sesi baharu.
- **Fail Terlibat:** `.roo/rules/00-subfaber-core-protocol.md` (baharu), `.roomodes` (frontend #6), Custom Instructions UI (rule #5)
- **Status npm test:** Tak dijalankan semula (tiada kod produksi disentuh).
- **Next Steps:** Owner kosongkan "Custom Instructions for All Modes" UI selepas verify fail load pada sesi baharu (elak double-load token + drift).

---

## 2026-10-08 (final++) — Rule SESSION LEDGER diperluas kepada condensation/compression oleh owner

- **Tarikh:** 2026-10-08 (22:07 MYT)
- **Komit SHA:** `f372502`
- **Keputusan Owner:** Ayat baharu untuk backend rule #7 dan frontend rule #6 — menutup loophol condensing manual yang owner tanya ("kalau aku tekan butang context condesing secara manual sebab dah rasa berat"). Owner paste manual, AI sahkan & komit.
- **Butiran perubahan (owner-mandated):**
  - Trigger baharu: `context reset, new session, OR context condensation/compression (conversation history replaced by a summary)`
  - Anti-PALATAU: `a summary is not a memory: never trust condensed recall for commit SHAs, test baselines, or task state; always verify against the ledger`
  - Prosedur baharu: `If the owner announces an upcoming manual condensation, append current task status to ledger BEFORE proceeding` (backend sahaja)
- **Pengesahan AI sebelum komit (protokol insiden):** PyYAML SAH — customModes 2; backend 7 rules + frontend 6 rules; `condensation: True`, `summary is not a memory: True`, `upcoming manual condensation: True` (backend); groups+source lengkap; diff seimbang 19/19 = penukaran teks tulen.
- **Status npm test:** Tak dijalankan semula (tiada kod produksi disentuh).
- **Next Steps:** Tiada tindakan berbaki — sistem Trinity kini lengkap dengan trigger condensation.

---

## 2026-10-08 (final+) — Skill Graphify dipulihkan semula (dangling 91dd8d4)

- **Tarikh:** 2026-10-08 (21:39 MYT)
- **Komit SHA:** `f70a627`
- **Keputusan Owner:** Soalan owner "benda pertama AI akan buat adalah tengok map graphify?" membuka forensik — didapati komit `91dd8d4` (skill Graphify 10 fail) HILANG dari main: ia jadi mangsa `git reset --hard HEAD~2` semasa pemulihan insiden .roomodes (reset melangkau 2 komit). Komit masih wujud (dangling) → dipulihkan verbatim via `git checkout 91dd8d4 -- .codebuddy/` (protokol: checkout, bukan tulis semula).
- **Fail Terlibat:** `.codebuddy/skills/graphify/` (10 fail, +1,589 baris)
- **Demo live query Graphify:** query "what connects runPreflightSemanticPass to buildChatRequest" pulangkan topology sebenar (Community 17→19, melalui AgentBInspector/OpenAICompatibleProvider, termasuk splitStructuredPrompt + fail test) — bukti nilai query-first discipline.
- **Status npm test:** Tak dijalankan semula (tiada kod produksi disentuh — hanya restore fail skill yang sama dari komit sedia ada).
- **Next Steps:** Tiada tindakan berbaki.

---

## 2026-10-08 (final) — .roomodes diseragamkan English oleh owner

- **Tarikh:** 2026-10-08 (20:06 MYT)
- **Komit SHA:** `91813bd` (entri ini — .roomodes English) + `2371db0` (nota insiden 856da99)
- **Keputusan Owner:** Arahan modes Backend & Frontend diseragamkan kepada Bahasa English sepenuhnya oleh owner sendiri (tiada lagi bahasa rojak) — perubahan dibuat tangan owner, AI hanya mengesahkan & mengomit.
- **Fail Terlibat:** `.roomodes` (29 baris ditukar, struktur + bilangan rule kekal)
- **Pengesahan AI sebelum komit (protokol insiden):** PyYAML SAH — customModes 2; backend 7 rules (CORE PROHIBITION, PRESERVATION, GROUND TRUTH, TEST BASELINE 305/304, DELEGATION, RELEASE PIPELINE, SESSION LEDGER) + frontend 6 rules (semua kekal, termasuk SESSION LEDGER); groups [read,edit,command,mcp] + source project lengkap; diff seimbang 29/29 = penukaran bahasa tulen, tiada rule hilang.
- **Status npm test:** 305 / 304 PASS / 0 FAIL / 1 SKIP (diaturkan selepas pemulihan insiden — kekal hijau)
- **Next Steps:** Tiada tindakan berbaki. `npm test` baseline stabil; CI hijau dijangka pada 91813bd.

---

## 2026-10-08 (later) — Imbasan topologi kod pertama (Graphify) — MANDAT SELESAI

- **Tarikh:** 2026-10-08 (18:43–18:50 MYT)
- **Komit SHA:** `425dff6` (entri ini) + `91dd8d4` (skill `.codebuddy/` dikomit arahan owner - 10 fail, +1,589 baris) + `856da99` (rule SESSION LEDGER dalam `.roomodes`: backend #7 + frontend #6 - pemulihan muktamad via git checkout 425dff6 + insert programatik Python + validasi PyYAML, hanya +2 baris)
- **NOTA INSIDEN (jujur):** Percubaan #1 (apply_diff, `40aeefa`) dan #2 (write_to_file, `394ed84`) MEROSAKKAN `.roomodes` - modes hilang dari zoo code owner. Punca #1: indentation salah diwarisi; punca #2: kandungan tercemar lapisan markdown. PEMULIHAN MUKTAMAD `856da99`: `git checkout 425dff6` (base bersih) + insert programatik script Python + validasi PyYAML (customModes 2; backend 7 rules + frontend 6 rules; groups + source lengkap). **PELAJARAN KEKAL: `.roomodes` HANYA selamat diubah via git checkout dari komit bersih + insert programatik script fail + validasi PyYAML SEBELUM komit. DILARANG mutlak: apply_diff, write_to_file terus ke `.roomodes`, node -e inline - ketiga-tiganya terbukti gagal dalam insiden ini.**
- **Keputusan Owner (mandat AI owner):**
  1. Imbasan topologi `graphify . --code-only` dijalankan — exit code 0, sifar kos API (AST tempatan).
  2. Integriti fail disahkan: `graphify-out/GRAPH_REPORT.md` (36.7KB) + `graph.json` (4.96MB, 3,697 nodes / 9,004 edges / 149 communities) + `graph.html` (3.83MB) wujud; `git status` membuktikan sifar fail output terlepas ke staged/untracked — `.gitignore` (rule `:62-63`) bekerja seperti dijangka.
  3. Entri ledger ini merakam status pemasangan Graphify + baseline ujian 304 PASS kekal hijau + ketersediaan peta topologi untuk sesi seterusnya.
- **Butiran imbasan:** 196 fail kod diparse (84 fail tak berkaitan di-skip; 3 fail sensitif di-skip selamat: `.npmrc`, `a07-max-tokens.json`, `resp-a07-max-tokens.txt`); 321 non-code di-skip (270 docs, 51 images) — TIADA panggilan LLM. Extraction: 94% EXTRACTED / 6% INFERRED (531 edges, avg confidence 0.85) / 0% AMBIGUOUS. Token cost: 0 input / 0 output. Graph dibina dari komit `5d0274f` — segar.
- **Toolchain:** graphifyy 0.9.80 (uv tool) + skill CodeBuddy `.codebuddy/skills/graphify/SKILL.md` (project-scoped) + `~/.codebuddy/CODEBUDDY.md` global.
- **Next Steps:**
  1. Sesi seterusnya boleh mulakan dengan `graphify query "<soalan>"` untuk navigasi topologi berbanding baca fail mentah.
  2. Selepas sebarang perubahan kod: `graphify update .` (sifar kos API) supaya peta kekal segar.
  3. Penilaian nilai sebenar Graphify: adakah query discipline jimat token vs baca fail — direkod dalam ledger bila ada data sebenar.

---

## 2026-10-08 — Alias SSH canonical `stremiosubfaber` + Protokol Session Ledger

- **Tarikh:** 2026-10-08 (17:40–18:30 MYT)
- **Komit SHA:** `69717ec` (alias SSH) + `17aa659` (ledger + .gitignore + .roomodes baseline)
- **Keputusan Owner:**
  - Pemindahan penamaan total ke `stremiosubfaber` dilaksanakan cara senior dev: deprecation transition — alias canonical `stremiosubfaber` ditambah dalam `~/.ssh/config`, alias legacy `stremiosubmaker` dikekalkan semasa tempoh burn-in (backup: `~/.ssh/config.bak-stremiosubfaber`).
  - Mandat PROTOKOL SESSION LEDGER diterima daripada AI owner: (1) fail ini wajib di-append setiap tugasan selesai; (2) `graphify-out/` wajib diabaikan git; (3) persediaan imbasan topologi Graphify disahkan.
- **Fail Terlibat:**
  - `~/.ssh/config` (luar repo — backup + blok `Host stremiosubfaber stremiosubmaker`)
  - `plans/kimi-k3-rootsys-ground-truth-2026.md` — §5.7 nota rantaian akses dikemas kini
  - `docs/SESSION_LEDGER.md` — fail ini (wujud)
  - `.gitignore` — +`graphify-out/` (guard sebelum imbasan pertama)
- **Status npm test:** 305 tests / 304 PASS / 0 FAIL / 1 SKIP (baseline kekal, `stremio-subfaber@3.8.41`)
- **Next Steps:**
  1. Install `uv` + `graphifyy` (Python 3.12.2 ✓) — persediaan imbasan topologi pertama.
  2. Jalankan `/graphify . --code-only` selepas persediaan disahkan → nilai `GRAPH_REPORT.md` untuk codebase SubFaber.
  3. Rekod keputusan penilaian Graphify dalam ledger ini.
  4. Selepas tempoh burn-in, buang `stremiosubmaker` dari `~/.ssh/config` (pemindahan 100% penuh).

---

## 2026-10-07/08 — Fasa H: Pre-Flight system/user split (G1 Moonshot) — v3.8.41

- **Tarikh:** 2026-10-07–08
- **Komit SHA:** `16bc5a0` (Fasa H, 9 fail +311/−24) + `8456307` (nota baseline)
- **Keputusan Owner:**
  - "Teruskan fasa H" — integrasi varian G1 (system/user split) pemenang eksperimen Fasa G ke produksi, melalui konvensyen `SUBFABER_PROMPT_BOUNDARY` + `splitStructuredPrompt()`; kontrak single-string prompt kekal (cache key/token counting/retry tak berubah); Gemini & Anthropic dapat split percuma.
  - Bug legasi ditemui & dibunuh: `meta.systemPrompt` diterima tapi tak pernah digunakan dalam laluan fallback `buildChatRequest`.
- **Fail Terlibat:** `src/services/subfaberPreflight.js`, `src/services/agentBInspector.js`, `src/services/providers/openaiCompatible.js`, `make-preflight-payload.js`, `make-preflight-payload-slim.js`, `src/services/subfaber-fasah-regression.test.js` (baharu, 8 ujian), `package.json` (3.8.41 + test:tracked), `CHANGELOG.md`, `plans/kimi-k3-rootsys-ground-truth-2026.md` (§6.2–§6.3, §7)
- **Status npm test:** 305 / 304 PASS / 0 FAIL / 1 SKIP (297→304 selepas suit Fasa H didaftarkan)
- **Deployment:** VPS `stremiosubfaber` — `git pull` + `docker compose up -d --build subfaber`, kontena sihat @ 3.8.41, CI SUCCESS (`16bc5a0`)
- **Next Steps:** (direkod dalam §6.3/§7 nota misi) — validasi empirikal pasca-integrasi 3 run SRT sebenar di VPS (menunggu kelulusan owner).

---

## 2026-10-07 — Fasa G: Eksperimen Moonshot 9 panggilan (G1/G2/G3 × 3)

- **Tarikh:** 2026-10-07
- **Komit SHA:** `dd1d2f5` (Fasa F+G docs)
- **Keputusan Owner:** "Aku beri keizinan Fasa G" — eksperimen 3 varian struktur prompt dijalankan di VPS (kimi-k3 via rootsys, payload god-tier 4-kunci).
- **Keputusan eksperimen:** G1 MENANG (terms J 0.72, null spread 7pt ≤10pt, pollution 0, type 100%); G2 DIBUANG (chars J 0.67 — precision-over-recall potong watak sebenar); G3 TIDAK PRAKTIKAL (reasoning ~2×, timeout R3 290s).
- **Fail Terlibat:** `.tmp-kimi-gen-g.js`, `.tmp-kimi-g-run.sh`, `.tmp-kimi-analyze-g.js` (probe — tidak dikomit), `plans/kimi-k3-rootsys-ground-truth-2026.md` (§6.2)
- **Status npm test:** 298 / 297 PASS / 0 FAIL / 1 SKIP
- **Next Steps:** Fasa H integrasi G1 (selesai — lihat blok atas).

---

## 2026-10-13 — Frontend: Susunan medan Secondary Fallback diselaraskan dengan kad utama

- **Tarikh:** 2026-10-13
- **Komit SHA:** (belum dikomit — menunggu audit integrasi backend)
- **Keputusan Owner:** "kenapa buat kerja cincai? kenapa tak ikut balik susunan yang betul?" — susunan medan sub-kad Secondary Fallback tidak sepadan dengan kad utama (Base URL diletak di hujung selepas Model; Format/Door muncul sebelum Model).
- **Pembetulan:** Blok Base URL dipindahkan ke atas Format/Door supaya hierarki sub-kad fallback kini sama dengan kad utama: Provider → API Key (+ Test) → Base URL → Format/Door → Model. Berlaku untuk kedua-dua mode Basic dan Pro (sub-kad fallback dibina oleh fungsi yang sama `buildSecondaryFallbackRow()`).
- **Fail Terlibat:** `public/js/trinity-agents.js` (sahaja — tiada fail backend disentuh)
- **Status verifikasi:** `node --check public/js/trinity-agents.js` ✅; `npx prettier --check public/js/trinity-agents.js` ✅; `npx eslint public/js/trinity-agents.js --quiet` 0 error ✅. (npm test/graphify akan dijalankan oleh sesi backend penuh.)
- **Next Steps:** Handover ke Backend mode untuk audit integrasi (form payload serialization, rehydration, server schema) sebelum sebarang commit.
  
## 2026-10-14 - Frontend: Secondary Fallback Provider - toggle on/off kanan + kad premium  
  
- **Tarikh:** 2026-10-14 (waktu tempatan KL)  
- **Keputusan Owner:** Design terlalu simple; toggle on/off kena di sebelah kanan, bukan klik-header-untuk-buka.  
- **Perubahan:** Sub-kad fallback dinaik taraf - header sentiasa terlihat, toggle iOS-style switch di penjuru kanan, status chip ON/OFF, medan HIDE (bukan LOCK) bila toggle mati. Tiada lagi klik-header-untuk-buka.  
- **Fail Terlibat:** public/js/trinity-agents.js (buildSecondaryFallbackRow), public/css/trinity-agents.css (kad premium + toggle switch + status chip)  
- **Status verifikasi:** node --check ?; prettier --check ?; eslint --quiet 0 error ?.  
- **Kontrak payload:** Tiada perubahan - checkbox id `trinity-translation-fallback-enabled` kekal, readFallbackState/applyFallbackValues/collectConfigPatch tidak berubah.  
- **Next Steps:** Handover ke Backend mode untuk audit integrasi (form payload serialization, rehydration, server schema) sebelum sebarang commit. 
  
## 2026-10-14 - RELEASE v3.9.42: SECONDARY FALLBACK - TOGGLE ON/OFF KANAN + KAD PREMIUM (PIPELINE 8-LANGKAH)  
  
- **Tarikh:** 2026-10-14 (waktu tempatan KL)  
- **Komit SHA:** 40d9fba (push ke origin main)
- **Keputusan Owner:** Design sub-kad fallback terlalu simple; toggle on/off mesti di sebelah kanan, bukan klik-header-untuk-buka.  
- **Perubahan:** public/js/trinity-agents.js (buildSecondaryFallbackRow: toggle iOS-switch kanan + status chip ON/OFF + id status; applyFallbackValues: sync status chip programatik) + public/css/trinity-agents.css (kad premium: border solid, gradient, shadow, switch 44x24px, chip pill).  
- **Integration Review Backend: LULUS** - kontrak payload sifar perubahan (id checkbox kekal; readFallbackState/applyFallbackValues/collectConfigPatch + skema server multiProviderEnabled/secondaryProvider*/providers/custom_secondary utuh); 1 race ditemui dan difix (status chip stale semasa rehydrate kerana .checked programatik tak trigger event change).  
- **Status npm test:** 368 tests: 367 PASS / 0 FAIL / 1 SKIP (padan baseline); prettier + eslint hijau; graphify update: 5161 nodes / 11119 edges / 252 communities.  
- **Next Steps:** Commit + push  CI Success  tutup. 

# Laporan Audit & Pelan Induk Penyusunan Semula UI/UX A–Z — SubFaber

> **Status:** FASA AUDIT & PELAN — TIADA KOD PRODUKSI DISENTUH.
> **Tarikh:** 2026-10-14 · **Backend Lead:** GLM 5.3 · **Frontend Lead:** Astra · **Kelulusan:** Owner
> **Sumber audit:** [`public/partials/main.html`](public/partials/main.html:1) (3739 baris), [`public/config.js`](public/config.js:1) (13956 baris), [`public/js/trinity-agents.js`](public/js/trinity-agents.js:1) (2256 baris), [`src/utils/config.js`](src/utils/config.js:1), [`public/css/trinity-agents.css`](public/css/trinity-agents.css:1).

---

## BAHAGIAN A — INVENTORI LENGKAP A–Z (URUTAN DOM SEMASA, ATAS → BAWAH)

### A.1 Konfigurasi Halaman (Configuration page)

| # | Elemen (DOM ID) | Lokasi Semasa | Fungsi Backend | Kebergantungan Silang |
|---|---|---|---|---|
| 1 | `#quickSetupBanner` | app-quick-stack (atas) | Aktif — buka wizard Quick Setup | Tiada |
| 2 | `#noTranslationMode` | app-quick-stack (atas) | **AKTIF** — [`noTranslationMode`](src/utils/config.js:1308) melangkau penterjemahan AI | Mengawal `#noTranslationCard` (Languages), sorok `#sourceCard`/`#targetCard`/`#geminiCard`/`#translationSettingsCard`/`#learnTargetsCard` (config.js:11014–11249); togol kumpulan varian `*NoTranslation` (main.html:1847–1924) |
| 3 | **SEKSYEN API KEYS** `#apiKeysSection` (collapsed) | Seksyen 1 | Induk keluarga | — |
| 3.1 | Token Vault `#tokenVaultInline` / `#tokenVaultLauncher` / `#tokenVaultRail` | Dalam section-grid API Keys | Aktif — rail kunci draft | Tiada |
| 3.2 | Kad "Subtitles API Keys" `data-card="subtitle-api"` | Anak 1 API Keys | — | |
| 3.2.1 | `#enableOpenSubtitles` + radio `#opensubtitlesImplV3`/`#opensubtitlesImplAuth` + `#opensubtitlesAuthConfig` (`#opensubtitlesUsername`, `#opensubtitlesPassword`, `#validateOpenSubtitles`) | Dalam kad | **AKTIF** — implementasi v3/auth OpenSubtitles | Tiada |
| 3.2.2 | `#enableSubSource` + `#subsourceApiKey` + `#validateSubSource` | Dalam kad | AKTIF | Tiada |
| 3.2.3 | `#enableSubDL` + `#subdlApiKey` + `#validateSubDL` | Dalam kad | AKTIF | Tiada |
| 3.2.4 | `#subtitleProviderTimeout` (slider 8–60s) | Dalam kad | AKTIF — timeout fetch sumber | Tiada |
| 3.3 | Kad "Gemini API" `#geminiCard` `data-card="gemini"` | Anak 2 API Keys | AKTIF — [`geminiApiKey`](src/utils/config.js:1307), [`geminiModel`](src/utils/config.js:1306), [`geminiKeyRotationEnabled/Mode`](src/utils/config.js:1316), geminiApiKeys (rotasi) | Sorok oleh `#noTranslationMode` |
| 3.4 | Kad **"Other API Keys"** `#otherApiKeysCard` `data-card="other-api"` (`style="display:none"`) | Anak 3 API Keys (atas Translation!) | **SEPARUH AKTIF** — CF Workers AI ([`cloudflareWorkersApiKey`](src/utils/config.js:1326)) & AssemblyAI ([`assemblyAiApiKey`](src/utils/config.js:1325)) untuk Auto-Subs; `otherApiKeysEnabled` dipaksa `true` di normalizeConfig (src/utils/config.js:976) | ⚠️ **ISU #1:** dipaparkan oleh `toggleOtherApiKeysSection()` (config.js:11276) yang dipacu `isSubToolboxEnabled()` — togol Enable Sub Toolbox yang letaknya **jauh di bawah** (Other Settings) memunculkan kad ini **di atas** |
| 3.5 | Kad **"Translation API Keys"** `#trinityRoot` (dibina atur cara oleh [trinity-agents.js:1612](public/js/trinity-agents.js:1612)) | Disisip dalam section-grid API Keys sebelum footer close | **AKTIF** — Trinity agents `{preflight, translation, inspector}` × `{apiKey, format, baseUrl, model, provider, door, isCustom, enabled}`; togol `#trinityModeToggle` Basic/Pro; Secondary Fallback (sub-kad `.trinity-fallback`) | Sorok oleh `#noTranslationMode` (family state); `.trinity-mode-hidden` antara mod; rehydrate via modelSyncHook + `_rehydratingMode` |
| 4 | **SEKSYEN LANGUAGES** `#languagesSection` | Seksyen 2 | Induk keluarga bahasa | — |
| 4.1 | Kad No-Translation Languages `#noTranslationCard` (`display:none`) | Anak 1 (khas mod Just-Fetch) | AKTIF — [`noTranslationLanguages`](src/utils/config.js:1309) | Dikawal `#noTranslationMode` |
| 4.2 | Kad Source Languages `#sourceCard` | Anak 2 | AKTIF — `sourceLanguages` | Dikawal `#noTranslationMode` |
| 4.3 | Kad Target Languages `#targetCard` (`#extendedLanguagesToggle`) | Anak 3 | AKTIF — `targetLanguages` | Dikawal `#noTranslationMode` |
| 4.4 | Kad Learn Target Languages `#learnTargetsCard` (`display:none`) | Anak 4 | AKTIF — [`learnTargetLanguages`](src/utils/config.js:1314) | ⚠️ **ISU #2:** dipacu `#learnModeEnabled` yang letaknya **jauh di bawah** dalam Other Settings (config.js:8396–8408: "set Target Learn Languages in the 'Languages' section above") |
| 5 | **SEKSYEN SETTINGS** `#settingsSection` | Seksyen 3 | Induk keluaga tingkah laku | — |
| 5.1 | Kad Translation Settings `#translationSettingsCard` `data-card="translation"` | Anak 1 | `#databaseMode` (use/sync) — AKTIF | Dikawal `#noTranslationMode`; kumpulan varian NoTranslation terbenam di dalamnya (main.html:1847–1924) |
| 5.2 | Kad **"Other Settings"** `#otherSettingsCard` `data-card="cache"` | Anak 2 — **longgokan bercampur** | — | — |
| 5.2.1 | `#subToolboxEnabled` | Dalam Other Settings | **AKTIF** — [`subToolboxEnabled`](src/utils/config.js:1382); legacy mirror `fileTranslationEnabled`/`syncSubtitlesEnabled` (src/utils/config.js:543–547) | ⚠️ **ISU #1 (puncanya):** memacu `toggleOtherApiKeysSection()` → kad Other API Keys di ATAS; juga `#subToolboxEnabledNoTranslation` (varian) |
| 5.2.2 | `#learnModeEnabled` + `#learnOrderGroup` + `#learnItalicGroup` (+ placement) | Dalam Other Settings | **AKTIF** — [`learnMode`](src/utils/config.js:1313) | ⚠️ **ISU #2 (puncanya):** memunculkan `#learnTargetsCard` di seksyen LANGUAGES di atas |
| 5.2.3 | `#mobileMode` | Dalam Other Settings | AKTIF — [`mobileMode`](src/utils/config.js:1054) | Tiada (patut Keluarga Format/Player) |
| 5.2.4 | `#enableSeasonPacks` | Dalam Other Settings | AKTIF — [`enableSeasonPacks`](src/utils/config.js:1386) | Tiada (patut Keluarga Sources) |
| 5.2.5 | `#excludeHearingImpairedSubtitles` | Dalam Other Settings | AKTIF — [`excludeHearingImpairedSubtitles`](src/utils/config.js:1385) | Tiada (patut Keluarga Sources) |
| 5.2.6 | `#convertAssToVtt` (ASS/SSA Passthrough) | Dalam Other Settings | AKTIF — [`convertAssToVtt`](src/utils/config.js:551); interaksi `forceSRTOutput`→`urlExtensionTest='none'` (src/utils/config.js:552) | Tiada (patut Keluarga Format/Player) |
| 5.2.7 | `#forceSRTOutput` | Dalam Other Settings | AKTIF — [`forceSRTOutput`](src/utils/config.js:550) | Interaksi `convertAssToVtt` (src/utils/config.js:551) |
| 5.2.8 | `#betaMode` (Advanced Mode) | Dalam Other Settings | AKTIF — `betaModeEnabled` | ⚠️ **ISU #3:** memunculkan `#advancedSettingsCard` + `#geminiAdvancedCard` (config.js:9024–9027) & `#providerAdvancedCard` (via `toggleProviderAdvancedCard()`, config.js:9083) yang berada di **luar** Settings section |
| 5.2.9 | `#devMode` + `#parallelBatches*` + `#urlExtensionTestGroup` + `#androidSubtitleCompatModeGroup` | Dalam Other Settings | AKTIF — dev/pengguna lanjutan sahaja | Gate oleh `#devMode` |
| 5.3 | Kad Advanced Settings `#advancedSettingsCard` `data-card="advanced"` (`display:none`) | Anak 3 Settings | `#mismatchRetries` — AKTIF | Dikawal `#betaMode`; **menerima** `#geminiAdvancedCard` + `#providerAdvancedCard` via reparent JS (config.js:6364–6375) |
| 5.4 | Kad Gemini Advanced Parameters `#geminiAdvancedCard` (`display:none`) | **Luar section** (rakan sebayanya) | AKTIF — thinkingBudget/thinkingLevel/temperature/topP/frequencyPenalty/presencePenalty | Dikawal `#betaMode`; direparent ke dalam Advanced Settings |
| 5.5 | Kad Other Advanced Parameters (Provider) `#providerAdvancedCard` (`display:none`) | **Luar section** (rakan sebayanya) | AKTIF — 8× parameter set provider (openai/anthropic/xai/deepseek/deepl/mistral/cfworkers/openrouter/custom) | Dikawal `#betaMode`; direparent ke dalam Advanced Settings |
| 6 | Butang tindakan `#configForm` submit / `#installBtn` / `#copyBtn` + `#installUrlBox` + `#resetBarWrapper` | Bawah semua | AKTIF | — |
| 7 | Halaman Toolbox (page `data-page="toolbox"`) + pelancar terapung `#subToolboxLauncher` | App-page kedua | AKTIF — kelas `help-button toolbox-button`, `display:none` dikawal toolbox state | Dikawal `subToolboxEnabled` |

### A.2 Medan legacy / separuh aktif yang dikenal pasti

| Medan | Status |
|---|---|
| `fileTranslationEnabled` / `syncSubtitlesEnabled` | **LEGACY MIRROR** — dipaksa cermin `subToolboxEnabled` (src/utils/config.js:546–547); UI hanya `subToolboxEnabled` |
| `otherApiKeysEnabled` | **SEPARUH LEGACY** — sentiasa `true` selepas normalize (src/utils/config.js:976); kawalan sebenar ialah `subToolboxEnabled` |
| `geminiApiKey` + `geminiModel` luar Trinity | AKTIF — lapisan legasi yang dijambatan ke Trinity (deriveTranslationFromProviders, trinity-agents.js:1451) |
| `minP`, `repetitionPenalty`, `topK`, `topKEnabled` | **PADAM/ DILARANG** — telah dibersihkan sejak v1.6.0 (tidak akan diperkenalkan semula) |

---

## BAHAGIAN B — PENSTRUKTURAN SEMULA "KELUARGA FUNGSI" (CADANGAN A–Z)

Prinsip: **"Satu Keluarga, Satu Rumah"** + **Inline Progressive Disclosure** — suis dan kesannya mesti berada dalam kad/accordion yang SAMA atau bersebelahan langsung; tiada lagi suis di bawah memunculkan kad di atas.

### B.1 Jadual Perbandingan: Susunan Lama vs Susunan Baharu

| Susunan SEMASA (DOM atas→bawah) | Susunan BAHARU yang dicadangkan |
|---|---|
| Quick Setup banner | Quick Setup banner (kekal) |
| Just Fetch (No Translation) toggle | Just Fetch (No Translation) toggle (kekal) |
| **SEKSYEN 1: API KEYS** | **SEKSYEN 1: API KEYS** |
| 1. Token Vault | 1. Token Vault (kekal) |
| 2. Subtitles API Keys (OpenSubs/SubSource/SubDL/Timeout) | 2. Subtitles API Keys (kekal) |
| 3. **Other API Keys** (CF Workers + AssemblyAI; hidden, muncul bila Sub Toolbox ON) ⚠️ | 3. Translation API Keys — Trinity (Basic/Pro + Secondary Fallback) (kekal, kini anak ke-2) |
| 4. Translation API Keys — Trinity (dibina JS) | 4. **Gemini API** (single key + rotation + model + prompt style) — kekal sebagai kad legasi/lalai Gemini |
| **SEKSYEN 2: LANGUAGES** | **SEKSYEN 2: LANGUAGES (KELUARGA BAHASA — DIPERLUAS)** |
| 1. No-Translation Languages (hidden) | 1. No-Translation Languages (kekal, khas Just-Fetch) |
| 2. Source Languages | 2. Source Languages (kekal) |
| 3. Target Languages | 3. Target Languages (kekal) |
| 4. Learn Target Languages (hidden, muncul bila Learn Mode ON di bawah) ⚠️ | 4. **Learn Mode Card** — togol `#learnModeEnabled` + Order + Italic + Placement **dipindah masuk ke sini** (inline), diikuti grid Target Learn Languages dalam KAD YANG SAMA (accordion). Padam teks "…in the 'Languages' section above" |
| **SEKSYEN 3: SETTINGS** | **SEKSYEN 3: SOURCES & FILTERING (KELUARGA SARIKATA — BAHARU)** |
| 1. Translation Settings (databaseMode) | 1. Subtitle Source Behaviour — Season Packs `#enableSeasonPacks` + Hide SDH/HI `#excludeHearingImpairedSubtitles` + Provider Timeout (dipindah dari Other Settings) |
| 2. **Other Settings (longgokan)**: Sub Toolbox, Learn Mode, Mobile, Season Packs, Hide HI, ASS/SSA, Force SRT, Advanced Mode, Dev… | **SEKSYEN 4: TRANSLATION & BEHAVIOUR (KELUARGA ENJIN AI — BAHARU)** |
| 3. Advanced Settings (hidden; + 2 kad reparent JS) | 1. Translation Settings — databaseMode (dipindah) |
| 4. Gemini Advanced Parameters (hidden, luar section) | 2. **Advanced Mode toggle di sini** + sub-accordion Gemini Advanced Parameters + Other Provider Advanced Parameters (inline di bawah togol, bukan kad terpisah yang direparent JS) |
| 5. Provider Advanced Parameters (hidden, luar section) | **SEKSYEN 5: OUTPUT FORMAT & PLAYER (KELUARGA FORMAT — BAHARU)** |
| 6. Butang Save/Install/Copy + Reset | 1. Output Format — ASS/SSA Passthrough `#convertAssToVtt` + Force SRT `#forceSRTOutput` + Mobile Mode `#mobileMode` + Cache/Database note (dipindah) |
| | **SEKSYEN 6: SUB TOOLBOX & AUTO-SUBS (KELUARGA TOOLBOX — BAHARU)** |
| | 1. Enable Sub Toolbox `#subToolboxEnabled` **+ inline accordion: Cloudflare Workers AI key + AssemblyAI key + Auto-Subs settings** — kunci berada SECCARA FIZIKAL dalam kad yang sama; `#otherApiKeysCard` dibubarkan sebagai kad bebas |
| | 2. (Dev) — Dev Mode + parallel batches + URL extension + Android compat (kekal tersembunyi di bawah seksyen ini) |
| | Butang Save/Install/Copy + Reset (kekal paling bawah) |

### B.2 Nota reka bentuk per keluarga

1. **Keluarga Bahasa** — Learn Mode toggle dipindah dari Other Settings ke dalam/nex to `#learnTargetsCard`; callback config.js:8396–8408 dikekalkan logiknya tetapi kesan visual kini INLINE (accordion expand dalam kad sama). Teks arahan lintas-seksyen dibuang.
2. **Keluarga Sources** — `enableSeasonPacks`, `excludeHearingImpairedSubtitles`, `subtitleProviderTimeout` (dipindah dari Subtitles API Keys atau kekal di sana — cadangan: kekal di Subtitles API Keys kerana berkaitan fetch provider; pindah hanya Season Packs/HI ke seksyen Sources & Filtering). *Keputusan akhir Owner.*
3. **Keluarga Enjin AI** — Trinity kekal sebagai anak API Keys (kunci = API Keys family). Advanced Mode toggle dipindah dari Other Settings ke Seksyen 4 dan membuka parameter secara inline (accordion nested), menghapuskan reparent JS config.js:6364–6375.
4. **Keluarga Format Output** — `convertAssToVtt`, `forceSRTOutput` (interaksi dijaga: `forceSRTOutput=true` → `urlExtensionTest='none'`, src/utils/config.js:552), `mobileMode`.
5. **Keluarga Toolbox** — `subToolboxEnabled` menjadi induk accordion; `cloudflareWorkersApiKey` + `assemblyAiApiKey` + `autoSubs` block menjadi kandungan accordion. `toggleOtherApiKeysSection()` (config.js:11276) DIBUBARKAN — tiada lagi kad jauh dikawal suis bawah.

---

## BAHAGIAN C — ANALISIS IMPAK KONTRAK DATA & REHIDRASI (SIFAR KEROSAKAN)

### C.1 Strategi sifar-kerosakan

1. **Kontrak JSON tidak berubah.** Semua medan payload kekal nama & bentuk sama: `subToolboxEnabled`, `learnMode`, `learnTargetLanguages`, `enableSeasonPacks`, `excludeHearingImpairedSubtitles`, `convertAssToVtt`, `forceSRTOutput`, `mobileMode`, `betaModeEnabled`, `devMode`, `cloudflareWorkersApiKey`, `assemblyAiApiKey`, `otherApiKeysEnabled` (kekal dikirim walaupun UI tiada; server memaksa `true`, src/utils/config.js:976), `trinity.{...}`, `providers.<key>` (MERGE), `geminiApiKey/geminiModel/geminiKeyRotation*/geminiApiKeys`, `agentB`. Penyusunan semula ialah **DOM/visual sahaja** — serialization dibaca melalui `document.getElementById()`, yang **tidak peduli lokasi elemen dalam pokok DOM**.
2. **Pautan konfigurasi sedia ada** (`?config=` → sessionManager → [`normalizeConfig`](src/utils/config.js:543)) tidak berubah: normalizeConfig tidak membaca mana-mana ID DOM — ia murni JSON→JSON. 100% serasi ke belakang.
3. **Rehydration** — [`applyAgentValues`](public/js/trinity-agents.js:1694) / load path config.js membaca melalui ID; syarat tunggal: **ID elemen mesti kekal unik & tidak dinamakan semula semasa penghijrahan**. Peraturan penghijrahan:
    - Pindah nod `<div class="form-group">` SECARA KESELURUHAN (ID kekal).
    - Varian `*NoTranslation` (main.html:1847–1924) mesti kekal berpasangan dengan pasangan utamanya dalam setiap lokasi baharu (atau disatukan melalui helper `getField()` sedia ada yang sudah melakukan `XNoTranslation || X` fallback, contoh config.js:12786–12802).
    - `#trinityRoot` kekal dibina programatik oleh trinity-agents.js — hanya poin sisipan dalam section-grid mungkin berubah; satu elemen satu id (kekal).
4. **Callback yang mesti dijejaki semasa pemindahan (call-chain audit):**
    - `toggleOtherApiKeysSection()` (config.js:11276) — **dibubarkan**; ganti: papar kunci CF/AssemblyAI sebagai kandungan accordion toolbox.
    - Learn Mode handler (config.js:8396–8408) — kekal, kesan kini inline.
    - `betaMode` handler (config.js:9015–9027) — kekal; `#advancedSettingsCard`/`#geminiAdvancedCard`/`#providerAdvancedCard` menjadi sub-accordion; buang reparent JS (config.js:6364–6375).
    - `setSubToolboxEnabledUI()` (config.js:7061) — kekal (dua ID togol: utama + varian NoTranslation).
    - `collapseSectionCards()` (config.js:8282) mensasar `.card` — kad baharu yang menggunakan kelas `card` akan terjejas kollapse global dengan betul (diingini); elak ID duplikasi.
5. **Ujian regresi** — suite sedia ada (`npm test`, 385 ujian, baseline 384 PASS/0 FAIL/1 SKIP) tidak menguji DOM HTML statik secara lokasi; ujian trinity A1–A13 menguji sumber JS. Tambahan ujian kontrak disyorkan selepas pelaksanaan (lihat E).

### C.2 Pelarasan CSS `.trinity-fallback-section` (garisan putus-putus)

Status semasa: elemen sebenar ialah `.trinity-fallback` (bukan `-section`), dengan garisan putus-putus wujud pada [`.trinity-agent-hint { border-top: 1px dashed }`](public/css/trinity-agents.css:249). Nilai semasa (v3.9.44): `.trinity-fallback { margin-top:24px; margin-bottom:8px; padding:0 }`, `.trinity-fallback-head { padding:16px 20px }`, `.trinity-fallback-fields { padding:0 20px 16px }`.

**Pelan kerja CSS (masuk scope pelaksanaan ini):**
1. Selepas menyusun semula, konfigurasi Trinity berpindah konteks (anak ke-2 dalam API Keys, di atas Gemini) — jarak `.trinity-fallback` kepada elemen di atasnya berubah; sahkan `margin-top:24px` masih wajar, laras kepada `20px–24px` mengikut ruang visual sebenar (uji live Playwright).
2. Garisan putus-putus `.trinity-agent-hint` (config.js tooltip hint Basic/Pro) — pastikan `padding-top:0.6rem` + `margin-top:0.9rem` kekal dan tidak bertindih sempadan accordion baharu.
3. Kontrak ujian A13 (margin 24px/8px, padding 16px 20px) mesti dikemas kini SERENTAK dengan mana-mana perubahan nilai — jika tidak, regresi akan gagal dengan tepat (sengaja direka begitu).

---

## BAHAGIAN D — RISIKO & KERANGKA PELAKSANAAN

| Fasa | Skop | Risiko |
|---|---|---|
| F1 | Pindah Learn Mode + Learn card (Keluarga Bahasa) | Rendah — ID kekal, handler sedia |
| F2 | Bubar `#otherApiKeysCard`, jadikan kandungan accordion Toolbox | Sederhana — `toggleOtherApiKeysSection()` + `isSubToolboxEnabled()` call-sites mesti diaudit penuh |
| F3 | Pindah Season Packs / HI / Mobile / ASS / Force SRT ke keluarga masing-masing | Rendah |
| F4 | Advanced Mode → seksyen enjin AI + buang reparent JS (config.js:6364–6375) | Sederhana — pastikan kumpulan varian NoTranslation tidak tertinggal |
| F5 | CSS `.trinity-fallback` + kemas kini ujian A13 | Rendah |

Setiap fasa = satu release berasingan melalui pipeline 8-langkah (SemVer, CHANGELOG, cache-buster, prettier+eslint+`npm test` 0 FAIL monotonic, graphify update, ledger, commit+push, CI hijau).

## BAHAGIAN E — UJIAN TAMBAHAN YANG DISYORKAN POST-PELAKSANAAN

1. Roundtrip rehydrate → DOM → `collectConfigPatch()` untuk setiap keluarga baharu (padanan A1–A13 sedia ada).
2. Kontrak: pautan `?config=` lama (SubFaber era) masih menghasilkan UI yang betul — tiada elemen hilang.
3. Playwright live: togol Sub Toolbox → kunci CF/AssemblyAI muncul INLINE dalam kad sama; togol Learn Mode → grid Learn muncul dalam kad sama; Advanced Mode → parameter muncul inline.

---

> **MENUNGGU KELULUSAN OWNER** sebelum mana-mana fasa F1–F5 dilaksanakan. Tiada kod diubah dalam fasa audit ini.

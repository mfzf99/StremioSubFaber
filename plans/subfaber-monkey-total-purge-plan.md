# PELAN PEMBEDAHAN TOTAL: PURGE MONKEY + TEMplat TERJEMAHAN BAHARU (v3.36.0)

**Status:** FASA PERANCANGAN SAHAJA — read-only. Tiada kod sumber diubah sehingga Owner meluluskan.
**Induk:** HEAD `da3445c7` (v3.35.0, CI-green).
**Keputusan Owner yang mengikat pelan ini:** (1) gugurkan/tamatkan SEMUA kaitan MONKEY; (2) padam terus kod MECHANICAL_TRANSLATION_RETRY; (3) prompt Translation baharu (teks verbatim Owner) = BATU ASAS; (4) Preflight & Inspector dibina semula atas asas translation, apa yang tak berkaitan dibuang; (5) language pack = fewShot sahaja; (6) Preflight/Inspector TIDAK guna language pack; (7) neutral-global 433 bahasa; (8) idManifest dikekalkan.

---

## 0. DIAGNOSIS RUN PASCA-v3.35.0 (kenapa masih gagal)

Run deepseek-v4.1-flash (696 entri): `MECHANICAL_TRANSLATION_RETRY` masih menyala @ batch 3 & 4 → punca **bukan** hanya false-positive; validator MONKEY memang menemui kecacatan keras sebenar (SCRIPT_LEAK / label CJK) pada output model flash — dan mekanisme retry MONKEY (full-batch retry dengan diagnostic block panjang) tidak mampu membaikinya, cuma membakar token. Kualiti terjemahan merosot kerana: prompt system semakin berat (5 peraturan panjang + prinsip + arahan bloom), few-shot lama bawa arahan bertentangan ("Localize [sound effects]" vs "keep ♪/labels exact counts"), dan model flash tersesat antara arahan. Keputusan Owner: buang lapisan MONKEY sepenuhnya + ganti templat ringkas (rujukan: prompt asal SubMaker XML — ringkas, ayat pendek, hasil padu).

---

## 1. FAIL & SKOP PEMBEDAHAN

| # | Fail | Tindakan |
|---|---|---|
| 1 | `src/services/prompts/trinity/translation/core.js` | GANTI `TRANSLATION_SYSTEM_TEMPLATE` dengan teks verbatim Owner (baharu, ringkas). |
| 2 | `src/services/prompts/languagePacks/malay.js` | PADAM `honorificMatrix`, `canonicalAddressMatrix`, `creditsExample`, `specificRules`, `notLockedGuidance`. KEKAL `code`, `aliases`, `fewShot` (3 contoh baharu verbatim Owner). |
| 3 | `src/services/prompts/languagePacks/generic.js` | Sama: kekal `code`, `aliases`, `fewShot` sahaja. fewShot generic kekal meta-placeholder (433-bahasa netral; tiada BM). |
| 4 | `src/services/prompts/languagePacks/index.js` | Antara muka pack = `{ code, aliases, fewShot }`. `getLanguagePack()` kekal (Translation satu-satunya pengguna). |
| 5 | `src/services/translationEngine.js` | (a) DELETE gate mekanikal + retry MONKEY (blok ~2500–2600, `_mechanicalRetries`, `mechanicalRetries` stat, import validator/diagnostics); (b) `buildUserPrompt` default fallback ke `specificRules` — tukar fallback composer ke templat ringkas neutral; (c) keep: idManifest, D1-close tidak diperlukan lagi (tiada insiden mekanikal), C1 cache-skip pada hard findings — review: dengan validator dipadam, `mechanicalFindings` sentiasa `[]` → C1 guard jadi no-op; PADAM bersih; (d) laluan retry semantik Inspector kekal TAPI diagnostic block mekanikal disingkirkan (`selectRetryFindings` dipanggil dengan mekanikal kosong — disemak di bawah). |
| 6 | `src/services/utils/mechanicalValidator.js` | PADAM FAIL. |
| 7 | `src/services/utils/retryDiagnostics.js` | SIMPAN untuk laluan Inspector semantik sahaja (retry semantik 7-jenayah bukan MONKEY — ia struktur DUAL-AI 2026-09-26), tapi: `buildRetryDiagnosticBlock` kekal (semantic: true), `CORRECTION_BY_TYPE` kekal 7 jenayah; PADAM entri mekanikal (SCRIPT_LEAK, SPEAKER_LABEL_LOSS, MUSIC_SYMBOL_LOSS, VERBATIM_UNTRANSLATED, PUNCTUATION_MISMATCH) + `selectRetryFindings()` dikurangkan kepada semantic-sahaja (parameter mekanikal dibuang). |
| 8 | `src/services/agentInspector.js` + `prompts/trinity/inspector/core.js` | Inspector instruction line-18 ("Deterministic JavaScript checks already cover...") DIPADAM (tiada lagi JS checks). Skop Inspector kekal 7-jenayah semantik — `verdict.crimes` retry path kekal. |
| 9 | `src/services/subfaberPreflight.js` + `prompts/trinity/preflight/core.js` | Buang suntikan `${honorificMatrix}`/`${canonicalAddressMatrix}`/`${creditsExample}` dari templat + builder; tiang characters kekal `canonical_address`/`direct_address`/`role` (skema JSON sama — hanya teks panduan arahan dipendekkan selari dengan disiplin terjemahan ringkas; skema & 4 tiang kekal). Preflight TIDAK menyentuh language pack langsung. |
| 10 | `src/utils/cacheKeys.js` + `src/handlers/subtitles.js` | Namespace cache maju `v5` → `v6` (prompt baharu — output lama tidak boleh diservis). |
| 11 | `src/utils/parallelTranslation.js` | `mechanicalRetries` dibuang dari skema stats worker + merge (B1 tetap diuji). |
| 12 | Ujian (senarai penuh §4) | Re-pin / padam / tulis baharu. |

## 2. TEMplat BAHARU (VERBATIM OWNER)

`TRANSLATION_SYSTEM_TEMPLATE` = teks penuh yang Owner berikan (SYSTEM/ROLE, 4 peraturan, STYLE & TONE 5 baris, FEW-SHOT `${fewShot}`, OUTPUT REQUIREMENT). fewShot Malay = 3 contoh Owner (Biar betul / Relaks lah, budak / memang habislah kita semua). fewShot generic = struktur meta `{translation of "..."}` sedia ada (netral). idManifest (`Required output ids in exact order...`) KEKAL dijana oleh enjin sebelum `<input>`.

**Interpolasi yang kekal:** `${sourceLabel}`, `${targetLabel}`, `${targetLabelShort}`, `${fewShot}` — enjin `createXmlBatchPrompt()` tidak berubah bentuknya; hanya sumber templat bertukar.

## 3. APA YANG TIDAK BERUBAH (kontrak kekal)

- Kontrak output `<answer>` + `<s id="N">` + anchor prefill Gemini + Smart Preamble Scrubber + `parseXmlBatchResponse` — INTACT.
- idManifest (D5) — INTACT.
- Struktur boundary `SUBFABER_PROMPT_BOUNDARY` + split system/user semua 3 pintu — INTACT.
- Sliding context `<previous_translated>`/`<future_source>` + `<preflight_knp>` verbatim JSON (Pro) — INTACT (user lane, data sahaja).
- MISMATCH_RETRY Pass 1/2/3 + shift detector (struktur kuantiti) — INTACT (ini bukan MONKEY).
- Agent Inspector semantic gate + retry + circuit breaker + fail-open — INTACT (DUAL-AI 2026-09-26), diagnostic block semantic kekal.
- Sistem insiden lain (429/MAX_TOKENS/PROHIBITED/MISMATCH) + FinOps + Telegram — INTACT.
- v5 cache key discriminators mode/channel — maju ke v6 sekali (bukan menukar bentuk).

## 4. UJIAN — PETA RE-PIN

| Suite | Tindakan |
|---|---|
| `translation-monkey-harmony-regression.test.js` (8) | PADAM (subjek ujian dimusnahkan — diganti suite baharu v3.36 di bawah). |
| `translation-quality-regression.test.js` (13) | 6 ujian validator/retry mekanikal dipadam; 7 kekal (diagnostics semantik, anchor, verified-slot merge semantic, basic/pro flow tanpa gate mekanikal). |
| `translation-quality-fixes-regression.test.js` (4) | D1 kedua varian di-re-pin: tiada insiden mekanikal lagi → ujian menuntut TIADA `MECHANICAL_TRANSLATION_RETRY` direkodkan; R#1 kekal (semantic path sahaja). |
| `translation-cache-poisoning-isolated.test.js` | RE-PIN: sumber kecacatan bertukar dari SCRIPT_LEAK kepada jenayah semantik Inspector (cache-skip kekal melalui `verdict.crimes`? — TIDAK: C1-skip adalah guard mekanikal; selepas purge, cache-skip mekanikal dipadam. Ujian di-re-pin untuk laluan baru: entri gagal retry SEMANTIK tidak ditulis ke cache? — laluan semantic tidak ada guard cache-skip; jadi ujian C1 dipadamkan/dokumenkan sebagai tingkah laku diterima Owner (bypass cache + permanent private menyimpan hasil terbaik). → Keputusan dalam pelan: PADAM dengan justifikasi ledger; coverage tidak dilemahkan kerana subjek guard sudah tiada. |
| `parallel-worker-stats-regression.test.js` | Re-pin: `mechanicalRetries` keluar skema; `incidents`/`crimes` kekal diuji. |
| `tri-door-wire-parity-regression.test.js` | Anchor-injection kekal (semantic block sahaja); ujian suntikan mekanikal dipadam. |
| `universal-language-pack-regression.test.js` | Re-pin: antara muka `{code, aliases, fewShot}`; sifar kebocoran BM ke generic; fewShot BM verbatim baharu hadir. |
| `trinity-prompt-setup-regression.test.js` + `trinity-prompt-matrix-regression.test.js` | Re-pin: templat baharu (4 peraturan, tiada `mentally translate the complete sentence first`, tiada placeholder honorific), preflight tanpa `${honorificMatrix}` dsb. |
| `subfaber-beta-run7-regression.test.js` / `subfaber-context-regression.test.js` | Re-pin rentetan kontrak yang berubah (prompt shape, NOT-LOCKED → tiada pack guidance: preflight context formatter `formatPreflightForPrompt` tidak lagi baca pack — guna teks statik netral "not locked — decide from context"). |
| Suite baharu `subfaber-monkey-total-purge-regression.test.js` | (a) `require('./utils/mechanicalValidator')` THROW (fail dibuang); (b) engine `translateBatch` dengan provider bocor-CJK → TIADA panggilan retry kedua (calls===1), TIADA insiden mekanikal; (c) templat verbatim Owner dipin (rentetan kunci + ketiadaan rentetan lama); (d) fewShot baharu BM hadir dalam prompt kedua-dua mod; (e) cache key mengandungi `-v6`; (f) Inspector retry path berfungsi tanpa `selectRetryFindings` mekanikal. |

**Kaunter kesan anggaran:** 722 → ~700±10 (dipadam ~20 ujian mekanikal, ditambah ~10 baharu). Monotonic bukan sasaran; coverage kekal/setambah pada kontrak yang hidup.

## 5. RED-FIRST

Suite baharu `subfaber-monkey-total-purge-regression.test.js` ditulis DULU; 6/6 RED diperhatikan sebelum sebarang suntingan produksi (probe run disimpan `.tmp/red-total-purge.log`). Kemudian pembedahan.

## 6. FASA PELAKSANAAN (sekali komit Class 1)

1. **Fasa A — Templat & Pack:** core.js translation (verbatim Owner) + malay.js/generic.js/index.js gutted + fallback composer gemini.js.
2. **Fasa B — Purge Enjin:** translationEngine.js (gate mekanikal, import, stat, C1 guard, fallback specificRules), parallelTranslation.js, cacheKeys v6, subtitles.js wiring v6.
3. **Fasa C — Inspector & Preflight:** inspector/core.js line-18 buang; retryDiagnostics semantic-sahaja; preflight core + builder tanpa pack; formatter NOT-LOCKED netral.
4. **Fasa D — Ujian:** padam/re-pin mengikut §4; suite baharu; full `npm test` 0 FAIL.
5. **Fasa E — Rilis:** 3.36.0, CHANGELOG (English), ledger, prettier scoped, relay-state, satu komit `feat(translation): adopt short universal template and purge MONKEY mechanical layer`, push, CI green, laporan.

## 7. RISIKO & NOTA

- **Inspector Basic-mode:** Basic kekal tanpa Inspector (insiden "not recovered" mekanikal hilang sepenuhnya — tiada gate yang boleh menyala).
- **Kualiti flash:** templat ringkas + fewShot Owner dijangka pulih kualiti; jika masih lemah selepas 1 run ujian Owner, itu pilihan model (bukan prompt) — dilaporkan jujur.
- **Cache v6:** semua pengguna lama akan menterjemah semula sekali (bypass cache pengguna persendirian juga).
- **Kad UI model-parameter:** tidak disentuh (Zone A N/A).

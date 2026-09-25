# 📐 LAPORAN PERANCANGAN TEKNIKAL SUBFABER — BAHAGIAN BACKEND (GLM 5.3)

**Status:** PLANNING MODE — MENUNGGU KELULUSAN. ZERO KOD DIMODIFIKASI.
**Tarikh:** 2026-09-25
**Rujukan Mandat:** Dokumen Pelan Seni Bina & Mandat Operasi SubFaber (Fasa 0–3)
**Formula:** VideoLingo (Otak/Persona/Konteks) + SRT AI Translator (Kontrak XML/Pariti 1:1)

---

## 1. RINGKASAN EKSEKUTIF

Pipeline semasa (StremioSubMaker) sudah mempunyai ~70% infrastruktur yang diperlukan
oleh SubFaber. Jurang (gap) utama yang perlu dibina:

| # | Keperluan SubFaber | Status Semasa | Jurang |
|---|---|---|---|
| 1 | Fasa 0: Pre-Flight Semantic Pass (summary + glosari) | ❌ TIADA | Perlu modul baharu + 1 panggilan AI |
| 2 | `<previous_content>` (dialog lalu) | ⚠️ Separuh sedia | Ada `<m>` memory tags (backward-only, opt-in) |
| 3 | `<subsequent_content>` (dialog hadapan) | ❌ TIADA | Perlu slicing forward dalam context builder |
| 4 | Persona "Netflix Translator" + `<translation_principles>` | ⚠️ Lain bentuk | Ada 7-rule NEVER/INSTEAD rulebook, tiada persona |
| 5 | Kontrak XML `<answer><text id="N">` | ⚠️ Lain bentuk | Guna `<s id="N">` + pre-filled anchor + `<input>` |
| 6 | Parser regex + chunk-count check | ✅ SEDIA | `parseXmlBatchResponse` + `alignTranslatedEntries` |
| 7 | Timeline physically untouched | ✅ SEDIA | `sendTimestampsToAI = false`, timecode asal dipreserve |

**Keputusan seni bina utama:** Bina SubFaber sebagai **workflow ke-2** dalam
TranslationEngine sedia ada (bukan fork), dikawal oleh flag `subfaberWorkflow`.
Ini memelihara semua infrastruktur kritikal yang tidak boleh dibina semula:
key rotation, FinOps ledger, PROHIBITED_CONTENT recovery, mismatch retry 3-pass,
streaming, fallback provider, dan 92+ regression tests.

---

## 2. PETA KOD SEMASA (HASIL ANALISIS MENDALAM)

### 2.1 Aliran Terjemahan Semasa

```
index.js (4 call sites: L4238, L5841, L6575, L7697)
  └─ new TranslationEngine(providerBundle, model, advancedSettings, options)
      └─ engine.translateSubtitle(srtContent, targetLanguage, customPrompt, onProgress, sourceLanguage)
          ├─ parseSRT(srtContent)                    [src/utils/subtitle.js:247]
          ├─ createBatches(entries, 200)             [UNIVERSAL_BATCH_SIZE = 200]
          ├─ per batch:
          │   ├─ maybeRotateKeyForBatch()           [key rotation per-batch]
          │   ├─ prepareContextForBatch()           [context backward sahaja]
          │   ├─ prepareBatchXml()                  [<m> memory + <s id> entries]
          │   ├─ createXmlBatchPrompt()              [7-rule rulebook + <input> + anchor]
          │   ├─ _translateCall() → gemini.translateSubtitle / streamTranslateSubtitle
          │   │       └─ buildUserPrompt()           [flat user prompt, systemInstruction top-level]
          │   ├─ parseXmlBatchResponse()             [superXmlPattern regex + scrubber]
          │   ├─ alignTranslatedEntries()           [pariti + [⚠️] placeholder]
          │   └─ mismatch retry 3-pass              [targeted → shift-detect → full]
          └─ toSRT(translatedEntries)                [timecode asal dipreserve]
```

### 2.2 Fail-Fail Kritikal & Peranan

| Fail | Peranan | Kaitan SubFaber |
|---|---|---|
| [`translationEngine.js`](../src/services/translationEngine.js) | Otak: batching, prompt composer, parser, retry | Tapak pembedahan utama |
| [`gemini.js`](../src/services/gemini.js) | REST v1beta, systemInstruction top-level, prefill anchor | Fasa 0 guna `translateSubtitle()` sedia ada |
| [`subtitle.js`](../src/utils/subtitle.js) | `parseSRT`/`toSRT`, mojibake fix, smart padding | Fasa 0 ekstrak teks mentah |
| [`parallelTranslation.js`](../src/utils/parallelTranslation.js) | Mod selari (Dev Mode) | Perlu sedar Fasa 0 |
| [`config.js`](../src/utils/config.js) | Normalisasi advancedSettings (L548-558) | Daftar flag baharu |
| [`translationProviderFactory.js`](../src/services/translationProviderFactory.js) | FallbackTranslationProvider wrapper | Tidak berubah |
| [`index.js`](../index.js) | 4 call sites TranslationEngine | Suntik Fasa 0 sebelum loop |

### 2.3 Penemuan Penting dari Analisis

1. **`prepareContextForBatch()` (L1095-1145)** hanya bina `previousMemory` —
   tiada `subsequent_content`. Ia juga `return null` untuk `batchIndex === 0`,
   bermakna batch pertama tiada konteks langsung. SubFaber perlu konteks
   **forward-looking** untuk batch 1..N (dari original entries, bukan terjemahan).

2. **`prepareBatchXml()` (L2025-2060)** menyuntik memory sebagai
   `[PREVIOUS_TRANSLATION_MEMORY...]` + `<m id><src><dst>` — konsep sama dengan
   `<previous_content>` VideoLingo tetapi bentuk berbeza. SubFaber perlu
   `<previous_content>` (source-only) dan `<subsequent_content>` (source-only)
   sebagai **read-only context**, bukan memory terjemahan.

3. **`createXmlBatchPrompt()` (L2066-2147)** — rulebook 7-rule NEVER/INSTEAD
   sedia ada adalah *lebih ketat* daripada kontrak SRT AI Translator
   (`<answer><text id>`). Keputusan: **kekalkan rulebook 7-rule** sebagai
   enforcer, tambah persona VideoLingo + konteks berlapis di atasnya.
   Jangan buang 7-rule — ia adalah hasil postmortem off-by-one
   (plans/id-pariti-v2-postmortem-off-by-one.md).

4. **`parseXmlBatchResponse()` (L2155-2269)** — Smart Preamble Scrubber +
   superXmlPattern + global-ID map + dedup + hallucination filter. Ini sudah
   melampaui parser SRT AI Translator. Kekalkan, tukar sahaja tag pattern
   kepada `<text id="N">` + `<answer>` wrapper untuk workflow SubFaber.

5. **`gemini.js buildUserPrompt()` (L1024-1038)** — prompt engine dihantar
   sebagai flat user prompt (v1.6.0 ID-Parity Surgery V2: system instruction
   RETIRED untuk batch XML). SubFaber prompt juga akan travel sebagai user
   content — konsisten dengan ground truth Subtitle Edit/GPTSubtitler yang
   dipetik dalam komen L427-435.

6. **`config.js` (L548-558)** — `mismatchRetries` dinormalisasi di sini;
   flag SubFaber baharu (`subfaberEnabled`, `preflightSummary`, dll.) perlu
   didaftarkan dalam blok normalisasi yang sama supaya tersimpan dalam
   session config Redis.

7. **PANTANG LARANG dihormati:** `systemInstruction` kekal top-level field
   dalam REST v1beta body (L1146-1152, L1336-1344) — Fasa 0 prompt ringkas
   boleh guna `systemInstruction` ATAU flat user prompt; keputusan: flat
   user prompt untuk konsistensi dengan surgery v1.6.0.

---

## 3. PELAN PEMBEDAHAN FAIL (SURGICAL PLAN)

### 3.1 Fail Baharu: `src/services/subfaberPreflight.js` (FASA 0)

Modul Pre-Flight Semantic Pass. Satu panggilan AI ringkas per fail.

```
async function runPreflightSemanticPass(entries, targetLanguage, sourceLanguage, geminiService, options)
  → { summary, thingsToNote, terms[] }
```

**Reka bentuk:**
- Input: teks mentah keseluruhan fail (entries.map(e => e.text).join('\n')),
  TANPA timecode (prinsip "timeline physically cannot be touched").
- Prompt ringkas (adaptasi `get_summary_prompt` VideoLingo):
  - Role: "video translation expert and terminology consultant"
  - Task: (1) summarize main topic 2 ayat, (2) extract terms < 15,
  (3) brief explanation per term.
  - Output: JSON `{ theme, terms: [{ src, tgt, note }] }` — guna
    `enableJsonOutput` sedia ada (`generationConfig.responseMimeType`) untuk
    output deterministik.
- Token guard: jika fail > N entries (cadangan: 3000), sample merata
  (setiap k-th entry) supaya panggilan Fasa 0 kekal murah.
- Error handling: Fasa 0 adalah **best-effort, non-blocking**. Jika gagal
  (429, timeout, JSON rosak), log warn + return null → pipeline terus
  jalan tanpa konteks global (graceful degradation). JANGAN gagalkan
  terjemahan kerana pre-flight gagal.
- Output disimpan dalam `this.preflightContext` pada engine instance
  (in-memory state, selari dengan `state.context` dalam mandat).

### 3.2 Modifikasi: `src/services/translationEngine.js`

**Pembedahan A — Constructor (L138-263):**
- Tambah flag: `this.subfaberEnabled = advancedSettings.subfaberEnabled === true`
- Tambah: `this.preflightContext = null` (slot state Fasa 0)
- Tambah: `this.subfaberContextWindow = parseInt(advancedSettings.contextSize) || 20`
  (guna semula `contextSize` sedia ada — jangan cipta config baru)

**Pembedahan B — `translateSubtitle()` (L688-908):**
- Selepas `parseSRT()` dan sebelum loop batch: jika `subfaberEnabled`,
  panggil `runPreflightSemanticPass()` (await, sekali sahaja).
- Emit progress event baharu: `onProgress({ phase: 'preflight', ... })`
  supaya KIMI K3 boleh bina Pre-Flight HUD.

**Pembedahan C — `prepareContextForBatch()` (L1095-1145):**
- Bina semula untuk return struktur SubFaber:
  ```
  {
    previousContent: entries.slice(max(0, start - W), start),   // source-only
    subsequentContent: entries.slice(end + 1, end + 1 + W),     // source-only
    preflight: this.preflightContext                            // summary + terms
  }
  ```
- Kekalkan `previousMemory` (terjemahan lalu) sebagai lapisan tambahan
  untuk continuity — ini kelebihan kita atas VideoLingo (VideoLingo hanya
  hantar source; kita boleh hantar terjemahan disahkan).
- Batch 1 kini DAPAT konteks (subsequent + preflight) walaupun tiada previous.

**Pembedahan D — `prepareBatchXml()` (L2025-2060):**
- Bila `subfaberEnabled`: bina blok konteks mengikut kontrak verbatim mandat:
  ```
  ### Context Information
  <previous_content>
  {previousContent source text}
  </previous_content>

  <subsequent_content>
  {subsequentContent source text}
  </subsequent_content>

  ### Content Summary
  {preflight.summary}

  ### Points to Note
  {preflight.thingsToNote / terms formatted}
  ```
- Entri aktif kekal dalam `<s id="N">` (KEPUTUSAN SENI BINA: lihat §3.4).

**Pembedahan E — `createXmlBatchPrompt()` (L2066-2147):**
- Bila `subfaberEnabled`: prepend persona VideoLingo verbatim:
  ```
  ## Role
  You are a professional Netflix subtitle translator, fluent in both
  ${src_language} and ${TARGET_LANGUAGE}, as well as their respective cultures.
  ...
  ```
- Suntik `<translation_principles>` verbatim dari mandat SEBELUM 7-rule
  rulebook (persona → task → context → principles → rules → input → anchor).
- Susunan akhir prompt SubFaber:
  1. `## Role` (persona VideoLingo)
  2. `## Task` (3 arahan VideoLingo)
  3. `### Context Information` (`<previous_content>` + `<subsequent_content>`)
  4. `### Content Summary` + `### Points to Note` (Fasa 0)
  5. `<translation_principles>` (verbatim mandat)
  6. 7-rule ZERO TOLERANCE rulebook (kekal — enforcer pariti)
  7. `<input>` + `<s id>` entries + `[OUTPUT_FORMAT]` anchor

**Pembedahan F — `parseXmlBatchResponse()` (L2155-2269):**
- Tiada perubahan struktur — tag `<s id>` dikekalkan (lihat §3.4).
- Tambah stat: `this.translationStats.subfaberContextUsed = true` bila aktif.

### 3.3 Modifikasi: `src/utils/config.js`

- Daftar dalam blok normalisasi advancedSettings (L548-558):
  - `subfaberEnabled: advSettings.subfaberEnabled === true`
- Env fallback (L1040-1057): `SUBFABER_ENABLED === 'true'`
- JANGAN sentuh `thinkingBudget`/`topK` (PRESERVATION RULE) — pembedahan ini
  hanya tambah field baharu.

### 3.4 KEPUTUSAN SENI BINA KRITIKAL: Tag Contract

Mandat menspesifikasikan `<answer><text id="N">` (SRT AI Translator style).
Analisis mendalam menunjukkan menukar tag `<s id>` → `<text id>` memerlukan:

1. Pre-filled anchor `<s id="` (L2144, L1120-1123 gemini.js) — 3 lokasi
2. SuperXmlPattern regex (L2228) + streaming pattern (L2411) + self-closing (L2444)
3. Smart Preamble Scrubber logic (L2175-2194)
4. Prefill support detection (gemini.js L1116-1134)
5. Semua retry paths yang rebuild prompt

**Risiko:** Setiap perubahan tag menyentuh postmortem off-by-one fixes.
**Cadangan dua pilihan untuk kelulusan Lead:**

- **PILIHAN A (Disyorkan):** Kekalkan `<s id="N">` sebagai tag kontrak.
  Ia sudah terbukti dalam production + 92 tests. `<answer>` wrapper dan
  `<text id>` adalah kosmetik — pariti sebenar di-enforce oleh ID map +
  chunk-count check + 7-rule. Persona/konteks/principles SubFaber masuk
  tanpa menyentuh lapisan tag. Risiko: MINIMAL. Effort: ~2 hari.
- **PILIHAN B (Verbatim mandat):** Migrasi penuh ke `<answer><text id="N">`.
  Perlu pembedahan 5 lokasi di atas + update semua regression tests yang
  assert tag `<s`. Risiko: SEDANG-TINGGI (regression off-by-one berulang).
  Effort: ~4-5 hari termasuk test overhaul.

### 3.5 Modifikasi: `index.js` (4 call sites)

- Tiada perubahan call signature. Fasa 0 dipanggil DALAM
  `engine.translateSubtitle()` (Pembedahan B) supaya keempat-empat call
  sites (File Upload API, Toolbox, Sync, Auto-Translate) dapat manfaat
  automatik tanpa duplikasi.

### 3.6 Modifikasi: `src/utils/parallelTranslation.js`

- `executeParallelTranslation()` perlu terima & pass-through
  `engine.preflightContext` (sudah implicit melalui engine reference —
  cuma perlu pastikan context builder dipanggil dengan preflight state).
- Batch selari: setiap task bina konteks forward dari original entries
  (selamat — read-only), tapi `previousMemory` hanya tepat untuk batch
  yang menunggu batch sebelumnya. Nota: dalam mod selari, previousMemory
  mungkin belum sedia — guna source-only previousContent sebagai ganti.

---

## 4. PENGENDALIAN RALAT & VALIDASI XML

### 4.1 Fasa 0 (Pre-Flight)
| Ralat | Tindakan |
|---|---|
| 429/503/timeout | Retry 1x via `retryWithBackoff` sedia ada, lepas tu null (non-blocking) |
| JSON parse gagal | `json_repair`-style fallback: regex extract `{...}` block; kalau gagal → null |
| Fail terlalu besar | Sampling merata (setiap k-th entry), max ~12k token input |
| Konten kosong/pendek (< 10 entries) | Skip Fasa 0, log info |

### 4.2 Fasa 1-3 (Batch Translation)
Semua infrastruktur sedia ada dikekalkan:
- **Chunk-count check:** `alignTranslatedEntries()` + shift detector +
  3-pass mismatch retry (targeted → full → give-up dengan [⚠️])
- **XML escape:** `escapeXml()` (& < >) + unescape berurutan betul
  (< → > → & LAST) — kekal
- **Hallucinated ID filter:** `validIds` map — kekal
- **Preamble scrubber:** Case A/B/C classification — kekal
- **BARU:** validator tambahan — jika `subfaberEnabled` dan model
  menggabungkan entri merentasi `<previous_content>`/`<subsequent_content>`
  (tanda: output ID tidak dalam validIds), scrubber sedia ada sudah
  menangkis (hallucination filter). Tiada kerja tambahan — cuma uji.

### 4.3 Regression Test Plan (untuk fasa implementasi)
- `subfaber-preflight-regression.test.js`: Fasa 0 mock — summary/terms
  extraction, sampling, graceful null, non-blocking assertion
- `subfaber-context-buffer-regression.test.js`: previous/subsequent slicing
  boundary (batch 1, batch tengah, batch akhir), window size, ID gaps
- `subfaber-prompt-parity-regression.test.js`: prompt composer mengandungi
  persona verbatim + `<translation_principles>` + konteks berlapis + anchor
- Baseline: `npm test` mesti kekal ≥ 92 PASS, 0 FAIL (TEST BASELINE rule)

---

## 5. RISIKO & MITIGASI

| Risiko | Tahap | Mitigasi |
|---|---|---|
| Prompt lebih panjang (persona+konteks) → token naik | Rendah | Konteks window W=20 × 2 sisi ≈ 1.6k token; batch 200 entri ≈ 8k token; masih jauh bawah MAX_TOKENS_PER_BATCH=25000 |
| Model menterjemah `<previous_content>` | Sederhana | 7-rule Rule 4 (air-gapped memory) dikekalkan + tambah arahan eksplisit "DO NOT TRANSLATE context blocks" + hallucination filter sedia ada |
| Fasa 0 menambah latency +1 panggilan | Rendah | Non-blocking, 1 panggilan sahaja, boleh dimatikan via flag |
| Off-by-one regression berulang | Tinggi (Pilihan B) / Rendah (Pilihan A) | Pilihan A disyorkan; jika B, wajib jalankan verify-prompt-parity.js + full suite |
| Konteks SubFaber vs `<m>` memory konflik | Sederhana | Bila subfaberEnabled, `<m>` memory diganti dengan previousContent source-only supaya satu bentuk sahaja |

---

## 6. URUTAN PELAKSANAAN (SELEPAS KELULUSAN)

1. `subfaberPreflight.js` + unit tests (Fasa 0) — hari 1
2. Pembedahan C+D (context builder + batch XML) — hari 1-2
3. Pembedahan E (prompt composer persona + principles) — hari 2
4. Pembedahan A+B (constructor + translateSubtitle hook) — hari 2
5. config.js flag registration — hari 2
6. parallelTranslation.js awareness — hari 3
7. Full regression: `npm test` ≥ 92 PASS — hari 3
8. (Pilihan B sahaja, jika diluluskan): tag migration + test overhaul — hari 4-5

---

## 7. NOTA UNTUK KIMI K3 (FRONTEND LEAD)

Backend akan expose melalui `onProgress` callback:
- `{ phase: 'preflight', status: 'running'|'done'|'skipped', summary, terms }`
  — untuk Pre-Flight HUD
- `{ phase: 'batch', currentBatch, totalBatches, verifiedCount, expectedCount }`
  — untuk status pemprosesan kelompok ("Batch 1: 50/50 Subtitles Verified")
- `translationStats.subfaberContextUsed` — untuk dwi-panel semakan badge

Config UI perlu field baharu: `advancedSettings.subfaberEnabled` (toggle) —
struktur sama seperti `enableBatchContext` sedia ada.

---

**LAPORAN SELESAI — MENUNGGU KELULUSAN PENUH SEBELUM KERJA PENGKODAN DIMULAKAN.**

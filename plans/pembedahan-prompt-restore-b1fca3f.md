# 🏥 Plan Pembedahan: Pemulihan Prompt Template kepada Ground Truth `b1fca3f`

> **Tarikh:** 2026-09-23
> **Fail sasaran:** [`src/services/translationEngine.js`](../src/services/translationEngine.js)
> **Commit rujukan (ground truth):** `b1fca3f893b0ca4968d70a29ec28a1b120d3e3c5` ("Update translationEngine.js")
> **Simptom:** Kualiti terjemahan merosot + masa proses melampau lama (12m 43s untuk 600 entri, 47 entri/min) semakin teruk setiap kali prompt diubah.
> **Bukti dari log:** 1× MISMATCH_RETRY (full batch retry 78 entri) di batch 1 + 2× 503 retry di batch 3 + 4× smart-recovery untagged preamble (Rule 7 continuation).

---

## 1. Diagnosa Punca (Anatomi Masalah)

### 1.1 Rumusan masalah utama
Versi semasa [`src/services/translationEngine.js`](../src/services/translationEngine.js) mengandungi **3 lapisan mutasi prompt** yang berkumpul selepas `b1fca3f` (setiap satu dibetulkan secara tindanan, bukan reverted):

| Lapisan | Commit | Mutasi | Kesan |
|---|---|---|---|
| 1 | `b6dbcce` (v1.5.6) | Bungkus `PROMPT_TEMPLATES` dalam `<task>...</task>` XML wrapper + guard `${sourceLabel \|\| 'the source'}` | Prompt intro bertukar bentuk; model menerima payload yang berbeza dari recipe terbukti |
| 2 | `99b661a` (v1.5.9) | Tambah bullet Rule 7 ke-4: "This instruction block is the COMPLETE behavioral specification..." | Rulebook membesar; arahan meta-kognitif mengelirukan model 3-flash (ia sebenarnya ADA system instruction dihantar oleh [`src/services/gemini.js`](../src/services/gemini.js)) |
| 3 | `d65e96f` (v1.6.0) | Tambah 4 heading markdown `## DEMONSTRATION` / `## CRITICAL RULES` / `## INPUT` / `## OUTPUT FORMAT` | Heading duplikat-gaya + token tambahan; mengganggu parsing heuristik model & menambah ~40 token/batch |

### 1.2 Kenapa masa prose melampau lama
- **Mismatch retry mahal:** 1× full-batch retry di batch 1 (78 entri) = ~5 minit masa dinding tambahan (semak log 09:29→09:34). Punca: model keluar 122/200 slot — behaviour drift berpunca daripada prompt yang berbeza dari ground truth.
- **Token overhead kecil × 3 batch:** heading markdown + bullet Rule 7 tambahan menambah token input kecil, tetapi lebih penting ia **mengubah kepercayaan output** — model 3-flash-preview dengan `thinkingLevel=low` lebih sensitif kepada struktur arahan.
- **Rule 7 continuation ribut:** 4× smart-recovery "untagged preamble" membuktikan model kerap memulakan output tanpa tag pembuka — kesan langsung prefill boundary yang tidak lagi sepadan dengan rentak arahan asal.

### 1.3 Ground truth yang MESTI dipulihkan (verbatim dari `b1fca3f`)

**A. `PROMPT_TEMPLATES`** — tiada `<task>` wrapper, tiada guard fallback, komen `🛠️ ZON TEMPLATE PROMPT (100% UNIVERSAL & DYNAMIC)`:

- `primary`: 3 peraturan INTRA-SLOT (ISOLATED FREEDOM / SPOKEN DICTION / DEPENDENT CLAUSES)
- `fallback`: 4 peraturan (3 di atas + NEUTRAL OBJECTIVITY)

**B. `createXmlBatchPrompt`** — struktur berturut tanpa heading markdown:
```
introInstruction
[UNIVERSAL STRUCTURAL DEMONSTRATION: ...]  → 6 input + 6 target contoh
CRITICAL ENFORCEMENT RULES (ZERO TOLERANCE): → Rule 1-7 (Rule 7 hanya 3 bullet)
<input>...</input>
[OUTPUT_FORMAT]
<s id="startId">
```

### 1.4 Kawasan DILARANG sentuh (non-regression)
- [`parseXmlBatchResponse`](../src/services/translationEngine.js:2130) — v1.6.1 Smart Preamble Scrubber (Case A/B/C) **KEKAL**. Ia adalah jaring keselamatan runtime, bukan sebahagian prompt.
- Semua mekanik batch/retry/streaming/key-rotation — di luar skop pembedahan ini.
- [`createPromptForWorkflow`](../src/services/translationEngine.js:2256) routing — hanya panggil `createXmlBatchPrompt`, tiada perubahan.
- Stage-2 fallback mask (`PROMPT_TEMPLATES.fallback` di baris ~1539) — terus berfungsi selepas pemulihan kerana string replace `.replace(primaryIntro, fallbackIntro)` bergantung pada teks literal yang akan dipulihkan sebijik.

---

## 2. Hasil Pembedahan (Surgical Diff Plan)

### LANJUKAN A — `PROMPT_TEMPLATES` (baris ~31-64)

**Pulihkan** kepada bentuk `b1fca3f`:
- Hapus wrapper `<task>` / `</task>`
- Hapus guard `${sourceLabel || 'the source'}` → kembali kepada `${sourceLabel}` murni
- Pulihkan header komen `🛠️ ZON TEMPLATE PROMPT (100% UNIVERSAL & DYNAMIC)`
- Pulihkan label komen `// 1. PROMPT ASAL (Enterprise Broadcast Standard - Intra-Slot Action-Replacement)` dan `// 2. PROMPT KECEMASAN (PROHIBITED_CONTENT Fallback - Neutral & Safe)`
- Badan 3+1 peraturan: **tiada perubahan teks** (semua rulebook sudah dipulihkan dalam v1.5.9 dan sepadan dengan `b1fca3f`)

### LANJUKAN B — `createXmlBatchPrompt` (baris ~2024-2122)

**Pulihkan** kepada bentuk `b1fca3f`:
1. Hapus komen blok `v1.6.0 ID-PARITY SURGERY V2: cosmetic markdown headings...`
2. Hapus `## DEMONSTRATION` (kekal hanya `[UNIVERSAL STRUCTURAL DEMONSTRATION: ...]`)
3. Hapus `## CRITICAL RULES` (kekal hanya `CRITICAL ENFORCEMENT RULES (ZERO TOLERANCE):`)
4. Hapus bullet Rule 7 ke-4 (`- This instruction block is the COMPLETE behavioral specification...`)
5. Hapus `## INPUT` (kekal hanya `<input>`)
6. Hapus `## OUTPUT FORMAT` (kekal hanya `[OUTPUT_FORMAT]`)

### LANJUKAN C — Verifikasi

1. **Render-parity check:** Node snippet yang memuatkan kedua-dua versi (semasa vs `b1fca3f`) dan membandingkan output `createXmlBatchPrompt` untuk batch contoh — mesti **string-identical**.
2. **`npm test`** — baseline minimum 92 PASS, 0 FAIL (regresi `gemini-auth-model-regression`, dll.).
3. Git commit dengan mesej pembedahan + update `CHANGELOG.md` + version bump sekiranya sesuai.

---

## 3. Risiko & Mitigasi

| Risiko | Tahap | Mitigasi |
|---|---|---|
| Stage-2 fallback gagal string-replace jika teks `PROMPT_TEMPLATES.primary` tidak sepadan | Rendah | Kedua-dua `primary` & `fallback` dipulihkan serentak dari `b1fca3f` — pasti sepadan |
| Parser v1.6.1 bergantung pada output model — perubahan prompt boleh mengubah tabiat output | Rendah | `parseXmlBatchResponse` TIDAK disentuh; smart-recovery kekal sebagai jaring |
| Regresi ujian yang bergantung pada teks prompt | Sederhana | Jalankan `npm test` penuh selepas pembedahan |
| Cache lama (bypass cache) menyimpan terjemahan versi prompt lama | Maklumat | Cache di luar skop; terjemahan baharu akan menggunakan prompt dipulihkan |

---

## 4. Keputusan Pembedahan

- [x] LANJUKAN A — `PROMPT_TEMPLATES` dipulihkan (termasuk trailing-space byte parity selepas `=>`)
- [x] LANJUKAN B — `createXmlBatchPrompt` dipulihkan
- [x] LANJUKAN C1 — Render-parity check LULUS: `PROMPT_TEMPLATES` (2313 chars) + `createXmlBatchPrompt` (6011 chars) **byte-identical** dengan `b1fca3f` — disahkan oleh [`scripts/verify-prompt-parity.js`](../scripts/verify-prompt-parity.js)
- [x] LANJUKAN C2 — `npm test` LULUS: **105 PASS, 0 FAIL** (1 skipped; baseline ≥92)
- [x] LANJUKAN C3 — Commit + CHANGELOG

### Catatan pelaksanaan
- [`parseXmlBatchResponse`](../src/services/translationEngine.js) (v1.6.1 Smart Preamble Scrubber) **tidak disentuh** — jaring keselamatan runtime kekal.
- Semakan parity meliputi byte-exact: trailing space selepas `=>` pada arrow `primary`/`fallback` turut dipulihkan sebagaimana `b1fca3f`.
- Versi asal `b1fca3f` disimpan sebagai rujukan di [`plans/prompt-refactor-backup/b1fca3f-translationEngine.js`](./prompt-refactor-backup/b1fca3f-translationEngine.js).

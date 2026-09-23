# 🔬 LAPORAN PEMBEDAHAN: DESYNC / ID PARITI HANCUR

**Tarikh:** 22 Sep 2026 · **Mode:** Backend · **Status:** LAPORAN + PLAN (belum bedah)

---

## 1. DIAGNOSIS FORENSIK — Punca DESYNC Dikenal Pasti

### 1.1 Kronologi Kemusnahan (Git Ground Truth)

| Commit | Tarikh | Tindakan | Kesan kepada ID Pariti |
|---|---|---|---|
| `backup` (pre-v1.5.3) | — | 7 blok "CRITICAL ENFORCEMENT RULES (ZERO TOLERANCE)" + ID list eksplisit | ✅ RESIPI RAHSIA — jinakkan AI |
| `141f9ee` v1.5.3 | 22 Sep 13:39 | 7 NEVER/INSTEAD rules dipotong → `<critical_rules>` ringkas; batch dipindah ke `contents` | ⚠️ Pariti mula rapuh |
| `b6dbcce` v1.5.6 | 22 Sep 19:37 | Persona dibuang; style dipindah ke SI; `<task>` jadi kosong | ⚠️ Pariti rapuh |
| `35d9efc` v1.5.7 | 22 Sep 21:xx | Top-K opt-in | (neutral) |
| **KEPUTUSAN** | | | 🚨 **DESYNC KEMBALI** |

### 1.2 Bukti #1 — User Prompt Kehilangan "Ammunition" ID Pariti

**LAMA** ([`translationEngine.js.bak:2048-2054`](plans/prompt-refactor-backup/translationEngine.js.bak:2048)) — senjata utama:

```
CRITICAL ENFORCEMENT RULES (ZERO TOLERANCE):

1. STRICT 1-TO-1 CARDINALITY & ID PARITY:
   - Output EXACTLY ${expectedCount} entries matching these EXACT IDs, in this order:
     [${idList}]                                              ← <== ID LIST PENUH, 200 ID
   - NEVER omit, combine, reorder, duplicate, or invent IDs; INSTEAD, pair every
     single input <s id="N"> strictly 1-to-1 with its matching output <s id="N">.
   - NEVER renumber, compress, or force sequential order; INSTEAD, preserve source
     SRT global IDs verbatim, retaining all numerical values and existing gaps.

2. ABSOLUTE SLOT ISOLATION & ZERO SPLITTING:  ... (NEVER pull, borrow, fold words)
3. ZERO SHIFTING, ANTI-HALLUCINATION & SOURCE FIDELITY:  ... (NEVER shift forward)
4. AIR-GAPPED READ-ONLY CONTEXT MEMORY (<m> TAGS)
5. ESCAPE HATCH (EXACT COPY PROTOCOL)
6. SONG LYRICS & INLINE MARKUP
7. CLEAN PAYLOAD ONLY  ... (continue directly from pre-filled anchor)
```

**SEMASA** ([`translationEngine.js:2048-2056`](src/services/translationEngine.js:2048)) — amunisi dirampas:

```
<critical_rules>
1. Cardinality: output exactly ${expectedCount} tags with these IDs in order:
   [${idList}]. Pair every input <s id="N"> strictly 1-to-1 ...       ← masih ada
2. Slot isolation: confine every translation strictly inside ...      ← versi lembut
3. Fidelity: do not shift dialogue forward to compensate ...
...
</critical_rules>
```

Struktur masih ada, TAPI ayat NEVER/INSTEAD antithesis (pola "beri 2 pilihan kontras") telah dipangkas. Model reasoning seperti Gemini 3 patuh lebih baik kepada arahan `NEVER X; INSTEAD Y` — pola kontras eksplisit — berbanding ayat penerangan pasif.

### 1.3 Bukti #2 — 🚨 BUG SEBENAR: Cabang Gemini-3 Dedah Rules + Demo kepada Sampah

Ini **punca teknikal utama** DESYNC semasa. Susunan panggilan semasa:

```
translateBatch() → createXmlBatchPrompt() → prompt penuh (demo + rules + input + anchor)
                 → _translateCall(prompt)  → gemini.translateSubtitle(batchText, ..., prompt)
                 → buildUserPrompt(subtitleContent, targetLanguage, customPrompt)
```

Kemudian di [`gemini.js:916-922`](src/services/gemini.js:916):

```js
if (this.isGemini3Model && !customPrompt) {
  return {
    userPrompt: subtitleContent,                 // batch mentah SAHAJA
    systemPrompt: GEMINI3_SYSTEM_INSTRUCTION,
    normalizedTarget
  };
}
// Legacy path: single combined prompt
let systemPrompt = (customPrompt || DEFAULT_TRANSLATION_PROMPT)...
let userPrompt;
if (systemPrompt.includes('<input>') || ...) {
  userPrompt = systemPrompt;                     // <== PROMPT PENUH JADI USER PROMPT
}
```

**Analisis aliran sebenar untuk Gemini 3:**

- `_translateCall()` **sentiasa** pass prompt penuh XML sebagai `customPrompt` ([`translationEngine.js:582-598`](src/services/translationEngine.js:582)).
- Maka cabang `isGemini3Model && !customPrompt` adalah **DEAD CODE** untuk laluan batch — `customPrompt` tak pernah kosong.
- Prompt penuh XML (demo + `<critical_rules>` + `<input>` + anchor) masuk ke **legacy path** sebagai `userPrompt`.
- `GEMINI3_SYSTEM_INSTRUCTION` TIDAK PERNAH dipasang untuk laluan batch (kerana `systemPrompt = customPrompt` di legacy path)!

**Kesatputan berganda:**
1. Style directives (`INTRA-SLOT LOCALIZATION`) dalam SI tidak aktif untuk batch Gemini 3.
2. V1.5.3 "halved input tokens" **tidak berlaku** — batch dihantar dua kali? TIDAK. Batch hanya 1x sebagai userPrompt legacy. Namun SI kosong bermaksud model reasoning kehilangan lapisan "processed-first" behavioral constraints — baki kuasa penahan hanya `<critical_rules>` ringkas yang telah dicairkan pada v1.5.3.

### 1.4 Bukti #3 — Prefill Anchor Conflicting Untuk Gemini 3.x

[`gemini.js:1014-1032`](src/services/gemini.js:1014):

```js
if (this.isPrefillSupported()) {           // <= gemini 3.1 & ke bawah sahaja
  let modelPrefill = "Task confirmed. Executing the strictly isolated raw data pipe localization stream now.\n";
  if (userPrompt.endsWith('<s id="')) {
    processedUserPrompt = userPrompt.slice(0, -7);
    modelPrefill += '<s id="';
  }
  contents = [ { role: "user", parts: [{ text: processedUserPrompt }] },
               { role: "model", parts: [{ text: modelPrefill }] } ];
}
```

Untuk model ≤ 3.1, anchor `<s id="N">` dihiris dari user prompt dan dipindah ke model prefill. **MASALAH:** `GEMINI3_SYSTEM_INSTRUCTION` OUTPUT FORMAT mengarah "Emit only the inner text of the first pre-filled slot at the very first character; do not repeat the opening tag." — Tetapi rules 7 dalam `<critical_rules>` di user prompt mengandungi rujukan `<s id="${startId}">` yang TIDAK lagi wujud secara literal dalam user contents (kerana dihiris ke prefill). Ini mengelirukan model reasoning.

Untuk model > 3.1 (3.5/3.6/3.7/3.8, tiada prefill), anchor `<s id="N">` kekal sebagai trailing text user prompt — selari dengan demo.

### 1.5 Bukti #4 — GEMINI3_SYSTEM_INSTRUCTION Tidak Memandu Anchor Continuity

[`gemini.js:296-319`](src/services/gemini.js:296) — SI semasa hanya mengandungi:
- CORE BEHAVIOR (slot independence, [br] preservation)
- INTRA-SLOT LOCALIZATION
- OUTPUT FORMAT (3 baris ringkas)
- LANGUAGE-SPECIFIC (Malay)
- SAFETY FALLBACK

**Yang HILANG berbanding resipi lama:**
- ❌ ID list eksplisit (di user prompt, tapi tanpa "EXACT IDs" emphasis)
- ❌ "ZERO SHIFTING" yang tegas (NEVER shift subsequent dialogue forward)
- ❌ Anti-merge "NEVER attach short slots to preceding/subsequent lines"
- ❌ Anti-split "NEVER split [br] into a new <s id> tag"
- ❌ Anti-hallucination "NEVER invent synthetic filler lines"
- ❌ Anti-commentary pada memory tags (<m> air-gapped rules dipindah ke user prompt sahaja)

---

## 2. RESEPI RAHSIA LAMA (Yang Berjaya Jinakkan AI)

Dari [`translationEngine.js.bak:2014-2097`](plans/prompt-refactor-backup/translationEngine.js.bak:2014) — struktur lengkap:

```
1. INTRO (PROMPT_TEMPLATES.primary)     — INTRA-SLOT LOCALIZATION 3 rules
2. UNIVERSAL STRUCTURAL DEMONSTRATION   — 6 slots input vs output (zero drift demo)
3. CRITICAL ENFORCEMENT RULES           — 7 blok ZERO TOLERANCE (NEVER/INSTEAD)
4. <input>...</input>                   — batch XML penuh
5. [OUTPUT_FORMAT] + anchor prefill     — <s id="${startId}">
```

**Formula kejayaan:** NEVER-X-INSTEAD-Y (dwi-pilihan kontras) + ID list literal + demo zero-drift + anchor prefill = AI takut gabung ayat / shift ID.

---

## 3. PLAN PEMBEDAHAN (Cadangan)

### Fasa A — Pembetulan Terus (Cedera Parah, Rawat Segera)

**A1. Pulihkan 7 ZERO TOLERANCE rules dalam `createXmlBatchPrompt`**
- Fail: [`src/services/translationEngine.js:2048-2056`](src/services/translationEngine.js:2048)
- Tukar `<critical_rules>` ringkas → 7 blok NEVER/INSTEAD penuh dari backup
- Kekalkan format XML tags semasa (`<critical_rules>`, `<demonstration>`, `<input>`) — struktur XML nesting adalah upgrade yang sah, kandungan sahaja dipulihkan.

**A2. Pulihkan INTRA-SLOT LOCALIZATION dalam `PROMPT_TEMPLATES.primary`**
- Fail: [`src/services/translationEngine.js:41-44`](src/services/translationEngine.js:41)
- Gantikan `<task>` kosong dengan 3 rules dari backup ([`translationEngine.js.bak:37-43`](plans/prompt-refactor-backup/translationEngine.js.bak:37))
- Kekalkan pembalut `<task>` (struktur XML, bukan ayat backup sahaja).

**A3. Betulkan Dead Code SI Routing (Punca #1 Utama)**
- Fail: [`src/services/gemini.js:906-936`](src/services/gemini.js:906)
- Legacy path perlu mengesan prompt XML engine (sudah ada `systemPrompt.includes('<input>')`) dan mengekalkan `GEMINI3_SYSTEM_INSTRUCTION` sebagai systemInstruction untuk Gemini 3 models **walaupun** customPrompt hadir.
- Cadangan: untuk `isGemini3Model === true`, SENTIASA gunakan SI, dan gunakan `customPrompt` sebagai user content (tanpa duplication).

**A4. Selaraskan Prefill Anchor dengan SI**
- Fail: [`src/services/gemini.js:1014-1040`](src/services/gemini.js:1014)
- Untuk model ≤3.1 (prefill didorong), pastikan rules 7 dalam user prompt TIDAK merujuk kepada anchor literal yang telah dipindah ke prefill.
- Cadangan: kondisional — bila prefill aktif, hantar prompt TANPA `[OUTPUT_FORMAT]<s id="${startId}">` trailing; bila prefill tiada (3.5+), kekalkan trailing anchor.

### Fasa B — Pengukuhan (Baja Tambahan)

**B1. ID List Chunking** — untuk batch 200, jangan senaraikan 200 ID linear dalam 1 baris (token bloat). Kumpulkan dalam rentang: `[101-130, 131-160, ...]` atau kumpulan 10 per baris.

**B2. Zero-Drift Demo Kedua** — tambah demo anti-merge (slot pendek "First," → jangan digabung) sebagai contoh kedua dalam `<demonstration>`.

**B3. Verification Pass in Parser** — jika `parseXmlBatchResponse` mendapati gap ID, log amaran dengan ID yang hilang (bukan hanya count). Sudah ada shift detector — tambah ID range dalam log.

### Fasa C — Kawalan Kualiti

- `npm test` — baseline 92 PASS / 0 FAIL
- Uji 1 fail sebenar dengan Gemini 3.x — sahkan ID parity 100%
- Semak log `🚨 SHIFT DETECTED` — sebelum selepas bedah
- Git commit berasingan: `fix(prompt): v1.5.8 — restore ZERO TOLERANCE ID parity rulebook`

### Konfigurasi Yang TIDAK Disentuh (Peraturan Keras)

- `systemInstruction` kekal top-level field — TIDAK pindah ke `contents`
- `thinkingBudget` / `topK` normalisasi di [`src/utils/config.js`](src/utils/config.js) — TIDAK disentuh
- Ground truth 3.x-strict / 3.x-legacy / 2.5 — TIDAK disentuh
- Batch size 200 — TIDAK disentuh (sama dalam backup)

---

## 4. Ringkasan Vars Impak

| Komponen | Risiko DESYNC | Tindakan |
|---|---|---|
| `<critical_rules>` dicairkan | 🔴 Tinggi | Pulihkan 7 ZERO TOLERANCE |
| SI tidak aktif untuk batch Gemini 3 | 🔴 Tinggi | Betulkan routing `buildUserPrompt` |
| Prompt rules merujuk anchor yang dipindah | 🟡 Sederhana | Kondisional prefill |
| ID list 200 linear | 🟡 Sederhana | Chunking rentang ID |
| Demo tanpa anti-merge case | 🟢 Rendah | Demo kedua |

**KESIMPULAN:** DESYNC bukan satu punca tunggal — ia gabungan (1) pemangkasan rulebook v1.5.3, (2) style dipindah ke SI yang TIDAK AKTIF untuk laluan batch Gemini 3 (dead code routing), dan (3) prefill anchor yang mengelirukan model reasoning. Resipi backup menyimpan 3 lapisan pertahanan; semasa hanya 1 lapisan (user prompt rules ringkas) yang aktif.

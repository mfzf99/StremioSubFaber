# 🔬 LAPORAN PEMBEDAHAN V2: DESYNC / ID PARITI — GROUND TRUTH INDUSTRI

**Tarikh:** 23 Sep 2026 · **Mode:** Backend · **Status:** LAPORAN + PLAN (menunggu kebenaran bedah)

---

## 0. VERDICT SATU AYAT

Resipi rahsia backup **sudah dipulihkan** pada v1.5.9 (7 ZERO TOLERANCE + INTRA-SLOT + ID list) — dan DESYNC **masih berlaku**. Ini membuktikan punca bukan lagi rulebook, tetapi **mazhab rasmi Google (System Instruction yang membawa behavioral constraints)** yang bercanggah dengan resipi tersebut. V2 = revert mazhab Google → **struktur backup 100% (single flat user prompt), dibuat perfect & clean**, mengikut ground truth pro tools industri.

---

## 1. BUKTI BAHAWA v1.5.9 SUDAH BERGAGAL (Forensik Semasa)

### 1.1 Apa yang sudah wujud sekarang (bukan hipotesis)

| Lapisan Resipi Backup | Status Semasa | Lokasi |
|---|---|---|
| 7 CRITICAL ENFORCEMENT RULES (NEVER/INSTEAD) | ✅ Dipulihkan penuh | [`translationEngine.js:2058-2097`](src/services/translationEngine.js:2058) |
| INTRA-SLOT LOCALIZATION 3 rules dalam `<task>` | ✅ Dipulihkan | [`translationEngine.js:43-51`](src/services/translationEngine.js:43) |
| ID list eksplisit + expectedCount | ✅ Ada | [`translationEngine.js:2060-2064`](src/services/translationEngine.js:2060) |
| Zero-drift demo 6 slot | ✅ Ada | [`translationEngine.js:2041-2056`](src/services/translationEngine.js:2041) |
| Anchor prefill `<s id="N">` | ✅ Ada | [`translationEngine.js:2103-2104`](src/services/translationEngine.js:2103) |
| **BUT**: SI Google rasmi lapisan ke-2 | ✅ Aktif — **INILAH MASALAH** | [`gemini.js:921-927`](src/services/gemini.js:921) |

### 1.2 Konflik Dalaman Aktif: SI vs User Prompt (Punca DESYNC V2)

Selepas fix v1.5.9 di [`gemini.js:906-941`](src/services/gemini.js:906), setiap batch Gemini 3 kini menghantar **DUA set arahan yang berlawanan secara struktur**:

**A) `GEMINI3_SYSTEM_INSTRUCTION` ([gemini.js:296-319](src/services/gemini.js:296)) — mazhab rasmi Google:**
```
- Translate each <s id="N"> slot independently...       ← definisi slot murah
- Output exactly as many tags as the input batch...      ← tiada ID list, tiada order
- Emit only the inner text of the first pre-filled slot  ← khusus prefill ≤3.1 sahaja
```

**B) User prompt XML ([translationEngine.js:2039-2104](src/services/translationEngine.js:2039)) — resipi backup:**
```
Output EXACTLY ${expectedCount} entries matching these EXACT IDs, in this order:
[${idList}]                                              ← 200 ID literal
NEVER omit, combine, reorder, duplicate, or invent IDs...
```

**4 Punca DESYNC konkrit daripada konflik ini:**

1. **Definisi "independently" dalam SI merosakkan meaning "1-to-1" dalam user prompt.** SI berkata "translate each slot independently" tanpa menyatakan ID list; model reasoning meletakkan keutamaan pada arahan sistem (diproses dahulu) dan merumuskannya sebagai "slot bebas → boleh fold/split di sempadan ayat". Inilah gejala "ID PARITI HANCUR".

2. **Ayat SI "Emit only the inner text of the first pre-filled slot" adalah PALSU untuk model 3.5+.** Untuk Gemini 3.5/3.6/3.7/3.8 (`isPrefillSupported() === false`, [gemini.js:515-526](src/services/gemini.js:515)), tiada prefill — anchor `<s id="N">` kekal sebagai trailing user text, dan model PATUT mengulang tag pembuka. Arahan SI yang salah ini menyebabkan model **mengeluarkan teks sahaja tanpa tag pembuka pertama** → parser anchor restoration menampal ID pertama yang salah atau slot pertama hilang.

3. **"Warning shot" arahan pendek melemahkan rulebook panjang.** Model reasoning Gemini 3 memberi pemberat lebih tinggi kepada arahan sistematik ringkas dalam SI berbanding rulebook panjang dalam user turn — lawan kepada hipotesis "SI dulu, user kemudian" yang dipinjam daripada panduan prompting Google (yang direka untuk tugas am, bukan tugas struktur-rigid seperti translation-with-ID-parity).

4. **Fallback non-3.x masih OK** — legacy path ([gemini.js:929-940](src/services/gemini.js:929)) tidak memasang SI XML engine langsung (systemPrompt = customPrompt penuh → jadi userPrompt). Ini bermakna **Anthropic/OpenAI/2.5 guna struktur backup tulen**, hanya **Gemini 3** yang terjejas mazhab bercampur. Konsisten dengan simptom: DESYNC hanya dilaporkan pada Gemini 3.

---

## 2. GROUND TRUTH INDUSTRI (Real-World Pro Tools, MCP Audit)

### 2.1 Subtitle Edit (standard de-facto dunia, 14.3k⭐, source code diaudit)

**Engine biasa** ([ChatGptTranslate.cs / GeminiTranslate.cs](https://github.com/SubtitleEdit/subtitleedit)):
```
Prompt lalai: "Translate from {0} to {1}, keep punctuation as input, keep line breaks
exactly the same, do not censor the translation, give only the output without comments:"
Gemini: "Please translate the following text from {0} to {1}, keep line breaks exactly
the same, do not censor the translation, only write the result:"
```

**Fakta struktur:**
- ❌ TIADA System Instruction terpisah — **semuanya dalam SATU user message** (`prompt + "\n\n" + text`)
- ❌ TIADA XML tag, TIADA demo, TIADA rulebook panjang — hanya 1 ayat arahan + konteks
- ✅ Batching: 10 baris/panggilan, retry & **auto-halve batch** bila reply tak sah
- ✅ Konteks: 12 baris terdahulu yang sudah diterjemah (history, bukan memory tags)
- ✅ Temperature 0.2 dipilih "low temperatures keep terminology consistent"
- ✅ "Keep line breaks exactly the same" — satu-satunya janji struktur
- ✅ **Buang semua line breaks yang model tambah** ("often add their own") — parser defensive, bukan prompt defensive

**Engine "advanced"** ([LlamaCppAdvancedProtocol.cs](https://github.com/SubtitleEdit/subtitleedit/blob/main/src/ui/Features/Translate/LlamaCppAdvanced/LlamaCppAdvancedProtocol.cs)) — paling relevan:
```
System: "You are a professional subtitle translator. Translate each subtitle line
from {0} to {1}. Preserve meaning, tone and style; do not censor the translation.
Keep formatting tags exactly as they are."  (+ formaliti + synopsis + glossary)

ProtocolText: "The user message is a JSON object. 'history' holds recent
already-translated lines... 'lines' holds the lines to translate now, each with a
line number 'n' and its 'text'... Answer with ONLY a JSON object mapping every line
number to its translation, e.g. {"1":"...","2":"..."}. Include each line number
exactly once and nothing else."
```

**Fakta kunci industri:**
1. **ID PARITY DIDAPAT MELALUI PROTOCOL PASANGAN n↔terjemahan, BUKAN melalui 200 ID literal dalam prompt.** Mapping per-line adalah struktur data, bukan arahan.
2. **System prompt dipesan stable-parts-first untuk KV-cache reuse** — dan SI mereka hanya 3-5 ayat. Persona "professional subtitle translator" wujud sebagai 1 ayat (kami kekal persona-free — resepi kita lebih ketat).
3. **Auto-halve on failure**: jika reply tak lengkap, batch dibahagi 2 dan dicuba semula. Ini pengurusan risiko di lapisan protokol, bukan prompt.
4. **Parser bersihkan output model secara agresif** (RemovePreamble, DecodeUnicodeEscapes, buang double-newline) — andaian "model akan silap" dibina di parser, bukan dilawan dengan 200 baris arahan.

### 2.2 Triangulasi lain

- **GPTSubtitler** (web pro, dirujuk isu #9427): struktur sama — satu prompt pendek, nombor baris, JSON balik.
- **Isu #8293 Subtitle Edit**: "Here are your translations:" merosakkan keseluruhan batch → penyelesaian industri: **trigger-word scrubbing di parser**, bukan haramkan dalam prompt.
- **Isu #9394**: blok besar melontar "unwanted line breaks / merges sentences" → industri jawab dengan **batch kecil + konteks**, bukan rulebook lebih panjang.

### 2.3 Kesimpulan Ground Truth

| Amalan | Subtitle Edit / Pro Tools | StremioSubMaker Semasa | Backup (Resipi Rahsia) |
|---|---|---|---|
| System Instruction | ❌ Tiada (biasa) / 3-5 ayat (advanced) | 🔴 SI penuh + user rulebook = konflik | ❌ Tiada — SATU flat prompt |
| ID parity | Mapping n↔output per-line | 🔴 200 ID literal + SI bercanggah | ID list + NEVER/INSTEAD (berfungsi dulu) |
| Batch | 10-12 baris + auto-halve | 200 slot | 200 slot |
| Konteks | History 12 baris terdahulu | `<m>` air-gapped tags | `<m>` air-gapped tags |
| Defensif lapisan | Parser agresif + retry/halve | Parser ada (good) | Parser ada (good) |

**Verdict MCP:** Struktur Google (SI-memegang-behavior) memang tak sesuai untuk tugas *structure-locked batch translation*. Pro dunia letak SEMUA dalam satu turn user, dan jaga pariti di protokol/parser. Resipi backup adalah pendekatan yang sama arah dengannya — ia hanya perlu **dikembalikan tulen dan dibersihkan**.

---

## 3. PLAN PEMBEDAHAN V2 (Revert Ke Struktur Backup — Perfect & Clean)

### Prinsip V2
> **"Satu suara, satu turn, satu suara itu ialah resipi backup."**
> Semua behavioral constraints pulang ke user prompt (struktur backup). SI Gemini 3 ditarik keluar dari laluan batch sepenuhnya. Tiada konflik, tiada dead code, tiada arahan palsu.

### Fasa A — REVERT (Buang Mazhab Google dari Laluan Batch)

**A1. `buildUserPrompt()` — laluan Gemini 3 kembali kepada laluan tunggal backup**
- Fail: [`src/services/gemini.js:906-941`](src/services/gemini.js:906)
- **BUANG** cabang `if (this.isGemini3Model) { return { userPrompt: customPrompt, systemPrompt: GEMINI3_SYSTEM_INSTRUCTION ... } }`
- Pulihkan logika backup tulen ([gemini.js.bak:847-861](plans/prompt-refactor-backup/gemini.js.bak:847)):
  ```js
  let systemPrompt = (customPrompt || DEFAULT_TRANSLATION_PROMPT).replace('{target_language}', normalizedTarget);
  let userPrompt;
  if (systemPrompt.includes('<input>') || systemPrompt.includes('INPUT (')) {
    userPrompt = systemPrompt;                     // XML engine prompt = userPrompt penuh
  } else {
    userPrompt = `${systemPrompt}\n\nContent to translate:\n\n${subtitleContent}`;
  }
  ```
- Kesan: engine XML prompt (backup full) pergi **hanya sekali** sebagai user content; **tiada SI dipasang** untuk batch — tepat seperti zaman backup yang pariti ID-nya lenyap. `systemInstruction` field jadi `undefined` → tidak dihantar ke API (guard `if (systemPrompt && ...)` sudah melindungi).
- ✅ KEKAL top-level rule: bila SI wujud (customPrompt bebas pengguna pada laluan bukan-batch), ia tetap medan `systemInstruction` — TIDAK pindah ke `contents`.

**A2. Kembalikan `GEMINI3_SYSTEM_INSTRUCTION` kepada hiasan mati (dead constant) atau padam**
- Fail: [`src/services/gemini.js:280-319`](src/services/gemini.js:280), export di [gemini.js:1596](src/services/gemini.js:1596)
- Cadangan: **padam terus** (perfect & clean). Ia berumur 2 versi dan terbukti meracuni batch. Export dibuang serentak. Tiada test merujuknya (disahkan: 0 padanan dalam `*.test.js`).

**A3. Prefill anchor — selaraskan dengan realiti model (bukan SI lagi, tapi rules 7)**
- Fail: [`src/services/gemini.js:1019-1045`](src/services/gemini.js:1019) & [`gemini.js:1212-1238`](src/services/gemini.js:1212)
- Keadaan backup sudah BETUL: rules 7 menulis "NEVER repeat, re-emit, or acknowledge the pre-filled `<s id="${startId}">` opening tag" — dan untuk ≤3.1 anchor memang dipindah ke prefill. Untuk 3.5+ (tiada prefill) backup juga menghantar anchor sebagai trailing text — rules 7 masih konsisten kerana model diminta "continue directly from the prompt boundary", yang bermaksud tidak mengulang anchor. **Tiada perubahan struktur** — cuma sahkan tiada rujukan SI tertinggal. (Pemeriksaan V1 bahagian ini tertumpu kepada SI; tanpa SI, konflik hilang.)

### Fasa B — PERFECT & CLEAN (Kemasan Resipi Rahsia, Bukan Kandungan)

**B1. Penyusunan semula prompt head (kena baca "scan-friendly" oleh model reasoning)**
- Fail: [`src/services/translationEngine.js:2039-2104`](src/services/translationEngine.js:2039)
- Susunan backup dikekalkan 1:1; yang ditambah hanyalah **markdown heading kosmetik** supaya model reasoning dapat navigasi pantas tanpa menukar satu pun ayat NEVER/INSTEAD:
  ```
  <task>...</task>
  ## DEMONSTRATION
  ## CRITICAL RULES
  ## INPUT
  ## OUTPUT FORMAT
  ```
- ID list dikekalkan literal (resipi asal) — **B2 lama (chunking rentang) DIBATALKAN** kerana ground truth industri menunjukkan ID list literal adalah senjata pariti; memotong rentang mengurangkan kejelasan.

**B2. Rules 7 diberi penegasan anti-SI yang dulu disembunyikan oleh kehadiran SI** (1 ayat tambahan, gaya backup):
  - Dalam blok 7 CLEAN PAYLOAD ONLY, tambah: `This instruction block is the COMPLETE behavioral specification; there is no system instruction, no persona, and no hidden policy above it.` — mematikan hallucinasi model yang "merasakan" ada SI.

**B3. Parser scrubbing "preamble" (borrowed pro pattern, zero risk)**
- Fail: [`src/services/translationEngine.js:2115-2128`](src/services/translationEngine.js:2115)
- Tambah (sebelum anchor restoration): buang baris pembuka ala jawapan ("Here is the translation", "Here are the translated subtitles:") jika wujud — borrow daripada `ChatGptTranslate.RemovePreamble` industri.
- Tambah log amaran bila jumpa (bukan silent) supaya DESYNC kelak mudah dikesan.

**B4. Bonus konteks FREE dari struktur tunggal**
- Dengan SI dibuang, token input turun ~600 token/batch (panjang GEMINI3_SYSTEM_INSTRUCTION) dan **tiada lagi 2x XML prompt** (punca token dobel dirampas v1.5.9 telah hilang).

### Fasa C — KAWALAN KUALITI (Peraturan Keras)

- ✅ `npm test` — baseline **92 PASS / 0 FAIL** mesti kekal (0 test merujuk GEMINI3_SYSTEM_INSTRUCTION — disahkan)
- ✅ Ujian 1 fail sebenar Gemini 3.x, sahkan ID parity 100%
- ✅ Semak log `SHIFT DETECTED` sebelum/selepas bedah
- ✅ Git commit berasingan: `fix(prompt): v1.6.0 — revert to single flat prompt (backup recipe), retire Gemini-3 SI school`

### YANG TIDAK DIUSIK (Peraturan Keras V2)

- ❌ `systemInstruction` kekal **top-level field** bila wujud — TIDAK pindah ke `contents`
- ❌ `thinkingBudget` / `topK` di [`src/utils/config.js`](src/utils/config.js) — **TIDAK DIUSIK** (topK opt-in kekal)
- ❌ Ground truth 3.x-strict (sampling stripped) / 3.x-legacy (temp 1.0) / 2.5 (full sampling) — TIDAK DIUSIK
- ❌ **No persona** — persona-free kekal (Zheng et al. 2024)
- ❌ **No top-k** — opt-in kekal, default OFF
- ❌ Batch size 200, `<m>` air-gapped memory, anchor prefill ≤3.1 — semua kekal (struktur backup)
- ❌ Frontend / public/ — TIDAK DIUSIK (backend domain)

---

## 4. Risk Matrix & Rollback

| Perubahan | Risiko | Mitigasi |
|---|---|---|
| Buang cabang SI Gemini 3 | Rendah — kembali kepada keadaan terbukti backup | Struktur code backup tersimpan penuh di [`plans/prompt-refactor-backup/gemini.js.bak:847-861`](plans/prompt-refactor-backup/gemini.js.bak:847) |
| Padam GEMINI3_SYSTEM_INSTRUCTION | Rendah — 0 rujukan test | Export + constant dibuang serentak; grep disahkan kosong |
| Preamble scrubbing parser | Rendah — additive, di hadapan regex sedia | Regex sedia tak disentuh; scrub hanya bila padanan literal |
| Heading kosmetik ## | Sangat rendah — hanya teks | Tiada ayat NEVER/INSTEAD diubah |

**Rollback:** `git revert` satu commit — semua perubahan V2 berada dalam 2 fail (`gemini.js`, `translationEngine.js`).

---

## 5. Mengapa V2 dan Bukan V3 (Penutup)

1. v1.5.9 sudah membuktikan "restore rulebook + tambah SI" TIDAK menyelesaikan DESYNC → hipotesis rulebook-tidak-cukup telah diuji dan gagal.
2. Ground truth industri menunjukkan tiada pro tool yang mengedarkan behavioral constraints antara SI + user prompt untuk tugas struktur-rigid; mereka guna satu turn + protocol mapping + parser agresif.
3. Struktur backup adalah binaan dalam arah yang sama (satu flat prompt + senjata ID literal) dan ia **pernah berjaya** jinakkan model. Yang rosak adalah lapisan SI tambahan v1.5.3–v1.5.9, bukan resipinya.
4. Perfect & clean bermakna: bila siap, tiada cabang mati, tiada constant tidak digunakan, tiada dua set arahan bercanggah — hanya resipi rahsia yang berjalan seperti hari pertama ia berfungsi.

**Menunggu lampu hijau untuk mula bedah.**

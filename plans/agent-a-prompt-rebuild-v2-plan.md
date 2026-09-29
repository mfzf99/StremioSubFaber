# Agent A Prompt Rebuild v2 — Ground Truth Plan

**Status:** PROPOSAL (kod belum disentuh)
**Tarikh:** 2026-09-29
**Author:** Claude (Backend Lead)
**Mandat pemilik:** ID PARITI #1, kesedapan #2. Kurangkan beban model. Fix bazir token.
Universal 400+ bahasa. Batch 30, window 3/2 (kekal). Coherence antara batch = raja.

---

## 1. Masalah disahkan (dari pembacaan kod sebenar)

### M1 — Bazir token / beban berganda (KRITIKAL)
[`buildUserPrompt()`](src/services/gemini.js:1065): bila prompt ada `<input>`,
`userPrompt = systemPrompt` (prompt penuh). Kemudian
[`translateSubtitle()`](src/services/gemini.js:1173) hantar `userPrompt` sebagai
kandungan user, DAN [baris 1186](src/services/gemini.js:1186) hantar teks SAMA
sebagai `systemInstruction`. **Seluruh blok arahan (role + 8 rules + 4 craft +
6 few-shot + Bible + 30 baris) dihantar DUA KALI setiap batch.** Laluan stream
([gemini.js:1377](src/services/gemini.js:1377)) sama.

### M2 — Beban kognitif (model "letih")
Prompt sekarang: Role + 8 structural_rules + 4 translation_craft + 6 few-shot +
Bible + prev/next + memory + input. Bertindih (mis. ANTI-DROP rule vs NATURAL
COMPRESSION craft), panjang, dan dihantar 2×. Attention decay di tengah.

### M3 — Ketegangan pariti vs kesed2apan tidak berhierarki
Rules kata "slot incomplete is correct"; craft kata "compression, natural".
Tiada penyata keutamaan eksplisit. Model kena teka mana menang.

### M4 — Sempadan konteks vs input kabur
Bible + prev/next + input semua dalam satu user blob. Risiko model terjemah
baris konteks (PHANTOM/SHIFT).

---

## 2. Kontrak teknikal yang WAJIB dipelihara (jangan pecah)

1. **Prefill anchor** — `userPrompt.endsWith('<s id="')` → strip + pindah ke
   model prefill ([gemini.js:1154](src/services/gemini.js:1154)). Smart Preamble
   Scrubber ([translationEngine.js:2744](src/services/translationEngine.js:2744))
   bergantung padanya. `<input>` + `<answer>` + anchor MESTI kekal di kandungan user.
2. **Kontrak `<answer>` block** + parser `parseXmlBatchResponse`.
3. **[br] handling** (count locked, reposition adaptif).
4. **6-crime alignment** dengan Agent B (MERGE/SHIFT/PHANTOM/DROP/UNTRANSLATED/REGISTER)
   + few-shot 1:1.
5. **Universal 400+ bahasa** — sifar teks khusus-bahasa; `${targetLabel}`;
   few-shot dari pack.
6. **`buildUserPrompt` dikongsi** — Gemini + Anthropic + OpenAI-compatible + DeepL.
   Agent B override sendiri. Perubahan kena backward-safe.

---

## 3. Reka bentuk baru — split System vs User

### Prinsip: arahan STATIK → systemInstruction (hantar sekali, cacheable);
### data DINAMIK → user content (Bible + input + anchor).

**Seam bersih** dalam `createXmlBatchPrompt`: pulangkan dua bahagian.

```
SYSTEM (statik, sama setiap batch — layak context-cache):
  ## Role  (universal, ${sourceLabel}/${targetLabel})
  ## Priority   ← BARU: hierarki eksplisit
      0. Slot/ID parity is SACRED. Exactly one <s id="N"> out per input id,
         same ids, same order. When parity and fluency ever conflict,
         PARITY WINS. A perfectly parsed subtitle track matters more than a
         beautiful line.
  ## Rules (ramping — gabung 8+4 → ~6 tajam, sifar tindih)
      1. SLOT ISOLATION (anti-merge + tiebreaker digabung)
      2. ZERO SKIP / no drift (anti-shift)
      3. NO FABRICATION (anti-phantom)
      4. FULL MEANING (anti-drop)
      5. ALWAYS TRANSLATE unless untranslatable proper noun/title → copy
         (escape hatch + anti-untranslated digabung)
      6. PRESERVE markup [br]/<i>/dash (count locked, [br] reposition natural)
  ## Craft (padat — 1 perenggan, bukan 4 rule)
      Reproduce meaning+emotion the way a native ${targetLabel} speaker would
      say it; keep lines tight and natural; adapt idioms; never calque.
      (Timing & length are fixed by the file — you only swap the language,
       so DON'T worry about reading-speed math; just make each line read
       cleanly.)   ← jelaskan text-to-text, bukan Netflix CPS
  ## Few-shot  (dari pack — 6 contoh, universal)
  ## Output Format  (kontrak <answer> + satu <s id> per input)

USER (dinamik, per batch):
  [CONTEXT — READ ONLY, DO NOT TRANSLATE]
    <previous_content>/<subsequent_content> + Bible + previousMemory
  <input> … 30 baris … </input>
  <answer>
  <s id="START">        ← anchor prefill kekal di sini
```

### Kesan pada M1-M4
- **M1**: systemInstruction != user content → tiada duplikasi. Arahan statik
  dihantar sekali (dan Gemini boleh cache). Token turun mendadak.
- **M2**: rules 8→6, craft 4-rule→1 perenggan. Beban turun.
- **M3**: `## Priority 0` kunci hierarki pariti-first.
- **M4**: sempadan `[CONTEXT — READ ONLY]` vs `<input>` jelas dalam user content.

---

## 4. Pilihan pelaksanaan (RISIKO — perlu keputusan)

**Opsyen B (minimal, risiko rendah):** Kekal `createXmlBatchPrompt` pulang satu
string. Ubah `buildUserPrompt` supaya prompt XML self-contained dihantar sebagai
**user sahaja** (systemPrompt = '' untuk kes ni). Fix M1 (bazir token) 100%.
TAK dapat faedah "arahan dalam systemInstruction". Ramping prompt (M2/M3/M4)
tetap boleh dibuat dalam body. ~1 fail berubah (gemini.js) + prompt body.

**Opsyen C (penuh, risiko sederhana):** `createXmlBatchPrompt` pulang
`{ system, user }`. Rewire `buildUserPrompt` + pemanggil untuk route dua bahagian.
Dapat semua faedah (cache, pemisahan bersih). Sentuh gemini.js (2 laluan) +
mungkin translationProviderFactory + kontrak customPrompt. Lebih banyak test.

**Cadangan aku: Opsyen C**, tapi dilaksana berhati-hati dengan pengekalan
backward-compat: kalau pemanggil hantar `customPrompt` string lama (bukan objek
{system,user}), kekal tingkah laku lama. Ini elak pecah Anthropic/DeepL/legacy.

---

## 5. Batch size & window
- Batch: **60 → 30** ([translationEngine.js:114](src/services/translationEngine.js:114)
  `SUBFABER_BATCH_SIZE`). Kemas komen + test yang assert 60.
- Window: **kekal 3/2** (VideoLingo ground truth). previousMemory bawa coherence.

---

## 6. Test & keluaran
- Kemas subfaber-context / universal-pack / beta-run7 test ikut prompt baru.
- Tambah test: no-duplication (systemInstruction != user content), Priority 0
  hadir, rules 6, sempadan CONTEXT/input, batch=30.
- `npm test` mesti 0 FAIL sebelum commit. Version bump. Commit + push + merge main.

---

## 7. Risiko & mitigasi
| Risiko | Mitigasi |
|--------|----------|
| Pecah prefill anchor → off-by-one | Anchor kekal di HUJUNG user content; test parser |
| Pecah provider lain (Anthropic/DeepL) | Backward-compat: string lama → laluan lama |
| Ramping rules buang nuansa penting | Petakan setiap rule lama → rule baru 1:1 sebelum buang |
| Agent B mis-align (6 crime) | Kekal label ANTI-* dalam rule + few-shot 6 |

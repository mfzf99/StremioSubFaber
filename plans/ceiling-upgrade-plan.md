# Plan Pembedahan: Menaikkan Ceiling Kualiti SubFaber Basic

**Tarikh:** 2026-11-09
**Status:** DRAF — Menunggu Kelulusan Owner
**Skop:** Basic mode sahaja (Pro/Trinity direhatkan)

---

## 1. Diagnosis Masalah

### Gejala yang Owner Perasan
- Temperature 0.2: Output lebih patuh arahan, lebih natural
- Temperature 0.3: Output kurang patuh, line break kurang natural
- `reconcileBrParity` berfungsi untuk count parity, tetapi kualiti bergantung pada AI

### Punca Akar
- AI tidak memahami "natural phrase break" dengan jelas
- Prompt R4 terlalu abstrak — tiada contoh konkrit
- Enjin hanya mengira jumlah, bukan kualiti posisi

---

## 2. Objektif

1. Menaikkan ceiling kualiti terjemahan untuk semua bahasa
2. Mengekalkan prinsip "satu prompt untuk semua"
3. Tiada language pack diwujudkan semula
4. Tiada pembaziran token

---

## 3. Cadangan Penyelesaian

### Pilihan A: Perkuat Arahan (Paling Mudah)

**Perubahan:** Tambah penekanan "CRITICAL" dan jelaskan apa yang "natural" bermaksud.

**Sebelum:**
```
4. Keep every [br], <i>...</i>, "--" and "…" from the source: same count in the same slot, never turned into a new slot. Put each [br] at a natural phrase break in ${targetLabel}; keep <i>...</i> attached to the words it marks and leading "-" dashes at the start of their speaker turn.
```

**Selepas:**
```
4. Keep every [br], <i>...</i>, "--" and "…" from the source: same count in the same slot, never turned into a new slot. 
   Put each [br] at a natural phrase break in ${targetLabel} — 
   break between clauses or complete phrases, never inside a phrase. 
   CRITICAL: The break must separate two complete thoughts, not split a single thought.
```

**Kelebihan:**
- Mudah — hanya ubah prompt
- Universal — tiada bahasa-specific
- Jimat token — hanya +20 token

**Kekurangan:**
- Masih bergantung pada AI mematuhi arahan

---

### Pilihan B: Contoh Universal untuk R2, R3, R4 (Disarankan)

**Perubahan:** Tambah contoh universal dalam bahasa Inggeris untuk R2, R3, dan R4.

**Sebelum:**
```
2. When one sentence is split across consecutive slots, translate the whole sentence first, then divide its meaning back into those same slots. Every slot keeps its own meaningful part: no repeated words, nothing crammed into one slot, no slot left ending on a bare connective word.
3. Write the line the way a native speaker of ${targetLabel} would say it, not the way the ${sourceLabel} sentence is built. Use the target language's own word order, pronouns and sentence rhythm; never translate word-by-word and never mirror the source structure.
4. Keep every [br], <i>...</i>, "--" and "…" from the source: same count in the same slot, never turned into a new slot. Put each [br] at a natural phrase break in ${targetLabel}; keep <i>...</i> attached to the words it marks and leading "-" dashes at the start of their speaker turn.
```

**Selepas:**
```
2. When one sentence is split across consecutive slots, translate the whole sentence first, then divide its meaning back into those same slots. Every slot keeps its own meaningful part: no repeated words, nothing crammed into one slot, no slot left ending on a bare connective word.
   Example: "I was on my phone" + "and wasn't watching" →
   "Clause A" + "Clause B" (each slot keeps its own meaning, NOT "Clause A Clause B" + "").
3. Write the line the way a native speaker of ${targetLabel} would say it, not the way the ${sourceLabel} sentence is built. Use the target language's own word order, pronouns and sentence rhythm; never translate word-by-word and never mirror the source structure.
   Example: "I was on my phone" →
   "Natural target-language phrasing" (NOT "word-for-word translation").
4. Keep every [br], <i>...</i>, "--" and "…" from the source: same count in the same slot, never turned into a new slot.
   Put each [br] at a natural phrase break in ${targetLabel} —
   break between clauses or complete phrases, never inside a phrase.
   Example: "I was on my phone [br] and wasn't watching" (correct)
   vs "I was on my [br] phone and wasn't watching" (wrong).
```

**Kelebihan:**
- Jelas — AI faham apa yang dikehendaki dengan contoh
- Universal — satu contoh untuk semua bahasa
- Jimat token — hanya +120 token untuk 3 contoh
- Tidak mengalihkan perhatian — AI tahu ini hanya contoh struktur

**Kekurangan:**
- Sedikit lebih panjang
- Masih bergantung pada AI mematuhi arahan

---

### Pilihan C: Structured Output (Paling Tepat)

**Perubahan:** Gunakan structured output untuk memaksa format.

**Cadangan:**
```json
{
  "entries": [
    { "id": 1, "text": "Line 1", "hasLineBreak": true },
    { "id": 2, "text": "Line 2", "hasLineBreak": false }
  ]
}
```

**Kelebihan:**
- AI dipaksa mengikut struktur
- Tiada ruang untuk kesilapan
- Enjin boleh mengesahkan struktur

**Kekurangan:**
- Perlu perubahan kod yang lebih besar
- Mungkin tidak disokong oleh semua provider
- Lebih kompleks

---

## 4. Cadangan Akhir

**Pilihan B** — Contoh universal dalam bahasa Inggeris untuk R2, R3, dan R4.

**Sebab:**
1. **Paling berkesan** — AI faham dengan contoh
2. **Paling praktikal** — hanya ubah prompt, tiada kod
3. **Paling universal** — satu contoh untuk semua bahasa
4. **Paling jimat** — hanya +120 token untuk 3 contoh
5. **Selaras mandat** — satu prompt untuk semua, tiada language pack

---

## 5. Pelaksanaan

### Langkah 1: Ubah Prompt R2, R3, R4

**Fail:** `src/services/prompts/trinity/translation/core.js`

**Perubahan R2 (Split-sentence):**
```diff
- 2. When one sentence is split across consecutive slots, translate the whole sentence first, then divide its meaning back into those same slots. Every slot keeps its own meaningful part: no repeated words, nothing crammed into one slot, no slot left ending on a bare connective word.
+ 2. When one sentence is split across consecutive slots, translate the whole sentence first, then divide its meaning back into those same slots. Every slot keeps its own meaningful part: no repeated words, nothing crammed into one slot, no slot left ending on a bare connective word.
+    Example: "I was on my phone" + "and wasn't watching" →
+    "Clause A" + "Clause B" (each slot keeps its own meaning, NOT "Clause A Clause B" + "").
```

**Perubahan R3 (Anti-calque):**
```diff
- 3. Write the line the way a native speaker of ${targetLabel} would say it, not the way the ${sourceLabel} sentence is built. Use the target language's own word order, pronouns and sentence rhythm; never translate word-by-word and never mirror the source structure.
+ 3. Write the line the way a native speaker of ${targetLabel} would say it, not the way the ${sourceLabel} sentence is built. Use the target language's own word order, pronouns and sentence rhythm; never translate word-by-word and never mirror the source structure.
+    Example: "I was on my phone" →
+    "Natural target-language phrasing" (NOT "word-for-word translation").
```

**Perubahan R4 (Line break):**
```diff
- 4. Keep every [br], <i>...</i>, "--" and "…" from the source: same count in the same slot, never turned into a new slot. Put each [br] at a natural phrase break in ${targetLabel}; keep <i>...</i> attached to the words it marks and leading "-" dashes at the start of their speaker turn.
+ 4. Keep every [br], <i>...</i>, "--" and "…" from the source: same count in the same slot, never turned into a new slot.
+    Put each [br] at a natural phrase break in ${targetLabel} —
+    break between clauses or complete phrases, never inside a phrase.
+    Example: "I was on my phone [br] and wasn't watching" (correct)
+    vs "I was on my [br] phone and wasn't watching" (wrong).
```

### Langkah 2: Uji dengan Pelbagai Bahasa

**Ujian:**
- English → Malay
- English → Japanese
- English → Spanish
- English → Vietnamese

**Metrik:**
- Count parity: 100%
- Position quality: Lebih natural
- Token usage: +40 token (acceptable)

### Langkah 3: Release

**Jika lulus:**
- Commit dengan mesej: `v3.29.1 Improve line break quality with universal example`
- Push ke `origin/main`
- Watch CI

---

## 6. Risiko

| Risiko | Mitigasi |
|---|---|
| AI masih tidak patuh | Enjin `reconcileBrParity` sebagai backup |
| Contoh tidak difahami | Uji dengan pelbagai bahasa |
| Token bertambah | Hanya +40 token (acceptable) |
| Regresi | Ujian regresi penuh sebelum release |

---

## 7. Keputusan

**Menunggu kelulusan Owner untuk melaksanakan Pilihan B.**

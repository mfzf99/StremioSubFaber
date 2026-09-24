# 🏥 Plan Pembedahan: Purge Fallback Prompt + Relokasi `PROMPT_TEMPLATES` ke Blok Critical Rules

> **Tarikh:** 2026-09-24
> **Fail sasaran:** [`src/services/translationEngine.js`](../src/services/translationEngine.js)
> **Commit rujukan (prompt latest):** `5f9c307` ("Update translationEngine.js", 2026-09-24 19:36)
> **Status:** ✅ PEMBEDAHAN SELESAI (2026-09-24) — semua LANJUKAN A-E lulus.

---

## 0. Arahan Pembedahan (dari user)

1. **Buang** fallback prompt (`PROMPT_TEMPLATES.fallback`) daripada sistem submaker — pertahanan PROHIBITED_CONTENT sebenar (Stage 1 + Stage 2) kekal.
2. **Pindahkan semula** `const PROMPT_TEMPLATES = {` masuk ke dalam blok yang sama dekat *Critical Enforcement Rules* (iaitu ke dalam `createXmlBatchPrompt`).
3. **Primary prompt yang latest (`5f9c307`) disalin sebijik** — tiada pindaan teks.
4. Plan disediakan; pelaksanaan hanya selepas kelulusan.

---

## 1. Anatomi Semasa (Bukti Lokasi)

| # | Lokasi | Kandungan | Status |
|---|---|---|---|
| A | [`translationEngine.js:31-70`](../src/services/translationEngine.js:31) | `const PROMPT_TEMPLATES` skop modul: `primary` (latest `5f9c307`) + `fallback` (BLUNT, LITERAL MALAY) | Sasaran buang/pindah |
| B | [`translationEngine.js:1602-1681`](../src/services/translationEngine.js:1602) | Stage 2: bina `primaryIntro`/`fallbackIntro` (baris 1604-1607) → `pendingPrompt.replace(primaryIntro, fallbackIntro)` (baris 1676) | Sasaran buang swap |
| C | [`translationEngine.js:1551-1553`](../src/services/translationEngine.js:1551) + baris 1567 | Komen protokol + log "…and Fallback Prompt" | Kemas kini teks |
| D | [`translationEngine.js:2125`](../src/services/translationEngine.js:2125) | `const introInstruction = PROMPT_TEMPLATES.primary(...)` di dalam `createXmlBatchPrompt`, terus menyuap `CRITICAL ENFORCEMENT RULES (ZERO TOLERANCE):` (baris 2146) | Titik masuk relokasi |
| E | [`scripts/verify-prompt-parity.js`](../scripts/verify-prompt-parity.js) | Pariti byte vs backup `b1fca3f` — akanObsolete selepas pembedahan | Kemas kini |

**Pengesahan kebergantungan (selesai):**
- `PROMPT_TEMPLATES.fallback` hanya digunakan **1 tempat** (baris 1607 → 1676). Selepas buang, tiada rujungan tergantung.
- Karian carian `*.test.js` untuk `PROMPT_TEMPLATES|fallback prompt|Dah gila|BLUNT` = **0 padanan** → tiada ujian bergantung pada teks fallback.
- `npm test` (`test:tracked`) **tidak** memanggil `verify-prompt-parity.js` — skrip itu standalone.

---

## 2. Skop & Batas (Non-Negotiable)

**DALAM SKOP:**
- Padam `PROMPT_TEMPLATES.fallback`.
- Buang operasi swap prompt dalam Stage 2 sahaja.
- Relokasi `PROMPT_TEMPLATES` (kini `primary` sahaja) ke dalam `createXmlBatchPrompt`.
- Kemas kini komen/log yang menyebut "Fallback Prompt".
- Kemas kini [`scripts/verify-prompt-parity.js`](../scripts/verify-prompt-parity.js) ke ground truth baharu.

**LUAR SKOP (TIDAK DISENTUH):**
- **Stage 1** (baris 1599-1601): rotate key + fictitious header — kekal 100%.
- **`maskToxicWords`** (baris 1610-1674): kamus sanitasi penuh — kekal 100%.
- **Tier Fallback PROVIDER** (`tryFallback`, DeepL/secondary provider, termasuk laluan native SRT baris ~1985-2014) — ini redundansi tahap **provider**, bukan fallback **prompt** PROHIBITED_CONTENT. Kekal. *Sekiranya user mahu provider fallback turut dibuang, nyatakan semasa kelulusan.*
- `parseXmlBatchResponse` (v1.6.1 Smart Preamble Scrubber) — kekal.
- Semua mekanik batch/streaming/key-rotation/checkpoint — kekal.
- Backup sejarah `plans/prompt-refactor-backup/` — kekal sebagai rekod.

**Bentuk pertahanan PROHIBITED_CONTENT selepas pembedahan:**
- Stage 1: rotate key + fictitious header *(tidak berubah)*
- Stage 2: rotate key + fictitious header + `maskToxicWords` pada prompt & batch text *(swap prompt dibuang)*
- Tier 3: fallback provider (`tryFallback`) *(tidak berubah)*

---

## 3. LANJUKAN Pembedahan

### LANJUKAN A — Padam blok `PROMPT_TEMPLATES` skop modul (baris 31-70)

Padam keseluruhan banner + object (banner, `primary`, `fallback`, penutup `};`). Wilayah antara `const sleep` (baris 29) dan `tokenizeLanguageValue` (baris 71) kolaps bersih. Kandungan `primary` **disimpan dahulu** untuk relokasi byte-exact di LANJUKAN C.

### LANJUKAN B — Stage 2 nyah-fallback (baris ~1551-1681)

1. Komen protokol (baris 1553):
   - `// Stage 2: rotate key + fictitious header + word masking + fallback prompt` → `// Stage 2: rotate key + fictitious header + word masking`
2. Log Stage 2 (baris 1567):
   - `...Full Text Masking, and Fallback Prompt.` → `...and Full Text Masking.`
3. Padam baris 1604-1607 (`targetLabelForFallback`, `sourceLabelForFallback`, `primaryIntro`, `fallbackIntro`).
4. Baris 1676-1677:
   ```js
   // SEBELUM
   let softenedPrompt = pendingPrompt.replace(primaryIntro, fallbackIntro);
   softenedPrompt = maskToxicWords(softenedPrompt);
   // SELEPAS
   let softenedPrompt = maskToxicWords(pendingPrompt);
   ```
5. Baris 1678, 1680, dan log baris 1545 (`two-stage recovery (key rotate + prompt masking)`) — sudah tepat, kekal.

### LANJUKAN C — Relokasi `PROMPT_TEMPLATES` ke dalam `createXmlBatchPrompt`

Sisipkan SEBELUM `const introInstruction` (kini baris ~2125), satu blok bersama `CRITICAL ENFORCEMENT RULES`:

```js
    // ============================================================================
    // 🛠️ ZON TEMPLATE PROMPT (PRIMARY) — dipindahkan dari skop modul masuk blok
    // createXmlBatchPrompt (satu blok bersama Critical Enforcement Rules).
    // ============================================================================
    const PROMPT_TEMPLATES = {
      // Primary: untuk content normal
      primary: (targetLabel, sourceLabel) =>
        `Translate each <s id="N"> tag from ${sourceLabel || 'the source'} to ${targetLabel}. 
Rephrase into natural, conversational ${targetLabel} INSIDE each individual tag while strictly preserving tag boundaries and internal [br] markers.

RULES:
- Preserve meaning accurately. Do not add or remove information.
- Keep the same register as the source: informal → informal, formal → formal.
- Use consistent pronouns within the same scene/context.
- Do not over-formalize. Do not force slang if source is neutral.

WORD FORMATION RULES (STRICT):
- Only use words that exist in standard Malay (DBP).
- Do NOT invent new words or novel affixed forms.

REGISTER & CADENCE BENCHMARK (SPOKEN MALAY VIBE):
- Source: "Are you seriously telling me he had no idea what was going on?"
  Target: "Biar betul awak nak cakap dia langsung tak tahu apa yang tengah jadi?"
- Source: "Look, whatever happens, just don't do anything stupid, okay?"
  Target: "Dengar sini, walau apa pun yang jadi, jangan buat benda bodoh, okay?"
- Source: "If we wait until they're back, we won't get a turn."
  Target: "Kalau kita tunggu mereka balik, memang tak merasalah kita."
- Source: "I'm warning you."
  Target: "Aku bagi amaran."`
    };

    const introInstruction = PROMPT_TEMPLATES.primary(targetLabel, sourceLabel);
```

**Peraturan byte-exact (wajib):**
- Baris DALAM template literal kekal pada kedudukan kolum ASAL (baris `RULES:`, eksemplar dsb. kekal kolum-0; baris `Target:` kekal indent 2 ruang). Hanya baris **pembalut kod** (`const`, `primary:`, `};`) di-inden semula ke skop kaedah (4/6 ruang).
- **Trailing space** selepas `${targetLabel}. ` pada baris pembuka (warisan `5f9c307`) kekal sebijik.
- Tanda tangan arrow `(targetLabel, sourceLabel)` dan bentuk panggilan `PROMPT_TEMPLATES.primary(targetLabel, sourceLabel)` kekal — param anak panah membayangi const kaedah dengan nilai identik, sifar perubahan perlakuan.
- Komen `// Primary: untuk content normal` (gaya latest) kekal; `fallback` tiada lagi.

### LANJUKAN D — Kemas kini [`scripts/verify-prompt-parity.js`](../scripts/verify-prompt-parity.js)

Ganti semakan pariti-vs-`b1fca3f` (kini tidak relevan) dengan semakan struktur ground-truth baharu:
1. `const PROMPT_TEMPLATES` muncul **tepat 1×** dan kedudukannya **DALAM** `createXmlBatchPrompt` (selepas penanda definisi fungsi, sebelum `CRITICAL ENFORCEMENT RULES`).
2. **Sifar** rujukan `PROMPT_TEMPLATES.fallback` dan tiada kunci `fallback:` dalam object.
3. **Sifar** rujukan `PROMPT_TEMPLATES` pada skop modul (sebelum `class TranslationEngine`).
4. **Pariti byte prompt primary:** render `PROMPT_TEMPLATES.primary('Malay', 'English')` dan bandingkan dengan konstanta `EXPECTED_PRIMARY` (verbatim `5f9c307`) yang disematkan dalam skrip — penghadang mutations tidak sengaja pada prompt latest.

### LANJUKAN E — Verifikasi

1. `node --check src/services/translationEngine.js` — sintaks.
2. Grep penegasan: `PROMPT_TEMPLATES.fallback` = 0 hit; `const PROMPT_TEMPLATES` = tepat 1 hit (dalam `createXmlBatchPrompt`); `Dah gila`/`BLUNT, LITERAL` = 0 hit.
3. Jalankan `node scripts/verify-prompt-parity.js` — LULUS (ground truth baharu).
4. **`npm test`** — baseline minimum **92 PASS, 0 FAIL**.
5. Git commit tunggal (mesej pembedahan) + entri [`CHANGELOG.md`](../CHANGELOG.md).

---

## 4. Risiko & Mitigasi

| Risiko | Tahap | Mitigasi |
|---|---|---|
| Stage 2 tidak lagi tukar anchor register — model mungkin masih menolak content ekstrem | Rendah | Pertahanan berlapis kekal: rotate + header + masking; Tier 3 fallback provider masih menjadi jaring akhir |
| Drift byte semasa relokasi template (trailing space / indent baris dalaman) | Sederhana | `apply_diff` exact-match + `EXPECTED_PRIMARY` parity check di LANJUKAN D + E |
| Pembaziran objek `PROMPT_TEMPLATES` setiap panggilan batch | Maklumat | Satu objek kecil per batch — kosngosan negligible |
| Skrip pariti lama gagal selepas pembedahan | Dijangka | Dilanggan semula dalam LANJUKAN D |
| Regresi ujian bergantung teks prompt | Tersingkir | Disemak: 0 padanan dalam `*.test.js` |

---

## 5. Checklist Pelaksanaan

- [x] LANJUKAN A — padam blok skop modul (baris 31-70)
- [x] LANJUKAN B — Stage 2 nyah-fallback (komen, log, baris 1604-1607, 1676-1677)
- [x] LANJUKAN C — relokasi `PROMPT_TEMPLATES` (primary sebijik `5f9c307`) ke `createXmlBatchPrompt`
- [x] LANJUKAN D — kemas kini `scripts/verify-prompt-parity.js`
- [x] LANJUKAN E1 — `node --check` + grep penegasan
- [x] LANJUKAN E2 — parity script LULUS (5/5 PASS + byte-match trailing space vs `5f9c307`)
- [x] LANJUKAN E3 — `npm test`: **105 PASS, 0 FAIL** (1 skipped)
- [x] LANJUKAN E4 — commit + CHANGELOG

### Keputusan pembedahan
- `PROMPT_TEMPLATES` kini tinggal kunci `primary` sahaja; kedudukan baharu: DALAM `createXmlBatchPrompt`, satu blok dengan `CRITICAL ENFORCEMENT RULES (ZERO TOLERANCE)`.
- Stage 2 kini: rotate key + fictitious header + `maskToxicWords` — tiada swap prompt; `maskToxicWords` diaplikasikan terus ke atas `pendingPrompt`.
- Prompt primary disahkan byte-identical dengan `5f9c307` (sentinel render 1,168 chars; trailing-space warisan kekal).
- [`scripts/verify-prompt-parity.js`](../scripts/verify-prompt-parity.js) ditulis semula: 5 semakan struktur + byte-parity — semua PASS.
- Tier fallback provider (`tryFallback`, native SRT routing) tidak disentuh.

# Plan Pembedahan: [br] Parity Enforcement (Post-AI Output)

**Tarikh:** 2026-10-23
**Status:** DRAFT — menunggu kelulusan Owner
**Skop Domain:** Backend sahaja (`src/services/`, `src/utils/`) — tiada UI/frontend terlibat

---

## 1. Latar Belakang & Justifikasi

Audit 2026-10-23 mengesahkan kontrak `[br]` (line break marker) hanya dipegang oleh
**system prompt** (`src/services/prompts/trinity/translation/core.js` — rule "same count
of `[br]`"). Tiada enforcement programatik selepas AI membalas.

**Kedudukan semasa:**

| Fasa | Lokasi | Mekanisme | Enforcement |
|---|---|---|---|
| Pre-process | `preprocessSubtitleForAI()` (`src/handlers/subtitles.js:5705`) | Buang tag HTML/ASS termasuk `<br>` | Ada (regression test) |
| Payload build | `translationEngine.js:2831/2844/2865/2905` | `\n` → ` [br] ` (mekanikal) | N/A (deterministik) |
| AI translate | System prompt rule 6 | Kekal jumlah `[br]`, reposition dibenarkan | **TIADA** (hanya arahan) |
| Post-AI | `cleanTranslatedText()` (`translationEngine.js:3501`) stage 4 (line 3600) | `[br]`/`<br>`/`<br>` → `\n` | N/A |

**Flaw:** Jika AI hilangkan/tambah `[br]`, line break subtitle hilang/tambah secara
senyap. `cleanTranslatedText()` cuma tukar apa yang ada — tiada perbandingan dengan sumber.

---

## 2. Matlamat Pembedahan

1. Validasi kiraan `[br]` output AI **vs** sumber, per-slot, programatik.
2. Auto-repair deterministik bila mismatch — tanpa panggilan API tambahan (zero kos token).
3. Observability: log + stat supaya Agent Inspector / Owner boleh nampak kadar drift.
4. Zero-regression: baseline `npm test` mesti kekal (0 FAIL, max 1 SKIP, total monotonic).

---

## 3. Reka Bentuk Teknikal

### 3.1 Fungsi baru: `reconcileBrParity(sourceText, translatedText)`

Lokasi: method baharu dalam class `TranslationEngine`, diletakkan bersebelahan
`cleanTranslatedText()` (~line 3499, sebelum definisi `cleanTranslatedText`).

**Logik:**

```
countSrc = bilangan '\n' dalam normalizeBrMarkers(sourceText)
countOut = bilangan '\n' dalam normalizeBrMarkers(translatedText)

normalizeBrMarkers(t) = t.replace(/\s*(?:\[br\]|<br\s*\/?>|<br\s*\/?>)\s*/gi, '\n')
                        (regex sama dengan stage 4 sedia ada — jangan duplikasi, ekstrak
                         sebagai konstanta module-level BR_MARKER_PATTERN)

Jika countOut === countSrc → return translatedText (passthrough, tiada kos)

Jika countOut > countSrc (AI tambah line break):
  - Kekalkan. Lebih banyak break jarang rosak tayangan; tukar gred log sahaja (debug).

Jika countOut < countSrc (AI hilangkan break — kes utama):
  - Auto-repair: rebah teks output kepada countSrc+1 segmen pada sempadan ayat
    (`. ? ! …`) yang paling seimbang panjang, sisipkan '\n'.
  - Jika output tiada sempadan ayat yang mencukupi → sisip '\n' pada offset purata
    (fallback dumb-split).
  - Pulihara: JANGAN potong perkataan tengah (split pada ruang terdekat offset).
```

**Kontrak return:** `string` (sentiasa selamat — jika kedua-dua input bukan string,
return `translatedText` as-is). Deterministik, pure, tiada I/O.

### 3.2 Integrasi ke dalam `cleanTranslatedText(text, sourceText)`

Tukar signature `cleanTranslatedText(text)` → `cleanTranslatedText(text, sourceText)`
dengan `sourceText` **optional** (default `undefined` = tingkah laku semasa, zero
breaking change untuk semua caller sedia ada yang tidak dihantar sumber).

Insert selepas stage 4 (line 3600, selepas penukaran `[br]` → `\n`):

```js
if (typeof sourceText === 'string' && sourceText.length > 0) {
    cleaned = this.reconcileBrParity(sourceText, cleaned);
}
```

**Kenapa selepas stage 4:** penukaran `[br]` → `\n` mesti selesai dahulu supaya
kiraan kedua-dua belah berada dalam unit `\n` yang sama.

### 3.3 Caller yang perlu dihantar `sourceText` (fokus pembedahan)

Hanya 5 tapak reconciliation di mana teks sumber masih tersedia:

| Fail:Baris | Perubahan |
|---|---|
| `src/services/translationEngine.js:1072` | `this.cleanTranslatedText(translated.text \|\| original.text, original.text)` |
| `src/services/translationEngine.js:1606` | `this.cleanTranslatedText(translated.text \|\| orig.text, orig.text)` |
| `src/services/translationEngine.js:3363` | `this.cleanTranslatedText(entry.text \|\| original.text, original.text)` |
| `src/utils/parallelTranslation.js:92` | `engine.cleanTranslatedText(entry.text \|\| '', /* source */)` — sumber diperlukan dari batch entry sepadan; semak skop batch loop semasa pembedahan |
| `src/utils/parallelTranslation.js:262` | `engine.cleanTranslatedText(translated.text \|\| original.text, original.text)` |

Caller yang **kekal tanpa sumber** (kosong — tingkah laku semasa):
- `translationEngine.js:1025` (fallback path tanpa original mapping jelas)
- `src/services/providers/googleTranslate.js` (punca berbeza, bukan AI slot parity — JANGAN sentuh dalam pembedahan ini; Google Translate output tiada kontrak `[br]`)

### 3.4 Observability

- Log `debug` sahaja (bukan info/warn — elak spam log pada batch besar): tag
  `[TranslationEngine]` + `brParityRepaired: <slot-id?>` — hanya bila repair berlaku.
- Counter memory module-level: `brParityStats = { checked, repaired, addedKept }` —
  exposure ke observability Agent Inspector sedia ada **DIKEMPITKAN sebagai phase 2**
  (elak sentuh kontrak `agentInspector` tanpa mandat tambahan).

---

## 4. Fail Terlibat (boundary keras)

| Fail | Jenis Perubahan |
|---|---|
| `src/services/translationEngine.js` | +`BR_MARKER_PATTERN` module const, +`reconcileBrParity()` method, signature `cleanTranslatedText(text, sourceText?)`, hook stage 4.5, 2 caller line (1072, 1606, 3363) |
| `src/utils/parallelTranslation.js` | 2 caller line (92, 262) — laluan `original.text` |
| `src/services/translationEngine-brparity-regression.test.js` | **FAIL BARU** — regression test kontrak parity |
| `CHANGELOG.md`, `package.json`, `docs/SESSION_LEDGER.md` | 8-step release pipeline (jika Owner luluskan release) |

**TIDAK disentuh:**
- `preprocessSubtitleForAI()` (`src/handlers/subtitles.js`) — kontrak sedia ada sudah betul.
- `src/services/prompts/trinity/translation/core.js` — prompt rule 6 kekal (belt & suspenders).
- `agentInspector.js` — fasa 2 berasingan.
- Semua fail `public/**` / pageGenerator — tiada UI.

---

## 5. Test Plan (Regression Baru)

Fail: `src/services/translationEngine-brparity-regression.test.js` (corak `node:test`
projek, sama seperti `subfaber-beta-run7-regression.test.js` yang sudah instantiat
`TranslationEngine` dengan provider mock).

Kes ujian:
1. **Parity match** — 2 `[br]` input, 2 output → teks tidak diubah.
2. **AI hilang 1 `[br]`** — 2 input, 1 output → auto-repair sisip 1 `\n` pada sempadan ayat; kiraan output = input.
3. **AI hilang SEMUA `[br]`** — 3 input, 0 output → repair penuh 3 baris; tiada perkataan terpotong.
4. **AI tambah `[br]`** — 1 input, 2 output → kekal (no-op), tiada pemotongan.
5. **AI balas `<br>` / `<br>`** bentuk lain — normalisasi + parity tetap betul.
6. **sourceText undefined / kosong** — passthrough, tingkah laku semasa (back-compat).
7. **Teks tanpa sempadan ayat** (satu ayat panjang tiada tanda baca) — fallback dumb-split, tiada potong tengah perkataan.
8. **Unit penukaran `\n{2,}` collapse tidak bertembung** — repair hasil akhir tidak ada `\n\n`.
9. **Sanity jumlah kiraan** — `reconcileBrParity('a\nb\nc', 'abc')` → 2 `\n` dalam output.

**Baseline gate:** `npm test` mesti kekal 0 FAIL / max 1 SKIP; jumlah total test
bertambah secara monotonic (dari ~+9 kes baru) vs baseline terkini `docs/SESSION_LEDGER.md`.

---

## 6. Risiko & Mitigasi

| Risiko | Mitigasi |
|---|---|
| Auto-repair memotong perkataan | Split hanya pada ruang/sempadan ayat — ujian kes 3 & 7 kunci ini |
| Repair merosakkan output AI yang sengaja merge 2 baris pendek jadi 1 (quality decision AI) | Ini trade-off yang diterima: subtitle line-break ialah struktur tayangan, bukan gaya — Owner boleh matikan via config phase 2 jika perlu |
| Caller luar lulus `sourceText` salah slot (index off-by-one di `parallelTranslation.js`) | Ujian unit pada `parallelTranslation` path + hanya hantar bila `original.text` jelas dalam scope loop yang sama |
| Signature change pecahkan caller 3rd party | Param kedua optional; semua caller sedia ada kekal valid |
| Log spam pada batch 500+ entri | Log level `debug` sahaja + hanya bila repair actual berlaku |

---

## 7. Urutan Pelaksanaan (8 langkah selepas kelulusan)

1. Ekstrak `BR_MARKER_PATTERN` + tambah `reconcileBrParity()` di `translationEngine.js`.
2. Tukar signature `cleanTranslatedText(text, sourceText?)` + hook stage 4.5.
3. Update 5 caller (2 dalam `translationEngine.js` merge-loop, 1 di 3363, 2 di `parallelTranslation.js`).
4. Tulis `translationEngine-brparity-regression.test.js` (9 kes).
5. `npx jest`/`node --test` fail baru secara targeted dahulu.
6. `npx prettier --check .` + `npx eslint .` + `npm test` penuh.
7. (Bila Owner arahkan release) 8-step pipeline penuh: SemVer → CHANGELOG → cache-buster → quality gate → graphify → SESSION_LEDGER → commit/push → `gh run watch`.
8. Laporkan kadar drift sebenar dari log debug (opsional, bila data tersedia).

**Estimasi saiz diff:** ~150 baris kod + ~180 baris test.

---

## 8. Keputusan Menunggu Owner

- [ ] Luluskan pelaksanaan pembedahan ini?
- [ ] Auto-repair ON secara default (cadangan: YA), atau log-only dahulu untuk ukur kadar drift sebenar sebelum repair aktif?
- [ ] Phase 2 (stat Agent Inspector + config kill-switch) dijadikan item backlog berasingan?

# 🕵️ POSTMORTEM FORENSIK: ANOMALI OFF-BY-ONE 4/4 BATCH (SubMaker v1.6.0)

**Tarikh:** 23 Sep 2026 · **Kes:** Shine.on.Me.2025.S01E20 — 604/604 PERFECT, 4 recovery, off-by-one konsisten
**Status:** FORENSIK SELESAI + PLAN FIX (menunggu kelulusan)

---

## 1. ROOT CAUSE — Mekanisme Langkah Demi Langkah (Disahkan 100%)

Hipotesis anda **DITERIMA sepenuhnya** — dengan satu pembetulan kecil: bukan entri pertama yang "terpromote", tetapi **entri KEDUA setiap batch**. Berikut rantaian kejadian persis:

### Langkah 1 — Model berhenti selepas tag pertama, lalu "meneruskan naratif"

- `gemini-3-flash-preview` ialah model **>3.1** → `isPrefillSupported() === false` ([gemini.js:543-554](src/services/gemini.js:543) — `geminiVersion <= 3.1`). Jadi **tiada assistant prefill** untuk model ini: user prompt berakhir dengan trailing anchor `[OUTPUT_FORMAT]\n<s id="201">` dan model mula dari kosong.
- Model obeyed rule 7: ia TIDAK mengulang `<s id="201">` — ia terus menulis **isi slot pertama**, menutupnya `</s>`, kemudian... **tergelincir keluar dari protokol**: ia menulis entri seterusnya sebagai **teks bebas tanpa tag** (continuation drift), kemudian "sedar diri" dan menyambung semula protokol `<s id="202">`, `<s id="203">`, ... hingga akhir batch.
- **Bukti dari log batch 1:** chatter scrubbed = `"ADAPTASI DARI NOVEL KARYA GU MAN, <i>SHINE ON ME</i></s>"` — perhatikan **`</s>` berada DALAM chatter**. Ini isyarat mustahil untuk "thinking leakage": teks itu berakhir dengan tag penutup slot. Ia ialah **terjemahan sah slot pertama, ditulis tanpa tag pembuka** — diikuti slot 202+ yang normal.

### Langkah 2 — Scrubber v1.6.0 memotong PADA `<s` pertama

- [`parseXmlBatchResponse()`](src/services/translationEngine.js:2135-2144): `firstTagIdx = cleaned.indexOf('<s')` → `cleaned.slice(firstTagIdx)` membuang segmen `"ADAPTASI... </s>"`.
- Ini **membuang terjemahan sah slot pertama** ke sampah. Entri #201 kini tiada dalam output.

### Langkah 3 — Anchor restoration "mencuci tangan" dengan ID yang salah

- Selepas slice, string bermula dengan `<s id="202">`. Anchor restoration ([translationEngine.js:2149-2151](src/services/translationEngine.js:2149)) hanya aktif jika string TIDAK bermula `<s` — jadi ia **tidak melakukan apa-apa**. ID #201 semakin tenggelam.

### Langkah 4 — Parser & regex sahkan corak off-by-one

- Regex super-XML memetakan 202→index 1, 203→index 2... 400→index 199 = **199/200 entri**. `validIds.has(201)` benar tetapi tiada tag ber-ID 201 dalam teks → index 0 kosong.
- [`alignTranslatedEntries()`](src/services/translationEngine.js:2247): index 0 bertext sebenar (bukan untranslatable) → direkod sebagai missing → **two-pass recovery menterjemah semula 1 entri**.

### Mengapa DETERMINISTIK 4/4 walau key/kandungan berbeza

Pencetusnya adalah **struktur batch, bukan kebetulan stokastik**:
1. **Slot pertama setiap batch adalah baris khas**: batch 1 slot pertama = baris pembukaNCERITA ("Adapted from a novel..."), batch 4 = 4 entri ringkas (slot pertama pendek, "Your eyes are so red..."). Baris meta/pembuka inilah yang model rawan "melangkau tag" — ia merasakan teks sebegini sebagai **prolog**, bukan dialog dalam protokol, lalu menaipnya "luar sistem" dahulu.
2. **Selepas entri pertama, semuanya masuk orbit** — kesalahan hanya berlaku pada transisi "mula dari kosong → slot pertama". Selepas slot pertama selesai, model sudah dalam mod XML dan 199 slot seterusnya sempurna. Itulah sebabnya **TEPAT 1** entri hilang setiap kali, tiada lebih/kurang.
3. `thinkingLevel=minimal` ([log] "thinkingLevel=minimal") bermakna **tiada ruang dalaman untuk model "berfikir dulu"** sebelum token pertama — impuls pertama (menaip terjemahan baris pembuka secara bebas) terus dikeluarkan tanpa kawalan rehat reasoning. `temperature=0.2` menjadikan laluan gelincir ini **hampir deterministik** bukannya rawak — temperature rendah = model mengulang tabiat pengeluaran yang sama pada setiap batch.

**Verdict #1:** Ia BUKAN thinking leakage, BUKAN hallucination, dan BUKAN config 503. Ia adalah **continuation-drift pada slot pertama + scrubber yang membuang output sah** — rantaian kegagalan 2 pihak: model gelincir sekali, parser kita mencekik selebihnya.

## 2. Adakah ini Regression V2?

**Separuh ya — jujur diakui:**

| Komponen | Zaman backup | v1.5.9 | v1.6.0 |
|---|---|---|---|
| Prefill ≤3.1 | Ada | Ada | Ada |
| Prefill >3.1 | Tiada (model baru wujud) | Tiada | Tiada |
| Scrubber preamble | **Tiada** | **Tiada** | **ADA (baru)** |
| Mismatch handler | Ada | Ada | Ada |

- Pada zaman backup, model TIDAK pernah berdepan `gemini-3-flash-preview` (>3.1, tiada prefill). DESYNC zaman itu berlaku pada model ≤3.1 dengan prefill aktif.
- **Scrubber B3 ialah tambahan baharu v1.6.0**. Tanpa scrubber, gelinciran yang sama akan menghasilkan satu tag `<s>` tergantung (teks tanpa pembuka) — parser regex sedia ada akan **abaikannya secara senyap** dan mismatch tetap berlaku. Jadi kesilapan asasnya (model drift) SEDIA ADA; **scrubber cuma menjadikannya kelihatan dan terukitertatau** — sebenarnya ia menambah satu langkah destruktif (membuang output sah).

## 3. CADANGAN FIX — 3 Pilihan Dengan Trade-off

### Pilihan A (DISYOR — "Smart Recovery Scrubber"): Tukar scrubber daripada "buang" kepada "recover"

- **Fix di parser sahaja** — tiada perubahan prompt, tiada perubahan config, risiko sifar pada laluan model.
- Logik baharu: jika chatter mengandungi `</s>` (tanda ia adalah slot sah tanpa pembuka):
  1. Buang `</s>` dari hujung chatter, balut semula sebagai `<s id="${firstId}">${chatter}</s>`
  2. Lanjutkan pengiraan `firstId` → entri seterusnya yang dijangka bukan lagi `batch[0]` tetapi `batch[1]`
  3. Jika chatter TIDAK mengandungi `</s>` (chatter sebenar — "Here is the translation:"), buang seperti sekarang (tingkah laku Subtitle Edit asal)
- **Trade-off:** Kos/latensi two-pass recovery 1 entri hilang; bonus `MISMATCH_RETRY` tiada lagi dalam Telegram report (status jadi PERFECT tanpa incident); mapper regex tidak perlu tahu apa-apa.
- **Risiko:** Chatter >200 chars yang mengandungi `</s>` (model gelincir pada >1 slot awal) — dilindungi dengan guard: hanya recover jika nombor `</s>` dalam chatter ≤ 1 (gelincir tunggal).

### Pilihan B (MENUNGGU — Prompt-side: assistant prefix untuk >3.1)

- Letak `<s id="${startId}">` di hujung, kemudian arahkan... ia sudah diarahkan dan gagal. Satu-satunya prompt-side fix yang benar-benar mengunci ialah **pseudo-prefill dalam contents** (user prompt berakhir dengan `[OUTPUT_FORMAT]\n<s id="${startId}">` DAN ditambah baris "Begin:" selepasnya) — tetapi ini mengubah struktur backup dan terbukti rapuh (model 3.x reasoning boleh abaikan).
- **Trade-off:** Sentuh resipi rahsia = risiko merosakkan yang sudah berfungsi 99.8% (603/604 tanpa recovery). TIDAK DISYOR pada fasa ini.

### Pilihan C (MENOLAK — Config: naikkan thinkingLevel)

- `minimal → low` akan memberi model ruang "berfikir" sebelum token pertama dan secara teori mengurangkan drift.
- **Trade-off:** Kos thought tokens naik pada SEMUA batch (~1.2-2x output tokens), latensi naik, dan laporan FinOps anda ($0.07 → ~$0.10+). Masalah hanya berlaku pada 1 slot per batch — membayar kos global untuk 0.16% kes = bodoh. **DITOLAK.**

### 503 Batch 4: BUKAN berkaitan

503 single-attempt dengan retry berjaya selepas 2456ms ialah transient upstream (server Gemini overloaded) — backoff eksponen berfungsi seperti direka. Tiada tindakan.

## 4. TELEMETRI TAMBAHAN (Untuk Sahkan Hipotesis Pada Larian Seterusnya)

1. **Klasifikasi chatter dalam log scrubber** — tukar mesej WARN kepada 2 kategori:
   - `Preamble CHATTER (discarded): "..."` — bila tiada `</s>` (chatter sebenar)
   - `Preamble UNTAGGED SLOT (recoverable): ends-with-close=true, firstId=${firstId}` — bila `</s>` hadir (slot pertama tanpa pembuka)
2. **Counter baru** di `translationStats`: `untaggedFirstSlotCount` — masuk ke Telegram report sebagai baris `🎯 Untagged-first-slot events: N`.
3. **Raw-tail dump** (DEBUG, first 300 chars) untuk batch yang mengalami untagged slot — memudahkan audit manual corak gelinciran model tanpa mengaktifkan logging penuh.
4. **Post-recovery verify:** selepas smart-recovery Pilihan A, log `[TranslationEngine] Smart-recovery: slot ${firstId} rebuilt from untagged preamble (${len} chars)` — supaya kesan fix boleh dibezakan daripada two-pass recovery lama dalam log.

---

## 5. KESIMPULAN

- **Entri pertama TIDAK "terpromote"** — ia ditulis model sebagai **slot sah tanpa tag pembuka** (continuation drift pada transisi kosong→slot pertama, didorong baris khas + thinkingLevel minimal + temperature rendah yang deterministik).
- **Bukti utama:** `</s>` dalam chatter 4/4 batch + batch 1 chatter ≈ entri 0 akhir + off-by-one TEPAT 1 + pemulihan tepat 1.
- **Fix disyorkan:** Pilihan A (smart-recovery scrubber, parser-only, tiada sentuhan prompt/config) + telemetry #1-#4. Batch akan pergi dari "PERFECT dengan 4 MISMATCH_RETRY" kepada "PERFECT tanpa incident" — dan dua-pass recovery kekal sebagai lapisan terakhir untuk kes-kes jangkaan di luar corak ini.

**Menunggu kelulusan untuk melaksanakan Pilihan A + telemetry.**

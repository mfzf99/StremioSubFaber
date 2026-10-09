# Laporan Ground Truth: Kimi K3 vs Gemini 3 Flash — Agent Preflight (Fasa 0)

> Tarikh eksperimen: 2026-10-09 · Harness: `.tmp-bench-run.js` / `.tmp-bench-analyze.js` (probe, tidak di-commit)
> Korpus: `real-srt.srt` — drama Korea "Happiness" E1, 745 entri, 25,302 aksara dialog
> Nama rasmi komponen mengikut `docs/ENGINE_COMPONENT_TAXONOMY.md`

## 1. Soalan & Metodologi

**Soalan owner:** Antara Kimi K3 vs Gemini 3 Flash, siapa lebih padu untuk kerja Agent Preflight?

**Reka bentuk kesamarataan (diluluskan owner — "kau buat lah keputusan sendiri"):**

| Unsur | Pelaksanaan |
|---|---|
| Korpus | SRT sebenar sama (Happiness E1) — bukan sintetik |
| Prompt | Laluan produksi **verbatim**: `parseSRT()` → `sampleEntriesForPreflight()` → `buildPreflightRawText()` → `buildPreflightPrompt()` → `splitStructuredPrompt()`. System 7,119 aksara + user 25,399 aksara — **bait identik** kepada kedua-dua model |
| Kimi K3 | Gateway rootsys.cloud, muatan god-tier 4-kunci produksi `{ model, messages:[system,user], stream:true, temperature:0.0 }` — extra params DIGUGURKAN (empirikal Fasa B lepas: pencetus overthinking) |
| Gemini 3 Flash | REST v1beta `generateContent` (laluan produksi `src/services/gemini.js`), `systemInstruction` **top-level** (protokol backend #1), temp 0.0, `thinkingConfig.thinkingLevel:'low'` ×3 run + `'high'` ×2 run |
| Validator | `parsePreflightResponse()` **produksi** — kesahan dinilai pada pintu masuk sebenar enjin, bukan JSON.parse telanjang |
| Ulangan | 3 run per model (metrik stabiliti Jaccard), gap 2.5-3s |
| Keys | 10 key Gemini free-tier owner; rotation automatik atas 429/503/403 (tiada rotation diperlukan — semua first-try; key#0 digunakan kesemua run low) |

**Parameter temp 0.0 (soalan owner):** Dikehendaki dan **disahkan selamat secara empirikal** untuk kedua-dua pihak. Keluarga `gemini-3-flash-preview` = LEGACY (rujuk `plans/gemini-sampling-ground-truth-2026.md`) — API masih menerima `temperature`; tiada gelung/degradasi diperhatikan pada 3/3 run. Syor Google 1.0 kekal sebagai nota risiko, bukan blocker.

## 2. Keputusan Utama

### 2.1 Latency (Fasa 0 ialah fasa BLOCKING — jumlah ini menahan permulaan terjemahan)

| Model | Run 1 | Run 2 | Run 3 | Purata | TTFT |
|---|---|---|---|---|---|
| Kimi K3 | 134.7s | 274.9s | 212.5s | **207.4s** | 109.9s / 246.7s / 190.6s |
| Gemini 3 Flash (low) | 6.6s | 6.9s | 5.7s | **6.4s** | n/a (non-stream) |
| Gemini 3 Flash (high) | ABORT 300s | ABORT 300s | — | **DQ** | — |

**Gemini low 32× lebih laju.** Kimi TTFT 110-247s bermakna streaming SSE tidak menyelamatkan UX — pengguna menunggu 2-4 minit bar HUD "Analyzing plot..." bergerak. Gemini high DQ kedua-dua run (siling Caddy 300s) — **thinkingLevel WAJIB low** jika Gemini dipilih; `high` (lalai Google bagi model ini) tidak practical untuk Fasa 0.

### 2.2 Kesahan & Metrik 4-Tiang (parser produksi)

| Model | Run | theme(ch) | terms | chars | nullCanon | credits |
|---|---|---|---|---|---|---|
| Kimi K3 | 1 | 755 | 21 | 10 | 4/10 (40%) | 1 |
| Kimi K3 | 2 | 664 | 20 | 10 | 2/10 (20%) | 1 |
| Kimi K3 | 3 | 612 | 16 | 10 | 4/10 (40%) | 1 |
| Gemini low | 1 | 499 | 10 | 10 | 0/10 (0%) | 1 |
| Gemini low | 2 | 489 | 11 | 10 | 0/10 (0%) | 2 |
| Gemini low | 3 | 499 | 10 | 10 | 0/10 (0%) | 1 |

- **Kesahan JSON: Seri 3/3 vs 3/3** — kedua-dua model lulus parser resilient tanpa gagal.
- **Terms: Kimi lebih kaya** (16-21/run, union 29) vs Gemini (10-11/run, union 12). Inti kritikal berkongsi: *Mad Human Disease, CDSCHQ, Seyang Forest Le Ciel, public official dorm, Competitiveness Reinforcement Team, special provision, public rentals*. Istilah Kimi-sahaja: *Glock, biohazard suit, COVID-19, rabies, confidentiality oath, Myungwon Rice Cake Shop, Fire Prevention Act*.
- **Noise: Seri 2/run kedua-duanya** (*Next*, *SOU*) — arahan REASONING-DISCIPLINE tidak menghapuskan istilah generik pada mana-mana model.
- **nullCanonical: Kimi berhati-hati, Gemini agresif.** Kimi memulangkan NULL pada 20-40% watak (disiplin FACT-VS-INFERENCE). Gemini **mengisi 100%** — termasuk yang tanpa bukti (lihat §2.4).

### 2.3 Stabiliti (Jaccard antara run)

| Metrik | Kimi K3 | Gemini low |
|---|---|---|
| terms | 0.58 / 0.54 / 0.44 | **0.75 / 1.00 / 0.75** |
| characters | **1.00 / 1.00 / 1.00** | 0.82 / 1.00 / 0.82 |

**Gemini lebih stabil pada terms** (R1≡R3 hampir identikal — temp 0.0 menghasilkan determinisme kuat; R2 menyimpang sedikit = nondeterminisme server-side MUX, bukan artefak suhu). **Kimi lebih stabil pada characters** (nama penuh konsisten merentas semua run). Konsensus inter-model: terms 0.28 (rendah — kumpulan istilah berbeza), characters 0.62.

### 2.4 Audit Forensik Halusinasi (FACT-VS-INFERENCE)

| Watak | Bukti tekstual dalam SRT | Kimi | Gemini | Verdict |
|---|---|---|---|---|
| "Lieutenant Colonel Han Tae-seok" | "Hello, Lieutenant Colonel Han Tae-seok." | Lock | Lock | Sah kedua-duanya |
| "Lawyer Kook Hae-seong" | '"Lawyer Kook Hae-seong,' | Lock | Lock | Sah kedua-duanya |
| "Sae-bom" (nama pendek) | "Sae-bom, are you okay?" (3 vocative) | Guna nama penuh "Yoon Sae-bom" | Guna "Sae-bom" | **Kedua-duanya sah** — kedua bentuk wujud dalam teks |
| "Min-ji" | 1 baris sahaja: "Hey, Min-ji, wash your hands first." | NULL (2/3 run), "Puan Min-ji" (1/3 run) | "Cik Min-ji" (3/3 run) | **Inferens sempadan** — jantina/usia TIDAK eksplisit. Gemini teka setiap kali; Kimi berhati-hati (tapi run-2 turut meneka sekali) |
| **"Park Seo-yoon"** | **0 padanan** (semak `seo-yoon`/`seo yoon`/`seoyoon`/`seoyun` = 0) | Tidak pernah keluar | Keluar pada gemlow-2 + "Cik Park Seo-yoon" | **HALUSINASI Gemini** — kebocoran pengetahuan latihan (watak sebenar drama) melanggar mandat Anti Upstream Error Propagation |

**Kadar halusinasi watak: Kimi 0/30 entri; Gemini 1/30 entri.** Disiplin NULL Kimi turun naik (So-yoon: NULL→Puan→NULL merentas run) — berhati-hati tetapi **tidak konsisten** tentang bila berhati-hati.

### 2.5 Kualiti Theme

- **Kimi (612-755 aksara):** spesifik & boleh-aksi — menamakan *SOU, Yoon Sae-bom, Corporal Jung Yi-hyun, CDSCHQ, Han Tae-seok, contract marriage, housing points, Seyang Forest Le Ciel, class tensions*.
- **Gemini (489-499 aksara):** generik — "a tactical agent and a detective", "a failed pharmaceutical drug" (tanpa nama *Next*), tema abstrak "survival, social hierarchy". **Tiada nama watak dalam theme.**

Theme Kimi membawa lebih banyak konteks boleh-tindak kepada Agent Translation; theme Gemini selamat tetapi kurang bernas.

## 3. VERDICT — Siapa Lebih Padu?

### Papan skor

| Dimensi | Pemenang | Marginal |
|---|---|---|
| Latency fasa blocking | **Gemini** | 32× (6.4s vs 207.4s) |
| TTFT | **Gemini** | Kimi 110-247s tidak wajar |
| Kesahan JSON (parser produksi) | Seri | 3/3 vs 3/3 |
| Stabiliti terms | **Gemini** | Jaccard 0.75-1.00 vs 0.44-0.58 |
| Stabiliti characters | **Kimi** | 1.00 vs 0.82-1.00 |
| Kekayaan terms | **Kimi** | union 29 vs 12 |
| Theme spesifik | **Kimi** | nama entiti vs generik |
| Disiplin NULL (FACT-VS-INFERENCE) | **Kimi** (nipis) | berhati-hati vs mengisi 100% |
| Halusinasi | **Kimi** | 0/30 vs 1/30 (Park Seo-yoon) |
| Risiko operasi upstream | **Gemini** | temp 0.0 stabil, tiada kuiri gateway; Kimi variance TTFT besar |

### Keputusan

**Untuk KERJA AGENT PREFLIGHT sebagai operasi: GEMINI 3 FLASH (thinkingLevel low) LEBIH PADU** — 32× lebih laju pada fasa blocking, output 100% sah pada parser produksi, terms stabil, dan tingkah laku API boleh-diramal tanpa keanehan gateway.

**UNTUK KUALITI BIBLE 4-TIANG: KIMI K3 masih lebih baik** — istilah lebih kaya (terutama istilah teknikal/domain), theme jauh lebih spesifik dengan nama entiti, dan disiplin NULL lebih selaras dengan mandat FACT-VS-INFERENCE.

**Kompromi realiti:** Gemini membawa 2 risiko kualiti yang mesti diurus jika ditukar:
1. **Halusinasi nama watak dari pengetahuan latihan** (Park Seo-yoon) — memerlukan post-filter bukti-textual (nama watak WAJIB wujud dalam dialog SRT) atau pengukuhan klausa bukti dalam prompt P1.
2. **Pengagakan gelaran tanpa bukti** (0% NULL — "Cik Min-ji" atas 1 vocative tunggal).

### Rekomendasi berstrata

1. **Status quo (kimi-k3) dikekalkan** jika misi SubFaber mengutamakan bible berkualiti tinggi dan kesabaran pengguna batch upload boleh diterima (TTFT 2-4 min). Preflight non-blocking + fail-open sedia ada menampung kegagalannya.
2. **Pertukaran kepada Gemini 3 Flash low** wajar jika/ Apabila UX latency menjadi keutamaan — tetapi WAJIB disertai: (a) `thinkingLevel:'low'` dikunci (high = DQ 300s), (b) post-filter halusinasi watak (padanan bukti dalam SRT), (c) penerimaan bible lebih kurus (terms ~10 vs ~20).
3. **Jangan gunakan Gemini 3 Flash `high` untuk Fasa 0** — 2/2 timeout pada siling Caddy 300s walaupun dengan `maxOutputTokens` 65536.
4. **Temp 0.0 disahkan selamat** untuk kedua-dua model pada tugas ini (LEGACY family; tiada gelung; determinisme R1≡R3 pada Gemini).

## 4. Aset Eksperimen

- Respons mentah + bible parsed: `.tmp-bench/resp-kimi-{1,2,3}.json`, `resp-gemlow-{1,2,3}.json`
- Laporan analisis penuh: `.tmp-bench/bench-report.txt` (124 baris — audit canonical & noise per run)
- Log pelaksanaan: `.tmp-bench/run-log.txt`
- Semua fail `.tmp-bench*` = artefak probe, TIDAK di-commit (gitignored); dokumen ini adalah rakaman kekal.

## 5. Nota Metodologi untuk Eksperimen Lanjutan

- Korpus 1 episod sahaja; drama ensemble lebih besar (100+ watak) mungkin mengubah kadar halusinasi/kekayaan berbeza.
- `thinkingLevel:'minimal'` belum dicuba pada `gemini-3-flash-preview` — kandidat eksperimen susulan jika low masih dianggap lambat (5.7-6.9s sudah sangat laju, ROI minimal rendah).
- Rotation key tidak teruji (semua run first-try pada key#0) — mekanisme wujud dalam harness untuk eksperimen akan datang.


## 6. Susulan Owner (Sesi Same-Day): Streaming, Model Baru 3.5/3.8, dan "Dua Dalam Satu"

Harness: `.tmp-bench-followup.js` (probe). Korpus/prompt/parser identik. Keluarga STRICT (3.5/3.8) dihantar TANPA parameter sampling (kontrak getModelFamily — API menolak temp); LEGACY 3-flash-preview dengan temp 0.0.

### 6.1 Q1 — stream ON atau OFF untuk Fasa 0?

| Konfigurasi | Total | TTFT | Nota |
|---|---|---|---|
| 3.5-flash medium, non-stream | 18.0s | n/a | JSON penuh tiba sekali |
| 3.5-flash medium, stream | 15.4s | 13.6s | Streaming hampir tiada nilai — TTFT ≈ total |
| 3-flash-preview high + stream | 182.4s | 179.9s | Streaming TIDAK selamatkan high — hanya 2.5s delta selepas TTFT |

**Jawapan: OFF (non-stream) sesuai untuk Fasa 0.** Alasan: (a) preflight memulangkan SATU objek JSON — tiada nilai UX incremental; HUD hanya ada status running/done, bukan render partial; (b) TTFT dikuasai thinking server-side, bukan saiz payload; (c) laluan produksi Agent B Kimi guna stream semata-mata untuk hidupkan sambungan Caddy (keperluan gateway rootsys), bukan UX — untuk Gemini REST v1beta tiada masalah idle-kill pada 6-35s. Kes 3-flash-preview high + stream membuktikan muktamad: TTFT 179.9s = UX sama buruk dengan Kimi walaupun "stream" — kaedah penghantaran bukan penawar; thinkingLevel yang menentukan.

### 6.2 Q2 — Adakah model baru (3.5+/3.8) handle thinking lebih bermaruah? YA — disahkan empirikal

| Model | Level | Total | thoughts tokens | terms | chars | nullCanon | theme(ch) |
|---|---|---|---|---|---|---|---|
| 3-flash-preview (lama) | high | **DQ 300s ×2** | n/a (gantung) | — | — | — | — |
| gemini-3.5-flash | medium | 18.0s | 3,522 | 5 | 5 | 0/5 | 423 |
| gemini-3.5-flash | high | **23.1s** | 4,957 | 7 | 7 | 1/7 | 547 |
| gemini-3.8-flash | medium | 16.9s | 1,484 | 5 | 5 | 0/5 | 465 |
| gemini-3.8-flash | high | 33.5s* | 2,504 | 6 | 6 | 0/6 | 556 |

\* selepas 2× HTTP 503 "high demand" → rotation key#1 (mekanisme rotation teruji real-world).

**Pengesahan dakwaan owner:** Google fix overthinking bermula 3.5 — model baru pada high TIDAK timeout (23-33s vs DQ 300s pada 3.0). Bonus: nullCanon muncul semula pada 3.5-flash high (1/7) — disiplin FACT-VS-INFERENCE bertambah baik pada model baru.

**TETAPI — kos tersembunyi:** kekayaan bible JATUH. Terms 5-7 / chars 5-7 vs 3-flash-preview low (terms 10-11 / chars 10) vs Kimi (terms 16-21 / chars 10). Model baru lebih berhemat menaip, tetapi juga lebih berhemat MENGEKSTRAK. Nota metodologi: keluarga STRICT tiada temp 0.0 (API menolak) — determinisme eksplisit hilang; pemboleh ubah ketiga yang belum dipencilkan.

### 6.3 Q3 — Boleh ke "dua dalam satu" (laju + bible padu)?

**Pada prompt P1 semasa: TIDAK.** Peta trade-off keluarga Gemini pada korpus ini:

| Konfigurasi | Latency | Kekayaan terms | Verdict |
|---|---|---|---|
| Kimi K3 | 207s | **16-21** (union 29) | Bible terkaya, operasi paling perlahan |
| 3-flash-preview low | **6.4s** | 10-11 (union 12) | Titik sweet-spot Gemini sedia ada |
| 3-flash-preview high | DQ | — | Terkeluar |
| 3.5-flash high | 23.1s | 7 | Laju, kurus |
| 3.8-flash high | 33.5s | 6 | Laju, kurus |

Tiada konfigurasi Gemini menyentuh kekayaan Kimi; model baru malah bergerak menjauhi arah itu. **Bottleneck bukan lagi model — ia prompt.** P1 sedia ada menghalang overthinking (DECISION-DISCIPLINE, berjaya) tetapi tidak MENDORONG kekayaan: tiada kuota eksplisit, tiada few-shot contoh istilah domain, tiada arahan sweep technical/procedural vocabulary. Kimi mengekstrak kaya kerana penaakulan panjangnya; Gemini berhemat kerana arahan kita menyuruh berhemat.

**Laluan ke "dua dalam satu" (cadangan tugasan susulan):**
1. Tweak P1: kuota istilah eksplisit ("extract 15-30 recurring domain terms: laws, organizations, substances, titles, places") + few-shot pair contoh + KEKALKAN klausa REASONING-DISCIPLINE (dipisahkan fasa: "think once, extract exhaustively").
2. Ulang harness pada 3.5-flash medium/high dengan prompt v2 — ukur sama ada kekayaan naik ke ≥12 terms tanpa letal latency.
3. Jika berjaya → "laju + padu" tercapai melalui prompt engineering, bukan pertukaran model.
4. Sentuhan akan melibatkan src/services/subfaberPreflight.js (prompt) + update ujian regresi subfaber-preflight-regression.test.js / subfaber-beta-run7-regression.test.js — tugasan kod produksi berasingan (bukan docs-only).

### 6.4 Keputusan interim operasi (sebelum prompt v2)

- Fasa 0 kekal kimi-k3 (status quo) — bible kaya kekal keutamaan.
- Jika owner mahu ujian operasi Gemini tanpa tunggu prompt v2: gunakan gemini-3-flash-preview + thinkingLevel low + non-stream + temp 0.0 (satu-satunya titik 6.4s / 100% sah / stabil).
- JANGAN migrasi ke 3.5/3.8 untuk preflight pada prompt semasa — lebih laju tetapi bible lebih kurus dari 3.0 low.

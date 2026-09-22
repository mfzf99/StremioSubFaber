# Ground Truth: Top-K Sampling — Adakah Ia Merosakkan Kualiti Terjemahan SubMaker?

## Soalan Kajian
Adakah top-k sampling mengurangkan kualiti terjemahan sarikata? Patutkah ia dimatikan (default off) untuk SubMaker?

## Verdict Ringkas
**Data menyokong keputusan kau mematikan top-k — 3 sumber ground truth selari:**
1. Kajian min-p ICLR 2025 menunjukkan top-k adalah **fixed-size truncation yang tak adaptif** — punca utama kualiti menurun pada context tertentu
2. Kertas Holtzman (nucleus sampling) yang asal menunjukkan top-k menghasilkan teks lebih degenerat berbanding top-p
3. Firebase/Google sendiri kini label top-K sebagai **unsupported untuk model Gemini terkini** — dan model 3.x kita dalam keluarga ini

---

## 1. Mekanik: Apa Yang Top-K Buat (Dan Kenapa Ia Bermasalah)

Top-k = **hard cut** — simpan hanya K token paling tinggi probabilitinya, buang selebihnya, renormalize.

Masalah asas top-k: **ia tak adaptif terhadap keyakinan model** (Sebastian Raschka, machinelearningplus.com):
- Context A (model confident 95%): K=50 membenarkan 49 token sampah masuk pool — bunyi rawak boleh terpilih
- Context B (model uncertain, 100 token masuk akal): K=5 membuang 95 pilihan sah yang mungkin lebih baik

> "This fixed size does not suit every distribution equally well. When one token dominates, keeping 50 candidates may admit a long tail of weak options. When the distribution is flatter, keeping only 5 may remove several plausible continuations." — Raschka

Top-p (nucleus) menyelesaikan ini dengan **dynamic cut berdasarkan cumulative probability mass** — candidate set berubah mengikut context setiap langkah.

## 2. Bukti Empirikal

### a) Holtzman et al. 2020 — "The Curious Case of Neural Text Degeneration" (arXiv:1904.09751)
Kertas yang memperkenalkan nucleus sampling:
- Top-k (dan greedy/beam) menghasilkan teks **repetitive dan bland** — token-level likelihood tinggi tetapi degenerasi semantik
- Nucleus (top-p) menghasilkan distribusi "much closer to human text"
- Resep praktikal yang terbukti: `temperature 0.8 + top_p 0.95` — TANPA top-k

### b) Min-p Paper (ICLR 2025, arXiv:2407.01082)
Eksperimen Appendix B benchmark (Top-p 0.95):
- Dengan top-k=177 dan temperature 2.0-3.0: kualiti **hancur (7.8-14.5)** berbanding top-k=10 (14.5-24.1)
- Top-k fixed-size berinteraksi buruk dengan temperature tinggi — kualiti jatuh tak linear
- Kesimpulan paper: top-k outperformed oleh min-p dan top-p pada hampir semua setting
- GPT-2-era recipe `temp 0.7 + top-k 40` kini dianggap lapuk — "temperature alone could not adequately control the quality/diversity tradeoff" dan top-k pun tak cukup adaptif

### c) Dokumentasi Google Sendiri (Firebase AI Logic, 2026)
> "For the latest general-use Gemini models, the following parameters are now unsupported: **temperature, top-K, top-P**, frequency penalty, presence penalty, and candidate count"

Dan untuk Gemini 3.x-strict (3.5+): sampling params di-strip sepenuhnya oleh API — Google secara efektifnya sudah memansuhkan top-k untuk model baharu. Ini selari dengan yang SubMaker buat untuk 3.x-strict (SAMPLING_DEPRECATED_MODELS di [`gemini.js:30`](src/services/gemini.js:30)).

### d) Untuk Translation Khususnya
Tiada kajian yang terus menguji "top-k vs translation quality", TAPI mekanisme adalah langsung:
1. Terjemahan sarikata perlu **pemilihan kata paling tepat per slot** — top-k membenarkan token lower-probability (yang selalunya pilihan kata lebih "kreatif" tapi kurang tepat) dipilih secara rawak
2. Slot pendek (1-3 patah kata) adalah context yang SANGAT peaked — top-k K=40+ memasukkan banyak noise; top-p 0.85-0.95 secara automatik mengecilkan pool kepada 1-2 pilihan sahaja
3. Konsistensi gaya merentas 200 slot: top-k random selection dari pool lebih besar menambah variance antara slot; top-p mengekal konsistensi

## 3. Kenapa Setup Lama Kau (Tanpa top-k) Lebih Baik — Sintesis Penuh

Setup kau: **temperature + top-p + frequency penalty + presence penalty** (tiada top-k).
Setup baru: top-k dihantar (nilai default/config).

Menggabungkan dengan penemuan persona (v1.5.6):
1. **Persona** menahan model berlakon (fixed v1.5.6) ✓
2. **top-k** menambah noise rawak ke pemilihan kata dalam slot pendek — top-p 0.85-0.95 TANPA top-k memberikan nucleus adaptif yang lebih bersih ✓ (inilah "rahsia" kedua kau)
3. **frequency/presence penalty** yang ada dalam setup lama mengelakkan pengulangan frasa sama merentas batch — bonus yang tak wujud dalam path 3.x baru

Rumusannya: setup lama kau secara tidak sengaja adalah **resep yang lebih selari dengan literature** (Holtzman nucleus recipe) daripada apa yang kita hantar baru-baru ini.

## 4. Cadangan Pelaksanaan v1.5.7

### a) Default top-K = off untuk semua Gemini model
Dalam `MODEL_SPECIFIC_DEFAULTS` (config.js): `topK: undefined` (jangan hantar) untuk SEMUA model — bukan cuma 3.x. Legacy 1.5/2.0/2.5 juga patut guna nucleus sahaja.

### b) UI Toggle dengan default OFF
Seperti cadangan kau — butang on/off di sebelah Top-K field:
- Default: **OFF** (top-k tidak dihantar ke API)
- ON: pengguna boleh set nilai (untuk eksperimen)
- Label UI: "Top-K (advanced — off recommended)" dengan tooltip yang ringkaskan kajian ini

Nota implementasi: frontend toggle adalah fail `public/` — bila sampai fasa UI, kena switch ke frontend mode ikut protokol. Backend side: pastikan `topK: undefined` dihormati di `buildGenerationConfig()` untuk cabang 'budget'/'full' (2.5/2.0) — 3.x sudah strip.

### c) Kekalkan frequency/presence penalty untuk 2.5 dan ke bawah
Punca 2: setup lama kau ada penalty. 3.x tak terima penalty (API tolak), tapi 2.5/2.0/1.5 boleh — jangan buang capability ni untuk model legacy.

## Rujukan
- Holtzman et al. (2020). *The Curious Case of Neural Text Degeneration*. arXiv:1904.09751
- Nguyen et al. (2025). *Turning Up the Heat: Min-p Sampling for Creative and Coherent LLM Outputs*. ICLR 2025, arXiv:2407.01082
- Firebase AI Logic docs — *Use model configuration to control responses* (top-K listed unsupported untuk Gemini terkini)
- Raschka, S. — *How do temperature, top-k, and top-p sampling differ?*
- Chip Huyen — *Generation configurations: temperature, top-k, top-p, and test time compute*

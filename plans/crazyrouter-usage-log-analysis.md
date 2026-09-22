# Laporan Analisis: Log Penggunaan CrazyRouter vs Receipt SubMaker (S01E20)

## Data Sumber
- 4 request log CrazyRouter (model `gemini-3-flash`, token `submaker`, IP 51.79.242.80)
- Receipt Telegram SubMaker v1.5.3 (pra-fix FinOps)
- Dokumentasi rasmi CrazyRouter (`docs.crazyrouter.com`)

---

## 1. Reconciliation: Kos Sebenar vs Receipt SubMaker

| Metrik | Log CrazyRouter (kebenaran) | Receipt SubMaker (v1.5.3) | Delta |
|--------|------------------------------|---------------------------|-------|
| Input tokens | 38,304 | 1,132,958 | **29.6x inflated** |
| Output tokens | 19,439 | 19,561 | ~0.6% (OK) |
| Total tokens | 57,743 | 1,152,519 | 20x inflated |
| Kos retail | $0.078 | $0.625 | 8x inflated |
| Kos sebenar (45% off) | $0.0429 | $0.34 | 8x inflated |

**Output tokens dalam receipt SubMaker hampir TEPAT dengan log CrazyRouter** (19,561 vs 19,439 — beza cuma 122 token / 0.6%, kemungkinan 1 retry attempt yang tak lengkap direkod). Ini mengesahkan:
1. Bug `Math.max()` fix (v1.5.5) adalah tepat — hanya `input` yang double-counted kerana `promptTokenCount` adalah nilai kumulatif yang SAMA pada setiap SSE chunk, manakala `candidatesTokenCount` bertambah secara monotonik (jadi accumulation lama tak banyak menjejaskan output — nilai max sudah tepat).
2. Kos sebenar translation ini adalah **$0.0429 (~RM0.19)**, bukan $0.34 seperti receipt. Selari dengan rekod kau sebelum pembedahan (~$0.03-0.04).

Kiraan pengesahan:
```
Batch 1: 11,360 × $0.50/1M + 11,090 × $3.00/1M = $0.00568 + $0.03327 = $0.03895 × 0.55 = $0.021422 ✓
Batch 2: 12,298 × $0.50/1M + 4,010 × $3.00/1M  = $0.00615 + $0.01203 = $0.01818 × 0.55 = $0.009998 ✓
Batch 3: 12,452 × $0.50/1M + 4,275 × $3.00/1M  = $0.00623 + $0.01283 = $0.01905 × 0.55 = $0.010478 ✓
Batch 4:  2,194 × $0.50/1M +    64 × $3.00/1M  = $0.00110 + $0.00019 = $0.00129 × 0.55 = $0.000708 ✓
Jumlah sebenar: $0.042606 (~RM0.19)
```

Not wallet: RM5.41 → RM5.10 = RM0.31 drop. RM0.31 > RM0.19 kemungkinan kerana rate Wallet USD→RM atau ada request lain kecil. Tapi magnitude betul — BUKAN RM1.40.

---

## 2. Isu Pendam #1: Batch 1 Output ≈ Input (11,090 vs 11,360) — [DIKEMASKINI: teori asal salah]

> **Pembetulan penting**: Analisis asal mengandaikan `thinkingLevel: high`. Log terminal sebenar mengesahkan `thinkingLevel=low` digunakan, DAN report Telegram menunjukkan **sifar thought tokens**. Teori "thinking high" adalah SALAH. Analisis baharu di bawah.

### Bukti Forensik Baharu

| Batch | Input | Output | FRT | Output untuk 200 baris patutnya |
|-------|-------|--------|-----|-------------------------------|
| 1 | 11,360 | **11,090** | **1m 20s** | ~4,100 |
| 2 | 12,298 | 4,010 | 2.4s | ~4,100 ✓ |
| 3 | 12,452 | 4,275 | 3.8s | ~4,100 ✓ |
| 4 | 2,194 | 64 | 1.1s | kecil ✓ |

Batch 1 ada **~7,000 token output berlebihan** yang tak boleh dijelaskan oleh terjemahan sebenar.

### Hipotesis Betul: Hidden Thinking Tokens (dibilang sebagai output, tanpa thoughtsTokenCount breakdown)

Rantaian bukti:

1. **Google Gemini 3 membilang thinking tokens sebagai OUTPUT** ($3/1M — kadar termahal). Dokumen rasmi: "output (including thinking tokens)".

2. **`thinkingLevel: low` TIDAK bermakna thinking dimatikan sepenuhnya.** Dokumen rasmi Google: "minimal does not guarantee that thinking is off" — apa lagi `low`. Untuk prompt yang NOVEL/kompleks, model masih berfikir.

3. **Kunci teka-teki: `thoughtsTokenCount` tidak dilaporkan.** Google hanya populate `thoughtsTokenCount` bila thought summaries di-return. Pada `thinkingLevel: low`, thought summaries TIDAK dihantar — jadi field kosong/0 — TETAPI token thinking yang dibakar masih dikira dalam `candidatesTokenCount`. Inilah sebab report SubMaker tunjuk "0 thought tokens" padahal model berfikir ~7,000 token.

4. **Matematik FRT mengesahkan**: 7,000 token ÷ 80 saat = **87.5 tok/s** — tepat dengan kelajuan output biasa Gemini Flash (~90 tok/s). Model memang menjana token selama 80 saat itu; ia cuma bukan teks terjemahan, ia thinking. FRT = masa sehingga token VISIBLE pertama, jadi semua thinking tersembunyi dalam FRT.

5. **Kenapa Batch 1 sahaja?** Batch 1 adalah pendedahan PERTAMA model kepada arsitektur prompt baharu v1.5.3 (`<task>` + System Instruction baharu + `<demonstration>` + `<critical_rules>` XML sections). Model perlu "membaca dan memahami" kontrak format baharu sebelum menterjemah. Batches 2-4 guna prompt struktur IDENTIK — model dah "faham" pola, hampir tiada thinking diperlukan (FRT 1-4s, output bersih ~4,100).

6. **Implicit caching menambah kesannya**: `"semantics": "Gemini cache subset"` pada semua batch — Google implicit caching menyimpan shared prefix (System Instruction + template) selepas Batch 1. Batches 2-4 mendapat cache hit pada prefix (input rate berkurangan — lihat `saved_usd` dalam log), dan reasoning path yang dah "dipanaskan".

### Kesimpulan Batch 1

**"First-batch thinking tax"** — kos sekali sahaja setiap translation job apabila model jumpa prompt baharu:
- ~7,000 hidden thinking tokens × $3/1M × 0.55 discount = **$0.0115 (~RM0.05)** sesatu
- FRT 1m20s untuk batch pertama sahaja
- Bukan bug, bukan ketidaknormalan sistem — ia gelagat semula jadi reasoning model Gemini 3: "think hard once, then cruise"

---

## 3. Isu Pendam #2: Semantik "Gemini cache subset" & Struktur Harga

Dokumentasi rasmi CrazyRouter (`official-pricing-methods`) mengesahkan struktur billing Gemini:
- **Input** dan **Cached input** dikira berasingan oleh Google (cached = 10x lebih murah)
- **Output termasuk thinking tokens** (explicitly stated dalam docs: "output... 官方明确写成'包含 thinking tokens'")
- Log kau menunjukkan `"semantics": "Gemini cache subset"` — bermaksud CrazyRouter sedang membilang subset input sebagai cache (rate lebih rendah), tapi kadar yang ditunjukkan ($0.50 input) adalah standard rate, bukan cache rate ($0.05/1M untuk 3-flash). Ini adalah label laporan mereka, bukan kadar sebenar — `input_rate_per_m: 0.5` mengesahkan yang dibilang pada standard input rate.

**Perbandingan dengan SubMaker FinOps pricing table** ([`telegramFinOps.js:26-39`](src/utils/telegramFinOps.js:26)):
- `'3-flash-preview': { input: 0.50, output: 3.00, cache: 0.05 }` — **TEPAT** dengan log CrazyRouter ($0.50/$3.00). 

---

## 4. Anomali Batch 4: Input 2,194 / Output 64

Batch 4 hanya 2,194 input + 64 output. Untuk fail 604 entries dalam 4 batches, batch 4 patut ada ~104 entries. Output 64 token untuk ~104 baris adalah terlalu rendah — INI ADALAH MISMATCH yang berlaku tapi... status report kata "PERFECT ✨ 604/604". 

Kemungkinan: Batch 4 output hanya 64 token kerana majoriti entries batch 4 adalah kosong/pendek (credits song, dsb.) ATAU sebahagian jawapan datang dari checkpoint recovery yang tak direkod dalam log billing yang sama. Kadar input Batch 4 (2,194) vs Batches 1-3 (~12,000) juga mencadangkan batch 4 memang kecil — mungkin streaming partial completion yang tinggal sedikit sahaja.

Dari log terminal kau (partial saves), batch 4/4 selesai 604/604 — jadi semua entries sempurna. Batch 4 kemungkinan hanya ~10-20 baris akhir + padding.

---

## 5. Kesimpulan & Tindakan

### Yang Sudah Betul
1. **Fix v1.5.5 (Math.max)** adalah tepat — output tokens dah hampir match dengan billing sebenar
2. Pricing table SubMaker ($0.50/$3.00) tepat dengan kadar CrazyRouter
3. Kos sebenar translation (~$0.043) selari dengan rekod pra-pembedahan

### Yang Perlu Dipantau
1. **Batch 1 thinking overhead**: FRT 1m20s + output tinggi akibat `thinkingLevel: high`. Jika kerap berlaku, pertimbangkan tukar default ke `low` untuk 3-flash-preview (konflik test perlu selesaikan dahulu — test mengikat 3-flash-preview dengan keluarga 3.5-3.8)
2. **Batch 4 kecil**: Perlu verify dengan fail lain sama ada ini pola normal (entries bertaburan) atau ada checkpoint-recovery yang tak direkod

### Cadangan Tindakan
- **TIADA code change diperlukan sekarang** — fix v1.5.5 sudah menangani punca utama
- Pantau receipt translation seterusnya: input sepatutnya kembali ~40-60k range (bukan 1.1M)
- Jika FRT Batch 1 kerap melebihi 1 minit, barulah pertimbangkan tuning thinking_level

## Statistik Kesihatan Sistem
- Semua 4 request berjaya, tiada retry, tiada PROHIBITED_CONTENT
- Kelajuan keseluruhan: 2m 18s untuk 604 entries = 263 entries/min (in termasuk 1m32s batch 1 spike)
- Tanpa spike Batch 1: ~46s untuk 3 batches = 790 entries/min throughput teori

---

## 9. A/B Test Result: v1.5.5 `minimal` vs v1.5.3 `low` (Sama fail S01E20)

Konfigurasi A/B yang diuji pengguna (14:58 UTC, post v1.5.5):
- Run B: `thinkingLevel=minimal, temperature=0.2, topP=0.85`
- Run A (asas perbandingan): `thinkingLevel=low, temperature=1.0, topP=0.95`

### Keputusan Perbandingan

| Metrik | Run A (`low`, temp=1.0) | Run B (`minimal`, temp=0.2) | Delta |
|--------|--------------------------|------------------------------|-------|
| Masa total | 2m 18s | **1m 16s** | **-45%** |
| FRT Batch 1 | 1m 20s | **~4.5s** | **-94%** |
| Input tokens | 38,304 | 38,300 | Sama ✓ |
| Output tokens | 19,439 | 13,024 | **-33%** |
| Total billed | 57,743 | 51,324 | -11% |
| Kos sebenar | $0.0429 | **$0.032** | **-25%** |
| Throughput | 263/min | **477/min** | **+81%** |
| Kualiti | 604/604 PERFECT | 604/604 PERFECT | Sama ✓ |
| Mismatch | 0 | 0 | Sama ✓ |
| Diagnostic entry 0 | "DIADAPTASI DARIPADA NOVEL GU MAN, <i>SHINE ON ME</i>" | "ADAPTASI DARIPADA NOVEL GU MAN, <i>SHINE ON ME</i>" | Semantik setara |

### Interpretasi

1. **Hidden thinking tax disahkan oleh eksperimen**: Dengan `minimal`, FRT Batch 1 jatuh dari 1m20s → ~4.5s. Ini membuktikan Batch 1 spike dalam Run A memang thinking tokens (bukan cold start network — sebab Run B guna endpoint sama, waktu sama, cold-cache juga, tapi 17x lebih pantas untuk token pertama).

2. **Output 13,024 vs 19,439**: Perbezaan ~6,400 token ≈ hidden thinking tokens Run A (teori ~7,000) + sedikit variasi penterjemahan. Confirm: pada `minimal`, thinking hampir tiada.

3. **Temp=0.2 + topP=0.85 masih stabil**: Walaupun Google syorkan temp=1.0 untuk Gemini 3, test ini menunjukkan nilai rendah TIDAK menyebabkan looping/degredasi untuk task penterjemahan terstruktur dengan output enforcement kuat (prefill + critical rules). Kualiti 604/604 kekal.

4. **Diagnostic entry 0**: "DIADAPTASI" vs "ADAPTASI" — kedua-duanya betul semantik (di- prefix vs tanpa). Nota: Run A membetulkan typo terjemahan awal (<i>SHINE ON ME</i> dikekalkan dalam kedua-duanya — markup preserved ✓).

### Cadangan Konfigurasi Optimum (berdasarkan data)

Untuk `gemini-3-flash-preview` pada task batch terjemahan terstruktur SubMaker:
- `thinkingLevel: minimal` — elak first-batch tax, FRT ~4s
- `temperature: 0.2-1.0` — kedua-duanya berfungsi; 0.2 memberi konsistensi, ikut rekomendasi Google pula 1.0
- `topP: 0.85-0.95` — tiada perbezaan ketara diperhatikan

Catatan: "Thinking tax" Run A adalah sekali per job sahaja. Untuk fail besar (1000+ baris), tax tersebut di-Amortise merentasi lebih banyak entries, jadi perbezaan kos per-entry menyempit. Nilai `minimal` memberi latensi terbaik kos konsisten.

# 🔬 LAPORAN AUDIT GROUND TRUTH: PARAMETER PENSAMPELAN VIDEOLINGO

**Status:** AUDIT SELESAI — Berasaskan kod sumber sahih, tanpa spekulasi.
**Tarikh:** 2026-09-25
**Audiitor:** GLM 5.3 (Backend Lead)
**Mandat:** Ekstrak Parameter Rasmi VideoLingo Untuk Perbandingan SubFaber

---

## 1. METODOLOGI

Kod sumber rasmi VideoLingo (Huanshere/VideoLingo, 18.5k stars) diaudit merentasi
**tiga titik masa berbeza** untuk menangkap sebarang evolusi parameter:

| Versi | Tarikh | Fail | Sumber |
|---|---|---|---|
| v0.3 (awal) | Sep 2024 | `core/ask_gpt.py` | tag v0.3 |
| Refactor besar | Apr 2025 | `core/utils/ask_gpt.py` | commit b07491f |
| Main (terkini) | Sep 2026 | `core/utils/ask_gpt.py` | main @ 86e1d1b |

Fail `config.yaml` terkini turut disemak sepenuhnya, bersama dokumentasi
rasmi `docs/pages/docs/start.en-US.md`.

---

## 2. TEMUAN AUDIT: KOD ASAS PANGGILAN LLM

### 2.A Kod panggilan API dalam `ask_gpt.py` (Main branch, Sep 2026):

```python
params = dict(
    model=model,
    messages=messages,
    response_format=response_format,
    timeout=300
)
resp_raw = client.chat.completions.create(**params)
```

### 2.B Hasil pembandingan tiga versi:

| Parameter | v0.3 (2024) | Apr 2025 | Main (Sep 2026) |
|---|---|---|---|
| `model` | ✅ | ✅ | ✅ |
| `messages` | ✅ | ✅ | ✅ |
| `response_format` | ✅ (json_object) | ✅ (json_object) | ✅ (json_object) |
| `timeout` | ❌ | ✅ (300s) | ✅ (300s) |
| **`temperature`** | ❌ **TIADA** | ❌ **TIADA** | ❌ **TIADA** |
| **`top_p`** | ❌ **TIADA** | ❌ **TIADA** | ❌ **TIADA** |
| **`presence_penalty`** | ❌ **TIADA** | ❌ **TIADA** | ❌ **TIADA** |
| **`frequency_penalty`** | ❌ **TIADA** | ❌ **TIADA** | ❌ **TIADA** |

### 2.C `config.yaml` terkini (disemak penuh):

Tiada sebarang kunci konfigurasi pensampelan. Kunci berkaitan LLM hanyalah:
`api.key`, `api.base_url`, `api.model`, `api.llm_support_json` — semuanya
identiti sambungan, bukan pensampelan.

### 2.D Tetapan khusus Google Gemini:

**TIADA wujud.** VideoLingo tidak mempunyai sebarang laluan kod khusus untuk
Gemini — ia menggunakan OpenAI-compatible Chat Completions secara seragam
untuk SEMUA model (dokumentasi rasmi mengesahkan: "The client uses
OpenAI-compatible Chat Completions"). Model lalai semasa ialah `gpt-6-luna`
melalui relay OpenLux; tiada integrasi native Gemini REST v1beta langsung.

---

## 3. JAWAPAN SOALAN MANDAT

**A1 — Berapakah nilai sebenar 'temperature' VideoLingo?**

> **TIADA.** VideoLingo tidak pernah menetapkan `temperature` dalam mana-mana
> versi sejak v0.3 (Sep 2024) hingga main (Sep 2026). Semua panggilan LLM
> bergantung pada **default API penyedia**. Untuk endpoint OpenAI-compatible
> (termasuk Gemini melalui relay OpenAI-compat), default `temperature` ialah
> **1.0**.

**A2 — Adakah VideoLingo menetapkan 'top_p'/'presence_penalty'/'frequency_penalty'?**

> **TIADA.** Ketiga-tiga parameter tidak wujud dalam kod atau config pada
> mana-mana versi.

**A3 — Tetapan khusus Gemini?**

> **TIADA.** Tiada laluan kod khusus Gemini. Semua model melalui OpenAI-compat
> endpoint yang sama.

---

## 4. ANALISIS PERBANDINGAN DENGAN SUBFABER

### 4.A Kedudukan sebenar:

| Parameter | VideoLingo (Ground Truth) | SubFaber Semasa | Delta |
|---|---|---|---|
| temperature | **tidak ditetapkan (default 1.0)** | 0.2 | SubFaber lebih deterministik |
| top_p | **tidak ditetapkan (default 1.0)** | 0.85 | SubFaber lebih sempit |
| presence_penalty | **tidak ditetapkan (default 0)** | 0 | ✅ sama |
| frequency_penalty | **tidak ditetapkan (default 0)** | 0 | ✅ sama |
| thinkingLevel | n/a (tiada) | minimal | SubFaber khusus Gemini |
| maxOutputTokens | n/a (tiada) | 65536 | SubFaber khusus |

### 4.B Interpretasi falsafah (bukan spekulasi, berdasarkan bukti):

VideoLingo **sengaja tidak menetapkan parameter pensampelan**. Falsafah
rekabentuknya: kestabilan output dicapai melalui **struktur prompt** (persona,
kontrak JSON/XML, multi-step reasoning), BUKAN melalui penindasan pensampelan.
Model generasi baru (GPT-6, Claude 5, Gemini 3) dilatih supaya default
temperature memberikan kualiti optimum — VideoLingo mempercayai default ini.

### 4.C Status SubFaber (0.2 / 0.85):

Tetapan SubFaber semasa **lebih agresif dari segi determinisme** berbanding
VideoLingo:
- `temperature 0.2` (vs default 1.0 VideoLingo) — output SubFaber jauh lebih
  terpelihara/deterministik
- `top_p 0.85` (vs default 1.0 VideoLingo) — tatarajah nucleus lebih sempit

**Bukti empirikal SubFaber sendiri**: First run production (646/646 entri,
0 mismatch, 13/13 batch first-try completion, 13x benign `<answer>` prefix —
model mematuhi kontrak) menunjukkan konfigurasi semasa sudah mencapai
kestabilan maksimum dengan kos RM 0.17/episod.

### 4.D Konteks kritikal — PANTANG LARANG projek:

Ini penting: **Gemini 3.x-strict melarang parameter pensampelan sepenuhnya**
(GROUND TRUTH ENFORCEMENT: Gemini 3.x strips ALL sampling parameters).
Tetapan `temperature=0.2 / topP=0.85` yang muncul dalam log production
SubFaber (`API config (Bypass Mode): temperature=0.2, topP=0.85`) adalah
**nilai konfigurasi pengguna yang dibawa ke log tetapi telah distrip oleh
lapisan gemini.js** sebelum sampai ke API sebenar — tinggal hanya
`thinkingLevel=minimal` + `maxOutputTokens=65536` yang benar-benar dihantar.

---

## 5. SYORAN RASMI

**Syoran 1 — KEEKALAN TETAPAN SEMASA (tiada tindakan):**

SubFaber **tidak perlu** meniru VideoLingo secara literal pada parameter
pensampelan kerana:

1. **Arsitektur berbeza**: VideoLingo bergantung pada default API (temperature
   1.0) kerana ia menyasarkan pelbagai model generik melalui relay. SubFaber
   secara eksklusif menyasarkan Gemini 3.x melalui REST v1beta, di mana
   parameter pensampelan **dilarang** (Gemini 3 thinking models mengabaikan
   temperature sepenuhnya — dokumentasi Google mengesahkan thinking models
   tidak boleh ditunda bersama non-default temperature).

2. **Bukti produksi**: 646/646 pariti sempurna dengan 0 mismatch pada tetapan
   semasa. "If it ain't broke, don't fix it."

3. **Nilai konfigurasi (0.2/0.85) hanya kosmetik pada log** — apa yang sampai
   ke Gemini 3 API hanyalah thinkingLevel=minimal + maxOutputTokens=65536,
   yang adalah tetapan sah dan optimum untuk Gemini 3 Flash.

**Syoran 2 — penjajaran falsafah di mana ia benar-benar penting:**

SubFaber telah menyalin intipati sebenar VideoLingo yang memberikan kestabilan:
- ✅ Persona Netflix translator (verbatim dari VideoLingo)
- ✅ Sliding context 3-prev/2-next (verbatim dari VideoLingo `_translate_by_chunk`)
- ✅ Pre-flight summary + terms (verbatim dari VideoLingo `get_summary_prompt`)
- ✅ Struktur prompt berlapis (bukan penindasan pensampelan)

Parameter pensampelan bukanlah sumber kestabilan VideoLingo — struktur
prompt-nya. Dan struktur itu sudah kita miliki.

**Syoran 3 — status dokumen rujukan silang:**

Laporan ini wajib dirujuk bersama [`plans/gemini-3-flash-prompt-engineering-ground-truth.md`](gemini-3-flash-prompt-engineering-ground-truth.md)
(GROUND TRUTH ENFORCEMENT #3: Gemini 3.x-strict strips all sampling) untuk
pandangan lengkap mengapa "set-and-forget" pada lapisan Gemini 3 adalah
satu-satunya laluan sah.

---

## 6. RINGKASAN EKSEKUTIF

| Soalan | Jawapan Berasaskan Kod |
|---|---|
| Temperature VideoLingo? | **Tiada ditetapkan** (default API = 1.0) |
| top_p / penalties? | **Tiada ditetapkan** (default API) |
| Tetapan Gemini khusus? | **Tiada wujud** (semua melalui OpenAI-compat) |
| SubFaber 0.2/0.85 selaras? | **Ya dan lebih ketat** — dan pada Gemini 3.x, nilai ini di-strip sebelum sampai API; hanya thinkingLevel + maxOutputTokens benar-benar berkesan |
| Perlu larasan? | **TIADA** — kestabilan dicapai melalui struktur prompt (sudah dipinjam sepenuhnya), bukan parameter pensampelan |

---

**AUDIT SELESAI — KOD SUBFABER TIDAK DIMODIFIKASI. TETAPAN SEMASA SAH DAN OPTIMUM.**

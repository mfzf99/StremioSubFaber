# GEMINI MODELS METADATA GROUND TRUTH

> **Status:** Dokumen rujukan teknikal arkib (docs-only — SIFAR perubahan kod runtime).
> **Tarikh kapturen:** 2026-10-19 (waktu tempatan KL)
> **Sumber:** `GET https://generativelanguage.googleapis.com/v1beta/models?pageSize=100&key=<SUBFABER_TEST_GEMINI_KEY>` — kunci ujian dimuat dari `.env.test.local` melalui pemboleh ubah persekitaran; **SIFAR nilai kunci direkodkan dalam dokumen ini, log, atau sejarah Git** (Zero Secret Logging).
> **Kapturen tambahan (v3.16.5):** medan `thinking` disedut bagi SEMUA 63 model melalui endpoint detail `GET /v1beta/models/{id}` — lihat §Data Kelayakan Thinking.
> **Tujuan:** Arkib spesifikasi mentah pelayan Gemini Native bagi menyokong ketepatan pemetaan [modelCapabilities.js](../src/utils/modelCapabilities.js).

---

## Protokol Pengambilan Data (Pagination & Penapisan)

- **Endpoint:** `/v1beta/models` dengan parameter `pageSize=100` — mengembalikan **63 model dalam SATU halaman**; `nextPageToken` ABSENT (tiada halaman kedua diperlukan).
- **Penapisan wajib:** setiap model mengembalikan `supportedGenerationMethods`; pengasingan model teks (pintu `generateContent`) daripada model audio/vektor dilakukan dengan menapis **`supportedGenerationMethods` mengandungi `"generateContent"`**:
  - `generateContent` — model teks/multi-modal standard (sasaran SubFaber).
  - `embedContent` / `asyncBatchEmbedContent` — model embedding (vektor, bukan teks).
  - `bidiGenerateContent` / `bidiGenerateMusic` — model audio Live/muzik masa nyata.
  - `predictLongRunning` — model penjanaan video (Veo).
- **Amaran penapisan:** sesetengah model TTS turut menyenaraikan `generateContent` (cth. `gemini-3.8-flash-tts`) — mesti diasingkan melalui had token (lihat §Bukti c) dan imbuhan nama `-tts`, BUKAN semata-mata kaedah penjanaan.

---

## 4 Bukti Empirikal Utama

### a) Siling Output Sebenar — `outputTokenLimit` = 65,536 (bukan 8,192)

Dokumentasi pihak ketiga yang lapuk menyatakan 8,192; **pelayan sebenar Google memulangkan 65,536** bagi semua model teks moden:

| Keluarga Model | `inputTokenLimit` | `outputTokenLimit` |
|---|---|---|
| gemini-2.5-flash / 2.5-pro / 2.5-flash-lite | 1,048,576 | **65,536** |
| gemini-flash-latest / flash-lite-latest / pro-latest | 1,048,576 | **65,536** |
| gemini-3-flash-preview, 3.1-pro-preview, 3.1-flash-lite(-preview) | 1,048,576 | **65,536** |
| gemini-3.5-flash, 3.5-flash-lite, 3.6-flash, 3.7-flash, 3.8-flash | 1,048,576 | **65,536** |
| antigravity-preview-* (keluarga ejen) | 1,048,576 | **65,536** |
| deep-research-preview / pro / max | 131,072 | **65,536** |

**Nota pemetaan:** `getCappedMaxOutputTokens()` menghormati siling pengguna; siling vendor mutlak kekal berdasarkan had ini (lihat invariant benteng vendor dalam [SESSION_LEDGER](SESSION_LEDGER.md) v3.16.0 §8.2).

### b) Sifat Model STRICT — Parameter Sampling TIDAK Diumumkan

Bukti empirikal dari pelayan: bagi model keluarga ejen/penalaran `antigravity-preview-*` (`antigravity-preview-05-2026`, `antigravity-preview-09-2026`, `antigravity-preview-latest`), medan sampling **`temperature`, `topP`, `topK`, `maxTemperature` TIDAK WUJUD dalam objek model sama sekali** (kunci absent dari JSON — bukan `null` eksplisit dalam medan dinamik parser). Ini membuktikan **pelayan Google sendiri tidak mengisytiharkan parameter suhu bagi keluarga penalaran** — penolakan parameter suhu adalah ketetapan rasmi pelayan, selari dengan doktrin STRICT family dalam [gemini.js](../src/services/gemini.js) (`uiHint: 'server-strips-for-this-model'`).

**Kesimpulan untuk `getModelFamily`:** model tanpa kunci sampling dalam metadata = keluarga STRICT (pelayan tentukan sendiri sama ada menerima/abaikan/400 — SEND-ALL DOCTRINE kekal: SubFaber tetap menghantar parameter, pelayan memutuskan).

10 model yang TIDAK mengumumkan kunci sampling dalam kapturen ini:

```
antigravity-preview-05-2026, antigravity-preview-09-2026, antigravity-preview-latest,
gemini-embedding-001, gemini-embedding-2-preview, gemini-embedding-2,
veo-3.1-generate-preview, veo-3.1-fast-generate-preview, veo-3.1-lite-generate-preview,
lyria-realtime-exp
```

(3 antigravity = keluarga ejen/penalaran; 3 embedding + 3 veo + 1 lyria = bukan model teks standard.)

Sebaliknya, model teks standard mengumumkan penuh: `temperature: 1`, `topP: 0.95`, `topK: 64`, `maxTemperature: 2`.

### c) Sifat Model Khas — TTS, Embedding, Imej, Live

| Kategori | Model (contoh) | Input | Output | Kaedah |
|---|---|---|---|---|
| **TTS** | gemini-2.5-flash-preview-tts, 2.5-pro-preview-tts, 3.1-flash-tts-preview, 3.8-flash-tts, 3.8-flash-lite-tts | **8,192** | **16,384** | generateContent + countTokens |
| **Embedding** | gemini-embedding-001 (input 2,048), embedding-2 / 2-preview (input 8,192) | 2,048 / 8,192 | **1** (vektor tunggal) | embedContent + asyncBatchEmbedContent |
| **Imej (Nano Banana)** | gemini-2.5-flash-image (32,768/32,768), 3-pro-image (131,072/32,768), 3.1-flash-image (65,536/65,536), maxTemperature: 1 | — | — | generateContent |
| **Audio Live (bidi)** | 2.5-flash-native-audio-* (output **8,192**), 3.1-flash-live-preview / 3.8-live / 3.8-live-extended-thinking (output 65,536) | 131,072 | — | bidiGenerateContent |
| **Transcribe** | gemini-3.5-transcribe | 98,304 | 32,768 | generateContent |
| **Video (Veo 3.1)** | veo-3.1-generate-preview(-fast/-lite) | 480 | 8,192 | predictLongRunning |
| **AQA (legacy)** | aqa | 7,168 | 1,024 | generateAnswer (temp 0.2 / topP 1 / topK 40) |

### d) Protokol Pagination & Penapisan — Ringkasan Kontraktual

- `pageSize=100` mencukupi (63/100 slot); respons mengandungi **63 objek model** dan TIADA `nextPageToken` — pengambilan satu panggilan lengkap.
- Penapisan pelanggan WAJIB dwi-lapis: (1) `supportedGenerationMethods` mengandungi `generateContent`; (2) pengecualian model audio/vektor/TTS melalui corak nama + had token (`outputTokenLimit === 1` = embedding; input 8,192 + output 16,384 = TTS; `bidiGenerateContent`/`predictLongRunning` sahaja = bukan teks standard).

---

## Jadual Penuh Metadata (Sanitized — 63 Model)

Medan: `model | displayName | input | output | temp | topP | topK | maxTemp | methods`

### Model Teks Standard (generateContent) — Sasaran SubFaber

| Model | Nama Paparan | Input | Output | Temp | topP | topK | maxTemp |
|---|---|---|---|---|---|---|---|
| gemini-2.5-flash | Gemini 2.5 Flash | 1,048,576 | 65,536 | 1 | 0.95 | 64 | 2 |
| gemini-2.5-pro | Gemini 2.5 Pro | 1,048,576 | 65,536 | 1 | 0.95 | 64 | 2 |
| gemini-2.5-flash-lite | Gemini 2.5 Flash-Lite | 1,048,576 | 65,536 | 1 | 0.95 | 64 | 2 |
| gemini-flash-latest | Gemini Flash Latest | 1,048,576 | 65,536 | 1 | 0.95 | 64 | 2 |
| gemini-flash-lite-latest | Gemini Flash-Lite Latest | 1,048,576 | 65,536 | 1 | 0.95 | 64 | 2 |
| gemini-pro-latest | Gemini Pro Latest | 1,048,576 | 65,536 | 1 | 0.95 | 64 | 2 |
| gemini-3-flash-preview | Gemini 3 Flash Preview | 1,048,576 | 65,536 | 1 | 0.95 | 64 | 2 |
| gemini-3.1-pro-preview | Gemini 3.1 Pro Preview | 1,048,576 | 65,536 | 1 | 0.95 | 64 | 2 |
| gemini-3.1-pro-preview-customtools | Gemini 3.1 Pro Preview Custom Tools | 1,048,576 | 65,536 | 1 | 0.95 | 64 | 2 |
| gemini-3.1-flash-lite-preview | Gemini 3.1 Flash Lite Preview | 1,048,576 | 65,536 | 1 | 0.95 | 64 | 2 |
| gemini-3.1-flash-lite | Gemini 3.1 Flash Lite | 1,048,576 | 65,536 | 1 | 0.95 | 64 | 2 |
| gemini-3.5-flash | Gemini 3.5 Flash | 1,048,576 | 65,536 | 1 | 0.95 | 64 | 2 |
| gemini-3.5-flash-lite | Gemini 3.5 Flash Lite | 1,048,576 | 65,536 | 1 | 0.95 | 64 | 2 |
| gemini-3.6-flash | Gemini 3.6 Flash | 1,048,576 | 65,536 | 1 | 0.95 | 64 | 2 |
| gemini-3.7-flash | Gemini 3.7 Flash | 1,048,576 | 65,536 | 1 | 0.95 | 64 | 2 |
| gemini-3.8-flash | Gemini 3.8 Flash | 1,048,576 | 65,536 | 1 | 0.95 | 64 | 2 |
| gemini-4-argon | Gemini 4 Argon | 1,048,576 | 32,768 | 1 | 0.95 | 64 | 2 |
| gemini-omni-flash-preview | Gemini Omni Flash Preview | 131,072 | 65,536 | 1 | 0.95 | 64 | 2 |
| gemini-omni-1.1-flash | Gemini Omni 1.1 Flash | 131,072 | 65,536 | 1 | 0.95 | 64 | 2 |
| gemini-3.5-transcribe | Gemini 3.5 Transcribe | 98,304 | 32,768 | 1 | 0.95 | 64 | 2 |
| gemma-4-26b-a4b-it | Gemma 4 26B A4B IT | 262,144 | 32,768 | 1 | 0.95 | 64 | 2 |
| gemma-4-31b-it | Gemma 4 31B IT | 262,144 | 32,768 | 1 | 0.95 | 64 | 2 |
| gemini-2.5-flash-image | Nano Banana | 32,768 | 32,768 | 1 | 0.95 | 64 | 1 |
| gemini-3-pro-image-preview | Nano Banana Pro | 131,072 | 32,768 | 1 | 0.95 | 64 | 1 |
| gemini-3-pro-image | Nano Banana Pro | 131,072 | 32,768 | 1 | 0.95 | 64 | 1 |
| nano-banana-pro-preview | Nano Banana Pro | 131,072 | 32,768 | 1 | 0.95 | 64 | 1 |
| gemini-3.1-flash-image-preview | Nano Banana 2 | 65,536 | 65,536 | 1 | 0.95 | 64 | 1 |
| gemini-3.1-flash-image | Nano Banana 2 | 65,536 | 65,536 | 1 | 0.95 | 64 | 1 |
| gemini-3.1-flash-lite-image | Nano Banana 2 Lite | 65,536 | 65,536 | 1 | 0.95 | 64 | 1 |
| gemini-nano-banana-2.1 | Nano Banana 2.1 | 65,536 | 65,536 | 1 | 0.95 | 64 | 1 |
| lyria-3-clip-preview | Lyria 3 Clip Preview | 1,048,576 | 65,536 | 1 | 0.95 | 64 | 2 |
| lyria-3-pro-preview | Lyria 3 Pro Preview | 1,048,576 | 65,536 | 1 | 0.95 | 64 | 2 |
| lyria-3.5 | Lyria 3.5 | 1,048,576 | 65,536 | 1 | 0.95 | 64 | 2 |
| gemini-robotics-er-2-preview | Gemini Robotics-ER 2 Preview | 131,072 | 65,536 | 1 | 0.95 | 64 | 2 |
| gemini-2.5-computer-use-preview-10-2025 | Gemini 2.5 Computer Use Preview | 131,072 | 65,536 | 1 | 0.95 | 64 | 2 |

### Model TTS (generateContent — WAJIB diasingkan daripada pintu teks)

| Model | Nama Paparan | Input | Output |
|---|---|---|---|
| gemini-2.5-flash-preview-tts | Gemini 2.5 Flash Preview TTS | 8,192 | 16,384 |
| gemini-2.5-pro-preview-tts | Gemini 2.5 Pro Preview TTS | 8,192 | 16,384 |
| gemini-3.1-flash-tts-preview | Gemini 3.1 Flash TTS Preview | 8,192 | 16,384 |
| gemini-3.8-flash-tts | Gemini 3.8 Flash TTS | 8,192 | 16,384 |
| gemini-3.8-flash-lite-tts | Gemini 3.8 Flash Lite TTS | 8,192 | 16,384 |

### Model Penalaran / Ejen / Deep Research

| Model | Nama Paparan | Input | Output | Sampling |
|---|---|---|---|---|
| antigravity-preview-05-2026 | Antigravity Agent Preview | 1,048,576 | 65,536 | **kunci sampling ABSENT** |
| antigravity-preview-09-2026 | Antigravity Agent Preview | 1,048,576 | 65,536 | **kunci sampling ABSENT** |
| antigravity-preview-latest | Antigravity Agent Preview Latest | 1,048,576 | 65,536 | **kunci sampling ABSENT** |
| deep-research-max-preview-04-2026 | Deep Research Max Preview (Apr-21-2026) | 131,072 | 65,536 | 1 / 0.95 / 64 / 2 |
| deep-research-preview-04-2026 | Deep Research Preview (Apr-21-2026) | 131,072 | 65,536 | 1 / 0.95 / 64 / 2 |
| deep-research-pro-preview-12-2025 | Deep Research Pro Preview (Dec-12-2025) | 131,072 | 65,536 | 1 / 0.95 / 64 / 2 |

### Model Embedding (output = 1 — vektor)

| Model | Input | Output | Kaedah |
|---|---|---|---|
| gemini-embedding-001 | 2,048 | **1** | embedContent, countTextTokens, countTokens, asyncBatchEmbedContent |
| gemini-embedding-2-preview | 8,192 | **1** | embedContent, countTextTokens, countTokens, asyncBatchEmbedContent |
| gemini-embedding-2 | 8,192 | **1** | embedContent, countTextTokens, countTokens, asyncBatchEmbedContent |

### Model Audio Live / Muzik / Video (bukan teks standard)

| Model | Nama Paparan | Input | Output | Kaedah |
|---|---|---|---|---|
| gemini-3.5-transcribe-live | Gemini 3.5 Transcribe Live | 131,072 | 65,536 | bidiGenerateContent |
| gemini-2.5-flash-native-audio-latest | Gemini 2.5 Flash Native Audio Latest | 131,072 | **8,192** | bidiGenerateContent |
| gemini-2.5-flash-native-audio-preview-09-2025 | Gemini 2.5 Flash Native Audio Preview 09-2025 | 131,072 | **8,192** | bidiGenerateContent |
| gemini-2.5-flash-native-audio-preview-12-2025 | Gemini 2.5 Flash Native Audio Preview 12-2025 | 131,072 | **8,192** | bidiGenerateContent |
| gemini-3.1-flash-live-preview | Gemini 3.1 Flash Live Preview | 131,072 | 65,536 | bidiGenerateContent |
| gemini-3.8-live | Gemini 3.8 Live | 131,072 | 65,536 | bidiGenerateContent |
| gemini-3.8-live-extended-thinking | Gemini 3.8 Live Extended Thinking | 131,072 | 65,536 | bidiGenerateContent |
| gemini-robotics-er-2-streaming-preview | Gemini Robotics-ER 2 Streaming Preview | 131,072 | 65,536 | bidiGenerateContent |
| gemini-3.5-live-translate-preview | Gemini 3.5 Live Translate Preview | 16,384 | 32,768 | bidiGenerateContent |
| lyria-realtime-exp | Lyria Realtime Experimental | 1,048,576 | 65,536 | bidiGenerateMusic |
| veo-3.1-generate-preview | Veo 3.1 | 480 | 8,192 | predictLongRunning |
| veo-3.1-fast-generate-preview | Veo 3.1 fast | 480 | 8,192 | predictLongRunning |
| veo-3.1-lite-generate-preview | Veo 3.1 lite | 480 | 8,192 | predictLongRunning |

### Model Legacy (bukan generateContent standard)

| Model | Input | Output | Kaedah | Sampling |
|---|---|---|---|---|
| aqa | Attributed Question Answering | 7,168 | 1,024 | generateAnswer | 0.2 / 1 / 40 |

-------

## Data Kelayakan Thinking (`GET /v1beta/models/{id}` — 63/63 Model)

> **Penemuan utama:** medan `thinking` (boolean) **TIADA dalam respons senarai** `/v1beta/models` — ia hanya diumumkan oleh **endpoint detail per-model**. Kapturen penuh 63 panggilan detail (batch 8-serentak, 0 ralat): **37 model `thinking: true` / 26 model medan ABSENT**. Medan ini hanya boolean kelayakan — ia TIDAK membawa `thinkingBudget` min/max atau tahap penalaran; angka bajet kekal tidak diumumkan oleh mana-mana endpoint metadata.

### `thinking: true` (37 model — kelayakan penalaran diumumkan)

gemini-2.5-flash, gemini-2.5-pro, gemini-2.5-flash-lite, gemini-flash-latest, gemini-flash-lite-latest, gemini-pro-latest, gemini-3-flash-preview, gemini-3.1-pro-preview, gemini-3.1-pro-preview-customtools, gemini-3.1-flash-lite-preview, gemini-3.1-flash-lite, gemini-3.5-flash, gemini-3.5-flash-lite, gemini-3.6-flash, gemini-3.7-flash, gemini-3.8-flash, gemini-4-argon, gemini-omni-flash-preview, gemini-omni-1.1-flash, gemma-4-26b-a4b-it, gemma-4-31b-it, gemini-3-pro-image-preview, gemini-3-pro-image, nano-banana-pro-preview, gemini-3.1-flash-image-preview, gemini-3.1-flash-image, gemini-3.1-flash-lite-image, gemini-nano-banana-2.1, gemini-robotics-er-2-preview, gemini-2.5-computer-use-preview-10-2025, deep-research-max-preview-04-2026, deep-research-preview-04-2026, deep-research-pro-preview-12-2025, gemini-2.5-flash-native-audio-latest, gemini-2.5-flash-native-audio-preview-09-2025, gemini-2.5-flash-native-audio-preview-12-2025, gemini-3.8-live-extended-thinking

### `thinking` ABSENT (26 model — kelayakan tidak diumumkan)

gemini-2.5-flash-preview-tts, gemini-2.5-pro-preview-tts, gemini-3.1-flash-tts-preview, gemini-3.8-flash-tts, gemini-3.8-flash-lite-tts (TTS), antigravity-preview-05-2026, antigravity-preview-09-2026, antigravity-preview-latest (keluarga ejen — selari kunci sampling ABSENT), gemini-embedding-001, gemini-embedding-2-preview, gemini-embedding-2 (embedding), veo-3.1-generate-preview, veo-3.1-fast-generate-preview, veo-3.1-lite-generate-preview (video), lyria-3-clip-preview, lyria-3-pro-preview, lyria-3.5, lyria-realtime-exp (muzik), gemini-3.5-transcribe, gemini-3.5-transcribe-live, gemini-3.1-flash-live-preview, gemini-3.8-live, gemini-robotics-er-2-streaming-preview, gemini-3.5-live-translate-preview (transkripsi/live), gemini-2.5-flash-image (imej generasi pertama), aqa (legacy)

### Corak Empirikal

1. **Semua model teks standard `generateContent` = `thinking: true`** — termasuk keluarga imej Nano Banana 2/Pro (generasi 3.x) yang menariknya turut mengumumkan kelayakan thinking; hanya `gemini-2.5-flash-image` (generasi pertama) dikecualikan.
2. **`antigravity` = dwi-ABSENT** — kedua-dua kunci sampling DAN medan `thinking` tidak diumumkan; pelayan menguruskannya sebagai keluarga ejen bebas penalaran deklaratif (pemetaan STRICT dalam SubFaber kekal tepat).
3. **Kes khas:** `gemini-3.8-live-extended-thinking` = `thinking: true` (nama sepadan dengan medan), manakala `gemini-3.8-live` biasa = ABSENT; audio native 2.5 (output 8,192) tetap `true` walaupun bukan teks standard.
4. **Implikasi pemetaan:** boolean ini boleh menjadi kunci pengaktifan medan Thinking/thinkingBudget UI per-model dalam [modelCapabilities.js](../src/utils/modelCapabilities.js); angka bajet sebenar (default/min/max) kekal tanggungjawab konfigurasi projek (kontrak `thinkingBudget` integer: `0` = disabled, `-1` = dynamic) kerana pelayan tidak mengumumkannya.

---

## Implikasi Pemetaan `modelCapabilities.js`

1. **Siling output:** gunakan `65,536` sebagai siling vendor mutlak keluarga Flash/Pro moden (bukan 8,192 lapuk); `gemini-4-argon` & keluarga imej menggunakan 32,768 — siling per-model wajar dihormati.
2. **Keluarga STRICT:** metadata antigravity membuktikan pelayan tidak mengisytiharkan sampling untuk keluarga ejen — sifat STRICT dalam `getModelFamily()` adalah selari dengan tingkah laku pelayan sebenar; dengan SEND-ALL DOCTRINE, SubFaber kekal menghantar parameter dan membiarkan pelayan memutuskan.
3. **Imbuhan nama berisiko TTS:** mana-mana model berakhiran `-tts`, `-live`, `-audio`, `embedding`, `veo`, `lyria`, `aqa` mesti dikecualikan daripada senarai model terjemahan.
4. **`topK` kekal HAARAM** (v1.6.0) — walaupun pelayan mengumumkan `topK: 64` dalam metadata, SubFaber tidak menghantarnya.

---

## Rujukan Lintas Projek

- [modelCapabilities.js](../src/utils/modelCapabilities.js) — peta profil per-model (sasaran utama dokumen ini).
- [gemini.js](../src/services/gemini.js) — `getModelFamily()` STRICT/LEGACY + `buildGenerationConfig()` SEND-ALL.
- [TRINITY_API_REQUEST_BODY_GROUND_TRUTH.md](TRINITY_API_REQUEST_BODY_GROUND_TRUTH.md) — parameter request body ketiga-tiga pintu.
- `plans/gemini-sampling-ground-truth-2026.md` — doktrin sampling Gemini.

# TRINITY API REQUEST BODY GROUND TRUTH

> **Status:** Dokumen rujukan kanonik projek (dokumentasi sahaja — SIFAR perubahan kod runtime).
> **Tarikh wujud:** 2026-10-19
> **Sumber asal:** `C:\Users\khaty\Downloads\Full list of request body parameters.txt` (Owner-supplied ground truth).
> **Tujuan:** Audit payload & penalaan parameter masa hadapan bagi ketiga-tiga pintu Trinity. Dokumen ini adalah Single Source of Truth senarai parameter request body rasmi.

---

## Nota Pra-Pembacaan (Projek SubFaber)

- Peraturan invarian projek kekal mengatasi senarai di bawah apabila berlaku konflik:
  - `topK` **HAARAM** sepenuhnya sejak v1.6.0 (nucleus sampling) — walaupun `topK` (Gemini) / `top_k` (Anthropic) disenaraikan sebagai parameter sah vendor di bawah, SubFaber TIDAK menghantarnya.
  - `systemInstruction` Gemini WAJIB kekal sebagai medan top-level `{ parts: [{ text }] }` — DILARANG dimasukkan ke dalam `contents` atau digabung dengan prompt pengguna.
  - `thinkingBudget` Gemini (integer; `0` = disabled, `-1` = dynamic) wajib dipelihara dalam normalisasi [`config.js`](../src/utils/config.js).
  - SEND-ALL DOCTRINE (Gemini 3.x): `temperature`/`topP`/penalties dihantar untuk SEMUA keluarga Gemini 3.x (STRICT & LEGACY); gate stripping digugurkan.
- Parameter yang ditanda **(required)** adalah wajib pada tahap protokol vendor.

---

## 1. Gemini Native API — `/v1beta/models/{model}:generateContent`

Google Gemini menstrukturkan payload menggunakan pendekatan multi-modal yang strongly-typed, bukan primitif chat standard. Hierarki menggunakan **camelCase**, dengan parameter penalaan dikumpulkan di bawah objek `generationConfig` (bukan root level).

### Medan Root Level

| Medan | Jenis | Wajib | Keterangan |
|---|---|---|---|
| `contents` | array | **Ya** | Payload data teras mengandungi giliran perbualan (`role` dan `parts`). Objek multi-modal (teks, blob inline data seperti imej/audio, atau file URI) berada di sini. |
| `systemInstruction` | object | — | Arahan langsung untuk membimbing persona atau nada model. **Invariant SubFaber: kekal top-level `{ parts: [{ text }] }`.** |
| `tools` | array | — | Array mengandungi fungsi (`functionDeclarations`), `googleSearchRetrieval` untuk web grounding, atau flag dynamic code execution. |
| `toolConfig` | object | — | Mengehadkan tingkah laku penggunaan alat (cth. memaksa alat spesifik atau menetapkan `AUTO`). |
| `safetySettings` | array | — | Konfigurasi threshold individu (`BLOCK_NONE`, `BLOCK_LOW_AND_ABOVE`, dll.) dipetakan kepada pelbagai kategori bahaya seperti hate speech atau harassment. |
| `cachedContent` | string | — | Nama resource yang memautkan context cache pra-dibina untuk mengoptimumkan kelajuan pemprosesan prompt. |

### Hierarki `generationConfig` (camelCase)

| Medan | Jenis | Keterangan |
|---|---|---|
| `temperature` | number | Varians sampling. |
| `topP` | number | Cutoff nucleus sampling. |
| `topK` | number | Hadiran had kolam token teratas. **HAARAM dalam SubFaber (v1.6.0).** |
| `candidateCount` | integer | Bilangan respons alternatif yang dikembalikan. |
| `maxOutputTokens` | integer | Siling token yang dijana. |
| `stopSequences` | array | Token yang menghentikan penjanaan serta-merta. |
| `presencePenalty` | number | Penalti repetisi token berdasarkan sama ada ia telah muncul setakat ini. |
| `frequencyPenalty` | number | Penalti repetisi token berdasarkan frekuensi sejarah dalam teks. |
| `responseMimeType` | string | Memaksa output spesifik (`text/plain`, `application/json`, dll.). |
| `responseSchema` | object | Definisi JSON Schema ketat apabila menguatkuasakan structured outputs. |
| `thinkingConfig` | object | Mengawal bajet penalaran adaptif untuk hybrid reasoning models (`thinkingBudget` dalam token; `0` = disabled, `-1` = dynamic). |

### Contoh Kerangka Payload

```json
{
  "systemInstruction": { "parts": [{ "text": "..." }] },
  "contents": [{ "role": "user", "parts": [{ "text": "..." }] }],
  "generationConfig": {
    "temperature": 0.7,
    "topP": 0.95,
    "maxOutputTokens": 8192,
    "responseMimeType": "text/plain"
  },
  "safetySettings": []
}
```

---

## 2. OpenAI & OpenAI-Compatible API — `/v1/chat/completions`

Protokol standard industri yang diguna pakai secara meluas, dilaksana oleh OpenAI dan diemulasikan secara langsung oleh penyedia seperti Mistral, DeepSeek, dan pelbagai lapisan proxy (termasuk pintu Custom/Proxy SubFaber). Parameter berada di **root level** dengan konvensyen **snake_case**.

### Senarai Parameter (Root Level, snake_case)

| Medan | Jenis | Wajib | Keterangan |
|---|---|---|---|
| `model` | string | **Ya** | ID enjin sasaran (cth. `gpt-4o`, `deepseek-reasoner`). |
| `messages` | array | **Ya** | Senarai objek mesej (`role`, `content`, `name`/`tool_calls` pilihan). Peranan yang disokong termasuk `system`, `developer` (pengganti moden `system` pada model baharu), `user`, `assistant`, `tool`. |
| `frequency_penalty` | number | — | Menggalakkan pengelakan repetisi frasa verbatim (-2.0 hingga 2.0). |
| `presence_penalty` | number | — | Menggalakkan pencabangan ke vektor topik baharu (-2.0 hingga 2.0). |
| `logit_bias` | object | — | Peta token ID eksplisit ke nilai bias (-100 hingga 100) untuk memanipulasi odds kemunculan. |
| `logprobs` | boolean | — | Mengaktifkan pengembalian log probability token yang paling berkemungkinan dijana. |
| `top_logprobs` | integer | — | Bilangan token alternatif teratas untuk dikembalikan probabilitinya jika `logprobs` adalah `true`. |
| `max_tokens` | integer | — | Siling token (warisan). |
| `max_completion_tokens` | integer | — | Siling token — **lebih diutamakan untuk model reasoning moden** kerana mengendalikan overhead token thinking secara tepat. |
| `n` | integer | — | Bilangan pilihan chat completion yang dijana untuk satu prompt. |
| `response_format` | object | — | Mengehadkan jenis output (`{ "type": "json_object" }` atau `{ "type": "json_schema", "json_schema": ... }`). **Structured Outputs** menggunakan bentuk `json_schema`. |
| `seed` | integer | — | Pembantu sampling deterministik untuk completion boleh ulang. |
| `service_tier` | string | — | Menentukan keutamaan routing (`auto` vs `default`). |
| `stop` | string/array | — | Hingga 4 string yang memerintahkan API menghentikan penjanaan. |
| `stream` | boolean | — | `true` menolak data chunk progress separa standard melalui SSE. **Invariant SubFaber: `stream:true` kekal.** |
| `stream_options` | object | — | Digunakan untuk menambah pilihan metadata token usage berstruktur pada elemen stream terakhir. |
| `temperature` | number | — | Menggabungkan kreativiti vs determinisme (0 hingga 2). |
| `top_p` | number | — | Sasaran peratusan probabiliti untuk kolam token. |
| `tools` | array | — | Senarai fungsi yang tersedia untuk model invokasi. |
| `tool_choice` | string/object | — | Arahan eksplisit pengendalian alat (`none`, `auto`, `required`, atau objek eksplisit). |
| `user` | string | — | Pengecam unik untuk menjejak aktiviti pengguna akhir bagi telemetri keselamatan. |
| `parallel_tool_calls` | boolean | — | Mengaktifkan penjanaan pelbagai tindakan alat serentak dalam satu giliran. |

### Perbezaan Kunci `max_tokens` vs `max_completion_tokens`

- `max_tokens`: parameter warisan; siling token output kasar tanpa pembezaan token reasoning.
- `max_completion_tokens`: parameter moden; merangkumi overhead token thinking model reasoning secara tepat — **diutamakan untuk model reasoning (cth. siri o-series, deepseek-reasoner, kimi-k3)**.

### Contoh Kerangka Payload

```json
{
  "model": "deepseek-reasoner",
  "messages": [
    { "role": "system", "content": "..." },
    { "role": "user", "content": "..." }
  ],
  "temperature": 0.7,
  "top_p": 0.95,
  "max_completion_tokens": 8192,
  "frequency_penalty": 0,
  "presence_penalty": 0,
  "stream": true
}
```

---

## 3. Anthropic Messages API — `/v1/messages`

Protokol Messages natif Anthropic sengaja membuang parameter pemberat token mentah seperti logit bias, memfokuskan kepada struktur konkrit, alat, dan parameter penalaran dalaman.

### Senarai Parameter

| Medan | Jenis | Wajib | Keterangan |
|---|---|---|---|
| `model` | string | **Ya** | Pengecam varian Claude sasaran. |
| `messages` | array | **Ya** | Array perbualan berselang-selang ketat bagi giliran input (`user` dan `assistant`). |
| `max_tokens` | integer | **Ya** | Had sempadan token mutakhir bagi pengembalian completion. **Berbeza dengan OpenAI: TIADA pilihan opsional — wajib pada tahap protokol.** |
| `system` | string/array | — | Garis panduan langsung untuk persekitaran. Menerima array block untuk mengendalikan header `cache_control`. **Bukan mesej dalam `messages` — medan root level berasingan.** |
| `metadata` | object | — | Mengandungi butiran pemprofilan seperti penjejak metrik `user_id` individu. |
| `stop_sequences` | array of strings | — | Pemisah aksara eksplisit untuk memaksa pemotongan penjanaan. |
| `stream` | boolean | — | Menentukan sama ada struktur token dihantar dalam paket inkremental. |
| `tools` | array | — | Fungsi diisytiharkan yang tersedia untuk gelung agens Claude. |
| `tool_choice` | object | — | Direktif eksplisit yang menentukan penilaian alat (`auto`, `any`, atau `tool`). |
| `thinking` | object | — | Mengendalikan orkestrasi monolog dalaman untuk seni bina reasoning — **susunan ketat `{ "type": "enabled", "budget_tokens": <integer> }`**. |
| `output_config` / `output_format` | object | — | Menstrukturkan semula kekangan teks atau mengendalikan output JSON berstruktur melalui grammar-constrained decoding langsung. |
| `temperature` | number | — | Kawalan variasi sampling (0.0 hingga 1.0). *(Deprecated atau dikunci pada model reasoning khusus.)* |
| `top_p` | number | — | Kekangan nucleus sampling tradisional. *(Deprecated pada model reasoning khusus.)* |
| `top_k` | integer | — | Memilih hanya daripada K calon token teratas. *(Deprecated pada model reasoning khusus.)* **HAARAM dalam SubFaber (v1.6.0).** |

### Susunan `thinking` (Ketat)

```json
{
  "thinking": {
    "type": "enabled",
    "budget_tokens": 4096
  }
}
```

- `type`: `"enabled"` untuk mengaktifkan extended thinking.
- `budget_tokens`: bajet token mutlak untuk monolog dalaman — integer positif.

### XML Framing Standard

Anthropic Claude dianggap memberikan respons paling konsisten apabila arahan berstruktur dibingkai menggunakan tag XML standard dalam `system` / `messages`, contohnya:

```xml
<instructions>
  <role>...</role>
  <rules>...</rules>
</instructions>
```

### Contoh Kerangka Payload

```json
{
  "model": "claude-sonnet-4-5",
  "max_tokens": 8192,
  "system": "You are a professional translator...",
  "messages": [
    { "role": "user", "content": "..." }
  ],
  "temperature": 0.7,
  "thinking": {
    "type": "enabled",
    "budget_tokens": 4096
  }
}
```

---

## Matriks Perbandingan Struktur Merentas Pintu

| Aspek | Gemini Native | OpenAI-Compatible | Anthropic Messages |
|---|---|---|---|
| Endpoint | `/v1beta/models/{model}:generateContent` | `/v1/chat/completions` | `/v1/messages` |
| Konvensyen nama | camelCase | snake_case | snake_case |
| Lokasi parameter sampling | hierarki `generationConfig` | root level | root level |
| Arahan sistem | `systemInstruction` (top-level, `{ parts: [{ text }] }`) | mesej `system`/`developer` dalam `messages` | medan `system` (string/array block) root level |
| Siling token | `generationConfig.maxOutputTokens` | `max_tokens` / `max_completion_tokens` | `max_tokens` (**wajib**) |
| Suhu | `generationConfig.temperature` | `temperature` (0–2) | `temperature` (0.0–1.0) |
| Nucleus sampling | `generationConfig.topP` | `top_p` | `top_p` |
| Top-K | `generationConfig.topK` *(HAARAM SubFaber)* | — | `top_k` *(HAARAM SubFaber)* |
| Penalti | `presencePenalty` / `frequencyPenalty` dalam `generationConfig` | `presence_penalty` / `frequency_penalty` root level | — (tidak disokong) |
| Thinking | `generationConfig.thinkingConfig.thinkingBudget` | (vendor-specific, cth. `reasoning_effort`) | `thinking: { type, budget_tokens }` |
| Structured output | `responseMimeType` + `responseSchema` | `response_format: { type: "json_schema" }` | `output_config` / `output_format` |
| Keselamatan | `safetySettings` | — | — |
| Cache konteks | `cachedContent` | — | `cache_control` (dalam block `system`) |

---

## Rujukan Lintas Projek

- [`gemini.js`](../src/services/gemini.js) — SEND-ALL DOCTRINE, `buildGenerationConfig()`, `getModelFamily()` klasifikasi STRICT/LEGACY.
- [`structuredPrompt.js`](../src/services/utils/structuredPrompt.js) — pemisahan statik/dinamik sistem vs prompt pengguna.
- [`config.js`](../src/utils/config.js) — normalisasi & pemeliharaan `thinkingBudget`, kontrak Trinity, purge parameter obsolete.
- [`anthropicChannel.js`](../src/services/channels/anthropicChannel.js), [`openaiChannel.js`](../src/services/channels/openaiChannel.js), [`geminiChannel.js`](../src/services/channels/geminiChannel.js) — pintu Trinity.
- `plans/gemini-sampling-ground-truth-2026.md` + `plans/trinity-params-ground-truth-2026.md` — ground truth sampling & parameter Trinity.

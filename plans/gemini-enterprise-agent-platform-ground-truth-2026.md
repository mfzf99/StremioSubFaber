# Gemini Enterprise Agent Platform — Ground Truth 2026 (REST v1/v1beta1)

**Tarikh sedutan:** 2026-10-25 (dokumen Google Cloud terkini, last updated 2026-10-22 UTC)
**Sumber rasmi (5 halaman, disedut via Firecrawl MCP):**

1. Inference / GenerateContent: https://docs.cloud.google.com/gemini-enterprise-agent-platform/reference/models/inference
2. Function calling: https://docs.cloud.google.com/gemini-enterprise-agent-platform/reference/models/function-calling
3. Grounding: https://docs.cloud.google.com/gemini-enterprise-agent-platform/reference/models/grounding
4. Code execution: https://docs.cloud.google.com/gemini-enterprise-agent-platform/reference/models/code-execution-api
5. Tuning: https://docs.cloud.google.com/gemini-enterprise-agent-platform/reference/models/tuning

Dokumen ini adalah rujukan tunggal (single source of truth) untuk format HTTP request body Gemini Native dalam StremioSubFaber. Ia menggantikan rujukan latihan dalaman untuk skop REST payload.

---

## 1. INFERENCE — `generateContent` / `streamGenerateContent`

### 1.1 Endpoint REST

```
POST https://${LOCATION}-aiplatform.googleapis.com/v1/projects/${PROJECT_ID}/locations/${LOCATION}/publishers/google/models/${MODEL_ID}:generateContent
POST .../v1beta1/projects/${PROJECT_ID}/locations/${LOCATION}/publishers/google/models/${MODEL_ID}:generateContent
```

- `streamGenerateContent` = varian streaming (SSE).
- OpenAI-compat endpoint berasingan: `.../endpoints/openapi/chat/completions` (bukan domain dokumen ini).

### 1.2 Request body (struktur penuh rasmi)

```json
{
  "cachedContent": "string",
  "contents": [
    {
      "role": "user",
      "parts": [
        {
          "text": "string"
        }
      ]
    }
  ],
  "systemInstruction": {
    "role": "string",
    "parts": [{ "text": "string" }]
  },
  "tools": [
    {
      "functionDeclarations": [
        {
          "name": "string",
          "description": "string",
          "parameters": { "type": "object", "properties": {}, "required": [] }
        }
      ]
    }
  ],
  "toolConfig": {
    "functionCallingConfig": {
      "mode": "AUTO",
      "allowedFunctionNames": ["string"]
    }
  },
  "safetySettings": [
    {
      "category": "HARM_CATEGORY_HATE_SPEECH",
      "threshold": "BLOCK_NONE"
    }
  ],
  "generationConfig": {
    "temperature": 1.0,
    "topP": 0.95,
    "topK": 40,
    "candidateCount": 1,
    "maxOutputTokens": 8192,
    "presencePenalty": 0.0,
    "frequencyPenalty": 0.0,
    "stopSequences": ["string"],
    "responseMimeType": "text/plain",
    "responseSchema": {},
    "seed": 0,
    "responseLogprobs": false,
    "logprobs": 0,
    "audioTimestamp": false,
    "thinkingConfig": {
      "thinkingBudget": 0,
      "thinkingLevel": "LOW"
    },
    "mediaProcessing": "STATIC",
    "mediaResolution": "HIGH"
  },
  "continuationToken": "string",
  "labels": { "string": "string" }
}
```

**Invariant struktur:**
- `systemInstruction` KEKAL sebagai field top-level bertipe `Content` (`{ role, parts: [{ text }] }`). `role` di dalam `systemInstruction` DIABAIKAN oleh pelayan (dokumen rasmi: "The `role` field of `systemInstruction` is ignored"). Hanya `text` dalam `parts`; setiap kandungan dalam `part` berasingan.
- `contents[].role` hanya `user` atau `model`.
- `parts[]` union: `text` | `inlineData{mimeType,data}` | `fileData{mimeType,fileUri}` | `functionCall` | `functionResponse`, plus `thought`, `thoughtSignature`, `videoMetadata`, `mediaProcessing`, `mediaResolution`.

### 1.3 `generationConfig` — parameter & nilai

| Parameter | Jenis | Nota rasmi |
| --- | --- | --- |
| `temperature` | float | Range untuk model Gemini ≤3.5 Flash: `0.0–2.0`, default `1.0`. Recommended starting: `1.0`. |
| `topP` | float | Nucleus sampling. Range `0.0–1.0`. |
| `topK` | float | Top-K sampling (masih didokumenkan untuk API Vertex; lihat §1.4 untuk status mazhab projek). |
| `candidateCount` | int | Bilangan variasi respons. Preview; hanya `generateContent` (bukan stream). |
| `maxOutputTokens` | int | Had token output. |
| `presencePenalty` | float | Range `-2.0` hingga `<2.0`. |
| `frequencyPenalty` | float | Range `-2.0` hingga `<2.0`. |
| `stopSequences` | string[] | Max 5 item, case-sensitive. |
| `responseMimeType` | enum | `application/json` / `text/plain` (default) / `text/x.enum`. JSON mode tanpa `responseSchema` hanyalah "strong hint", bukan jaminan 100% valid JSON. |
| `responseSchema` | Schema | WAJIB bersama `responseMimeType: "application/json"` untuk 100% JSON valid. |
| `seed` | int | Deterministik best-effort, tidak dijamin. |
| `responseLogprobs` | boolean | DEPRECATED untuk Gemini 3.x. |
| `logprobs` | int | DEPRECATED untuk Gemini 3.x. Range 1–20. |
| `audioTimestamp` | boolean | Preview. |
| `thinkingConfig` | object | `{ thinkingBudget: int, thinkingLevel: enum }`. |
| `mediaResolution` | enum | `HIGH` / `MEDIUM` / `LOW`. |

### 1.4 ⚠️ AMARAN KRITIKAL — Gemini 3.6 Flash dan kemudian (dokumen rasmi verbatim)

> "For Gemini 3.6 Flash and later models, custom values for sampling parameters (`temperature`, `topP`, and `topK`) aren't supported and are ignored if set, and custom values for penalization parameters (`frequencyPenalty` and `presencePenalty`) return an error. Remove these parameters from your requests."

Implikasi mazhab untuk SubFaber (perlu digabung dengan SEND-ALL DOCTRINE sedia ada):
- Provider Vertex/pintu Gemini Native yang menuju model 3.6+: sampling params diabaikan oleh pelayan, penalty params pulangkan ERROR 400.
- SEND-ALL DOCTRINE sedia ada (hantar semua, biar provider tentukan) kekal sah untuk pintu generik — tetapi Owner perlu sedar bahawa dokumen rasmi kini mengesyorkan REMOVE untuk 3.6+. Keputusan mazhab akal (doctrine) tertakluk kepada Owner; dokumen ini merakamkan fakta sahaja.

### 1.5 `thinkingConfig` — status per model

- `thinkingBudget` (int): disokong Gemini 2.5 (auto max 8,192 token), **deprecated untuk Gemini 3**, **tidak disokong Gemini 4** (setting pulangkan `400 INVALID_ARGUMENT`).
- `thinkingLevel` (enum): `MINIMAL` (tidak disokong Gemini 4), `LOW`, `MEDIUM`, `HIGH`. Ini mekanisme rasmi Gemini 3+ untuk kawalan reasoning.

### 1.6 `continuationToken` (long decode)

- Hanya `v1beta1` (bukan `v1`).
- Gemini 4: single-request limit `65,536` token (streaming) / `32,768` (non-streaming); jumlah max `1,048,576` token.
- Resend payload asal + `continuationToken`; JANGA append partial text ke `contents`.
- `finishReason: CONTINUATION`.

### 1.7 `safetySettings`

- `category`: `HARM_CATEGORY_SEXUALLY_EXPLICIT`, `HARM_CATEGORY_HATE_SPEECH`, `HARM_CATEGORY_HARASSMENT`, `HARM_CATEGORY_DANGEROUS_CONTENT`.
- `threshold`: `OFF`, `BLOCK_NONE`, `BLOCK_LOW_AND_ABOVE`, `BLOCK_MEDIUM_AND_ABOVE`, `BLOCK_ONLY_HIGH`.
- `method`: `SEVERITY` / `PROBABILITY` (default PROBABILITY).

### 1.8 Response body

```json
{
  "candidates": [
    {
      "content": { "parts": [{ "text": "string" }] },
      "finishReason": "STOP",
      "continuationToken": "string",
      "safetyRatings": [],
      "citationMetadata": { "citations": [] },
      "avgLogprobs": 0.0,
      "logprobsResult": {}
    }
  ],
  "usageMetadata": {
    "promptTokenCount": 0,
    "candidatesTokenCount": 0,
    "totalTokenCount": 0
  },
  "modelVersion": "gemini-3.5-flash"
}
```

- `finishReason` enum: `STOP`, `MAX_TOKENS`, `CONTINUATION`, `SAFETY`, `RECITATION`, `BLOCKLIST`, `PROHIBITED_CONTENT`, `IMAGE_PROHIBITED_CONTENT`, `NO_IMAGE`, `SPII`, `MALFORMED_FUNCTION_CALL`, `OTHER`, `UNSPECIFIED`.
- `Candidate.content` kosong jika content filter memblok output.
- Untuk bilangan token, dokumen input (PDF/image) pada Gemini 3+ dikira sebagai image token.

---

## 2. FUNCTION CALLING

- Endpoint sama dengan inference (`:generateContent`).
- Tools: `"tools": [{ "functionDeclarations": [ ... ] }]` — camelCase dalam JSON REST (dokumen sintaks generik turut menunjukkan `function_declarations` dalam sesetengah contoh; contoh curl rasmi guna `functionDeclarations`).
- **Max 128 function declaration** per request.
- `FunctionDeclaration`:
  - `name` (wajib): mula dengan letter/underscore, `a-z A-Z 0-9 _ . -`, max 64 aksara.
  - `description` (Optional, disyorkan).
  - `parameters` (Optional): OpenAPI 3.0 Schema Object.
  - `response` (Optional): Schema output.
- `Schema.type` enum: `STRING`, `INTEGER`, `BOOLEAN`, `NUMBER`, `ARRAY`, `OBJECT` (uppercase dalam REST; contoh Node.js SDK guna `Type.OBJECT` dsb.).
- `Schema` fields: `type`, `description`, `enum`, `items`, `properties`, `required`, `nullable`.
- `toolConfig.functionCallingConfig`:
  - `mode`: `AUTO` (default) / `NONE` / `ANY`.
  - `allowedFunctionNames`: hanya sah bila `mode=ANY`.
  - `stream_function_call_arguments`: boolean, default `false` (stream argumen secara incremental).
- `functionCall` part: `{ name, args (Struct/JSON object), thought_signature (optional; mesti dihantar semula pada turn seterusnya untuk multi-step tool use) }`.
- `functionResponse`: `{ name, response (Struct), parts (FunctionResponsePart[] — multimodal inline_data/file_data) }`.
- Contoh curl penuh (rasmi):

```bash
curl -X POST \
  -H "Authorization: Bearer $(gcloud auth print-access-token)" \
  -H "Content-Type: application/json" \
  https://${LOCATION}-aiplatform.googleapis.com/v1/projects/${PROJECT_ID}/locations/${LOCATION}/publishers/google/models/${MODEL_ID}:generateContent \
  -d '{
    "contents": [{
      "role": "user",
      "parts": [{ "text": "What is the weather in Boston?" }]
    }],
    "tools": [{
      "functionDeclarations": [{
        "name": "get_current_weather",
        "description": "Get the current weather in a given location",
        "parameters": {
          "type": "object",
          "properties": {
            "location": { "type": "string", "description": "The city and state, e.g. San Francisco, CA" }
          },
          "required": ["location"]
        }
      }]
    }],
    "toolConfig": {
      "functionCallingConfig": {
        "mode": "ANY",
        "allowedFunctionNames": ["get_product_sku"]
      }
    },
    "generationConfig": {
      "temperature": 0.95,
      "topP": 1.0,
      "maxOutputTokens": 8192
    }
  }'
```

- Model disokong: Gemini 4 Argon (Cyber Permissive/Argon), 3.8 Live/Flash, 3.7 Flash, 3.6 Flash, 3.5 Flash-Lite/Flash, 3.1 Pro (preview)/Flash-Lite, 3 Flash (preview), 2.5 Pro/Flash-Lite/Flash (Live API native audio).

---

## 3. GROUNDING

Tiga mod grounding, semuanya melalui `tools`:

1. **Google Search (public web):**
```json
{ "tools": [{ "googleSearch": {} }] }
```
   - SDK menyokong `exclude_domains` (array domain untuk dikecualikan daripada hasil).
   - Tiada parameter tambahan diperlukan.

2. **Google Maps (geospatial):**
```json
{ "tools": [{ "googleMaps": { "enable_widget": true } }] }
```
   - `enable_widget` (wajib, boolean): `true` pulangkan token untuk Maps context widget UI.
   - Response: `grounding_metadata` → `grounding_support`, `grounding_chunks.maps` → `place_answer_sources.review_snippets`.
   - Atribut chunk: `title`, `uri`, `place_id`, `review_id`.

3. **Agent Search / private data (retrieval):**
```json
{ "tools": [{ "retrieval": { "vertexAiSearch": { "datastore": "projects/{project}/locations/{location}/collections/default_collection/dataStores/{datastore}" } } }] }
```
   - `datastore` wajib, fully-qualified resource ID.
   - WARNING rasmi: interface grounding ini TIDAK menyokong Agent Search "chunk mode" buat masa ini.

Model disokong: termasuk Nano Banana 2.1, 4 Argon, 3.8 Live/Flash, 3.7/3.6 Flash, 3.5 Flash-Lite/Flash, 3.1 Pro/Flash-Lite/Flash Image, 3 Pro Image, 3 Flash, 2.5 series.

---

## 4. CODE EXECUTION

```json
{ "tools": [{ "codeExecution": {} }] }
```

- Tool yang melaksanakan Python code dijana model secara automatik dan memulangkan hasil kepada model (iteratif sehingga output akhir).
- **Limitasi rasmi:** tiada sokongan file I/O; maksimum 30 saat sebelum timeout.

Part berkaitan dalam respons/contents:
- `Part.executable_code` → `ExecutableCode { language: "PYTHON", code: string }`.
- `Part.code_execution_result` → `CodeExecutionResult { outcome, output }`.
  - `outcome`: `OUTCOME_OK` | `OUTCOME_FAILED` (stderr ada sebab) | `OUTCOME_DEADLINE_EXCEEDED` (cancel, mungkin ada partial output).
  - `output`: stdout jika berjaya, stderr/deskripsi jika gagal.

Model disokong: 4 Argon series, 3.8/3.7/3.6 Flash, 3.5 Flash-Lite/Flash, 3.1 Pro (preview)/Flash-Lite, 3 Flash (preview), 2.5 Pro/Flash-Lite/Flash.

---

## 5. TUNING (supervised fine-tuning)

- Endpoint:
```
POST https://aiplatform.TUNING_JOB_REGION.rep.googleapis.com/v1/projects/PROJECT_ID/locations/TUNING_JOB_REGION/tuningJobs   (Gemini 3 & later)
POST https://TUNING_JOB_REGION-aiplatform.googleapis.com/v1/projects/PROJECT_ID/locations/TUNING_JOB_REGION/tuningJobs        (Gemini 2.5 & earlier)
```
- Request body:
```json
{
  "baseModel": "gemini-3.5-flash",
  "supervisedTuningSpec": {
    "trainingDatasetUri": "gs://...",
    "validationDatasetUri": "gs://...",
    "hyperParameters": {
      "epochCount": 1,
      "adapterSize": "ADAPTER_SIZE_FOUR",
      "learningRateMultiplier": 1.0
    },
    "exportLastCheckpointOnly": false,
    "evaluationConfig": { "metrics": [], "outputConfig": { "gcs_destination": { "output_uri_prefix": "gs://..." } } }
  },
  "tunedModelDisplayName": "string",
  "encryptionSpec": { "kmsKeyName": "..." },
  "serviceAccount": "..."
}
```
- Dataset: JSONL di Cloud Storage; disyorkan 100–500 contoh (validation max 256 contoh).
- `AdapterSize` enum: `ADAPTER_SIZE_UNSPECIFIED` / `_ONE` / `_FOUR` / `_EIGHT` / `_SIXTEEN`.
- Operasi lain: `tuningJobs.list` (GET), `tuningJobs.get` (GET + ID), `tuningJobs.cancel` (POST `:cancel`), `rebaseTunedModel`.
- Tuned model diakses melalui endpoint yang dipulangkan (`tunedModel.endpoint`) menggunakan `generateContent` biasa.
- Model boleh ditala: 3.5 Flash-Lite/Flash, 3.1 Flash-Lite, 2.5 Pro/Flash-Lite/Flash; turut disokong `translation-llm-002`.

---

## 6. MAZHAB & KEPUTUSAN PROJEK (SubFaber)

1. **`systemInstruction` top-level** — Sah sepenuhnya mengikut dokumen rasmi; `role` diabaikan pelayan. Kekalkan `{ parts: [{ text }] }` (lihat [`gemini.js`](../src/services/gemini.js)).
2. **`topK`** — Masih didokumenkan dalam API Vertex REST, tetapi mazhab projek (v1.6.0, nucleus sampling) kekal MENGHARAMKAN `topK` dalam payload SubFaber. Tidak berubah.
3. **Gemini 3.6+** — Dokumen rasmi kini menyatakan sampling params diabaikan & penalty params bererror. SEND-ALL DOCTRINE sedia ada (hantar semua, biar provider tentukan) bertentangan dengan arahan "Remove these parameters" untuk 3.6+. Mazhab akhir menanti keputusan Owner selepas audit pintu Gemini Native.
4. **`thinkingBudget`** — Sah untuk 2.5; deprecated untuk Gemini 3 (ganti `thinkingLevel`); bererror untuk Gemini 4. Pintu Gemini Native yang menghantar `thinkingBudget` integer kepada model 3.x masih diterima (deprecated ≠ removed) tetapi perlu dipantau.
5. **`thinkingLevel`** — Enum `MINIMAL|LOW|MEDIUM|HIGH`; belum wujud dalam kontrak Trinity semasa. Calon parameter masa depan jika Owner mahu kawalan reasoning Gemini 3+.
6. **Tools/grounding/code-execution** — Tidak digunakan dalam aliran terjemahan SubFaber buat masa ini; dirakam untuk rujukan kontrak masa depan (contohnya jika Agent Inspector mahu guna `responseMimeType: application/json` + `responseSchema` untuk output JSON terjamin).
7. **JSON mode** — `responseMimeType: "application/json"` sahaja tidak menjamin JSON valid; WAJIB bersama `responseSchema`. Relevan jika Agent Preflight/Inspector mahu output berstruktur di pintu Gemini Native.

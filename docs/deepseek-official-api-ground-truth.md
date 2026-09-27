# DeepSeek Official API — Ground Truth Report

> **MANDAT:** Pengauditan penuh dokumentasi rasmi `https://api-docs.deepseek.com/`
> **TARIKH AUDIT:** 2026-09-27 (UTC)
> **SUMBER:** 100% live-scrape daripada teks rasmi laman web DeepSeek API Docs (Docusaurus v3.1.0). TIADA andaian, interpolasi pihak ketiga, atau data memori lama.
> **METOD:** `firecrawl_map` (penemuan laluan) + `firecrawl_scrape` (halaman demi halaman, `maxAge:0` = live fetch, tiada cache lama).

---

## 0. TOPOLOGI API RASMI (DARIPADA "Your First API Call")

| PARAM | VALUE (rasmi) |
| --- | --- |
| base_url (OpenAI format) | `https://api.deepseek.com` |
| base_url (Anthropic format) | `https://api.deepseek.com/anthropic` |
| base_url (Beta features: prefix completion, FIM, strict tool calls) | `https://api.deepseek.com/beta` |
| api_key |apply for an API key di `https://platform.deepseek.com/api_keys` |
| model | `deepseek-flash`, `deepseek-v4-pro` |

Legacy model names `deepseek-v4-flash` dan `deepseek-v4-flash-vision-exp` **masih diterima** tetapi model sebenar telah bersara (retired); permintaan diarahkan ke model `deepseek-flash` (DeepSeek-V4.1-Flash) dan dibill pada harga Flash.
**Notis Change Log (2026-04-24):** nama lama `deepseek-chat` dan `deepseek-reasoner` dihentikan pada 2026-07-24.

---

## A. JADUAL SPESIFIKASI MODEL RASMI

Sumber: `https://api-docs.deepseek.com/quick_start/pricing/` (Models & Pricing) + `https://api-docs.deepseek.com/api/list-models/` (Lists Models).

| Atribut | `deepseek-flash` | `deepseek-v4-pro` |
| --- | --- | --- |
| **MODEL ID (string API tepat)** | `deepseek-flash` | `deepseek-v4-pro` |
| **Model version rasmi** | DeepSeek-V4.1-Flash | DeepSeek-V4-Pro-0813 |
| **`context_window` (token)** | 1,048,576 (1M) | 1,048,576 (1M) |
| **`max_output_tokens` (MAXIMUM)** | 384K (393,216) | 384K (393,216) |
| **Thinking mode** | Sokong kedua-dua non-thinking & thinking (**default: thinking enabled**, effort default `high`) | Sokong kedua-dua non-thinking & thinking (**default: thinking enabled**, effort default `high`) |
| **JSON Output** (`response_format`) | ✓ | ✓ |
| **Tool Calls / Function Calling** | ✓ | ✓ |
| **Responses API** (`/responses`) | ✓ | ✓ |
| **Anthropic API** (`/anthropic`) | ✓ | ✓ |
| **Chat Prefix Completion (Beta)** | ✓ | ✓ |
| **FIM Completion (Beta)** | Non-thinking mode sahaja | Non-thinking mode sahaja |
| **Vision (input imej)** | ✓ (JPEG, PNG, GIF, WebP) | **Tidak disokong** |
| **Input modalities** (`/models`) | `["text","image"]` | `["text"]` |
| **Output modalities** | `["text"]` | `["text"]` |
| **Effort levels disokong** | `low`, `high`, `max` (default `high`) | `low`, `high`, `max` (default `high`) |

### A.1 Harga Rasmi (per 1M tokens, USD)

| Kategori | `deepseek-flash` OFF-PEAK | `deepseek-flash` PEAK | `deepseek-v4-pro` OFF-PEAK | `deepseek-v4-pro` PEAK |
| --- | --- | --- | --- | --- |
| 1M Input (CACHE HIT) | $0.003 | $0.006 | $0.022 | $0.044 |
| 1M Input (CACHE MISS) | $0.15 | $0.30 | $0.66 | $1.32 |
| 1M Output | $0.60 | $1.20 | $1.98 | $3.96 |

- **Peak hours:** 01:00–04:00 dan 06:00–10:00 UTC, Isnin–Jumaat, tidak termasuk cuti umum China. Semua jam lain (termasuk hujung minggu & cuti China sepenuhnya) = off-peak. Off-peak = ½ harga peak.
- **Deduction rules:** `expense = jumlah token × harga`. Baki granted digunakan dahulu sebelum topped-up balance.

### A.2 Had Konkurensi (Concurrency Limit, akaun)

| Model | Concurrency Limit |
| --- | --- |
| `deepseek-flash` | 2500 |
| `deepseek-v4-pro` | 500 |

- Diraqum pada tahap **akaun**, bukan API key. Lebihan → HTTP 429. Permintaan penambahan kapasiti boleh dibuat (percuma).

---

## B. SPESIFIKASI PARAMETER REQUEST — Chat Completions

Sumber: `https://api-docs.deepseek.com/api/create-chat-completion/` — `POST https://api.deepseek.com/chat/completions`.

### B.1 Senarai Parameter Request Penuh (100% rasmi)

| Parameter | Type | Required | Default | Spesifikasi rasmi tepat |
| --- | --- | --- | --- | --- |
| `messages` | object[] | **required** | — | ≥1 mesej. Role: `system` / `user` / `assistant` / `tool`. Kandungan `user` & `tool` boleh string ATAU array content-parts (text / `image_url` / `file`) untuk input imej (rujuk Vision guide). `system` & `assistant` menerima string sahaja (imej di `system`/`assistant` → 400). |
| `model` | string | **required** | — | Nilai yang dibenarkan: `deepseek-flash`, `deepseek-v4-pro` (enum literal dalam schema). |
| `thinking` | object \| null | optional | `{type:"enabled"}` | `{ "type": "enabled" \| "disabled" }` — suis thinking vs non-thinking mode. Default `enabled`. |
| `reasoning_effort` | string | optional | — | Nilai: `none`, `low`, `high`, `max`. `none` mematikan thinking; `low`/`high`/`max` mengaktifkan thinking. Default effort = `high`. **Pemetaan keserasian:** `minimal`→`low`; `medium`/`xhigh`→`high`. |
| `max_tokens` | integer \| null | optional | 8K non-thinking / 64K thinking (128K jika `reasoning_effort:"max"`) | 1 hingga 384K (393,216). Jumlah input+output terhad oleh context length model. |
| `response_format` | object \| null | optional | `{type:"text"}` | `{ "type": "text" \| "json_object" }`. `json_object` menjamin output JSON sah — **mesti** juga arahkan model keluarkan JSON melalui system/user prompt, jika tidak model boleh menghasilkan whitespace tanpa henti. |
| `stop` | string \| string[] \| null | optional | — | Maksimum 16 sekuens berhenti. |
| `stream` | boolean \| null | optional | — | Partial deltas sebagai SSE, ditamatkan dengan `data: [DONE]`. |
| `stream_options` | object \| null | optional | — | `{ "include_usage": bool }`. Mesti dengan `stream:true`, jika tidak API pulangkan **400**. Chunk terakhir sebelum `[DONE]` membawa `usage` penuh (tiada chunk usage berasingan; statistik menunggang chunk kandungan terakhir yang `choices`-nya tepat satu elemen tanpa kandungan baharu + `finish_reason` non-null). |
| `temperature` | number \| null | optional | `1` | Julat 0–2. **"Has no effect in thinking mode."** Disarankan ubah `temperature` ATAU `top_p`, bukan kedua-duanya. |
| `top_p` | number \| null | optional | `1` | Julat >0 hingga 1. **"It only takes effect in thinking mode, where the effective range is 0.95–1.0: values below 0.95 are treated as 0.95. In non-thinking mode it is fixed at 1.0 and the value you pass is ignored."** |
| `tools` | object[] \| null | optional | — | Hanya `type:"function"` disokong. Function: `name` (a-z A-Z 0-9 underscore dash, maks 128), `description`, `parameters` (JSON Schema; omit = parameter kosong), `strict` (beta, default `false`). Nama tool mesti unik. |
| `tool_choice` | string \| object \| null | optional | `none` jika tiada tools; `auto` jika ada | `none` / `auto` / `required`, atau `{"type":"function","function":{"name":"..."}}`. **`required` dan named tool choice TIDAK disokong dalam thinking mode → API pulangkan 400.** Matikan thinking untuk guna. |
| `logprobs` | boolean \| null | optional | — | true → pulangkan log probability setiap output token dalam `content` mesej. |
| `top_logprobs` | integer \| null | optional | — | 0–20. Mesti set `logprobs:true` jika digunakan. |
| `user_id` | nullable | optional | — | Charset `[a-zA-Z0-9\-_]`, maks 512. Fungsi rasmi: (1) asingkan identiti pengguna untuk semakan keselamatan kandungan, (2) asingkan KVCache untuk pengurusan privasi, (3) asingkan penjadualan pengguna. JANGAN masukkan maklumat privasi. |
| `frequency_penalty` | — | **DEPRECATED** | — | "This parameter is no longer supported. It will not take effect if you pass it to the API." |
| `presence_penalty` | — | **DEPRECATED** | — | "This parameter is no longer supported. It will not take effect if you pass it to the API." |

**STATUS PARAMETER REASONING (jawapan langsung kepada mandat):**
> **`reasoning_effort` DISOKONG SECARA RASMI sebagai parameter top-level** Chat Completions DeepSeek API (dan `reasoning.effort` dalam Responses API; `output_config.effort` dalam format Anthropic). Ia BUKAN sekadar wujud melalui `reasoning_content` — `reasoning_content` ialah **field output**, manakala `reasoning_effort` + `thinking` ialah **parameter input**.

### B.2 Struktur Mesej `assistant` (input) — khas

| Field | Type | Keterangan rasmi |
| --- | --- | --- |
| `prefix` | bool | (Beta) `true` → paksa model memulakan jawapan dengan kandungan prefix. Mestilah mesej terakhir dalam `messages`. Perlu `base_url="https://api.deepseek.com/beta"`. |
| `reasoning_content` | string \| null | (Beta) Input CoT untuk thinking mode dalam **Chat Prefix Completion** (mesej assistant terakhir). Mesti dengan `prefix:true`. |

### B.3 Response Object (non-streaming) — field penuh

| Field | Keterangan rasmi |
| --- | --- |
| `id` | Unique identifier. |
| `choices[].finish_reason` | Nilai: `stop`, `length`, `content_filter`, `tool_calls`, `insufficient_system_resource`, `aborted`. |
| `choices[].index` | Index pilihan. |
| `choices[].message.content` | string \| null. Kandungan jawapan. |
| `choices[].message.reasoning_content` | **string \| null — FIELD RASMI CHAIN-OF-THOUGHT.** "For thinking mode only. The reasoning contents of the assistant message, before the final answer." |
| `choices[].message.tool_calls[]` | `{id, type:"function", function:{name, arguments}}`. |
| `choices[].logprobs` | `{content:[{token,logprob,bytes,top_logprobs[]}], reasoning_content:[...]}` — logprobs untuk kandungan DAN reasoning. Logprob `-9999.0` = token sangat tidak berkemungkinan (luar top-20). |
| `created` | Unix timestamp (saat). |
| `model` | Model yang digunakan. |
| `system_fingerprint` | FP konfigurasi backend. |
| `object` | `"chat.completion"`. |
| `usage` | Lihat B.4. |

### B.4 `usage` Object — field penuh (kedua-dua chat & FIM)

| Field | Keterangan rasmi |
| --- | --- |
| `prompt_tokens` | Token prompt. **= `prompt_cache_hit_tokens` + `prompt_cache_miss_tokens`** (formula rasmi). |
| `prompt_tokens_details.cached_tokens` | Token prompt yang hit cache. **Sama nilai dengan `prompt_cache_hit_tokens`.** |
| `prompt_cache_hit_tokens` | Token prompt yang HIT context cache. |
| `prompt_cache_miss_tokens` | Token prompt yang MISS context cache. |
| `completion_tokens` | Token penjanaan. |
| `completion_tokens_details.reasoning_tokens` | Token penjanaan reasoning (CoT). |
| `total_tokens` | prompt + completion. |

### B.5 Streaming Chunk

- `object: "chat.completion.chunk"`; delta membawa `content`, `reasoning_content`, `role`, `tool_calls`.
- Tool call: chunk pertama bawa `id`,`type`,`function`; chunk berikut hanya `function.arguments`.
- `data: [DONE]` menamatkan stream. `usage` penuh pada chunk terakhir (lihat `stream_options`).

---

## C. PROTOKOL REASONING / THINKING

Sumber: `https://api-docs.deepseek.com/guides/thinking_mode/` + Chat Completions API reference.

### C.1 Nama Field JSON Rasmi Token Pemikiran

| Konteks | Field rasmi |
| --- | --- |
| Output non-streaming | `choices[].message.reasoning_content` (string \| null) |
| Output streaming | `choices[].delta.reasoning_content` |
| Input (prefix completion beta) | `messages[].reasoning_content` pada mesej assistant terakhir |
| Responses API output | `output[].type:"reasoning"` → `content[].type:"reasoning_text"` → `text` |
| Anthropic format | content block `type:"thinking"` (disokong); `redacted_thinking` TIDAK disokong |
| Logprobs | `choices[].logprobs.reasoning_content[]` |
| Metrik | `usage.completion_tokens_details.reasoning_tokens` |

### C.2 Kawalan Toggle & Effort (Rasmi, merentas format)

| | OpenAI format | Anthropic format | Responses API |
| --- | --- | --- | --- |
| Toggle | `{"thinking":{"type":"enabled"/"disabled"}}` | `{"reasoning":{"effort":"none/low/high/max"}}` | `{"reasoning":{"effort":"..."}}` |
| Effort | `{"reasoning_effort":"low/high/max"}` | `{"output_config":{"effort":"low/high/max"}}` | `{"reasoning":{"effort":"..."}}` |

- Thinking **enabled secara default**, effort default `high`.
- Pemetaan effort rasmi (requested → actual): `minimal`→`low`; `low`→`low`; `medium`→`high`; `high`→`high`; `xhigh`→`high`; `max`→`max`; `ultra`→`max`.
- Dengan OpenAI SDK, `thinking` perlu dihantar dalam `extra_body`.

### C.3 Parameter Yang Tidak Berkesan Dalam Thinking Mode

- `temperature`, `presence_penalty`, `frequency_penalty`: **tidak disokong dalam thinking mode**; untuk keserasian, penghantaran TIDAK menimbulkan ralat tetapi juga **tiada kesan**.
- `top_p`: hanya berkesan dalam thinking mode, julat efektif **0.95–1.0** (bawah 0.95 diperlakukan sebagai 0.95). Dalam non-thinking mode tetap 1.0, nilai diabaikan.

### C.4 Peraturan `reasoning_content` Dalam Multi-turn (krusial)

1. **Jika request TIDAK bawa `tools`:** `reasoning_content` giliran terdahulu **tidak perlu** dikembalikan; walaupun dihantar, ia **diabaikan dan TIDAK digabungkan** ke konteks.
2. **Jika request MEMBAWA `tools`:** `reasoning_content` SEMUA giliran terdahulu **WAJIB dikembalikan sepenuhnya** dan akan digabungkan ke konteks — termasuk giliran tanpa tool call. Kegagalan → **API pulangkan 400 ralat**.
3. Pola rasmi: append terus `response.choices[0].message` (membawa `content`, `reasoning_content`, `tool_calls`).

### C.5 Streaming Handling

```python
reasoning_content = ""
content = ""
for chunk in response:
    if chunk.choices[0].delta.reasoning_content:
        reasoning_content += chunk.choices[0].delta.reasoning_content
    else:
        content += chunk.choices[0].delta.content
```
(threshold rasmi: reasoning tiba lebih dahulu, kemudian content — tiada `data: [DONE]` khas untuk reasoning)

### C.6 Thinking + Tool Calls

- Disokong sejak DeepSeek-V3.2. Model boleh lakukan pelbagai sub-giliran reasoning→tool_calls sebelum jawapan akhir.
- `tool_choice:"required"` / named choice → **400** dalam thinking mode (rujuk B.1).
- `strict` tool-call mode (beta, `base_url=/beta`): disokong kedua-dua thinking & non-thinking; jenis schema dibenarkan: object, string, number, integer, boolean, array, enum, anyOf, $ref/$def; semua properties object wajib `required` + `additionalProperties:false`; parameter disokong: `pattern`, `format` (email/hostname/ipv4/ipv6/uuid), `const`, `default`, `minimum/maximum/exclusiveMinimum/exclusiveMaximum/multipleOf`; TIDAK disokong: `minLength/maxLength`, `minItems/maxItems`.

---

## D. MEKANISMA PROMPT CACHING (Context Caching on Disk)

Sumber: `https://api-docs.deepseek.com/guides/kv_cache/` + Models & Pricing.

### D.1 Mekanisma Asas

- **Diaktifkan secara default untuk SEMUA pengguna** — tiada kod diperlukan.
- Setiap request mencetuskan pembinaan **hard disk cache**. Prefix bertindih dengan request terdahulu → diambil dari cache = **"cache hit"**.

### D.2 Peraturan Persist & Hit (khusus era Sliding Window Attention)

- Cache hit **hanya** jika prefix telah "persisted" ke unit cache. Setiap **cache prefix unit** ialah unit lengkap & bebas; request berikut hanya hit jika **PADAN PENUH** dengan satu unit.
- Tiga mekanisma persist rasmi:
  1. **Persist di sempadan request** — dua unit: di posisi akhir input pengguna & di posisi akhir output model.
  2. **Pengesanan common prefix** — prefix bersama merentas request dipersist sebagai unit bebas (cth: `A+B` kemudian `A+C` → `A` dipersist; `A+D` kemudian boleh hit `A`).
  3. **Persist pada selang token tetap** — input/output panjang dihiris menjadi unit pada selang token tetap supaya tidak tidak-boleh-cache.

### D.3 Semakan Cache Hit/Miss Dalam `usage`

| Field | Maksud |
| --- | --- |
| `usage.prompt_cache_hit_tokens` | Bilangan token input yang HIT cache |
| `usage.prompt_cache_miss_tokens` | Bilangan token input yang MISS cache |
| `usage.prompt_tokens_details.cached_tokens` | Nilai sama dengan `prompt_cache_hit_tokens` |
| `usage.prompt_tokens` | `hit + miss` |
| Responses API | `usage.input_tokens_details.cached_tokens` |

### D.4 Diskaun & Had Masa

- Diskaun dilaksanakan melalui **tier harga cache hit vs cache miss** (rujuk A.1): cth. Flash peak: hit $0.006 vs miss $0.30 (≈50× lebih murah).
- Had masa cache (teks rasmi semasa): sistem beroperasi **"best-effort"** — TIDAK menjamin 100% hit rate. Pembinaan cache mengambil beberapa saat; **cache yang tidak lagi digunakan akan dibersihkan secara automatik, biasanya dalam beberapa jam hingga beberapa hari.**
- **Nota audit:** dokumen semasa TIDAK menyatakan lagi sebarang "syarat minimum token" untuk cache aktif. Satu-satunya penyataan rasmi semasa ialah peraturan unit prefix di D.2. (Kelakuan legacy "64-block minimum" tidak lagi wujud dalam teks rasmi semasa dan tidak boleh dianggap sah.)
- Output masih dijana melalui pengiraan/inferens dan dipengaruhi parameter seperti `temperature` — cache hanya padan bahagian **prefix** input.
- `user_id` boleh digunakan untuk **KVCache isolation** (privasi).
- Responses API: `prompt_cache_key` / `prompt_cache_retention` **TIDAK disokong** — caching diurus automatik.

---

## E. SENARAI RALAT RASMI (ERROR CODES)

Sumber: `https://api-docs.deepseek.com/quick_start/error_codes/`.

| Kod | Nama | Punca rasmi | Penyelesaian rasmi |
| --- | --- | --- | --- |
| **400** | Invalid Format | Format body request tidak sah | Ubah body mengikut hints mesej ralat; rujuk API Docs |
| **401** | Authentication Fails | API key salah | Semak API key; cipta di platform.deepseek.com/api_keys jika tiada |
| **402** | Insufficient Balance | Baki habis | Semak baki & tambah dana di halaman Top up |
| **422** | Invalid Parameters | Parameter request tidak sah | Ubah parameter mengikut hints mesej ralat |
| **429** | Rate Limit Reached | Request terlalu laju (melebihi concurrency) | Kawal kadar; sementara boleh beralih ke provider lain (cth. OpenAI) |
| **500** | Server Error | Isu pelayan DeepSeek | Cuba semula selepas rehat; hubungi sokongan jika berterusan |
| **503** | Server Overloaded | Pelayan terbeban trafik tinggi | Cuba semula selepas rehat |

### E.1 Ralat Parameter Khusus Yang Dinyatakan Dalam Skema

- `stream_options` tanpa `stream:true` → **400**.
- `tool_choice:"required"` atau named choice dalam thinking mode → **400**.
- Imej dalam mesej `system`/`assistant` → **400**.
- `input_image` tanpa `image_url` mahupun `file_id` (atau kedua-duanya sekali) → **400**.

### E.2 Keep-Alive

- Request tak bermula inferens selepas **10 minit** → pelayan tutup sambungan. Non-streaming: baris kosong berterusan; streaming: SSE comment `: keep-alive`.

---

## F. ENDPOINT RASMI LENGKAP

| Endpoint | Kaedah | Nota rasmi |
| --- | --- | --- |
| `POST https://api.deepseek.com/chat/completions` | Chat | Object response `chat.completion` / chunk |
| `POST https://api.deepseek.com/responses` | Responses API | OpenAI Responses format; stateless; tiada `[DONE]` — tamat dengan `response.completed/incomplete/failed`; `previous_response_id`/`store` TIDAK disokong (`store:false` tetap); parameter tak disokong **diabaikan secara senyap** |
| `POST https://api.deepseek.com/beta/completions` | FIM Completion (Beta) | `prompt` (+`suffix` optional); `max_tokens` FIM maks **4K**; `echo` tak boleh bersama `suffix`/`logprobs`; object `text_completion` |
| `GET https://api.deepseek.com/models` | Lists Models | `object:"list"`; metadata: `name`, `context_window`, `max_output_tokens`, `input/output_modalities`, `effort.supported_levels/default_level`, `api_capabilities.anthropic_messages.system_prompt_update` (`in-history` untuk Flash, `leading-only` untuk Pro) |
| `GET https://api.deepseek.com/user/balance` | Get User Balance | `is_available`, `balance_infos[]{currency:CNY/USD, total_balance, granted_balance, topped_up_balance}` (string) |
| `POST/GET/DELETE https://api.deepseek.com/files[/...]` | Files API | `purpose:"user_data"`; maks 64 MiB/file; storan 25 GiB, 10 000 fail; expir 1 jam–30 hari atau kekal; response `file-api-...` |
| `POST https://api.deepseek.com/anthropic[/v1]/messages` | Anthropic format | `x-api-key` disokong; mapping: `claude-opus*`→`deepseek-v4-pro` (harga Pro), `claude-sonnet*`/`claude-haiku*`→`deepseek-flash`; `top_k` diabaikan; `thinking.budget_tokens` diabaikan |

### F.1 Compatibility Responses API (param utama)

- **Disokong:** `model`, `input`, `instructions`, `stream`, `temperature` (0–2; tiada kesan thinking), `top_p` (0.95 bawah dalam thinking), `max_output_tokens`, `top_logprobs` (0–20), `tools` (function sahaja), `tool_choice` (semua termasuk required/named), `reasoning.effort`, `text.format` (`text`/`json_object`/**`json_schema`** — structured output schema disokong di sini, tidak seperti Chat Completions), `user`.
- **Diabaikan senyap:** `parallel_tool_calls`, `max_tool_calls`, `store`, `background`, `metadata`, `include`, `prompt`, `truncation`, `service_tier`, `safety_identifier`, `prompt_cache_key`, `prompt_cache_retention`, `context_management`, `stream_options`.
- **Tidak disokong (stateless):** `previous_response_id`, `conversation`.
- Input items disokong: `message` (`user`/`assistant`/`system`/`developer`), `function_call`, `function_call_output`, `custom_tool_call(_output)` (hanya `apply_patch`), `reasoning`. `web_search_call` yang dikembalikan dalam input masih dipulihkan ke konteks.

### F.2 Anthropic API Compatibility (field utama)

- Header: `x-api-key` penuh; `anthropic-version` diabaikan; `anthropic-beta` diabaikan untuk `/messages` (diperlukan `files-api-2025-04-14` untuk Files API).
- Disokong penuh: `max_tokens`, `stop_sequences`, `stream`, `system`, `temperature` (0–2).
- `top_p`: hanya berkesan thinking mode (bawah 0.95); `top_k`: diabaikan; `metadata.user_id`: disokong.
- `tool_choice`: `none`/`auto`/`any`/`tool` disokong (`disable_parallel_tool_use` diabaikan).
- Message blocks: `text` ✓, `image` (base64/url/file) ✓, `thinking` ✓, `tool_use`/`tool_result` ✓, `server_tool_use`/`web_search_tool_result` ✓; `document`, `search_result`, `redacted_thinking`, `code_execution_tool_result`, `mcp_tool_use/result`, `container_upload` ✗.

### F.3 Vision (deepseek-flash sahaja)

- Format: JPEG, PNG, GIF, WebP (dikesan dari kandungan sebenar fail).
- 3 kaedah input: base64 data URL inline; URL http(s) (maks 8192 char, fail ≤32 MiB, muat turun ≤60s); Files API `file_id` (≤64 MiB).
- Had: body request 48 MiB; maks 600 imej/request; jumlah 64 MiB tanpa `file_id` (200 MiB dengan); dimensi maks 8192px/sebelah (4096px bila ≥15 imej).
- Token imej: auto-resize ke ~1300×1300; **had atas 1024 token/imej**; `detail:low` downscale ke 512×512.
- Hanya dalam mesej `user` (OpenAI) / `user`+`developer` (Responses).

### F.4 Konvensyen Token

- 1 aksara Inggeris ≈ 0.3 token; 1 aksara Cina ≈ 0.6 token. Tokenizer rasmi boleh dimuat turun (pakej `deepseek_v4_tokenizer.zip` dari CDN DeepSeek).

---

## G. CONTOH REQUEST RASMI KANONIKAL (dipinjam harfiah dari docs)

```bash
curl https://api.deepseek.com/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${DEEPSEEK_API_KEY}" \
  -d '{
        "model": "deepseek-flash",
        "messages": [
          {"role": "system", "content": "You are a helpful assistant."},
          {"role": "user", "content": "Hello!"}
        ],
        "thinking": {"type": "enabled"},
        "reasoning_effort": "high",
        "stream": false
      }'
```

Contoh curl penuh skema (dari API reference) turut membawa: `max_tokens: 4096`, `response_format: {"type":"text"}`, `stop: null`, `stream_options: null`, `temperature: 1`, `top_p: 1`, `tools: null`, `tool_choice: "none"`, `logprobs: false`, `top_logprobs: null`.

---

## H. SENARAI SEMAK INTEGRITI AUDIT (BUKTI SIFAR CICIR)

Status setiap laluan dikenal pasti melalui `firecrawl_map` + navigasi. Bahasa audit: **EN sahaja** (`/zh-cn/*` dikecualikan secara sengaja kerana kandungan dwibahasa setara; laluan bahasa Inggeris dijejak 100%).

### H.1 Quick Start

| # | URL | Status | Nota |
| --- | --- | --- | --- |
| 1 | `https://api-docs.deepseek.com/` (Your First API Call) | ✅ DISCRAPED | base_url, model, contoh chat |
| 2 | `https://api-docs.deepseek.com/quick_start/pricing/` | ✅ DISCRAPED | Spesifikasi model + harga + concurrency |
| 3 | `https://api-docs.deepseek.com/quick_start/parameter_settings/` | ✅ DISCRAPED | Jadual temperature: Coding/Math 0.0; Data 1.0; General/Translation 1.3; Creative 1.5 |
| 4 | `https://api-docs.deepseek.com/quick_start/token_usage/` | ✅ DISCRAPED | Konvensyen token + kalkulator |
| 5 | `https://api-docs.deepseek.com/quick_start/rate_limit/` | ✅ DISCRAPED | Concurrency, `user_id` isolation, keep-alive 10 min |
| 6 | `https://api-docs.deepseek.com/quick_start/error_codes/` | ✅ DISCRAPED | 400/401/402/422/429/500/503 |
| 7 | `https://api-docs.deepseek.com/quick_start/faq` | ⛔ 404 SAH (live) | Halaman telah dibuang oleh DeepSeek |
| 8 | `https://api-docs.deepseek.com/quick_start/models_list` | ⛔ 404 SAH (live) | Digantikan oleh `/quick_start/pricing` + `/api/list-models` |
| 9 | `https://api-docs.deepseek.com/quick_start/quick_start`, `/quick_start/model`, `/quick_start/model_introduce`, `/quick_start/first_call`, `/quick_start/error-codes`, `/quick_start/pricing.md`, `/quick_start/pricing-details-usd`, `/models`, `/test` | 🔁 VARIAN REDIRECT/STUB (dikenal pasti dalam map) | Redundansi laluan Docusaurus; kandungan sama dgn #1–#6 |

### H.2 Guides

| # | URL | Status | Nota |
| --- | --- | --- | --- |
| 10 | `https://api-docs.deepseek.com/guides/thinking_mode/` | ✅ DISCRAPED | Toggle, effort mapping, reasoning_content rules, tool calls |
| 11 | `https://api-docs.deepseek.com/guides/reasoning_model` | ⛔ 404 SAH (live) | Digantikan oleh `/guides/thinking_mode` |
| 12 | `https://api-docs.deepseek.com/guides/tool_calls/` | ✅ DISCRAPED | Function calling + strict mode + skema |
| 13 | `https://api-docs.deepseek.com/guides/json_mode/` | ✅ DISCRAPED | JSON Output 4 syarat |
| 14 | `https://api-docs.deepseek.com/guides/multi_round_chat/` | ✅ DISCRAPED | Statelessness + konkatenasi konteks |
| 15 | `https://api-docs.deepseek.com/guides/kv_cache/` | ✅ DISCRAPED | Context caching penuh |
| 16 | `https://api-docs.deepseek.com/guides/chat_prefix_completion/` | ✅ DISCRAPED | Beta, `prefix:true`, base_url /beta |
| 17 | `https://api-docs.deepseek.com/guides/fim_completion/` | ✅ DISCRAPED | Beta, maks 4K |
| 18 | `https://api-docs.deepseek.com/guides/vision/` | ✅ DISCRAPED | 3 kaedah imej + had penuh |
| 19 | `https://api-docs.deepseek.com/guides/files_api/` | ✅ DISCRAPED | Upload/list/retrieve/delete + Anthropic-compatible |
| 20 | `https://api-docs.deepseek.com/guides/responses_api/` | ✅ DISCRAPED | Streaming events + jadual keserasian penuh |
| 21 | `https://api-docs.deepseek.com/guides/anthropic_api/` | ✅ DISCRAPED | Mapping model Claude + keserasian medan |
| 22 | `https://api-docs.deepseek.com/guides/coding_agents/` | ✅ DISCRAPED | Claude Code/OpenCode/OpenClaw env vars |
| 23 | `https://api-docs.deepseek.com/guides/usage-limit` | ⛔ 404 SAH (live) | Dilupuskan |
| 24 | `https://api-docs.deepseek.com/guides/pricing`, `/guides/function_calling`, `/en/guides/function_calling`, `/guides/harness`, `/quick_start/agent_integrations/deepseek_harness` | 🔁 STUB/VARIAN | Redirect ke halaman setara (#2, #12, #22) |

### H.3 API Reference

| # | URL | Status | Nota |
| --- | --- | --- | --- |
| 25 | `https://api-docs.deepseek.com/api/create-chat-completion/` | ✅ DISCRAPED | Skema request/response penuh |
| 26 | `https://api-docs.deepseek.com/api/create-response/` | ✅ DISCRAPED | Skema Responses API penuh |
| 27 | `https://api-docs.deepseek.com/api/create-completion/` | ✅ DISCRAPED | FIM Completion API (Beta) |
| 28 | `https://api-docs.deepseek.com/api/list-models/` | ✅ DISCRAPED | Skema `/models` + contoh kedua-dua model |
| 29 | `https://api-docs.deepseek.com/api/get-user-balance/` | ✅ DISCRAPED | Skema `/user/balance` |
| 30 | `https://api-docs.deepseek.com/api/create-file`, `/api/list-files`, `/api/retrieve-file`, `/api/delete-file` | 🔁 TERLIPUT VIA GUIDE #19 | Kesemua operasi Files API didokumenkan penuh (borang, query params, response) dalam guide Files API; endpoint laluan disahkan wujud dalam map |

### H.4 Change Log / Misc

| # | URL | Status | Nota |
| --- | --- | --- | --- |
| 31 | `https://api-docs.deepseek.com/updates/` | ✅ DISCRAPED | 2024-05-17 → 2026-09-10 (V4.1-Flash release, pricing change) |
| 32 | `https://api-docs.deepseek.com/news/` (index) | ✅ SAH VIA MAP | Laman berita index (senarai pautan tarikh) |
| 33 | `https://api-docs.deepseek.com/news/news260910`, `news260821`, `news260813`, `news260424`, `news251201`, `news250929`, `news250922`, `news250120`, `news0802`, `news0725` | 🔁 MULUT RESMI RELEASE-NOTES | Nota pelepasan yang kandungan rasminya telah dimuatkan sepenuhnya dalam Change Log #31 (kandungan identik diterbitkan di kedua-dua laluan) |
| 34 | `https://api-docs.deepseek.com/quick_start/agent_integrations/*` (claude_code, codex, opencode, openclaw, github_copilot, deepcode, crush, hermes, reasonix, workbuddy, oh_my_pi, pi_mono, qoder, reasonix) | 🔁 INTEGRASI AGENT (bukan spesifikasi API) | Panduan konfigurasi alat pihak ketiga; tiada spesifikasi API baharu; env-vars utama dimuatkan dalam #22 |

**TOTAL: 23 halaman kandungan inti DISCRAPED penuh + 3 laluan 404 disahkan secara langsung + varians redirect dikesan dan dipetakan. Sifar laluan dokumen API yang tidak dijejak.**

---

## I. SENARAI SEMAK WAJIB MANDAT (SEKSYEN A–E)

- [x] **A. Jadual spesifikasi model rasmi** — ID string tepat, context window, max output, keupayaan, struktur harga cache hit/miss/output + peak/off-peak.
- [x] **B. Spesifikasi parameter `/chat/completions`** — senarai penuh termasuk `logprobs`, `tools`, `tool_choice`, `stream_options`, `user_id`; status `reasoning_effort` = **disokong rasmi sebagai parameter top-level** (jawapan eksplisit mandat).
- [x] **C. Protokol reasoning** — field JSON rasmi (`reasoning_content` output / `reasoning_text` Responses API / `thinking` Anthropic), handling normal vs streaming, peraturan multi-turn dengan/tanpa `tools`.
- [x] **D. Mekanisma prompt caching** — default-on, peraturan unit prefix (3 mekanisma persist), semakan hit/miss dalam `usage`, tier diskaun, best-effort + pembersihan jam→hari; **tiada syarat minimum token dalam teks rasmi semasa**.
- [x] **E. Senarai ralat rasmi** — 400/401/402/422/429/500/503 dengan maksud + penyelesaian harfiah.
- [x] **Pengesahan integriti** — senarai semak penuh semua URL (Seksyen H).

---

*Laporan ini dijana secara programatik daripada live-fetch Firecrawl (`maxAge:0`) pada 2026-09-27T07:00–07:07 UTC. Setiap fakta adalah petikan/diparafrasekan secara ketat daripada halaman rasmi yang tersenarai dalam Seksyen H. Sekiranya DeepSeek mengemas kini docs, halaman bertanda ✅ perlu discrap semula.*

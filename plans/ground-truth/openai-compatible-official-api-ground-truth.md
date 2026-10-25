# OpenAI & OpenAI-Compatible API — Ground Truth Rasmi (Mazhab OpenAI-Compatible)

> **URL SUMBER:**
> - https://platform.openai.com/docs/api-reference/chat (redirect → developers.openai.com/api/reference/resources/chat)
> - https://api-docs.deepseek.com/api/create-chat-completion
> - https://api-docs.deepseek.com/guides/thinking_mode/
>
> **TARIKH SEDUTAN:** 2026-10-25 ~06:10 (waktu tempatan KL)
> **KAEDAH:** Firecrawl MCP `firecrawl_scrape` — live fetch (`maxAge: 0`), `onlyMainContent: true`.
> **SKOP:** Verifikasi kontrak pintu OpenAI-Compatible SubFaber (`openaiChannel.js` / `providers/openaiCompatible.js`): standard `reasoning_effort`, suis `thinking`, spesifikasi `response_format`, dan medan token.

---

## RINGKASAN PARAMETER REST (POST /chat/completions)

| Parameter | OpenAI (kanonik) | DeepSeek (vendor serasi) |
|---|---|---|
| Endpoint | `POST /chat/completions` (+ GET/DELETE/POST list/retrieve/update — CRUD penuh kini wujud) | `POST https://api.deepseek.com/chat/completions` |
| `messages` | required, roles: `developer`/`system`/`user`/`assistant`/`tool`/`function` (deprecated) | required, roles: `system`/`user`/`assistant`/`tool` |
| `model` | string bebas | enum: `deepseek-flash`, `deepseek-v4-pro` sahaja |
| `max_tokens` vs `max_completion_tokens` | Skema semasa menyenaraikan keluarga parameter completion (lihat resources/completions); halaman ini model-objek respons sahaja | `max_tokens` integer nullable, **1–384K (393,216)**; lalai **8K non-thinking / 64K thinking (128K bila `reasoning_effort: "max"`)** |
| `temperature` | standard | 0–2, lalai 1; **"Has no effect in thinking mode"** |
| `top_p` | standard | 0–1; **deepseek-flash: hanya berkesan dalam thinking mode, julat efektif 0.95–1.0 (bawah 0.95 → dikira 0.95); non-thinking fixed 1.0 & diabaikan. deepseek-v4-pro: thinking mode diabaikan sepenuhnya (fixed 0.95 bila `tools` hadir, selainnya 1.0); non-thinking berkesan** |
| `frequency_penalty` / `presence_penalty` | standard | **DEPRECATED — "no longer supported. It will not take effect if you pass it to the API"** |
| `response_format` | standard (text/json_object/json_schema keluarga) | `{ "type": "text" | "json_object" }` sahaja; JSON Output mesti disertakan arahan JSON dalam system/user message (else unending whitespace) |
| `stream` / `stream_options` | standard; `include_usage` + `include_obfuscation` baharu | standard; `include_usage`; chunk akhir bawa usage sebelum `data: [DONE]` |
| `stop` | standard | max **16** sequences |
| `logprobs` / `top_logprobs` | standard | standard (top_logprobs ≤ 20) |
| `tools` / `tool_choice` | + custom tools (grammar lark/regex), allowed_tools baharu | function sahaja; **`required` & named tool choice TIDAK disokong dalam thinking mode → 400**; `strict: true` Beta |
| `user_id` | `user` string | `user_id` [a-zA-Z0-9\-_] max 512 — KVCache isolation + scheduling isolation |
| `service_tier` | auto/default/flex/scale/priority/fast | — |

---

## 1. DEEPSEEK `thinking` — SUIS RASMI

Objek `thinking` nullable pada root body:
- `type`: `"enabled"` | `"disabled"` — **lalai `enabled`**.
- OpenAI SDK: mesti dilalui melalui `extra_body={"thinking": {"type": "enabled"}}`.

**Padanan 3 format rasmi (jadual verbatih DeepSeek):**

| Kawalan | OpenAI Format | Anthropic Format | Responses API Format |
|---|---|---|---|
| Toggle thinking | `{"thinking": {"type": "enabled/disabled"}}` | `{"reasoning": {"effort": "none/low/high/max"}}` (`none` = off) | sama |
| Effort | `{"reasoning_effort": "low/high/max"}` | `{"output_config": {"effort": "low/high/max"}}` | sama |

---

## 2. `reasoning_effort` — KLASIFIKASI RASMI & JAWAPAN ISU STANDARD

**Enum skema rasmi DeepSeek (create-chat-completion):** `["none", "low", "high", "max"]` — lalai `high`.

Kutipan verbatih:
> "Controls the thinking mode toggle and the thinking effort. `none` disables thinking mode; `low` / `high` / `max` enable thinking mode. The default effort is `high`. For compatibility with existing software, `minimal` is accepted and mapped to `low`, and `medium` / `xhigh` are accepted and mapped to `high`."

**Jadual pemetaan effort → effort sebenar:**

| Diminta | Sebenar |
|---|---|
| minimal | low |
| low | low |
| medium | high |
| high | high |
| xhigh | high |
| max | max |
| ultra | max |

**Implikasi kontrak SubFaber (v3.18.2 terkunci `low/high/max`):**
1. Kontrak terkunci projek (`low`/`high`/`max`, sifar `medium`) adalah **100% selaras dengan nilai efektif rasmi** — `medium` memang hanya alias ke `high`, jadi mengecualikannya tidak kehilangan apa-apa fungsi.
2. **Jurang dikenal pasti:** SubFaber menggunakan token `'disabled'` untuk "Off (No Thinking)" pada keluarga DeepSeek (docs/deepseek ground truth lama merekodkan enum lama). Enum rasmi semasa ialah `'none'` untuk mematikan thinking. `minimal` diterima sebagai kompatibiliti lama → dipetakan `low`. Tiada sebut `disabled` dalam skema semasa. ⚠️ Ini isu yang perlu Owner putuskan sama ada wire-value `disabled` masih diterima oleh gateway (rootsys mungkin masih menerima warisan) — dokumentasi rasmi menyebut hanya `none`. Rujukan empirikal: log v3.19.3 mencatat "deepseek-v4.1-flash rejects reasoningEffort=disabled" — konsisten dengan `none` sebagai nilai sah semasa.
3. Keluaran `reasoning_content` dikembalikan pada `message.reasoning_content` (selari dengan `content`) — bukan `reasoning` wrapper.

---

## 3. PERILAKU PARAMETER DALAM THINKING MODE (DeepSeek)

- `temperature`, `presence_penalty`, `frequency_penalty`: **tiada kesan** (diterima tanpa error demi kompatibiliti).
- `top_p`: model-dependent (lihat jadual §Ringkasan).
- Multi-turn tanpa `tools`: `reasoning_content` TIDAK perlu dihantar balik (diabaikan).
- Multi-turn dengan `tools`: `reasoning_content` WAJIB dihantar balik sepenuhnya — else **400 error**.
- Bajet token output: lalai berbeza ikut mod (8K/64K/128K effort `max`).

---

## 4. RESPONSE_FORMAT & KESAHAN JSON

- DeepSeek: `{"type": "json_object"}` menjamin JSON sah, TAPI arahan "hasilkan JSON" wajib hadir dalam prompt — tanpanya model menjana whitespace tanpa henti sehingga had token (request "seemingly stuck").
- `finish_reason` DeepSeek: `stop`, `length`, `content_filter`, `tool_calls`, **`insufficient_system_resource`**, **`aborted`** (dua nilai baharu berbanding OpenAI).
- OpenAI kanonik: keluarga `response_format` termasuk json_schema (strict structured outputs) — digunakan oleh INSPECTOR_SCHEMA_CONTRACT SubFaber melalui `meta.responseFormat`; skema respons OpenAI mengesahkan kekal sokongan pada ChatCompletions.

---

## 5. OPENAI KANONIK — PERKEMBANGAN RELEVAN (2026-10-25)

- **CRUD chat completions**: `POST/GET/DELETE /chat/completions[/{id}]` + `GET .../messages` — completion kini objek boleh disimpan/disenaraikan.
- **Role `developer`**: menggantikan `system` pada model o1 dan lebih baharu.
- **`stream_options.include_obfuscation`**: medan `obfuscation` pada chunk (default ON) — mitigasi side-channel; boleh dimatikan untuk bandwidth.
- **`prompt_cache_breakpoint`**: penanda cache prefix pada content part (mode `explicit`, TTL `30m`/`12h`).
- **Custom tools**: format grammar `lark`/`regex` + tool_choice `allowed_tools`.
- **`system_fingerprint`**: kini **Deprecated** pada respons.
- `metadata`: 16 pasangan key-value (key ≤64, value ≤512 aksara).
- Streaming SSE: `data: [DONE]` terminator kekal; chunk usage akhir membawa statistik penuh.

---

## 6. KESIMPULAN AUDIT KEPATUHAN PINTU OPENAI-COMPATIBLE SUBFABER

| Item kod | Verdict |
|---|---|
| Payload standard `{model, messages, stream, temperature, max_tokens}` ([`openaiCompatible.js`](../../src/services/providers/openaiCompatible.js) `buildChatRequest()`) | ✅ PATUH kanonik |
| `reasoning_effort` terkunci `low/high/max` (v3.18.2) | ✅ SELARAS nilai efektif rasmi (`medium` = alias `high` sahaja) |
| Wire-value `'disabled'` (Off) untuk DeepSeek | ⚠️ **JURANG** — enum rasmi semasa `none`; `disabled` tidak tercatat dalam skema 2026-10-25. Perlu keputusan Owner (ubah wire ke `none` ATAU kekalkan `disabled` jika gateway rootsys masih menerima). Tiada perubahan dibuat (mandat dokumentasi sahaja) |
| Penalti frequency/presence dihantar (SEND-ALL) | ✅ Selamat — DeepSeek terima tanpa error (no-op); DeepSeek sendiri menanda deprecated |
| `response_format` json_schema untuk Inspector | ✅ Sokongan kanonik OpenAI kekal |
| `stream: true` laluan rootsys/Caddy | ✅ SSE `data: [DONE]` + chunk usage akhir — konsisten parser SubFaber |

**Sifar perubahan kod runtime dibuat dalam mandat ini.**

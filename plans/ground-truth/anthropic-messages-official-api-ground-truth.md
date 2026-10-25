# Anthropic Messages API — Ground Truth Rasmi (Mazhab Anthropic)

> **URL SUMBER:**
> - https://docs.anthropic.com/en/api/messages (redirect → platform.claude.com/docs/en/api/http/messages)
> - https://docs.anthropic.com/en/docs/build-with-claude/extended-thinking (redirect → platform.claude.com/docs/en/build-with-claude/extended-thinking)
>
> **TARIKH SEDUTAN:** 2026-10-25 ~06:09 (waktu tempatan KL)
> **KAEDAH:** Firecrawl MCP `firecrawl_scrape` — live fetch (`maxAge: 0`), `onlyMainContent: true`. API version terkini laman: **2026-10-21**.
> **SKOP:** Verifikasi kontrak pintu Anthropic SubFaber (`anthropicChannel.js` / `providers/anthropic.js`): status rasmi `thinking: {type:'adaptive'}`, siling `max_tokens`, kekangan `budget_tokens`, dan parameter `temperature`/`top_p`.

---

## RINGKASAN PARAMETER REST (POST /v1/messages)

| Parameter | Nilai rasmi |
|---|---|
| Endpoint | `POST /v1/messages` (+ `POST /v1/messages/count_tokens`) |
| `model` | Enum rasmi: `claude-haiku-5-5`, `claude-sonnet-5-5`, `claude-fable-5-1`, + 17 lagi / string bebas |
| `max_tokens` | **MANDATORI** (kekal dalam skema respons) — tiada lalai dinyatakan; cap siling belum berubah daripada klau/claudette era 64k dari sudut skema (tiada angka baharu dalam rujukan ini) |
| `system` | Medan top-level (bukan mesej dalam array) — `SystemMessageParam { content, role: "system" }` kini wujud dalam `MessageParam` union juga |
| `temperature` / `top_p` | Parameter standard, masih diterima (tiada deprecation dalam rujukan ini) |
| `metadata.user_id` | Optional, max 512 aksara, mesti opaque |
| `stream` | `RawMessageStreamEvent` — `message_start`, `content_block_start/delta/stop`, `message_delta`, `message_stop`, `ping` |
| `stop_reason` | `end_turn`, `max_tokens`, `stop_sequence`, `tool_use`, `pause_turn`, `refusal`, `model_context_window_exceeded` |

---

## 1. ThinkingConfigParam — KLASIFIKASI RASMI (4 VARIAN)

Union `ThinkingConfigParam` rasmi (verbatih daripada rujukan skema 2026-10-21):

| Varian | Medan | Kontrak |
|---|---|---|
| `ThinkingConfigEnabled` | `type: "enabled"`, `budget_tokens`, `display?` | **Manual extended thinking.** `budget_tokens` **≥ 1024** dan **< `max_tokens`** (kecuali interleaved manual di mana boleh melebihi). Thinking tokens dikira ke dalam siling `max_tokens` |
| `ThinkingConfigAdaptive` | `type: "adaptive"`, `display?` | **Claude tentukan sendiri bila & berapa untuk berfikir.** `display`: `"summarized"` (pulangkan thinking normal) \| `"omitted"` (redacted + signature untuk kesinambungan multi-turn); lalai bergantung model |
| `ThinkingConfigDisabled` | `type: "disabled"` | Fikiran dimatikan |
| `ThinkingConfigBetweenTools` | `type: "between_tools"` | Fikiran antara panggilan tool |

Kutipan verbatih skema:
> "With `{"type": "adaptive"}`, Claude decides when and how much to think. With `{"type": "enabled"}` (manual extended thinking), you set a `budget_tokens` of at least 1,024. Thinking tokens count toward your `max_tokens` limit."

---

## 2. STATUS RASMI `type: "adaptive"` — **SAH & RASMI** ✅

**JAWAPAN MUKTAMAD bagi isu `adaptive` SubFaber:** `thinking: {type: "adaptive"}` ialah **varian pertama-class dalam union ThinkingConfigParam** pada API version 2026-10-21. Ia BUKAN vendor extension atau nilai tidak sah. Kontrak BEKU dalam [`src/services/agentInspector.js`](../../src/services/agentInspector.js) (baris 663) dan lalai [`src/services/channels/anthropicChannel.js`](../../src/services/channels/anthropicChannel.js) (baris 94) adalah **selaras dengan spesifikasi rasmi** — tiada tindakan pembaikan diperlukan.

**Perincian sokongan per-model (dari halaman Extended Thinking):**
- Model extended-thinking-sahaja (Claude Sonnet 4.5 (deprecated), Opus 4.5, Haiku 4.5, dan Claude 4 awal): `type: "adaptive"` **pulangkan 400 error** — adaptive tidak tersedia; kekalkan `budget_tokens`.
- Claude Opus 4.6 / Sonnet 4.6: `budget_tokens` **deprecated** — migrasi ke adaptive disyorkan.
- Claude 4.7 dan kemudian (Opus 5.5, Sonnet 5, Sonnet 5.5, Fable 5.1, Haiku 5.5): `type: "enabled"` **pulangkan 400 error** — WAJIB guna `thinking: {type: "adaptive"}` dengan kawalan kedalaman melalui `output_config: {effort: ...}`.

**Migrasi rasmi (contoh verbatih):**
```json
{ "model": "claude-sonnet-4-6", "max_tokens": 16000,
  "thinking": { "type": "enabled", "budget_tokens": 10000 } }
```
menjadi:
```json
{ "model": "claude-sonnet-4-6", "max_tokens": 16000,
  "thinking": { "type": "adaptive" },
  "output_config": { "effort": "high" } }
```
- `effort` lalai: Sonnet 4.6 = `"high"`; Opus 5.5 & Haiku 5.5 = `"medium"`; model effort lain = `"high"`.

**Implikasi SubFaber:** lalai `adaptive` anthropicChannel adalah PILIHAN MASA DEPAN yang betul — ia sah pada model Claude 4.5+ generasi baharu dan satu-satunya pilihan sah pada 4.7+. Untuk model 4.5 dan lebih awal (extended-thinking-only), pelanggan perlu menetapkan `thinking: {type:'enabled', budget_tokens}` secara eksplisit — laluan eksplisit ini telah disediakan oleh `options.thinking !== undefined` dalam `buildProvider()`.

---

## 3. BUDGET_TOKENS — PERATURAN PENUH (verifikasi logik `buildTokenBudgets()` SubFaber)

1. **Minimum 1,024 token** — API menolak nilai lebih kecil.
2. **< `max_tokens`** — thinking dikira dalam siling output giliran (kecuali interleaved manual: boleh melebihi `max_tokens` kerana bajet merentasi semua blok thinking satu giliran).
3. **Tiada cache pre-warming** — tidak boleh digabung dengan `max_tokens: 0`.
4. **Sasaran, bukan cap keras** — Claude boleh berhenti sebelum bajet habis; `max_tokens` kekal siling keras jumlah output.
5. **Penalaan:** tugas ringkas mula ~1,024; tugas kompleks 16,000+. Bajet >32k → guna batch processing elak timeout rangkaian.
6. **Teksstik berbilled:** `usage.output_tokens_details.thinking_tokens` (stream: hanya pada `message_delta` akhir).
7. **Cache:** menukar `budget_tokens` antara request membatalkan cache breakpoint (nilai dirender ke prompt). Kekalkan bajet stabil sepanjang perbualan ber-cache.

**Verifikasi kod SubFaber:** [`src/services/providers/anthropic.js`](../../src/services/providers/anthropic.js) `buildTokenBudgets()` (reserve `MIN_OUTPUT_TOKENS_WITH_THINKING`, clamp gabungan output+thinking bawah siling) adalah **lebih konservatif daripada spesifikasi** — selamat, tiada pelanggaran.

---

## 4. INTERLEAVED THINKING (beta header)

- Header beta: `interleaved-thinking-2025-05-14` — diterima pada semua model, diabaikan jika tidak disokong.
- Opus 4.6: manual mode tiada interleaved — hanya adaptive mode interleaves.
- Sonnet 4.6: header berfungsi tetapi deprecated; adaptive interleaves automatik tanpa header.
- Haiku 4.5: tidak disokong (header diterima & diabaikan).

---

## 5. THINKING BLOCK — KONTRAK RESPONS

- `ThinkingBlock { type: "thinking", signature, thinking }` — `signature` WAJIB dihantar balik tidak diubah untuk multi-turn (400 `invalid_request_error` jika diubah).
- `RedactedThinkingBlock { type: "redacted_thinking", data }` — dihantar balik tidak diubah.
- Model 4.5+ mengekalkan blok thinking giliran terdahulu dalam konteks & membilled input; model lebih lama membuangnya.
- Manual mode: giliran assistant akhir WAJIB bermula dengan blok thinking (adaptive menggugurkan keperluan ini).
- `StopReason` baharu berbanding kod warisan: `pause_turn`, `refusal`, `model_context_window_exceeded`.

---

## 6. STRUCTURED OUTPUT & OUTPUT_CONFIG (BARU — belum digunakan SubFaber)

- `OutputConfig { effort, format }`:
  - `effort`: `"low" | "medium" | "high" | "xhigh" | "max"` — kawal kedalaman penaakulan (pengganti budget_tokens pada model baharu).
  - `format`: `JSONOutputFormat { type: "json_schema", schema }` — **struktur output JSON rasmi tanpa assistant-prefill hack**. Nota: laluan prefill `'['` dalam [`anthropic.js`](../../src/services/providers/anthropic.js) (baris 119) masih sah untuk model lama, tetapi `output_config.format` ialah laluan rasmi model baharu.
- `RefusalStopDetails { category, explanation }` — kategori: `cyber`, `bio`, `frontier_llm`, `reasoning_extraction`, `general_harms`.

---

## 7. TEMPERATURE & TOP_P

Kedua-duanya kekal parameter standard dalam skema 2026-10-21 — **tiada deprecation** pada tarikh sedutan. Kelakuan 400 "temperature & top_p cannot both" yang dikendalikan auto-compliance retry dalam [`anthropic.js`](../../src/services/providers/anthropic.js) (baris 222, 294-303) kekal relevan sebagai pelindung gelagat pelayan. (Halaman error-codes khusus tidak termasuk dalam senarai putih mandat ini; kelakuan 400 kekal seperti diamalkan.)

---

## 8. KESIMPULAN AUDIT KEPATUHAN PINTU ANTHROPIC SUBFABER

| Item kod | Verdict |
|---|---|
| `system` top-level string ([`anthropicChannel.js:55`](../../src/services/channels/anthropicChannel.js)) | ✅ PATUH |
| `max_tokens` mandatori + clamp 64000 ([`anthropicChannel.js:38`](../../src/services/channels/anthropicChannel.js)) | ✅ PATUH (konservatif) |
| Header `x-api-key` + `anthropic-version` ([`anthropic.js:183-186`](../../src/services/providers/anthropic.js)) | ✅ PATUH |
| `thinking: {type:'enabled', budget_tokens}` laluan manual ([`anthropic.js:108-112`](../../src/services/providers/anthropic.js)) | ✅ PATUH — budget ≥1024 & reserve output dipenuhi oleh `buildTokenBudgets()` |
| `thinking: {type:'adaptive'}` BEKU ([`agentInspector.js:663`](../../src/services/agentInspector.js), [`anthropicChannel.js:94`](../../src/services/channels/anthropicChannel.js)) | ✅ **SAH RASMI** — varian union pertama-class; wajib pada Claude 4.7+; 400 hanya pada model 4.5 dan lebih awal |
| Non-stream default channel (kelulusan owner #4) | ✅ PATUH — tiada keperluan stream dalam kontrak rasmi yang memaksa perubahan |

**Tiada perubahan kod runtime diperlukan berdasarkan sedutan ini.**

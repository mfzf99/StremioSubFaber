# Gemini Native API — Ground Truth Rasmi (Mazhab Gemini Native)

> **URL SUMBER:**
> - https://ai.google.dev/api/generate-content (Last updated **2026-10-22 UTC**)
> - https://ai.google.dev/gemini-api/docs/thinking (Last updated **2026-10-14 UTC**)
> - https://docs.cloud.google.com/gemini-enterprise-agent-platform/reference/models/inference (diperoleh via probe search, disedut semula melalui kedua-dua halaman di atas)
>
> **TARIKH SEDUTAN:** 2026-10-25 ~06:11 (waktu tempatan KL)
> **KAEDAH:** Firecrawl MCP `firecrawl_scrape` — live fetch (`maxAge: 0`), `onlyMainContent: true`.
> **SKOP:** Verifikasi kontrak pintu Gemini Native SubFaber (`geminiChannel.js` / `gemini.js` `buildGenerationConfig()`): enum `thinkingLevel`, status penalty 3.6+, parameter `continuationToken`, dan invariant `systemInstruction` top-level.

---

## RINGKASAN PARAMETER REST

| Parameter | Nilai rasmi |
|---|---|
| Endpoint non-stream | `POST https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent` |
| Endpoint stream | `POST .../v1beta/models/{model}:streamGenerateContent?alt=sse` |
| `contents[]` | **required** — `Content { parts[], role: 'user'|'model' }` |
| `systemInstruction` | Optional, `object (Content)` — **TOP-LEVEL** (bukan mesej dalam contents) ✅ invariant SubFaber |
| `generationConfig` | `GenerationConfig` — lihat §2 |
| `continuationToken` | Optional, base64 bytes — TOP-LEVEL pada request DAN pada `Candidate` respons (lihat §4) |
| `safetySettings[]` | Satu per kategori; kategori Gemini: HARASSMENT, HATE_SPEECH, SEXUALLY_EXPLICIT, DANGEROUS_CONTENT, CIVIC_INTEGRITY (deprecated), JAILBREAK |
| `labels` | map user metadata; kunci `safety_identifier` untuk aggregator |
| `serviceTier` / `store` / `cachedContent` | standard |

---

## 1. THINKINGCONFIG — KLASIFIKASI RASMI

`generationConfig.thinkingConfig`:
- `includeThoughts` boolean — fikiran dipulangkan bila tersedia.
- `thinkingBudget` integer — bilangan token fikiran. **Tiada deprecation marker pada v1beta reference ini** (Enterprise doc: deprecated pada Gemini 3, 400 pada Gemini 4).
- `thinkingLevel` enum — "Recommended for Gemini 3 or later models. Use with earlier models results in an error." (verbatih).

**Enum `ThinkingLevel` (v1beta reference):** `THINKING_LEVEL_UNSPECIFIED`, `MINIMAL`, `LOW`, `MEDIUM`, `HIGH`.

**Jadual sokongan per-model (halaman thinking, 2026-10-14):**

| Model | Default | Levels disokong |
|---|---|---|
| gemini-4-argon | On (medium) | low, medium, high |
| gemini-3.8-flash | On (medium) | low, medium, high |
| gemini-3.6-flash | On (medium) | minimal, low, medium, high |
| gemini-3.5-flash-lite | On (minimal) | minimal, low, medium, high |
| gemini-3.1-pro-preview | On (high) | low, medium, high |
| gemini-3.1-flash-lite-image | On (minimal) | minimal, high |
| gemini-3-flash-preview | On (high) | minimal, low, medium, high |
| gemini-3-pro-preview | On (high) | low, high |
| gemini-2.5-pro / 2.5-flash | On | low, medium, high |
| gemini-2.5-flash-lite | Off | low, medium, high |

**Verifikasi kontrak SubFaber:** `geminiChannel` lalai `thinkingLevel:'low'` — sah untuk semua keluarga 3.x/2.5 yang menyokong `low`. Nota: `minimal` TIDAK disokong pada 3.8-flash/4-argon (hanya 3.6-flash, 3.5-flash-lite, 3-flash-preview, 3.1-flash-lite-image) — routing `getModelFamily()` SubFaber tidak pernah menghantar `minimal`, jadi selamat.

---

## 2. GENERATIONCONFIG — STATUS SAMPLING & PENALTY (KUTIPAN VERBATIH 2026-10-22)

Pada `temperature`: **"This field is no longer supported and is silently ignored on Gemini 3.6 Flash and newer models."**
Pada `topP`: **"This field is no longer supported and is silently ignored on Gemini 3.6 Flash and newer models."**
Pada `topK`: **"This field is no longer supported and is silently ignored on Gemini 3.6 Flash and newer models."** (topK kekal dalam skema — tetap HARAM dalam SubFaber sejak v1.6.0)
- `presencePenalty` / `frequencyPenalty`: **kekal Optional tanpa nota deprecated dalam v1beta reference** — tetapi dokumen Enterprise (2026-10-22, sumber Hybrid Guard v3.19.1) menyatakan penalti pulangkan error pada 3.6+. Kelakuan pelayan sebenar: SEND-ALL + Hybrid Guard SubFaber (penalti ditekan untuk 3.x-strict) adalah tepat.
- `responseSchema` & `responseJsonSchema`: **kedua-duanya kini berlabel DEPRECATED — "Use `responseFormat` instead"** (medan `generationConfig.responseFormat: ResponseFormatConfig { text, audio, image }` baharu; `text: TextResponseFormat { mimeType, schema }`).
- `candidateCount`, `stopSequences` (≤5), `seed`, `responseLogprobs`, `logprobs` (0–20), `mediaResolution`, `responseModalities`, `speechConfig`, `imageConfig`, `translationConfig`, `audioTranscriptionConfig` — standard.
- `maxOutputTokens`: "The default value varies by model, see `Model.output_token_limit`."

---

## 3. FINISHREASON — NILAI BAHARU

Enum penuh termasuk nilai baharu relevan: `MALFORMED_RESPONSE`, `ESCALATION`, **`PUP_LIMITED_DISABLED`**, `MISSING_THOUGHT_SIGNATURE`, `UNEXPECTED_TOOL_CALL`, `TOO_MANY_TOOL_CALLS`, dan **`CONTINUATION`**.

---

## 4. CONTINUATIONTOKEN — SPESIFIKASI PENUH (verifikasi isu mandat)

Kutipan verbatih (request body):
> "An opaque continuation token used to resume generation from a previous `models.generateContent` or `models.streamGenerateContent` response that stopped with `finishReason` set to `CONTINUATION`. Note that `contents` is mandatory and must identically replicate the prompt and conversation history from the initial request when continuation token is provided in a request."

Kutipan verbatih (Candidate respons):
> "An optional opaque continuation token returned when `finishReason` is `CONTINUATION`. Clients can pass this token in a subsequent `GenerateContentRequest` to continue generation."
> (Enum `CONTINUATION`): "Token generation was stopped because the response reached the per-request token limit, but generation is not yet complete. The model response can be continued via a subsequent request using the returned `continuationToken`. Note, the `maxOutputTokens` is **cumulative across continuation hops** and must be **monotonically increased or omitted**."

**Implikasi SubFaber:** token hadir pada **v1beta** (bukan v1beta1 sahaja seperti direkodkan dalam ground truth Enterprise lama) — pada paras request DAN candidate. SubFaber belum menggunakan mekanisme ini (non-issue untuk operasi semasa; direkodkan untuk rujukan masa depan long-decode).

---

## 5. THOUGHT SIGNATURES & STATEFUL MODE (Interactions API)

- Halaman thinking kini menumpukan **Interactions API** (`/v1beta/interactions` — API baharu yang disyorkan Google; generateContent kekal disokong).
- `thoughtSignature` pada `Part` (base64) — WAJIB dihantar balik tidak berubah dalam multi-turn stateless; stateful mode (`store: true` + `previous_interaction_id`) menguruskannya pelayan-side.
- `finishReason: MISSING_THOUGHT_SIGNATURE` = penalti kehilangan signature.
- Token limits: `max_output_tokens` merangkumi thought tokens; Gemini 4 (argon): konteks kongsi 1M; **cap sync 64K output (65536) — melebihi → 400; long decode hingga 1M memerlukan `background=True`**.

---

## 6. MODEL TERKINI (banner laman 2026-10-25)

> "Gemini 4 Argon is now available." — model generasi 4 pertama GA pada Gemini API; sokongan thinking low/medium/high (tiada minimal). Konsisten dengan klasifikasi `getModelFamily()` SubFaber yang mengelaskan 4+ sebagai STRICT.

---

## 7. KESIMPULAN AUDIT KEPATUHAN PINTU GEMINI NATIVE SUBFABER

| Item kod | Verdict |
|---|---|
| `systemInstruction` top-level ([`geminiChannel.js:56-59`](../../src/services/channels/geminiChannel.js)) | ✅ PATUH — skema rasmi menyenaraikannya sebagai medan request top-level `object (Content)` |
| `:generateContent` non-stream + header `x-goog-api-key` | ✅ PATUH |
| SEND-ALL sampling (temperature/topP dihantar untuk semua keluarga) | ✅ SELAMAT — "silently ignored" pada 3.6+ (bukan error); keluarga <3.6 masih berkesan |
| Hybrid Guard penalty (ditekan 3.x-strict, v3.19.1) | ✅ TEPAT — Enterprise doc: penalty error pada 3.6+; v1beta reference tidak bertentangan |
| `topK` haram (v1.6.0) | ✅ DIKELASKAN "no longer supported" oleh Google sendiri |
| `thinkingLevel` routing (budget untuk 2.5, level untuk 3.x) | ✅ PATUH — "Recommended for Gemini 3 or later... Use with earlier models results in an error" |
| `maxOutputTokens` 65536 lalai channel | ⚠️ NOTA — tepat pada cap sync Gemini 4 (64K); untuk model lama lalai model lebih rendah tetapi 65536 sah sebagai siling eksplisit |
| `responseSchema` (jika digunakan) | — SubFaber tidak menggunakan medan ini pada pintu Gemini; deprecation `responseSchema`→`responseFormat` direkodkan untuk tindakan susulan jika JSON mode Gemini diperlukan kelak |

**Sifar perubahan kod runtime dibuat dalam mandat ini.**

# TRINITY PARAMS GROUND TRUTH MATRIX — 2026-10-14 (Fasa 1 & 2, Laporan Deep Scan + MCP)

> **⚠️ NOTIS DOKTRIN OWNER 2026-10-16 (SEND-ALL):** Matriks di bawah kekal
> benar sebagai fakta capability API setiap provider. Walau bagaimanapun,
> mandat Owner 2026-10-16 mengatasi kelakuan runtime: kelima-lima parameter
> generatif (Thinking, Temperature, Top-P, Presence Penalty, Frequency
> Penalty) kini WAJIB DIHANTAR oleh ketiga-tiga pintu tanpa client-side
> strip/drop/lock — pelayan provider tentukan sendiri (terima/abaikan/400).
> Tujuan: pemerhatian empirikal Owner. Capability map (`modelCapabilities.js`)
> kekal sebagai dokumentasi keupayaan, bukan gate penghantaran.

> STATUS: FASA PENYELIDIKAN — tiada kod produksi disentuh.
> SUMBER: scrape langsung halaman rasmi setiap provider melalui MCP (deprecations / changelog /
> model pages / parameter reference). Data per-PROVIDER sahaja; data per-SNAPSHOT lama yang
> tidak dapat disahkan penuh TIDAK dimasukkan (lihat §C untuk mitigasi programatik).
> Data yang terbukti salah dalam kitaran awal (strip sampling "semua 3.x") SUDAH DIBUANG.
>
> Fail ini ialah punca tunggal kebenaran untuk Fasa 3 (skema `trinity.<agent>.params`
> + capability map per-model + reka bentuk UI kad Trinity).

---

## A. MATRIKS GROUND TRUTH PER-MODEL (disahkan rasmi)

### A1. Google Gemini

**Sempadan sampling-stripping (BUKTI):** Gemini changelog 21 Julai 2026 +
https://ai.google.dev/gemini-api/docs/whats-new-gemini-3.6#sampling-parameter-deprecation —
*"Starting with Gemini 3.6 Flash and Gemini 3.5 Flash-Lite, the following API changes apply to
these models and all future Gemini model releases: temperature, top_p, top_k are deprecated
and ignored. In future model generations, supplying these parameters returns an HTTP 400 error."*

| Model | Sampling (temp/topP/penalties) | Thinking | Catatan lifecycle |
|---|---|---|---|
| `gemini-2.5-pro` | ✅ berfungsi (0–2 / 0–1 / −2–<2) | thinkingBudget int: **min 128**, −1 dynamic | GA; akses dihadkan kepada pengguna aktif lama (18 Sep 2026) |
| `gemini-2.5-flash` | ✅ | thinkingBudget: 0=off, −1 dynamic | GA; akses terhad sama |
| `gemini-2.5-flash-lite` | ✅ | thinking **Off** secara def; budget 0=off | GA; akses terhad sama |
| `gemini-3-pro-preview` | ✅ (3.x awal — legacy) | thinkingLevel: **low/high sahaja**; def high | SHUTDOWN 9 Mac 2026 |
| `gemini-3-flash-preview` | ✅ | minimal/low/medium/high; def high | aktif |
| `gemini-3.1-pro-preview` | ✅ | low/medium/high (TIADA minimal); def high | aktif |
| `gemini-3.1-flash-lite` | ✅ | low/medium/high; def (docs thinking table) | shutdown 7 Mei 2027 |
| `gemini-3.5-flash` | ⚠️ REROUTE server → `gemini-3.6-flash` (tingkah laku strip) | ikut 3.6 | deprecated 8 Okt 2026 |
| **`gemini-3.5-flash-lite`** | ❌ STRIP (sempadan) | minimal/low/medium/high; def minimal | GA |
| **`gemini-3.6-flash`** | ❌ STRIP (sempadan) | minimal/low/medium/high; def medium | GA |
| `gemini-3.7-flash` | ❌ STRIP; reroute → `gemini-3.8-flash` | low/medium/high (TIADA minimal) | deprecated 8 Okt 2026 |
| `gemini-3.8-flash` | ❌ STRIP | low/medium/high; def medium | GA (2 Sep 2026) |
| `gemini-4-argon` | ❌ STRIP | low/medium/high; def medium | GA (13 Okt 2026) |

**maxOutputTokens:** 2.5 = 65,535; 3.x = 64K out / 1M ctx; **Gemini 4**: 64K sync
(background=false), sehingga 1M hanya dengan `background=true` (long-decode);
`thinkingBudget` pada Gemini 4 → **400 INVALID_ARGUMENT**.
**Prefilled model turn** → 400 mulai kelompok sempadan (3.6/3.5-FL ke atas).
**Celah doc-vs-kod SubFaber (keputusan Owner Fasa 3 diperlukan):** `gemini-3.5-flash` &
`gemini-3.7-flash` menerima nama legacy tetapi berkelakuan strip di server — cadangan
whitelist sebagai strict dalam `getModelFamily` ([src/services/gemini.js](../src/services/gemini.js)).

### A2. OpenAI (rujukan: developers.openai.com/api/docs/deprecations, updated 2026-10-14)

| Kelompok | Sampling temp/topP/penalties | reasoning_effort | Lifecycle |
|---|---|---|---|
| `gpt-4o` / `-mini`, `gpt-4.1` / `-mini` | ✅ penuh | tiada | **Deprecated 14 Okt 2026, shutdown 14 Jan 2027** → gpt-6-luna |
| `o1`, `o1-pro`, `o3-mini`, `o4-mini` | ❌ tidak disokong | low/medium/high | shutdown **23 Okt 2026** |
| `o3`, `o3-pro` | ❌ | (effort) | shutdown **11 Dis 2026** |
| `gpt-5`, `-mini`, `-nano` (snapshot 2025-08-07) | ❌ | minimal/low/medium/high; pro=high-only | shutdown 11 Dis 2026 |
| `gpt-5.1` family (`-chat`, `-codex`, `-codex-max`, `-codex-mini`) | ❌ | none/low/medium/high; xhigh (codex-max); def none | gpt-5.1 shutdown 1 Apr 2027; codex lama Jul 2026 |
| `gpt-5.2`–`gpt-5.4` | ✅ **disokong semula** (matriks Azure Foundry) | + none/xhigh | 5.4-nano shutdown Apr 2027 |
| `gpt-5.5`, `gpt-5.6-sol/terra/luna`, `gpt-6-astra/sol/luna` | ✅ | low/medium/high/xhigh (max: GPT-6/5.6 Responses) | aktif; 128K out |

**Kekangan rasmi:** model reasoning guna `max_completion_tokens` (bukan `max_tokens`);
`minimal` tidak sah ≥5.1 (ganti `none`); `max` hanya GPT-6/5.6 Responses API.
**Mitigasi snapshot:** baca `GET /v1/models` → field `shutdown_date` secara programatik
(saranan rasmi OpenAI) — jangan hardcode def per-snapshot.

### A3. Anthropic (rujukan: platform.claude.com/docs — models overview + extended thinking)

| Era | Model | Thinking contract | Kekangan |
|---|---|---|---|
| 3.5 | `claude-3-5-sonnet/haiku` | tiada thinking | temp 0–1, topP 0–1 bebas; max_tokens 8,192 |
| 3.7 | `claude-3-7-sonnet` | extended thinking optional | thinking ON → **temp=1 & top_p ditolak**; budget ≥1024 & < max_tokens |
| 4.0–4.5 | `claude-opus-4/-4-1`, `sonnet-4`, `haiku-4-5`, `sonnet-4-5`, `opus-4-5` | **extended-ONLY** (`adaptive` → 400) | kekangan sama; opus-4-5 + effort param |
| 4.6 | `claude-sonnet-4-6`, `opus-4-6` | adaptive; `budget_tokens` deprecated | interleaved auto |
| 5.5 (2026) | `claude-fable-5-1`, `opus-5-5`, `sonnet-5-5`, `haiku-5-5` | **adaptive ALWAYS-ON; `type:"enabled"` → 400** | effort def high (opus/haiku: medium); 1M ctx / 128K out |

**Sumber programatik rasmi:** Models API mendedahkan `max_input_tokens`, `max_tokens`,
`capabilities.thinking.types.disabled` — guna untuk capability check Fasa 3.

### A4. DeepSeek (rujukan: api-docs.deepseek.com — pricing + thinking_mode + changelog)

| Model | Kontrak |
|---|---|
| `deepseek-flash` (V4.1-Flash, 10 Sep 2026) | **model utama semasa**; thinking def ON; `thinking{type}` + `reasoning_effort` low/high/max; 1M ctx / **384K max out**; Vision ✅; concurrency 2500 |
| `deepseek-v4-pro` | masih resolve; dibayar harga Flash sejak 14 Sep 2026; tiada Vision |
| `deepseek-chat`, `deepseek-reasoner` | **RETIRED 24 Jul 2026** — haram guna |
| Parameter | temp 0–2 (def 1.0), topP 0<x≤1 (def 1.0), max_tokens 1–384K (def 8K non-thinking / 64K thinking / 128K effort=max); **sampling tidak disokong dalam mod thinking** — guna reasoning_effort sahaja |

### A5. xAI Grok (rujukan: docs.x.ai/developers/models, updated 21 Sep 2026)

`grok-4.7` (flagship): **reasoning_effort configurable**; 500K ctx; logprobs ditolak ≥grok-4.20;
encrypted reasoning (Responses API). `grok-4`, `grok-4.20-beta`;
`grok-4-fast-reasoning` / `-non-reasoning` (2M ctx, unified weights, dua ID).
Sampling: temp def 0.7, topP def 0.95 (rujukan respons rasmi).

### A6. Groq (rujukan: console.groq.com/docs/models + deprecations)

Produksi: `openai/gpt-oss-120b` & `-20b` (65,536 max completion; reasoning_effort),
`groq/compound` / `compound-mini` (agentic), `qwen/qwen3.8-27b` (16,384),
`minimaxai/minimax-m2.7` (preview/enterprise, 131,072).
**Deprecated 16 Ogo 2026 (free/dev):** `llama-3.3-70b-versatile`, `llama-3.1-8b-instant`.
Parameter: temp 0–2, topP 0–1 (def 1); `max_tokens` deprecated → `max_completion_tokens`;
cadangan rasmi: ubah temp ATAU topP, bukan kedua-dua.

### A7. Mistral (rujukan: docs.mistral.ai/models + api/endpoint/chat)

Aktif: `mistral-medium-3.5`, `mistral-small-4` (hybrid instruct+reasoning), `mistral-large-3`,
`mistral-large-4`, `zai-glm-5-3` (third-party, 1M ctx), `ministral-3-{14b,8b,3b}`.
temp disyorkan 0–0.7 (def ikut model), topP 0–1, top_k wujud (haram di SubFaber),
max_tokens (Large 3: def 8,192).

### A8. Moonshot Kimi (rujukan: platform.kimi.ai/docs/api/models-overview + Together quickstart)

| Model | temp | topP | thinking |
|---|---|---|---|
| `kimi-k3` | **FIXED 1.0 (nilai lain → error)** | **FIXED 0.95** | thinking-only; reasoning_effort low/high/max (def max); 131,072 max out |
| `kimi-k2.7-code(-highspeed)` | FIXED 1.0 | FIXED 0.95 | hanya `thinking{enabled,keep:all}` |
| `kimi-k2.6` | 1.0 thinking / 0.6 non-thinking | FIXED 0.95 | `thinking{enabled/disabled}` hybrid |
| `kimi-k2.5` | 0.6 instant / 1.0 thinking | FIXED 0.95 | enable_thinking |

K3 di Together: temp 1.0 + topP 0.95 fixed — nilai lain → **400**.

### A9. Zhipu GLM (rujukan: docs.z.ai + panduan rasmi GLM-5/4.6)

`glm-5` / `glm-5.3`: temp def 1.0, topP def 0.95, `thinking{type:enabled}`
(mode thinking: kekal temp 1.0). **`glm-5.1`: tiada reasoning_effort langsung.**
`glm-4.6`: temp 1.0 / topP 0.95; tidak digalakkan ubah kedua-dua serentak.

### A10. Qwen / DashScope (rujukan: help.aliyun qwen-api + qwen.ai blog 3.8)

`qwen3.8-max`: effort **low/medium/xhigh** (def xhigh), 1M ctx.
`qwen3.7-plus`, `qwen3.5`: thinking → temp 0.6 / topP 0.95; non-thinking → temp 0.7 / topP 0.8;
`enable_thinking` bool (QwQ & model thinking-mode: hanya `true`).

### A11. Perplexity (rujukan: docs + OpenRouter param table)

`sonar`, `sonar-pro`, `sonar-reasoning(-pro)`, `sonar-deep-research`:
temp (def 1.0), topP (def 1.0), top_k (def 0), max_tokens, penalties. Search-grounded.

### A12. Together AI (rujukan: docs.together.ai/reference/chat-completions)

Paling lengkap: temp, topP, top_k, min_p, repetition_penalty, presence/frequency penalty,
max_tokens, **reasoning_effort, reasoning{enabled}**.

### A13. Cerebras (rujukan: inference-docs.cerebras.ai/api-reference/chat-completions)

temp 0–2, topP 0–1, max_completion_tokens, penalties ±2, `reasoning_effort`
(model-dependent); **n=1 sahaja**; reasoning_format/clear_thinking param khusus.

### A14. SambaNova (rujukan: docs.sambanova.ai chat-completions)

temp 0–2 (def 0.7), topP 0–1 (def 1), **top_k 1–100 (def 5)**, repetition_penalty 1–2,
penalties ±2, max_tokens (def 2048), do_sample. Kekangan: ubah SATU sahaja
antara temp/topP/top_k.

### A15. OpenRouter (rujukan: openrouter.ai/docs/api_reference/parameters)

Layer seragam: temp 0–2, topP 0–1, top_k, max_tokens, reasoning.effort.
**Parameter yang tidak dihantar → di-omit upstream (provider guna lalai sendiri)** —
bukan nilai konvensional diinjeksi. Sokongan sebenar per-model ikut provider backend;
`provider.require_parameters: true` untuk pin. Senarai model 500+ berubah harian.

### A16. DeepL — **TIADA parameter sampling LLM** (bukan model generatif).
Medan sah: `modelType` (quality_optimized), `formality`, `preserveFormatting`.

### A17. Custom / Proxy (3 Door SubFaber)
`gemini-native` → matriks A1; `openai-compatible` → matriks model backend sebenar
(A2–A15); `anthropic-messages` → matriks A3. Deteksi door oleh
[src/services/channels/keyDetector.js](../src/services/channels/keyDetector.js).

---

## B. NILAI CADANGAN OPTIMUM EJEN TRINITY (cadangan, menunggu perakuan Owner)

| Ejen | temp | topP | Reasoning | Rasional |
|---|---|---|---|---|
| Preflight (Glosari/Bible) | 0.0–0.2 | 0.9–0.95 | effort/thinkingLevel medium–high | ekstraksi faktual deterministik |
| Translation | 0.2–0.4 | 0.95 | low/minimal | kreatif terkawal, elak overthinking |
| Inspector | 0.0 | 0.9 | low | audit deterministik |
| Secondary Fallback | ikut Translation | ikut | ikut | sandaran |

(Nota: muatan god-tier Agent B semasa `{model, messages, stream:true, temperature:0.0}`
di [src/services/agentBInspector.js](../src/services/agentBInspector.js) adalah keputusan empirikal
overthinking — Fasa 3 mesti kekalkan laluan ini sebagai DEFAULT bagi ejen Preflight/Inspector
melainkan Owner melencong.)

---

## C. MITIGASI KETIDAKPASTIAN (pelaksanaan Fasa 3)

1. **Capability map = fail data bertanda versi** (bukan tersebar dalam kod) + regression test
   yang mengunci setiap entri ("gemini-2.5-flash menerima temperature", "kimi-k3 menolak
   topP≠0.95", dsb.).
2. **Bacaan programatik rasmi**: Anthropic Models API (`capabilities.thinking.types.disabled`),
   OpenAI `GET /v1/models` (`shutdown_date`) — ganti hardcode def per-snapshot.
3. **Custom/proxy door**: capability-check runtime + debug-log parameter tak disokong
   (bukan crash).
4. **Keputusan Owner belum**: (a) whitelist nama reroute Gemini 3.5-flash/3.7-flash sebagai
   strict; (b) audit dropdown model legasi yang mati ≤3 bulan (4o/4.1 Jan 2027, o-series
   Okt/Dis 2026, deepseek-chat/reasoner Jul 2026).

---

## D. RUMUSAN FASA 1 (AUDIT KOD — ringkas, detail dalam laporan sesi)

- Medan parameter & normalizer: [src/utils/config.js](../src/utils/config.js)
  (`PROVIDER_PARAMETER_DEFAULTS`, `mergeProviderParameters` — clamp temp 0–2 / topP 0–1 /
  maxOutputTokens 1–200000 / thinkingBudget −1–200000 / penalties ±2; topK haram sejak v1.6.0).
- Gemini: `getModelFamily` 3-lapis (2.5 full+budget / 3.x-legacy hantar temp+topP /
  3.6+ strict strip) — selari dengan sempadan rasmi §A1.
- OpenAI-compat: [src/services/providers/openaiCompatible.js](../src/services/providers/openaiCompatible.js)
  (temp/topP/max_tokens/presence_penalty/reasoning_effort per-keluarga; kimi gugur sampling;
  glm-5.3 kunci 0.0/0.1).
- Anthropic: [src/services/providers/anthropic.js](../src/services/providers/anthropic.js)
  (auto-compliance temp=1+drop top_p semasa thinking; budget < max_tokens).
- Agent B (Preflight+Inspector): **hardcoded god-tier 4-kunci** — tiada kawalan parameter
  pengguna (ketidakadilan ejen yang Owner tegur).
- Secondary Fallback: mewarisi `providerParameters` provider sama — tiada set berasingan.
- Frontend: `#betaModeAccordion` ([public/partials/main.html](../public/partials/main.html))
  = mismatchRetries + `#geminiAdvancedCard` (statik, Gemini-centric) +
  `#providerAdvancedCard` (8 blok provider). Cadangan: mismatchRetries kekal dalam
  Translation Settings; parameter sampling dipindah ke kad ejen Trinity secara dinamik.

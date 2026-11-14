# Provider Pricing Ground Truth — 2026-11-14

Collected live via MCP (Crawl4ai; Firecrawl credits exhausted until 2026-11-20) on
2026-11-14 ~21:00 KL time, as mandated by the Owner for the A2 FinOps decision.
All rates are **USD per 1M tokens (MTok)** from **official provider pricing pages**.
Purpose: retail-value cost estimation for non-Gemini doors (openai-compatible and
anthropic), mirroring the existing CrazyRouter semantics (official retail price,
proxy discount applied only when the proxy's billing is known).

Interlocking fact from the A2 audit: `resolvePricing()` in
`src/utils/telegramFinOps.js` falls back to `3.5-flash-lite` Gemini rates for ANY
unmatched model. Usage instrumentation (A2 part 1) without this table (A2 part 2)
would therefore price `deepseek-v4-pro` at Gemini flash-lite rates — both parts
must land in the same release.

## DeepSeek (official: api-docs.deepseek.com/quick_start/pricing)

Peak hours: 01:00–04:00 and 06:00–10:00 UTC, Mon–Fri (excl. CN public holidays).
Off-peak = half of peak. Recommendation for estimates: use PEAK (conservative).

| Model | Input (cache hit) | Input (cache miss) | Output |
| --- | --- | --- | --- |
| deepseek-flash (V4.1-Flash-1017) | $0.006 peak / $0.003 off | $0.30 peak / $0.15 off | $1.20 peak / $0.60 off |
| deepseek-v4-pro | $0.044 peak / $0.022 off | $1.32 peak / $0.66 off | $3.96 peak / $1.98 off |

Usage payload (OpenAI format, DeepSeek-specific fields):
`usage.prompt_tokens`, `usage.completion_tokens`,
`usage.prompt_cache_hit_tokens`, `usage.prompt_cache_miss_tokens`.

## Kimi / Moonshot (official: platform.kimi.ai/docs/pricing/chat)

| Model | Input | Output | Cached input |
| --- | --- | --- | --- |
| kimi-k3 | $2.00 | $10.00 | $0.20 |
| kimi-k3.1-pro | $3.00 | $15.00 | $0.30 |
| kimi-k3.1-pro-highspeed | $4.00 | $20.00 | (render glitch; cache col blank) |
| kimi-k2.6 | $0.95 | $4.00 | — |
| kimi-k2.7-code | $0.95 | $4.00 | — |

Note: official table rendered with a row-label glitch (values complete, row order
kimi-k3 → highspeed → k3.1-pro). Verify highspeed cache price if that model is
ever used. Context caching is auto-enabled, TTL 5m default.

## GLM / Z.ai (official: z.ai/model-api)

| Model | Input | Output | Cached input |
| --- | --- | --- | --- |
| GLM-5.3 (flagship) | $1.40 | $4.40 | $0.26 |
| GLM-5.3-FlashX (multimodal) | $0.37 | $1.25 | $0.075 |

Cache storage: limited-time free. Older GLM-5.2 reportedly $1.40/$4.40 (press;
not on the official page anymore — treat unlisted legacy models as unpriced).

## OpenAI (official: developers.openai.com/api/docs/pricing.md)

Standard speed, short context (≤272K input). Long-context (>272K) rates are 2x
input / 1.5–2x output — batch/flex/fast/ultrafast modes not used by SubFaber.

| Model | Input | Output | Cached input |
| --- | --- | --- | --- |
| gpt-6-astra | $10.00 | $50.00 | $1.00 |
| gpt-6.1-sol | $2.00 | $10.00 | $0.10 |
| gpt-6.1-terra | $1.00 | $5.00 | $0.05 |
| gpt-6-luna | $0.10 | $0.50 | $0.01 |
| gpt-6-sol | $2.00 | $10.00 | $0.20 |
| gpt-5.6-sol | $4.00 | $20.00 | $0.40 |
| gpt-5.6-terra | $2.00 | $12.00 | $0.20 |
| gpt-5.6-luna | $0.20 | $1.20 | $0.02 |
| gpt-5.5 | $5.00 | $30.00 | $0.50 |
| gpt-5.4 | $2.50 | $15.00 | $0.25 |
| gpt-5.4-mini | $0.75 | $4.50 | $0.075 |

Usage payload: `usage.prompt_tokens`, `usage.completion_tokens`,
`usage.prompt_tokens_details.cached_tokens`,
`usage.completion_tokens_details.reasoning_tokens`.

## Live wire probe — rootsys gateway (2026-11-14, VPS Terabix)

Executed per Owner instruction (curl-equivalent probe on the VPS with the
prepared rootsys key; key moved programmatically, never printed, artifacts
removed after the run). Results — all HTTP 200:

1. **Gateway returns `usage` on EVERY mode, INCLUDING plain stream with no
   `stream_options`** (T2 vs T3 identical: the final SSE chunk carries a full
   `usage` object). `stream_options: {include_usage: true}` is therefore
   NOT needed against rootsys — instrumentation needs zero transport change:
   just parse the `usage` field already present in the last chunk.
2. **The usage object is a superset** (OpenAI + DeepSeek + Anthropic field
   names merged by the gateway): `prompt_tokens`, `completion_tokens`,
   `total_tokens`, `prompt_cache_hit_tokens`, `prompt_cache_miss_tokens`,
   `cache_read_input_tokens`, `cache_creation_input_tokens`,
   `cached_tokens`, `completion_thinking_tokens`, plus
   `prompt_tokens_details.cached_tokens` and
   `completion_tokens_details.reasoning_tokens`.
3. **Reasoning tokens ARE reported** (kimi-k3 stream: completion 59 incl.
   `reasoning_tokens: 43`) — the "Thought" line of the receipt can be
   restored for thinking models.
4. **Model list:** 28 models incl. `-mod` variants (deepseek-v4-pro-mod,
   glm-5.3-mod, hy3-tencent, hy4-preview). `-mod` variants are unlisted on
   official pricing pages → they fall under the "unpriced model" N/A rule.
5. **Model aliasing:** requesting `kimi-k3` non-stream returned
   `model: kimi-k3-1` in the response — pricing lookup must match on
   requested-model name (the `deepseek-v4-pro` request returned
   `deepseek-v4-pro`); note for the receipt: display the served model name.

## Anthropic (official: platform.claude.com/docs/en/about-claude/pricing.md)

| Model | Input | Output | Cache read |
| --- | --- | --- | --- |
| Claude Fable 5.2 | $8.00 | $40.00 | $0.20 |
| Claude Opus 5.5 | $4.00 | $20.00 | $0.20 |
| Claude Opus 5 | $5.00 | $25.00 | $0.50 |
| Claude Sonnet 5.5 | $2.00 | $10.00 | $0.10 |
| Claude Sonnet 5 | $2.00 | $10.00 | $0.20 |
| Claude Sonnet 4.6 | $3.00 | $15.00 | $0.30 |
| Claude Haiku 5.5 (≤100K prompt) | $0.10 | $0.50 | $0.01 |
| Claude Haiku 5.5 (>100K prompt) | $0.50 | $2.50 | $0.05 |
| Claude Haiku 4.5 | $1.00 | $5.00 | $0.10 |

Usage payload: `usage.input_tokens`, `usage.output_tokens`,
`usage.cache_read_input_tokens`, `usage.cache_creation_input_tokens`.

## Semantics agreed for the estimate (proposal, pending Owner approval)

1. Pricing is resolved by **model name** (door-agnostic) — a model has one retail
   price regardless of which proxy serves it (same principle as CrazyRouter using
   official Gemini rates).
2. Non-Gemini doors show **Retail Value (estimate at official provider rates)** —
   rootsys' real billing is unknown, so no "actual cost" claim.
3. DeepSeek uses **peak rates** (conservative ceiling; runs span peak/off-peak).
4. Cached input priced at the provider's cache-hit rate when the payload reports
   cached tokens (parity with the Gemini door's input/cached split).
5. Unknown/unlisted model → **explicit "unpriced model" N/A**, never a silent
   Gemini-rate fallback (fixes the current DEFAULT_PRICING_KEY mispricing trap).
6. Gemini door (official key and CrazyRouter) behaviour unchanged.

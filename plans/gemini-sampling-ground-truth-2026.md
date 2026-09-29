# Gemini Sampling Parameter Ground Truth (2026-09-29)

**Sources (live scrape, maxAge=0):**
- https://ai.google.dev/gemini-api/docs/models (updated 2026-09-24)
- https://ai.google.dev/gemini-api/docs/gemini-3 (updated 2026-09-23)
- https://ai.google.dev/gemini-api/docs/changelog (2026-09-22)
- https://ai.google.dev/gemini-api/docs/latest-model (3.8 migration)
- https://docs.crazyrouter.com/llms.txt + /chat/gemini/native.md

---

## 1. THE DEPRECATION TIMELINE (the fact previous AIs got wrong)

**Changelog July 21, 2026 (verbatim):**
> "Deprecated parameters: The sampling parameters `temperature`, `top_p` and
> `top_k` are now deprecated."

Announced the SAME day `gemini-3.6-flash` + `gemini-3.5-flash-lite` went GA.

**3.8 Flash migration checklist (verbatim):**
> "Remove deprecated sampling parameters: Strip `temperature`, `top_p`, and
> `top_k` from generation configs. Replace `thinking_budget` with the string
> enum `thinking_level`. Remove `candidate_count`."

**CONCLUSION:** Sampling deprecation begins at **Gemini 3.6**. Models released
BEFORE July 21, 2026 still honour sampling:
- `gemini-3-flash-preview` (GA'd as preview Dec 17, 2025)
- `gemini-3.1-pro-preview` / `gemini-3.1-flash-lite` (Feb–May 2026)
- `gemini-3.5-flash` (May 19, 2026)

Gemini 3 guide Temperature section (applies to the WHOLE 3.x family as ADVICE,
not a hard reject): *"For all Gemini 3 models, we strongly recommend keeping the
temperature parameter at its default value of 1.0. ... setting it below 1.0 may
lead to looping or degraded performance."*

So: 3.0–3.5 = sampling **accepted** (Google recommends 1.0). 3.6+ = sampling
**deprecated / stripped**.

---

## 2. PER-FAMILY SAMPLING MATRIX (ground truth)

| Family | Models | temperature/topP | thinking | Notes |
|--------|--------|------------------|----------|-------|
| 1.5 | gemini-1.5-* | FULL (+topK 1..40) | none | shut down but keep classifier safe |
| 2.0 | gemini-2.0-* | FULL | none | shut down |
| 2.5 | gemini-2.5-flash/pro/lite | FULL | thinkingBudget (int) | +frequency/presence penalty |
| 3.x LEGACY | gemini-3-flash-preview, gemini-3.1-*, gemini-3.5-flash, gemini-3.5-flash-lite | **ACCEPTED** (Google recommends 1.0) | thinkingLevel enum | pre-3.6 |
| 3.x STRICT | gemini-3.6+, 3.7, 3.8, and 4.x+ | **STRIPPED** (deprecated) | thinkingLevel enum | minimal not on 3.8 |

thinking_level enum: `minimal` (3-flash/3.5-lite only, NOT 3.1-pro, NOT 3.8),
`low`, `medium`, `high`. Defaults: 3.1-pro/3-flash = high; 3.8 = medium.

topK: deprecated for all nucleus models — never send. candidate_count: remove for 3.x.
frequency/presence penalty: 1.5/2.x only.

---

## 3. THE BUG (confirmed in code)

- [`getModelFamily()`](src/services/gemini.js:62) CORRECTLY classifies
  `gemini-3-flash-preview` + `gemini-3.1*` as `3.x-legacy` / `warn-default-1.0`.
- BUT [`buildGenerationConfig()`](src/services/gemini.js:663) `level` branch
  strips sampling for ALL 3.x (strict AND legacy) — comment says "for ALL 3.x
  models, sampling params are not sent." So on 3 Flash Preview the user's
  temperature is silently dropped even though the model accepts it.
- Also `gemini-3.5-flash` falls to the conservative-strict default, though it
  predates the deprecation (should be legacy).

FIX:
1. Classify by version threshold: Gemini 3 minor `< 6` → legacy; `>= 6` → strict.
   (`gemini-3-flash-preview` has no minor = 3.0 → legacy.) Future-proof, removes
   the brittle hardcoded `SAMPLING_DEPRECATED_MODELS` reliance.
2. `buildGenerationConfig` `level` branch: for legacy, send `temperature` +
   `topP` alongside `thinkingConfig`; for strict, keep stripping.

---

## 4. CRAZYROUTER HARMONY (the hybrid)

CrazyRouter `gemini` endpoint → `POST /v1beta/models/{model}:generateContent`
(IDENTICAL to Google direct). Native page lists `generationConfig.temperature`
as a valid field and `thinkingConfig` works. It is a **passthrough proxy**.

**Implication:** both Google-direct and CrazyRouter flow through the SAME
`GeminiService.buildGenerationConfig`. Fixing the per-model logic there
harmonises BOTH paths automatically — no separate CrazyRouter branch needed.

Naming nuance: CrazyRouter drops the `-preview` suffix (`gemini-3.1-pro` vs
Google's `gemini-3.1-pro-preview`). `normalizeGeminiModelId` + the `/^gemini-3/`
version parse handle both, so classification is identical across providers.

---

## 5. RECOMMENDED VALUES FOR SUBFABER (translation, parity-first)

- **2.5 / 3.0–3.5 legacy**: temperature configurable; default 0.2–0.3 fine for
  translation (deterministic). topP 0.95. (On 3.x Google recommends 1.0, but the
  param is accepted; owner controls the knob.)
- **3.6+ strict**: no sampling; control via `thinking_level` = `low`/`medium`.

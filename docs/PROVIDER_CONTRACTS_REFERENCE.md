# PROVIDER & CHANNEL CONTRACTS REFERENCE

Secondary reference for the SubFaber Core Protocol (`.roo/rules/00-subfaber-core-protocol.md`).
This document carries the detailed provider, channel, and UI-structural specifications so that the
core protocol stays compact. **No invariant is weakened here.** The core protocol's numbered
invariant list is authoritative; this file is the expanded technical ground truth behind it.

Scope: Zone A (Model & Parameters) and Zone C (Trinity & Tri-Door) coupled contracts, plus the
Gemini transport and parameter rules. If anything here conflicts with a newer measured provider
behaviour, update the relevant `plans/*-ground-truth-*.md` file first, then this reference.

---

## 1. Gemini REST transport (v1beta)

- `systemInstruction` MUST remain a **top-level** field of the request body with the exact shape
  `{ parts: [{ text }] }`. Never nest it inside `generationConfig`, never rename it to
  `system_instruction`, and never convert it to a plain string.
- Static vs dynamic prompt separation is managed by `src/services/utils/structuredPrompt.js`.
  Do not re-split or re-merge those sections at the call site.
- `thinkingBudget` MUST be preserved end-to-end. Do not drop it during capability detection,
  normalization, or transport mapping.

## 2. Forbidden and removed parameters

The following parameters were deliberately removed from the codebase and MUST NOT be reintroduced:

- `minP`
- `repetitionPenalty`
- `topK`
- `topKEnabled`

`topK` in particular is forbidden for every Gemini family; see §3.

## 3. HYBRID GUARD — Gemini 3.x sampling

- `temperature` and `topP` are **SEND-ALL** for **all** Gemini 3.x models. Do not suppress them,
  clamp them, or gate them behind a per-model allow-list.
- `frequencyPenalty` and `presencePenalty` are suppressed **only** for the `3.x-strict` family.
  For all other 3.x models they pass through.
- `topK` is forbidden for the entire family (see §2).
- DeepSeek: a user selection of `disabled` maps to `reasoning_effort: 'none'` on the wire.
- Ground truth: `plans/gemini-sampling-ground-truth-2026.md`,
  `plans/trinity-params-ground-truth-2026.md`. These documents are the authority for volatile
  per-model detail; do not copy their matrices back into the core protocol.

## 4. Official identities (nomenclature lock)

- Product: `SubFaber` / `StremioSubFaber`.
- Trinity agents: **Agent Preflight**, **Agent Translation**, **Agent Inspector**.
- Legacy brand names and legacy agent identifiers (Agent A / Agent B) MUST NOT return to active
  code. Historical ledger / CHANGELOG / plan entries remain verbatim and are not rewritten.

## 5. Runtime Trinity mode

- The server runtime is **Basic-only**: `src/handlers/subtitles.js` sets
  `const runtimeTrinityMode = 'basic';` and derives `isProTrinityMode` from it.
- The Agent Inspector pipeline is only constructed in Pro mode; in Basic it is `null`.
- A stored `trinity.mode: 'pro'` configuration is preserved by normalization so it stays
  recoverable. Basic-only runtime is not a licence to delete stored Pro configuration.

## 6. Gemini model parameter panel — HIDE is not LOCK

- In the **Gemini model parameter panel only**, `HIDE` ≠ `LOCK`. Do **not** use the HTML
  `disabled` attribute as a substitute for visibility morphing.
- Outside this component, `disabled` states remain legitimate for interaction safety.

## 7. DOM access discipline

- **Optional** DOM access MUST use a null guard such as `if (!el) return;`.
- **Required** structural elements MUST NOT fail silently. Use explicit assertions or thrown
  errors so a missing required element is surfaced, not hidden behind a null guard.

## 8. Rehydration from canonical config

- Rehydration reads from canonical config, never from stale DOM state.
- `populateGeminiModelDropdowns()` reads `currentConfig.geminiModel`, preserves the `-preview`
  fallback, keeps rank #1 selection, and refreshes controls after repopulation.

## 9. UI technology lock

- Vanilla JS and Native CSS only. No React/JSX, no third-party UI library, no font or icon CDN.
- Respect both theme token systems: `public/css/subfaber-theme.css` and `public/themes/mario.css`.

## 10. Coupled-contract zones

- **Zone A — Model & Parameters:** `src/utils/modelCapabilities.js`, `src/services/gemini.js`,
  `src/services/providers/*` ↔ `public/config.js`, `public/partials/main.html`, and the related
  model/parameter controls.
- **Zone B — Schema & Normalization:** `src/utils/config.js` ↔ `public/config.js`
  (`loadConfigToForm`, payload serialization) and `src/utils/*PageGenerator.js`.
- **Zone C — Trinity & Tri-Door:** `src/services/channels/*`, `src/services/agentInspector.js`,
  `src/services/subfaberPreflight.js` ↔ Trinity cards, door/format, and validation UI.

If one side of a zone changes, its counterpart MUST be inspected. If no UI/contract consumer is
involved, record `N/A` with a reason; do not change the counterpart merely for symmetry.

## 11. Real-user provider verification

Before surgery on, or an audit of, UI that depends on provider/model/validation state, replicate
the real flow through Playwright: provider → test API key via `src/utils/testKeys.js` → base URL →
door/format → Validate → model, until the target component renders with real data.

- Keys are subject to Zero Secret Logging and are limited to ping / model-list / Playwright scope,
  never bulk translation.
- Never fabricate model lists, error states, parameter cards, or validation states without live
  evidence.
- The happy path alone is insufficient when a change touches errors: test the relevant
  negative/failure path.
- If external keys/services are unavailable, record the blocker and use fixtures only as partial
  evidence. Do not claim real-provider verification is complete.

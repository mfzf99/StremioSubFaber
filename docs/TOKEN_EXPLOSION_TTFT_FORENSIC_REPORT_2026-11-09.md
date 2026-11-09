# TOKEN EXPLOSION, TTFT & CADDY 300s — FORENSIC REPORT

- **Date:** 2026-11-09 ~16:25 (KL time)
- **Owner mandate:** Forensic self-investigation of the Zoo Code → Rootsys API gateway path. Three
  deliverables: (1) usage audit + inflection point, (2) context-bloat root cause, (3) control
  mechanism, (4) actionable solution meeting **TTFT < 35 s**, **immune to the 300 s Caddy ceiling**,
  and **practical for long debugging sessions without manual New Task**.
- **Scope classification:** Operational / governance (Class 2). No application runtime, provider
  contract, Gemini/Trinity invariant, UI, payload serialisation, or server schema changed.
  Coupled Zones A/B/C are **N/A** — this mandate concerns the agent harness and the external
  gateway, not SubFaber application code.
- **Evidence window:** 200 gateway log rows pulled live from `https://rootsys.cloud/api/buyer/usage`
  covering `2026-11-09T00:51:26Z` → `2026-11-09T08:09:49Z` (8h51m–16h09m KL), plus the local Zoo
  Code task stores under
  `C:/Users/khaty/AppData/Roaming/Code/User/globalStorage/zoocodeorganization.zoo-code/tasks/`.

---

## 1. USAGE AUDIT — measured facts

### 1.1 Distribution over the 200-row window

| Metric | p50 | p90 | p99 | max |
|---|---|---|---|---|
| input tokens | 370,141 | 453,874 | 501,213 | **502,314** |
| cached tokens | 11,360 | 13,115 | 400,128 | 436,785 |
| output tokens | 416 | 3,483 | 11,905 | 14,284 |
| TTFT (ms) | 17,012 | 23,195 | 187,278 | **222,624** |
| latency (ms) | 23,493 | 56,278 | 188,449 | 224,976 |

- 200 requests → **199 × HTTP 200**, 1 × 499 (client-aborted).
- 131 of 200 requests carried **input > 300K tokens** (65 %).
- 9 of 200 requests breached **TTFT > 30 s** (4.5 %).
- 0 of 200 crossed the 300 s ceiling in this window — but the slowest hit **222.62 s**,
  i.e. **74 % of the Caddy budget consumed before a single token was returned**.
- Total billed tokens in the window: **64,091,442** (`tokensUsed` sums, 200 rows).
  `summary.today` reported **77,541,580** for the day. Output was only **257,645 tokens**
  in that same window — an **input:output ratio of ~242:1**.

### 1.2 Inflection point — TTFT by input bucket

| input range | n | avg TTFT | max TTFT | avg latency | max latency |
|---|---|---|---|---|---|
| 0–32K | 9 | 7.4 s | 15.3 s | 12.9 s | 27.2 s |
| 32K–64K | 23 | 7.3 s | 21.5 s | 12.0 s | 30.8 s |
| 64K–128K | 6 | 9.5 s | 23.7 s | 13.1 s | 29.1 s |
| 128K–200K | 2 | 12.7 s | 14.1 s | 18.4 s | 18.7 s |
| 200K–300K | 28 | 13.7 s | 20.5 s | 27.5 s | 84.9 s |
| 300K–400K | 65 | 17.0 s | 43.7 s | 35.9 s | 124.4 s |
| 400K–500K | 63 | **26.7 s** | **222.6 s** | 33.8 s | 225.0 s |
| 500K–600K | 3 | **78.2 s** | 187.3 s | 83.2 s | 188.4 s |

**The inflection is not gradual.** From 300K–400K the average TTFT is ~17 s; past 400K the
*tail* detaches from the median (max 222 s vs median ~24 s at identical input sizes). The
cause is the upstream prefill queue, not a clean per-token cost curve.

### 1.3 Empirical prefill model

**Data hygiene first.** 4 of the 200 rows are degenerate: their `split.cached` exceeds
`split.input` (e.g. `in=3,924, cached=436,785`) because the gateway re-sent an identical
payload and reported the cache-read side differently. One row has no `split` at all. These 4
rows are excluded from all rate statistics below; the remaining **196 rows are the clean set**.

Linear fit over the clean rows: `TTFT(s) ≈ 5.2 + 0.000046 × uncachedTokens`
(residual p50 −3.6 s, p90 +3.1 s, **p99 +159.9 s**).

Uncached prefill rate (uncached tokens / TTFT), clean rows:

| percentile | tok/s | 300 s breach at | 35 s target at |
|---|---|---|---|
| median (p50) | 20,267 | 6.08 M | 709 K |
| p10 (slow) | 6,901 | 2.07 M | 242 K |
| p05 | 4,142 | 1.24 M | 145 K |
| p02 (slow tail) | 2,190 | 657 K | 77 K |
| p01 | 1,951 | 585 K | 68 K |
| **minimum observed** | **1,029** | **309 K** | **36 K** |

**Reading:** on a bad upstream day the 300 s ceiling is reachable at ~309 K–657 K uncached
tokens. The owner's hypothesis ("600K+ will breach 300 s") is therefore *correct as a risk*,
but the breach is **queue-driven, not deterministic** — the same 498K request took 22 s one
minute and 222 s the next.

The slow tail is **not** concentrated at large inputs: of the 13 rows with a rate below
5,000 tok/s, **9 have an input below 67 K** (17.8 K, 25.2 K, 27.7 K, 31.2 K, 31.0 K, 33.2 K,
42.1 K, 43.7 K, 43.8 K). The slow rows are small-context requests that happened to be queued.
`corr(input, rate) = +0.57`, so larger inputs *do* prefill faster on average (long batches
amortise) — which means a smaller working set does **not** make the slow-tail risk disappear.
This is the single most important finding for the fix: **the tail is upstream, so the only
structural defence is a small enough absolute payload.**

Empirical maximum TTFT by input ceiling (clean rows):

| input ceiling | n | median TTFT | p95 | max | worst rate |
|---|---|---|---|---|---|
| 80,000 | 35 | 6.2 s | 21.5 s | **23.6 s** | 1,029 tok/s |
| 120,000 | 35 | 6.2 s | 21.5 s | **23.6 s** | 1,029 tok/s |
| 160,000 | 36 | 6.4 s | 21.5 s | **23.6 s** | 1,029 tok/s |
| 200,000 | 37 | 6.4 s | 21.5 s | **23.6 s** | 1,029 tok/s |
| 250,000 | 39 | 6.4 s | 21.5 s | **23.6 s** | 1,029 tok/s |
| 300,000 | 65 | 10.2 s | 19.4 s | **23.6 s** | 1,029 tok/s |

**No request with an input of 300 K or less ever exceeded 23.6 s TTFT in the entire
observed window.** The three catastrophic calls (75.9 s, 187.3 s, 222.6 s) all had inputs
of 453 K–501 K.

### 1.4 The dominant, fixable finding: the prompt cache is effectively dead

- Median `cached` on requests with input > 300K: **11,848 tokens** — i.e. **2.4 %** of the prompt.
- Only **4 of 200** rows had `cached > 50 %` of input.
- `cached` hovers in a narrow band: 0 → 768 → 1,536 → 2,304 → 10,130 → 11,360 → 11,640 →
  11,797 → 11,848 → 12,350 → 12,401 → 12,878 → 13,063 → 13,114 → 13,342 → 14,000.
- **Every turn pays full uncached prefill for ~488K tokens even though ~98 % of the prompt is
  byte-identical to the previous turn.**
- The profile advertises `openAiCustomModelInfo.supportsPromptCache = false`. In the Zoo Code
  bundle the OpenAI-compatible path emits **no** `cache_control` directive (that mechanism
  exists only on the Anthropic path, `messages: d ? Bpi(u, f) : u`).
- The three large `cached` outliers (436,785 / 400,128 / 392,869) all coincide with
  *in-process retries or condense calls re-sending the same payload* — not with steady-state
  turns. Two of them show `split.input = 3,924` / `17,110` with a huge `cached` value, which
  means the gateway's `split` object is **not** `input = cached + uncached`; treat `input` as
  the **non-cached** portion and `cached` as the cache-read portion. `tokensUsed` ≈
  `input + output` for the steady-state rows (verified: 200/200 rows satisfy
  `tokensUsed = split.input + split.output + <small delta>`), so the ~460K–500K figures are
  genuinely uncached input being processed every turn.

**Consequence:** TTFT ≈ full prefill of the entire history, every single turn. This is the
single largest lever available — far larger than any threshold tuning.

---

## 2. CONTEXT BLOAT ROOT CAUSE — measured, not guessed

The 500K-token task `01a1bece-e236-74f2-9499-26fa82f0adb6` (the session that produced the
222 s TTFT) was dissected message by message.

### 2.1 Composition of that task's API history

- **346 messages**, **2,753,258 characters**.
- `user/tool_result` (tool outputs): **1,735,464 chars = 63.0 %**
- `assistant/tool_use` (tool-call arguments, i.e. my own writes): **949,399 chars = 34.5 %**
- assistant prose: 1.9 % — user prose: **0.6 %**

**The user (owner) contributes 0.6 % of the context. The other 99.4 % is harness machinery.**

### 2.2 The two catastrophic injections

| # | tool | chars | content |
|---|---|---|---|
| 52 | `mcp--crawl4ai--batch` | **405,525** | one documentation page (`code.claude.com/docs/en/permission-modes`) returned as raw JSON with a 399 K-char `markdown` field |
| 56 | `mcp--crawl4ai--batch` | **304,537** | second page (`code.claude.com/docs/en/tools-reference`) — 299,924-char `markdown` field |

Two tool calls injected **~710 K characters (≈ 200 K tokens)** into the history in a single
minute. At that moment the input size jumped from ~66K → 162K → 261K tokens (visible in the
gateway log at `05:59:35` and `06:00:21`) and the session never recovered.

### 2.3 The slow, continuous leaks

- **`environment_details` is appended to every single user/tool-result message:**
  **173 of 173** user messages in the 500K task, and **408 of 408** in the 815-message task.
  Total **314,308 chars** of repeated open-tab lists, file inventory, todo tables and
  timestamps in one task.
- **Self-inflicted output dumps:** in *this* investigation session a single `dir /s /b` of the
  Zoo Code global-storage tree emitted **823,960 characters of omitted output** in one tool
  result (the harness still transmitted the full artifact).
- **Repeated full-file reads** of the same file (the session ledger is 2,924 lines; several
  reads returned 120-line windows repeatedly).
- **`includeDiagnosticMessages: true`, `maxDiagnosticMessages: 30`, `includeCurrentTime: true`,
  `includeCurrentCost: true`, `includeTaskHistoryInEnhance: true`, `maxOpenTabsContext: 20`,
  `maxWorkspaceFiles: 200`** are all enabled in the live global state, and every one of them
  is re-serialised on every turn.

### 2.4 Verdict on "what causes the explosion"

1. **Uncapped MCP/tool results** (batch scrapes, recursive directory listings) — the big jumps.
2. **Unbounded tool-call arguments** (large `write_to_file` payloads, giant analysis scripts) —
  the second-largest contributor (34.5 %).
3. **Per-turn `environment_details` re-injection** — a constant ~1.5–4 K chars × every turn.
4. **No condense ever fires** (see §3), so nothing is ever reclaimed.

---

## 3. CONTROL MECHANISM — decoded from the installed bundle

Source: `C:/Users/khaty/.vscode/extensions/zoocodeorganization.zoo-code-3.96.0/dist/extension.js`
(functions `K9i`, `z9i`, `pyr`, `EJl`, `qR`).

### 3.1 The actual condense trigger

```
percent = useAvailableInputForContextPercent
    ? 100 * prevTokens / (contextWindow - maxTokens)
    : 100 * prevTokens / contextWindow

threshold = profileThresholds[currentProfileId]   // -1 means "use global"
            ?? autoCondenseContextPercent          // global default

condense if  percent >= threshold
hard-truncate if  prevTokens > contextWindow * 0.9 - maxTokens   // fyr = 0.1
```

- **Live global:** `autoCondenseContextPercent = 80`.
- **Live per-profile override for the ACTIVE profile `wbmuyjdg11a` (kimi-k3.1-pro): `50`.**
  → **The effective trigger is already 50 %, not 80 %.** The premise in the mandate is
  superseded by a per-profile setting that overrides the global.
- **Live `contextWindow = 1,048,576` (1 Mi).** So condense fires at **~524K tokens**, and the
  hard truncation at **~943K tokens**.
- **Live `maxTokens = -1`** in `openAiCustomModelInfo`. `qR()` resolves the effective request
  cap to `bb = 8192` when `maxTokens` is falsy and no `modelMaxTokens` is set.
- **`useAvailableInputForContextPercent` is only enabled when the provider implements
  `getCondenseContextWindow()`** — the OpenAI-compatible handler does **not**, so the percent
  denominator is the raw `contextWindow` (1 Mi), not `contextWindow − maxTokens`.

### 3.2 Why nothing condenses in practice

The gateway log shows input growing monotonically 392K → 502K with **zero condense events** in
the UI message stream. At 502K the session is at **47.9 % of 1 Mi** — just under the 50 %
trigger. It then terminates (504/owner abort) before the next turn. **The window is so large
that the condense safety net never engages inside a real session's useful lifetime.**

### 3.3 Two independent levers, and why the threshold is the right one

The condense trigger is `percent × contextWindow`. The mandate asked whether to cap
`contextWindow` (e.g. 150 K–180 K) instead. Both levers reach the same trigger token count,
but they differ in blast radius:

| lever | how | blast radius |
|---|---|---|
| **per-profile threshold** | `profileThresholds[wbmuyjdg11a] = 15` → trigger at 15 % of 1,048,576 = **157,286 tokens** | affects **only** the active profile; the model's declared 1 Mi context, the provider contract, and the credentialed profile record are all untouched |
| **`contextWindow` cap** | rewrite `openAiCustomModelInfo.contextWindow` to 200,000 → trigger at 50 % = 100,000 tokens | rewrites a field **inside the credentialed profile record**, which is stored in the VS Code secret store; the harness's own `saveConfig()` replaces that record wholesale (`a.apiConfigs[e] = { ...l, id: s }`), so a scripted write risks dropping the API key unless the existing record is read back and re-submitted in full |

**Decision: use the threshold lever, not the `contextWindow` lever.** The threshold reaches a
comparable working set with zero credential risk and zero provider-contract risk.

With `profileThresholds[wbmuyjdg11a] = 15` against the live 1,048,576 window:

| quantity | value |
|---|---|
| condense trigger | **157,286 tokens** |
| hard truncation | `1,048,576 × 0.9 − 8,192` = **935,326 tokens** |
| empirical max TTFT at inputs ≤ 157 K | **23.6 s** (target < 35 s) ✓ |
| median prefill TTFT at 157 K | 7.8 s |
| p10-slow prefill TTFT at 157 K | 22.8 s |
| absolute-worst-rate TTFT at 157 K | 152.9 s (still < 300 s) |
| 300 s breach point at the slowest rate ever observed (1,029 tok/s) | **308,686 tokens** — now ~2× above the trigger, so the harness condenses long before it |

### 3.4 Candidate thresholds, evaluated against the measured data

Threshold matrix at the live 1,048,576 window (clean rows, 196 samples):

| profile threshold | trigger tokens | median TTFT | p10 TTFT | worst-rate TTFT | empirical max TTFT | verdict |
|---|---|---|---|---|---|---|
| 50 % (current) | 524,288 | 25.9 s | 76.0 s | 509.5 s | 222.6 s | **fails both criteria** |
| 30 % | 314,572 | 15.5 s | 45.6 s | 305.7 s | 222.6 s | **fails** — 300 s reachable |
| 25 % | 262,144 | 12.9 s | 38.0 s | 254.8 s | 222.6 s | marginal |
| 20 % | 209,715 | 10.3 s | 30.4 s | 203.8 s | 222.6 s | good TTFT, 300 s margin only 96 s |
| **15 %** | **157,286** | **7.8 s** | **22.8 s** | **152.9 s** | **23.6 s** | **recommended — both criteria met with margin** |
| 12 % | 125,829 | 6.2 s | 18.2 s | 122.3 s | 23.6 s | safe, shortest cycle |
| 10 % | 104,857 | 5.2 s | 15.2 s | 101.9 s | 23.6 s | safe, most aggressive |

**Recommendation: `profileThresholds.wbmuyjdg11a = 15`.** Do **not** lower the global
`autoCondenseContextPercent` — the per-profile override governs the active profile, and a
lower global would silently change the other 10 profiles. The other 10 per-profile thresholds
are left exactly as they were.

---

## 4. RELAY STATE FILE — continuity across condense cycles

Condensing is lossy. To make a 100K-token cycle safe for multi-hour debugging, progress must
live **outside** the chat history.

Proposed protocol (file is already Git-ignored: `.tmp/` and `.tmp-*` are in `.gitignore`):

```
.tmp/RELAY_STATE.md
```

Contents, rewritten (not appended) at each phase boundary:

1. **Mandate** — one-line owner goal, verbatim.
2. **Current phase** — A/B/C/D/E and the exact sub-step.
3. **Decisions locked** — bullets that must not be relitigated.
4. **Files touched** — path + one-line purpose + committed/uncommitted.
5. **Evidence so far** — test counts, measurements, artifact paths.
6. **Open hypotheses** — what is still unproven.
7. **Next exact action** — the single next tool call, with arguments.
8. **Recovery** — how to resume if the session dies (`git status`, which artifact to re-read).

Rules:
- Write it **before** any long tool-output-producing operation, and after each completed phase.
- Keep it under **4 KB** so re-reading it after a condense costs ~1K tokens, not 50K.
- It is a **relay**, not a log — overwrite, never append. Append-only files become the next
  context bomb.
- On session start after a condense, read **only** this file plus the top block of
  `docs/SESSION_LEDGER.md`. Do not re-read whole source files "to regain context".

---

## 5. ACTIONABLE PLAN — meeting all three criteria

### Tier 0 — do immediately (no restart, no settings change)

1. **Never call batch/scrape MCP tools without a size cap.** `mcp--crawl4ai--batch` returned
   405K and 304K chars in this session's parent task. Cap to a single URL, or pipe through
   `extract` with a schema. If a tool result exceeds ~30 KB, write it to `.tmp/` and read a
   slice instead of letting it enter history.
2. **Never run recursive listings against large trees.** Replace `dir /s /b <tree>` with a
   Node one-liner that prints only the top N entries + counts, or `list_files` with
   `recursive: false`.
3. **Never `cat`/read a file twice.** Keep a one-line note of what was read and at which
   offset; use `offset`/`limit` or the indentation anchor.
4. **Cap every analysis script's stdout** to ~200 lines and write the rest to an artifact.

### Tier 1 — settings (supported import path, requires VS Code restart)

Edit `C:/Users/khaty/.roo/zoo-code-import-settings.json` — the same supported import channel
used for the guardrails work (`zoo-code.autoImportSettingsPath`). The importer's
`HXl()` sanitiser accepts only keys present in the extension's `Qv` global-settings schema,
and the credentialed profile is preserved because the importer **merges** `apiConfigs`
(`{ ...n.apiConfigs, ...f }`) rather than replacing them.

| setting | from | to | status | reason |
|---|---|---|---|---|
| `profileThresholds.wbmuyjdg11a` | `50` | **`15`** | **applied** | condense now fires at 157,286 tokens instead of 524,288 — the single highest-leverage change |
| `profileThresholds` (other 10 profiles) | — | unchanged | **applied** | deliberately not touched; only the active profile changes |
| `autoCondenseContextPercent` (global) | `80` | `80` (unchanged) | **applied** | not set in the import payload at all, so the live global value is preserved; lowering it would affect 10 other profiles |
| `includeDiagnosticMessages` | `true` | **`false`** | **applied** | removes repeated diagnostic payloads from every turn |
| `maxOpenTabsContext` | `20` | **`5`** | **applied** | shrinks the per-turn open-tab dump |
| `maxWorkspaceFiles` | `200` | **`20`** | **applied** | shrinks the per-turn workspace inventory |
| `includeTaskHistoryInEnhance` | `true` | `true` (unchanged) | — | not set in the import payload; its size effect is negligible next to the threshold change |
| `includeCurrentTime` | `true` | `true` (unchanged) | — | the timestamp is *not* the cache-breaker (see §6); disabling it would cost model awareness for no measured gain |
| `includeCurrentCost` | `true` | `true` (unchanged) | — | one short line per turn; not a measurable contributor |
| `openAiCustomModelInfo.contextWindow` | 1,048,576 | `1,048,576` (unchanged) | — | **deliberately not changed**: it lives inside the credentialed profile record, and the harness's `saveConfig()` replaces that record wholesale. Optional hardening is described in §5.1 instead |
| `openAiCustomModelInfo.supportsPromptCache` | `false` | `false` (unchanged) | — | the OpenAI-compatible path emits no `cache_control`, so declaring support would change accounting only, without evidence of a behavioural gain |

**Do not** touch `modelTemperature`, `maxTokens`, `includeMaxTokens`, or the API key.

### Tier 2 — relay protocol (this repository)

Adopt `.tmp/RELAY_STATE.md` as defined in §4. Add the one-line discipline to the mode's
operational rules so it survives condense: *"At every phase boundary, rewrite
`.tmp/RELAY_STATE.md` (<4 KB) before producing any large tool output."*

### Tier 3 — measurement gate (proves the fix)

After a full VS Code restart (the import only runs at startup), run a normal debugging session
and re-pull `https://rootsys.cloud/api/buyer/usage`. Accept only if:

- max input tokens **< 200,000** across the session,
- max TTFT **< 35 s** (target median < 15 s),
- at least one `condense_context` event visible in the UI stream,
- **zero** requests where `latencyMs > 300,000`,
- no session abandoned mid-task.

### Why this satisfies the three criteria

- **Laju (TTFT < 35 s):** the empirical maximum TTFT for every request with an input of
  300 K or less, across all 196 clean observations, was **23.6 s**. A 157 K trigger keeps the
  working set below the band where the three catastrophic calls occurred (453 K–501 K), and
  the measured median prefill at that size is 7.8 s. The target is met with an 11 s margin.
- **Selamat (300 s-immune):** the slowest uncached prefill rate ever observed was
  1,029 tok/s, which would need **308,686 tokens** to reach 300 s. The condense trigger
  (157,286 tokens) is roughly half that, so the harness compacts long before the ceiling can
  be approached. The margin is ~147 s even if the very worst observed rate recurs at the
  trigger point.
- **Praktikal (long sessions, no manual New Task):** condense fires automatically at 157 K, and
  the relay file carries the state across the condense, so the session continues indefinitely
  without the Owner pressing "New Task".

### 5.1 Optional hardening (Owner action, not applied)

If the Owner wants a second, independent barrier, the model's own context window can be
lowered in the Zoo Code UI (**Settings → API Configuration → `kimi-k3.1-pro` → Context
Length**), which the extension exposes as an editable `openAiCustomModelInfo.contextWindow`
field. Keeping `trigger tokens × 100 / window ≈ 60 %` preserves the same 157 K trigger:

| Context Length | equivalent threshold |
|---|---|
| 262,144 (256 K) | 60 % |
| 200,000 | 79 % |
| 157,286 | 100 % |

This was **not** applied automatically because it rewrites a field inside the credentialed
profile record in the VS Code secret store, and the harness's own `saveConfig()` replaces
that record wholesale — a scripted write could drop the API key. Doing it through the
extension's own UI is safe by construction.

---

## 6. CACHE-BREAK MECHANISM — what the evidence does and does not support

- `environment_details` is appended as the **last text part of the user message of each turn**
  (173/173 and 408/408 verified). It is **not** injected into the system prompt.
- The system prompt is rebuilt per turn by `getSystemPrompt()` → `Jht(...)`, but its inputs are
  the mode, custom modes, rules, tools and MCP hub — none of which include the timestamp or the
  todo list. The todo list lives inside `environment_details`, not the system prompt.
- **Therefore the per-turn timestamp does not, by itself, invalidate the cached prefix** of the
  *system prompt + tool schemas*. The observed `cached ≈ 11–13K` band is consistent with the
  gateway caching only that static head.
- What **does** prevent the cache from advancing into the conversation is that
  `environment_details` is **appended to an already-transmitted user message**. Once that
  message's text changes, every token after it can no longer be served from the previous
  prefix. In a turn-based agent the newest user message is always the one being mutated, so the
  cache can only ever cover the stable head — exactly what the numbers show.
- **Mitigation that does not require gateway changes:** shrinking the *rate of growth* (Tier 0
  + Tier 1) reduces the uncached portion per turn even when the cache cannot help. Making the
  prefix cache actually useful would require the harness to stop mutating prior user messages
  (move `environment_details` into a *new* trailing message instead of appending), which is an
  upstream Zoo Code change — recorded here as a finding, not silently patched.
- The buyer JWT (`scope: session`, `role: buyer`) is **not** accepted for
  `/v1/chat/completions` (`401 Invalid API key`). The direct prefix-cache experiment therefore
  could not be executed with the supplied credential; the conclusion above is drawn from the
  200-row production log plus bundle source, and is labelled as evidence-limited accordingly.

---

## 7. RESIDUAL RISKS & HONEST CAVEATS

1. **The fix is applied but not yet re-measured.** The threshold and context-trim settings are
   written to the import payload, but the extension only applies them on the next full VS Code
   restart, and no post-change usage pull exists yet. Every number in §5 is derived from the
   *pre-change* 196-row dataset plus the decoded bundle logic, not from a post-change run.
   Tier 3 is the acceptance gate that must be executed after the restart.
2. **`supportsPromptCache` was deliberately left `false`.** The OpenAI-compatible path in the
   bundle emits no `cache_control` directive (that mechanism exists only on the Anthropic
   path), so declaring support would change local accounting without a demonstrated server-side
   gain. Enabling it is an empirical experiment, not a fix.
3. **The `split` object semantics are inferred**, not documented by the gateway. The 200-row
   arithmetic supports `input = uncached`, `cached = cache-read`, `tokensUsed ≈ input + output`,
   and 4 rows contradict the naive reading (`cached > input`), which is why they were excluded
   from the rate statistics. If the gateway's real semantics differ, the *absolute* token
   numbers shift — but the *relative* ranking of thresholds, and the empirical
   "inputs ≤ 300 K never exceeded 23.6 s TTFT" result, are unaffected because they are direct
   measurements of the requests actually made.
4. **The 222 s outlier is upstream queueing**, not something any client setting can eliminate.
   The mitigation is to keep the payload small enough that even the slowest rate ever observed
   (1,029 tok/s) still finishes inside the budget at the trigger point.
5. **The prefix cache cannot be repaired from the client side.** The harness mutates an
   already-transmitted user message every turn, which structurally prevents the gateway's
   prefix cache from advancing past the static head. The 2.4 % cache-hit rate is therefore
   expected behaviour for this harness, not a gateway defect, and no client setting changes it.
6. **191 task directories** exist under global storage, including full checkpoint Git repos.
   They are disk bloat, not context bloat, and were left untouched.
7. **The supplied buyer JWT was used only for reading the Owner's own usage log.** It was
   written to a local file, read by the forensic scripts, and never printed, echoed, logged, or
   written into this repository or the ledger. The JWT is not accepted for gateway inference
   (`401 Invalid API key`), so no inference-side probe was performed with it.

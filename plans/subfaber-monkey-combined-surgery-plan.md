# PELAN PEMBEDAHAN GABUNGAN SUBFABER × MONKEY

**Status:** FASA PERANCANGAN SAHAJA — read-only. Tiada kod sumber, ujian, atau komit diubah oleh mandat ini.
**Tujuan:** Menaikkan ceiling kualiti SubFaber dengan mengekalkan 4-pillar Preflight, 7-crime Inspector, disiplin Split-Sentence, dan 3 channel wrappers, sambil menambah kekuatan diagnostik pemulihan Monkey.

---

## 1. INVENTORI & PEMETAAN KELEBIHAN MONKEY

### A. Pengesah Mekanikal Deterministik (JS Validators)

| Monkey Mechanism | SubFaber Injection Point | Behavior |
|---|---|---|
| `DIAG_MSGS` per-line validation | `translationEngine.js` after `parseResponseForWorkflow()` | Map each error to a specific correction directive |
| `?`/`!` punctuation mismatch detection | `translationEngine.js` after `parseResponseForWorkflow()` | Flag lines where source has `?`/`!` but translation drops them |
| Source script leakage (CJK, Hangul, etc.) | `translationEngine.js` after `parseResponseForWorkflow()` | Detect source-language characters remaining in translation |
| Speaker label parentheses loss | `translationEngine.js` after `parseResponseForWorkflow()` | Detect `（Name）` in source but no `(Name)` in translation |
| Music symbol `♪` preservation | `translationEngine.js` after `parseResponseForWorkflow()` | Verify `♪` count matches source |
| `[br]` count preservation | Already exists: `reconcileBrParity()` | Auto-repair missing line breaks |

**Key insight:** Monkey does NOT use LLM for these checks. SubFaber should add these as **zero-cost pre-checks** before or instead of calling Inspector LLM for mechanical issues.

### B. Actionable Retry Diagnostics

| Monkey Pattern | SubFaber Enhancement |
|---|---|
| `DIAG_MSGS[reason](i, trans, orig)` → specific correction text | New `buildCrimeCorrections()` utility that maps each crime type + ID to an explicit repair instruction |
| `buildRetryNote(diagnosticLines, targetLang)` | Replace generic `warningBlock` with per-crime-type corrective messages |
| `normalizeForRetry()` — normalize fullwidth punctuation to ASCII before retry | Apply to already-correct lines before including them in retry context |

### C. Clean-Line Reference

| Monkey Pattern | SubFaber Enhancement |
|---|---|
| Lines already correct are kept as-is and not retranslated | During retry, preserve good entries and only resend problematic ones, OR send full batch with clear "these lines are already correct" markers |
| Normalize fullwidth punctuation in good lines to prevent copy-mode | Apply `normalizeForRetry()` to already-correct entries before including in retry prompt |

### D. Translation Sharpness

| Monkey Principle | SubFaber Integration |
|---|---|
| "Convert meaning, not sounds" | Already in Pro rule #5; add to Basic rule #3 |
| SDH preservation: `(Name)`, `[sound]`, `♪` | Already in Pro rule #2 and #6; strengthen in Basic |
| Subtitle economy (CPS) | Already in Pro principle #2 and Basic rule #4; add explicit "target ≤ source length" guidance |

---

## 2. PEMBEDAHAN KEEMPAT-EMPAT PERMUKAAN PROMPT & PIPELINE

### 2.1 Agent 1: Preflight (`src/services/prompts/trinity/preflight/*`)

**Current state:** 4-pillar schema (theme/terms/characters/credits_and_titles) with evidence discipline.

**Assessment:** Already optimal for context extraction. Monkey's metadata formatter is simpler (show/episode/cast), but SubFaber's 4-pillar is richer and more structured.

**Decision:** No changes needed to Preflight core. It already provides the context that Monkey lacks.

**Optional enhancement (not required):** Add Monkey's `Speaker name mapping` concept to Preflight output — a normalized source→target character name mapping that Translation can use directly.

### 2.2 Agent 2A: Translation — Mod Pro (`src/services/prompts/trinity/translation/core.js` & `languagePacks/*`)

**Current state:** 6 rules (ANTI-MERGE, ANTI-SHIFT, ANTI-PHANTOM, ANTI-DROP, ANTI-UNTRANSLATED, PRESERVE markup) + principles + language packs.

**Enhancement plan:**

1. **Add to Pro rules:**
   - Rule 7: "MEANING OVER SOUNDS: Translate the speaker's intent and meaning, not word-for-word phonetics. If a literal translation sounds unnatural in ${targetLabelShort}, rephrase for natural spoken flow."
   - Rule 8: "SDH & SPEAKER LABELS: Keep (Name) and [Name] speaker labels with exact parentheses/brackets. Keep [sound effects] and (sound effects) in brackets. Keep ♪ music symbols verbatim."

2. **Language packs:** Add Monkey-style micro-fixes for common translationese:
   - Malay: `dumpling→ladu`, `apple→epal`, `fishy→hanyir`, `on my way→saya akan ke sana`, `This is absurd→Mengarut betul`, `What the hell?→Apa hal?/Hei!`
   - Generic: similar mappings for other languages.

3. **GOLD examples:** Add 4-6 few-shot examples from actual Netflix reference (if available) showing correct split-sentence handling and natural register.

### 2.3 Agent 2B: Translation — Mod Basic (`BASIC_TRANSLATION_SYSTEM_TEMPLATE`)

**Current state:** 6 rules, no language packs, no Inspector.

**Enhancement plan:**

1. **Add to Basic rules:**
   - Rule 7: "MEANING OVER SOUNDS: Translate the speaker's intent, not word-for-word phonetics. If a literal translation sounds unnatural in ${targetLabelShort}, rephrase for natural spoken flow."
   - Rule 8: "SDH & SPEAKER LABELS: Keep (Name) and [Name] speaker labels with exact parentheses/brackets. Keep [sound effects] and (sound effects) in brackets. Keep ♪ music symbols verbatim."

2. **Basic mechanical validators:** Add zero-cost JS checks after `parseResponseForWorkflow()`:
   - `?`/`!` mismatch detection
   - Source script leakage detection
   - Speaker label parentheses loss detection
   - `♪` count verification

3. **Basic retry diagnostics:** When mechanical validators fail, build per-line corrective messages and retry without calling Inspector LLM (since Basic has `agentInspector === null`).

4. **Clean-line preservation:** During retry, preserve entries that pass validation and only resend problematic ones with clear markers.

### 2.4 Agent 3: Inspector (`src/services/prompts/trinity/inspector/*` & `agentInspector.js`)

**Current state:** 7-crime taxonomy (MERGE/DROP/PHANTOM/SHIFT/UNTRANSLATED/REGISTER/TERM) with JSON output.

**Enhancement plan:**

1. **Retry diagnostics mapping:** Create `buildCrimeCorrections()` utility that maps each crime type + ID to an explicit repair instruction:
   - MERGE: "Split the merged content back into separate slots with identical IDs."
   - SHIFT: "Move the content back to its original slot; do not displace between slots."
   - UNTRANSLATED: "Translate this line fully into ${targetLang}; proper names may be retained."
   - REGISTER: "Use the locked canonical_address for third-person references and direct_address for face-to-face speech."
   - TERM: "Apply the locked target rendering exactly for the referenced entity."

2. **Inspector prompt scope:** Add instruction to focus only on semantic crimes (MERGE/DROP/PHANTOM/SHIFT/UNTRANSLATED/REGISTER/TERM), not mechanical issues that JS validators catch (punctuation, speaker labels, script leakage, music symbols).

3. **Retry block formatting:** Replace generic `warningBlock` with structured per-crime corrections before `<answer>` anchor.

---

## 3. KESERASIAN 3 PINTU PENGANGKUTAN

### Gemini Native

- **Anchor preservation:** Diagnostic retry blocks MUST be inserted **before** `<answer>\n<s id="N">` so the continuation anchor remains the final token.
- **Clean-line references:** Include already-correct entries with clear "these are correct" markers before the diagnostic block.
- **No prefill changes:** The existing Gemini prefill mechanism remains untouched.

### OpenAI

- **Role compatibility:** Use `developer` role when supported, `system` otherwise.
- **JSON schema:** Inspector continues to use `json_schema` strict mode for verdicts.
- **Anchor directive:** Retry prompt includes explicit anchor directive: "Begin your output with the <answer> block, starting with the first entry <s id="N">."

### Anthropic

- **Data-first:** Retry prompt wraps data in `<subtitle_input>` before diagnostic instructions.
- **No prefill:** No assistant prefill used; explicit anchor directive in user content.
- **System field:** System prompt remains in top-level `system` field.

---

## 4. PELAN PELAKSANAAN BERPERINGKAT, KOS TOKEN & UJIAN REGRESI

### Fasa A: Mechanical Validators (Zero-Cost)

**Files:**
- `src/services/translationEngine.js` — add post-parse validation functions
- `src/services/prompts/trinity/translation/core.js` — add rules 7-8 to Basic and Pro

**New functions:**
- `detectPunctuationMismatch(source, translated)` — `?`/`!` mismatch
- `detectSourceScriptLeak(source, translated)` — source-language characters remaining
- `detectSpeakerLabelLoss(source, translated)` — `（Name）` vs `(Name)`
- `detectMusicSymbolLoss(source, translated)` — `♪` count mismatch

**Cost:** Zero additional API calls. Pure JS validation.

**Tests:**
- Each validator correctly identifies mismatches
- Validators do not false-positive on correct translations
- Validators work with various source languages (English, Japanese, Korean, Chinese)

### Fasa B: Retry Diagnostics (Actionable Messages)

**Files:**
- `src/services/translationEngine.js` — replace `warningBlock` with structured diagnostics
- New utility: `src/services/utils/retryDiagnostics.js` — `buildCrimeCorrections()`

**New behavior:**
- When validators fail, build per-line corrective messages
- When Inspector detects crimes, map to explicit repair instructions
- Preserve good entries in retry context with "already correct" markers
- Apply `normalizeForRetry()` to good entries to prevent copy-mode

**Cost:** Same number of API calls as before, but higher quality retry prompts.

**Tests:**
- `buildCrimeCorrections()` generates correct messages for each crime type
- Retry prompt includes specific ID and correction directive
- Good entries are preserved and marked correctly
- Retry prompt ends with `<answer>` anchor (Gemini compatibility)

### Fasa C: Language Pack Micro-Fixes (GOLD Examples)

**Files:**
- `src/services/prompts/languagePacks/malay.js` — add micro-fixes
- `src/services/prompts/languagePacks/generic.js` — add generic micro-fixes
- `src/services/prompts/trinity/translation/core.js` — add GOLD examples

**New behavior:**
- Malay pack includes Netflix-specific term mappings (ladu, epal, hanyir, etc.)
- Generic pack includes language-neutral equivalents
- GOLD examples demonstrate correct split-sentence handling and register

**Cost:** Minimal additional prompt tokens (~200-400 tokens per batch).

**Tests:**
- Malay pack includes correct term mappings
- Generic pack does not leak Malay terms
- GOLD examples are included in Pro prompts
- Basic prompts do not include language packs (by design)

### Token Cost Analysis

| Mode | Before | After | Delta |
|---|---|---|---|
| Basic (no Inspector) | ~450 system + ~2000 user | ~500 system + ~2200 user | +10% |
| Pro (with Inspector) | ~450 system + ~2500 user + ~1500 inspector | ~500 system + ~2700 user + ~1500 inspector | +8% |
| Retry | ~450 system + ~2000 user + ~500 warning | ~500 system + ~2200 user + ~800 diagnostics | +15% |

**Latency impact:** Minimal — same number of API calls. Validator adds ~1ms per batch.

### Regression Tests Required

1. **Validator tests:**
   - `testDetectPunctuationMismatch()` — `?`/`!` detection
   - `testDetectSourceScriptLeak()` — source-language character detection
   - `testDetectSpeakerLabelLoss()` — `（Name）` vs `(Name)` detection
   - `testDetectMusicSymbolLoss()` — `♪` count mismatch detection

2. **Retry diagnostics tests:**
   - `testBuildCrimeCorrections()` — per-crime-type message generation
   - `testRetryPromptIncludesAnchor()` — `<answer>` anchor preserved
   - `testGoodEntriesPreserved()` — good entries not retranslated

3. **Language pack tests:**
   - `testMalayPackMicroFixes()` — correct term mappings
   - `testGenericPackNoMalayLeak()` — no Malay terms in generic pack
   - `testGoldExamplesIncluded()` — GOLD examples in Pro prompts

4. **Integration tests:**
   - `testBasicModeWithValidators()` — Basic mode uses validators without Inspector
   - `testProModeWithValidators()` — Pro mode uses validators + Inspector
   - `testRetryDiagnosticsFormat()` — retry prompt format correct

5. **Channel compatibility tests:**
   - `testGeminiAnchorPreservation()` — anchor remains final token
   - `testOpenAIJsonSchema()` — JSON schema strict mode works
   - `testAnthropicDataFirst()` — data-first ordering preserved

---

## ACCEPTANCE CRITERIA

1. **Zero-cost validators:** All mechanical checks run without API calls.
2. **Actionable diagnostics:** Every crime type maps to a specific repair instruction with slot ID.
3. **Clean-line preservation:** Good entries are not retranslated during retry.
4. **Anchor preservation:** Gemini `<answer>` anchor remains final prompt token.
5. **No regression:** All 642 existing tests pass.
6. **Basic mode works without Inspector:** Validators catch mechanical issues even when `agentInspector === null`.
7. **Pro mode enhanced:** Inspector focuses on semantic crimes; validators handle mechanical issues.

---

## FILES TO MODIFY (when mandate approved)

| File | Change Type | Purpose |
|---|---|---|
| `src/services/translationEngine.js` | Add validators + retry logic | Core pipeline |
| `src/services/prompts/trinity/translation/core.js` | Add rules 7-8 | Basic + Pro prompts |
| `src/services/prompts/languagePacks/malay.js` | Add micro-fixes | Malay term mappings |
| `src/services/prompts/languagePacks/generic.js` | Add micro-fixes | Generic term mappings |
| `src/services/prompts/trinity/inspector/core.js` | Update scope instruction | Focus on semantic crimes |
| `src/services/utils/retryDiagnostics.js` | New utility | Crime→correction mapping |
| `src/services/agentInspector.js` | Update retry block | Structured diagnostics |

---

## APPROVAL REQUIRED

This plan is presented for Owner approval before any implementation. No code changes will be made until explicit approval is granted.

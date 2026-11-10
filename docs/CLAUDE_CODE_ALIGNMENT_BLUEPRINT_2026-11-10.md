# Claude Code Protocol Investigation & SubFaber Alignment Blueprint

**Date:** 2026-11-10
**Mandate:** P0 — Agentic Workflow Alignment (Owner)
**Status:** `VERIFIED_LOCAL` (audit report only; no application code changed, no release requested)
**Author:** Fullstack Architect (Kimi)
**Parent HEAD at time of audit:** `a85c6b65fd8efeafe99213d9e0ecd74dbdd2d949` (v3.30.0, clean tree, `main` == `origin/main`)

---

## 0. Source & Evidence Register

This report separates **documented ground truth** (what Anthropic publicly states) from **inference** (my interpretation for SubFaber). Nothing in Part 1 is presented as an Anthropic rule unless it is traceable to a cited source.

| Ref  | Source                                                                  | Used for                                              |
| ---- | ----------------------------------------------------------------------- | ----------------------------------------------------- |
| S1   | `code.claude.com/docs/en/how-claude-code-works`                         | The agentic loop phases; editing/checkpoint mechanics |
| S2   | `code.claude.com/docs/en/best-practices`                                | CLAUDE.md discipline, verification loop, hooks, scope |
| S3   | `code.claude.com/docs/en/memory`                                        | CLAUDE.md vs auto-memory vs compaction                |
| S4   | `anthropic.com/research/claude-code-best-practices`                     | Plan-before-code, explore-first, TDD loop             |
| E1   | Local audit of Zoo Code task history (4 most recent tasks, this machine) | Actual tool-use ratios in this repo                   |
| E2   | `.roo/rules/00-subfaber-core-protocol.md`, `.roomodes` (this repo)      | Current SubFaber governance                           |
| E3   | `.tmp/RELAY_STATE.md` (4,749 bytes at audit time)                       | Current relay fidelity                                |
| E4   | `scripts/run-tracked-tests.js`, `.github/workflows/ci.yml`, `.git/hooks` | Actual test/CI automation surface                     |

**Tooling note:** Firecrawl returned HTTP 402 (quota exhausted) during this session, so the documented Crawl4AI fallback was used for all web retrieval. No secrets were read, printed, or written.

---

## PART 1 — Claude Code Internal Working Protocol (Ground Truth)

### 1.1 The Agentic Loop

Anthropic documents Claude Code's loop as **three phases that blend together**: *gather context → take action → verify results* [S1]. Claude decides each step from what it learned in the previous step and course-corrects; it is not a rigid script. The best-practices page sharpens the third phase: *"Claude stops when the work looks done. If it has nothing to run that tells it whether the work actually is done, 'looks done' is all it has to go on."* [S2]

**Tenet (ground truth):** an unverified change is not "done." A check that returns pass/fail is the single most valuable thing you can hand the agent [S2, S4].

### 1.2 Code Navigation — Progressive Discovery

Anthropic's stance is that **current models are already very good at reading a codebase** and do not need the file layout spelled out for them [S2]. The documented mechanics are:

- Dedicated tools exist for **finding files by pattern, searching content with regex, and exploring codebases**, separate from file reading [S1].
- Broad searches are delegated to a built-in **Explore agent** so long search output stays out of the main conversation [S2].
- The user-side guidance is *"Ask Claude to read relevant files … providing either general pointers or specific filenames, but explicitly tell it not to write any code just yet"* [S4].

**Tenet (ground truth):** locate by search before reading in full; keep exploration read-only until a plan exists.
**Honest caveat:** Anthropic does **not** publish a rule that forbids full-file reads, nor a "never touch a file before proving its location" clause. That stricter anti-assumption boundary is a *SubFaber interpretation*, not a quoted Anthropic tenet — see Part 3.

### 1.3 Surgical Editing

- Claude edits through a dedicated **edit tool**, and **snapshots the current contents before editing** so changes can be undone via checkpoints [S1].
- Checkpoints cover files edited through file tools; changes made only through shell commands are **not** restored [S2].
- Anthropic does not publish a "minimal diff only" or "no full-file overwrite" rule. What is documented is the *undo* mechanism (checkpoints + git work alongside each other) [S2].

**Tenet (ground truth):** edits are reversible by design; the safety net is the checkpoint, not a diff-size quota.
**Caveat:** string-replacement-vs-full-rewrite mechanics and "preserve original style/comments" are engineering best practice that Anthropic assumes, but they are **not** stated as a formal rule in the public docs. I present them in Part 3 as SubFaber doctrine, clearly labeled.

### 1.4 Empirical Verification

The most explicit tenet in the corpus:

> *"Give Claude something it can run that comes back pass or fail. Once it has that, it can keep going on its own … It makes the change, runs the check, and if something broke it reads the output and fixes it before running the check again."* [S2]

Reinforced by the test-first loop in the engineering best-practices article: write tests from expected input/output, **confirm they fail first**, then write code that passes without modifying the tests [S4].

And on evidence: *"ask Claude for evidence: the command it ran and its output, or the screenshot. 'All tests pass' on its own tells you very little."* [S2]

**Tenet (ground truth):** reproduce-first (a test that fails before the fix), then verify after; never claim completion without the command + its output.

### 1.5 Scope Control & Anti-Refactoring

- *"Ask Claude to make a plan before coding and explicitly tell it not to code until the plan is confirmed."* [S4]
- On reviewer-driven bloat: *"If you fix every finding, you end up with extra abstraction layers and tests for cases that can't happen."* [S2]
- Claude *"tends to read a request conservatively and build the smallest thing that satisfies it"* by default [S2].

**Tenet (ground truth):** plan-first, smallest-change-that-satisfies, and deliberate resistance to unrequested abstraction.

### 1.6 Context Frugality & Memory

- `CLAUDE.md` is loaded into **every** session; the guidance is to keep it **under ~200 lines** and hold only what Claude *cannot derive from the repo* (exact test commands, gotchas, decisions made outside the code) [S2, S3].
- **Auto memory** records facts the model chooses to keep across sessions, and deliberately *skips* anything derivable from the codebase [S3].
- **Compaction is lossy.** Project-root `CLAUDE.md` survives compaction because it is re-read from disk and re-injected; nested rule files reload on demand [S3]. Compaction is a *summary*, not a byte-exact state snapshot.
- If a single file or tool output is so large that context refills immediately, auto-compaction stops after a few attempts and surfaces an error [S1].
- Cost lever: `/clear` between unrelated tasks, `/compact <focus>` within one [S2].

**Tenet (ground truth):** durable state must live **outside** the chat history; `CLAUDE.md` is for standing rules, not for in-flight task state.

---

## PART 2 — Gap Matrix: SubFaber vs the Claude Code Standard

Scale: ✅ aligned · 🟡 partial / gap · 🔴 material gap.

| #   | Dimension                         | Claude Code standard (ref)                                  | SubFaber today (evidence)                                                                                  | Verdict | Gap to close                                                                                                      |
| --- | --------------------------------- | ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | ------- | ----------------------------------------------------------------------------------------------------------------- |
| G1  | Agentic loop                      | gather → act → verify, self-correcting [S1]                 | Phases A–E explicitly encode this [E2 §3–5]                                                                | ✅      | None structural.                                                                                                  |
| G2  | Locate-before-read                | Search/explore tools before reading [S1, S2]                | "Use the dedicated repository tool first" + "inspect before editing" [E2 §11.1]                            | ✅      | Present but soft — no hard "no path guessing" gate; see G3.                                                       |
| G3  | Anti-assumption boundary          | (not a published Anthropic rule)                            | "Never rely on memory, a stale snapshot, guessed identifiers" [E2 §11.1]                                   | 🟡      | Stated as prose; no fail-closed mechanism when a guessed path/anchor is wrong.                                    |
| G4  | Surgical editing / minimal diff   | Checkpoint-based undo; no formal diff quota [S1, S2]        | `apply_diff` mandatory for existing files, full-rewrite only if justified [E2 §11.1]                       | ✅      | Stronger than the public Anthropic rule already.                                                                  |
| G5  | Style/comment preservation        | Assumed, not stated as a rule                               | "Preserve existing formatting, comments, structure" [E2 §1]                                                | ✅      | Aligned.                                                                                                          |
| G6  | Reproduce-first                   | Fail-first test loop [S4]; reproduce bug [S2]               | "For bugs, reproduce the symptom first **where practical**" [E2 §4]                                        | 🟡      | The escape hatch "where practical" is the loophole; no red-test-before-fix requirement.                           |
| G7  | Verification before "done"        | No green check = not done; demand command+output [S2]       | "No green `npm test` alone is not evidence"; `IMPLEMENTED_UNVERIFIED` status exists [E2 §2]                | ✅      | Doctrine aligned — but enforcement is prose-only; see G8.                                                         |
| G8  | Automatic test execution          | Check runs every iteration; Stop hook can *force* it [S2]   | Tests run on Owner/agent initiative; **no `pre-commit` hook, no PostToolUse hook, no Stop hook** [E4]      | 🔴      | Nothing runs tests automatically after an edit or before a commit. CI is the only enforced gate, and it is remote. |
| G9  | Independent review                | Fresh subagent / `/code-review` that never saw the code [S2] | "Independent acceptance" = same persona, fresh evidence pass [E2 §5 Phase D]                               | 🟡      | Conceptually separated but not a truly independent reviewer; acceptable trade-off, must stay labeled as such.      |
| G10 | Scope / anti-refactor             | Plan-first, smallest change, no unrequested abstraction [S2, S4] | Radical-simplicity + "edit only within scope" [E2 §1, §5]                                              | ✅      | Aligned.                                                                                                          |
| G11 | Standing memory (CLAUDE.md analog) | <200 lines, only non-derivable facts [S2, S3]               | SSOT is **226 lines / 26.7 KB** and loads every session [E2]                                               | 🟡      | SSOT exceeds the recommended size; much of it (release pipeline, provider specs) is not needed on every task.      |
| G12 | In-flight task-state memory       | State lives outside chat; `CLAUDE.md` is *not* for it [S3]  | `.tmp/RELAY_STATE.md` exists and is git-ignored [E3]                                                       | ✅      | Right mechanism, wrong discipline — see G13.                                                                      |
| G13 | Relay fidelity                    | Overwrite, bounded, phase-scoped                            | Relay is **4,749 bytes** — over the 4 KB ceiling the mode itself mandates [E3]; format is free-form prose   | 🔴      | No enforced schema, no test-baseline field, no uncommitted-diff field, size cap breached in practice.              |
| G14 | Context frugality (tool output)   | Cap tool output; `/clear` between tasks [S1, S2]            | "Never let an uncapped tool result into history" [E2 §11.1] + measured TTFT forensic report                 | ✅      | Strong; recently hardened.                                                                                        |
| G15 | Tool-use ratio (read vs search)   | Search-first, read-narrow [S1]                              | Across the 4 most recent local tasks: **751 `read_file` vs 418 `search_files`**; **574 of 751 reads (76%) were full-file/slice-mode, only 177 (24%) used indentation-anchored blocks**; 84 `apply_diff` vs 37 `write_to_file` [E1] | 🟡      | Read-heavy: ~1.8 reads per search, and three-quarters of reads are not the cheapest anchored form.                 |
| G16 | Deterministic enforcement         | Hooks/deny-rules for zero-exception rules [S2]              | Everything is prompt-level (`customInstructions` + rules file); DCG guards only destructive shell commands  | 🔴      | SubFaber has **no** deterministic hook layer at all — every rule depends on the model remembering it.              |

### Summary of the honest verdict

SubFaber's **doctrine** is already close to — and in editing discipline stricter than — the published Anthropic guidance. The real gaps are **not** philosophical; they are **mechanical**:

1. **No deterministic enforcement layer.** Every rule lives in prose the model can drift from (G8, G16). Anthropic is explicit: *"If something has to happen every time, make it a hook … `CLAUDE.md` is for guidelines."* [S2]
2. **Reproduce-first is optional** ("where practical"), so red-before-green is not guaranteed (G6).
3. **Relay state is unenforced and already over budget**, and lacks the two fields (uncommitted diffs, test baseline) that matter most after a condense (G13).
4. **Tool use is read-heavy** — 76% of reads are not the cheap anchored form, and reads outnumber searches ~1.8:1 (G15).
5. **The SSOT itself is oversized** relative to the <200-line standing-memory guidance (G11).

---

## PART 3 — Alignment Blueprint (ready to review & commit)

> Everything below is a **draft for Owner approval**. No protocol file, `.roomodes`, or application code has been modified. Clause numbering is proposed, not applied.

### 3.1 Core Protocol Upgrades — draft clauses

**Proposed new §4.1 — Reproduce-First Gate (closes G6):**

> For any defect, a failing reproduction (test, probe, or captured artifact) MUST exist and be observed failing **before** production code is edited. The phrase "where practical" is removed. If a reproduction is genuinely impossible (e.g. an unobservable third-party race), the agent must record *why* in the relay and obtain Owner acknowledgement before proceeding. A fix with no red-first evidence is classified `IMPLEMENTED_UNVERIFIED`, never `VERIFIED_LOCAL`.

**Proposed new §11.3 — Locate-Before-Read Gate (closes G2/G3, hard):**

> Before any `read_file` on a path not already confirmed in this session, the agent MUST first resolve the path via `list_files` or `search_files`. A read against an unconfirmed path is a protocol violation even if it happens to succeed. Before any `apply_diff`, the exact anchor lines MUST come from a fresh read or search result in the current session — never from memory.

**Proposed new §11.4 — Anchored-Read Default (closes G15):**

> Default to `search_files` to locate, then `read_file` in `indentation` mode (or `slice` with explicit `offset`+`limit`) to read. Full-file reads are permitted only when (a) the whole file is the unit of work, or (b) it is a config/data file under ~200 lines. Target: at least 1 `search_files` per 2 `read_file`, and ≥60% of reads in anchored/ranged form. These ratios are **measured and reported** in the session ledger, not merely asserted.

**Proposed new §5.4 — Deterministic Gate Preference (closes G8/G16):**

> Any rule phrased "MUST always" or "MUST never" and that a script can check MUST be implemented as a script/hook, not left as prose. Prose is reserved for judgment calls. The canonical example is the completion gate: a green required-check set must be *enforced* (see §3.2), not requested.

### 3.2 Surgical Editing & Fail-Safe Verification

**Editing budget (proposed, deliberately conservative):**

- **One logical change per tool round.** A single `apply_diff` call should carry one coherent change; unrelated fixes are split.
- **Soft cap: ≤80 changed lines per `apply_diff` block** (added+removed). Exceeding it requires the change to be a genuine single unit (e.g. a generated block) and to be justified in the relay. This is a *tripwire that forces a re-read of scope*, not an absolute wall — the goal is to stop silent large rewrites, not to ban legitimate ones.
- **Full-file `write_to_file` on an existing file remains exceptional** and must name its justification inline (already the rule; now it also triggers a diff-size report).

**Fail-safe verification ladder (the mechanical fix for G8):**

1. **Pre-edit baseline:** for the files about to change, run the targeted test once and record the count (this becomes the relay's *Test Baseline* field).
2. **Post-edit targeted check:** after each edit round, re-run only the affected test file(s).
3. **Local commit gate (new, the key addition):** a repository **`pre-commit` hook** that runs `npm test` (the existing `scripts/run-tracked-tests.js`) and refuses the commit on any FAIL. This converts G8/G16 from prose into an enforced mechanism with **zero new runtime dependencies** — it is a shell script that calls the already-present Node test runner.
4. **Stop-gate (advisory):** before `attempt_completion`, the agent must paste the *actual* terminal summary line (counts) rather than assert success — already doctrine, now paired with the hook so it cannot be skipped silently.

> **Feasibility note (verified against the installed Zoo Code 3.96.0 bundle):** the bundle exposes **no** `PreToolUse`/`PostToolUse`/`Stop` hook surface (0 occurrences in the bundle). Anthropic-style tool hooks are therefore **not available** in this harness today. The deterministic layer must be built from (a) a Git `pre-commit` hook and (b) CI — both of which already exist as integration points and require no extension changes.

### 3.3 Relay State v2 — schema

Replace the free-form relay with a fixed, bounded schema. **Hard cap: 4 KB, enforced by a size check in the same pre-commit/commit-time tooling** (and self-checked at each write).

```text
# RELAY_STATE v2
Mandate:            <one line, verbatim Owner goal>
Current Phase:      <A|B|C|D|E + exact sub-step>
Active Invariants:  <bullets that must not be relitigated; contracts, frozen files>
Uncommitted Diffs:  <path | +added/-removed | committed? | one-line purpose>
Test Baseline:      <pre-edit count> → <current count> | FAIL=0 required | SKIP<=1>
Evidence:           <artifact paths, measured numbers, screenshot/log refs>
Open Hypotheses:    <what is still UNPROVEN — explicit>
Next Immediate Step:<the single next tool call, with its arguments>
Recovery:           <git status to run + which artifact to re-read first>
```

Changes vs today: adds **Active Invariants**, **Uncommitted Diffs**, and **Test Baseline** as mandatory first-class fields; makes the size cap a *checked* invariant rather than a suggestion; forbids narrative paragraphs (the current relay's 69-line prose is the direct cause of the 4,749-byte breach).

### 3.4 Phased Rollout (no disruption to core feature work)

Constraints honored: **Vanilla JS, zero build step, zero new external dependencies.** The only new artifacts are a shell hook, a schema, and protocol text.

| Phase   | Deliverable                                                                                                      | Depends on      | Risk |
| ------- | ---------------------------------------------------------------------------------------------------------------- | --------------- | ---- |
| **R0**  | Owner approves this blueprint; scope frozen.                                                                     | —               | none |
| **R1**  | Relay State v2 adopted (schema + size self-check). Pure process change; no code.                                  | R0              | low  |
| **R2**  | `pre-commit` hook running `npm test`; measured to add acceptable latency (suite is ~600 tests).                   | R0              | low–med (commit latency) |
| **R3**  | Protocol text edits: §4.1 reproduce-first, §11.3 locate-before-read, §11.4 anchored-read, §5.4 deterministic-gate preference. | R0 | low |
| **R4**  | SSOT slimming: move the release pipeline and provider specs into on-demand docs, keep the always-loaded core under ~200 lines (G11). | R3           | med (must not drop an invariant) |
| **R5**  | Ledger gains a "tool-use ratio" line per release, so G15 is measured continuously rather than audited once.        | R3              | low  |

R2 is the only step that touches developer workflow latency and is therefore isolated so it can be tuned (e.g. targeted-tests-on-commit vs full-suite-on-push) without blocking R1/R3.

### 3.5 Explicit non-goals (anti-overreach)

- No adoption of subagents, `/goal`, `/code-review`, or worktrees — the harness does not expose them and the mandate forbids new dependencies. Independent review remains the *conceptually separated* Phase D pass (G9 stays 🟡 by design).
- No diff-size hard wall that would block legitimate generated-code edits.
- No rewrite of the SSOT's technical invariants (Gemini/Trinity contracts are untouched).

---

## Acceptance Self-Check (Phase D)

- All five requested Fasa-1 areas covered with cited ground truth, and each marked where it is *inference* rather than an Anthropic rule. ✅
- All four Fasa-2 audit components assessed against local evidence (E1–E4), not assumptions. ✅
- All four Fasa-3 deliverables drafted (protocol clauses, editing/fail-safe rules, Relay v2, phased rollout). ✅
- **Zero application code modified.** Only this report file was added. `git status` confirms the tree was clean at HEAD `a85c6b65` before this report. ✅
- Firecrawl quota exhaustion handled via the documented Crawl4AI fallback; no secrets touched. ✅

**Residual risks:** (1) The `pre-commit` hook adds commit latency proportional to the ~600-test suite; R2 isolates this. (2) Zoo Code exposes no tool hooks, so the deterministic layer is commit/CI-time, not edit-time — earlier enforcement would require an upstream Zoo Code feature, which is out of scope. (3) SSOT slimming (R4) must be done carefully to avoid dropping an invariant; it is staged last for that reason.

# SubFaber Core Protocol (global - applies to all modes)

[MULTI-AGENT ORCHESTRATION PROTOCOL]
1. Assess domain boundaries before taking action on any user request:
   - Frontend Domain: Files under `public/` (public/config.js, public/partials/*.html, styles), DOM manipulation, client-side event handlers, and browser UI rendering.
   - Backend Domain: Files under `src/` (services, handlers, utils), `index.js`, Redis/cache storage, API proxies (Gemini REST, Crazy Router), test suites (`npm test`), and Git operations.
2. If a task falls squarely into the opposite domain, immediately trigger `switch_mode` to hand over execution to the appropriate specialized persona.
3. ANTI-LOOP GUARDRAIL: Never switch back and forth repeatedly. If you were just handed a task by another mode, complete your designated scope first before handing back.
4. Git operations and final verification tests (`npm test`) are strictly reserved for Backend mode.
5. MODE-ACTIVATION AWARENESS: The active mode is determined by the OWNER's mode switch, not by the task being performed. If a Git commit/push or npm test is requested while Frontend mode is active, IMMEDIATELY flag the violation to the owner ("currently in Frontend mode - Git operations are Backend domain; switch back or explicitly confirm the override") and await confirmation before proceeding. Owner's explicit override takes precedence over mode boundaries, but the violation MUST be surfaced first, never silently absorbed.

[LANGUAGE & COMMUNICATION POLICY]
- MUST communicate, explain workflows, and answer any user questions in standard Malay (Bahasa Melayu standard).
- STRICTLY FORBIDDEN to use English for general explanations, casual conversations, or progress reports.
- Retain code syntax, technical terminology (e.g. hit targets, focus-visible, event handler), filenames, and terminal commands in their original language without awkward translations.

[SESSION CONTINUITY]
- Episodic memory: docs/SESSION_LEDGER.md - read FIRST on context reset, new session, or condensation; append a log block after each completed task (format per backend rule #7). A summary is not a memory - verify against the ledger.
- Code topology: prefer `graphify query` (via .codebuddy/skills/graphify/ skill) over reading raw files; run `graphify update .` after code changes (zero API cost).

[.ROOMODES DISCIPLINE - LESSON FROM 2026-10-08 INCIDENT]
- The .roomodes file is indentation-sensitive: NEVER edit it via apply_diff, write_to_file, or inline node -e - all three corrupted it in the incident.
- Safe procedure ONLY: git checkout <clean-commit> -- .roomodes + programmatic insert via script file + PyYAML validation BEFORE commit.
- Validation gate before every .roomodes commit: parse with PyYAML, confirm customModes count, per-mode rule count, groups=[read,edit,command,mcp], source=project.

[COGNITIVE DELIBERATION PROTOCOL - THINK BEFORE CODE]
Before invoking any file editing tools or producing code diffs:
1. TRACE & MAP: Mentally or explicitly trace the execution call-chain and identify all dependent modules. Verify callers before mutating shared signatures.
2. ADVERSARIAL AUDIT: Identify potential failure modes (e.g. null/undefined payloads, race conditions, edge cases, breaking API contracts).
3. INVARIANT & REGRESSION CHECK: Ensure proposed logic strictly adheres to system invariants and preserves the existing test baseline.
4. ATOMIC & COMPLETE EXECUTION: Output complete, production-grade, defensive code. Strictly forbid lazy placeholders or truncated snippets (never emit '// ... rest of code').
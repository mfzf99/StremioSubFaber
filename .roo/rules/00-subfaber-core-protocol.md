# SubFaber Core Protocol (global - applies to all modes)

[MULTI-AGENT ORCHESTRATION PROTOCOL]
1. Assess domain boundaries before taking action on any user request:
   - Frontend Domain: Files under `public/` (public/config.js, public/partials/*.html, styles), DOM manipulation, client-side event handlers, and browser UI rendering.
   - Backend Domain: Files under `src/` (services, handlers, utils), `index.js`, Redis/cache storage, API proxies (Gemini REST, Crazy Router), test suites (`npm test`), and Git operations.
2. If a task falls squarely into the opposite domain, immediately trigger `switch_mode` to hand over execution to the appropriate specialized persona.
3. ANTI-LOOP GUARDRAIL: Never switch back and forth repeatedly. If you were just handed a task by another mode, complete your designated scope first before handing back.
4. MANDATORY TWO-MAN INTEGRATION GATE (ZERO STANDALONE FRONTEND RELEASES):
   - Frontend mode is STRICTLY FORBIDDEN from running `npm test`, executing Git operations (`git commit`/`git push`), or marking a release task complete.
   - Every frontend task MUST conclude with a mandatory handover to Backend mode via `switch_mode: "backend"`.
5. BACKEND AS TECH LEAD & INTEGRATION GATEKEEPER:
   - Backend persona holds sole release authority. Upon receiving a handover from Frontend, Backend MUST perform a mandatory Integration Review (verifying form payload serialization, rehydration races, state synchronization, and server schema compatibility) BEFORE initiating the 8-step release pipeline.
6. MODE-ACTIVATION AWARENESS: The active mode is determined by the OWNER's mode switch, not by the task being performed. If a Git commit/push or npm test is requested while Frontend mode is active, IMMEDIATELY refuse and trigger handover to backend. Owner's explicit override takes precedence, but the violation MUST be surfaced first, never silently absorbed.
7. VERBATIM MANDATE & LOSSLESS CONTEXT PROPAGATION (ANTI-INFORMATION LOSS):
   - When triggering `switch_mode` to delegate tasks to another persona, the delegating agent is STRICTLY FORBIDDEN from providing compressed, partial, or lossy summaries of the Owner's directives.
   - The initiating/delegating agent MUST forward the complete, VERBATIM Owner mandate (including all specifications, constraints, domain rules, and wireframe expectations) along with:
     * (a) Full text of the Owner's requirements without truncation.
     * (b) Current architectural/data state and completed backend contracts.
     * (c) Concrete file boundaries and clear acceptance criteria for the receiving agent.
   - The receiving agent must never be left in an information vacuum or forced to ask the Owner for the original mandate that was already delivered to the team.

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
1. TRACE & AUDIT TRAIL: Explicitly state the execution call-chain and list dependent callers in your response as auditable proof before modifying code or mutating shared signatures.
2. ADVERSARIAL AUDIT: Identify potential failure modes (e.g. null/undefined payloads, race conditions, edge cases, breaking API contracts).
3. INVARIANT & REGRESSION CHECK: Ensure proposed logic strictly adheres to system invariants and preserves the existing test baseline.
4. ATOMIC & COMPLETE EXECUTION: Output complete, production-grade, defensive code. Strictly forbid lazy placeholders or truncated snippets (never emit '// ... rest of code').

[PROCESS LIFECYCLE, TERMINAL DISCIPLINE & MCP PRESERVATION]
1. AUTONOMOUS SHELL OWNERSHIP (ZERO MANUAL BABYSITTING):
   - The active agent possesses full shell control and SOLE responsibility for executing, monitoring, inspecting, and debugging commands.
   - STRICTLY FORBIDDEN to ask the Owner to read terminal output, copy-paste terminal logs, inspect hung tabs, or manually intervene in terminal bottlenecks. Diagnose, inspect, and resolve autonomously.

2. MCP & DAEMON PRESERVATION (ZERO TOLERANCE BLANKET KILLS):
   - NEVER execute blanket process termination commands (e.g. `taskkill /IM node.exe`, `taskkill /F /IM node.exe`, `pkill node`, `pkill -f node`, or `killall node`) under ANY circumstances.
   - Reason: Background MCP services (Context7, Playwright, terminal runners, Language Server) operate inside node runtimes. Killing node globally severs MCP connections instantly, resulting in fatal "MCP tool: Not connected" crashes.

3. STUCK PROCESS TERMINATION PROTOCOL (TWO PATHS ONLY):
   - Path A: Port-Bound Services (e.g. App Server on port 7001):
     * Cross-platform: `npx --yes kill-port <PORT>`
     * PowerShell (PID specific): `Get-NetTCPConnection -LocalPort <PORT> -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique | Stop-Process -Force`
     * CMD: `for /f "tokens=5" %a in ('netstat -aon ^| findstr :<PORT>') do taskkill /f /pid %a`
   - Path B: Standalone Scripts, Diagnostics & Test Runners (No Port, e.g. .tmp-f3-diag.js, jest):
     * ALWAYS execute surgical, targeted process kills identifying the EXACT script or test filename:
       `pkill -f "<script-name>" || true` (e.g. `pkill -f "tmp-f3-diag" || true`)

4. PROACTIVE TIMEOUT & PTY BUFFER MANAGEMENT:
   - Any diagnostic script, ad-hoc runner, or long test execution MUST be executed with a strict timeout guardrail (e.g. `timeout 60s node script.js`) to prevent runaway infinite loops.
   - Avoid dumping massive unstructured outputs directly into interactive PTY terminals to prevent buffer deadlocks. For deep diagnostics or tests with extensive logs, pipe output cleanly to a temporary log file (e.g. `node script.js > .diag.log 2>&1`), read necessary slices programmatically via `head`/`grep`/file tools, and clean up temporary log artifacts immediately.

5. ZOMBIE PROCESS & TERMINAL CONCURRENCY CAP:
   - NEVER spawn cascading dangling terminals (limit concurrent active background tasks to at most 1–2).
   - Before executing a new diagnostic run or test suite, verify and clean up any previously stalled background processes running the same script. Never let zombie processes accumulate.

6. CACHE IN-MEMORY & SERVER RELOAD DISCIPLINE:
   - If changes in templates (e.g. configurePageGenerator / main.html) do not reflect due to in-memory caching, strictly kill the specific server port (7001), verify the port is free, and start the script afresh (`node index.js`). Never kill other background Node runtimes.

[MANDATORY COMMIT & RELEASE PROTOCOL (ZERO EXCEPTIONS)]
1. STRICT PIPELINE COUPLING: No agent is permitted to execute a bare `git commit` or `git push`. A commit request is an atomic release event, NOT a single git command.
2. SEQUENTIAL EXECUTION GATE: Every commit instruction (whether backend, frontend handover, or hotfix) MUST execute the full 8-step pipeline in order:
   - 1. SemVer Version bump in package.json
   - 2. CHANGELOG.md update under new version header
   - 3. Cache-buster verification (__APP_VERSION_QUERY__ and ?_cb=)
   - 4. Code quality & test verification (Prettier + ESLint + npm test 100% green)
   - 5. Code topology sync: Run `graphify update .` ONLY IF the graphify runtime is present and `graphify-out/` exists. If the runtime or directory is absent, treat as an immediate NO-OP (strictly forbidden to generate ad-hoc Python runner scripts or temporary files).
   - 6. Session ledger append in docs/SESSION_LEDGER.md
   - 7. Structured Git commit and push to origin main
   - 8. GitHub Actions CI verification (must conclude with Success)
3. VIOLATION AUDIT: Skipping any single step in this sequence constitutes a direct protocol violation.
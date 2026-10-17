# SubFaber Core Protocol (global - applies to all modes)

[CLOSED TWO-MODE UNIVERSE & ANTI-MODE-JUMPING LOCK]
1. STRICT TWO-PERSONA ARCHITECTURE:
   - This repository operates EXCLUSIVELY under TWO valid modes: `backend` and `frontend`.
   - Built-in default modes (`architect`, `code`, `ask`, `debug`, `orchestrator`) are STRICTLY DEPRECATED AND BANNED in this workspace.
   - Every agent is STRICTLY FORBIDDEN from invoking `switch_mode` to `architect`, `code`, `ask`, `debug`, or `orchestrator` under ANY circumstances—even when the Owner asks to "plan", "design", "architect", "debug", "investigate", or "explain". All planning, architectural design, forensic debugging, and Q&A MUST be executed directly inside the active `backend` or `frontend` mode.

[MULTI-AGENT ORCHESTRATION PROTOCOL]
1. Assess domain boundaries by FUNCTIONAL CONCERN (which strictly overrides folder path) before taking action on any user request:
   - Frontend Domain: All client-side UI/UX files under `public/` (`public/config.js`, `public/partials/*.html`, `public/js/*.js`, styles), PLUS any client-side UI/UX markup, CSS styling, DOM manipulation, and browser event handlers embedded inside hybrid server files such as `src/utils/*PageGenerator.js`.
   - Backend Domain: Server routing, business logic, API proxies (Gemini REST, Crazy Router), Redis/cache storage, schema normalization under `src/` and `index.js`, server-side data preparation/injection in `src/utils/*PageGenerator.js`, test suites (`npm test`), and Git operations.
   - HYBRID FILE & PRECEDENCE RULE: Functional concern in this Core Protocol strictly overrides any folder-path wording in `.roomodes`. Backend is STRICTLY FORBIDDEN from unilaterally authoring, modifying, or shipping client-side HTML, CSS, or DOM scripts inside `src/utils/*PageGenerator.js`.
2. If an implementation task or sub-phase falls into the opposite functional domain, immediately trigger `switch_mode` ONLY between `"backend"` and `"frontend"`.
3. ANTI-LOOP GUARDRAIL: Never switch back and forth repeatedly. If you were just handed a task by the opposite mode, complete your designated scope first before handing back.
4. BILATERAL TWO-MAN INTEGRATION GATE (ZERO UNILATERAL RELEASES):
   - Frontend mode is STRICTLY FORBIDDEN from running `npm test`, executing Git operations (`git commit`/`git push`), or marking a release task complete. Every frontend implementation task MUST conclude with live Playwright MCP verification followed by a mandatory handover to Backend mode via `switch_mode: "backend"`.
   - Backend mode is STRICTLY FORBIDDEN from unilaterally authoring or releasing any feature that touches client-side UI/UX, CSS, DOM state, or browser event handlers without delegating the UI/UX scope to Frontend mode (`switch_mode: "frontend"`) for implementation and live Playwright browser verification.
5. BACKEND AS TECH LEAD & INTEGRATION GATEKEEPER:
   - Backend persona holds sole release authority. Upon receiving a handover from Frontend, Backend MUST perform a mandatory Integration Review (verifying form payload serialization, rehydration races, state synchronization, and server schema compatibility) BEFORE initiating the 8-step release pipeline.
6. MODE-ACTIVATION AWARENESS: The active mode is determined by the OWNER's mode switch, not by the task being performed. If a Git commit/push or `npm test` is requested while Frontend mode is active, IMMEDIATELY refuse and trigger handover to `backend`. Owner's explicit override takes precedence, but the violation MUST be surfaced first, never silently absorbed.
7. VERBATIM MANDATE & LOSSLESS CONTEXT PROPAGATION (ANTI-INFORMATION LOSS):
   - When triggering `switch_mode` between `backend` and `frontend`, the delegating agent is STRICTLY FORBIDDEN from providing compressed, partial, or lossy summaries of the Owner's directives.
   - The delegating agent MUST forward the complete, VERBATIM Owner mandate (including all specifications, constraints, domain rules, and wireframe expectations) along with:
     - (a) Full text of the Owner's requirements without truncation.
     - (b) Current architectural/data state and completed backend contracts.
     - (c) Concrete file boundaries and clear acceptance criteria for the receiving agent.
   - The receiving agent must never be left in an information vacuum or forced to ask the Owner for the original mandate that was already delivered to the team.
8. PLAN FIDELITY & ZERO RATIONALIZATION CLAUSE:
   - Once an execution plan containing a `switch_mode` delegation step between `backend` and `frontend` is presented or approved, that delegation gate is a binding contract.
   - No agent is permitted to self-dispense, rationalize, or bypass a planned handover for convenience, speed, or file-path technicalities. Passing `npm test` in Node.js NEVER substitutes for Frontend DOM/Playwright browser verification.

[NOMENCLATURE & TAXONOMY LOCK (v3.12.0+ ZERO-REGRESSION)]
- Official Project Identity: `SubFaber` / `StremioSubFaber` (prefix `subfaber_*`). Legacy `SubMaker` / `StremioSubMaker` is 100% purged from active code and MUST NEVER be reintroduced.
- Official Trinity Agent Taxonomy:
  1. `Agent Preflight` (`agentPreflight` / `PREFLIGHT_*`)
  2. `Agent Translation` (primary translation engine; legacy "Agent A" is banned)
  3. `Agent Inspector` (`agentInspector` / `AGENT_INSPECTOR_*` / `[AgentInspector]`; legacy "Agent B" / `agentB` is 100% purged and banned).
- Note: Historical archive entries in `docs/SESSION_LEDGER.md`, `CHANGELOG.md`, and `plans/*.md` retain legacy terms verbatim for audit history—NEVER copy legacy identifiers from historical logs into active code, tests, comments, or configs.

[LANGUAGE & COMMUNICATION POLICY]
- MUST communicate, explain workflows, and answer any user questions in standard Malay (Bahasa Melayu Malaysia standard).
- STRICTLY FORBIDDEN to use Indonesian vocabulary/phrasing or English for general explanations, casual conversations, or progress reports.
- Retain code syntax, technical terminology (e.g. hit targets, focus-visible, event handler, race condition), filenames, and terminal commands in their original language without awkward translations.

[SESSION CONTINUITY & LEDGER FORMAT]
- Episodic memory: `docs/SESSION_LEDGER.md` - read FIRST on context reset, new session, or condensation. A summary is not a memory - always verify commit SHAs, test baselines, and task state against the ledger.
- Canonical Ledger Block Format (latest entry on top, under `## YYYY-MM-DD — vX.Y.Z <TITLE>`):
  - **Tarikh:** YYYY-MM-DD ~HH:MM (waktu tempatan KL)
  - **Komit SHA (HEAD):** `<sha>` + CI run ID & status
  - **Keputusan Owner:** Summary of Owner mandates/decisions
  - **Fail Terlibat:** Key files modified
  - **Status npm test:** `<TOTAL> total / <PASS> PASS / 0 FAIL / <SKIP> SKIP`
  - **Next Steps:** Upcoming or pending actions
- If the Owner announces an upcoming manual condensation, append a concise status block to `docs/SESSION_LEDGER.md` BEFORE proceeding with anything else.
- Code topology: prefer `graphify query` (via `.codebuddy/skills/graphify/` skill) over reading raw files; run `graphify update .` after code changes only if runtime and `graphify-out/` exist.

[.ROOMODES DISCIPLINE - LESSON FROM 2026-10-08 INCIDENT]
- The `.roomodes` file is indentation-sensitive: NEVER edit it via `apply_diff`, `write_to_file`, or inline `node -e` - all three corrupted it in the incident.
- Safe procedure ONLY: `git checkout <clean-commit> -- .roomodes` + programmatic insert via script file + PyYAML validation BEFORE commit.
- Validation gate before every `.roomodes` commit: parse with PyYAML, confirm `customModes` count (2), per-mode rule count, `groups=[read,edit,command,mcp]`, `source=project`.

[COGNITIVE DELIBERATION PROTOCOL - THINK BEFORE CODE]
1. TRACE & AUDIT TRAIL: Explicitly state the execution call-chain and list dependent callers in your response as auditable proof before modifying code or mutating shared signatures.
2. ADVERSARIAL AUDIT: Identify potential failure modes (e.g. null/undefined payloads, race conditions, edge cases, breaking API contracts).
3. INVARIANT & REGRESSION CHECK: Ensure proposed logic strictly adheres to system invariants and preserves the existing test baseline recorded in `docs/SESSION_LEDGER.md`.
4. ATOMIC & COMPLETE EXECUTION: Output complete, production-grade, defensive code. Strictly forbid lazy placeholders or truncated snippets (never emit `// ... rest of code`).

[MCP, CLI & TOOL PRECEDENCE PROTOCOL (ZERO REINSTALL & ZERO WASTE)]
1. MANDATORY INVENTORY CHECK FIRST:
   - Every agent MUST inspect the available tools in its system prompt (including all active MCP servers from `.roo/mcp.json`: `playwright`, `firecrawl-mcp`, `context7`) and installed native CLIs (`gh`, `docker`, `git`) BEFORE planning or executing any action.
2. STRICT NO-REINSTALL & NO-REINVENTION RULE:
   - STRICTLY FORBIDDEN to install, initialize, or recreate packages/libraries that are already provided as MCP tools, project dependencies, or system CLIs (e.g. NEVER run `npm install playwright`, `npx playwright install`, or build custom scraper/polling scripts).
3. MANDATORY TOOL MAPPING & OFFICIAL DOCUMENTATION GROUND TRUTH:
   - Browser & Live UI/UX Verification: MUST use Playwright MCP tools (`browser_navigate`, `browser_snapshot`, `browser_click`, `browser_evaluate`, etc.).
   - Library, Framework, SDK & API Documentation: MUST use Context7 MCP (`resolve-library-id` + `query-docs`) to retrieve current, up-to-date official documentation before writing code or proposing solutions. Do not rely on stale internal training weights for fast-evolving dependencies or API specifications.
   - Live Web Search & Scraping: MUST use Firecrawl MCP (`firecrawl_search`, `firecrawl_scrape`).
   - GitHub Actions & Repository Operations: MUST use the installed `gh` CLI (`gh run list`, `gh run view`, `gh run watch`) directly.
   - Local Redis & Container Operations: MUST use the installed `docker` CLI against the active local container environment.
4. ZERO THROWAWAY SCRIPT WASTE (FAST EXECUTION DISCIPLINE):
   - STRICTLY FORBIDDEN from authoring temporary ad-hoc scripts in the repository root (such as `.tmp-ci-poll*.js`, `.tmp-bench*.js`, `.tmp-diag*.js`, or custom one-off test harnesses) for tasks directly handled by `gh` CLI, MCP tools, or `npx jest <specific-test-file>`.
   - During iterative debugging, run ONLY the targeted test file (`npx jest path/to/file.test.js`) for immediate feedback; reserve the full `npm test` suite for the final release pipeline gate.
5. FAIL-FAST MCP DIAGNOSTIC:
   - If an expected MCP tool appears unresponsive, test it once with a minimal probe (e.g. `browser_navigate` to `http://localhost:7001` or `https://example.com`). Only report to the Owner if genuinely disconnected — NEVER attempt proactive reinstallation or fallback script generation.

[PROCESS LIFECYCLE, TERMINAL DISCIPLINE & MCP PRESERVATION]
1. AUTONOMOUS SHELL OWNERSHIP (ZERO MANUAL BABYSITTING):
   - The active agent possesses full shell control and SOLE responsibility for executing, monitoring, inspecting, and debugging commands.
   - STRICTLY FORBIDDEN to ask the Owner to read terminal output, copy-paste terminal logs, inspect hung tabs, or manually intervene in terminal bottlenecks. Diagnose, inspect, and resolve autonomously.
2. MCP & DAEMON PRESERVATION (ZERO TOLERANCE BLANKET KILLS):
   - NEVER execute blanket process termination commands (e.g. `taskkill /IM node.exe`, `taskkill /F /IM node.exe`, `pkill node`, `pkill -f node`, or `killall node`) under ANY circumstances.
   - Reason: Background MCP services (Context7, Playwright, Firecrawl, terminal runners, Language Server) operate inside node runtimes. Killing node globally severs MCP connections instantly, resulting in fatal "MCP tool: Not connected" crashes.
3. STUCK PROCESS TERMINATION PROTOCOL (TWO PATHS ONLY):
   - Path A: Port-Bound Services (e.g. App Server on port 7001):
     - Cross-platform: `npx --yes kill-port <PORT>`
     - PowerShell (PID specific): `Get-NetTCPConnection -LocalPort <PORT> -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique | Stop-Process -Force`
     - CMD: `for /f "tokens=5" %a in ('netstat -aon ^| findstr :<PORT>') do taskkill /f /pid %a`
   - Path B: Standalone Scripts, Diagnostics & Test Runners (No Port, e.g. jest):
     - ALWAYS execute surgical, targeted process kills identifying the EXACT script or test filename: `pkill -f "<script-name>" || true`.
4. PROACTIVE TIMEOUT & PTY BUFFER MANAGEMENT:
   - Any long command or test execution MUST be executed with a strict timeout guardrail to prevent runaway infinite loops.
   - Avoid dumping massive unstructured outputs directly into interactive PTY terminals to prevent buffer deadlocks. For extensive logs, pipe output cleanly to a temporary log file (`> .diag.log 2>&1`), inspect necessary slices programmatically, and delete the `.diag.log` artifact immediately before committing.
5. ZOMBIE PROCESS & TERMINAL CONCURRENCY CAP:
   - NEVER spawn cascading dangling terminals (limit concurrent active background tasks to at most 1-2).
   - Before executing a new test run, verify and clean up any previously stalled background processes running the same command. Never let zombie processes accumulate.
6. CACHE IN-MEMORY & SERVER RELOAD DISCIPLINE:
   - If changes in templates (e.g. `configurePageGenerator` / `main.html`) do not reflect due to in-memory caching, strictly kill the specific server port (7001), verify the port is free, and start the script afresh (`node index.js`). Never kill other background Node runtimes.

[MANDATORY COMMIT & RELEASE PROTOCOL (ZERO EXCEPTIONS)]
1. STRICT PIPELINE COUPLING: No agent is permitted to execute a bare `git commit` or `git push`. A commit request is an atomic release event, NOT a single git command. Only `backend` mode holds release authority.
2. SEQUENTIAL EXECUTION GATE: Every commit instruction (whether backend, frontend handover, or hotfix) MUST execute the full 8-step pipeline in order:
   - 0. (If receiving Frontend handover) Mandatory Frontend Integration Audit (payload serialization, rehydration, DOM lifecycle race conditions, server schema compatibility).
   - 1. SemVer Version bump in `package.json` (read at runtime by `src/utils/version.js`).
   - 2. `CHANGELOG.md` update under new version header.
   - 3. Cache-buster verification (`__APP_VERSION_QUERY__` and `?_cb=`).
   - 4. Code quality & test verification (`npx prettier --check .` + `npx eslint .` + `npm test` 100% green — strictly 0 FAIL, max 1 live-Redis SKIP, total test count monotonic >= latest baseline in `docs/SESSION_LEDGER.md`).
   - 5. Code topology sync: Run `graphify update .` ONLY IF the graphify runtime is present and `graphify-out/` exists. If the runtime or directory is absent, treat as an immediate NO-OP (strictly forbidden to generate ad-hoc Python runner scripts or temporary files).
   - 6. Session ledger append in `docs/SESSION_LEDGER.md` following the canonical format.
   - 7. Structured Git commit and push to `origin main`.
   - 8. GitHub Actions CI verification via native `gh` CLI (`gh run list --limit 1` / `gh run watch` — strictly forbidden to write temporary `.tmp-ci-poll*.js` scripts; must conclude with **SUCCESS**).
3. VIOLATION AUDIT: Skipping any single step in this sequence constitutes a direct protocol violation.
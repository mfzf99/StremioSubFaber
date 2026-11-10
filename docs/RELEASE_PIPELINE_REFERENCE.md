# RELEASE PIPELINE REFERENCE

Secondary reference for the SubFaber Core Protocol (`.roo/rules/00-subfaber-core-protocol.md`).
This document carries the detailed release, commit-class, risk-matrix, and web-tooling procedures
so that the core protocol stays compact. **No gate is weakened here.** The core protocol's
phase list and status definitions are authoritative; this file is the expanded procedure.

---

## 1. Commit classes

### Class 1 — Release Commit

Code, prompt, application configuration, or governance changes that the Owner directs to release as
a new version. Must pass through Phase E and SemVer + CHANGELOG exactly once.

### Class 2 — Operational / Governance Update

Owner-directed updates to the ledger or purely operational documents without an application release:

- exempt from SemVer, a new CHANGELOG version, cache-busters, and Playwright;
- require only relevant validation/Prettier, explicit staging, staged-diff review, commit/push, and
  synchronization verification;
- must not be used to conceal runtime or test changes.

### Class 3 — Working Checkpoint

Only upon the Owner's explicit instruction, according to the scope and verification the Owner
specifies. It is not a release and cannot be considered `VERIFIED_LOCAL` / `RELEASED_CI_GREEN`
without the relevant gates.

## 2. Phase E — Single-Commit Release Pipeline

1. **Impact & Contract Audit:** verify acceptance, payload serialization, rehydration/DOM races, and
   server schema only according to scope; record valid `N/A` entries.
2. **SemVer:** bump `package.json` and synchronize `package-lock.json`.
3. **CHANGELOG:** add a new version entry with scope and evidence, in professional English (see the
   core protocol language lock).
4. **Cache-buster:** verify `__APP_VERSION_QUERY__` and `?_cb=` if assets/version paths are
   involved; otherwise record `NO-OP`.
5. **Quality gates:** Prettier + ESLint + full `npm test` and relevant CI gates; all must pass.
6. **Graphify:** run `graphify update .` only if the runtime and `graphify-out/` exist; otherwise
   `NO-OP` without ad hoc scripts.
7. **Pre-release ledger:** update `docs/SESSION_LEDGER.md` ONCE before the release commit with
   Parent HEAD SHA, `VERIFIED_LOCAL` status, Owner decision, files, local tests, and
   `Release Commit SHA + CI Run ID: confirmed in the final report after push/CI`.
8. **Explicit staging & release:** use an explicit file list — `git add -A` is FORBIDDEN. Review the
   staged diff/status, create ONE release commit, and push to `origin/main`; verify the remote
   points to that commit.
9. **CI:** use `gh run watch` / CLI until the workflow for the release commit is SUCCESS.
10. **Final report:** report the Release Commit SHA, CI Run ID, and `RELEASED_CI_GREEN` directly to
    the Owner. Do not create a second commit merely to write the SHA/CI into the ledger.

If CI fails, the release remains `RELEASED_CI_PENDING`; fix the cause through the hotfix
mandate/procedure, not a cosmetic ledger commit.

## 3. Risk-based verification matrix

| Change type                  | Minimum gates                                                                                | Conditional gates                                                             |
| ---------------------------- | -------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| CSS/visual only              | Relevant syntax/lint; local Playwright; screenshot; visual critique; responsive/interactions | Accessibility, theme toggle, console/network, reload                          |
| Provider/model/validation UI | Real-user flow; negative path; serialization/rehydration; targeted tests                     | Real key per key contract; backend contract tests; full browser matrix        |
| Backend without UI           | Call-chain/consumer audit; targeted tests; full suite before release                         | Playwright only if an API consumer/UI is involved; live integration on change |
| Docs/agent governance only   | Content/structure validation; relevant Prettier; diff audit                                  | PyYAML for `.roomodes`; tests only if runner/CI/release contract changes      |
| Security/data migration      | Adversarial tests; backward compatibility; rollback/recovery; full suite                     | Live integration, backup/restore, browser per attack surface                  |

For every UI/CSS change: open the page through Playwright, take a screenshot, assess visual
balance/contrast/whitespace/interactions, and fix issues before `VERIFIED_LOCAL`. Firecrawl is only
for exploring large new component designs; implementation remains Vanilla JS/Native CSS.

## 4. Test coverage invariants

- `npm test` must discover and run **100% of `*.test.js` files** under `src/` and `public/`; no
  manual registration or orphaned tests are allowed.
- The runner must fail closed if discovery is empty/fails and return the Node test runner's actual
  exit status.
- Release requires **0 FAIL** and at most **1 SKIP** for a valid live Redis integration.
  Investigate any other SKIP as a blocker.
- Do not delete, move out of the suite, or weaken assertions without equivalent coverage evidence
  and justification in the ledger.
- Test counts are recorded as information, not a blindly monotonic target. Splitting/merging tests
  is allowed if behaviour and coverage are preserved or increased.
- During debugging, use `node --test <target-file>`; the full `npm test` is mandatory for release.

## 5. Web MCP policy (Firecrawl primary, Crawl4AI fallback)

- **Firecrawl is primary** for search, scrape, map, and developer search. **Crawl4AI is fallback
  only** when Firecrawl is unavailable, out of quota/credit, fails, times out, is rate-limited, or
  produces demonstrably insufficient output for the requested URL. Do not use Crawl4AI in parallel
  or as a second source for identical content without an explicit cross-source verification need.
- Do not call Firecrawl merely to prove credit remains after the Owner reports the quota exhausted.
  Use Crawl4AI until the Owner-stated renewal date, then return to Firecrawl as primary.
- **Operational supply status belongs in `docs/SESSION_LEDGER.md`, not the core protocol.** Record
  Owner-reported quota exhaustion, renewal estimates, and verified provider failures with their
  observation date in the ledger; do not treat them as permanent facts or guarantees. Never store
  API keys in either document.
- Select the cheapest sufficient tool: search to discover sources, scrape for known URLs, map only
  when target URLs are unknown, developer search only for code/documentation evidence. Use Crawl4AI
  `search`, `scrape`, `extract`, or `batch` for equivalent needs; batch only when multiple URLs are
  genuinely required.
- Gather target URLs first and avoid pagination, `maxAge: 0`, browser rendering, premium proxies,
  extract/batch, and large crawls unless ordinary/lightweight cache evidence is insufficient. Do not
  repeat the same fetch without a new reason; reuse results already available in the session.
  `answer`, usage/billing, topup, monitor, and background-job tools are prohibited for routine
  retrieval.
- Before fallback, confirm genuine Firecrawl failure (quota/auth/service/timeout or empty output),
  not merely results that do not support a hypothesis. Crawl4AI remains subject to source, date, and
  critical-fact cross-checking; do not blend facts from two providers as though they were one
  response.
- If both providers are exhausted/failing, stop credit-wasting retries. State the blocker with
  concise evidence; use repository documents, Context7, `gh`, official sources, or request Owner
  direction without presenting web claims as verified.
- Playwright remains for application UI verification and browser interactions, not routine
  web-scraping replacement. Context7 remains the preferred source for supported library/API
  documentation.
- Project MCP configuration must expose only necessary tools (target below 60 overall) and preserve
  `timeout: 300` for each server unless the Owner directs otherwise.

## 6. Terminal & process hygiene

- Do not create throwaway scripts for tasks that existing tools/CLI can perform. Diagnostic
  artifacts must be deleted before commit.
- Do not blanket-kill Node/MCP. Port-bound service: kill the specific PID/port. Standalone
  script/test: target only the filename.
- Limit to 1–2 background tasks, use timeouts, and avoid large PTY output; temporary logs must be
  deleted.
- If the template cache is stale, restart only the server on port 7001; do not disturb other Node
  runtimes.
- `graphify query` is preferred for topology if the runtime is available; otherwise use ordinary
  read/search without generating ad hoc runners.

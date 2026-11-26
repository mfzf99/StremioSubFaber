# Constraints

Last reviewed: 2026-11-27 by @mfzf99 (Owner; defaults accepted on a Senior-Developer recommendation)

This file is SubFaber's written quality bar. Read it before writing code. Do not weaken it to make a change pass — fix the code, or record an exception in the table at the bottom with an owner and an expiry date. Every row names the command that produces the verdict; a dimension with a number and no command is an aspiration, not a constraint.

## Floor (always enforced, no setup required)

- No new suppression comments: `eslint-disable`, `istanbul ignore`
- No unimplemented stubs: `throw new Error("Not implemented")`, an empty `catch`, a `TODO` on a new line — an empty catch is allowed when its own line carries an `// intentional:` reason
- No skipped or added-`.skip` tests, no deleted test file, and no test file that ends with fewer assertions than it had, without a reason in the commit message
- No new exception row in this file without an Owner decision
- No secrets in source
- This file does not get weakened to make a change pass

## Enforced with numbers

| Dimension    | Rule                                                                                        | Checked by                                                                 | Runs at                           |
| ------------ | ------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- | --------------------------------- |
| Floor        | Zero floor violations                                                                       | `node scripts/floor-guard.js` (exit 0 clean, 1 violation, 2 could not run) | every commit, CI                  |
| Lint         | Zero ESLint errors, `no-undef` at `error`                                                   | `npx eslint .`                                                             | every commit, CI                  |
| Format       | Zero Prettier differences                                                                   | `npx prettier --check .`                                                   | every commit, CI                  |
| Tests        | 0 FAIL, and every `*.test.js` under `src/` and `public/` discovered                         | `npm test`                                                                 | every commit, CI                  |
| Tests (live) | 0 FAIL with `REDIS_INTEGRATION_PORT=6379`; at most 1 valid live-Redis SKIP when it is unset | `npm test`                                                                 | CI (service Redis), local release |
| Dependencies | Nothing at high or above in the production tree                                             | `npm audit --omit=dev --audit-level=high`                                  | CI                                |
| Docs         | Core protocol stays ≤ 200 lines and resolves its references                                 | `node scripts/relay-state-gate.js` + review                                | every commit                      |

## Measured, not yet enforced

| Metric                                         | Today                         | Direction     |
| ---------------------------------------------- | ----------------------------- | ------------- |
| Test count                                     | 904 (v3.43.0)                 | must not fall |
| ESLint `no-unused-vars` warnings               | 217                           | must not grow |
| `eslint-disable` directives in the active tree | 3 (pre-existing, other rules) | must not grow |

## Exceptions

| ID  | Rule                                      | Path                                       | Reason                                                                                                                                   | Owner   | Expires    |
| --- | ----------------------------------------- | ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------- | ------- | ---------- |
| W1  | Floor: suppression / stub / skip patterns | `src/utils/floor-guard-regression.test.js` | This file proves the guard catches weakened changes, so it must contain those shapes as fixture strings. Listed in `.constraintsignore`. | @mfzf99 | 2027-02-27 |
| W2  | Floor: suppression / skip patterns        | `scripts/floor-guard.js`                   | The guard names the shapes it detects inside its own regular expressions. Listed in `.constraintsignore`.                                | @mfzf99 | 2027-02-27 |

W1 and W2 were approved by the Owner on 2026-11-27 as part of the v3.42.0 house-cleaning mandate; the floor guard flagged W1's own row when it was added, which is the rule working as designed.

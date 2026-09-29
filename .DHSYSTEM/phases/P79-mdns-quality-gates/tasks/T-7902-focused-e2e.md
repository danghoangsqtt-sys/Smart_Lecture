# T-7902 â€” Focused and Isolated Quality Gates

## Objective

Separate focused regressions from the full process-level chain and restore a reliable complete E2E gate.

## Paths

- `package.json`
- `scripts/e2e-isolated.mjs`
- `scripts/e2e-smoke.ps1`
- `scripts/auth-rate-limit-test.mjs`
- `scripts/upgrade-path-test.mjs`
- `scripts/mdns-resilience-test.mjs`
- `scripts/auth-session-revocation-test.mjs`
- `scripts/admin-recovery-test.mjs`
- `.github/workflows/ci.yml`

## File-Level Plan

- `package.json`: expose named, build-once focused gates for upgrade, recovery/auth, upload/security, spreadsheet and mDNS, while retaining `test:e2e` as the final chain.
- `scripts/e2e-isolated.mjs`: disable mDNS only in the isolated child, use the test-only IPC shutdown from T-7901, track the active child, and identify failed stages with bounded waits and cleanup after exit. Never probe or stop the installed app on port 4000.
- `scripts/e2e-smoke.ps1`: use explicit bearer authentication without a shared cookie jar, refresh tokens after password changes, consume one-time imported student credentials, and keep assertions aligned with the current security contract.
- `scripts/auth-rate-limit-test.mjs`: use disabled mDNS and the same bounded private shutdown for its isolated server.
- `scripts/upgrade-path-test.mjs`, `scripts/mdns-resilience-test.mjs`, `scripts/auth-session-revocation-test.mjs`, `scripts/admin-recovery-test.mjs`: run as focused regression inputs; edit only if a concrete isolation failure is found.
- `.github/workflows/ci.yml`: run focused gates before the final E2E suite and retain the Browser suite.

## Best Practices

- Tests may adapt to security behavior; production CSRF/session enforcement must not be weakened to make smoke tests pass.
- Use temporary data roots and distinct test ports; only stop child processes created by the test, and await exit before deleting their files.
- Avoid reporting an existing process on a test port as the spawned child; stage failures must name the failing script.
- Keep one-time credentials within the isolated test and never print them to logs.

## Verification Commands

- `npm run test:focused` → all named focused checks PASS.
- `npm run test:e2e` twice → complete isolated suite PASS beside an installed instance.
- `npm run typecheck`, `npm run lint`, `npm run build` → exit 0.

## Verification Contract

- Every focused script and the complete isolated E2E suite pass repeatedly on Windows and CI.

## Status

- `in_progress`

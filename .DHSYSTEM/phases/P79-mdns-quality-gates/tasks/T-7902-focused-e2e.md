# T-7902 â€” Focused and Isolated Quality Gates

## Objective

Separate focused regressions from the full process-level chain and restore a reliable complete E2E gate.

## Paths

- `package.json`
- `scripts/e2e-isolated.mjs`
- `scripts/upgrade-path-test.mjs`
- `scripts/mdns-resilience-test.mjs`
- `scripts/auth-session-revocation-test.mjs`
- `scripts/admin-recovery-test.mjs`
- `.github/workflows/ci.yml`

## File-Level Plan

1. Add named focused scripts for upgrade, recovery/auth, upload/security, spreadsheet and mDNS contracts.
2. Give each child an isolated port/data root and deterministic shutdown deadline.
3. Keep a final orchestrator that reports the failing stage without hiding earlier evidence.
4. Exercise the Windows case where port 4000 and the SmartLecture mDNS name are already in use by a legitimate installed instance.

## Verification Contract

- Every focused script and the complete isolated E2E suite pass repeatedly on Windows and CI.

## Status

- `todo`

# REQ-20260929-007 â€” Make mDNS lifecycle and isolated E2E shutdown reliable

- Type: BUG
- Priority: high
- Status: planned
- Planned phase: P79 / T-7901, T-7902
- Audit tier: 3
- Detected: 2026-09-29

## Gap

The isolated E2E suite crashes on Windows when another SmartLecture instance already advertises the same Bonjour service. The initial upgrade-path assertion passes, then the child exits with a libuv handle-closing assertion.

## Evidence

- `npm run test:e2e` failed on 2026-09-29 with duplicate service-name output and exit code `3221226505`.
- `server/src/routes/system.routes.ts` does not retain/destroy the Bonjour instance during process shutdown.
- `scripts/upgrade-path-test.mjs` kills a real server process while mDNS handles remain active.

## Acceptance criteria

- Support disabling mDNS for isolated tests.
- Retain the Bonjour/service handles and stop/destroy them on SIGINT/SIGTERM and normal shutdown.
- A duplicate service name degrades to LAN-IP access without process crash.
- The full isolated E2E suite passes while another installed instance is running.

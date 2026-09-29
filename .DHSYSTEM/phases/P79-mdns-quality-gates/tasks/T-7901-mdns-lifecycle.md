# T-7901 â€” Bonjour Resource Ownership and Shutdown

## Objective

Make mDNS optional, non-fatal and cleanly stoppable on Windows.

## Paths

- `server/src/routes/system.routes.ts`
- `server/src/index.ts`
- `server/src/config.ts`
- `server/src/services/backup.ts`
- `scripts/mdns-resilience-test.mjs`
- `scripts/upgrade-path-test.mjs`

## File-Level Plan

- `server/src/config.ts`: expose an enabled-by-default `MDNS_ENABLED` flag; only explicit `0` disables network advertisement for isolated tests.
- `server/src/routes/system.routes.ts`: make `advertiseMdns()` return one controller that owns Bonjour/service/timer, degrades when publish never reaches `up` or socket errors, and stops/unpublishes/destroys idempotently. Keep `mdnsUrl` null whenever not confirmed advertised.
- `server/src/index.ts`: retain the controller and register SIGINT/SIGTERM plus test-only IPC shutdown; close HTTP/Socket and mDNS once, without touching another instance.
- `server/src/services/backup.ts`: return a disposer for the backup interval so shutdown does not leave the process alive.
- `scripts/mdns-resilience-test.mjs`: retain forced-socket-error regression and add deterministic duplicate/no-up/stop-twice checks without relying on LAN discovery timing.
- `scripts/upgrade-path-test.mjs`: start the server with isolated data, disabled mDNS and a private IPC shutdown channel; await child exit instead of force-killing and deleting an open DB.

## Best Practices

- Production mDNS stays enabled by default; LAN IP remains the fallback when Bonjour is unavailable.
- Test shutdown requires a child IPC channel and explicit test env flag; no unauthenticated HTTP endpoint or production control route.
- All timers/listeners are disposed once; no `process.exit()` before async close has finished.
- Existing single-instance server and backup behavior remain unchanged during normal operation.

## Verification Commands

- `npm run build -w server` → exit 0.
- `node scripts/mdns-resilience-test.mjs` → socket/duplicate/shutdown checks PASS.
- `node scripts/upgrade-path-test.mjs` → pre-v18 server starts and exits 0 without libuv assertion on Windows.
- `npm run typecheck` and `npm run lint` → exit 0.
- `npm run test:e2e` → no Bonjour collision or Windows teardown abort; remaining failures, if any, are triaged under T-7902.

## Verification Contract

- Duplicate name, simulated socket error and repeated shutdown never crash or leak handles.
- Upgrade-path child exits cleanly on Windows while another instance advertises SmartLecture.

## Status

- `in_progress`

# T-7901 â€” Bonjour Resource Ownership and Shutdown

## Objective

Make mDNS optional, non-fatal and cleanly stoppable on Windows.

## Paths

- `server/src/routes/system.routes.ts`
- `server/src/index.ts`
- `server/src/config.ts`
- `scripts/mdns-resilience-test.mjs`
- `scripts/upgrade-path-test.mjs`

## File-Level Plan

1. Return/retain an mDNS controller owning Bonjour and published service handles.
2. Handle duplicate service names and socket errors as a degraded status surfaced by system info.
3. Stop/unpublish/destroy exactly once during SIGINT, SIGTERM and test shutdown.
4. Add an explicit `MDNS_ENABLED=0` test/deployment override.

## Verification Contract

- Duplicate name, simulated socket error and repeated shutdown never crash or leak handles.
- Upgrade-path child exits cleanly on Windows while another instance advertises SmartLecture.

## Status

- `todo`

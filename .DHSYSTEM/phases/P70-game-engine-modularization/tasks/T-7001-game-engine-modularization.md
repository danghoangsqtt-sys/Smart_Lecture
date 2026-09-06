# T-7001 — Game Engine Modularization

## Objective

Separate the Socket.IO game engine into focused runtime modules without changing any classroom game contract.

## Paths

- `server/src/realtime/gameRoom.ts`
- `server/src/realtime/*`
- `scripts/socket-test.mjs`
- `scripts/circuit-restart-test.mjs`
- `.DHSYSTEM/phases/P70-game-engine-modularization/*`
- `.DHSYSTEM/TRACKER.md`
- `.DHSYSTEM/ROADMAP.md`
- `.DHSYSTEM/HANDOFF.json`
- `CHANGELOG.md`

## File-Level Plan

- Inventory shared types/state and all registered socket events before moving code.
- Extract pure shared room helpers, conventional game-mode handlers, and circuit runtime persistence/recovery behind typed boundaries.
- Leave `initGameEngine` responsible for server construction, authentication middleware, event binding, and composition only.
- Preserve the exact existing event names, payload shapes, authorization checks, timers, scoring and durable recovery semantics.

## Verification Contract

- `npm.cmd run typecheck`, `npm.cmd run build`, `npm.cmd run test:browser`, and `npm.cmd run test:e2e`.
- `git diff --check`.

## Status

- `done`
- 2026-09-03 checkpoint: moved the default circuit challenge catalog out of `gameRoom.ts`; typecheck and diff check pass. Browser E2E could not start because Windows repeatedly locks `test-results/.last-run.json` with `EPERM` before any test case executes. The task remains in progress and is not marked PASS.
- 2026-09-06 completion: extracted the circuit_simulate runtime (`circuitSimulateRuntime.ts`), room loading/restore (`roomStore.ts`), and circuit_draw init/auto-submit (`circuitDrawHandlers.ts`) from `gameRoom.ts`, which is now 430 lines and limited to shared room utilities, connection lifecycle, and `initGameEngine` composition. The 2026-09-03 EPERM report turned out to be a fresh-environment issue (Playwright browsers were never downloaded on that machine), not a real file lock — installing them (`npx playwright install chromium`) resolved it and the full Browser E2E suite now runs clean. Full verification contract passed: `npm run typecheck`, `npm run build`, `npm run test:e2e` (REST 86/86, Socket 10/10, regression 22/22, restore/restart, circuit restart prepare+verify), `npm run test:browser` (4/4), `git diff --check`.

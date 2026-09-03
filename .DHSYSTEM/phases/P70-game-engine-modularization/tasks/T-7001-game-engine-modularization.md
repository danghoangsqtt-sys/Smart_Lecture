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

- `in-progress`

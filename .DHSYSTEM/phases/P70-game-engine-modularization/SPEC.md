# P70 SPEC — Game Engine Modularization

## Problem

`server/src/realtime/gameRoom.ts` is the largest source file (~2.9k lines), mixing JWT/socket lifecycle, shared room state, multiple game modes, circuit runtime persistence/recovery, and event registration.

## Scope

- Split the implementation into typed realtime modules by shared lifecycle, conventional games, circuit simulation runtime, and Socket binding.
- Preserve existing socket event names/payloads, authorization, class enrollment checks, durable circuit recovery, timer semantics, grading and private assistance.

## Out of Scope

- No schema, REST API, client event, game-rule, scoring, or visual changes.

## Acceptance Criteria

1. `gameRoom.ts` becomes a thin composition/initialization boundary.
2. No Socket event contract or recovery/privacy behavior changes.
3. Typecheck, build, Browser E2E, REST/Socket/security-data/restart regressions and diff check pass.

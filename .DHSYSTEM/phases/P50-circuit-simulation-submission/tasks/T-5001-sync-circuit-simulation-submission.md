# T-5001 — Sync Circuit Simulation Submission

## Objective

Send a learner's circuit-simulation topology to the matching realtime server event so the existing server-side challenge evaluator can award and broadcast completion to the teacher.

## Paths

- `web/src/pages/GamePlayPage.tsx` — serialize canvas data once and route simulation changes/submission to `circuit_simulate:circuit`; retain `circuit_draw:submit` for drawing games.
- `web/src/pages/GamesPage.tsx` — retain the host completion feed when the next simulation challenge is dispatched.
- `web/src/components/CircuitCanvas.tsx` — apply a new challenge starter topology after the already-mounted canvas receives it and expose stable component/pin selectors for browser verification.
- `tests/browser/login.spec.ts` — preserve live default-room regression coverage; a separate browser case will build and wire a topology before asserting teacher completion.

## File-Level Plan

- Centralize the conversion from `CircuitData` to the socket-safe component/wire shape already accepted by the server Zod schema.
- Emit the simulation event on circuit changes and on explicit submit, so a static starter topology is also evaluated.
- Synchronize challenge starter data into the mounted editor without re-emitting it as a learner edit.
- Build and wire the first LED challenge through the browser canvas before submitting it, then assert the host pass feed.
- Award a valid submitted topology immediately while leaving the timer-driven global challenge sequence intact for other learners.
- Exercise host and student browser contexts without bypassing enrollment or socket authorization; do not treat an incomplete starter circuit as a correct answer.

## Best-Practice Checklist

- Preserve the existing draw-game event contract.
- Keep server-side topology matching as the source of truth.
- Verify through the complete production browser suite and React Doctor because a React page changes.

## Verification

- `npm run typecheck` — passed.
- `npm run test:browser` — passed, 4/4 with exact SVG topology and live host completion.
- `npm run test:e2e` — passed: core 86/86, socket 10/10, security/data regression 22/22, Excel and restore checks passed.
- `npx -y react-doctor@latest . --verbose --scope changed` — completed with no errors; four advisory state-synchronization warnings were reviewed. The editor intentionally owns mutable circuit state while accepting challenge/preview replacements, and identity guards prevent feedback resets for data emitted by that same editor.
- `git diff --check` — passed; only repository line-ending notices remain.

## Status

- `completed`

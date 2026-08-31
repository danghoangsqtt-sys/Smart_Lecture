# T-5401 — Persist Circuit Room Across Server Restart

## Objective

Make the SQLite database the durable recovery source for active circuit simulations while preserving the existing in-memory Socket.IO engine as the realtime authority during normal operation.

## Expected Outcome

After killing and restarting the Node.js server, the same room resumes at the same challenge deadline. The teacher sees the prior feed and ranking; each learner recovers the exact topology/completion state; timer progression and KTTX remain idempotent.

## Paths

- `server/src/db/schema.sql`
- `server/src/db/connection.ts`
- `server/src/realtime/gameRoom.ts`
- `scripts/circuit-restart-test.mjs`
- `scripts/e2e-isolated.mjs`
- `.DHSYSTEM/ARCHITECTURE.md`
- `.DHSYSTEM/phases/P54-circuit-server-restart-recovery/SPEC.md`
- `.DHSYSTEM/phases/P54-circuit-server-restart-recovery/PHASE-STATE.md`
- `.DHSYSTEM/phases/P54-circuit-server-restart-recovery/SUMMARY.md`
- `.DHSYSTEM/phases/P54-circuit-server-restart-recovery/tasks/T-5401-persist-circuit-room-across-restart.md`
- `.DHSYSTEM/TRACKER.md`
- `.DHSYSTEM/ROADMAP.md`
- `.DHSYSTEM/HANDOFF.json`
- `CHANGELOG.md`

## File-Level Plan

- `server/src/db/schema.sql`: define normalized runtime and per-player persistence tables with foreign keys, constrained simulation state, defaults, and an update index.
- `server/src/db/connection.ts`: add idempotent migration v19 for existing installations.
- `server/src/realtime/gameRoom.ts`: add absolute circuit deadline state; prepared upserts; safe JSON restoration; startup and room-code recovery; persistence hooks on start, challenge transition, learner creation, topology, measurement, simulation, completion, and timer evaluation.
- `scripts/circuit-restart-test.mjs`: create a real circuit room, submit a valid topology, persist restart metadata, then reconnect host and learner after restart to verify state, score, deadline, timer advancement, and unchanged KTTX.
- `scripts/e2e-isolated.mjs`: orchestrate a second real server restart dedicated to circuit persistence after the existing staged-database restore test.
- Architecture and DHSYSTEM records: document the new durable boundary, verification evidence, and next milestone.

## Best-Practice Checklist

- Use prepared statements and transactions for all persistence writes.
- Store learner rows independently to avoid rewriting whole-class JSON on every circuit edit.
- Treat persisted JSON as fallible input; validate/fallback instead of crashing startup.
- Keep challenge deadlines absolute and schedule only the remaining duration.
- Restore players as offline until their authenticated sockets reconnect.
- Never persist or transmit reference circuits as learner state.
- Preserve server-authoritative grading and completed-challenge idempotency.
- Restrict boot restoration to active `circuit_simulate` sessions.

## Verification Contract

- `npm run typecheck` → strict server and web typecheck pass.
- `npm run test:e2e` → migration v19 applies; existing REST 86/86, Socket 10/10, regression 22/22, Excel/restore checks pass; new circuit restart integration passes.
- `npm run test:browser` → four production browser workflows remain green.
- `git diff --check` → no whitespace errors.
- Git persistence → clean worktree, upstream configured, and zero unpushed commits after push.

## Status

- `completed`

## Verification Result

- Migration v19 applied on a fresh isolated database and remained compatible with staged backup restore.
- Real process restart retained challenge 1, its exact absolute deadline, 4-component/3-wire topology, completed state, one feed row, 100 circuit points, and KTTX 0.5.
- Learner successfully rejoined before the host; the original timer advanced to challenge 2 without resetting or awarding KTTX again.
- `npm run test:e2e` passed REST 86/86, Socket.IO 10/10, security/data regression 22/22, Excel routes, staged restore restart, and circuit restart integration.
- `npm run test:browser` passed production build and 4/4 browser workflows.

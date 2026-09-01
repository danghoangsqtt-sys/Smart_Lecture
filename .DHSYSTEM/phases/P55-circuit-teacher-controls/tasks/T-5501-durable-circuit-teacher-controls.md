# T-5501 — Durable Circuit Teacher Controls

## Objective

Add pause, resume, skip, and restart actions to an active circuit-simulation room with server authority, host authorization, deterministic timer behavior, and persistence across reconnect/process restart.

## Expected Outcome

The teacher can control challenge pacing without interrupting connected learners. A paused room survives reload and server restart; resume continues the remaining duration; skip/restart apply explicit non-destructive grading rules; host UI and automated tests reflect the authoritative state.

## Paths

- `server/src/db/schema.sql`
- `server/src/db/connection.ts`
- `server/src/realtime/gameRoom.ts`
- `web/src/pages/GamesPage.tsx`
- `tests/browser/login.spec.ts`
- `scripts/circuit-restart-test.mjs`
- `.DHSYSTEM/ARCHITECTURE.md`
- `.DHSYSTEM/phases/P55-circuit-teacher-controls/SPEC.md`
- `.DHSYSTEM/phases/P55-circuit-teacher-controls/PHASE-STATE.md`
- `.DHSYSTEM/phases/P55-circuit-teacher-controls/SUMMARY.md`
- `.DHSYSTEM/phases/P55-circuit-teacher-controls/tasks/T-5501-durable-circuit-teacher-controls.md`
- `.DHSYSTEM/TRACKER.md`
- `.DHSYSTEM/ROADMAP.md`
- `.DHSYSTEM/HANDOFF.json`
- `CHANGELOG.md`

## File-Level Plan

- `server/src/db/schema.sql`: extend the circuit runtime base schema with constrained pause and remaining-duration columns.
- `server/src/db/connection.ts`: add idempotent migration v20 for existing installations.
- `server/src/realtime/gameRoom.ts`: model paused runtime state; persist/restore it; separate challenge broadcast from timer scheduling; add a Zod-validated, host-authorized control event; preserve completion/KTTX idempotency.
- `web/src/pages/GamesPage.tsx`: extend the host snapshot/control-state types, listen for authoritative updates, and render accessible pause/resume, skip, and restart buttons with paused feedback.
- `tests/browser/login.spec.ts`: exercise host controls, reload recovery, and unchanged learner/KTTX flow in isolated browser contexts.
- `scripts/circuit-restart-test.mjs`: pause before process termination, verify paused recovery, resume from persisted remaining time, and confirm timer/KTTX integrity.
- Architecture and DHSYSTEM records: document the state machine, evidence, result, and next milestone.

## Best-Practice Checklist

- Validate every client action at the Socket.IO boundary and enforce the existing host authorization gate.
- Keep exactly one server timer; clear it and set its reference to `null` before rescheduling.
- Use absolute deadlines while running and a non-negative duration while paused.
- Never emit the topology-reset challenge event for pause/resume.
- Make skip non-grading and restart non-destructive to completed challenge IDs/KTTX.
- Persist runtime and affected learner rows transactionally for challenge resets.
- Keep reference circuits server-only.
- Use prepared statements and an idempotent migration.
- Use semantic buttons, readable state text, and disabled-state feedback in the host UI.

## Verification Contract

- `npm run typecheck` → strict server and web typecheck pass.
- `npm run build` → production server/web build pass.
- `npx -y react-doctor@latest web --verbose` → no new React errors; score recorded.
- `npm run test:e2e` → migration v20, REST/Socket/regression suites, staged restore, and paused circuit restart pass.
- `npm run test:browser` → all production Browser E2E workflows pass, including circuit host controls.
- `git diff --check` → no whitespace errors.
- Git persistence → clean worktree, configured upstream, zero unpushed commits after push.

## Status

- `completed`

## Verification Result

- Migration v20 applied cleanly on a fresh isolated database and remained compatible with staged database restore.
- Pause survived a real Node.js shutdown/restart and remained paused after the original deadline; resume used the exact persisted remaining duration.
- Browser E2E verified host pause, reload recovery, learner pause feedback, editing/submission while paused, resume, skip, restart, and later default challenges with three authenticated learners.
- Completion feed and 100-point circuit scores remained stable; KTTX stayed exactly 0.5 per completed learner without duplication.
- Typecheck/build passed; React Doctor changed-scope scored 100/100; backend E2E passed REST 86/86, Socket.IO 10/10, and security/data regression 22/22; Browser E2E passed 4/4.

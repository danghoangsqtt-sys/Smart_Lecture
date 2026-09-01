# T-5601 — Private Circuit Progress and Inspection

## Objective

Add compact realtime learner monitoring and authorized on-demand topology inspection for circuit simulation while eliminating the existing room-wide topology broadcast.

## Expected Outcome

The teacher can identify learners who are disconnected, not started, working, or completed and inspect one current circuit in a non-interactive preview. Learners cannot observe peer circuits, and all monitoring state recovers after host reload or process restart.

## Paths

- `server/src/realtime/gameRoom.ts`
- `web/src/pages/GamesPage.tsx`
- `tests/browser/login.spec.ts`
- `scripts/circuit-restart-test.mjs`
- `.DHSYSTEM/ARCHITECTURE.md`
- `.DHSYSTEM/phases/P56-circuit-learner-monitoring/SPEC.md`
- `.DHSYSTEM/phases/P56-circuit-learner-monitoring/PHASE-STATE.md`
- `.DHSYSTEM/phases/P56-circuit-learner-monitoring/SUMMARY.md`
- `.DHSYSTEM/phases/P56-circuit-learner-monitoring/tasks/T-5601-private-circuit-progress-inspection.md`
- `.DHSYSTEM/TRACKER.md`
- `.DHSYSTEM/ROADMAP.md`
- `.DHSYSTEM/HANDOFF.json`
- `CHANGELOG.md`

## File-Level Plan

- `server/src/realtime/gameRoom.ts`: define progress/inspection payload builders; join authorized hosts to a private monitoring room; include compact progress in host sync; emit lifecycle updates; validate inspection requests; replace the peer-visible topology broadcast with host-only updates.
- `web/src/pages/GamesPage.tsx`: model progress and selected inspection state; merge snapshots/live rows; request inspection; render accessible status rows and a read-only CircuitCanvas preview.
- `tests/browser/login.spec.ts`: verify three learners appear, live counts/status update, one topology can be inspected, reload restores monitoring, and existing controls/sequence remain green.
- `scripts/circuit-restart-test.mjs`: verify compact progress and on-demand topology inspection after a real process restart.
- Architecture and DHSYSTEM records: document the privacy boundary, evidence, completion, and next milestone.

## Best-Practice Checklist

- Validate inspection payloads with Zod and reuse the existing host authorization check.
- Never broadcast learner topology to the shared game room.
- Keep snapshots compact; fetch full topology only on demand.
- Expose no reference/answer circuit through monitoring events.
- Derive progress from authoritative server state rather than client-reported labels.
- Keep learner rows stable by `userId` and sort deterministically.
- Render inspection with a pointer-blocking read-only layer and an explicit accessible label.
- Preserve the single authoritative challenge timer and all P55 control semantics.

## Verification Contract

- `npm run typecheck` → strict server and web typecheck pass.
- `npm run build` → production build pass.
- `npx -y react-doctor@latest web --verbose --scope changed` → no new React errors; score recorded.
- `npm run test:e2e` → REST/Socket/regression suites, staged restore, and circuit restart monitoring pass.
- `npm run test:browser` → all production Browser E2E workflows pass with the monitoring assertions.
- `git diff --check` → no whitespace errors.
- Git persistence → clean worktree, configured upstream, and zero unpushed commits after push.

## Status

- `completed`

## Verification Result

- Shared-room topology broadcast was removed; a student inspection request produced no response while the authorized host received the exact requested topology.
- Real restart restored one completed learner with online/completed status, 4 components, 3 wires, 100 circuit points, and an inspectable 4/3 topology.
- Browser E2E verified three stable progress rows, not-started/working/completed/disconnected transitions, read-only topology preview, host reload recovery, late-learner reconnect, and all P55 controls/default challenge sequencing.
- Typecheck/build passed; React Doctor scored 100/100; backend E2E passed REST 86/86, Socket.IO 10/10, and security/data regression 22/22; Browser E2E passed 4/4.

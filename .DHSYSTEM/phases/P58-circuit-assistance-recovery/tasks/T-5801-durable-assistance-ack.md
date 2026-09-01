# T-5801 — Durable Assistance Delivery and Acknowledgement

## Objective

Persist the latest teacher assistance per circuit learner, deliver it after reconnect, and record explicit learner acknowledgement for the host.

## Expected Outcome

Teacher assistance is not lost when a learner is offline or the server restarts. The learner receives the latest pending message without losing circuit work, presses “Đã hiểu”, and the teacher sees the durable status.

## Paths

- `server/src/db/schema.sql`
- `server/src/db/connection.ts`
- `server/src/realtime/gameRoom.ts`
- `web/src/pages/GamesPage.tsx`
- `web/src/pages/GamePlayPage.tsx`
- `tests/browser/login.spec.ts`
- `scripts/circuit-restart-test.mjs`
- `.DHSYSTEM/ARCHITECTURE.md`
- `.DHSYSTEM/phases/P58-circuit-assistance-recovery/SPEC.md`
- `.DHSYSTEM/phases/P58-circuit-assistance-recovery/PHASE-STATE.md`
- `.DHSYSTEM/phases/P58-circuit-assistance-recovery/SUMMARY.md`
- `.DHSYSTEM/phases/P58-circuit-assistance-recovery/tasks/T-5801-durable-assistance-ack.md`
- `.DHSYSTEM/TRACKER.md`
- `.DHSYSTEM/ROADMAP.md`
- `.DHSYSTEM/HANDOFF.json`
- `CHANGELOG.md`

## File-Level Plan

- Database schema/connection: add idempotent migration v22 for a latest-assistance checkpoint keyed by session/learner with message, delivery, and acknowledgement epochs.
- Realtime engine: persist-before-send, deliver pending checkpoint on learner sync, validate learner acknowledgement, emit private host status, and include status in host recovery snapshot.
- Host UI: retain latest assistance status per learner, allow offline queueing, and display queued/delivered/acknowledged state in the selected inspection.
- Learner UI: retain message id, display a labelled “Đã hiểu” action, and emit an idempotent acknowledgement without changing CircuitData.
- Tests: verify restart durability, learner-first acknowledgement, authorization, offline Browser queue/reconnect, peer privacy, and unchanged topology/KTTX.
- Documentation: update architecture, phase state, tracker, roadmap, handoff, summary, and changelog with evidence.

## Best-Practice Checklist

- Use prepared statements and server-generated UUID message ids.
- Persist before delivery and update epochs transactionally/idempotently.
- Scope every query by active game session and authenticated learner id.
- Keep learner payload delivery direct; emit status only to the private host room/requesting host.
- Use explicit acknowledgement rather than inferring “read” from socket receipt.
- Supersede only the latest checkpoint; do not imply full message history.
- Keep assistance orthogonal to circuit runtime/grading persistence.
- Preserve labelled controls, `aria-live`, and React effect cleanup.

## Verification Contract

- `npm run typecheck` and `npm run build` pass.
- `npx -y react-doctor@latest web --verbose --scope changed` scores 100/100 or has no new confirmed issue.
- `npm run test:e2e` passes all backend suites plus restart queue/ack assertions.
- `npm run test:browser` passes all workflows plus offline delivery/ack/privacy assertions.
- `node --check scripts/circuit-restart-test.mjs` and `git diff --check` pass.
- Git worktree is clean with zero unpushed commits after persistence.

## Status

- `completed`

## Verification Result

- Migration v22 creates a constrained `game_circuit_assistance` latest-checkpoint table keyed by session/learner with a unique message id and delivery/acknowledgement epochs.
- Teacher send persists before delivery; offline learners return `queued`, reconnect updates `delivered`, and the explicit “Đã hiểu” action records `acknowledged` idempotently.
- Pending assistance is delivered once per socket connection and redelivered on a new connection only while unacknowledged.
- Host live status and `host:sync` restore queued/delivered/acknowledged state; peer learners never receive the message or status channel.
- Real restart E2E verified offline queue persistence, learner-first reconnect and acknowledgement before host attach, wrong-id denial, and restored acknowledged host status.
- Browser E2E verified offline queue → reconnect delivery → “Đã hiểu” with peer privacy and preserved topology/KTTX.
- Typecheck/build passed; React Doctor scored 100/100; backend E2E passed REST 86/86, Socket.IO 10/10, security/data regression 22/22, staged restore, and circuit restart; Browser E2E passed 4/4.

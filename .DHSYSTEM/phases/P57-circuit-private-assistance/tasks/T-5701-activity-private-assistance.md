# T-5701 — Activity Tracking and Private Assistance

## Objective

Add durable learner activity timestamps, a dynamic stuck indicator, and host-authorized private hint/retry delivery for circuit simulation.

## Expected Outcome

The teacher can spot an inactive in-progress learner and send a concise private intervention. The selected learner sees it immediately without losing work; peers do not receive it; monitoring and timestamps recover after restart.

## Paths

- `server/src/db/schema.sql`
- `server/src/db/connection.ts`
- `server/src/realtime/gameRoom.ts`
- `web/src/pages/GamesPage.tsx`
- `web/src/pages/GamePlayPage.tsx`
- `tests/browser/login.spec.ts`
- `scripts/circuit-restart-test.mjs`
- `.DHSYSTEM/ARCHITECTURE.md`
- `.DHSYSTEM/phases/P57-circuit-private-assistance/SPEC.md`
- `.DHSYSTEM/phases/P57-circuit-private-assistance/PHASE-STATE.md`
- `.DHSYSTEM/phases/P57-circuit-private-assistance/SUMMARY.md`
- `.DHSYSTEM/phases/P57-circuit-private-assistance/tasks/T-5701-activity-private-assistance.md`
- `.DHSYSTEM/TRACKER.md`
- `.DHSYSTEM/ROADMAP.md`
- `.DHSYSTEM/HANDOFF.json`
- `CHANGELOG.md`

## File-Level Plan

- `server/src/db/schema.sql`: add constrained `last_activity_at` to the base circuit player schema.
- `server/src/db/connection.ts`: add idempotent migration v21 and backfill existing rows from their update timestamp.
- `server/src/realtime/gameRoom.ts`: carry/persist/restore authoritative activity time; expose it in monitoring payloads; validate host assistance payloads; deliver only to selected learner sockets and acknowledge delivery to the host.
- `web/src/pages/GamesPage.tsx`: render activity age/stuck state; add private hint input and retry action inside selected inspection; show delivery feedback.
- `web/src/pages/GamePlayPage.tsx`: receive and display the latest private teacher assistance without touching CircuitData.
- `tests/browser/login.spec.ts`: verify stuck state, selected-only hint/retry visibility, preserved topology, and existing monitoring/control flow.
- `scripts/circuit-restart-test.mjs`: verify activity timestamp persistence and student denial/host delivery authorization after restart.
- Architecture and DHSYSTEM records: document the private delivery boundary and verification evidence.

## Best-Practice Checklist

- Validate Socket payloads with Zod and enforce the existing room-host check.
- Trim and cap teacher text; never broadcast private assistance to the shared room.
- Resolve learner sockets from the current authenticated room membership.
- Keep activity epoch independent from SQLite row `updated_at`.
- Do not mark not-started, completed, or offline learners as stuck.
- Do not mutate topology, completion, score, or timer from assistance actions.
- Use labelled input/buttons and an `aria-live` learner message region.
- Preserve P56 topology privacy and on-demand inspection subscription.

## Verification Contract

- `npm run typecheck` → strict server and web typecheck pass.
- `npm run build` → production build pass.
- `npx -y react-doctor@latest web --verbose --scope changed` → no new React errors; score recorded.
- `npm run test:e2e` → migration v21, authorization/privacy, staged restore, and restart activity checks pass with all backend suites.
- `npm run test:browser` → all Browser E2E workflows pass with stuck/private delivery assertions.
- `git diff --check` → no whitespace errors.
- Git persistence → clean worktree, configured upstream, and zero unpushed commits after push.

## Status

- `completed`

## Verification Result

- Migration v21 added and backfilled `last_activity_at`; circuit edit, measurement, and simulation events are the only activity writers.
- Host progress derives “Cần hỗ trợ” locally after 10 inactive seconds only for online learners with work in progress.
- Host-only hint/retry actions validate payload and room ownership, target only the selected authenticated learner sockets, and return a direct delivered/not-delivered acknowledgement.
- Learner assistance uses an `aria-live` message panel and preserves the current CircuitData; teacher selection includes a labelled 300-character hint field and offline-safe controls.
- Real process restart restored the exact activity epoch/topology/completion, denied learner impersonation, delivered hint/retry, and preserved topology/KTTX/timer semantics.
- Typecheck/build passed; React Doctor scored 100/100; backend E2E passed REST 86/86, Socket.IO 10/10, security/data regression 22/22, staged restore, and circuit restart; Browser E2E passed 4/4.

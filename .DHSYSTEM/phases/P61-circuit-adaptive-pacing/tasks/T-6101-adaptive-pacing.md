# T-6101 — Circuit Adaptive Pacing

## Objective

Add a classroom-readiness summary and durable host-only extend/evaluate controls to the active circuit challenge.

## Expected Outcome

The teacher can add 30 seconds while running or paused, see the new authoritative time on all clients, and evaluate/advance immediately when the class is ready. Extended paused time survives a real process restart and evaluation preserves one-time grading.

## Paths

- `server/src/realtime/gameRoom.ts`
- `web/src/pages/GamesPage.tsx`
- `scripts/circuit-restart-test.mjs`
- `tests/browser/login.spec.ts`
- `.DHSYSTEM/ARCHITECTURE.md`
- `.DHSYSTEM/phases/P61-circuit-adaptive-pacing/SPEC.md`
- `.DHSYSTEM/phases/P61-circuit-adaptive-pacing/PHASE-STATE.md`
- `.DHSYSTEM/phases/P61-circuit-adaptive-pacing/SUMMARY.md`
- `.DHSYSTEM/phases/P61-circuit-adaptive-pacing/tasks/T-6101-adaptive-pacing.md`
- `.DHSYSTEM/TRACKER.md`
- `.DHSYSTEM/ROADMAP.md`
- `.DHSYSTEM/HANDOFF.json`
- `CHANGELOG.md`

## File-Level Plan

- `gameRoom.ts`: extend the validated host-control enum; add capped 30-second extension for running/paused state; route immediate evaluation through the existing evaluator.
- `GamesPage.tsx`: extend control types and render readiness metrics, progress bar, `+30 giây`, and `Chấm ngay & chuyển bài` actions.
- `circuit-restart-test.mjs`: verify host-only paused extension persists exactly through process restart and still resumes without duplicate grading.
- `login.spec.ts`: verify paused extension is reflected to host/learner and immediate evaluation advances the challenge sequence.
- Architecture/DHSYSTEM/changelog: document pacing authority, cap, evidence, and completion state.

## Best-Practice Checklist

- Reuse the single server evaluator and existing persistence statements.
- Clear/reschedule timers exactly once and broadcast authoritative state.
- Cap remaining duration at 10 minutes.
- Reject student control payloads through the existing host authorization gate.
- Derive readiness from metadata; never bulk-load topology.
- Keep UI labels explicit because immediate evaluation advances the lesson.
- Preserve stable Socket listener cleanup and accessible button/status semantics.

## Verification Contract

- `npm run typecheck` and `npm run build` pass.
- `npx -y react-doctor@latest web --verbose --scope changed` scores 100/100 or introduces no confirmed issue.
- `npm run test:browser` passes all workflows with extend/evaluate coverage.
- `npm run test:e2e` passes REST, Socket, security/data, restore, and circuit restart pacing.
- `git diff --check` passes and Git persistence is clean after push.

## Status

- `completed`

## Verification

- `npm run typecheck`: PASS.
- `npm run test:browser`: PASS, 4/4 workflows with paused extension/readiness/immediate evaluation.
- `npx -y react-doctor@latest web --verbose --scope changed`: 100/100.
- `npm run test:e2e`: PASS, REST 86/86, Socket 10/10, security/data 22/22, restore and circuit restart pacing PASS.
- `npm run build`: PASS as part of Browser E2E.

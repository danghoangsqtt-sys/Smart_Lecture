# T-6001 — Circuit Submission Diagnostics

## Objective

Persist the latest current-challenge validation checkpoint and make incorrect submissions actionable for both learner correction and teacher triage.

## Expected Outcome

After an incorrect explicit submission, the learner retains a clear diagnostic panel and the teacher sees the learner in an incorrect-submission filter with attempt count and safe reason. The exact state survives host reload and Node.js restart, then resets at the next/restarted challenge.

## Paths

- `server/src/db/connection.ts`
- `server/src/db/schema.sql`
- `server/src/realtime/gameRoom.ts`
- `web/src/pages/GamePlayPage.tsx`
- `web/src/pages/GamesPage.tsx`
- `scripts/circuit-restart-test.mjs`
- `tests/browser/login.spec.ts`
- `.DHSYSTEM/ARCHITECTURE.md`
- `.DHSYSTEM/phases/P60-circuit-submission-diagnostics/SPEC.md`
- `.DHSYSTEM/phases/P60-circuit-submission-diagnostics/PHASE-STATE.md`
- `.DHSYSTEM/phases/P60-circuit-submission-diagnostics/SUMMARY.md`
- `.DHSYSTEM/phases/P60-circuit-submission-diagnostics/tasks/T-6001-submission-diagnostics.md`
- `.DHSYSTEM/TRACKER.md`
- `.DHSYSTEM/ROADMAP.md`
- `.DHSYSTEM/HANDOFF.json`
- `CHANGELOG.md`

## File-Level Plan

- `connection.ts` and `schema.sql`: add migration v23/current-schema columns for attempt count, latest submission time, validation code, and safe feedback.
- `gameRoom.ts`: model, reset, persist, restore, and emit diagnostics; convert mismatch feedback to a structured server-side result without changing grading.
- `GamePlayPage.tsx`: keep the latest validation in player state and render an accessible persistent panel.
- `GamesPage.tsx`: extend private progress metadata, priority, incorrect count/filter, row badge, and inspection detail.
- `circuit-restart-test.mjs`: prepare an incorrect submission and verify exact diagnostic recovery before successful completion.
- `login.spec.ts`: cover learner persistent feedback, teacher incorrect-submission triage, correction, and removal after success.
- Architecture/DHSYSTEM/changelog: document the private checkpoint contract, migration, evidence, and completion state.

## Best-Practice Checklist

- Validate every Socket payload and keep the server authoritative.
- Increment only on explicit submission; topology sync remains telemetry, not an attempt.
- Store one bounded checkpoint per current challenge, not unbounded history.
- Never emit reference topology or diagnostic metadata to peer learners.
- Reset diagnostics with challenge state but never revoke completed score/KTTX.
- Use prepared SQLite statements and idempotent migration guards.
- Use semantic live status for learner feedback and pressed-state teacher filters.
- Preserve stable user IDs and deterministic triage ordering.
- Keep React effects/listeners cleaned up and avoid duplicating API shapes outside the page boundary.

## Verification Contract

- `npm run typecheck` and `npm run build` pass.
- `npx -y react-doctor@latest web --verbose --scope changed` scores 100/100 or introduces no confirmed issue.
- `npm run test:browser` passes all workflows including incorrect → correct submission transitions.
- `npm run test:e2e` passes REST, Socket, security/data, restore, and circuit restart diagnostics.
- `git diff --check` passes and Git persistence is clean after push.

## Status

- `completed`

## Verification

- `npm run typecheck`: PASS.
- `npm run test:browser`: PASS, 4/4 workflows including incorrect → correct and repeated correct submission.
- `npx -y react-doctor@latest web --verbose --scope changed`: 100/100.
- `npm run test:e2e`: PASS, REST 86/86, Socket 10/10, security/data 22/22, restore and circuit restart diagnostics PASS.
- `npm run build`: PASS as part of Browser E2E.

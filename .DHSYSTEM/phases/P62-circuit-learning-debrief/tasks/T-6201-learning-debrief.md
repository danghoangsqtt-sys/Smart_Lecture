# T-6201 — Circuit Learning Debrief

## Objective

Give the teacher an authoritative end-of-game learning summary and retain safe per-learner circuit outcomes for later use.

## Expected Outcome

After the final circuit challenge, the host sees class completion, submitted/incorrect attempts, and learner-level outcomes. Cumulative counters survive process restart and result details are stored without topology or private feedback.

## Paths

- `server/src/db/connection.ts`
- `server/src/db/schema.sql`
- `server/src/realtime/gameRoom.ts`
- `web/src/pages/GamesPage.tsx`
- `scripts/circuit-restart-test.mjs`
- `tests/browser/login.spec.ts`
- `.DHSYSTEM/ARCHITECTURE.md`
- `.DHSYSTEM/phases/P62-circuit-learning-debrief/SPEC.md`
- `.DHSYSTEM/phases/P62-circuit-learning-debrief/PHASE-STATE.md`
- `.DHSYSTEM/phases/P62-circuit-learning-debrief/SUMMARY.md`
- `.DHSYSTEM/phases/P62-circuit-learning-debrief/tasks/T-6201-learning-debrief.md`
- `.DHSYSTEM/TRACKER.md`
- `.DHSYSTEM/ROADMAP.md`
- `.DHSYSTEM/HANDOFF.json`
- `CHANGELOG.md`

## File-Level Plan

- DB schema/migration: add v24 cumulative submitted/incorrect counters with non-negative constraints.
- `gameRoom.ts`: restore/persist/increment cumulative counters; construct a typed safe debrief once; emit it and persist per-learner result detail idempotently.
- `GamesPage.tsx`: retain the typed finish payload and render circuit summary cards plus learner outcome table.
- Restart integration: verify counters survive process restart and remain unaffected by host evaluation.
- Browser integration: drive incorrect/correct submissions through final challenge and assert the final host debrief.
- Architecture/DHSYSTEM/changelog: document data ownership, privacy boundary, evidence, and completion state.

## Best-Practice Checklist

- Keep counters server-authoritative and increment only on explicit submission.
- Reuse the existing circuit validator and finish transaction.
- Use prepared statements and non-negative database constraints.
- Store only bounded safe metrics in result detail.
- Do not use display name as the debrief persistence identity.
- Keep non-circuit payloads and UI behavior backward compatible.
- Preserve stable Socket cleanup and accessible final-state semantics.

## Verification Contract

- `npm run typecheck` and `npm run build` pass.
- React Doctor changed-scope scores 100/100 or introduces no confirmed issue.
- `npm run test:browser` passes with final-debrief coverage.
- `npm run test:e2e` passes REST, Socket, security/data, restore, and circuit restart coverage.
- `git diff --check` passes and Git persistence is clean after push.

## Status

- `completed`

## Verification

- `npm run typecheck`: PASS.
- `npm run build`: PASS as part of Browser E2E.
- React Doctor changed scope: 100/100.
- `npm run test:browser`: PASS, 4/4 workflows with final circuit debrief coverage.
- `npm run test:e2e`: PASS, REST 86/86, Socket 10/10, security/data 22/22, restore and circuit restart/debrief persistence PASS.

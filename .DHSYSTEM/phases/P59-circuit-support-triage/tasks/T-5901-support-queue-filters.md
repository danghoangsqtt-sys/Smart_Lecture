# T-5901 — Circuit Support Queue and Filters

## Objective

Add an accessible, realtime priority queue and filters to the circuit learner monitor so a teacher can reach the next learner needing intervention quickly.

## Expected Outcome

The host can see how many learners require attention, filter a large class, and select the next learner according to explicit deterministic priority while retaining P56–P58 privacy and recovery semantics.

## Paths

- `web/src/pages/GamesPage.tsx`
- `tests/browser/login.spec.ts`
- `.DHSYSTEM/phases/P59-circuit-support-triage/SPEC.md`
- `.DHSYSTEM/phases/P59-circuit-support-triage/PHASE-STATE.md`
- `.DHSYSTEM/phases/P59-circuit-support-triage/SUMMARY.md`
- `.DHSYSTEM/phases/P59-circuit-support-triage/tasks/T-5901-support-queue-filters.md`
- `.DHSYSTEM/TRACKER.md`
- `.DHSYSTEM/ROADMAP.md`
- `.DHSYSTEM/HANDOFF.json`
- `CHANGELOG.md`

## File-Level Plan

- `GamesPage.tsx`: derive priority/status metadata from progress and latest assistance; add accessible count cards, filter controls, stable sorting, row assistance badges, empty-filter feedback, and next-attention selection.
- `login.spec.ts`: assert a stuck learner enters the attention filter, next-attention selects that learner, offline queued assistance is visible, and acknowledgement removes the pending assistance state.
- DHSYSTEM/changelog files: record priority semantics, verification evidence, completion, and next boundary.

## Best-Practice Checklist

- Keep the queue purely derived; do not duplicate authoritative Socket state.
- Use stable user ids for rows, oldest activity first within each priority, and deterministic name tie-breaking.
- Exclude acknowledged checkpoints from attention counts.
- Make filters real buttons with pressed state and visible counts.
- Keep empty filter states explicit and accessible.
- Reset draft hint when changing selected learner.
- Do not load topology until the existing inspect action is triggered.
- Preserve React effect cleanup and avoid new broad state/effect chains.

## Verification Contract

- `npm run typecheck` and `npm run build` pass.
- `npx -y react-doctor@latest web --verbose --scope changed` scores 100/100 or has no new confirmed issue.
- `npm run test:browser` passes all workflows with support triage assertions.
- `npm run test:e2e` passes full backend/restart regression unchanged.
- `git diff --check` passes and Git persistence is clean after push.

## Status

- `completed`

## Verification

- `npm run typecheck`: PASS.
- `npm run test:browser`: PASS, 4/4 workflows.
- `npx -y react-doctor@latest web --verbose --scope changed`: 100/100.
- `npm run test:e2e`: PASS, REST 86/86, Socket 10/10, security/data 22/22, restore and circuit restart PASS.
- `npm run build`: PASS as part of Browser E2E.

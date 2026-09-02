# T-6301 — Circuit Debrief Recovery

## Objective

Make P62 circuit learning debriefs safely accessible after the live finish screen is gone.

## Paths

- `server/src/routes/games.routes.ts`
- `web/src/pages/GamesPage.tsx`
- `scripts/circuit-restart-test.mjs`
- `tests/browser/login.spec.ts`
- `.DHSYSTEM/ARCHITECTURE.md`
- `.DHSYSTEM/phases/P63-circuit-debrief-recovery/*`
- `.DHSYSTEM/TRACKER.md`
- `.DHSYSTEM/ROADMAP.md`
- `.DHSYSTEM/HANDOFF.json`
- `CHANGELOG.md`

## File-Level Plan

- Games route: validate versioned detail rows, reconstruct authoritative summary, add single and recent host-scoped read endpoints, and authorize optional class filtering.
- Games page: load recent reports when no active room, render compact cards, and reuse the P62 detail component for expansion.
- Restart integration: verify host retrieval, recent listing, and student denial from persisted result rows.
- Browser integration: reload the completed game page and expand the recovered report.
- Documentation: record the historical-read boundary, malformed-detail behavior, evidence, and completion state.

## Best-Practice Checklist

- Parse stored JSON through Zod after guarded JSON decoding.
- Never return raw `detail_json` or topology-bearing state.
- Use prepared SQL and existing host/class access helpers.
- Bound list size and scan size.
- Keep active and finished recovery paths separate.
- Reuse one debrief UI component and stable learner IDs.
- Preserve Socket listener cleanup and accessible disclosure controls.

## Verification Contract

- `npm run typecheck` and `npm run build` pass.
- React Doctor changed-scope scores 100/100 or introduces no confirmed issue.
- Browser E2E passes with reload/recovered-report coverage.
- Full backend E2E passes with host/student authorization and durable retrieval coverage.
- `git diff --check` and post-push persistence checks pass.

## Status

- `completed`

## Verification

- `npm run typecheck`: PASS.
- `npm run build`: PASS as part of Browser E2E.
- React Doctor changed scope: 100/100.
- `npm run test:browser`: PASS, 4/4 with reload/recovered-report expansion.
- `npm run test:e2e`: PASS, REST 86/86, Socket 10/10, security/data 22/22, restore and circuit restart/retrieval authorization PASS.

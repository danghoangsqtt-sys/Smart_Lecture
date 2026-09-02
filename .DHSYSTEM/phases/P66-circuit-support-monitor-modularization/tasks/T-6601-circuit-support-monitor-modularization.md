# T-6601 — Circuit Support Monitor Modularization

## Objective

Reduce circuit host-monitor complexity while preserving learner triage, inspection, and private assistance behavior.

## Paths

- `web/src/pages/GamesPage.tsx`
- `.DHSYSTEM/ARCHITECTURE.md`
- `.DHSYSTEM/phases/P66-circuit-support-monitor-modularization/*`
- `.DHSYSTEM/TRACKER.md`
- `.DHSYSTEM/ROADMAP.md`
- `.DHSYSTEM/HANDOFF.json`
- `CHANGELOG.md`

## File-Level Plan

- Keep queue derivation and local filter/hint state in `CircuitProgressMonitor`.
- Extract queue controls, progress list/row, inspection diagnostics/topology, and private assistance views.
- Preserve typed callback boundaries and exact render conditions.
- Run React Doctor and full product regressions.

## Verification Contract

- `npm run typecheck`.
- React Doctor changed scope with zero diagnostics.
- `npm run test:browser` and `npm run test:e2e`.
- `git diff --check` and post-push persistence checks.

## Status

- `completed`

## Verification

- `npm run typecheck`: PASS.
- `npm run build`: PASS as part of Browser E2E.
- React Doctor changed scope: 0 issues, 92/100; full scan no longer reports `CircuitProgressMonitor`.
- `npm run test:browser`: PASS, 4/4.
- `npm run test:e2e`: PASS, REST 86/86, Socket 10/10, security/data 22/22, restore and circuit restart/export parsing PASS.
- `git diff --check`: PASS.

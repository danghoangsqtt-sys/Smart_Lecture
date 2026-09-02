# T-6701 — Game Creator Orchestration

## Objective

Reduce game-creator control-flow complexity without changing any mode configuration or request contract.

## Paths

- `web/src/pages/GamesPage.tsx`
- `.DHSYSTEM/ARCHITECTURE.md`
- `.DHSYSTEM/phases/P67-game-creator-orchestration-modularization/*`
- `.DHSYSTEM/TRACKER.md`
- `.DHSYSTEM/ROADMAP.md`
- `.DHSYSTEM/HANDOFF.json`
- `CHANGELOG.md`

## File-Level Plan

- Add typed pure serializers for circuit templates and complete game payloads.
- Keep loading/state/request orchestration in `CreateGameTab`.
- Move question/crossword/settings/modal composition into a typed workspace component.
- Run React Doctor and full regression gates.

## Verification Contract

- `npm run typecheck`.
- React Doctor changed scope with zero diagnostics; full scan removes the target finding.
- `npm run test:browser` and `npm run test:e2e`.
- `git diff --check` and post-push persistence checks.

## Status

- `completed`

## Verification

- `npm run typecheck`: PASS.
- `npm run build`: PASS as part of Browser E2E.
- React Doctor changed scope: 100/100, 0 issues; full scan removes the target and all `GamesPage` findings.
- `npm run test:browser`: PASS, 4/4.
- `npm run test:e2e`: PASS, REST 86/86, Socket 10/10, security/data 22/22, restore and circuit restart/export parsing PASS.
- `git diff --check`: PASS.

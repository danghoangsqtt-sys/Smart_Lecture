# T-6501 — Host Console Modularization

## Objective

Reduce host-console render complexity while preserving all classroom game contracts and behavior.

## Paths

- `web/src/pages/GamesPage.tsx`
- `.DHSYSTEM/ARCHITECTURE.md`
- `.DHSYSTEM/phases/P65-game-host-console-modularization/*`
- `.DHSYSTEM/TRACKER.md`
- `.DHSYSTEM/ROADMAP.md`
- `.DHSYSTEM/HANDOFF.json`
- `CHANGELOG.md`

## File-Level Plan

- Extract lifecycle views for room header, lobby, hand raise, crossword, tug of war, race, quiz round, and final results.
- Extract each sandbox game renderer and leave a typed dispatcher.
- Keep reducer/effect/callback ownership in `HostConsole`.
- Run React Doctor and full product regressions, then document exact evidence.

## Best-Practice Checklist

- Presentational components receive the minimum typed data/callbacks.
- No duplicated Socket listeners or side effects.
- No changed text, CSS classes, aria labels, event payloads, or condition semantics.
- No new derived state or synchronization effect.
- Preserve live circuit debrief/export and bonus panel behavior.

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
- React Doctor changed scope: 0 issues; score 91/100 from the current scanner with empty diagnostics.
- `npm run test:browser`: PASS, 4/4.
- `npm run test:e2e`: PASS, REST 86/86, Socket 10/10, security/data 22/22, restore and circuit restart/export parsing PASS.
- `git diff --check`: PASS.

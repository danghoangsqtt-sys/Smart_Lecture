# T-6801 — Presentation Canvas Lifecycle

## Objective

Make PDF/PPTX annotation lifecycle source-safe and async-safe without changing the teacher's presentation tools.

## Paths

- `web/src/features/presentation/PresentationCanvas.tsx`
- `tests/browser/login.spec.ts`
- `.DHSYSTEM/ARCHITECTURE.md`
- `.DHSYSTEM/phases/P68-presentation-canvas-lifecycle-hardening/*`
- `.DHSYSTEM/TRACKER.md`
- `.DHSYSTEM/ROADMAP.md`
- `.DHSYSTEM/HANDOFF.json`
- `CHANGELOG.md`

## File-Level Plan

- Add keyed public wrapper and source-scoped internal document surface.
- Replace ready-state hydration effects with lazy annotation/settings initializers and direct persistence effects.
- Guard document/page async work against disposal.
- Move pointer normalization to module scope and combine page-stroke selection/rendering.
- Verify annotation Browser workflow and full regressions.

## Verification Contract

- `npm run typecheck`.
- React Doctor changed scope with zero diagnostics and full-scan target removal.
- `npm run test:browser` and `npm run test:e2e`.
- `git diff --check` and post-push persistence checks.

## Status

- `completed`

## Verification

- `npm run typecheck`: PASS.
- `npm run build`: PASS as part of Browser E2E.
- React Doctor changed scope: 100/100, 0 issues; full scan removes all five target findings.
- `npm run test:browser`: PASS, 4/4 with annotation/shortcut/storage coverage.
- `npm run test:e2e`: PASS, REST 86/86, Socket 10/10, security/data 22/22, restore and circuit restart/export parsing PASS.
- `git diff --check`: PASS.

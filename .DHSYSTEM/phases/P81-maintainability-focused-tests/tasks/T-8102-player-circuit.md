# T-8102 â€” Game Player and Circuit Canvas Decomposition

## Objective

Split `GamePlayPage.tsx` and `CircuitCanvas.tsx` into testable typed feature modules without changing simulation or scoring behavior.

## Paths

- `web/src/pages/GamePlayPage.tsx`
- `web/src/components/CircuitCanvas.tsx`
- `web/src/components/circuitLogicAdapter.ts`
- `web/src/features/game-play/*`
- `web/src/features/circuit/*`
- `tests/browser/login.spec.ts`

## File-Level Plan

1. Separate socket lifecycle, game-mode views, circuit editor state, rendering and simulation adapter boundaries.
2. Preserve one owner for every timer/listener and keep the server authoritative for scoring.
3. Add pure tests for topology editing/simulation transitions and focused UI tests for player lifecycle.

## Verification Contract

- React Doctor, all game modes, circuit restart/recovery and Browser E2E pass.

## Status

- `todo`

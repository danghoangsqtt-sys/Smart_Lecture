# T-8101 â€” GamesPage Decomposition

## Objective

Reduce `GamesPage.tsx` from a 2,275-line mixed-domain module while preserving creation, hosting and saved-game contracts.

## Paths

- `web/src/pages/GamesPage.tsx`
- `web/src/features/games/*`
- `web/src/types.ts`
- `tests/browser/login.spec.ts`

## File-Level Plan

1. Inventory remaining components/hooks/helpers and assign stable feature ownership.
2. Extract catalog, prepared-game, creation, host and reporting boundaries with typed props/services.
3. Keep route-level orchestration, Socket listener ownership, selectors, text and payloads unchanged.
4. Add focused pure/controller tests before moving each boundary.

## Verification Contract

- React Doctor, game browser flows, REST/Socket regressions and diff checks pass.

## Status

- `todo`

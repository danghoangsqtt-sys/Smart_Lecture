# T-8103 â€” Teaching Mode and Classes Route Decomposition

## Objective

Reduce the largest teaching UI and classes router into domain-focused modules with explicit access and transaction contracts.

## Paths

- `web/src/pages/TeachingModePage.tsx`
- `web/src/features/teaching-mode/*`
- `server/src/routes/classes.routes.ts`
- `server/src/services/classes/*`
- `scripts/e2e-regressions.mjs`
- `tests/browser/login.spec.ts`

## File-Level Plan

1. Extract teaching workspace persistence, docks, session orchestration and view sections without adding a second state owner.
2. Split class CRUD, subjects, enrollment/import, groups and teaching-readiness handlers into router/service boundaries.
3. Preserve route paths, authorization helpers, response shapes and database transactions.
4. Add focused access/import/workspace tests for each extracted contract.

## Verification Contract

- Typecheck, lint, React Doctor, focused tests, REST and Browser E2E pass.

## Status

- `todo`

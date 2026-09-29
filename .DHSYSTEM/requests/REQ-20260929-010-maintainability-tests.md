# REQ-20260929-010 â€” Reduce oversized modules and add focused tests

- Type: ENH
- Priority: medium
- Status: planned
- Planned phase: P81 / T-8101, T-8102, T-8103
- Audit tier: 3
- Detected: 2026-09-29

## Gap

Typecheck, lint, and production builds pass, but several modules remain large and the primary regression suite is a long process-level script. This increases the blast radius of changes and makes failures such as the mDNS harness crash block unrelated verification.

## Evidence

- `web/src/pages/GamesPage.tsx`: 2,275 lines.
- `web/src/components/CircuitCanvas.tsx`: 1,241 lines.
- `web/src/pages/GamePlayPage.tsx`: 1,205 lines.
- `server/src/routes/classes.routes.ts`: 1,150 lines.
- `web/src/pages/TeachingModePage.tsx`: 868 lines.

## Acceptance criteria

- Split by stable domain boundaries without changing API/event contracts.
- Add fast focused tests for authentication, password recovery/revocation, import credentials, launcher path resolution, and mDNS cleanup.
- Keep the isolated end-to-end suite as a final integration gate rather than the only executable proof.

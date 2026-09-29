# Phase 79 â€” Maintainability & Focused Tests

## Goal

Bring the largest route/components back toward the project 300-line rule while preserving every API, Socket.IO, persistence, scoring and accessibility contract.

## Boundaries

- Container modules retain orchestration/state ownership; extracted modules are typed domain services, hooks or presentational views.
- No visual redesign, game rule change, endpoint rename or payload change.
- Each extraction lands with focused tests so the full process-level E2E suite is not the only proof.

## Quality gate

- Typecheck, lint, React Doctor, focused tests, Browser E2E and isolated backend E2E pass after each task.

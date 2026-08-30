# T-4201 — Evaluate WASM Logic Engine

## Decision Record

- Rejected `@logigator/sim`: active, but AGPL-3.0-only.
- Rejected legacy `@logigator/logigator-simulation`: MIT, but stale and dependent on a manual Emscripten/global-WASM integration path.
- Rejected importing the active Logigator editor: AGPL-3.0 and architecturally coupled to Angular, PixiJS and its own worker pipeline.

## Follow-up

Implement additional digital components in SmartLecture's native adapter, beginning with sequential logic, rather than bringing in a third-party engine.

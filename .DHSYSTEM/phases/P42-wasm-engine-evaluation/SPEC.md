# P42 Specification — WASM Logic Engine Evaluation

## Goal

Determine whether a third-party Logigator WebAssembly engine can safely replace the native logic adapter.

## Evidence

- The legacy [`@logigator/logigator-simulation`](https://www.npmjs.com/package/@logigator/logigator-simulation) package is MIT, but its latest `1.2.0` package was published three years ago. Its browser route requires a locally compiled Emscripten artifact, global `Module` initialization and manual heap allocation.
- The current [`@logigator/sim`](https://www.npmjs.com/package/@logigator/sim) package is actively published but declares `AGPL-3.0-only` on the npm registry.
- The active [Logigator repository](https://github.com/logigator/logigator) is also AGPL-3.0 and documents its own coupled Angular/PixiJS editor and worker integration.

## Decision

**Reject both packages for SmartLecture.** Do not import AGPL code into this local-first product, and do not adopt the unmaintained MIT package with a hand-built WASM pipeline.

## Resulting Roadmap

- Retain `native-boolean-v1` and the adapter boundary from P41.
- Extend native digital logic incrementally with explicit truth-table tests.
- Treat analog MNA/SPICE as a separate, future scope with independently vetted licensing.

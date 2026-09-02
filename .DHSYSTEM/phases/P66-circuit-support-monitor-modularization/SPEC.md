# P66 SPEC — Circuit Support Monitor Modularization

## Problem

P65 made the host console compositional, but the circuit learner monitor still combines queue derivation, filters, progress rows, topology inspection, diagnostics, and private assistance in one React component. The current full scan identifies this focused surface as the remaining host-side high-complexity function.

## Scope

- Split the circuit support monitor into focused queue, learner-list, inspection, diagnostics, and private-assistance views.
- Keep filter/hint state and all teacher actions in the monitor boundary.
- Preserve the deterministic priority order and all P56–P61 privacy/recovery contracts.
- Remove the monitor complexity diagnostic without suppression.

## Design Contract

- Queue metrics continue to derive from `circuitSupportMeta` and current progress/assistance only.
- “Next learner” keeps the same priority, activity-time, and name tie-breakers.
- Topology remains read-only and only the selected learner is inspected.
- Hint/retry payloads, trimming, disable rules, status copy, filters, accessibility labels, and CSS remain unchanged.
- No Socket event, API, schema, persistence, score, or timer change.

## Acceptance Criteria

1. Queue controls, filters, progress rows, diagnostics, topology preview, and private assistance render through focused typed views.
2. Existing support ordering and selection behavior remain identical.
3. React Doctor changed scope reports no diagnostics for the refactor.
4. Typecheck, Browser E2E, backend regressions, restart recovery, and diff checks pass.

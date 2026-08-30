# P43 Specification — Native Digital Adders

## Goal

Expand the circuit-game library with correctly simulated addition components while preserving the local-first native engine decision.

## Implementation

- Add SVG palette entries for Half Adder (`A`, `B` → `S`, `C`) and Full Adder (`A`, `B`, `Cin` → `S`, `Cout`).
- Extend the adapter evaluator from a single result to an ordered output list.
- Maintain existing single-output gates and component serialization unchanged.

## Acceptance Criteria

- Half Adder truth table: 4 of 4 combinations pass.
- Full Adder truth table: 8 of 8 combinations pass.
- Strict typecheck, Browser E2E and React Doctor changed scope are green.

## Boundary

This remains combinational digital logic. Sequential state is intentionally deferred until simulation ticks can be modeled outside React rendering.

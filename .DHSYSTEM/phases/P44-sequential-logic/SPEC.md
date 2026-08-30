# P44 Specification — Sequential Logic

## Goal

Introduce a correct, stateful D Flip-Flop into the native circuit game without mutating simulation state during React rendering.

## Implementation

- Add a D Flip-Flop SVG symbol with `D`, `CLK`, `Q` and `Q̅` terminals.
- Extend the adapter contract with serializable simulation state and a pure `step` operation.
- Store simulation state in a ref and advance it only from an effect/tick; rendering calls the pure `simulate` view.
- Capture `D` only on the rising edge of `CLK`; retain `Q` between edges.

## Acceptance Criteria

- Initial state, capture edge, hold while CLK high, falling-edge hold and a second capture edge are verified.
- Typecheck, Browser E2E and React Doctor changed-scope scan pass.

## Boundary

This phase implements a D Flip-Flop only. Timing delays, metastability and analog behavior are outside the educational boolean model.

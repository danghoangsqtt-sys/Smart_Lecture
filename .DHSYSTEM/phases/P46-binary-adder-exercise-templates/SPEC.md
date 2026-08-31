# P46 Specification — Binary Adder Exercise Templates

## Goal

Provide ready-to-run binary addition activities that use the native Half Adder and Full Adder components in the classroom game.

## Implementation

- Add a Half Adder default challenge: two input switches, `S`/`C` LEDs, two Probes and GND returns.
- Add a Full Adder default challenge: three input switches (`A`, `B`, `Cin`), `S`/`Cout` LEDs, two Probes and GND returns.
- Start each challenge with positioned components and no wires; retain a full reference topology for automatic grading.
- Expand the teacher hint from four to six default challenges.

## Learning Outcomes

- Half Adder: observe `S = A XOR B` and `C = A AND B`.
- Full Adder: observe parity on `S` and carry when at least two of `A`, `B`, `Cin` are HIGH.

## Quality Gate

- Typecheck and production build pass.
- Browser E2E regression passes.
- React Doctor changed-scope scan has no issues.

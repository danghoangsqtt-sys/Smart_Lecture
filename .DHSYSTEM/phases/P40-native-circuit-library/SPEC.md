# P40 Specification — Native Circuit Component Library

## Goal

Expand the built-in circuit-game component library without importing image packs or a third-party circuit editor.

## Scope

- Add native SVG symbols and terminal definitions for a diode, SPST relay and N-channel MOSFET.
- Add a 2:1 multiplexer with `I0`, `I1`, `S` and `Y` pins.
- Include the MUX in the existing boolean fixed-point simulator.
- Keep existing JSON `CircuitData`, drag/drop, rotation, wiring and palette behavior unchanged.

## Deliberate Boundaries

- Diode, relay and MOSFET are visual/drawing components in this phase; they do not imply an analog/SPICE model.
- No external image asset, Hugging Face model, or third-party code dependency is introduced.
- Analog MNA/SPICE solving and an optional external logic-engine adapter require their own evaluated milestone.

## Quality Gate

- Strict TypeScript and production builds pass.
- Existing Browser E2E presentation/teaching regression suite remains green.
- React Doctor changed-scope scan has no errors.

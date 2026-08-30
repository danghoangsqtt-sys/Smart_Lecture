# P41 Specification — Circuit Simulation Adapter

## Goal

Create a stable adapter boundary between the interactive circuit canvas and its boolean solver so a later evaluated engine can be introduced without changing lesson data or the game UI.

## Implementation

- Move the native boolean solver to `circuitLogicAdapter.ts`.
- Define normalized component, wire, pin and result contracts.
- Preserve the `CircuitData` format, SVG palette, wire interactions and current fixed-point logic behavior.
- Select the native adapter explicitly from `CircuitCanvas`.

## Acceptance Criteria

- The MUX 2:1 truth table passes all eight input/select combinations.
- Existing teacher presentation Browser E2E remains green.
- Typecheck, production build and React Doctor changed-scope scan pass.

## Non-goals

- No external engine is bundled in this phase.
- No analog/SPICE behavior is claimed for physical components.
- Selecting a third-party engine remains contingent on isolated license, compatibility and bundle-size validation.

# T-4401 — Add D Flip-Flop

## Delivered

- Added a D Flip-Flop component and SVG visual (`D`, `CLK`, `Q`, `Q̅`).
- Added `SimulationState` and pure adapter `step` results.
- Wired the canvas to advance state in an effect/tick and render from a pure simulation snapshot.

## Verification

- Rising-edge state scenario: initial state → capture → hold-high → falling-edge hold → second capture
- `npm run typecheck`
- `npm run test:browser` — 2 passed
- `npx -y react-doctor@latest . --verbose --scope changed` — 100/100, no issues

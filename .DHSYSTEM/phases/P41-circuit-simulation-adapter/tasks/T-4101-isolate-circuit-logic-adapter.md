# T-4101 — Isolate Circuit Logic Adapter

## Delivered

- Created an explicit `LogicSimulationAdapter` contract for normalized components, wires, pins and simulation results.
- Moved the existing local boolean fixed-point solver into `createNativeLogicAdapter`.
- Kept `CircuitCanvas` serialization, symbol definitions and presentation unchanged; it selects `native-boolean-v1` through the new boundary.

## Verification

- `npm run typecheck`
- MUX 2:1 truth table, all 8 `I0` / `I1` / `S` combinations
- `npm run test:browser` — 2 passed
- `npx -y react-doctor@latest . --verbose --scope changed` — 100/100, no issues

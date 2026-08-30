# T-4001 — Expand Native Circuit Component Library

## Delivered

- Added diode (`A`/`K`), relay (`A1`/`A2`/`COM`/`NO`) and N-channel MOSFET (`G`/`D`/`S`) SVG symbols.
- Added a 2:1 MUX (`I0`/`I1`/`S` → `Y`) and its boolean evaluation rule.
- Reused the existing palette and component serialization format; no external assets or packages were added.

## Verification

- `npm run typecheck`
- `npm run test:browser` — 2 passed
- `npx -y react-doctor@latest . --verbose --scope changed` — 100/100, no issues

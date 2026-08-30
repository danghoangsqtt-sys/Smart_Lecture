# T-4501 — Add D Flip-Flop Exercise Template

## Delivered

- Added the default D Flip-Flop challenge to the real-time game room.
- Starter circuit includes positioned DATA, CLOCK, DFF, LED, Probe and GND components.
- Reference circuit validates the five required connections, including the Probe branch from `Q`.

## Verification

- `npm run typecheck`
- `npm run test:browser` — 2 passed
- `npx -y react-doctor@latest . --verbose --scope changed` — 100/100, no issues

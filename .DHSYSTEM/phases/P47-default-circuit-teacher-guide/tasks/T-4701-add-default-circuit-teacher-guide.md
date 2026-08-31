# T-4701 — Add Default Circuit Teacher Guide

## Delivered

- Added an expandable guide inside the simulation challenge setup.
- Described all six default challenges and the expected LED/Probe observations.
- Added a clear OUT → IN wiring and Oscilloscope reminder.

## Verification

- `npm run typecheck`
- `npm run test:browser` — 2 passed
- `npx -y react-doctor@latest . --verbose --scope changed` — 100/100, no issues

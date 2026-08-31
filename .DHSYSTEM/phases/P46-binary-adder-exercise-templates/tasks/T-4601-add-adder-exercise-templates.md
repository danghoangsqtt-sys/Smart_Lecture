# T-4601 — Add Binary Adder Exercise Templates

## Delivered

- Added default `digital_5` Half Adder and `digital_6` Full Adder challenges.
- Each challenge branches its two outputs to both LEDs and Probes for classroom observation.
- Each has a starter layout and topology reference circuit for automatic grading.

## Verification

- `npm run typecheck`
- `npm run test:browser` — 2 passed
- `npx -y react-doctor@latest . --verbose --scope changed` — 100/100, no issues

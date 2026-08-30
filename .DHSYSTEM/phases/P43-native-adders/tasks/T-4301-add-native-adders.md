# T-4301 — Add Native Digital Adders

## Delivered

- Added Half Adder and Full Adder symbols with labeled inputs and outputs.
- Added ordered multiple-output evaluation in `native-boolean-v1`.
- Verified all Half Adder and Full Adder truth-table combinations.

## Verification

- `npm run typecheck`
- Half Adder: 4/4 truth-table combinations
- Full Adder: 8/8 truth-table combinations
- `npm run test:browser` — 2 passed
- `npx -y react-doctor@latest . --verbose --scope changed` — 100/100, no issues

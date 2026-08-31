# T-4901 — Cover Default Circuit Room Sequence

## Objective

Prove, through the production browser workflow, that the default circuit-simulation room accepts an enrolled student and presents the sequential and adder challenges in their configured order.

## Paths

- `tests/browser/login.spec.ts` — create and enroll an isolated student, start a real default circuit room, and assert the D Flip-Flop, Half Adder, and Full Adder challenge sequence.

## File-Level Plan

- Keep the existing serial isolated-browser setup and use its authenticated request fixture for test data.
- Enroll the created student in `Browser Class` before joining: this preserves the server's class-membership authorization gate while testing the genuine socket flow.
- Use the teacher UI to create and start the room, then assert visible challenge titles at the exact sequential checkpoints.

## Best-Practice Checklist

- Do not weaken enrollment authorization for a test.
- Use unique isolated fixture data and close the second browser page.
- Run the complete production-build browser suite after the change.

## Verification

- `npm run test:browser` — 4 passed (production build included), including the live default-room sequence.

## Status

- `completed`

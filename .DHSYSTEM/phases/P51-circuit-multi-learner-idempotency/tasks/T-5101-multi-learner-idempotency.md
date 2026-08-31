# T-5101 — Verify Multi-Learner Grading and Idempotent Awards

## Objective

Add full browser regression evidence that circuit simulation grading is isolated per learner and idempotent per challenge.

## Implementation

- Create and enroll a second learner in the isolated Browser E2E database.
- Join both learner pages to the teacher's default circuit room.
- Build and verify the exact `VCC → Switch → LED → GND` topology on each page.
- Submit learner A twice and learner B once.
- Require exactly one teacher feed entry for each learner.
- Read the real class gradebook before and after timer evaluation and require KTTX `0.5` for each learner.
- Allow the timer to advance and retain DFF/Half Adder/Full Adder sequence checks.

## Status

- `completed`

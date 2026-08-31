# P48 Specification — Circuit Game Browser Coverage

## Goal

Protect the teacher-facing default circuit-game setup from UI regressions.

## Implementation

- Add a browser test that logs in as the seeded teacher and opens `/games`.
- Switch to Circuit Simulation and close the generic game guide.
- Verify the six-default-challenge message and expandable teacher guide.
- Expand the guide and assert the D Flip-Flop and Full Adder teaching instructions are visible.

## Quality Gate

- Browser suite runs all three tests successfully.
- Production build remains part of the browser test command.

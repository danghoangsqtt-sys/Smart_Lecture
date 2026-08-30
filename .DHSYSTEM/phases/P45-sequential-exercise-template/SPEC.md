# P45 Specification — Sequential Logic Exercise Template

## Goal

Give teachers a ready-to-run sequential-logic activity without manually designing a circuit challenge.

## Implementation

- Add a fourth default `circuit_simulate` challenge: D Flip-Flop with DATA switch, CLOCK source, LED, GND and Probe.
- Provide a starter layout with no wires so students complete the topology.
- Provide a fully wired reference circuit for automatic topology grading.
- Update the teacher-facing default challenge description from three to four activities.

## Learning Outcome

Students observe that `Q` captures DATA only on the CLK rising edge and can view the output on both LED and the existing Oscilloscope through Probe.

## Quality Gate

- Typecheck and production build pass.
- Browser E2E regression passes.
- React Doctor changed-scope scan has no issues.

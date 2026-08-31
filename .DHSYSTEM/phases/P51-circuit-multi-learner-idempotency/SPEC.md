# P51 — Circuit Multi-Learner Idempotency Specification

## Goal

Prove that a live default circuit-simulation room handles multiple enrolled learners independently and that repeated valid submissions cannot duplicate completion events or KTTX awards.

## Acceptance Criteria

- Two enrolled learners can join the same room before the host starts it.
- Both learners can assemble and submit the first default LED topology through the real SVG editor.
- Each learner produces exactly one host completion-feed item.
- Repeating a valid submission for the same learner and challenge does not produce another completion item.
- Each learner receives exactly the configured `+0.5` KTTX award before and after the challenge timer evaluates the room.
- The timed room continues to D Flip-Flop, Half Adder, and Full Adder.

## Out of Scope

- Late join after the room has started.
- Reconnection and restoration after a socket disconnect.
- Cross-process persistence of an active in-memory room.

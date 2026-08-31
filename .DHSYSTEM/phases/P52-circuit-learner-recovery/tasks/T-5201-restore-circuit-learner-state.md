# T-5201 — Restore Late/Reconnecting Circuit Learner State

## Objective

Synchronize the active circuit challenge and learner-specific progress whenever an enrolled learner joins or reconnects during a running simulation.

## Implementation

- Add `circuitChallengeId` to learner simulation state.
- Reset stale topology only when the global room advances to a different challenge.
- Ensure a late learner receives a circuit player record for the active challenge.
- Emit the current challenge followed by learner-specific saved circuit/completion state.
- Convert restored socket-safe circuit data back to `CircuitData` for the SVG canvas.
- Display a persistent completion banner after reconnect.
- Exercise three learners in Browser E2E: two pre-join, one late-join; reconnect the late learner and require exact 4-component/3-wire topology plus unchanged KTTX.

## Status

- `completed`

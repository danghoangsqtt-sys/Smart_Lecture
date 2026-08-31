# P52 — Circuit Learner Recovery Specification

## Goal

Allow an enrolled learner to join an already-running circuit simulation or reconnect during the current challenge without losing the challenge, saved topology, completion state, or grading idempotency.

## Acceptance Criteria

- An enrolled learner joining after host start receives the current challenge immediately.
- The late learner gets an active circuit-simulation player record and can submit normally.
- A reconnecting learner receives only topology saved for the current challenge.
- Saved split-port socket data is converted back into canvas `component::port` endpoints.
- Completion status is restored and visible without issuing another award.
- Moving to a new challenge clears stale server-side topology from the prior challenge.
- Multi-learner KTTX remains exactly one configured award per learner.

## Out of Scope

- Recovery after a server process restart.
- Host-console recovery, addressed separately.

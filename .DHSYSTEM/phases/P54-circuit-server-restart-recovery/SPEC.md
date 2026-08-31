# P54 — Circuit Server-Restart Recovery Specification

## Goal

Persist the authoritative runtime state of an active circuit-simulation room so a Node.js process restart does not reset the challenge, timer, learner topology, completion history, circuit score, or KTTX idempotency.

## Acceptance Criteria

- SQLite stores one runtime row per circuit game and one state row per learner, both cascade-linked to `game_sessions`.
- Runtime persistence records the active challenge index and an absolute challenge deadline.
- Learner persistence records topology, associated challenge, simulation state, measurements, completed challenge IDs, and circuit score.
- Active circuit rooms are restored and their timers rescheduled during server startup without waiting for the teacher.
- A learner reconnecting before the host can lazy-load a still-active room by room code.
- Host recovery after restart returns the same challenge deadline, reconstructed completion feed, players, and circuit leaderboard.
- Learner recovery after restart returns the exact saved topology and completed status.
- A correct challenge completed before restart does not produce a second KTTX award after restart or timer evaluation.
- The original absolute deadline is retained and advances to the next challenge instead of restarting the full timer.

## Data Model

- `game_circuit_runtime`: `game_session_id`, `challenge_index`, `challenge_ends_at`, `updated_at`.
- `game_circuit_player_states`: composite session/student key, display name, score, circuit JSON, challenge ID, simulation state, measurements JSON, completed challenge IDs JSON, update timestamp.

## Out of Scope

- Persistence/restart recovery for non-circuit game engines.
- Resuming finished rooms.
- Cross-machine clustering or distributed Socket.IO state.

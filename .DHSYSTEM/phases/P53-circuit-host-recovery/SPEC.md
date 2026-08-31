# P53 — Circuit Host Recovery Specification

## Goal

Restore the teacher's active circuit-simulation console after a page reload or Socket.IO reconnect without interrupting learners or losing the current challenge, completion feed, player list, or leaderboard.

## Acceptance Criteria

- The standalone Games page discovers the teacher's newest active session and reopens its host console after reload.
- `host:sync` listeners are registered before the host attach request is emitted.
- A running circuit room synchronizes its active challenge and reconstructed completion feed to the reconnecting host.
- Circuit leaderboard scores come from circuit-simulation player state and remain visible in the active host console.
- Reloading the host page does not disconnect, reset, or duplicate grading for any learner.
- Browser E2E uses isolated browser contexts so teacher and learner authentication cannot overwrite one another.
- Three learners remain connected while the host reloads; challenge, feed, player count, leaderboard, topology recovery, and KTTX idempotency are verified.

## Out of Scope

- Restoring an in-memory circuit room after the Node.js server process restarts.
- Persisting circuit topology or completion history into SQLite.
- General recovery snapshots for every other game type.

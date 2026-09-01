# P55 — Circuit Teacher Controls Specification

## Goal

Give the authorized teacher server-authoritative pause, resume, skip, and restart controls for an active circuit challenge while preserving classroom continuity across browser reload and Node.js restart.

## Control Semantics

- **Pause:** stop only the authoritative challenge clock, retain the exact remaining milliseconds, and keep learner editing/submission available.
- **Resume:** create a new absolute deadline from the stored remaining duration without resetting learner topology.
- **Skip:** do not grade the current challenge; advance immediately to the next challenge, or finish when the skipped challenge is last.
- **Restart:** reset every learner's current-challenge topology, measurements, and simulation state and grant a fresh full challenge duration. Previously completed challenge IDs, circuit score, and KTTX remain immutable and idempotent.

## Acceptance Criteria

- Only the session host can invoke circuit controls; every control payload is validated with Zod.
- Runtime persistence records paused/running state and remaining milliseconds in addition to challenge index/deadline.
- Reloaded host snapshots expose the current control state without replaying or resetting learner topology.
- A paused room stays paused across a real Node.js restart and does not advance while offline or while waiting for resume.
- Resume uses the persisted remaining duration and schedules one timer only.
- Skip and restart clear stale current-challenge learner workspace as defined above and broadcast an authoritative challenge update.
- The host console provides accessible Vietnamese controls and visible paused status.
- Existing completion feed, circuit leaderboard, and one-time KTTX behavior remain unchanged.

## Data Model

Migration v20 extends `game_circuit_runtime` with:

- `is_paused INTEGER NOT NULL DEFAULT 0 CHECK (is_paused IN (0, 1))`
- `remaining_ms INTEGER NOT NULL DEFAULT 0 CHECK (remaining_ms >= 0)`

`challenge_ends_at` remains the absolute deadline while running. While paused, `remaining_ms` is authoritative and `challenge_ends_at` is retained for diagnostics only.

## Realtime Contract

- Client → server: `circuit_simulate:host-control` with `{ action: 'pause' | 'resume' | 'skip' | 'restart' }`.
- Server → room: `circuit_simulate:control_state` with challenge index, paused state, remaining milliseconds, and effective absolute deadline.
- Existing `circuit_simulate:challenge` remains the topology-reset boundary for start, skip, restart, and automatic transition; pause/resume must not emit it.

## Out of Scope

- Freezing learner pointer/edit input while paused.
- Reversing already awarded circuit points or KTTX.
- Teacher navigation to an arbitrary challenge index.
- Applying the control model to non-circuit games.

# P57 — Circuit Private Assistance Specification

## Goal

Help the teacher identify a learner whose in-progress circuit has gone inactive and send that learner a private hint or retry request without pausing the challenge, resetting topology, or exposing the message to peers.

## Activity Semantics

- The authoritative `lastActivityAt` changes only on learner circuit edits, measurements, or simulation actions.
- A connected learner with an in-progress circuit is marked **Cần hỗ trợ** after 10 seconds without activity.
- Not-started, completed, and disconnected learners are not classified as stuck.
- The UI refreshes inactivity age locally from the authoritative epoch timestamp; no periodic Socket broadcast is required.

## Assistance Semantics

- **Hint:** a teacher-authored private message, trimmed and limited to 300 characters.
- **Retry request:** a private instruction to inspect and resubmit; it does not clear topology, revoke completion, or alter score/KTTX.
- Delivery targets only authenticated sockets for the selected learner in the current room.
- The host receives an explicit delivered/not-delivered acknowledgement.

## Acceptance Criteria

- Migration v21 stores `last_activity_at` per circuit learner as non-negative epoch milliseconds.
- Activity timestamps survive host reload and Node.js restart without being overwritten by unrelated room persistence.
- The host progress matrix shows last activity age and dynamically highlights a working learner after 10 inactive seconds.
- The teacher can send a custom private hint or retry request only from the selected learner inspection panel.
- Only the selected learner receives the message; peer learners receive nothing.
- Offline delivery is rejected clearly without changing server state.
- Learner UI shows the latest teacher assistance prominently while preserving the current circuit.
- Existing monitoring privacy, controls, grading idempotency, and restart recovery remain intact.

## Data Model

Migration v21 extends `game_circuit_player_states` with:

- `last_activity_at INTEGER NOT NULL DEFAULT 0 CHECK (last_activity_at >= 0)`

Existing rows are backfilled from `updated_at`; new runtime state writes the explicit activity epoch independently from the row update timestamp.

## Realtime Contract

- Client → server: `circuit_simulate:teacher-message` with `{ userId, kind: 'hint' | 'retry', message? }`.
- Server → selected learner only: `circuit_simulate:teacher-message` with kind, message, teacher display name, and `sentAt`.
- Server → requesting host only: `circuit_simulate:teacher-message-sent` with learner identity, kind, and delivery result.
- Existing progress/inspection payloads add `lastActivityAt`.

## Out of Scope

- Persisted conversation history or message read receipts.
- Automatic AI-generated hints.
- Teacher-side topology editing/reset from an assistance message.
- Assistance for non-circuit games.

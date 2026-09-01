# P58 — Circuit Assistance Recovery Specification

## Goal

Make the latest private teacher assistance resilient to learner disconnects and process restarts, with an explicit learner acknowledgement visible to the teacher.

## Durable Checkpoint Semantics

- Store one latest assistance checkpoint per game session and learner; a newer message supersedes the older checkpoint.
- Persist the message before attempting realtime delivery.
- Offline assistance is `queued`, becomes `delivered` when emitted to an authenticated learner socket, and becomes `acknowledged` only after the learner presses **Đã hiểu**.
- An unacknowledged checkpoint is redelivered after learner reconnect or server restart.
- Host reload restores the latest status for each learner.

## Security and Isolation

- Teacher send remains restricted to the authorized room host.
- Acknowledgement is restricted to the authenticated target learner in the same active session.
- Message delivery and status updates remain outside the shared learner room.
- Delivery and acknowledgement never mutate topology, challenge timing, completion, circuit score, or KTTX.

## Acceptance Criteria

- Migration v22 creates the durable latest-assistance checkpoint table and indexes session/learner lookup.
- Online delivery records a delivery epoch; offline send returns a queued acknowledgement instead of losing the message.
- Learner reconnect receives the exact latest unacknowledged message once per connection.
- Learner can explicitly acknowledge the message idempotently; another learner cannot acknowledge it.
- Host live status and `host:sync` distinguish queued, delivered, and acknowledged.
- Browser E2E covers offline queue → reconnect delivery → explicit acknowledgement with peer privacy.
- Real restart integration covers queue persistence and learner-first acknowledgement before host reattach.

## Out of Scope

- Full message history, search, retention controls, and read analytics.
- AI-generated assistance.
- Assistance for non-circuit games.


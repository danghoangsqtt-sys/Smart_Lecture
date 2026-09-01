# P58 — Circuit Assistance Recovery Summary

## Delivered

- Added migration v22 and a normalized latest-assistance checkpoint keyed by game session and learner.
- Persisted every host-authorized hint/retry before realtime delivery and replaced only the learner's previous latest checkpoint.
- Added durable queued, delivered, and acknowledged states with explicit epochs and host recovery through `host:sync`.
- Redelivered an unacknowledged checkpoint once per new learner connection after disconnect or process restart.
- Added an explicit learner “Đã hiểu” action and private host status updates without exposing content/status to peers.
- Allowed teachers to queue support while a learner is offline and made that outcome clear in the selected inspection panel.
- Preserved circuit topology, timer, completion, score, and KTTX across queue, delivery, acknowledgement, and restart.

## Verification

- `npm run typecheck` and production build passed.
- `npx -y react-doctor@latest web --verbose --scope changed` — 100/100, no issues.
- `npm run test:e2e` — REST 86/86, Socket.IO 10/10, security/data regression 22/22, Excel, staged restore, and circuit restart queue/ack all passed.
- `npm run test:browser` — production build and Browser E2E 4/4 passed; offline queue/reconnect/ack and peer privacy were verified in the three-learner circuit flow.
- `node --check scripts/circuit-restart-test.mjs` and `git diff --check` passed.

## Follow-up Boundary

P58 retains only the latest checkpoint per learner. Full conversation history, configurable retention, AI-generated hints, and assistance for non-circuit games remain separate product decisions.

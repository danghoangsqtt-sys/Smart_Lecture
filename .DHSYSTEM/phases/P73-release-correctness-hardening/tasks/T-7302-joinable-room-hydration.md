# T-7302 — Joinable-room hydration

## Status

- `in_progress`

## Objective

Hydrate lobby từ SQLite khi learner join trước host, đồng thời giữ giới hạn durable recovery hiện có.

## Paths

- server/src/realtime/roomStore.ts
- server/src/realtime/gameRoom.ts
- scripts/game-join-race-test.mjs
- scripts/game-lifecycle-test.mjs

## File-Level Plan

1. Thay loader circuit-only bằng loader `loadJoinableRoomByCodeFromDb` có policy trạng thái rõ ràng.
2. Cho phép mọi game `lobby`; chỉ cho phép `circuit_simulate` ở `running`.
3. Tái sử dụng `loadRoomFromDb` và Map idempotency để host/learner cùng hydrate một room.
4. Chạy regression nhiều vòng và full realtime suite.

## Acceptance Criteria

- [ ] Learner-first join thành công cho 11 game lobby.
- [ ] Host attach sau learner dùng cùng runtime room.
- [ ] Finished/cancelled và non-durable running room không được hydrate.
- [ ] Lifecycle test đạt 11/11 ổn định.

## Verification

- `npm.cmd run test:game-join-race`
- `npm.cmd run test:e2e`

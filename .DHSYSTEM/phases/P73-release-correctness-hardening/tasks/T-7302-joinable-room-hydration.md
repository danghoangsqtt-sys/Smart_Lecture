# T-7302 — Joinable-room hydration

## Status

- `completed`

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

- [x] Learner-first join thành công cho 11 game lobby.
- [x] Host attach sau learner dùng cùng runtime room.
- [x] Query chỉ hydrate lobby hoặc running circuit_simulate; finished/cancelled và non-durable running bị loại.
- [x] Lifecycle test đạt 11/11.

## Verification

- `npm.cmd run typecheck`: pass.
- `npm.cmd run test:e2e`: REST 86/86, Socket 10/10, lifecycle 11/11, regression 24/24, restore/circuit restart pass.

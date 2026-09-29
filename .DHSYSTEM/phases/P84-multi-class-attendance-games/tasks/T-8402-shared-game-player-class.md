# T-8402 — Một phòng game, ánh xạ lớp người chơi bền vững

## Objective

Một game room nhận học viên của tất cả lớp trong buổi, nhưng mỗi tài khoản được gán một lớp xác thực trước khi chơi.

## Paths

- `server/src/routes/games.routes.ts`
- `server/src/realtime/roomAccess.ts`
- `server/src/realtime/roomStore.ts`
- `server/src/realtime/gameRoom.ts`
- `server/src/db/connection.ts`
- `scripts/game-lifecycle-test.mjs`

## Plan

1. Liên kết game với phiên dạy nhóm; `game_sessions.class_id` tiếp tục là nguồn cho game một lớp cũ.
2. Tại join, server kiểm tra enrollment thuộc nhóm và lưu `(game_session_id, student_id, class_id)` bất biến. Nếu thuộc nhiều lớp trong nhóm, yêu cầu chọn một lớp; lớp không thuộc enrollment bị từ chối.
3. Khôi phục ánh xạ sau reconnect, host reload và Node restart; late join dùng cùng policy.

## Acceptance

- Chỉ một room code; học viên của 2–4 lớp đều vào được và học viên ngoài nhóm bị chặn.
- Một tài khoản không tạo nhiều player/result khi thử join bằng lớp khác.
- Game một lớp, circuit recovery và host control hiện có vẫn chạy.

## Status

- `todo`

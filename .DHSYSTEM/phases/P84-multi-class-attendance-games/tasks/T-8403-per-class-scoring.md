# T-8403 — Kết quả và KTTX theo lớp

## Objective

Giữ một kết quả game mỗi học viên và ghi mọi loại điểm vào `grades` của lớp đã xác minh.

## Paths

- `server/src/realtime/roomAccess.ts`
- `server/src/realtime/circuitScoring.ts`
- `server/src/realtime/leaderboard.ts`
- `server/src/routes/games.routes.ts`
- `scripts/game-lifecycle-test.mjs`
- `scripts/e2e-regressions.mjs`

## Plan

1. Mọi nhánh chấm/bonus/circuit lấy lớp từ ánh xạ người chơi, không từ `game_sessions.class_id` của lớp nguồn.
2. Transaction/unique guard bảo đảm mỗi thưởng chỉ áp dụng một lần kể cả retry, reconnect hoặc restart; không thay đổi điểm lớp khác.
3. Bảng xếp hạng tổng room và bộ lọc lớp dùng cùng kết quả, nhưng giáo viên/học viên chỉ xem dữ liệu theo quyền; không lộ topology riêng tư của circuit.

## Acceptance

- KTTX của học viên lớp B không xuất hiện trong lớp A; học viên ghi danh chồng chỉ ghi một lớp đã chọn.
- Bonus top-3, circuit auto-award và mọi mode game hiện có có regression.
- Số điểm/kết quả trong tổng room bằng tổng các lớp, không nhân đôi học viên.

## Status

- `todo`

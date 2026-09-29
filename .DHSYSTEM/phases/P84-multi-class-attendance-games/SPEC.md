# P84 — Điểm danh và game chung, kết quả riêng

## Goal

Một phòng game phục vụ nhiều lớp trong cùng buổi dạy; điểm danh và mọi điểm số/KTTX gắn đúng lớp của từng học viên.

## Scope

- Liên kết từng phiên điểm danh theo lớp với phiên dạy chung, không ghi đè bản ghi cùng ngày.
- Gắn một game với phiên dạy nhóm và lưu bền vững lớp của từng người chơi trước khi nhận câu hỏi/điểm.
- Mọi đường cộng điểm (điểm trực tiếp, bonus, circuit) đọc lớp đã xác minh; không dùng lớp nguồn để chấm cho cả hội trường.
- Bảng xếp hạng chung và bộ lọc theo lớp dùng cùng dữ liệu kết quả có phân quyền.

## Tasks

- `T-8401-per-class-attendance.md`
- `T-8402-shared-game-player-class.md`
- `T-8403-per-class-scoring.md`

## Exit criteria

- 2–4 lớp chơi một room; học viên ngoài nhóm bị từ chối.
- Học viên ghi danh hai lớp chọn đúng một lớp; reconnect/restart không đổi lớp giữa chừng.
- Điểm danh, score và KTTX không ghi nhầm/trùng lớp kể cả retry và process restart.
- Socket, REST, circuit và game một lớp cũ đều đạt hồi quy.

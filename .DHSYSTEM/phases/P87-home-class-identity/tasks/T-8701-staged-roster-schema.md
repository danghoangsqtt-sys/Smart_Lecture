# T-8701 — Staged roster schema và legacy readiness gate

## Objective

Thêm cấu trúc hỗ trợ lớp biên chế hiện tại/lịch sử chuyển lớp và ràng buộc danh tính theo từng bước, không làm DB legacy xung đột mất khả năng khởi động hoặc tự sửa dữ liệu.

## Paths

- `server/src/db/connection.ts`
- `server/src/db/schema.sql`
- `server/src/routes/users.routes.ts`
- `server/src/routes/auth.routes.ts`
- `server/src/routes/classes.routes.ts`
- `scripts/roster-migration-test.mjs`
- `.DHSYSTEM/ARCHITECTURE.md`
- `.DHSYSTEM/TRACKER.md`
- `.DHSYSTEM/HANDOFF.json`
- `CHANGELOG.md`
- `.DHSYSTEM/phases/P87-home-class-identity/PHASE-STATE.md`

## File-Level Plan

- `server/src/db/connection.ts`: thêm migration cộng thêm cho lịch sử lớp biên chế và báo cáo trạng thái ràng buộc; backfill chỉ trường hợp một lớp rõ ràng. Unique index chỉ bật khi khóa có thể cưỡng chế an toàn; legacy thiếu/trùng được nêu để sửa, không tự gộp/xóa. Đảm bảo chạy lại sau remediation có thể hoàn tất index.
- `server/src/db/schema.sql`: chỉ bổ sung DDL phù hợp thứ tự bootstrap/migration; không thay đổi bảng legacy theo cách phá dữ liệu.
- `server/src/routes/users.routes.ts` và `server/src/routes/classes.routes.ts`: áp validation thống nhất cho mọi writer để không tạo xung đột mới trong khi dữ liệu cũ đang được rà soát; không mở quyền vượt `created_by`/quyền lớp.
- `server/src/routes/auth.routes.ts`: đóng đường tạo tài khoản cũ khỏi việc tạo username trùng không phân biệt hoa/thường; chuẩn hóa username học viên mới về chữ thường. Endpoint này sẽ được hợp nhất hẳn ở T-8702.
- Phạm vi T-8701: bảo vệ trùng username/mã SV không phân biệt hoa thường và ghi danh nhiều lớp; bắt buộc mã/lớp lúc tạo mới và gom tất cả writer vào một transaction thuộc T-8702/T-8703, sau khi UI/Excel được đổi đồng bộ. Không biến endpoint hiện tại thành đường vòng tạo xung đột mới.
- `scripts/roster-migration-test.mjs`: fixture DB sạch/xung đột/thiếu mã/chuyển lớp lịch sử, kiểm tra startup, FK, rollback/retry, số lượng sentinel, dữ liệu cũ không đổi.
- `.DHSYSTEM/ARCHITECTURE.md`: ghi schema lịch sử lớp, tính chất staged enforcement và giới hạn trước T-8702.
- `PHASE-STATE.md`: đặt `in_progress` trước code, chỉ `done` sau gate và git persistence.

## Best Practices

- Backup/rehearsal trên DB cô lập; SQL tham số hóa, transaction; không tự đoán mã sinh viên/lớp biên chế.
- Ràng buộc SQLite được thêm sau báo cáo tiền kiểm sạch; index casefold/partial phải được kiểm chứng với Node 24 SQLite.
- Endpoint cũ không được trở thành đường vòng tạo học viên nhiều lớp.

## Verification Commands

- `node scripts/roster-migration-test.mjs` → toàn bộ fixture PASS.
- `node scripts/roster-migration-test.mjs --source-db <DB>` → rehearsal trên bản sao SQLite nhất quán của DB repo và DB bản cài; số bản ghi/FK/integrity giữ nguyên.
- `npm run typecheck`, `npm run lint`, `npm run build` → exit 0.
- Focused REST/upgrade-path tests → không hồi quy đăng nhập, nhập Excel, backup/restore.

## Acceptance Criteria

- DB legacy có xung đột vẫn khởi động và báo vấn đề; không mất điểm danh/kết quả.
- DB sạch sau migration có constraint phù hợp; chạy lại không nhân đôi lịch sử hoặc lỗi marker.
- Bản cài chỉ được cưỡng chế sau khi roster sạch; T-8700 đã xóa đúng 3 tài khoản thử nên hiện không còn hồ sơ thiếu mã/lớp. Không ghi trực tiếp vào DB bản cài ở T-8701; việc nâng cấp chỉ diễn ra khi ứng dụng bản mới khởi động.

## Status

- `done` — 2026-09-30; migration v27, trigger/index gate và lịch sử lớp hoàn thành. Fixture clean/conflicted/missing/rollback-retry PASS; rehearsal bản sao hai DB thật giữ nguyên users/classes/enrollments/grades/attendance, FK/integrity sạch. Typecheck/lint/build, focused suite và full E2E (87/87 smoke, 10/10 Socket, 11/11 game, 26/26 API) PASS. DB bản cài chưa được áp migration; bắt buộc mã/lớp lúc tạo còn ở T-8702.

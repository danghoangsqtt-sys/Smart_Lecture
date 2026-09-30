# T-8701 — Staged roster schema và legacy readiness gate

## Objective

Thêm cấu trúc hỗ trợ lớp biên chế hiện tại/lịch sử chuyển lớp và ràng buộc danh tính theo từng bước, không làm DB legacy xung đột mất khả năng khởi động hoặc tự sửa dữ liệu.

## Paths

- `server/src/db/connection.ts`
- `server/src/db/schema.sql`
- `server/src/routes/users.routes.ts`
- `server/src/routes/classes.routes.ts`
- `scripts/roster-migration-test.mjs`
- `.DHSYSTEM/phases/P87-home-class-identity/PHASE-STATE.md`

## File-Level Plan

- `server/src/db/connection.ts`: thêm migration cộng thêm cho lịch sử lớp biên chế và báo cáo trạng thái ràng buộc; backfill chỉ trường hợp một lớp rõ ràng. Unique index chỉ bật khi khóa có thể cưỡng chế an toàn; legacy thiếu/trùng được nêu để sửa, không tự gộp/xóa. Đảm bảo chạy lại sau remediation có thể hoàn tất index.
- `server/src/db/schema.sql`: chỉ bổ sung DDL phù hợp thứ tự bootstrap/migration; không thay đổi bảng legacy theo cách phá dữ liệu.
- `server/src/routes/users.routes.ts` và `server/src/routes/classes.routes.ts`: áp validation thống nhất cho mọi writer để không tạo xung đột mới trong khi dữ liệu cũ đang được rà soát; không mở quyền vượt `created_by`/quyền lớp.
- `scripts/roster-migration-test.mjs`: fixture DB sạch/xung đột/thiếu mã/chuyển lớp lịch sử, kiểm tra startup, FK, rollback/retry, số lượng sentinel, dữ liệu cũ không đổi.
- `PHASE-STATE.md`: đặt `in_progress` trước code, chỉ `done` sau gate và git persistence.

## Best Practices

- Backup/rehearsal trên DB cô lập; SQL tham số hóa, transaction; không tự đoán mã sinh viên/lớp biên chế.
- Ràng buộc SQLite được thêm sau báo cáo tiền kiểm sạch; index casefold/partial phải được kiểm chứng với Node 24 SQLite.
- Endpoint cũ không được trở thành đường vòng tạo học viên nhiều lớp.

## Verification Commands

- `node scripts/roster-migration-test.mjs` → toàn bộ fixture PASS.
- `npm run typecheck`, `npm run lint`, `npm run build` → exit 0.
- Focused REST/upgrade-path tests → không hồi quy đăng nhập, nhập Excel, backup/restore.

## Acceptance Criteria

- DB legacy có xung đột vẫn khởi động và báo vấn đề; không mất điểm danh/kết quả.
- DB sạch sau migration có constraint phù hợp; chạy lại không nhân đôi lịch sử hoặc lỗi marker.
- Bản cài chỉ được cưỡng chế sau khi 3 mã SV và 1 lớp thiếu được người dùng bổ sung và kiểm kê lại sạch.

## Status

- `todo` — chưa triển khai.

# T-8700 — Xóa đúng tài khoản học viên thử sau sao lưu

## Objective

Xóa các học viên thử không có mã sinh viên trong DB bản cài theo yêu cầu rõ ràng của người dùng, chỉ sau khi xác thực đúng tập ID, xem trước dữ liệu liên quan và tạo backup nhất quán. Không chạm DB trong repo hoặc tài khoản khác.

## Paths

- `scripts/cleanup-test-students.mjs`
- `scripts/cleanup-test-students.test.mjs`
- `.DHSYSTEM/phases/P87-home-class-identity/PHASE-STATE.md`
- `.DHSYSTEM/phases/P87-home-class-identity/tasks/T-8700-remove-test-students.md`
- `.DHSYSTEM/TRACKER.md`
- `.DHSYSTEM/HANDOFF.json`

## File-Level Plan

- `scripts/cleanup-test-students.mjs`: CLI mặc định dry-run, yêu cầu `--db` tường minh, liệt kê chỉ học viên thiếu mã và mọi tham chiếu FK tới user. Chế độ apply yêu cầu hash tập ID và số lượng mong đợi, kiểm tra lại trong transaction; từ chối nếu có dữ liệu học tập ngoài ghi danh. Tạo backup SQLite riêng bằng API backup chính thức trước khi xóa, kiểm chứng backup, xóa qua prepared statements và FK ON; không overwrite backup có sẵn.
- `scripts/cleanup-test-students.test.mjs`: fixture tạm cho dry-run, mismatch ID/count, lịch sử học tập chặn xóa, backup và xóa đúng 3 user trong transaction, user khác giữ nguyên, FK sạch và re-audit. Cleanup chỉ thư mục tạm đã xác thực.
- `PHASE-STATE.md`/`TRACKER.md`/`HANDOFF.json`: hiển thị task `in_progress` trước code; chỉ đánh dấu `done` sau khi backup, xóa đúng target, kiểm tra DB và git persistence đạt.

## Best Practices

- Không hardcode ID/đường dẫn DB bản cài vào source. Không copy trực tiếp file SQLite đang chạy khi có WAL; dùng SQLite backup API nhất quán.
- Dùng `BEGIN IMMEDIATE`, chuẩn bị câu lệnh, bật FK và kiểm tra lại target sau khi lấy lock. Không auto-xóa kết quả/điểm danh ngoài phạm vi xác nhận.
- Backup có tên mới riêng, không ghi đè; ghi đường dẫn phục hồi và checksum sau khi thành công. Không đưa password hash/token vào output.

## Verification Commands

- `node --test scripts/cleanup-test-students.test.mjs` → PASS.
- `npm run test:roster-preflight`, `npm run typecheck`, `npm run lint`, `npm run build` → PASS.
- Chạy dry-run DB bản cài, đối chiếu đúng 3 ID và FK; chỉ sau đó mới apply với hash/count; chạy lại preflight read-only → không còn 3 hồ sơ thử và không có lỗi mới.

## Acceptance Criteria

- Chỉ ba học viên thử được chọn bị xóa; admin/teacher, lớp, media và DB repo giữ nguyên.
- Backup nhất quán được tạo và xác minh trước deletion, có thể phục hồi. Nếu có lịch sử học tập, task dừng ở control point.
- Trước/sau đối soát tổng user, enrollment, foreign keys; không còn học viên thiếu mã trong bản cài.

## Status

- `done` — 2026-09-30; 3 ID trong preview đã xóa sau khi xác minh backup SQLite. Trước/sau: user 4→1, enrollment 2→0, lớp 1→1. Không có dữ liệu học tập khác tham chiếu; re-audit không còn issue. Test CLI 4/4, roster preflight 5/5, typecheck/lint/build PASS. Backup SHA-256 ghi trong PHASE-STATE.

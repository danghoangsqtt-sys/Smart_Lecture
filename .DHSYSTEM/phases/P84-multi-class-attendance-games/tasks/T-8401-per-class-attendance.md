# T-8401 — Điểm danh riêng từng lớp trong một buổi chung

## Objective

Liên kết một buổi dạy với 2–4 phiên điểm danh độc lập, đúng danh sách sinh viên của từng lớp.

## Paths

- `server/src/routes/attendance.routes.ts`
- `server/src/routes/teachingLogs.routes.ts`
- `server/src/db/connection.ts`
- `scripts/e2e-regressions.mjs`

## Plan

1. Thêm liên kết `teaching_log_id`–`class_id`–`attendance_session_id` có ràng buộc lớp khớp phiên; giữ trường attendance cũ cho fallback một lớp.
2. Tạo hoặc chọn bản điểm danh lớp trong transaction. Với `UNIQUE(class_id, session_date)`, không ghi đè phiên cùng ngày; trả conflict hoặc chọn liên kết có xác nhận theo UI.
3. Cho giáo viên xem/sửa riêng từng lớp; thống kê tổng buổi là tổng các lớp nhưng không gộp bản ghi học viên vào lớp khác.

## Acceptance

- Thao tác lớp A không thay đổi điểm danh lớp B; sinh viên ngoài lớp không được thêm.
- Cùng ngày có bản điểm danh cũ không bị overwrite; retry không tạo thêm bản ghi.
- Báo cáo lớp và tổng buổi đối soát được với attendance records gốc.

## Status

- `todo`

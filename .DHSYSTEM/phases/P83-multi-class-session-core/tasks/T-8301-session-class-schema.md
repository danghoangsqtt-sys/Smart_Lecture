# T-8301 — Migration phiên dạy–lớp

## Objective

Biểu diễn 2–4 lớp thuộc một nhật ký/buổi dạy mà không nhân bản telemetry hay làm đổi dữ liệu một lớp cũ.

## Paths

- `server/src/db/connection.ts`
- `server/src/db/schema.sql`
- `server/src/types.ts`
- `scripts/e2e-regressions.mjs`

## Plan

1. Dùng migration version tiếp theo tại thời điểm thực thi; thêm quan hệ `teaching_log_id`–`class_id` với khóa/index riêng, không sửa/xóa `teaching_logs.class_id` cũ.
2. Kiểm tra lớp nguồn nằm trong nhóm, không trùng lớp và tối đa bốn lớp ở API/transaction; DB giữ uniqueness/FK. Dữ liệu cũ không cần backfill phá hủy: khi không có quan hệ nhóm, read model trả một lớp cũ.
3. Chuẩn bị quan hệ liên kết điểm danh và người chơi–lớp ở task P84 theo cùng nguyên tắc migration cộng thêm.

## Acceptance

- Bản sao DB v0.11 nâng cấp một lần và khởi động lại nhiều lần không đổi số nhật ký/điểm danh/kết quả.
- Xóa/rollback theo backup test không để DB ở trạng thái nửa migration.
- Query nhóm không dùng JSON filter hoặc nối chuỗi input vào SQL.

## Status

- `todo`

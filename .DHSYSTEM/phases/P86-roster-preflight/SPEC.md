# P86 — Roster preflight và cổng di trú

## Goal

Kiểm kê DB legacy bằng thao tác chỉ đọc trước khi thêm unique/index hoặc chuyển mô hình một học viên–một lớp. Công cụ không mặc định mở DB ứng dụng đang chạy.

## Scope

- Phát hiện username trùng sau chuẩn hóa, học viên có username chữ hoa, mã sinh viên thiếu/trùng, học viên 0 hoặc >1 lớp, ghi danh sai role và lỗi FK/schema.
- Báo cáo tổng hợp mặc định; chi tiết định danh chỉ trong JSON khi người vận hành chủ động yêu cầu.
- Test bằng SQLite fixture tạm, xác minh DB trước/sau không đổi byte khi mở read-only.
- Không tự động sửa, gộp hoặc xóa hồ sơ; remediation/migration ràng buộc thuộc P87.

## Tasks

- `tasks/T-8601-roster-preflight.md`

## Exit criteria

- Test fixture sạch và fixture xung đột đều được phân loại đúng.
- Read-only không chạy `migrate()`/`config.ts` và không viết DB; lỗi/đường dẫn thiếu trả exit code khác 0.
- Báo cáo là điều kiện đầu vào cho P87; không đánh dấu dữ liệu thực “sạch” nếu chưa chạy kiểm kê do người dùng chọn DB.

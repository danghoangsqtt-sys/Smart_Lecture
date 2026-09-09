# Phase 74 — Media & Backup Integrity Hardening

## Objective

Sửa các lỗi correctness và security boundary được xác nhận sau P73 mà không thay đổi mô hình LAN, quyền lớp học hoặc API công khai ngoài phần phản hồi login an toàn hơn.

## Scope

1. Học viên xem/tải được media đã được phân quyền bằng URL tương thích native browser elements.
2. Backup/restore bảo toàn quan hệ giữa SQLite và media đã đóng gói, không ghi đè backup cùng phút.
3. Curriculum upload xác minh extension, MIME chuẩn hóa và file signature.
4. Login không làm lộ khác biệt tài khoản khóa/không tồn tại; governance ghi rõ convention tag lịch sử.
5. Release patch `0.10.2` với full regression gate.

## Guardrails

- Không đưa JWT vào log hoặc storage mới; URL query hiện hữu chỉ dùng cho native media elements và phải có `Referrer-Policy: no-referrer`/`Cache-Control: private`.
- Restore giải nén vào staging, xác minh toàn bộ trước khi thay đổi durable state; không xóa media ngoài manifest.
- MIME được suy ra từ allowlist và signature, không tin `file.mimetype`.
- Giữ nguyên thư mục `reports/` chưa tracked của người dùng.

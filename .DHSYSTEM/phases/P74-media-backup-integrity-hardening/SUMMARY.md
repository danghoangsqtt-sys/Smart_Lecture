# Phase 74 Summary — Media & Backup Integrity Hardening

Phase 74 hoàn tất bản vá `0.10.2`:

- Native viewer/download của học viên dùng authenticated media URL; stream response không cache và không gửi referrer.
- Backup có tên collision-safe, xác minh manifest/path/size, stage và phục hồi media đóng gói cùng SQLite ở lần boot kế tiếp.
- Upload curriculum kiểm tra signature PDF/DOCX và lưu canonical MIME thay vì MIME từ client.
- Login trả public response đồng nhất cho tài khoản thiếu, sai mật khẩu và tài khoản khóa; lockout nội bộ vẫn giữ nguyên.
- Governance ghi rõ convention tag lịch sử P13–P69 mà không tạo tag hồi tố.

## Verification

- Release baseline, typecheck, lint và production build: pass.
- Backup/media restore integration: 6/6.
- REST E2E: 86/86; Socket: 10/10; game lifecycle: 11/11; security/data regression: 26/26.
- Restore restart và circuit restart recovery: pass.
- Browser E2E: 6/6.
- Production audit: 0 high/critical; còn 2 moderate gián tiếp ExcelJS → uuid theo ADR-001.

# Phase 80 — Biểu trưng SmartLecture trong giao diện

## Goal

Đồng bộ nhận diện trong ứng dụng với icon shortcut Windows đã có. Người dùng xác nhận icon bên ngoài hiển thị nhưng trang đăng nhập và sidebar vẫn dùng chữ `SL`; T-8001 dùng trực tiếp ảnh PNG đã cung cấp để sửa điểm thiếu này.

## Scope

- Biểu trưng trong đăng nhập, sidebar desktop và header mobile; có alt text và tải offline từ web bundle.
- Giữ nguyên `docs/icon/Icon_sm.ico`, shortcut/installer, favicon/PWA hiện có; không tạo lại artwork khi người dùng chưa yêu cầu thay icon bên ngoài.
- Không phụ thuộc API AI hoặc API key. API nội bộ chương trình đào tạo thuộc P88, không phải API AI.

## Quality gate

- Typecheck, lint, build và Browser E2E desktop/mobile trên dữ liệu cô lập đạt.
- Asset được đóng gói cùng web, không thay đổi bản cài đang sử dụng trước release gate.

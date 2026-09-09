# Phase 72 — Distributable Windows Installer

## Goal

Tạo một file cài đặt Windows có thể gửi cho người dùng. Sau khi cài, người dùng mở SmartLecture từ Desktop hoặc Start Menu mà không cần cài Node.js hay giữ source repository.

## Architecture

- Giữ mô hình local web server hiện tại; không thêm Electron.
- Bundle Node.js runtime, production build và production dependencies trong payload.
- Cài application dưới per-user application directory, không yêu cầu quyền Administrator cho luồng chuẩn.
- Dữ liệu runtime nằm trong `%LOCALAPPDATA%\SmartLecture\data` để upgrade/uninstall không làm mất dữ liệu mặc định.
- Launcher kiểm tra health, không dừng process lạ chiếm cổng và mở browser mặc định.

## Acceptance Criteria

- Sinh được `SmartLecture-Setup-0.10.0.exe` cùng SHA-256 checksum.
- Máy đích không cần Node.js riêng.
- Shortcut Desktop và Start Menu chạy ứng dụng bằng một lần bấm đúp.
- Upgrade giữ nguyên runtime data; uninstall không xóa dữ liệu nếu người dùng chưa chủ động chọn.
- Typecheck, lint, production build và installed-payload smoke test pass.

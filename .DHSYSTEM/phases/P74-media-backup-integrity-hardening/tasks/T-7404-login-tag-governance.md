# T-7404 — Login response and tag governance hardening

## Status

- `completed`

## Objective

Giảm username/status enumeration ở login và ghi nhận chính xác convention tag lịch sử.

## Paths

- server/src/routes/auth.routes.ts
- scripts/auth-rate-limit-test.mjs
- scripts/e2e-smoke.ps1
- .DHSYSTEM/ROADMAP.md

## File-Level Plan

1. Chuẩn hóa phản hồi bên ngoài cho username không tồn tại, sai mật khẩu và tài khoản khóa; vẫn lưu trạng thái khóa nội bộ.
2. Giữ account lockout/rate-limit semantics và thêm regression assertions.
3. Mở rộng governance note: P13–P69 dùng phase tag `-done` theo convention lịch sử.

## Acceptance Criteria

- [x] Login không phân biệt tài khoản khóa với credential không hợp lệ qua status/code/message.
- [x] Lockout và spoofed forwarded-IP rate-limit vẫn pass.
- [x] ROADMAP giải thích đầy đủ tag history, không tạo tag hồi tố.

## Verification

- `node scripts/auth-rate-limit-test.mjs`
- `npm.cmd run typecheck`
- `npm.cmd run lint`

Kết quả: typecheck/lint pass; auth regression 4/4, gồm uniform response và direct-LAN rate limit.

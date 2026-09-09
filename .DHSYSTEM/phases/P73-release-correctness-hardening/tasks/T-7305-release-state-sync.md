# T-7305 — Documentation and release-state sync

## Status

- `completed`

## Objective

Đồng bộ command, changelog, version và trạng thái quản trị cho bản vá `0.10.1`.

## Paths

- README.md
- CHANGELOG.md
- package.json
- package-lock.json
- server/package.json
- web/package.json
- server/src/version.ts
- .DHSYSTEM/PROJECT-META.md
- .DHSYSTEM/ROADMAP.md
- .DHSYSTEM/TRACKER.md
- .DHSYSTEM/HANDOFF.json
- .DHSYSTEM/ARCHITECTURE.md

## File-Level Plan

1. Sửa lệnh installer sai trong README và cập nhật release status.
2. Chuẩn hóa CHANGELOG thành một mục Unreleased/0.10.1 hiện hành.
3. Đồng bộ version qua root/workspaces/runtime metadata.
4. Ghi rõ trạng thái legacy P1–P6 và quyết định tag P12/P70 thay vì tạo tag lịch sử không có bằng chứng.
5. Hoàn tất P73 sau khi toàn bộ quality gate xanh.

## Acceptance Criteria

- [x] Mọi lệnh README đều tồn tại trong package scripts.
- [x] Version `0.10.1` nhất quán.
- [x] ROADMAP/TRACKER/HANDOFF phản ánh đúng P73.
- [x] Full phase verification pass.

## Verification

- `node scripts/verify-release-baseline.mjs`
- `npm.cmd run typecheck`
- `npm.cmd run lint`
- `npm.cmd run build`
- `npm.cmd run test:e2e`
- `npm.cmd run test:browser`

Kết quả: toàn bộ gate pass; Browser 5/5; production audit không có high/critical (còn 2 moderate gián tiếp qua ExcelJS/uuid, được theo dõi theo ADR-001).

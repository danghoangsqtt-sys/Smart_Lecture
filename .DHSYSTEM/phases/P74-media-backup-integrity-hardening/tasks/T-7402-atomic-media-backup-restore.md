# T-7402 — Atomic media-aware backup restore

## Status

- `in_progress`

## Objective

Khôi phục SQLite cùng media đã đóng gói, xác minh backup trước staging và bảo đảm tên backup không va chạm.

## Paths

- server/src/services/backup.ts
- scripts/backup-media-restore-test.mjs
- package.json

## File-Level Plan

1. Tạo tên backup có độ phân giải đủ cao và chế độ không ghi đè.
2. Xác minh ZIP/manifest/path/file size rồi stage DB và media trong thư mục riêng.
3. Áp dụng staged media ở boot cùng staged DB theo thứ tự có khả năng recovery.
4. Viết integration test cho media restore, file thiếu và hai backup liên tiếp.

## Acceptance Criteria

- [ ] Hai backup liên tiếp có tên khác nhau và không ghi đè.
- [ ] Media trong ZIP được phục hồi cùng DB sau restart.
- [ ] ZIP path traversal hoặc manifest sai bị từ chối trước durable mutation.
- [ ] Integration test pass.

## Verification

- `node scripts/backup-media-restore-test.mjs`
- `npm.cmd run typecheck`
- `npm.cmd run lint`

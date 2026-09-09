# T-7304 — CSP, token and dependency security baseline

## Status

- `completed`

## Objective

Giảm blast radius của XSS, đánh giá token persistence và khóa quyết định xử lý cảnh báo ExcelJS/uuid mà không gây regression nghiệp vụ Excel.

## Paths

- server/src/index.ts
- web/src/stores/authStore.ts
- tests/browser/login.spec.ts
- docs/adr/ADR-001-excel-dependency.md
- package-lock.json

## File-Level Plan

1. Xây CSP tối thiểu tương thích asset self-hosted, PDF worker, media và Socket.IO.
2. Thử nghiệm auth persistence session-scoped; chỉ giữ thay đổi nếu browser reconnect/multi-tab regression xác nhận UX phù hợp.
3. Kiểm tra call path ExcelJS không dùng UUID API bị ảnh hưởng; không dùng audit force/downgrade mù.
4. Cập nhật ADR với trạng thái advisory và biện pháp kiểm soát.

## Acceptance Criteria

- [x] Production dùng Helmet CSP và browser flow trọng yếu pass 5/5.
- [x] Giữ localStorage có chủ đích: thử nghiệm sessionStorage làm hỏng reconnect bằng tab mới; thay đổi đã được loại bỏ.
- [x] Không có high/critical production vulnerability; hai moderate ExcelJS/uuid được ghi nhận trong ADR.
- [x] Import/export Excel và formula-injection regression pass.

## Verification

- `npm.cmd run test:browser`: 5/5 pass với CSP.
- `npm.cmd run test:e2e`: Excel routes và formula-injection pass trong lần full gate T-7302.
- `npm.cmd audit --omit=dev --audit-level=high`: pass; 0 high/critical, 2 moderate accepted per ADR.

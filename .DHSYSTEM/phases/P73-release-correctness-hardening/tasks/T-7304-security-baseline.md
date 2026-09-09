# T-7304 — CSP, token and dependency security baseline

## Status

- `in_progress`

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
2. Chuyển auth persistence sang session-scoped storage nếu browser regression xác nhận UX phù hợp.
3. Kiểm tra call path ExcelJS không dùng UUID API bị ảnh hưởng; không dùng audit force/downgrade mù.
4. Cập nhật ADR với trạng thái advisory và biện pháp kiểm soát.

## Acceptance Criteria

- [ ] Production responses có CSP và browser flow trọng yếu vẫn hoạt động.
- [ ] Token không còn tồn tại qua browser session ngoài chủ đích.
- [ ] Không có high/critical production vulnerability.
- [ ] Import/export Excel regression pass.

## Verification

- `npm.cmd run test:browser`
- `npm.cmd run test:e2e`
- `npm.cmd audit --omit=dev`

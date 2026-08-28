# T-1204 — Browser quality gate

## Objective

Bổ sung kiểm chứng browser tự động cho các luồng lớp học quan trọng mà API E2E hiện không bao phủ.

## Paths

- `package.json` — test script/dependency được chọn.
- `scripts/e2e-browser.*` hoặc `tests/e2e/**` (new) — kịch bản browser cô lập.
- `.github/workflows/ci.yml` — CI quality gate.
- `README.md` — cách chạy test local.

## File-Level Plan

1. Chọn framework browser tương thích Node 24 và CI, ghi lý do trong task note/ADR nếu thêm dependency lớn.
2. Khởi động app với DB tạm và seed xác định; không dùng DB developer.
3. Tự động hóa login/đổi mật khẩu, lớp-học liệu, thi autosave, join game và teaching session.
4. Thêm kiểm tra focus/label/keyboard trọng yếu, artifact screenshot/trace khi fail.

## Acceptance Criteria

- Browser E2E pass ba lần liên tiếp ở local và chạy trong CI.
- Test không phụ thuộc Gemini, Docling hoặc Internet.
- Failure để lại evidence đủ tái hiện và cleanup process/data tạm.

## Verification

Browser test command; `npm run typecheck`; build; `npm run test:e2e`.

## Execution Log

- 2026-08-28: started after T-1203 persistence gate passed. The existing CI has only API/socket E2E; framework compatibility, browser availability and isolated-server integration are being inventoried before adding a browser dependency.

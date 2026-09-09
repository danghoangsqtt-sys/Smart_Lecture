# T-7403 — Curriculum upload content validation

## Status

- `completed`

## Objective

Không tin MIME do client gửi và từ chối PDF/DOCX có signature không hợp lệ.

## Paths

- server/src/routes/curriculumDocuments.routes.ts
- scripts/curriculum-test.mjs
- scripts/e2e-regressions.mjs

## File-Level Plan

1. Dùng allowlist extension → canonical MIME.
2. Kiểm tra PDF magic bytes và DOCX ZIP signature trước khi rename/insert.
3. Mở rộng regression test cho MIME spoofing và file giả.

## Acceptance Criteria

- [x] MIME lưu/trả về là canonical server value.
- [x] File signature sai bị 400 và temp file được dọn.
- [x] File PDF/DOCX hợp lệ tiếp tục upload được.
- [x] Typecheck, lint và curriculum regression pass.

## Verification

- `npm.cmd run typecheck`
- `npm.cmd run lint`
- `node scripts/curriculum-test.mjs`

Kết quả: typecheck/lint pass; full E2E pass; security/data regression 26/26 gồm signature rejection và canonical MIME.

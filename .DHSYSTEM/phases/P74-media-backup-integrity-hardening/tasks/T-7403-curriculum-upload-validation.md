# T-7403 — Curriculum upload content validation

## Status

- `todo`

## Objective

Không tin MIME do client gửi và từ chối PDF/DOCX có signature không hợp lệ.

## Paths

- server/src/routes/curriculumDocuments.routes.ts
- scripts/curriculum-test.mjs

## File-Level Plan

1. Dùng allowlist extension → canonical MIME.
2. Kiểm tra PDF magic bytes và DOCX ZIP signature trước khi rename/insert.
3. Mở rộng regression test cho MIME spoofing và file giả.

## Acceptance Criteria

- [ ] MIME lưu/trả về là canonical server value.
- [ ] File signature sai bị 400 và temp file được dọn.
- [ ] File PDF/DOCX hợp lệ tiếp tục upload được.
- [ ] Typecheck, lint và curriculum regression pass.

## Verification

- `npm.cmd run typecheck`
- `npm.cmd run lint`
- `node scripts/curriculum-test.mjs`

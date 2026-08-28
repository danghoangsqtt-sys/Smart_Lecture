# T-1202 — Rủi ro Excel và dependency

## Objective

Loại bỏ hoặc giảm thiểu có chứng cứ lỗ hổng dependency mức high liên quan đến XLSX mà không làm hỏng import/export Excel của giáo viên.

## Paths

- `package.json`, `package-lock.json` — dependency decision.
- `server/src/routes/users.routes.ts`, `server/src/routes/curriculumDocuments.routes.ts` — luồng parse XLSX server cần rà soát.
- `web/src/pages/ClassDetailPage.tsx`, `web/src/pages/QuestionsPage.tsx` — luồng Excel client cần rà soát.
- `docs/adr/ADR-001-excel-dependency.md` (new) — quyết định kỹ thuật và threat model.
- `scripts/e2e-*.mjs` hoặc test mới — regression import/export.

## File-Level Plan

1. Lập inventory mọi call XLSX và phân loại parse untrusted/export trusted.
2. Kiểm tra advisory, release notes và compatibility bằng spike độc lập.
3. Chọn thay thế/nâng cấp/mitigation được ADR phê duyệt trước khi sửa production code.
4. Thêm regression cho workbook bất thường, giới hạn kích thước và lỗi parse thân thiện.

## Acceptance Criteria

- `npm audit` không còn high/critical mở, hoặc exception có owner, expiry và control giảm thiểu được ghi vào ADR.
- Import học viên/chương trình và export hiện có không regress.
- Không chạy `npm audit fix --force` nếu chưa chứng minh tương thích.

## Verification

`npm audit --omit=dev --audit-level=high`; typecheck; build; regression import/export.

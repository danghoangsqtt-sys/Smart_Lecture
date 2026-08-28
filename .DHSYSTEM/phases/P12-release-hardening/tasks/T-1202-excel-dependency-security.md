# T-1202 — Rủi ro Excel và dependency

## Objective

Loại bỏ hoặc giảm thiểu có chứng cứ lỗ hổng dependency mức high liên quan đến XLSX mà không làm hỏng import/export Excel của giáo viên.

## Paths

- `package.json`, `package-lock.json` — dependency decision.
- `server/src/utils/spreadsheet.ts` (new) — adapter ExcelJS, chuẩn hoá cell không tin cậy và tạo XLSX/CSV.
- `server/src/routes/classes.routes.ts`, `server/src/routes/teachingPlans.routes.ts`, `server/src/routes/teachingLogs.routes.ts` — các luồng import/export server.
- `web/src/pages/ClassDetailPage.tsx` — export sổ điểm và điểm nhóm trên client.
- `scripts/e2e-full-flow.mjs`, `scripts/seed-bulk-users.mjs` — fixture XLSX dùng cho smoke/manual flow.
- `docs/adr/ADR-001-excel-dependency.md` (new) — quyết định kỹ thuật và threat model.
- `scripts/e2e-*.mjs` hoặc test mới — regression import/export.

## File-Level Plan

1. Lập inventory mọi call XLSX và phân loại parse untrusted/export trusted.
2. Kiểm tra advisory, release notes và compatibility bằng spike độc lập.
3. Chọn ExcelJS đã có ở server làm adapter XLSX duy nhất; tải động ở client để không đưa parser vào entry bundle.
4. Thêm regression cho template/import/export và kiểm tra audit sau khi xoá `xlsx` khỏi lockfile.

## Acceptance Criteria

- `npm audit` không còn high/critical mở, hoặc exception có owner, expiry và control giảm thiểu được ghi vào ADR.
- Import học viên/chương trình và export hiện có không regress.
- Không chạy `npm audit fix --force` nếu chưa chứng minh tương thích.

## Verification

`npm audit --omit=dev --audit-level=high`; typecheck; build; regression import/export.

## Execution Log

- 2026-08-28: started after T-1201 persistence gate passed. Inventory found `xlsx` in three server routes, one client page and two fixture scripts. `npm audit --omit=dev --audit-level=high` reports two high advisories for `xlsx@0.18.5` with no upstream fix. ADR-001 selects the existing ExcelJS dependency; implementation and regression are in progress.
- 2026-08-28: complete. Removed `xlsx` from the workspace and lockfile; added `server/src/utils/spreadsheet.ts`, ExcelJS client export loading, CSV-safe output and the isolated `scripts/e2e-excel-regression.mjs`. The regression validates student XLSX import, curriculum XLSX import/template and class XLSX export. It also exposed and fixed the template route precedence defect. Audit is now 0 high/critical; two remaining moderate findings are the ExcelJS transitive `uuid` advisory, whose only automated remediation is the documented breaking downgrade to ExcelJS 3.4.

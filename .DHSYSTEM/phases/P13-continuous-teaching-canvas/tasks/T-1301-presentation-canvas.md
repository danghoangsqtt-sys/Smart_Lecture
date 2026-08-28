# T-1301 — Presentation Canvas cho PDF/PPTX

## Objective

Thay PDF iframe hiện tại bằng viewer có quyền điều khiển trang và surface chuẩn để lớp annotation bám chính xác; giữ PowerPoint theo luồng PPTX → PDF hiện có.

## Paths

- `web/package.json` — dependency viewer nếu được chọn sau spike.
- `web/src/features/presentation/PresentationCanvas.tsx` (new) — host render page, zoom và fullscreen.
- `web/src/features/presentation/pdfRenderer.ts` (new) — adapter render PDF, tách khỏi UI.
- `web/src/features/presentation/types.ts` (new) — document/page/viewport types.
- `web/src/pages/TeachingModePage.tsx` — tích hợp canvas, không chứa renderer logic.
- `server/src/routes/lectures.routes.ts` — chỉ sửa nếu cần metadata trang/conversion rõ ràng.
- `scripts/e2e-*.mjs` hoặc browser test mới — regression access/PPTX conversion.

## File-Level Plan

1. Spike renderer PDF tương thích Vite/React và license; ưu tiên render page canvas để overlay vector căn theo viewport.
2. Đưa trạng thái document/page/zoom vào feature-local reducer, không làm TeachingModePage phình thêm.
3. Dùng converted PDF sibling của PPTX; khi LibreOffice chưa tạo sibling thì hiện empty state có hướng dẫn mở bản gốc.
4. Ghi telemetry material khi document thực sự được mở, không ghi hàng loạt mọi material trong tab.

## Acceptance Criteria

- Điều hướng trang, fit-width/fit-page, zoom và fullscreen dùng được bằng chuột/bàn phím.
- PDF nguồn không bị sửa; kiểm tra quyền media vẫn dùng token/access hiện có.
- PPTX đã convert hiển thị như PDF và fallback không crash khi conversion vắng mặt.

## Verification

Typecheck; production build; browser tests for PDF/PPTX/authorization; existing E2E.

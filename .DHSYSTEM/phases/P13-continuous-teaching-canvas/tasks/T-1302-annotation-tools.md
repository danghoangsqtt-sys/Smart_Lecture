# T-1302 — Annotation, highlight và laser

## Objective

Cung cấp các công cụ giảng dạy trực tiếp trên presentation canvas mà không chỉnh sửa tệp nguồn.

## Paths

- `web/src/features/presentation/annotation/types.ts` (new) — shape và tool union.
- `web/src/features/presentation/annotation/annotationReducer.ts` (new) — undo/redo/page state.
- `web/src/features/presentation/annotation/AnnotationOverlay.tsx` (new) — pointer event và render vector.
- `web/src/features/presentation/annotation/AnnotationToolbar.tsx` (new) — controls có keyboard labels.
- `web/src/features/presentation/PresentationCanvas.tsx` — gắn overlay theo viewport/page.
- `web/src/pages/TeachingModePage.tsx` — chỉ đưa actions/context cần thiết.

## File-Level Plan

1. Lưu point chuẩn hóa 0..1 theo trang để zoom/resize không làm lệch nét vẽ.
2. Tách persistent tools (pen/highlight/ellipse/line) khỏi laser transient; laser không vào history/storage.
3. Đặt history theo material + page, giới hạn bộ nhớ và dùng session storage an toàn khi refresh.
4. Hỗ trợ color/size, eraser, undo/redo/clear-page và shortcut có tooltip/aria-label.

## Acceptance Criteria

- Pen, highlighter, ellipse, underline/line và eraser cho kết quả đúng khi zoom/đổi trang.
- Undo/redo không ảnh hưởng page khác; clear có confirmation trong UI custom.
- Annotation không gửi tệp/secret ra ngoài và không làm đổi PDF/PPTX.

## Verification

Unit/reducer tests nếu framework được T-1204 chọn; browser pointer tests at multiple zoom levels; React quality scan.

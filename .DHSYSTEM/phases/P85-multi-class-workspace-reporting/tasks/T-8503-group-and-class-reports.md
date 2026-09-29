# T-8503 — Báo cáo tổng buổi và từng lớp

## Objective

Một bộ số liệu nhất quán cho buổi chung và các lớp, xuất CSV/XLSX an toàn.

## Paths

- `server/src/routes/teachingLogs.routes.ts`
- `server/src/routes/games.routes.ts`
- `web/src/pages/TeachingHubPage.tsx`
- `scripts/e2e-regressions.mjs`

## Plan

1. Read model tổng buổi đếm slide/video/game một lần; số sinh viên duy nhất và các thống kê điểm danh/kết quả tách theo lớp.
2. Class filter kiểm tra quyền từng lớp; báo cáo lớp cũ vẫn trả cùng shape/ý nghĩa.
3. CSV/XLSX dùng cùng read model, gồm metadata nhóm lớp và bảng từng lớp; trung hòa formula injection như export hiện có.

## Acceptance

- Số tổng đối soát được với từng lớp; không nhân 2–4 lần thời lượng, hoạt động, game hay điểm.
- Học viên/giáo viên không được xuất lớp ngoài quyền; dữ liệu circuit riêng tư không có trong export.
- Import lại file bằng parser kiểm thử cho thấy cột, ký tự tiếng Việt và điểm đúng.

## Status

- `todo`

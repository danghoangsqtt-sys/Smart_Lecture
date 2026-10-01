# P88 — Kho chương trình dùng chung: hoàn thành source 2026-10-01

## Outcome

- T-8801: migration v29 tạo môn/bài/học liệu/câu hỏi dùng chung, quan hệ lớp–môn và tiến độ lớp; map legacy theo ID, không gộp môn trùng tên và không tự mở tệp cũ trước khi sao chép.
- T-8802: API quyền chủ môn/lớp, upload/stream media độc lập, copy legacy có kiểm tra, snapshot câu hỏi game migration v30 để phiên không đổi khi ngân hàng thay đổi.
- T-8803: `/curriculum` biên soạn một nguồn và phân công nhiều lớp; `/teaching` chọn nội dung đã gắn, PDF/video/game/tiến độ theo lớp; route cũ vẫn đọc được.
- T-8804: khắc phục game quá nhỏ trong giờ dạy — bộ chọn card, host console rộng, sân khấu toàn viewport cho cả workspace cũ/mới, thu nhỏ hoặc trở lại slide không hủy phòng.

## Verification

- Migration fixture 11/11; shared API 22/22; `npm run typecheck`, `npm run lint`, `npm run build`, `npm run test:focused`, `npm run test:e2e`, `npm run test:browser` đạt. Browser 10/10, full E2E smoke 87/87, Socket 10/10, game lifecycle 11/11 và API regressions 26/26.
- React Doctor changed ở T-8804: 88/100, còn ba cảnh báo heuristic độ phức tạp component; không phát hiện lỗi functional/security mới.
- Test dùng DB/media cô lập. Bản cài v0.11.0 và DB của nó chưa nhận migration v29/v30 hoặc UI mới; P89 đa lớp, P90 rehearsal và P78–P82 release gates còn chờ. AI/API key để sau theo yêu cầu.

## Files

- Schema/API: `server/src/db/connection.ts`, `server/src/db/schema.sql`, `server/src/routes/sharedCurriculum.routes.ts`, `server/src/routes/games.routes.ts`, `server/src/services/sharedCurriculumMedia.ts`.
- UI: `web/src/pages/CurriculumPage.tsx`, `web/src/pages/SharedTeachingHubPage.tsx`, `web/src/pages/SharedTeachingPage.tsx`, `web/src/pages/TeachingModePage.tsx`, `web/src/pages/GamesPage.tsx`, `web/src/features/curriculum/`.
- Regression: `scripts/shared-curriculum-migration-test.mjs`, `scripts/shared-curriculum-api-test.mjs`, `tests/browser/login.spec.ts`.

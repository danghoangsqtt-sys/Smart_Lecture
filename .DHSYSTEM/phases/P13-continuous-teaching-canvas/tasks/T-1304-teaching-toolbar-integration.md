# T-1304 — Thanh tác vụ và tích hợp buổi dạy

## Objective

Hoàn thiện một thanh tác vụ ưu tiên thao tác trong tiết và bảo vệ continuity của session telemetry, video và game.

## Paths

- `web/src/features/teaching-toolbar/TeachingToolbar.tsx` (new) — navigation/content/tool/activity controls.
- `web/src/pages/TeachingModePage.tsx` — compose feature components và session state.
- `web/src/pages/TeachingModePage.test.*` hoặc browser test mới — flow integration.
- `scripts/e2e-regressions.mjs` — bổ sung API telemetry nếu API thay đổi.
- `.DHSYSTEM/ARCHITECTURE.md` — cập nhật frontend feature boundaries khi hoàn tất.

## File-Level Plan

1. Sắp controls theo tần suất: slide/page, annotation, video/game, attendance/session, exit.
2. Tách actions khỏi viewer; đổi mode không được record trùng material/video/game.
3. Kiểm tra focus khi toolbar/dock/modal mở, keyboard shortcut conflict và responsive projector layout.
4. Chạy full flow: session → PDF annotate → video dock → prepared game → attendance → finish summary.

## Acceptance Criteria

- Một luồng dạy liên tục không yêu cầu rời Teaching Mode hoặc mở iframe mới để dùng video/game.
- Kết thúc session hiển thị telemetry chính xác, không trùng và không mất vì dock state.
- Desktop 1366×768 và projector/fullscreen usable; keyboard/a11y smoke pass.

## Verification

Typecheck; build; existing E2E/socket suite; browser full-flow; manual projector checklist.

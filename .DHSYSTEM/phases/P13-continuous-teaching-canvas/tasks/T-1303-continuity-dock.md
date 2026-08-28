# T-1303 — Video/Game Continuity Dock

## Objective

Giữ video và game tiếp tục hoạt động trong lúc giáo viên quay lại slide hoặc thu nhỏ activity vào góc màn hình.

## Paths

- `web/src/features/teaching-dock/TeachingDock.tsx` (new) — shell kéo thả, resize, minimize/restore.
- `web/src/features/teaching-dock/useDraggableDock.ts` (new) — pointer capture, bounds và persistence cục bộ.
- `web/src/features/teaching-dock/VideoDock.tsx` (new) — video host, native PiP và fallback mini-player.
- `web/src/features/teaching-dock/GameDock.tsx` (new) — adapter cho GamesPage đã nhúng.
- `web/src/pages/TeachingModePage.tsx` — owner state tối thiểu, giữ children mounted.
- `web/src/pages/GamesPage.tsx` — chỉ sửa interface nếu cần để giữ context/session.

## File-Level Plan

1. Tạo dock shell tái sử dụng, giới hạn khung trong viewport, có title bar keyboard accessible và không chặn toolbar chính.
2. Mount video một lần; đổi view chỉ thay visibility/layout, không thay `src` hoặc remount element.
3. Dùng `requestPictureInPicture` khi có; bắt lỗi/cancel state và fallback dock không PiP khi browser không hỗ trợ.
4. Chuyển game dock hiện có sang shell mới, giữ class/subject lock và callback telemetry hiện hữu.

## Acceptance Criteria

- Video vẫn phát sau minimize/restore và khi canvas đổi trang; dock kéo thả được trên desktop/touch.
- Game dock không reset context/host state chỉ vì minimize/restore.
- Close khác minimize: close yêu cầu xác nhận khi hoạt động đang chạy và không tự kết thúc game server-side.

## Verification

Browser tests for video playback/minimize/PiP fallback and game context; socket regression; manual projector scenario.

# T-8502 — Một Teaching Mode workspace cho hội trường

## Objective

Giảng viên điều khiển một trình chiếu/video/game, đồng thời thao tác điểm danh riêng mỗi lớp mà không mở nhiều tab.

## Paths

- `web/src/pages/TeachingModePage.tsx`
- `web/src/features/teaching-mode/*`
- `web/src/App.tsx`
- `web/src/pages/GamesPage.tsx`
- `tests/browser/login.spec.ts`

## Plan

1. Route/state dựa trên session ID nhóm do server cấp; local/session storage chỉ giữ layout, slide và dock, không quyết định lớp/quyền.
2. Một content/game dock; điểm danh dùng chuyển lớp rõ ràng với tên lớp và trạng thái đã/chưa điểm danh.
3. Refresh/reconnect lấy session/room từ server, không tạo game hay log mới; end xác nhận buổi chung và hiển thị lớp chưa điểm danh.

## Acceptance

- Slide → video → game → slide liền mạch với 2–4 lớp; telemetry chỉ ghi một lần.
- Reload/đổi tab/trình duyệt host khôi phục đúng nhóm, dock và phòng game đang chạy.
- Người học chỉ thấy lớp của mình trong dữ liệu cá nhân; session một lớp cũ giữ nguyên.

## Status

- `todo`

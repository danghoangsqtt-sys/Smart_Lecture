# T-8804 — Hồi quy chương trình/game/legacy và cải thiện màn hình game khi giảng

## Objective

Xác minh nguồn chương trình chung, game từ bài và route giảng dạy cũ trên dữ liệu cô lập. Theo phản hồi 2026-10-01, khi giáo viên mở Trò chơi trong giờ dạy, việc chọn loại game phải rõ ràng; màn hình tạo/chạy game phải dùng được gần toàn bộ viewport, có điều khiển thu nhỏ/khôi phục mà không tự hủy phiên. Cả workspace nguồn chung và route giảng dạy cũ phải có đường mở game lớn; không sửa DB/bản cài đang dùng, không mở rộng AI hay chức năng buổi nhiều lớp P89.

## Paths

- `web/src/pages/GamesPage.tsx`: biến dải tab dày thành bộ chọn game dạng thẻ, giữ create/host state và mở rộng HostConsole responsive.
- `web/src/pages/TeachingModePage.tsx`: khung game legacy mở toàn màn hình theo mặc định, có nút thu về khung nổi/thu nhỏ, giữ video/slide và checkpoint drag hiện hữu.
- `web/src/features/curriculum/SharedGamePanel.tsx`: game từ bài hiển thị sân khấu toàn viewport, có đường chọn game khác từ thư viện, giữ phiên host khi chuyển về slide.
- `web/src/pages/SharedTeachingPage.tsx`: bảo đảm panel game đã mount không bị hủy khi đổi tab nội dung.
- `tests/browser/login.spec.ts`: Browser regression về chọn game, kích thước/thu nhỏ/khôi phục cho cả route legacy và shared, quyền/lifecycle hiện hữu.
- `scripts/shared-curriculum-api-test.mjs`: REST cases bổ sung nếu điều chỉnh contract game; không đổi API không cần sửa.
- `.DHSYSTEM/ARCHITECTURE.md`, `.DHSYSTEM/TRACKER.md`, `.DHSYSTEM/HANDOFF.json`, `.DHSYSTEM/ROADMAP.md`, `.DHSYSTEM/phases/P88-shared-curriculum/PHASE-STATE.md`, `CHANGELOG.md`, task này: ghi thay đổi và bằng chứng.

## File-Level Plan

1. Đọc luồng game hiện tại, xác định các giới hạn kích thước và việc unmount component khi đổi tab/bài; ghi nhận baseline Browser. Không thay schema/API và không trộn ID môn chung vào session legacy.
2. Cải thiện `GamesPage`: bộ chọn card có mô tả, mục đã chọn nổi bật, nút đổi trò chơi; host console tăng bề rộng theo viewport, chữ/mã phòng đọc được trên màn hình giảng. Các mode và form cũ giữ nguyên.
3. `TeachingModePage`: mở game thành sân khấu lớn mặc định; giáo viên có thể thu về khung nổi hoặc minimize để quay lại nội dung, mở lại không tạo phòng mới. Bảo toàn drag/clamp checkpoint khi ở chế độ khung nổi.
4. `SharedGamePanel`: game nhanh dùng câu hỏi liên kết bài, game khác qua thư viện lớp trong overlay lớn; host tồn tại khi ẩn overlay/chuyển mode. Nút đóng/thu gọn có nhãn rõ; không tự kết thúc game server.
5. Thêm Browser assertions desktop và viewport hẹp, chọn game, mở rộng, chuyển slide rồi trở lại, game session không tạo trùng; giữ hồi quy legacy. Chạy typecheck/lint/build, focused/full E2E, Browser cô lập và React Doctor; cập nhật trạng thái, commit/push/tag.

## Best Practices

- React 19 hooks cleanup đúng; component dưới 300 dòng; không props drilling sâu; responsive mobile/desktop, nút keyboard-accessible/aria-label.
- Không lưu token trong storage hay URL. Không dùng `alert/confirm/prompt` mới; quyền/game state server là nguồn sự thật.
- Tránh unmount host console khi chỉ đổi chế độ hiển thị; minimize không có nghĩa kết thúc game hoặc ghi telemetry lần nữa.
- Giữ các test/socket/route cũ và không tác động file/DB của bản cài.

## Verification

- `npm run typecheck`, `npm run lint`, `npm run build`, `npm run test:focused`, `npm run test:e2e`, `npm run test:browser`, `npx -y react-doctor@latest . --verbose --scope changed --base <start-commit>`, `git diff --check`.
- Acceptance: bộ chọn game dễ bấm và nhìn; game host chiếm viewport khi cần; thu nhỏ/khôi phục giữ cùng session; Browser regression shared + legacy pass; installed app/DB untouched.

## Status

- `done (source only)` — 2026-10-01. Bộ chọn/sân khấu game được cải thiện ở cả hai route; API 22/22, Browser 10/10, focused/full E2E, typecheck/lint/build đạt. React Doctor changed 88/100 (ba cảnh báo heuristic về độ phức tạp component); bản cài/DB đang dùng chưa thay đổi.

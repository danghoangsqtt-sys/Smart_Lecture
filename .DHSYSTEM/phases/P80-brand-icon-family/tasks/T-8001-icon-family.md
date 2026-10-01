# T-8001 — Hiển thị icon SmartLecture trong giao diện

## Objective

Thay cả ba ô chữ `SL` ở trang đăng nhập và thanh bên bằng artwork `docs/icon/Icon_sm.png` mà người dùng đã cung cấp; hiển thị biểu trưng trên thanh đầu trang ở màn hình nhỏ. Giữ nguyên icon Windows/shortcut hiện đã được người dùng xác nhận là có, không tạo artwork hay thay đổi bộ cài trong tác vụ này. Không đụng tích hợp AI/API key. Sau tác vụ quay lại P88/T-8802.

## Paths

- `docs/icon/Icon_sm.png`
- `docs/icon/Icon_sm.ico`
- `web/src/components/BrandIcon.tsx`
- `web/src/components/Layout.tsx`
- `web/src/pages/LoginPage.tsx`
- `tests/browser/login.spec.ts`
- `.DHSYSTEM/phases/P80-brand-icon-family/tasks/T-8001-icon-family.md`
- `.DHSYSTEM/phases/P80-brand-icon-family/PHASE-STATE.md`
- `.DHSYSTEM/phases/P80-brand-icon-family/SPEC.md`
- `.DHSYSTEM/phases/P80-brand-icon-family/SUMMARY.md`
- `.DHSYSTEM/TRACKER.md`
- `.DHSYSTEM/HANDOFF.json`
- `.DHSYSTEM/ROADMAP.md`
- `CHANGELOG.md`

## File-Level Plan

- `BrandIcon.tsx`: import ảnh PNG gốc để Vite đóng gói thành asset có hash; component ảnh dùng chung có alt text, kích thước do nơi dùng quyết định. Không chép file 1,3 MB vào nhiều vị trí.
- `Layout.tsx`: thay khối chữ `SL` ở sidebar bằng ảnh; thêm ảnh ở header mobile vì sidebar bị ẩn ở breakpoint này.
- `LoginPage.tsx`: thay cả logo lớn trên panel giới thiệu lẫn logo nhỏ cạnh tiêu đề form; giữ bố cục và độ tương phản hiện có.
- `login.spec.ts`: khẳng định ảnh hiện/đã tải ở login và trong layout sau đăng nhập, trên desktop/mobile; không còn ô chữ `SL`.
- Task/phase/tracker/handoff/roadmap/changelog và `SUMMARY.md`: ghi ưu tiên người dùng, trạng thái, giới hạn source-only, file đã thay và bước tiếp theo P88. `SPEC.md` đồng bộ mục tiêu P80 với artwork Windows đã có.

## Best Practices

- Dùng đúng artwork người dùng đã cung cấp, không vẽ lại; chỉ tham chiếu ảnh nguồn, giữ mọi asset ngoài ứng dụng hiện có.
- Ảnh phải có `alt` dễ hiểu, tải được offline từ bundle; không phụ thuộc Internet/API AI. Responsive desktop/mobile, không làm vỡ bố cục.
- Không sửa logic đăng nhập hoặc API. Không cập nhật ứng dụng/DB/bộ cài đang cài trước các release gate.

## Verification Commands

- `npm run typecheck`, `npm run lint`, `npm run build` → exit 0; asset PNG xuất hiện trong `web/dist/assets`.
- `npm run test:browser` → các kiểm tra brand và luồng cũ đạt trên DB cô lập.
- `git diff --check`, upstream/no unpushed commits, clean worktree sau commit/push/tag.

## Acceptance Criteria

- Không còn khối chữ `SL` ở đăng nhập, sidebar; icon có mặt khi xem giao diện desktop và mobile.
- Artwork đúng file `docs/icon/Icon_sm.png`, hiển thị và có kích thước tự nhiên >0; alt text đầy đủ.
- Icon shortcut Windows đã có vẫn giữ nguyên; không thêm phụ thuộc AI/API key.
- Browser E2E, typecheck, lint, build đều pass; không chạm bản cài.

## Status

- `done` — 2026-10-01. Typecheck, lint, build, Browser E2E 9/9 đạt; PNG trong bundle trùng ảnh nguồn theo SHA-256. Chỉ hoàn tất trong source, chưa cập nhật bản cài.

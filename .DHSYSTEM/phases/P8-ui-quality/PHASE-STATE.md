# P8 — Chất lượng UI và hiệu năng

- Trạng thái: `verified_local` — code hoàn tất, chờ persistence review/commit
- Bắt đầu: 2026-08-27
- Task hoàn tất: `T-801-react-quality`
- Task hiện tại: `T-802-game-component-architecture` — checkpoint 5 verify hoàn tất
- Baseline React Doctor: 41/100, 2 errors, 64 warnings.

## Mục tiêu batch 1

- Đóng các lỗi accessibility/security có bằng chứng rõ ràng.
- Giảm cảnh báo correctness/performance mà không thay đổi nghiệp vụ.
- Code-split route và thư viện nặng để giảm bundle khởi động.
- Không mở rộng game mới trong batch này.

## Kết quả batch 1

- React Doctor changed-scope: 41/100 với 66 vấn đề → 47/100 với 37 vấn đề.
- React Doctor full-scan: 37/100 với 97 vấn đề khi mở rộng phạm vi → 42/100 với 61 vấn đề.
- Accessibility và security full-scan: 0 cảnh báo.
- Xóa listener `answer:reveal` đăng ký trùng; cleanup Socket hiện hủy timer, `socket.off()` và `socket.disconnect()` đầy đủ.
- Route-level lazy loading giảm entry bundle từ 528.06 kB xuống 209.53 kB (gzip 67.02 kB); SheetJS và các màn hình lớn nằm ở chunk riêng.
- Game dock trong chế độ giảng dạy dùng component React lazy-loaded thay cho iframe cùng origin.
- `npm run typecheck` và Vite production build vào thư mục tạm đều pass.

## Nợ còn lại

- Hai lỗi cleanup trong React Doctor là false-positive: công cụ không nhận diện cleanup tổng quát `socket.off()`; code đã xác minh có cleanup ở cả host và player.
- Refactor lớn còn lại: tách giant components và gom game state theo domain vào reducer.

## Tiến độ T-802

- Typed Socket disposer, lookup `Set`, effect chain, derived state và stable key đã hoàn tất.
- React Doctor không còn error: changed-scope 72/100 với 6 cảnh báo; full-scan 61/100 với 29 cảnh báo.
- Auto-join bằng URL đã sửa lỗi timer tự hủy.
- E2E cô lập pass: REST 82/82, Socket 10/10 và restore restart.
- Player/host đã tách view và realtime lifecycle; chưa mở rộng game mới.

### Checkpoint 2

- Player và host đã chuyển sang reducer có kiểu; loại toàn bộ cảnh báo many-useState/exhaustive-deps trong phạm vi thay đổi.
- React Doctor changed-scope đạt 93/100, còn 4 giant component warning; full-scan đạt 62/100 với 27 cảnh báo.
- E2E sau reducer tiếp tục pass REST 82/82, Socket 10/10 và restore restart.
- Tiếp theo chỉ tách view component; reducer và protocol Socket được xem là baseline đã khóa.

### Checkpoint 3

- `GamePlayPage` giảm còn 226 dòng; `HostConsole` giảm còn 249 dòng nhờ view component và hook lifecycle riêng.
- React Doctor changed-scope đạt 94/100, chỉ còn giant component ở `CreateGameTab` và `SettingsPage`.
- Sửa render câu hỏi trùng trong chế độ Giơ tay; protocol Socket và reducer không đổi.
- E2E tiếp tục pass REST 82/82, Socket 10/10 và restore restart; production build pass với entry 209.69 kB.
- Tiếp theo: tách cấu hình game khỏi `CreateGameTab`, sau đó tách `SettingsPage`.

### Checkpoint 4

- `CreateGameTab` giảm 484 → 234 dòng; cấu hình game được chia theo domain và chỉ còn một luồng Lưu/Tạo có validation tập trung.
- `SettingsPage` giảm 301 → 155 dòng; thẻ hệ thống tuân thủ quyền staff và không còn hướng dẫn restore thủ công lỗi thời.
- React Doctor changed-scope đạt 100/100; full-scan 62/100 với 23 cảnh báo ở `CircuitCanvas`, `ClassDetailPage`, `TeachingModePage` và export cũ.
- Production build giữ entry 209.69 kB; E2E tiếp tục pass REST 82/82, Socket 10/10 và restore restart.
- Tiếp theo: xử lý correctness của `CircuitCanvas`, rồi tách `TeachingModePage` và các domain lớn trong `ClassDetailPage`.

### Checkpoint 5

- `CircuitCanvas` chuyển sang publish theo event và tách editor engine khỏi render; callback truyền qua biên memo ổn định.
- `TeachingModePage` và miền teaching trong `ClassDetailPage` đã tách theo panel; form điểm danh dùng reducer có kiểu.
- Sửa ngày local, stable key, transition theo thuộc tính, helper module-scope, handler-only state và export thừa.
- React Doctor changed-scope/full-scan đạt 100/100, không còn issue trên 42 file.
- Root typecheck, production build (entry 209.78 kB), REST 82/82, Socket 10/10 và restore restart đều pass.
- Cổng code đã hoàn tất; chỉ còn persistence review vì worktree lớn chưa được commit/push tự động.

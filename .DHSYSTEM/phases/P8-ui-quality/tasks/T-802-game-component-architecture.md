# T-802 — Kiến trúc component và state cho game

- Status: `verified_local` — chờ persistence review/commit

## Objective

Giảm độ phức tạp của `GamePlayPage` và `GamesPage` mà không thay đổi giao thức Socket hay luật chơi.

## Scope

- Tách UI/state theo từng game thành component và reducer có kiểu rõ ràng.
- Tạo helper đăng ký Socket trả về disposer theo từng event để cleanup vừa chính xác vừa kiểm thử được.
- Thay array index key bằng khóa ổn định ở các danh sách có thể thay đổi thứ tự.
- Dùng `Set`/`Map` cho lookup lặp lại và gộp các effect phụ thuộc nối chuỗi.
- Tách `ClassDetailPage`, `CircuitCanvas`, `SettingsPage` và `TeachingModePage` theo ranh giới nghiệp vụ sau khi game ổn định.

## Verification

- React Doctor full-scan và changed-scope không còn error thật.
- Typecheck, production build và Socket E2E pass.
- Smoke test host/player cho Quick Quiz, Đua toán, Ô chữ và game mạch điện.

## Checkpoint 1 — Socket và state correctness

- Thêm `createSocketEventScope`: mỗi listener được lưu cùng handler và hủy chính xác bằng `off(event, handler)` khi dispose.
- Chuyển 70 đăng ký Socket của host/player sang event scope; React Doctor không còn hai lỗi cleanup.
- Sửa auto-join bị tự hủy timer do dùng state làm cờ; chuyển sang `autoJoinAttemptedRef`.
- Đổi lookup lặp trong Bingo/Memory từ `Array.includes` sang `Set.has`.
- Bỏ effect chain khi khởi tạo lớp/game, bỏ derived class state và gắn stable key cho draft, player, bảng điểm, câu hỏi, chat.
- React Doctor changed-scope: 47/100 với 37 vấn đề → 72/100 với 6 cảnh báo kiến trúc.
- React Doctor full-scan: 42/100 với 61 vấn đề → 61/100 với 29 cảnh báo; không còn error.
- Verify: root typecheck pass; production build pass; REST 82/82; Socket 10/10; restore restart pass.

## Remaining

- Tiếp tục `CircuitCanvas`, `ClassDetailPage` và `TeachingModePage` theo cảnh báo full-scan có bằng chứng.
- Dọn export không sử dụng sau khi xác minh không còn consumer ngoài workspace.

## Checkpoint 2 — Reducer player/host

- Thêm hook generic `useFieldReducer` với cập nhật field có kiểu và hỗ trợ functional update như `useState`.
- `GamePlayPage` dùng một `PlayerGameState`; `HostConsole` dùng một `HostConsoleState`, thay toàn bộ cụm `useState` liên quan.
- Loại state không được render (`leaderboardRows`, `raceEndsAt`) và listener chỉ phục vụ state chết.
- Khai báo `setField` ổn định trong dependency list; React Doctor không còn `prefer-useReducer` hoặc exhaustive-deps warning.
- React Doctor changed-scope: 93/100, chỉ còn 4 cảnh báo giant component.
- React Doctor full-scan: 62/100 với 27 cảnh báo, không có error.
- Verify: root typecheck pass; production build pass; REST 82/82; Socket 10/10; restore restart pass.

## Checkpoint 3 — View player/host và lifecycle realtime

- Tách toàn bộ màn chơi player thành các view độc lập: kết quả, giơ tay, ô chữ, đua toán, Bingo, lật thẻ, xếp chữ, Quiz Show, mạch điện, kéo co, câu hỏi chuẩn và màn chờ.
- Đưa đăng ký/cleanup Socket player vào `usePlayerSocketEvents`; `GamePlayPage` giảm từ 586 xuống 226 dòng.
- Tách sáu màn sandbox host vào `HostSandboxViews` và đưa QR/timer/Socket lifecycle vào `useHostConsoleEffects`; `HostConsole` còn 249 dòng.
- Sửa luồng render trùng: câu hỏi chuẩn chỉ hiển thị cho Quick Quiz/Kéo co, không còn lặp bên dưới màn Giơ tay.
- React Doctor changed-scope đạt 94/100; cảnh báo giant component của `GamePlayPage` và `HostConsole` đã hết, chỉ còn `CreateGameTab` và `SettingsPage`.
- Verify: web typecheck pass; production build tạm pass, entry 209.69 kB; REST 82/82; Socket 10/10; restore restart pass.

## Checkpoint 4 — Cấu hình game và trang cài đặt

- `CreateGameTab` giảm từ 484 xuống 234 dòng; tách danh sách câu hỏi, trình thiết kế Ô chữ, ngữ cảnh lớp–môn–chương, cấu hình mode, thử thách mạch và modal canvas.
- Hợp nhất lớp học về một selector; xóa cặp nút Lưu/Tạo trùng của Ô chữ và áp dụng một điều kiện submit chung, không còn đường vòng bỏ qua validation Ô chữ.
- `SettingsPage` giảm từ 301 xuống 155 dòng; tách Gemini key/quota, AI provider, system/tunnel/backup và giới thiệu.
- Học viên không còn thấy thẻ `/system/info` tải vô hạn khi API này bị chặn quyền; hướng dẫn restore thủ công lỗi thời được thay bằng luồng quản trị an toàn.
- React Doctor changed-scope đạt 100/100, không còn issue. Full-scan đạt 62/100 với 23 cảnh báo còn lại ở phạm vi chưa refactor.
- Verify: web typecheck pass; production build pass, entry 209.69 kB; REST 82/82; Socket 10/10; restore restart pass.

## Checkpoint 5 — Implementation contract

### Objective and expected outcome

- Loại cảnh báo correctness/performance có bằng chứng trong `CircuitCanvas`, sau đó tách các component lớn còn lại mà không đổi hành vi nghiệp vụ.
- React Doctor full-scan không còn bug warning; changed-scope tiếp tục sạch; typecheck, build và E2E giữ baseline.

### Paths

- `web/src/components/CircuitCanvas.tsx`
- `web/src/pages/TeachingModePage.tsx`
- `web/src/pages/ClassDetailPage.tsx`
- `web/src/pages/SchedulePage.tsx`
- `web/src/components/Layout.tsx`
- `web/src/components/ui.tsx`
- `web/src/lib/dateUtils.ts`
- `web/src/stores/toastStore.ts`
- `.gitignore`
- `README.md`
- `.DHSYSTEM/phases/P8-ui-quality/tasks/T-802-game-component-architecture.md`
- `.DHSYSTEM/phases/P8-ui-quality/PHASE-STATE.md`
- `.DHSYSTEM/TRACKER.md`
- `.DHSYSTEM/HANDOFF.json`
- `.DHSYSTEM/ROADMAP.md`
- `CHANGELOG.md`

### File-level plan

- `CircuitCanvas.tsx`: thay callback-effect bằng cập nhật sự kiện có kiểm soát, ổn định props cho component memo và tách toolbar/panel khỏi canvas engine.
- `TeachingModePage.tsx`: đưa helper thuần ra module scope và tách các panel nghiệp vụ.
- `ClassDetailPage.tsx`: sửa stable key/transition/state handler trước, sau đó tách theo tab/domain ở ranh giới ít rủi ro.
- `SchedulePage.tsx`: đưa helper thuần ra module scope.
- Các export cũ: chỉ bỏ `export` khi `rg` xác minh không có consumer trong workspace; không xóa implementation đang dùng nội bộ.
- Tài liệu DHSYSTEM/CHANGELOG/ROADMAP: cập nhật sau mỗi checkpoint đã verify.
- `.gitignore`: loại PID runtime của dev server khỏi phạm vi persistence nhưng không dừng tiến trình đang chạy.
- `README.md`: đồng bộ lệnh E2E, số lượng kiểm tra và trạng thái chất lượng của milestone trước khi persistence.

### Best practices

- Giữ callback và object identity ổn định tại biên memo; không đồng bộ live state qua effect nếu event mutation có thể phát thay đổi trực tiếp.
- Không thay đổi payload Socket/API, schema dữ liệu mạch hoặc luật game.
- Tách component theo domain, ưu tiên props có kiểu và helper thuần ở module scope.
- Chỉ sửa cảnh báo full-scan sau khi đọc code và xác nhận tác động thật.

### Verification

- `npm run typecheck`
- `npx -y react-doctor@latest . --verbose --scope changed`
- `npx -y react-doctor@latest . --verbose`
- Vite production build vào thư mục tạm ngoài workspace
- `npm run test:e2e` → REST 82/82, Socket 10/10, restore restart PASS

## Checkpoint 5 — Circuit, teaching và full-scan sạch

- `CircuitCanvas` phát dữ liệu trực tiếp theo mutation thay cho effect callback, commit kéo-thả ở pointer-up và dùng callback ổn định cho wire memo.
- Tách engine state của mạch khỏi component render; palette và workspace có ranh giới props rõ ràng, không đổi schema mạch hoặc luật mô phỏng.
- `TeachingModePage` tách header, sidebar chương trình, viewer, controls và game dock; ngày mặc định dùng ngày local thay vì UTC.
- `ClassDetailPage` tách selector, media intake, plan sidebar và item panel; form điểm danh chuyển sang reducer có kiểu.
- Sửa stable key, animation theo thuộc tính, helper module-scope, state chỉ dùng trong handler và xóa export đã xác minh không có consumer.
- React Doctor changed-scope và full-scan đều đạt 100/100, 0 issue trên 42 file.
- Verify: root typecheck pass; Vite production build pass, entry 209.78 kB; REST 82/82; Socket 10/10; restore restart pass; `git diff --check` pass.
- Persistence gate chưa đóng: worktree chứa khối thay đổi lớn từ nhiều checkpoint nên không tự commit/push khi chưa được người dùng duyệt phạm vi.

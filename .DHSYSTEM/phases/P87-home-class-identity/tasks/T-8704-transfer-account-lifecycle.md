# T-8704 — Chuyển lớp và xử lý vòng đời tài khoản học viên

## Objective

Cho phép admin hoặc giảng viên tạo học viên chuyển học viên sang lớp hợp lệ, giữ nguyên ID và dữ liệu điểm danh/điểm/game của lớp cũ. Khi xử lý tài khoản tạo sai, chỉ xóa hẳn học viên chưa có dữ liệu học tập; còn lại lưu trữ, khóa và thu hồi phiên. Không ghi vào DB bản cài trong task này.

## Paths

- `server/src/services/studentAccountLifecycle.ts`
- `server/src/db/connection.ts`
- `server/src/db/schema.sql`
- `server/src/routes/users.routes.ts`
- `server/src/routes/classes.routes.ts`
- `server/src/routes/attendance.routes.ts`
- `server/src/routes/grades.routes.ts`
- `server/src/realtime/gameRoom.ts`
- `web/src/pages/UsersPage.tsx`
- `web/src/components/StudentLifecycleModal.tsx`
- `scripts/roster-lifecycle-test.mjs`
- `package.json`
- `.DHSYSTEM/ARCHITECTURE.md`
- `.DHSYSTEM/phases/P87-home-class-identity/PHASE-STATE.md`
- `.DHSYSTEM/phases/P87-home-class-identity/SUMMARY.md`
- `.DHSYSTEM/TRACKER.md`
- `.DHSYSTEM/HANDOFF.json`
- `.DHSYSTEM/ROADMAP.md`
- `CHANGELOG.md`

## File-Level Plan

- `studentAccountLifecycle.ts`: giao dịch `BEGIN IMMEDIATE` cho transfer/delete/archive; xác thực quyền theo `created_by`, lớp đích đang hoạt động và thuộc giảng viên; không sửa dữ liệu lịch sử; kiểm kê FK tham chiếu học viên để xóa chỉ khi còn enrollment/history, còn lại archive. Không xóa group membership hay learning data khi chuyển.
- `connection.ts`, `schema.sql`: migration v28 `users.archived_at` nullable, không tự lưu trữ/xóa dữ liệu cũ; schema tươi tương thích.
- `users.routes.ts`: API preview, transfer, delete/archive và hiển thị tài khoản lưu trữ khi được yêu cầu; siết quyền giảng viên xử lý tài khoản do họ tạo. Không cho mở khóa tài khoản lưu trữ; no-store cho preview/lifecycle.
- `classes.routes.ts`, `attendance.routes.ts`, `grades.routes.ts`: không đưa tài khoản đã lưu trữ vào danh sách học viên đang hoạt động; vẫn giữ bản ghi lịch sử, gồm export/sổ điểm của lớp cũ. Chặn xóa lớp đã có lịch sử để tránh FK cascade sau chuyển lớp. Enrollment vẫn giữ cho tài khoản lưu trữ để không phá ràng buộc một lớp.
- `gameRoom.ts`: ngắt các socket hiện có của học viên sau khi tài khoản bị xóa/lưu trữ/khóa.
- `UsersPage.tsx`, `StudentLifecycleModal.tsx`: thao tác chuyển lớp và xử lý tài khoản, preview xóa/lưu trữ rõ hậu quả trước xác nhận; xem tài khoản lưu trữ khi cần.
- `roster-lifecycle-test.mjs`, `package.json`: fixture DB cô lập kiểm tra quyền, rollback, lịch sử lớp, không mất điểm danh/điểm, xóa/lưu trữ, token HTTP và Socket revocation; thêm focused gate.
- Tài liệu kiến trúc/trạng thái/changelog: cập nhật API, migration, bằng chứng test và giới hạn release.

## Best Practices

- Zod ở biên API, SQL prepared, transaction nguyên tử và kiểm tra lại trạng thái bên trong transaction. Không ghép input vào SQL; tên bảng từ `PRAGMA` phải đối chiếu allowlist định danh nội bộ.
- Luôn từ chối dữ liệu legacy đa lớp/mồ côi, không tự đoán nguồn; giữ attendance/grades/game của lớp cũ. Preview chỉ đọc và có thể lỗi thời; confirm kiểm tra lại.
- Giảng viên chỉ tài khoản do mình tạo và lớp mình quản lý; admin toàn cục. Lưu trữ phải khóa, tăng `session_version` và ngắt socket đang mở. Không tái sử dụng username/mã của tài khoản lưu trữ.
- UI tiếng Việt, dùng modal/toast sẵn có, không `confirm()`; tests chỉ dùng `mkdtemp` có kiểm tra đường dẫn trước cleanup.

## Verification Commands

- `npm run test:roster-lifecycle` → transfer/delete/archive/auth/history PASS.
- `npm run typecheck`, `npm run lint`, `npm run build`, `npm run test:focused`, `npm run test:e2e`, `npm run test:browser` → exit 0.
- `npx -y react-doctor@latest . --verbose --diff` → không có lỗi mới.
- `git diff --check`; git persistence sạch, upstream và không có commit chưa push.

## Acceptance Criteria

- Chuyển lớp nguyên tử chỉ giữa hai lớp hợp lệ; lớp đích của giảng viên, học viên do giảng viên tạo; admin có thể xử lý mọi lớp. Lịch sử đóng lớp cũ/mở lớp mới, dữ liệu học tập cũ không bị chuyển/xóa.
- Không cho xóa hẳn khi học viên có dữ liệu học tập; tài khoản lưu trữ vẫn giữ ID/username/mã/lịch sử nhưng không còn đăng nhập hoặc vào danh sách lớp hoạt động. Tài khoản không có dữ liệu học tập có thể xóa thật và mất enrollment/history kèm theo.
- Lớp cũ có lịch sử học viên/điểm danh/điểm không được xóa cascade sau khi học viên đã chuyển đi; cho phép lưu trữ lớp.
- Token HTTP cũ và socket đã mở bị thu hồi khi khóa/lưu trữ/xóa; không cho mở khóa tài khoản lưu trữ bằng endpoint khóa thông thường.
- UI cho biết rõ chế độ xóa/lưu trữ trước xác nhận và có thao tác chuyển lớp; test/DB bản cài không bị thay đổi.

## Status

- `done` — 2026-10-01; lifecycle fixture 17/17, typecheck/lint/build, focused, full E2E, Browser 9/9, React Doctor 100. Chỉ thay source và fixture tạm, không nâng cấp DB/bộ cài.

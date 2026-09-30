# T-8702 — Tạo học viên nguyên tử và hợp nhất mọi đường ghi

## Objective

Mọi đường tạo học viên (Users API, Auth API cũ, JSON import, import từ trang lớp, form Người dùng) phải yêu cầu mã học viên duy nhất và đúng một lớp biên chế ngay lúc tạo. Username học viên được lưu chữ thường; username mọi vai trò không trùng khi khác hoa/thường. Tạo user + enrollment + lịch sử lớp trong một transaction để lỗi không để lại tài khoản mồ côi. Giữ luồng tạo giáo viên, không sửa dữ liệu cũ hoặc DB bản cài.

## Paths

- `server/src/services/studentAccounts.ts`
- `package.json`
- `server/src/db/connection.ts`
- `server/src/routes/users.routes.ts`
- `server/src/routes/auth.routes.ts`
- `server/src/routes/classes.routes.ts`
- `web/src/pages/UsersPage.tsx`
- `scripts/roster-account-test.mjs`
- `scripts/temporary-credentials-test.mjs`
- `scripts/e2e-smoke.ps1`
- `scripts/e2e-excel-regression.mjs`
- `scripts/curriculum-upload-security-test.mjs`
- `scripts/socket-test.mjs`
- `scripts/game-lifecycle-test.mjs`
- `scripts/circuit-restart-test.mjs`
- `scripts/lan-benchmark.mjs`
- `scripts/seed-demo-tour.mjs`
- `scripts/seed-bulk-users.mjs`
- `tests/browser/login.spec.ts`
- `.DHSYSTEM/ARCHITECTURE.md`
- `.DHSYSTEM/phases/P87-home-class-identity/PHASE-STATE.md`
- `.DHSYSTEM/TRACKER.md`
- `.DHSYSTEM/HANDOFF.json`
- `.DHSYSTEM/ROADMAP.md`
- `CHANGELOG.md`

## File-Level Plan

- `server/src/services/studentAccounts.ts`: service duy nhất kiểm tra mã/username/lớp và quyền sở hữu lớp; tạo tài khoản, ghi danh và lịch sử trong transaction; trả lỗi 400/403/404/409 rõ ràng, bắt race SQLite thành 409. Không log mật khẩu.
- `server/src/db/connection.ts`: chỉ thêm helper giao dịch/tra cứu nếu cần; không tự di trú/ghi DB bản cài.
- `server/src/routes/users.routes.ts`: POST đơn lẻ yêu cầu `studentCode` + `classId` khi role student; JSON import mỗi dòng chứa hai trường; teacher vẫn tạo teacher theo quyền admin; cập nhật hồ sơ không thể xóa mã hoặc trùng mã.
- `server/src/routes/auth.routes.ts`: đường cũ `/auth/users` dùng cùng service, không còn bypass; luồng teacher giữ như trước.
- `server/src/routes/classes.routes.ts`: import-students dùng service với class ID của URL, yêu cầu mã; enrollment chỉ cho học viên chưa có lớp và có mã; ngăn xóa enrollment/lớp gây học viên mồ côi cho tới API chuyển lớp T-8704.
- `web/src/pages/UsersPage.tsx`: form tối thiểu thêm chọn lớp và mã bắt buộc cho học viên; ẩn với giáo viên. T-8703 mới làm UX/import Excel đầy đủ.
- `scripts/roster-account-test.mjs`: REST fixture kiểm tra quyền, mã/username trùng không phân biệt hoa thường, tài khoản chữ thường, lớp sai/khác GV, atomic rollback, import từng dòng, không ghi danh hai lớp.
- `scripts/temporary-credentials-test.mjs` và các script E2E/seed liệt kê: cập nhật payload test tạo học viên theo contract mới, không đổi kỳ vọng mật khẩu tạm/phiên đăng nhập. Dữ liệu test chỉ trong DB cô lập.
- `ARCHITECTURE.md`, phase/tracker/handoff/roadmap/changelog: ghi API contract, trạng thái task và giới hạn còn lại của T-8703/T-8704.

## Best Practices

- Zod tại biên route; prepared SQL, `BEGIN`/rollback nguyên tử; không phỏng đoán mã hoặc lớp cũ.
- Mã học viên sau trim phải không rỗng, username ASCII theo validation hiện có và lưu lowercase; unique case-insensitive ở DB v27. Dùng ID lớp, không tên lớp nhập tự do.
- Admin được tạo học viên vào lớp bất kỳ; giáo viên chỉ lớp của mình và chỉ xử lý học viên do mình tạo. Không đưa hash/token ra response; mật khẩu tạm chỉ trả một lần và `no-store`.
- Không tự chuyển lớp khi phát hiện tài khoản đã có lớp; báo xung đột. Không phát hành bộ cài/nâng cấp DB bản cài ở task này.

## Verification Commands

- `node scripts/roster-account-test.mjs` → PASS các trường hợp thành công/lỗi/rollback.
- `npm run test:roster-preflight`, `node scripts/roster-migration-test.mjs` → PASS.
- `npm run typecheck`, `npm run lint`, `npm run build`, `npm run test:focused`, `npm run test:e2e`, `npm run test:browser` → exit 0 (điều chỉnh fixture cho API contract mới).
- `git diff --check`, git persistence `origin/main` sạch và không còn commit chưa push.

## Acceptance Criteria

- Không endpoint nào tạo học viên thiếu mã/thiếu lớp; tạo thất bại không để lại user/enrollment/history; username trùng chỉ khác hoa/thường bị từ chối.
- Giáo viên không thể tạo học viên vào lớp giáo viên khác; admin có quyền trên lớp bất kỳ. Người dùng có thể tạo học viên đúng mã/lớp từ form hiện tại.
- Import JSON và import lớp không tạo tài khoản thứ hai hoặc tự chuyển lớp; lỗi từng dòng rõ ràng, không phá tài khoản/mật khẩu đã có.
- Trường hợp dữ liệu legacy xung đột vẫn khởi động; các writer mới không làm xung đột xấu thêm.

## Status

- `done` — 2026-09-30; contract test 8/8, preflight 5/5, migration 4/4, typecheck/lint/build, focused, full E2E, Browser 7/7 và React Doctor 100/100. DB bản cài không được thay đổi.

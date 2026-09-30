# P87 — Danh tính học viên và lớp biên chế: hoàn thành source 2026-10-01

## Outcome

- T-8700: xóa đúng ba học viên thử được người dùng xác nhận sau backup; DB cài đặt còn một admin và một lớp, không tạo fixture mới trong bản cài.
- T-8701: migration v27/lịch sử lớp và cổng ràng buộc an toàn cho dữ liệu legacy; rehearsal trên bản sao DB.
- T-8702: mọi writer tạo học viên yêu cầu mã riêng/một lớp, username chữ thường, transaction nguyên tử; không cho bỏ ghi danh gây mồ côi.
- T-8703: Excel/CSV dùng chung giữa Người dùng và Lớp, preview từng dòng và import idempotent.
- T-8704: transfer nguyên tử, giữ điểm danh/điểm/game lớp cũ, chặn xóa lớp có lịch sử, xóa tài khoản trống hoặc lưu trữ tài khoản có tham chiếu; thu hồi HTTP và Socket.IO đang mở. Migration v28 thêm `archived_at`.

## Verification

- Lifecycle fixture 17/17; roster account 8/8; Excel 8/8; migration/preflight fixtures đạt.
- `npm run typecheck`, `npm run lint`, `npm run build`, `npm run test:focused`, `npm run test:e2e`, `npm run test:browser` đều PASS; Browser 9/9, full E2E smoke 87/87, Socket 10/10, game 11/11, API 26/26. React Doctor 100/100.
- Toàn bộ kiểm thử lập trình dùng DB cô lập; bản cài v0.11.0 và DB của nó chưa nhận v27/v28. P78–P82 và P90 rehearsal/release vẫn là cổng phát hành, nên không tăng phiên bản app/bộ cài ở phase này.

## Created files

| File | Task |
|---|---|
| `.DHSYSTEM/phases/P87-home-class-identity/tasks/T-8700-remove-test-students.md` | T-8700 |
| `.DHSYSTEM/phases/P87-home-class-identity/tasks/T-8702-atomic-student-creation.md` | T-8702 |
| `.DHSYSTEM/phases/P87-home-class-identity/tasks/T-8703-users-excel-single-class-ui.md` | T-8703 |
| `.DHSYSTEM/phases/P87-home-class-identity/tasks/T-8704-transfer-account-lifecycle.md` | T-8704 |
| `.DHSYSTEM/phases/P87-home-class-identity/SUMMARY.md` | T-8704 |
| `scripts/cleanup-test-students.mjs` | T-8700 |
| `scripts/cleanup-test-students.test.mjs` | T-8700 |
| `scripts/roster-account-test.mjs` | T-8702 |
| `scripts/roster-excel-test.mjs` | T-8703 |
| `scripts/roster-lifecycle-test.mjs` | T-8704 |
| `scripts/roster-migration-test.mjs` | T-8701 |
| `server/src/services/studentAccounts.ts` | T-8702 |
| `server/src/services/studentRosterImport.ts` | T-8703 |
| `server/src/services/studentAccountLifecycle.ts` | T-8704 |
| `web/src/components/StudentImportModal.tsx` | T-8703 |
| `web/src/components/StudentLifecycleModal.tsx` | T-8704 |

## Modified files

| File | Task(s) |
|---|---|
| `.DHSYSTEM/ARCHITECTURE.md` | T-8701–T-8704 |
| `.DHSYSTEM/HANDOFF.json` | T-8700–T-8704 |
| `.DHSYSTEM/ROADMAP.md` | T-8700–T-8704 |
| `.DHSYSTEM/TRACKER.md` | T-8700–T-8704 |
| `.DHSYSTEM/phases/P87-home-class-identity/PHASE-STATE.md` | T-8700–T-8704 |
| `.DHSYSTEM/phases/P87-home-class-identity/SPEC.md` | T-8700 |
| `.DHSYSTEM/phases/P87-home-class-identity/tasks/T-8701-staged-roster-schema.md` | T-8701 |
| `CHANGELOG.md` | T-8700–T-8704 |
| `package.json` | T-8700–T-8704 |
| `scripts/circuit-restart-test.mjs` | T-8702 |
| `scripts/curriculum-upload-security-test.mjs` | T-8702 |
| `scripts/e2e-excel-regression.mjs` | T-8702–T-8703 |
| `scripts/e2e-smoke.ps1` | T-8702 |
| `scripts/game-lifecycle-test.mjs` | T-8702 |
| `scripts/lan-benchmark.mjs` | T-8702 |
| `scripts/seed-demo-tour.mjs` | T-8702 |
| `scripts/socket-test.mjs` | T-8702 |
| `scripts/temporary-credentials-test.mjs` | T-8702 |
| `server/src/db/connection.ts` | T-8701, T-8704 |
| `server/src/db/schema.sql` | T-8701, T-8704 |
| `server/src/realtime/gameRoom.ts` | T-8704 |
| `server/src/routes/attendance.routes.ts` | T-8704 |
| `server/src/routes/auth.routes.ts` | T-8702 |
| `server/src/routes/classes.routes.ts` | T-8702–T-8704 |
| `server/src/routes/grades.routes.ts` | T-8704 |
| `server/src/routes/users.routes.ts` | T-8702–T-8704 |
| `tests/browser/login.spec.ts` | T-8702–T-8704 |
| `web/src/features/class-detail/StudentsTab.tsx` | T-8703 |
| `web/src/pages/UsersPage.tsx` | T-8702–T-8704 |
| `web/src/types.ts` | T-8703 |

## Deleted files

Không có file source nào bị xóa trong phase này. Ba bản ghi học viên thử được dọn trong DB bản cài ở T-8700 có backup riêng và đã được người dùng xác nhận.

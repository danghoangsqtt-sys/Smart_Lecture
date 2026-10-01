# T-8901 — Vòng đời phiên dạy nhiều lớp trên chương trình chung

## Objective

Một giáo viên bắt đầu, đọc, tiếp tục và kết thúc đúng một phiên dạy cho 1–4 lớp cùng môn/bài trong kho chung. Danh sách lớp đóng băng lúc bắt đầu; không tạo bản sao học liệu hay nhiều nhật ký. Từ chối lớp trùng/không được phân công/không thuộc quyền, bài sai môn và phiên đang mở xung đột. Giữ API và dữ liệu buổi dạy legacy hoạt động; chưa triển khai điểm danh/game/kết quả đa lớp (T-8902) hay UI (T-8903).

## Paths and file-level plan

1. `server/src/db/migrations/031-shared-teaching-session.ts`, `server/src/db/connection.ts`: migration cộng thêm hai FK môn/bài chung trên `teaching_logs`, index tra cứu; tái dùng `teaching_log_classes` v26, không backfill/xóa legacy. Migration transaction/idempotent trên DB cô lập.
2. `server/src/routes/sharedTeachingSessions.routes.ts`, `server/src/index.ts`: endpoint start/active/detail/end với zod, quyền toàn bộ lớp, membership bất biến, một dòng log, transaction chống xung đột; session cũ được tính là một lớp khi tìm active. Một payload trùng chính xác mới được resume, payload khác trả 409.
3. `server/src/routes/teachingLogs.routes.ts`: đường tạo log cũ phải nhận biết lớp đang trong phiên nhóm; không resume nhầm hoặc sửa/xóa phiên mới qua API legacy. Không thay report cũ trong task này.
4. `server/src/routes/classes.routes.ts`, `server/src/routes/sharedCurriculum.routes.ts` nếu cần: ngăn xóa/gỡ quan hệ đang được phiên dạy dùng, báo 409 rõ thay vì lỗi FK/cascade.
5. `scripts/shared-teaching-lifecycle-test.mjs`, `package.json`: REST fixture DB cô lập kiểm 1/2/4 lớp, quyền, bài/môn, duplicate, active conflict, retry, kết thúc, legacy isolation, FK/integrity.
6. `.DHSYSTEM/ARCHITECTURE.md`, `.DHSYSTEM/TRACKER.md`, `PHASE-STATE.md`, `.DHSYSTEM/HANDOFF.json`, `CHANGELOG.md`: cập nhật hợp đồng và bằng chứng sau verify.

## Best practices and gates

- Prepared statements, `crypto.randomUUID`, transaction cho log+members; không tự gộp học viên, không sửa DB bản cài, không trộn ID môn/bài mới vào cột FK legacy.
- Chỉ giáo viên quản lý mọi lớp hoặc admin được tạo/kết thúc; lớp phải đã gắn cùng môn, bài thuộc môn. Kế thừa semantics một lớp legacy, nhưng không tự resume một phiên khác nội dung.
- Preflight: Node/Express/SQLite/TypeScript stack hiện có; đối chiếu `SYSTEM-RULES.md`, API/DB architecture trước code. Không thêm dependency.
- Verify: focused fixture, `npm run typecheck`, `npm run lint`, `npm run build`, focused/full E2E, `git diff --check`. Nếu không đạt, giữ `doing`, không gắn done tag.

## Status

- `done (source only)` — 2026-10-01. Migration v31 và REST lifecycle đạt 14/14 trên DB cô lập; migration v28→v31 đạt 12/12 có preservation log cũ, rollback/retry/idempotency. `npm run typecheck`, `npm run lint`, `npm run build`, `npm run test:focused`, `npm run test:e2e`, `git diff --check` đạt. Không sửa React hoặc DB/bản cài; T-8902..04 còn chờ.

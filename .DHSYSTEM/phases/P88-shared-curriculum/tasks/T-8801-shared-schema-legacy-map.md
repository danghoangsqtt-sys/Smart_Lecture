# T-8801 — Schema kho môn/bài dùng chung và mapping dữ liệu cũ

## Objective

Thêm schema độc lập lớp cho môn, bài, học liệu, câu hỏi liên kết và phân công lớp–môn/tiến độ; tạo bản đồ ID nguồn cũ→ID mới cho các quan hệ xác định rõ qua khóa ngoại. Mỗi `subjects.id` cũ tạo một môn mới riêng (không gộp theo tên). Bài/tài liệu/giáo án thiếu FK rõ ràng được giữ nguyên và báo cần xử lý; tuyệt đối không sửa/xóa dữ liệu legacy hay file media. T-8801 chỉ chuẩn bị schema/mapping, chưa mở API/UI dùng nguồn mới.

## Paths

- `server/src/db/schema.sql`
- `server/src/db/connection.ts`
- `server/src/db/migrations/029-shared-curriculum.ts`
- `scripts/shared-curriculum-migration-test.mjs`
- `scripts/auth-session-revocation-test.mjs`
- `package.json`
- `.DHSYSTEM/ARCHITECTURE.md`
- `.DHSYSTEM/phases/P88-shared-curriculum/SPEC.md`
- `.DHSYSTEM/phases/P88-shared-curriculum/PHASE-STATE.md`
- `.DHSYSTEM/phases/P88-shared-curriculum/tasks/T-8801-shared-schema-legacy-map.md`
- `.DHSYSTEM/TRACKER.md`
- `.DHSYSTEM/HANDOFF.json`
- `.DHSYSTEM/ROADMAP.md`
- `CHANGELOG.md`

## File-Level Plan

- `schema.sql`: bảng chuẩn `shared_subjects`, `shared_lessons`, `shared_lesson_materials`, `shared_lesson_questions`, `class_subject_assignments`, `class_lesson_progress`; cột riêng/index cho khóa lọc. `shared_curriculum_legacy_map` ghi cặp nguồn/đích theo ID; `shared_curriculum_mapping_issues` ghi lý do chưa thể map. Không thay bảng legacy.
- `029-shared-curriculum.ts`: migration v29 chạy trong transaction sẵn có; mỗi legacy subject tạo một shared subject và assignment cho lớp cũ. Lecture chỉ chuyển khi `subject_id` có thật và cùng lớp; material chỉ map khi lecture đã map. Tệp lưu `pending_copy` không trỏ `file_path` legacy; link URL có thể ready. Plan map tới assignment nếu subject rõ; curriculum item map tới bài nếu có lecture rõ; lesson plan map theo item rõ. Trường hợp thiếu/mâu thuẫn ghi issue, không suy đoán theo tên/chapter. Bản ghi câu hỏi ngân hàng giữ nguyên, chưa tự liên kết bài dựa vào chuỗi `lesson`.
- `connection.ts`: đăng ký migration v29, không chạy tooling trực tiếp lên DB cài đặt.
- `shared-curriculum-migration-test.mjs`: DB tạm tiền v29, môn trùng tên khác ID, môn–bài–file/link, plan/item rõ và mơ hồ; so sánh sentinel legacy, FK/integrity, chạy lại không nhân bản, trigger failure rollback rồi retry.
- `auth-session-revocation-test.mjs`: fixture v24 có đủ bảng curriculum của v24 và luôn đóng DB trước khi dọn thư mục tạm, để test nâng cấp phiên xác thực không che lỗi migration.
- `package.json`: thêm test migration vào focused gate.
- `ARCHITECTURE.md`, phase/tracker/handoff/roadmap/changelog: ghi schema, quy tắc mapping, trạng thái task và giới hạn media/release.

## Best Practices

- SQLite prepared statements, transaction/rollback; chỉ UUID mới cho entity mới, giữ ID nguồn trong mapping; không SQL từ input người dùng. DDL `IF NOT EXISTS`, index unique và FK chỉ ở bảng mới.
- Không gộp theo tên; không tạo quan hệ bài/câu hỏi bằng suy đoán văn bản. Media file chưa được sao chép thì `pending_copy`, không công bố truy cập từ schema mới.
- Legacy APIs/DB records không đổi; migration an toàn trên bản sao/fixture, có test rollback/retry/idempotency và `foreign_key_check`.
- Nghiệp vụ UI/API mới thuộc T-8802/T-8803; không nâng version/bộ cài trước P90.

## Verification Commands

- `npm run build -w server`, `npm run test:shared-curriculum-migration` → fixture PASS.
- `npm run typecheck`, `npm run lint`, `npm run build`, `npm run test:focused`, `npm run test:e2e` → exit 0.
- `git diff --check`, clean working tree/upstream/no unpushed commits after commit/push.

## Acceptance Criteria

- Schema hỗ trợ môn/bài/học liệu chung, một lớp–nhiều môn/một môn–nhiều lớp, tiến độ riêng theo assignment. Bài và câu hỏi liên kết bằng ID; không nhân bản theo lớp.
- Hai legacy subject cùng tên vẫn thành hai shared subject riêng; mapping subject/lecture/material/plan/item/lesson plan theo FK rõ, không đổi record/ID nguồn.
- Thiếu hoặc mâu thuẫn FK được đánh dấu issue và không tạo liên kết sai; file legacy chưa copy không bị dùng như asset shared ready.
- Migration rollback/retry/idempotent; FK/integrity và số lượng bản ghi legacy trước/sau không đổi trên fixture. Không chạm DB bản cài.

## Status

- `done` — 2026-10-01. Migration fixture 11/11, focused và full E2E đạt; typecheck/lint/build đạt. Chỉ hoàn tất trong source, chưa nâng cấp DB/bộ cài.

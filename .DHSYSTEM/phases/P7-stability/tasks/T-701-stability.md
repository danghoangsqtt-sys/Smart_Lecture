# T-701 — Ổn định API, dữ liệu, game và kiểm thử

## Objective

Khóa các lỗi nền tảng trước khi mở rộng game/UI: endpoint không trùng quyền sở hữu, middleware không rò sang router khác, lỗi Zod là 400, backup Windows an toàn, game kiểm tra enrollment/host, dữ liệu câu hỏi giữ đủ ngữ cảnh và E2E không đụng DB vận hành.

## Paths

- `server/src/index.ts`
- `server/src/config.ts`
- `server/src/db/connection.ts`
- `server/src/utils/errors.ts`
- `server/src/routes/{classes,subjects,questions,questionBank,system,backup,schedule,mediaAudit}.routes.ts`
- `server/src/services/backup.ts`
- `server/src/realtime/gameRoom.ts`
- `web/src/pages/QuestionsPage.tsx`
- `scripts/e2e-smoke.ps1`
- `scripts/e2e-isolated.mjs`
- `.github/workflows/ci.yml`
- `package.json`
- `.DHSYSTEM/{ARCHITECTURE,TRACKER,HANDOFF.json}`

## File-Level Plan

1. Xác định một router chuẩn cho subject, question và system backup; bỏ mount router trùng.
2. Giới hạn middleware quyền theo đúng prefix; chuẩn hóa `ZodError`/JSON sai thành HTTP 400.
3. Dùng API filesystem/JSZip đa nền tảng; validate tên backup; stage restore và chỉ áp dụng khi khởi động lại; restore/delete admin-only.
4. Thêm enrollment gate khi join và helper xác thực host cho mọi Socket event điều khiển phòng.
5. Sửa phép toán dùng cùng toán hạng, ngày lặp theo local date và truy vấn media theo quan hệ lecture → class → teacher.
6. Truyền và lưu `subjectId/chapter/lesson/difficulty` trong create/import/copy, kèm kiểm tra quyền subject.
7. Cho phép override `DATA_DIR`/`DB_PATH`; chạy E2E trong thư mục tạm và dọn sau; nối vào CI.

## Best Practices

- Mọi input qua Zod tại ranh giới route/socket.
- Chỉ prepared statement; quyền lớp kiểm tra server-side.
- Không shell command cho backup/restore trên Windows.
- Không thay DB đang mở trực tiếp; restore được stage và áp dụng trước khi mở SQLite ở lần boot kế tiếp.
- Test chỉ dùng data directory tạm, không dùng `data/` thật.

## Verification

- `npm run typecheck`
- `npm run build`
- `npm run test:e2e`
- Probe endpoint Zod sai → 400; student ngoài lớp không join game; non-host không điều khiển phòng.

## Outcome

- Hoàn thành 2026-08-27.
- Router đơn miền mount tại prefix riêng; xóa router subject/question/backup trùng và giữ endpoint tương thích trong router chuẩn.
- Backup/restore dùng Node filesystem + JSZip, không gọi shell; restore stage an toàn và áp dụng trước khi SQLite mở.
- Migration v18 bổ sung `game_sessions.class_id`; enrollment và host được xác thực server-side.
- Import/copy câu hỏi giữ đủ ngữ cảnh; upload file dùng memory storage và file tạm có cleanup.
- CI chạy E2E trên `DATA_DIR`/`DB_PATH` tạm.

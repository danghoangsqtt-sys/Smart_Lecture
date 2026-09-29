# T-8301 — Migration phiên dạy–lớp

## Objective

Biểu diễn 2–4 lớp thuộc một nhật ký/buổi dạy mà không nhân bản telemetry hay làm đổi dữ liệu một lớp cũ.

## Paths

- `server/src/db/connection.ts`
- `scripts/multi-class-schema-test.mjs`

## Plan

1. Dùng migration v26 (sau v25 hiện tại); thêm quan hệ `teaching_log_id`–`class_id` với khóa/index riêng, không sửa/xóa `teaching_logs.class_id` cũ.
2. Bảng liên kết có `id TEXT PRIMARY KEY`, `created_at`, cặp `(teaching_log_id, class_id)` duy nhất, FK và index theo lớp. Giới hạn 2–4 lớp, lớp nguồn nằm trong nhóm và quyền quản lý mọi lớp do API task T-8302 kiểm tra; không cố gắng ép cardinality bằng SQLite trigger.
3. Không thêm bảng vào `schema.sql`: bảng `teaching_logs` được tạo bởi migration v16; bảng liên kết mới thuộc migration v26 để bootstrap/nâng cấp chạy đúng thứ tự. Dữ liệu cũ không cần backfill phá hủy; read model T-8302 dùng lớp nguồn khi không có dòng liên kết.

## File-Level Plan

- `server/src/db/connection.ts`: thêm migration v26 tạo `teaching_log_classes` với ID UUID do API cấp, unique pair và index `(class_id, teaching_log_id)`, FK/cascade, không thay đổi bảng cũ. Đây là bước lưu quan hệ tối thiểu trước khi mở API.
- `scripts/multi-class-schema-test.mjs`: dùng DB/temp directory cô lập; tạo fixture có log/điểm danh/game một lớp, mô phỏng trạng thái v25 bằng cách bỏ bảng mới và migration marker, chạy v26 hai lần, kiểm tra sentinel, uniqueness/FK/index và rollback/retry khi migration gặp schema xung đột.

## Best Practices

- Chỉ prepared statements cho dữ liệu động; schema DDL cố định trong migration transaction hiện có.
- Không mở/copy/sửa DB đang cài trên máy người dùng; phép thử dùng temp directory và cleanup xác thực.
- Không thay đổi hợp đồng API và hành vi một lớp ở task schema này.

## Verification

- `npm run build -w server` → exit 0.
- `node scripts/multi-class-schema-test.mjs` → mọi assertion PASS, exit 0.
- `npm run typecheck` và `npm run lint` → exit 0.

## Acceptance

- Fixture DB v25 với bản ghi một lớp nâng cấp/retry không đổi số nhật ký/điểm danh/kết quả.
- Migration lỗi giữa chừng rollback marker và retry được sau khi sửa nguyên nhân; bản sao trước migration vẫn đọc được.
- Query nhóm không dùng JSON filter hoặc nối chuỗi input vào SQL.

## Status

- `in_progress`

## Execution Notes — 2026-09-29

- Stack cache `~/.DHSYSTEM/stacks/{node-express-ts,sqlite-node}/SUMMARY.md` và `.DHSYSTEM/STACKS.md` không có; áp dụng `.DHSYSTEM/SYSTEM-RULES.md` cùng pattern migration hiện tại.
- Tạo v26 bằng DDL cố định trong transaction của `migrate()`, chỉ thêm bảng liên kết và index. Không sửa `schema.sql` vì `teaching_logs` xuất hiện ở v16.
- Thử trên thư mục tạm: fixture v25 có log/attendance/game/result một lớp; kiểm tra 6/6 gồm dữ liệu legacy, unique/FK/index, idempotency, bản sao pre-upgrade và rollback/retry.
- `npm run typecheck`, `npm run lint`, `npm run build` đều đạt. Hồi quy cũ `scripts/upgrade-path-test.mjs` in PASS cho health nhưng process exit 1 với assertion libuv Windows khi teardown; lỗi phụ của harness sẽ theo dõi ở P79, không phải migration assertion.
- `npm run test:e2e` chưa đạt: server E2E port 4100 khởi động và áp dụng v26, sau đó Bonjour báo trùng service name; cùng run bị dừng do `upgrade-path-test.mjs` assertion libuv Windows (exit `3221226505`). Đây là hai gate P79 chưa xong, không phải assertion về dữ liệu v26. Không đánh dấu PASS cho đến khi có hướng xử lý/waiver rõ.

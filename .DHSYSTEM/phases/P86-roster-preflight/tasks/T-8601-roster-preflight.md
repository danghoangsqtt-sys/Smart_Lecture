# T-8601 — Kiểm kê roster chỉ đọc

## Objective

Cung cấp một báo cáo tái lập được về các xung đột dữ liệu ngăn việc áp quy tắc username duy nhất không phân biệt hoa/thường, mã sinh viên duy nhất và một lớp biên chế hiện tại/học viên. Không sửa DB.

## Paths

- `scripts/lib/rosterPreflight.mjs`
- `scripts/roster-preflight.mjs`
- `scripts/roster-preflight.test.mjs`
- `package.json`
- `.DHSYSTEM/phases/P86-roster-preflight/PHASE-STATE.md`
- `.DHSYSTEM/TRACKER.md`

## File-Level Plan

- `scripts/lib/rosterPreflight.mjs`: nhận đường dẫn DB tường minh, mở `DatabaseSync` read-only; kiểm tra schema/FK/integrity và nhóm xung đột theo khóa chuẩn hóa. Trả object có summary/issues; không import runtime DB connection/config, không ghi file.
- `scripts/roster-preflight.mjs`: CLI yêu cầu `--db <path>`; in tổng hợp không PII hoặc `--json` khi người vận hành chọn; exit code 2 cho lỗi dùng công cụ/schema, 1 cho xung đột, 0 cho dữ liệu sạch.
- `scripts/roster-preflight.test.mjs`: tạo DB fixture trong thư mục tạm; kiểm tra sạch/xung đột/missing file/schema cũ và SHA-256 trước/sau. Cleanup chỉ trong temp dir test đã tạo.
- `package.json`: thêm `test:roster-preflight` chạy Node test runner.
- `PHASE-STATE.md`/`TRACKER.md`: giữ `in_progress` trước code; chỉ chuyển `done` sau verification và git persistence gate theo workflow.

## Best Practices

- Không mở DB mặc định và không dùng API `migrate()` có side effect. Bảo vệ PII trong console mặc định.
- SQL cố định; không chèn path/giá trị người dùng vào query. Chuẩn hóa khóa nhất quán cho audit, nhưng không tự sửa hồ sơ.
- Node 24 `DatabaseSync` hỗ trợ `readOnly`; xác thực path tồn tại trước khi mở. Test mọi thao tác trên fixture tạm.

## Verification Commands

- `npm run test:roster-preflight` → mọi assertion PASS.
- `npm run typecheck` → exit 0.
- `npm run lint` → exit 0.

## Acceptance Criteria

- Báo đầy đủ mã SV thiếu/trùng (không phân biệt hoa/thường sau trim), username trùng casefold, username học viên có chữ hoa, 0/>1 lớp, enroll sai role và lỗi FK.
- DB không đổi sau kiểm kê, kể cả khi có xung đột; không tạo DB khi đường dẫn thiếu.
- Mặc định chỉ tổng hợp đếm; JSON có ID chi tiết để người vận hành xử lý thủ công, không chứa mật khẩu/hash/token.
- Không tự xóa/gộp/chuyển lớp, không áp unique index trước khi dữ liệu sạch.

## Status

- `done` — 2026-09-30; 5/5 fixture tests, typecheck, lint, build và git persistence đạt. Chỉ kiểm kê read-only, không sửa DB thực.

## Execution Notes — 2026-09-30

- Repo DB: 62 học viên, 6 lớp, 62 ghi danh, không có xung đột kiểm kê.
- DB bản cài: 3 học viên thiếu mã sinh viên, 1 học viên chưa có lớp; chưa đủ điều kiện áp unique/one-class constraint. Không xuất định danh hay tự điền mã/lớp.
- Commit triển khai: `99e8607`; checkpoint tag `Smart_Lecture-main-0.11.0-DH-p86-t8601` đã đẩy lên upstream.

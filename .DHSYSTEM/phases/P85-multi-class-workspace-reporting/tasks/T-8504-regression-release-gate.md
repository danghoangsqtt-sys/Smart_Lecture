# T-8504 — Hồi quy, tải hội trường và release gate v0.12.0

## Objective

Chỉ công bố tính năng sau khi chứng minh vận hành với nhiều lớp và nâng cấp không mất dữ liệu.

## Paths

- `scripts/e2e-isolated.mjs`
- `scripts/e2e-browser-isolated.mjs`
- `scripts/lan-benchmark.mjs`
- `scripts/build-windows-installer.ps1`
- `package.json`
- `server/package.json`
- `web/package.json`
- `CHANGELOG.md`
- `.DHSYSTEM/TRACKER.md`
- `.DHSYSTEM/ROADMAP.md`

## Plan

1. Chạy ma trận một lớp legacy và 2/3/4 lớp chung, học viên ghi danh chồng/ngoài nhóm, retry/reload/Node restart, điểm danh trùng ngày và báo cáo/CSV/XLSX.
2. Benchmark một phòng chung theo giả định 4×60 = 240 kết nối trên máy mục tiêu; đo join latency, Socket errors, memory/CPU và scoring durability. Nếu không đạt, điều chỉnh giới hạn/thiết kế rồi kiểm thử lại; không xóa cap 60 mù quáng.
3. Rehearsal nâng cấp DB và installer bằng bản sao dữ liệu/backup, không dùng DB cài đặt thật. Sau khi gate đạt mới nâng package/version docs sang v0.12.0 và tạo artifact/checksum.

## Acceptance

- `npm run typecheck`, `npm run lint`, `npm run build`, React Doctor và REST/Socket/Browser E2E đều đạt.
- Một lớp cũ không suy giảm; cả dữ liệu/backup và quyền truy cập sau nâng cấp đúng.
- Có log benchmark và quyết định ngưỡng phòng được ghi trong tài liệu phát hành.

## Status

- `todo`

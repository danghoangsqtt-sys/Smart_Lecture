# Changelog

## 2026-08-27 — UI quality checkpoint 5

- Chuẩn hóa lifecycle Socket và state reducer cho host/player; tách các view game và cấu hình theo domain.
- Tách engine/render mạch điện, chế độ giảng dạy, chi tiết lớp và cài đặt thành component nhỏ hơn.
- Sửa callback-effect, ngày local, stable key, animation quá rộng, handler-only state và export thừa.
- React Doctor changed/full đạt 100/100; typecheck, production build, REST 82/82, Socket 10/10 và restore restart đều pass.
- Trạng thái hiện tại là verified-local; persistence review/commit vẫn đang chờ.

## 2026-08-27 — Stability foundation

- Chuẩn hóa API router, middleware quyền và lỗi đầu vào HTTP 400.
- Thay backup/restore Windows bằng Node filesystem + JSZip; giới hạn restore/delete cho admin.
- Khóa game theo enrollment và xác thực host cho mọi Socket event điều khiển.
- Sửa Đua toán, lịch lặp theo ngày local và media storage audit.
- Giữ metadata môn/chương/bài/độ khó xuyên suốt create/import/copy câu hỏi.
- Thêm migration v18 cho lớp của game, DB test riêng và E2E idempotent trong CI.

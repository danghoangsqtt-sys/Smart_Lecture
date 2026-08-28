# Changelog

## Unreleased — Teaching Continuity Canvas v0.9.0 (planned)

- Lập milestone cho presentation canvas PDF/PPTX, annotation, laser/highlight và video/game dock không gián đoạn phiên dạy.

## Unreleased — Game telemetry trong phiên dạy

- Chỉ ghi nhận game có phiên thật, đúng lớp/môn vào nhật ký dạy; không còn dùng dấu hiệu giao diện `game-dock`.
- Game dock của Teaching Mode khóa lớp của tiết đang dạy; tổng quan hiển thị tên game đã dùng.

## Unreleased — Post-lesson Insights v1

- Thêm tổng quan theo lớp/môn từ nhật ký dạy, học liệu, game, điểm danh và tiến độ chương trình.

## Unreleased — Teaching Session v1

- Bổ sung lifecycle phiên dạy được lưu, tiếp tục sau refresh và tổng kết sau tiết.
- Liên kết an toàn giáo án, điểm danh, nội dung trình chiếu và game với nhật ký giảng dạy.

## 2026-08-27 — UI quality checkpoint 5

- Chuẩn hóa lifecycle Socket và state reducer cho host/player; tách các view game và cấu hình theo domain.
- Tách engine/render mạch điện, chế độ giảng dạy, chi tiết lớp và cài đặt thành component nhỏ hơn.
- Sửa callback-effect, ngày local, stable key, animation quá rộng, handler-only state và export thừa.
- React Doctor changed/full đạt 100/100; typecheck, production build, REST 82/82, Socket 10/10 và restore restart đều pass.
- Commit triển khai `9428836` đã được đẩy lên `origin/main`; Phase 7–8 hoàn tất.

## 2026-08-27 — Stability foundation

- Chuẩn hóa API router, middleware quyền và lỗi đầu vào HTTP 400.
- Thay backup/restore Windows bằng Node filesystem + JSZip; giới hạn restore/delete cho admin.
- Khóa game theo enrollment và xác thực host cho mọi Socket event điều khiển.
- Sửa Đua toán, lịch lặp theo ngày local và media storage audit.
- Giữ metadata môn/chương/bài/độ khó xuyên suốt create/import/copy câu hỏi.
- Thêm migration v18 cho lớp của game, DB test riêng và E2E idempotent trong CI.

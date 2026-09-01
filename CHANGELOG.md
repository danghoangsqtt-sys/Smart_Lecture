# Changelog

## 2026-09-01 — Private circuit teacher assistance

- Thêm migration v21 lưu thời điểm thao tác mạch cuối theo từng học viên và cảnh báo “Cần hỗ trợ” sau 10 giây không hoạt động khi đang làm.
- Bổ sung gợi ý riêng tối đa 300 ký tự và yêu cầu kiểm tra lại trong panel mạch đang xem; host nhận trạng thái giao tin rõ ràng.
- Tin nhắn chỉ đến đúng học viên được chọn, không broadcast cho peer và không làm đổi topology, timer, completion, điểm mạch hoặc KTTX.
- Kiểm chứng quyền riêng tư bằng ba browser context và process restart thực; React Doctor đạt 100/100.

## 2026-09-01 — Private circuit learner monitoring

- Thêm bảng tiến độ realtime theo từng học viên với trạng thái kết nối, đang làm/hoàn thành, số linh kiện/dây và điểm mạch.
- Cho giáo viên xem topology hiện tại theo yêu cầu trong preview chỉ đọc, khôi phục được sau reload/server restart.
- Loại broadcast topology khỏi room chung; học viên không còn nhận mạch của nhau và không có quyền gọi inspection.
- Kiểm chứng bằng ba browser context độc lập và restart process thật.

## 2026-09-01 — Circuit teacher controls

- Thêm nút Tạm dừng/Tiếp tục/Bỏ qua/Làm lại challenge mạch cho giáo viên, kèm trạng thái pause hiển thị cho học viên.
- Thêm migration v20 lưu trạng thái pause và số mili-giây còn lại qua reload hoặc Node.js restart.
- Giữ topology khi pause/resume; skip không chấm; restart đặt lại workspace hiện tại nhưng không thu hồi điểm/KTTX.
- Kiểm chứng bằng Browser E2E ba học viên và restart hai process thật.

## 2026-08-31 — Circuit server-restart recovery

- Thêm migration v19 lưu runtime challenge/deadline và state mạch riêng từng học viên.
- Tự khôi phục phòng mạch, topology, completion feed, bảng xếp hạng và timer khi Node.js khởi động lại.
- Ghi hoàn thành challenge cùng cộng KTTX trong một transaction và kiểm chứng bằng restart process thật.

## 2026-08-31 — Circuit host recovery

- Tự mở lại phiên game đang hoạt động khi giáo viên reload trang Trò chơi.
- Khôi phục challenge mạch hiện tại, feed hoàn thành, số học viên và bảng xếp hạng điểm mạch qua `host:sync` có phân quyền.
- Tách context xác thực giáo viên/ba học viên trong Browser E2E và kiểm chứng reload không gián đoạn, không cộng trùng KTTX.

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

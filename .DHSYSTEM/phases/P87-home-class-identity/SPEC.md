# P87 — Danh tính học viên và lớp biên chế

## Goal

Mỗi học viên có mã sinh viên duy nhất và một lớp biên chế hiện tại; tạo/nhập/chuyển/xử lý tài khoản nhất quán trong ứng dụng cục bộ của giảng viên.

## Safety gate

- P86 phải hoàn thành trước. Bản cài hiện có 3 học viên thiếu mã và 1 chưa có lớp; không gán mã/lớp suy đoán và không ép unique/one-class constraint vào DB đó.
- Triển khai theo các bước cộng thêm, có chế độ rà soát/sửa dữ liệu thủ công và rehearsal trên bản sao trước khi cưỡng chế constraint.
- Bảo toàn ID tài khoản, điểm danh, điểm số và phiên game cũ; chuyển lớp không đổi lớp lịch sử.

## Tasks

1. T-8701 — migration cộng thêm, schema/history và enforcement gate; kiểm thử nâng cấp sạch/xung đột.
2. T-8702 — tạo tài khoản có một lớp, username/mã SV chuẩn hóa, mọi writer cùng một transaction/validation.
3. T-8703 — UI Người dùng và Excel một học viên/một lớp; import idempotent, báo xung đột từng dòng.
4. T-8704 — chuyển lớp, xóa/lưu trữ tài khoản đúng điều kiện, thu hồi phiên và hồi quy lịch sử.

## Exit criteria

- DB cũ chưa xử lý vẫn khởi động và hiển thị vấn đề cần giải quyết, không mất dữ liệu; DB đã xử lý áp constraint thành công.
- Các endpoint/UI không tạo học viên đa lớp hoặc trùng mã/username; chuyển lớp giữ lịch sử cũ.
- Quyền giảng viên chỉ với học viên do mình tạo, admin toàn bộ dữ liệu ứng dụng; REST/Browser/backup-restore tests đạt.

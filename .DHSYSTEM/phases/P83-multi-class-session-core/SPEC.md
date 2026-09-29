# P83 — Nền tảng phiên dạy đa lớp

## Goal

Một phiên dạy có 2–4 lớp cùng môn/bài, một nguồn học liệu và một nhật ký hoạt động. Không thay đổi dữ liệu phiên một lớp cũ.

## Scope

- Thêm quan hệ phiên dạy–lớp bằng migration cộng thêm; giữ `teaching_logs.class_id` làm lớp nguồn và fallback cho dữ liệu cũ.
- API tạo/khôi phục/kết thúc phiên nhóm: kiểm tra quyền quản lý từng lớp, chống tạo trùng/xung đột và cố định danh sách lớp sau khi bắt đầu.
- Chỉ mở quyền đọc học liệu đã dùng trong phiên cho học viên các lớp tham gia; không mở quyền toàn bộ học liệu lớp nguồn.

## Planning assumptions to confirm before code

- Giáo viên chọn một lớp nguồn để lấy môn/bài/học liệu; các lớp còn lại cùng học nội dung đó.
- Một giáo viên quản lý tất cả lớp trong nhóm (admin có quyền tương ứng); không triển khai đồng giảng viên ở P83.

## Tasks

- `T-8301-session-class-schema.md`
- `T-8302-session-lifecycle.md`
- `T-8303-shared-content-access.md`

## Exit criteria

- Migration từ bản sao DB hiện có an toàn và có hồi quy legacy một lớp.
- Start/resume/end idempotent, không có hai phiên active cùng lớp và không rò quyền lớp.
- Typecheck, lint, build, REST tests đạt.

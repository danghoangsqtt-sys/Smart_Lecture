# T-8303 — Học liệu chung, quyền xem có giới hạn

## Objective

Các lớp tham gia xem đúng bài/trình chiếu/video của buổi chung, không được truy cập tự do toàn bộ lớp nguồn.

## Paths

- `server/src/routes/lectures.routes.ts`
- `server/src/routes/classes.routes.ts`
- `server/src/utils/access.ts`
- `server/src/routes/teachingLogs.routes.ts`
- `scripts/e2e-regressions.mjs`

## Plan

1. Xác định một lớp nguồn chọn subject/curriculum item/lecture; các lớp khác dùng tham chiếu, không copy tệp media hoặc tài liệu.
2. Tạo read model học liệu theo phiên active/participant; giữ nguyên kiểm soát media endpoint và chỉ cấp quyền các material được chọn trong phiên.
3. Preflight nêu thiếu học liệu hoặc PPTX cần chuyển đổi; không suy diễn môn trùng nhau từ tên tự do.

## Acceptance

- Học viên của mỗi lớp trong nhóm đọc được bài của buổi; học viên lớp ngoài nhóm, phiên đã kết thúc hoặc material ngoài bài bị từ chối theo policy đã chốt.
- Giáo viên không quản lý đủ các lớp không thể mở phiên để mở rộng quyền học liệu.
- Luồng một lớp và URL học liệu hiện có giữ nguyên.

## Status

- `todo`

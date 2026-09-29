# T-8501 — Teaching Hub chọn nhiều lớp

## Objective

Giáo viên chọn 2–4 lớp cùng học một môn/bài và thấy điều kiện sẵn sàng trước khi bắt đầu.

## Paths

- `web/src/pages/TeachingHubPage.tsx`
- `web/src/types.ts`
- `server/src/routes/lectures.routes.ts`
- `tests/browser/login.spec.ts`

## Plan

1. Giữ lối vào một lớp cũ; thêm luồng chọn nhiều lớp có lớp nguồn, chip/tóm tắt lớp và tổng số học viên **duy nhất**.
2. Chọn subject/bài/học liệu từ lớp nguồn; nêu rõ học liệu nào dùng chung và điểm danh/kết quả sẽ tách theo lớp.
3. Preflight hiển thị quyền, lớp trùng/thiếu, session active xung đột và converter/media readiness. Không để UI là nguồn kiểm tra quyền duy nhất.

## Acceptance

- Keyboard/screen reader sử dụng được multi-select; 1, 2, 4 và 5 lớp được xử lý đúng.
- Bắt đầu một nhóm hợp lệ đi tới đúng session ID; quay lại Hub khôi phục nhóm đang mở.
- Nút tạo môn và báo cáo một lớp hiện có không bị mất.

## Status

- `todo`

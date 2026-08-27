# P7 — Ổn định nền tảng

- Trạng thái: `completed`
- Bắt đầu: 2026-08-27
- Mục tiêu: loại bỏ xung đột API/quyền, bảo vệ dữ liệu và game realtime, sửa các lỗi nghiệp vụ đã xác nhận, sau đó đưa E2E cô lập vào CI.
- Task hiện tại: `T-701-stability`
- Checkpoint: `verified-2026-08-27`
- Ghi chú Git: thay đổi Phase 7–8 đã qua kiểm toán persistence và được đẩy trong commit `9428836`.

## Cổng hoàn thành

- TypeScript strict pass cho server và web.
- Production build pass.
- E2E chạy trên DB/thư mục dữ liệu tạm, có thể chạy lại mà không phụ thuộc DB thật.
- Endpoint nhập sai schema trả HTTP 400 chuẩn hóa.
- Restore/delete backup chỉ admin; game chỉ cho học viên thuộc lớp và mọi host event xác thực host.

## Bằng chứng

- `npm run typecheck`: pass server + web.
- `npm run test:e2e`: REST 82/82, Socket 10/10, restore qua restart pass; dữ liệu test nằm trong thư mục tạm và được dọn sau khi chạy.
- Server production build: pass.
- Web production build: pass khi xuất ra thư mục tạm; `web/dist` đang bị tiến trình server Windows giữ file nên không ép xóa thư mục đang phục vụ.
- React Doctor: 41/100, còn 64 cảnh báo nợ UI và 2 báo lỗi cleanup không nhận diện được cleanup `socket.off()`; timeout phát sinh trong handler đã được quản lý và hủy rõ ràng.

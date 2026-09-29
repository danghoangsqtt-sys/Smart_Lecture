# Brainstorm — Một buổi giảng dạy cho nhiều lớp

## Session Info

- **Ngày:** 2026-09-29
- **Người tham gia:** Người dùng, Codex
- **Trạng thái:** Hướng 1 đã chốt; chuyển sang lập kế hoạch bằng `dh-evolve`
- **workflow_version:** dh-brainstorm 1.1.0
- **Nguồn:** yêu cầu của người dùng và ảnh chụp màn hình trang Giảng dạy hiện tại

## Bối cảnh và nhu cầu đã xác nhận

- Một giảng viên có thể dạy đồng thời 2–4 lớp trong cùng hội trường, cùng một buổi học.
- Trang Giảng dạy hiện chỉ chọn được một lớp trước khi mở môn học và workspace.
- Mục tiêu là vận hành một buổi dạy thực tế, không phải mở 2–4 phiên dạy song song bằng nhiều tab.

## Phát hiện từ mã nguồn

- `web/src/pages/TeachingHubPage.tsx` giữ một `classId`; danh sách môn, mức sẵn sàng, báo cáo và URL workspace đều lấy theo lớp đó.
- `web/src/pages/TeachingModePage.tsx` dùng `classId` cho học liệu, nhật ký, điểm danh và game.
- `server/src/db/connection.ts` tạo `subjects` và `teaching_logs` gắn với một `class_id`; `server/src/db/schema.sql` cũng gắn `attendance_sessions` và `game_sessions` với một `class_id`.
- `server/src/routes/teachingLogs.routes.ts` tạo/tìm phiên đang mở và báo cáo theo một lớp. Vì vậy, đổi UI thành multi-select nhưng giữ nguyên API/schema sẽ không biểu diễn đúng một buổi dạy chung.

## Quyết định đã chốt

- Các lớp trong cùng buổi học cùng môn/bài, dùng chung trình chiếu và một phòng game.
- Điểm danh, điểm số và kết quả học tập vẫn tách theo lớp; không tạo nhiều phiên live song song.

## Hướng thiết kế đề xuất cho các chi tiết còn mở

1. Tạo một **buổi dạy chung** có danh sách lớp tham gia; một màn hình điều khiển trình chiếu/video/game cho cả hội trường.
2. Giữ điểm danh, điểm số, quyền truy cập và báo cáo học tập theo từng lớp/sinh viên; buổi dạy chung chỉ là nguồn ngữ cảnh và hoạt động dùng chung.
3. Trước khi bắt đầu, giảng viên chọn 2–4 lớp, xác nhận môn/bài học tương ứng, xem tổng số sinh viên và lớp nào còn thiếu liên kết học liệu.
4. Giao diện sau tiết cho phép xem tổng buổi và lọc từng lớp; không nhân bản hoạt động dùng chung thành nhiều phiên dạy độc lập.
5. Phiên dạy một lớp hiện có phải tiếp tục hoạt động; migration dữ liệu cũ không được làm mất nhật ký/điểm danh.

## Phases — phạm vi tính năng đã chốt, chi tiết triển khai theo kế hoạch v0.12.0

### Phase 1 — Buổi dạy chung 2–4 lớp

- Chọn nhiều lớp và khởi động một buổi dạy chung từ trang Giảng dạy.
- Một workspace/học liệu/hoạt động trực tiếp cho cả hội trường; ghi nhận lớp tham gia và dữ liệu cá nhân đúng lớp.
- Điểm danh từng lớp; báo cáo có tổng buổi và bộ lọc lớp; giữ tương thích luồng một lớp.

### Phase 2 — Quản lý học liệu liên lớp

- Nếu cần, chuẩn hóa môn/chương trình/học liệu dùng chung giữa nhiều lớp để không phải tạo lại ở từng lớp.
- Mẫu nhóm lớp thường dạy chung và lịch buổi dạy liên lớp.

## Câu hỏi quyết định

1. Bài giảng/học liệu hiện đặt ở lớp nào sẽ là nguồn cho buổi chung: chọn một lớp nguồn (đề xuất giai đoạn đầu), hay tạo kho học liệu dùng chung không thuộc lớp nào?
2. Bảng xếp hạng game hiển thị toàn hội trường, theo lớp, hay cả hai? Kế hoạch mặc định một bảng chung và bộ lọc theo lớp.
3. Điểm danh giai đoạn đầu thao tác theo từng lớp trong cùng workspace; QR chung có cần ngay trong phạm vi này không?
4. Một sinh viên thuộc hai lớp được chọn trong cùng buổi thì chọn một lớp tại lúc vào game (đề xuất để không cộng điểm trùng) hay ghi nhận cả hai?

## UI Direction

- Ảnh chụp màn hình cho thấy điểm bắt đầu ở ô `Lớp học` trên trang Giảng dạy.
- Đề xuất thay bằng bộ chọn nhiều lớp có chip tên lớp, đếm số lớp/sinh viên, cảnh báo tương thích môn/bài, và hành động “Bắt đầu buổi dạy chung”.
- Chưa tạo prototype vì quy tắc học liệu/game/điểm danh chưa được chốt.

## Architecture diagram applicability inputs

- **Độ phức tạp:** vừa đến cao; nhiều miền nghiệp vụ đang giả định một `classId`.
- **Module:** web Giảng dạy/workspace, API nhật ký/điểm danh/game, SQLite migration, báo cáo.
- **Event-driven:** game realtime hiện có; buổi dạy chung cần phát sự kiện cho nhiều lớp nhưng một hoạt động live.
- **Triển khai:** một máy giáo viên, sinh viên truy cập qua LAN.
- **Luồng người dùng:** đa tác nhân (giảng viên, sinh viên của nhiều lớp).
- **Tích hợp ngoài:** thấp.

## Project meta intake (FEAT-009)

- **status:** deferred — phạm vi chưa khóa; dự án đã có `.DHSYSTEM/PROJECT-META.md`.

## Hành động tiếp theo

- [x] Chốt quy tắc dùng chung học liệu và hoạt động live.
- [ ] Chốt cách điểm danh, game và báo cáo theo lớp.
- [x] Chuyển `dh-evolve` để lập kế hoạch triển khai sau milestone v0.11.0.

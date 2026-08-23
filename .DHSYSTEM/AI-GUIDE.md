# AI-GUIDE — Hướng dẫn cho agent làm việc trong Smart_Lecture

## Khi bắt đầu phiên làm việc, đọc theo thứ tự:
1. `.DHSYSTEM/HANDOFF.json` — trạng thái hiện tại + next_action
2. `.DHSYSTEM/TRACKER.md` — task nào doing/todo, tiếp tục task đó
3. `.DHSYSTEM/SYSTEM-RULES.md` — quy tắc bắt buộc (đặc biệt mục Bảo mật, Database, AI)
4. `.DHSYSTEM/ARCHITECTURE.md` — khi đụng đến thiết kế/schema/API
5. `.DHSYSTEM/PROJECT-CONTEXT.md` — nghiệp vụ VN, quyết định D1–D8

## Nguyên tắc thực thi
- Làm ĐÚNG một task trong TRACKER mỗi lần; tick trạng thái + ghi Session log khi xong.
- Verify trước khi báo xong: `npm run typecheck -w server -w web` phải pass; luồng chính test được.
- Không đổi schema/API đã có người dùng mà không cập nhật ARCHITECTURE.md cùng lúc.
- Code mới phải tuân thủ SYSTEM-RULES; phát hiện vi phạm ở code cũ → tạo task fix trong TRACKER, đừng sửa lan man.
- Tham khảo pattern nguồn tại các repo anh em (chỉ đọc): `E:\data\2.MyProject\2025\bluebee_LMS`, `esafe-electro-v3`, `DTS-LMS`.
- Sau khi sửa React: gợi ý chạy react-doctor. Sau khi thêm endpoint: cập nhật bảng API sketch.

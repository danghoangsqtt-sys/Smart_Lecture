# SYSTEM-RULES — Smart_Lecture

> Quy tắc BẮT BUỘC cho mọi agent/developer làm việc trong repo này.
> Nguồn gốc: bài học đắt giá từ 4 dự án anh em (bluebee_LMS, dts_system_lms, DTS-LMS, esafe-electro-v3).

## 1. Ngôn ngữ & tài liệu
- Code, comment, tên biến: tiếng Anh. UI text + tài liệu: tiếng Việt.
- Artifact .DHSYSTEM/ là nguồn sự thật; sửa kiến trúc phải cập nhật ARCHITECTURE.md cùng commit.

## 2. TypeScript
- `strict: true` cả server và web. CẤM `any` ngầm (`noImplicitAny`, `@typescript-eslint/no-explicit-any: error`).
- Domain types đặt tại `server/src/types.ts` và `web/src/types.ts`; không định nghĩa trùng lặp kiểu shape API — web import từ `types/` dùng chung nếu cần.
- Validate input bằng zod ở ranh giới route; KHÔNG tin payload từ client.

## 3. Database (node:sqlite)
- CHỈ prepared statements (`db.prepare`). CẤM tuyệt đối ghép chuỗi user-input vào SQL.
- Mọi bảng có `id TEXT PRIMARY KEY` = `crypto.randomUUID()`, `created_at TEXT` ISO-8601.
- Trường lọc/tìm kiếm (bloom_level, folder_id, category, status...) là CỘT RIÊNG có index — cấm nhét vào JSON metadata rồi filter client-side (lỗi bluebee).
- File media KHÔNG BAO GIỜ lưu Base64 trong DB (lỗi DTS-LMS): lưu filesystem `data/media/`, DB chỉ giữ path + size.
- Migration: schema.sql idempotent + bảng `schema_migrations(version)`; nâng cấp viết migration file riêng đánh số.

## 4. Bảo mật
- Ops đặc quyền (tạo teacher, xem tất cả dữ liệu) chỉ chạy trong server process — KHÔNG bao giờ đưa server/API key hoặc secret xuống client (lỗi C-01 bluebee).
- JWT secret sinh random 64 byte lần đầu boot, lưu `data/secret.key`; không hardcode.
- API key Gemini mã hóa AES-256-GCM trước khi lưu; endpoint trả về chỉ trạng thái đã-nhập/không.
- Upload whitelist mime+ext, filename nội bộ = uuid; rate-limit mọi route public.
- Electron không dùng ở giai đoạn này; nếu sau này thêm shell thì bắt buộc contextIsolation:true + preload contextBridge.

## 5. AI / Gemini
- Toàn bộ call AI đi qua `server/src/services/gemini.ts` (single point). Cấu hình: global queue gap ≥1500ms, retry exponential backoff + jitter phân biệt 429/503/overload, fallback chain flash → flash-lite → 2.0-flash.
- Ưu tiên structured output (`responseMimeType: application/json` + responseSchema); luôn try/catch parse + log rawText khi lỗi.
- Prompt tuân thủ khuôn mẫu bluebee: persona chuyên gia + QUY TẮC CỤNG "chỉ dùng tài liệu cung cấp, thiếu thì trả rỗng" + LaTeX `$...$`.
- Counters quota per-feature per-day trong SQLite; vượt ngưỡng → trả lỗi thân thiện, KHÔNG để crash.

## 6. Frontend
- React 19 function components + hooks; state chia sẻ qua Zustand store per-domain — CẤM props drilling sâu >2 tầng (lỗi cả 3 anh em).
- Tailwind v4 build-time qua @tailwindcss/vite. CẤM Tailwind CDN.
- Component file ≤300 dòng; vượt → tách. Route component mỏng, delegate sang feature folder.
- Timer/countdown dùng ref giữ deadline tuyệt đối (pattern ExamRoom bluebee), cleanup effect đúng cách.
- Toast/notification tập trung một hook; không alert()/confirm()/prompt() mặc định browser.
- Chạy `npx react-doctor` sau mỗi phiên sửa React đáng kể.

## 7. Realtime (Socket.IO)
- Phòng game yêu cầu JWT handshake; server là trọng tài tính điểm — client chỉ báo hiệu.
- Mọi event có zod validate payload; disconnect phải dọn state phòng tránh leak.

## 8. Quy trình làm việc
- Task mới → ghi TRACKER.md trước khi code; hoàn thành tick kèm bằng chứng verify.
- Verify bắt buộc trước khi báo xong: `npm run typecheck` (cả 2 workspace) + build pass + luồng chính chạy thử.
- Commit nhỏ theo feature; message dạng `P1.3: add bloom matrix question generator`.
- Cấm dead code: thay thế xong là xóa file/hàm cũ ngay (lỗi tích tụ của cả 4 dự án).

## 9. Hiệu năng & độ bền
- SQLite WAL mode bật; transaction bọc bulk write.
- Bulk operation tuần tự throttle 300ms nếu gọi API ngoài; nội bộ DB dùng transaction.
- Boot resilience web: ErrorBoundary toàn app + splash + hiển thị lỗi rõ ràng khi server chưa sẵn sàng.

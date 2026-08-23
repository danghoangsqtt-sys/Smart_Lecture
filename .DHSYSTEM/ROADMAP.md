# ROADMAP — Smart_Lecture

## Phase 1 — Nền tảng + Trái tim sản phẩm (MVP giảng dạy)

### P1.1 Hạ tầng & Auth ✅ scaffold
- [x] Monorepo server/ + web/, TS strict cả hai phía
- [x] node:sqlite connection + schema.sql + seed admin
- [x] JWT login/logout/me, change-password, bcrypt, khóa sai liên tiếp
- [x] requireRole middleware; web: router role-based + trang Login + Layout + Dashboard placeholder
- [ ] Admin tạo TK giáo viên; GV import học viên Excel (xlsx) + tạo đơn lẻ; đổi MK học viên
- [ ] CRUD lớp học + phân công GV + enroll học viên

### P1.2 Thư viện bài giảng
- [ ] CRUD lectures (chapter/title/order) + upload materials (multer, whitelist mime)
- [ ] Stream video HTTP Range + viewer PDF/PPTX→ảnh preview (pdfjs client) 
- [ ] Trang học viên xem bài giảng theo lớp; đánh dấu hoàn thành bài

### P1.3 Ngân hàng câu hỏi + AI sinh câu hỏi
- [ ] CRUD questions (mcq/essay, bloom cột riêng index, folders, ảnh)
- [ ] Filter/search/sort + bulk move/delete (throttle 300ms)
- [ ] geminiService resilience layer (queue 1800ms, backoff+jitter, fallback chain)
- [ ] POST /ai/generate-questions theo ma trận Bloom + responseSchema
- [ ] UI Review-before-save (sửa inline từng câu → phê duyệt hàng loạt)
- [ ] Import đề từ text/Word theo format Mau (textExamParser thích ứng)

### P1.4 Soạn đề + thi online
- [ ] examEngine: generateExamPaper (Fisher-Yates, originalIndex tracking, strip prefix an toàn)
- [ ] ExamCreator: ma trận Bloom → kiểm tra tồn kho → preview → publish (config start/end/password/shuffle/max_attempts/class)
- [ ] Attempt lifecycle: in_progress→disconnected→submitted, autosave 5s, resume remaining_sec
- [ ] ExamRoom student: timer deadline tuyệt đối, flag câu, review trước nộp, anti-cheat visibilitychange red_flags
- [ ] Chấm MCQ tự động (thang 10), essay → pending; GV chấm essay thường + AI hỗ trợ (score+feedback schema)

### P1.5 Games realtime (Phase 1 core)
- [ ] Socket.IO room engine: lobby (danh sách HV live), host control, leaderboard
- [ ] Game "Trắc nghiệm nhanh" Kahoot-style: đồng bộ câu hỏi, tính điểm tốc độ, podium tổng kết
- [ ] Random Picker: bốc ngẫu nhiên 1–2 HV (GV cấu hình số lượng), animation quay, chống lặp lại người vừa được bốc (tùy chọn)
- [ ] Ghi điểm game → game_results + đề xuất nhập grades (GV duyệt 1 click)

### P1.6 Sổ điểm & điểm danh
- [ ] Gradebook: 3 cột KTTX | Quá trình 1 | KT kết thúc môn (editable, undo gần nhất)
- [ ] attendance_sessions theo buổi (periods_total) + records (present/absent/late, periods_absent, reason)
- [ ] Tổng hợp: % chuyên cần per student; export Excel (SheetJS): bảng điểm + điểm danh

**Exit criteria P1:** GV dạy trọn buổi thật: mở lớp → HS vào bằng điện thoại → học bài → chơi game → làm KT 10 phút → GV thấy điểm + điểm danh cập nhật.

## Phase 2 — Trí tuệ RAG & đa dạng hóa game
- [ ] RAG pipeline đầy đủ (docparse → heading chunks → embedding → sqlite BLOB)
- [ ] Chatbot trợ giảng cho GV (trích dẫn tài liệu + trang); rate limit quota guard
- [ ] Game kéo co (2 đội), đua toán (tính nhanh), điền chỗ trống — dùng chung engine
- [ ] Thống kê Azota-style: phổ điểm, phân tích câu sai, nhận xét AI từng HV
- [ ] QR code tham gia (hiện ở dashboard GV, payload URL LAN)

## Phase 3 — Hoàn thiện vận hành
- [ ] Backup tự động hằng ngày (zip db + manifest media vào data/backups, giữ 7 bản)
- [ ] Auto-start cùng Windows (Task Scheduler script cài sẵn)
- [ ] mDNS hostname `smart-lecture.local` (bonjour) + trang /system/info hiện mọi URL truy cập
- [ ] Docling sidecar tùy chọn cho PDF scan (cài riêng, app phát hiện và dùng nếu có)
- [ ] Đa môn/học kỳ: academic_year filter, archive lớp

## Phase 4 — Tùy chọn tương lai
- [ ] Cloudflare Tunnel opt-in cho ôn tập tại nhà (cấu hình admin, cảnh báo bảo mật)
- [ ] Vấn đáp giọng nói chấm miệng (useSpeechRecognition + evaluateOralAnswer kế thừa)
- [ ] Self-study mode vô hạn lần (max_attempts=9999) cho HV tự ôn

## Phụ thuộc & rủi ro roadmap
| Rủi ro | Giảm thiểu |
|---|---|
| Quota Gemini free tier cạn | Counters per-feature/day trong SQLite + cảnh báo 80% + queue toàn cục |
| WiFi lớp yếu/không ổn định | Không phụ thuộc Internet khi dạy (AI/RAG là tiện ích, không chặn luồng chính) |
| IP máy GV đổi | P3 mDNS + QR regenerate mỗi boot; khuyến nghị static lease |
| Anti-cheat trên điện thoại hạn chế | Thiết kế trung thực: timer server-side là nguồn sự thật, shuffle, một thiết bị/tài khoản, red-flag chỉ mang tính tham khảo |

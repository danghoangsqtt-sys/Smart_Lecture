# PROJECT-CONTEXT — Smart_Lecture

## Bối cảnh tổ chức
- Người dùng cuối: giáo viên + học viên môi trường giảng dạy Việt Nam (quân đội/nhà nước — thể thức tài liệu in ấn chuẩn Quốc hiệu, Tiêu ngữ khi xuất đề).
- Môi trường triển khai: máy tính xách tay/PC của giáo viên, Windows, WiFi phòng học (LAN nội bộ), KHÔNG dựa vào Internet trong giờ dạy.
- Quy mô mục tiêu: 1–10 giáo viên, mỗi GV 2–6 lớp, lớp 20–60 học viên; ≤60 thiết bị kết nối đồng thời/phòng game.

## Vai trò & quyền
| Role | Khả năng |
|---|---|
| admin | Toàn quyền: tạo/quản lý TK giáo viên, xem mọi lớp, ngân hàng câu hỏi công khai, backup hệ thống |
| teacher | Quản lý lớp đảm nhiệm + học viên lớp mình, bài giảng, ngân hàng câu hỏi riêng, đề thi, host game, sổ điểm, điểm danh, dùng AI |
| student | Xem bài giảng/tài liệu của lớp mình, thi online, tự ôn, tham gia game |

## Nghiệp vụ đặc thù Việt Nam
- Sổ điểm 3 cột cố định: **KTTX** (kiểm tra thường xuyên) · **Quá trình 1** · **KT kết thúc môn** — thang điểm 10.
- Điểm danh theo **buổi học**, mỗi buổi có **số tiết**; ghi **số tiết vắng + lý do vắng**.
- Ma trận câu hỏi theo Bloom 6 mức (tiếng Việt): Nhận biết · Thông hiểu · Vận dụng · Vận dụng cao · (2 mức còn lại tùy môn).
- Xuất đề/thống kê chuẩn thể thức hành chính VN (Times New Roman, khối Quốc hiệu — Tiêu ngữ).

## Ràng buộc sản phẩm đã chốt (D1–D8 brainstorm 2026-08-23)
D1 Node.js thuần+web · D2 LAN only · D3 Games realtime Phase 1 · D4 RAG pipeline tự làm · D5 AI chỉ cho GV · D6 Video file local stream Range · D7 Join game bằng tài khoản · D8 Admin + nhiều GV.

## Quyết định bổ sung cho 7 câu hỏi mở (chốt tối ưu 2026-08-23)
| Câu hỏi | Quyết định | Căn cứ |
|---|---|---|
| Anti-cheat HV dùng điện thoại riêng | Timer server-side là nguồn sự thật + 1 phiên đăng nhập/thiết bị active + shuffle Q/O + red-flag tab-switch chỉ tham khảo. Không hứa gian lận impossible | Thiết bị cá nhân không kiểm soát được phần cứng — đầu tư vào integrity thời gian thay vì giám sát |
| Quota Gemini free tier | Bảng counters(feature, date, count) trong SQLite; cảnh báo 80% quota ở dashboard GV; queue toàn cục 1500ms | Free tier ~15 RPM/1500 req ngày tùy model — đủ nếu chỉ GV dùng (đã chốt D5) |
| Backup | Auto-backup 02:00 hằng ngày zip db (+ manifest media) vào data/backups giữ 7 bản; nút export thủ công; restore qua admin UI P3 | DB nhỏ (<100MB), media lớn không cần copy đầy đủ — manifest đủ để tái tạo |
| IP máy GV thay đổi (DHCP) | Dashboard hiển thị QR + URL theo IP hiện tại mỗi lần boot (P2); P3 thêm mDNS smart-lecture.local; hướng dẫn đặt static lease | Giải pháp rẻ nhất không cần hạ tầng mạng |
| Số HV đồng thời | Target ≤60/phòng game, ≤120 REST req đồng thời | Socket.IO single node xử lý thoải mái mức này trên laptop thường |
| Import đề từ Word/text | Có, Phase 1.3: parser format Mau (`*A.` đáp án đúng, `BẢNG ĐÁP ÁN 1A 2B`, nhãn `(NB)`) kế thừa textExamParser + 4 file mẫu bluebee | Giáo viên có kho đề Word sẵn — nhập liệu nhanh là nhu cầu thật |
| Tên sản phẩm | Repo/folder: Smart_Lecture · Tên hiển thị: "SmartLecture" | Giữ nguyên như ý người dùng |

## Kế thừa code từ dự án anh em (bản đồ tham chiếu)
| Nguồn | File gốc | Đích thích ứng |
|---|---|---|
| bluebee_LMS | services/geminiService.ts (resilience layer) | server/src/services/gemini.ts |
| bluebee_LMS | QuestionGenerator responseSchema + prompt QUY TẮC CỤNG | server/src/services/aiQuestions.ts |
| bluebee_LMS | utils/examEngine.ts generateExamPaper | server/src/services/examEngine.ts |
| bluebee_LMS | ExamRoom attempt lifecycle + timer ref pattern | web exam feature (P1.4) |
| esafe-electro-v3 | services/documentProcessor.ts (chunk/embed/cosine) | server/src/services/rag.ts |
| esafe-electro-v3 | hook/useSpeechRecognition.ts | để dành P4 vấn đáp |
| esafe-electro-v3 | Game hub lobby→engine→summary | web games feature (P1.5) |
| esafe-electro-v3 | Boot resilience (splash/watchdog/panic) | web shell |
| esafe-electro-v3 | In A4 thể thức VN | export đề (P1.4) |
| DTS-LMS | textExamParser + seeds/Mau-*.txt | import đề text (P1.3) |
| DTS-LMS | Session log bug C/H/M/L discipline | docs/sessions/ |

## Stack versions khóa
Node ≥24 (node:sqlite built-in) · Express 5 · Socket.IO 4 · zod · jsonwebtoken · bcryptjs · multer 2 · React 19 · Vite 7 · Tailwind v4 (@tailwindcss/vite) · Zustand 5 · react-router-dom 7 · xlsx(SheetJS) · @google/genai.

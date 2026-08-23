# TRACKER — Smart_Lecture

> Cập nhật realtime khi làm việc. Trạng thái: `todo` · `doing` · `done` · `blocked`

## Phase 1

| ID | Task | Phase | Status | Verify |
|---|---|---|---|---|
| T-001 | Scaffold monorepo server+web, TS strict, schema.sql, seed admin | P1.1 | done | typecheck + build pass |
| T-002 | Auth JWT login/me/change-password + khóa sai liên tiếp | P1.1 | done | login admin OK qua API |
| T-003 | Admin tạo/quản lý TK giáo viên | P1.1 | done | API + UI |
| T-004 | GV tạo TK học viên đơn lẻ + import Excel | P1.1 | done | file xlsx mẫu |
| T-005 | CRUD lớp học + enroll học viên | P1.1 | done | API + UI |
| T-006 | CRUD lectures + upload materials (multer whitelist) | P1.2 | done | upload PDF/video |
| T-007 | Stream video HTTP Range + viewer PDF/PPTX | P1.2 | done | xem trên điện thoại LAN |
| T-008 | CRUD questions + folders + filter Bloom index cột riêng | P1.3 | done | API + UI |
| T-009 | geminiService resilience layer + quota counters | P1.3 | done | mock 429 test |
| T-010 | AI generate questions ma trận Bloom + Review UI | P1.3 | done | sinh từ PDF thật |
| T-011 | Import đề text format Mau (parser) | P1.3 | done | Mau-1..4.txt |
| T-012 | examEngine generateExamPaper + ExamCreator publish | P1.4 | done | in A4 preview |
| T-013 | Attempt lifecycle autosave/resume/submit + chấm MCQ | P1.4 | done | thi thử 2 thiết bị |
| T-014 | Chấm essay GV + AI hỗ trợ score/feedback | P1.4 | done | |
| T-015 | Socket.IO game engine lobby/leaderboard/host control | P1.5 | done | 2 trình duyệt test |
| T-016 | Game Trắc nghiệm nhanh Kahoot-style | P1.5 | done | chơi thật cả lớp |
| T-017 | Random Picker bốc 1–2 HV | P1.5 | done | |
| T-018 | Gradebook 3 cột + undo gần nhất | P1.6 | done | |
| T-019 | Điểm danh buổi/tiết/lý do + tổng hợp chuyên cần | P1.6 | done | |
| T-020 | Export Excel bảng điểm + điểm danh (SheetJS) | P1.6 | done | mở bằng Excel |

## Backlog (chưa gán phase)
- QR code tham gia (P2) · RAG chatbot (P2) · Kéo co/đua toán/điền chỗ trống (P2) · Thống kê Azota + nhận xét AI (P2) · Auto-backup + auto-start Windows + mDNS (P3) · Tunnel opt-in + vấn đáp giọng nói (P4)

## Session log
### 2026-08-23
- Brainstorm D1–D8 chốt; crystallize artifact set; scaffold T-001/T-002.

### 2026-08-23 (buổi 2 — triển khai toàn bộ Phase 1)
- Hoàn thành T-003 → T-020: users/classes/lectures/materials/questions/AI/exams/attempts/games realtime/gradebook/attendance/settings.
- Game engine Socket.IO: quick_quiz (điểm tốc độ), random-pick REST, lobby/leaderboard/podium.
- Sửa 3 bug quan trọng phát hiện qua E2E: (1) router.use(requireRole) toàn cục chặn HV trên mọi /api path → scoped theo prefix; (2) gradeAttempt chuẩn hóa thang 10 + provisional trên phần đã chấm; (3) zod parse sai tầng body trong essay-scores.
- Parser đề Mau: cho phép từ khóa không dấu (Cau/Dap an/Phan).
- Verify: typecheck strict PASS cả 2 workspace; build production PASS; E2E smoke 43/43 PASS (scripts/e2e-smoke.ps1).
### 2026-08-23 (buổi 3 — Phase 2)
- RAG đầy đủ: docparse (PDF per-page qua pdf-parse v2 / DOCX mammoth / PPTX jszip / TXT) → chunk heading-aware 900/120 → Gemini embedding batch (fallback keyword khi không có key — offline-first) → cosine search.
- Chatbot trợ giảng: trích dẫn [Nguồn X, trang Y], history ≤8 lượt, chế độ ngoại tuyến tự trích đoạn.
- Game mới: Kéo co (2 đội auto-chia, dây ±100, thắng tuyệt đối), Đua toán (bài riêng từng HV, 3 độ khó, đếm bài giải), loại câu hỏi 'fill' (migration v2, chấm tự động so khớp chuẩn hóa).
- QR code LAN trên dashboard GV; GitHub Actions CI (typecheck+build).
- Verify: typecheck strict PASS; build PASS; E2E mở rộng 50/50 PASS.
### 2026-08-23 (buổi 4 — Phase 3)
- Auto-backup: VACUUM INTO snapshot nhất quán → zip db + media ≤20MB + manifest.json → data/backups, giữ 7 bản; scheduler 02:00 hằng ngày (BACKUP_HOUR env) + nút backup thủ công.
- mDNS bonjour-service quảng bá smart-lecture.local (graceful nếu thiếu Bonjour).
- /api/system/info: version, LAN URLs, mDNS, hostname, uptime, doclingAvailable, backups.
- Docling sidecar: PDF text <200 ký tự → tự gọi docling CLI (--to plain-text); không có CLI thì fallback thông báo.
- Lưu trữ lớp học: migration v3 (classes.archived/archived_at) + PATCH archive + filter includeArchived/year; UI toggle + badge.
- Autostart scripts: install/uninstall Scheduled Task Windows.
- Verify: typecheck PASS; build PASS; E2E 58/58 PASS.
### 2026-08-23 (buổi 5 — Định vị lại phạm vi + tương tác lớp học)
- PHẠM VI MỚI (chốt với người dùng): Smart_Lecture = hệ thống TƯƠNG TÁC TRÊN LỚP; việc ôn tập của HV thuộc hệ thống riêng.
- Gỡ hoàn toàn self-study: purpose chỉ còn online_test | homework; xóa tab tự ôn phía HV.
- Game GIƠ TAY TRẢ LỜI (hand_raise): HV bấm giơ tay → GV chọn người → chấm Đúng/Sai → tự cộng điểm KTTX (0.25/0.5/1 tùy cấu hình) ghi thẳng gradebook, không tính giờ.
- Game Ô CHỮ (crossword): builder từ khóa dọc + hàng ngang có validation chữ cái trùng vị trí; chơi bằng cơ chế giơ tay; giải đúng mở hàng + chữ từ khóa; đủ hàng → kết thúc.
- BTVN (homework): giao bài có hạn nộp, làm tại lớp/về nhà; thống kê đã/chưa nộp; board-questions endpoint (ẩn đáp án) phục vụ chiếu lên bảng; random-pick nhận examId → ưu tiên gọi HV CHƯA NỘP + trả về câu hỏi ngẫu nhiên không đáp án để HS lên bảng làm.
- Phòng lab ảo (/lab): mạch logic 4 preset (half/full adder, đa số, khóa NOT-AND) đánh giá biểu thức live; mạch DC Ohm nối tiếp/song song tính I/U/P realtime + đèn phát sáng theo công suất.
- Verify: typecheck strict PASS; build PASS; E2E mở rộng 66/66 PASS.
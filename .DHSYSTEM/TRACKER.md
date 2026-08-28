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

## Phase 7 — Ổn định nền tảng

| ID | Task | Phase | Status | Verify |
|---|---|---|---|---|
| T-701 | Ổn định API, backup, game, nghiệp vụ, metadata câu hỏi và E2E cô lập | P7 | done | typecheck + build + REST 82/82 + Socket 10/10 + restore restart |

## Phase 8 — Chất lượng UI

| ID | Task | Phase | Status | Verify |
|---|---|---|---|---|
| T-801 | React accessibility, correctness và bundle code-splitting | P8 | done | Doctor 47 changed / 42 full + typecheck + production build |
| T-802 | Tách component/reducer và chuẩn hóa Socket disposer cho game | P8 | done | Doctor full 100 + E2E + commit `9428836` pushed |

## Phase 9 — Teaching Session v1

| ID | Task | Phase | Status | Verify |
|---|---|---|---|---|
| T-901 | Phiên dạy liền mạch: lifecycle, telemetry nội dung, điểm danh/game và tổng kết | P9 | done | typecheck + E2E 86/86 + regression 14/14 + Socket 10/10 + restore restart |

## Phase 10 — Post-lesson Insights v1

| ID | Task | Phase | Status | Verify |
|---|---|---|---|---|
| T-1001 | Tổng quan sau tiết học theo lớp/môn trong Teaching Hub | P10 | done | typecheck + E2E 86/86 + regression 16/16 + Socket 10/10 + restore restart |

## Phase 11 — Game telemetry trong phiên dạy

| ID | Task | Phase | Status | Verify |
|---|---|---|---|---|
| T-1101 | Liên kết game được tạo từ Teaching Mode với nhật ký dạy và tổng quan sau tiết | P11 | done | typecheck + E2E 86/86 + regression 16/16 + Socket 10/10 + restore restart + clean web build |

## Phase 12 — Release hardening

| ID | Task | Phase | Status | Verify |
|---|---|---|---|---|
| T-1201 | Đồng bộ version, metadata, docs và release baseline | P12 | done | typecheck + clean build + consistency scan + E2E |
| T-1202 | Triage/rút bỏ rủi ro dependency Excel mức high | P12 | done | 0 high/critical audit + ADR + isolated XLSX route regression |
| T-1203 | Ổn định build, healthcheck và lifecycle Windows | P12 | done | 3 build/start/stop + PID/port/API check + E2E |
| T-1204 | Browser E2E cho luồng lớp học trọng yếu | P12 | done | 3 local browser runs + CI Chromium gate |

## Phase 13 — Teaching Continuity Canvas

| ID | Task | Phase | Status | Verify |
|---|---|---|---|---|
| T-1301 | Presentation Canvas PDF/PPTX theo trang | P13 | planned | browser PDF/PPTX + authorization tests |
| T-1302 | Annotation: pen, highlight, shape, laser, undo/redo | P13 | planned | pointer/zoom/history browser tests |
| T-1303 | Video/Game Continuity Dock kéo thả, minimize, PiP fallback | P13 | planned | playback/context/socket regression |
| T-1304 | Thanh tác vụ và full-flow Teaching Mode | P13 | planned | browser full-flow + accessibility + E2E |

## Session log
### 2026-08-28 (Phase 12 — T-1202 checkpoint)
- Loại SheetJS `xlsx` có advisory high không có upstream fix; thống nhất ExcelJS cho parse/generate và tải động ở client khi xuất sổ điểm.
- Bổ sung adapter XLSX/CSV, E2E thực cho nhập học viên/chương trình, template và export lớp; sửa route template bị route động che khuất cùng chuẩn hoá tiêu đề tiếng Việt.
- Verify: audit 0 high/critical (2 moderate transitive có ADR), typecheck, server build, clean web build, REST 86/86, Excel route regression, Socket 10/10, regression 16/16, restore restart.

### 2026-08-27 (Phase 8 — T-802 checkpoint 5)
- `CircuitCanvas` publish thay đổi theo event, tách editor engine/render và ổn định callback cho component memo.
- Tách `TeachingModePage` cùng miền teaching trong `ClassDetailPage`; điểm danh dùng reducer và ngày mặc định theo local time.
- Dọn stable key, transition, helper module-scope, handler-only state và 7 export thừa đã xác minh không có consumer.
- React Doctor changed-scope/full-scan 100/100, 0 issue trên 42 file.
- Verify: root typecheck, production build entry 209.78 kB, REST 82/82, Socket 10/10, restore restart và diff check đều pass.
- Persistence complete: commit triển khai `9428836` đã đẩy lên `origin/main`; artefact PID runtime được gitignore.

### 2026-08-27 (Phase 8 — T-802 checkpoint 4)
- Tách `CreateGameTab` theo câu hỏi, Ô chữ, ngữ cảnh, mode và mạch; component chính giảm 484 → 234 dòng.
- Xóa selector lớp và action Ô chữ bị trùng; khóa đường vòng tạo Ô chữ khi dữ liệu chưa hợp lệ.
- Tách `SettingsPage` theo miền; component chính còn 155 dòng và thẻ hệ thống chỉ render cho staff.
- React Doctor changed-scope 100/100; full-scan 62/100 với 23 cảnh báo còn lại.
- Verify: web typecheck, production build, REST 82/82, Socket 10/10 và restore restart đều pass.

### 2026-08-27 (Phase 8 — T-802 checkpoint 3)
- Tách view theo game ở player và sandbox host; đưa Socket/QR/timer lifecycle vào hook có cleanup chính xác.
- `GamePlayPage` giảm 586 → 226 dòng, `HostConsole` giảm còn 249 dòng; sửa câu hỏi chuẩn render trùng trong Giơ tay.
- React Doctor changed-scope đạt 94/100, chỉ còn 2 giant component warning (`CreateGameTab`, `SettingsPage`).
- Verify: web typecheck, production build, REST 82/82, Socket 10/10 và restore restart đều pass.

### 2026-08-27 (Phase 8 — T-802 checkpoint 2)
- Thêm `useFieldReducer`; gom toàn bộ state player và host vào `PlayerGameState`/`HostConsoleState` có kiểu.
- Loại state/listener realtime không được sử dụng và khai báo dependency reducer tường minh.
- React Doctor changed-scope đạt 93/100, chỉ còn 4 giant component warning; full-scan 62/100 với 27 cảnh báo, không error.
- Verify: root typecheck, production build, REST 82/82, Socket 10/10 và restore restart đều pass.

### 2026-08-27 (Phase 8 — T-802 checkpoint 1)
- Thêm typed Socket event scope và chuyển 70 listener host/player sang disposer theo từng event; React Doctor hết 2 error cleanup.
- Sửa auto-join URL bị state update hủy timer trước khi `join`; cờ một lần chuyển sang ref.
- Dùng `Set` cho lookup Bingo/Memory, gộp effect chain, bỏ derived class state và thay index key bằng stable key.
- React Doctor changed-scope 47/37 → 72/6; full-scan 42/61 → 61/29; không còn error.
- Verify: root typecheck, production build, REST 82/82, Socket 10/10 và restore restart đều pass.

### 2026-08-27 (chất lượng UI — Phase 8 batch 1)
- Lazy-load toàn bộ route; entry bundle giảm 528.06 kB → 209.53 kB, SheetJS và màn hình lớn tách chunk.
- Accessibility/security full-scan về 0; modal dùng native dialog, lịch dùng native button, control có nhãn rõ ràng.
- Sửa ref mutation trong render, fetch không kiểm tra status, listener `answer:reveal` trùng và các iteration dư thừa.
- Game dock chế độ giảng dạy render `GamesPage` lazy trực tiếp thay iframe cùng origin.
- React Doctor: changed-scope 47/100 (37 vấn đề), full-scan 42/100 (61 vấn đề); 2 error cleanup còn lại là false-positive đã kiểm chứng bằng code.
- Verify: root typecheck pass; Vite production build pass.

### 2026-08-27 (ổn định nền tảng — Phase 7)
- Bỏ router trùng subject/question/backup; router schedule/media/AI/RAG/system/settings mount theo prefix riêng; Zod/JSON sai trả 400 chuẩn.
- Backup Windows không còn gọi shell; restore/delete chỉ admin, restore được stage và áp dụng an toàn lúc khởi động lại.
- Game bắt buộc enrollment theo `game_sessions.class_id` (migration v18), mọi host event xác thực đúng host; sửa toán hạng Đua toán.
- Sửa ngày lịch lặp theo local date và media audit theo quan hệ lecture → class → teacher.
- Import/copy câu hỏi giữ `subjectId/chapter/lesson/difficulty`; UI import cho chọn đủ ngữ cảnh.
- E2E chạy trên DB tạm qua `DATA_DIR`/`DB_PATH`, dọn sạch sau test và được nối vào CI.
- Verify: typecheck pass; server/web production build pass; REST 82/82; Socket 10/10; restore restart pass.

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

### 2026-08-27 (game tái sử dụng + ngữ cảnh dạy học)
- Bổ sung dữ liệu demo idempotent: 20 câu hỏi kiến thức số cơ bản, một phòng Quick Quiz và một game đã lưu để chạy lại.
- Trang Trò chơi có tab **Lưu sẵn**: lọc theo lớp, chạy lại hoặc xóa game đã lưu. Khi tạo game, GV đặt tên và gắn lớp/môn; danh sách câu hỏi lọc theo môn đã chọn.
- API câu hỏi hỗ trợ lưu/trả về/lọc `subjectId`, `chapter`, `lesson`, `difficulty`; API game kiểm tra quyền lớp/môn và lưu `subject_id`.
- Verify: `npm run typecheck` PASS.

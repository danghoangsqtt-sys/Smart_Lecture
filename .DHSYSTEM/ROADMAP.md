# ROADMAP — Smart_Lecture

## Phase 49 — Default Circuit Room E2E ✅

- [x] Browser E2E creates a default circuit-simulation room through the teacher UI.
- [x] An enrolled student joins the live room and the host starts it.
- [x] The live timer reaches D Flip-Flop → Half Adder → Full Adder in order.

## Phase 50 — Realtime Circuit Submission ✅

- [x] Synchronize learner topology and separate live edits from explicit submission.
- [x] Grade matching circuits authoritatively and publish a realtime completion feed.

## Phase 51 — Multi-Learner Idempotency ✅

- [x] Verify two authenticated learners complete the same challenge independently.
- [x] Prevent repeated correct submissions from duplicating feed rows or KTTX awards.

## Phase 52 — Circuit Learner Recovery ✅

- [x] Synchronize the current challenge for late-joining learners.
- [x] Restore exact current-challenge topology and completion status after reconnect.

## Phase 53 — Circuit Host Recovery ✅

- [x] Reopen the teacher's newest active standalone game after page reload.
- [x] Restore active challenge, completion feed, connected players, and circuit leaderboard through an authorized host snapshot.
- [x] Keep three isolated learner sessions uninterrupted and preserve one-time grading through host reload and learner reconnect.

## Phase 54 — Circuit Server-Restart Recovery ✅

- [x] Persist active challenge/deadline and per-learner circuit state in normalized SQLite tables.
- [x] Restore active circuit rooms and their remaining timers during Node.js startup.
- [x] Allow learner-first reconnect and recover exact topology, completion feed, leaderboard, and score.
- [x] Keep challenge completion and KTTX atomic and idempotent across a real process restart.

## Phase 55 — Circuit Teacher Controls ✅

- [x] Add authorized pause, resume, skip, and restart actions for the current circuit challenge.
- [x] Persist paused state and remaining duration across host reload and Node.js restart.
- [x] Preserve learner topology on pause/resume and preserve completed score/KTTX on restart.
- [x] Cover the host controls in Browser E2E and the paused timer in the real restart integration.

## Phase 56 — Circuit Learner Monitoring ✅

- [x] Show compact realtime progress for every learner in the active circuit challenge.
- [x] Move learner topology updates to a host-only channel and block peer inspection.
- [x] Let the authorized teacher inspect one current topology in a read-only preview.
- [x] Restore monitoring after host reload/server restart and cover it in Browser E2E.

## Phase 57 — Circuit Private Assistance ✅

- [x] Persist authoritative last circuit activity independently from general state writes.
- [x] Highlight inactive in-progress learners without flagging offline/completed/not-started learners.
- [x] Send a private teacher hint or retry request only to the selected learner.
- [x] Preserve topology/timer/grading and cover delivery privacy in restart and Browser E2E.

## Phase 58 — Circuit Assistance Recovery ✅

- [x] Persist the latest assistance checkpoint per learner before delivery.
- [x] Queue assistance for offline learners and redeliver it after reconnect/restart.
- [x] Record explicit learner acknowledgement and restore its status for the host.
- [x] Preserve privacy/topology/grading and cover the lifecycle in restart and Browser E2E.

## Phase 59 — Circuit Support Triage ✅

- [x] Prioritize stuck learners and unacknowledged assistance deterministically.
- [x] Add classroom-scale counts and All/Attention/Pending/Offline filters.
- [x] Let the teacher jump to the oldest learner in the highest active support priority.
- [x] Cover realtime queue transitions in Browser E2E without changing backend contracts.

## Phase 60 — Circuit Submission Diagnostics ✅

- [x] Persist the current challenge's attempt count and latest safe validation checkpoint.
- [x] Keep submission feedback visible for the learner and private from peers.
- [x] Add incorrect-submission priority, count, filter, row badge, and inspection reason for the host.
- [x] Restore diagnostics through reload/process restart and preserve idempotent grading.

## Phase 61 — Circuit Adaptive Pacing ✅

- [x] Show classroom readiness from private progress metadata.
- [x] Add a durable capped 30-second extension for running and paused challenges.
- [x] Let the host evaluate current circuits and advance immediately through the existing grader.
- [x] Cover authorization, restart persistence, and no-duplicate grading in integration tests.

## Phase 62 — Circuit Learning Debrief ✅

- [x] Persist cumulative submitted and incorrect circuit attempts across challenge changes and restart.
- [x] Build one authoritative safe class/learner debrief when the circuit game finishes.
- [x] Persist per-learner debrief details in game results and render the host final summary.
- [x] Cover finalization, privacy, idempotency, and restart durability in integration tests.

## Phase 63 — Circuit Debrief Recovery ✅

- [x] Reconstruct P62 debriefs from validated versioned result details.
- [x] Add host-scoped single/recent retrieval with authorized class filtering.
- [x] Show and expand recent circuit reports after page reload without reopening the room.
- [x] Cover authorization, malformed data, reload, and regression behavior.

## Phase 1 — Nền tảng + Trái tim sản phẩm (MVP giảng dạy)

### P1.1 Hạ tầng & Auth ✅ scaffold
- [x] Monorepo server/ + web/, TS strict cả hai phía
- [x] node:sqlite connection + schema.sql + seed admin
- [x] JWT login/logout/me, change-password, bcrypt, khóa sai liên tiếp
- [x] requireRole middleware; web: router role-based + trang Login + Layout + Dashboard placeholder
- [x] Admin tạo TK giáo viên; GV import học viên Excel (xlsx) + tạo đơn lẻ; đổi MK học viên
- [x] CRUD lớp học + phân công GV + enroll học viên

### P1.2 Thư viện bài giảng
- [x] CRUD lectures (chapter/title/order) + upload materials (multer, whitelist mime)
- [x] Stream video HTTP Range + viewer PDF/PPTX→ảnh preview (pdfjs client)
- [x] Trang học viên xem bài giảng theo lớp; đánh dấu hoàn thành bài

### P1.3 Ngân hàng câu hỏi + AI sinh câu hỏi
- [x] CRUD questions (mcq/essay, bloom cột riêng index, folders, ảnh)
- [x] Filter/search/sort + bulk move/delete (throttle 300ms)
- [x] geminiService resilience layer (queue 1800ms, backoff+jitter, fallback chain)
- [x] POST /ai/generate-questions theo ma trận Bloom + responseSchema
- [x] UI Review-before-save (sửa inline từng câu → phê duyệt hàng loạt)
- [x] Import đề từ text/Word theo format Mau (textExamParser thích ứng)

### P1.4 Soạn đề + thi online
- [x] examEngine: generateExamPaper (Fisher-Yates, originalIndex tracking, strip prefix an toàn)
- [x] ExamCreator: ma trận Bloom → kiểm tra tồn kho → preview → publish (config start/end/password/shuffle/max_attempts/class)
- [x] Attempt lifecycle: in_progress→disconnected→submitted, autosave 5s, resume remaining_sec
- [x] ExamRoom student: timer deadline tuyệt đối, flag câu, review trước nộp, anti-cheat visibilitychange red_flags
- [x] Chấm MCQ tự động (thang 10), essay → pending; GV chấm essay thường + AI hỗ trợ (score+feedback schema)

### P1.5 Games realtime (Phase 1 core)
- [x] Socket.IO room engine: lobby (danh sách HV live), host control, leaderboard
- [x] Game "Trắc nghiệm nhanh" Kahoot-style: đồng bộ câu hỏi, tính điểm tốc độ, podium tổng kết
- [x] Random Picker: bốc ngẫu nhiên 1–2 HV (GV cấu hình số lượng), animation quay, chống lặp lại người vừa được bốc (tùy chọn)
- [x] Ghi điểm game → game_results + đề xuất nhập grades (GV duyệt 1 click)

### P1.6 Sổ điểm & điểm danh
- [x] Gradebook: 3 cột KTTX | Quá trình 1 | KT kết thúc môn (editable, undo gần nhất)
- [x] attendance_sessions theo buổi (periods_total) + records (present/absent/late, periods_absent, reason)
- [x] Tổng hợp: % chuyên cần per student; export Excel (SheetJS): bảng điểm + điểm danh

**Exit criteria P1:** GV dạy trọn buổi thật: mở lớp → HS vào bằng điện thoại → học bài → chơi game → làm KT 10 phút → GV thấy điểm + điểm danh cập nhật.

## Phase 2 — Trí tuệ RAG & đa dạng hóa game
- [x] RAG pipeline đầy đủ (docparse → heading chunks → embedding → sqlite BLOB)
- [x] Chatbot trợ giảng cho GV (trích dẫn tài liệu + trang); rate limit quota guard
- [x] Game kéo co (2 đội), đua toán (tính nhanh), điền chỗ trống — dùng chung engine
- [x] Thống kê Azota-style: phổ điểm, phân tích câu sai, nhận xét AI từng HV
- [x] QR code tham gia (hiện ở dashboard GV, payload URL LAN)

## Phase 3 — Hoàn thiện vận hành
- [x] Backup tự động hằng ngày (zip db + manifest media vào data/backups, giữ 7 bản)
- [x] Auto-start cùng Windows (Task Scheduler script cài sẵn)
- [x] mDNS hostname `smart-lecture.local` (bonjour) + trang /system/info hiện mọi URL truy cập
- [x] Docling sidecar tùy chọn cho PDF scan (cài riêng, app phát hiện và dùng nếu có)
- [x] Đa môn/học kỳ: academic_year filter, archive lớp

## Phase 4 — Tùy chọn tương lai
- [x] Cloudflare Tunnel opt-in cho ôn tập tại nhà (cấu hình admin, cảnh báo bảo mật)
- Vấn đáp giọng nói chấm miệng — deferred, chỉ xem xét tại P16 sau RFC.
- Self-study mode vô hạn lần — đã loại khỏi phạm vi; SmartLecture tập trung tương tác trong lớp.

## Phụ thuộc & rủi ro roadmap
| Rủi ro | Giảm thiểu |
|---|---|
| Quota Gemini free tier cạn | Counters per-feature/day trong SQLite + cảnh báo 80% + queue toàn cục |
| WiFi lớp yếu/không ổn định | Không phụ thuộc Internet khi dạy (AI/RAG là tiện ích, không chặn luồng chính) |
| IP máy GV đổi | P3 mDNS + QR regenerate mỗi boot; khuyến nghị static lease |
| Anti-cheat trên điện thoại hạn chế | Thiết kế trung thực: timer server-side là nguồn sự thật, shuffle, một thiết bị/tài khoản, red-flag chỉ mang tính tham khảo |

## Phase 7 — Ổn định nền tảng ✅

- [x] Chuẩn hóa router/prefix, quyền middleware và lỗi Zod 400.
- [x] Backup/restore Windows an toàn; restore/delete chỉ admin.
- [x] Enrollment gate và host authorization cho game realtime.
- [x] Sửa Đua toán, lịch lặp, media audit và metadata câu hỏi.
- [x] DB test riêng, E2E idempotent và CI.

## Phase 8 — Chất lượng UI sau ổn định ✅

- [x] Tách `GamePlayPage`/`GamesPage` thành reducer + component theo từng game; chuẩn hóa lifecycle Socket.
- [x] Xử lý cảnh báo accessibility và iframe sandbox/autoplay trong React Doctor (full-scan còn 0 accessibility/security).
- [x] Code-split bundle chính: entry 528.06 kB → 209.53 kB; SheetJS tải theo chunk riêng.
- [x] Cổng ổn định UI đạt React Doctor full-scan 100/100; có thể lập milestone mở rộng game/UI tiếp theo sau persistence review.

## Phase 9 — Teaching Session v1 ✅

- [x] Phiên dạy có thể bắt đầu, tiếp tục sau refresh và kết thúc có ghi chú.
- [x] Liên kết một phiên với lớp, môn, mục giáo án và buổi điểm danh; chặn liên kết sai lớp.
- [x] Tự ghi nhận nội dung đã trình chiếu, video/tài liệu đã mở và game đã mở từ chế độ giảng dạy.
- [x] Hiển thị tiến độ và tổng kết phiên gần nhất ngay trên màn hình giảng dạy.
- [x] Regression E2E cho lifecycle phiên dạy và quyền truy cập.

## Phase 10 — Post-lesson Insights v1 ✅

- [x] API tóm tắt theo lớp/môn từ nhật ký phiên dạy và tiến độ chương trình.
- [x] Teaching Hub hiển thị chỉ số hành động cùng các phiên gần đây.
- [x] Regression E2E cho quyền xem và số liệu tổng kết.

## Phase 11 — Game telemetry trong phiên dạy ✅

- [x] Ghi nhận ID và tên game thực tế khi được khởi tạo từ Teaching Mode, không ghi mốc giao diện chung.
- [x] Khóa ngữ cảnh lớp trong Game dock để không trộn game của lớp khác vào một phiên dạy.
- [x] Tổng quan sau tiết hiển thị các game đã dùng dưới tên dễ đọc và có regression cho liên kết này.

## Phase 12 — Release hardening ✅

- [x] Đồng bộ version, metadata và tài liệu vận hành với development target v0.9.0 (P11 functional baseline v0.8.0).
- [ ] Triage/rút bỏ rủi ro dependency Excel mức high bằng ADR và regression.
- [ ] Làm build, healthcheck và lifecycle Windows lặp lại được.
- [ ] Bổ sung browser E2E cho các luồng lớp học trọng yếu.

**Exit criteria P12:** không còn high/critical dependency chưa triage; typecheck, build sạch, API/Socket/browser E2E, backup/restore và Windows runbook đều đạt.

## Phase 13 — Teaching Continuity Canvas ✅

- [ ] Presentation canvas cho PDF và PPTX đã chuyển đổi: điều hướng trang, zoom, fullscreen và fallback minh bạch.
- [ ] Pen, highlight, khoanh tròn, gạch chân, laser, tẩy, undo/redo trên lớp overlay không sửa tệp nguồn.
- [ ] Video dock chạy liên tục, kéo thả/thu nhỏ và Picture-in-Picture có fallback.
- [ ] Game dock dùng chung activity shell, giữ lớp/môn và không ngắt Teaching Mode.

**Exit criteria P13:** giáo viên có thể hoàn thành chuỗi slide → chú thích → video → game → quay lại slide trong một phiên dạy, không mất state hoặc telemetry trùng.

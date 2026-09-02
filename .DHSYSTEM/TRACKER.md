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
| T-1301 | Presentation Canvas PDF/PPTX theo trang | P13 | done | PDF.js canvas + build/typecheck |
| T-1302 | Annotation: pen, highlight, shape, laser, undo/redo | P13 | done | SVG overlay + session persistence + typecheck |
| T-1303 | Video/Game Continuity Dock kéo thả, minimize, PiP fallback | P13 | done | draggable docks + PiP fallback + E2E regression |
| T-1304 | Thanh tác vụ và full-flow Teaching Mode | P13 | done | Teaching Mode Browser E2E + build + E2E regression |

## Phase 14 — Post-lesson Reporting

| ID | Task | Phase | Status | Verify |
|---|---|---|---|---|
| T-1401 | Hợp đồng báo cáo sau tiết, chất lượng dữ liệu và phân quyền | P14 | done | API reconciliation + authorization regression |
| T-1402 | Báo cáo giáo viên và xuất XLSX/CSV có xác thực | P14 | done | Browser/export workflow |

## Phase 15 — PPTX Readiness

| ID | Task | Phase | Status | Verify |
|---|---|---|---|---|
| T-1501 | Tự phát hiện/chuyển đổi PPTX an toàn, có phân quyền | P15 | done | REST regression |
| T-1502 | Khôi phục chuyển đổi PPTX trực tiếp trong Teaching Mode | P15 | done | Browser workflow |

## Phase 16 — Classroom Preflight

| ID | Task | Phase | Status | Verify |
|---|---|---|---|---|
| T-1601 | Kiểm kê mức sẵn sàng theo lớp/môn có phân quyền | P16 | done | REST scope regression |
| T-1602 | Thẻ preflight trước khi vào Teaching Mode | P16 | done | Browser workflow |

## Phase 17 — PowerPoint Converter Preflight

| ID | Task | Phase | Status | Verify |
|---|---|---|---|---|
| T-1701 | Hiển thị trạng thái LibreOffice đã cache trong preflight | P17 | done | REST regression |
| T-1702 | Chỉ dẫn cài đặt/chuyển đổi trực quan cho giáo viên | P17 | done | Browser workflow |

## Phase 18 — Teaching Workspace Recovery

| ID | Task | Phase | Status | Verify |
|---|---|---|---|---|
| T-1801 | Lưu/khôi phục ngữ cảnh workspace theo phiên trình duyệt | P18 | done | Typecheck + guarded restore |
| T-1802 | Hồi quy reload Teaching Mode không mất game dock | P18 | done | Browser workflow |

## Phase 19 — Presentation Canvas Validation

| ID | Task | Phase | Status | Verify |
|---|---|---|---|---|
| T-1901 | PDF thật trong Browser E2E | P19 | done | Canvas render + pointer annotation |
| T-1902 | Hồi quy persistence chú thích sau reload | P19 | done | Browser reload workflow |

## Phase 20 — Presentation Pointer Toolbar

| ID | Task | Phase | Status | Verify |
|---|---|---|---|---|
| T-2001 | Thanh Tia laser/Bút lông/Highlight khi trình chiếu | P20 | done | Browser annotation workflow |
| T-2002 | Các công cụ chú thích mở rộng có nhãn truy cập | P20 | done | Accessibility names |

## Phase 21 — Ink colors and per-stroke eraser

| ID | Task | Phase | Status | Verify |
|---|---|---|---|---|
| T-2101 | Màu bút lông/highlight được lưu theo từng nét | P21 | done | Browser PDF canvas + reload |
| T-2102 | Tẩy từng nét và preflight PPTX không chặn Teaching Hub | P21 | done | Browser E2E + REST 86/86 + regression 22/22 |

## Phase 22 — Non-interrupting game dock

| ID | Task | Phase | Status | Verify |
|---|---|---|---|---|
| T-2201 | Không tự bật hướng dẫn game che workspace giảng dạy | P22 | done | typecheck + production build + Browser E2E 2/2 |

## Phase 23 — Background video dock

| ID | Task | Phase | Status | Verify |
|---|---|---|---|---|
| T-2301 | Video thu nhỏ vẫn phát và được khôi phục theo workspace | P23 | done | typecheck + production build + Browser E2E 2/2 |

## Phase 24 — Presenter shortcuts

| ID | Task | Phase | Status | Verify |
|---|---|---|---|---|
| T-2401 | Phím tắt L/P/H/E cho công cụ trình chiếu | P24 | done | typecheck + production build + Browser E2E 2/2 |

## Phase 25 — Persistent dock layout

| ID | Task | Phase | Status | Verify |
|---|---|---|---|---|
| T-2501 | Lưu vị trí kéo-thả của khung video và game | P25 | done | typecheck + production build + Browser E2E 2/2 |

## Phase 26 — Persistent ink preferences

| ID | Task | Phase | Status | Verify |
|---|---|---|---|---|
| T-2601 | Nhớ riêng màu bút lông và highlight theo tài liệu | P26 | done | typecheck + production build + Browser E2E 2/2 |

## Phase 27 — Annotation undo/redo history

| ID | Task | Phase | Status | Verify |
|---|---|---|---|---|
| T-2701 | Hoàn tác/làm lại đúng cho vẽ và tẩy từng nét | P27 | done | typecheck + production build + Browser E2E 2/2 |

## Phase 28 — Clear-page history

| ID | Task | Phase | Status | Verify |
|---|---|---|---|---|
| T-2801 | Hoàn tác/làm lại khi xóa toàn bộ nét của trang | P28 | done | typecheck + production build + Browser E2E 2/2 |

## Phase 29 — Stable annotation storage

| ID | Task | Phase | Status | Verify |
|---|---|---|---|---|
| T-2901 | Lưu chú thích theo mã học liệu, không theo URL token | P29 | done | typecheck + production build + Browser E2E 2/2 |

## Phase 30 — Annotation reducer quality

| ID | Task | Phase | Status | Verify |
|---|---|---|---|---|
| T-3001 | Reducer thuần cho chú thích và cleanup kéo-thả | P30 | done | typecheck + build + Browser E2E 2/2 + React Doctor 73, 0 errors |
| T-3101 | Lưu mốc phát video và khôi phục an toàn sau reload | P31 | done | typecheck + build + Browser E2E 2/2 + React Doctor 84, 0 errors |
| T-3201 | Giữ dock video/game trong vùng nhìn thấy khi đổi viewport | P32 | done | build + Browser E2E 2/2 + React Doctor 84, 0 errors |
| T-3301 | Mở lại video nổi đang chạy mà không reset mốc phát | P33 | done | build + Browser E2E 2/2 + React Doctor 84, 0 errors |
| T-3401 | Chọn đúng video trong bài giảng nhiều video | P34 | done | build + Browser E2E 2/2 + React Doctor 84, 0 errors |
| T-3501 | Giữ thanh công cụ bút/laser trong fullscreen trình chiếu | P35 | done | build + Browser E2E 2/2 + React Doctor 77, 0 errors |
| T-3601 | Phím tắt khoanh tròn, gạch chân và đường thẳng | P36 | done | build + Browser E2E 2/2 + React Doctor 77, 0 errors |
| T-3701 | Không mất nét bút khi pointer/touch thao tác nhanh | P37 | done | build + Browser E2E 2/2 + React Doctor 77, 0 errors |
| T-3801 | Telemetry slide chỉ ghi PDF/PPTX, không ghi nhầm link | P38 | done | build + Browser E2E 2/2 + React Doctor 84, 0 errors |
| T-3901 | Chọn màu trực tiếp cho khoanh tròn/gạch chân/đường thẳng | P39 | done | build + Browser E2E 2/2 + React Doctor 77, 0 errors |
| T-4001 | Mở rộng thư viện SVG mạch với diode, relay, MOSFET N và MUX 2:1 | P40 | done | typecheck + build + Browser E2E 2/2 + React Doctor 100/100 |
| T-4101 | Tách bộ giải logic thành adapter thay thế được, giữ nguyên Canvas và CircuitData | P41 | done | typecheck + MUX truth table 8/8 + Browser E2E 2/2 + React Doctor 100/100 |
| T-4201 | Đánh giá độc lập engine WASM/giấy phép và chốt không tích hợp Logigator | P42 | done | npm registry + GitHub source review; native adapter retained |
| T-4301 | Thêm Half/Full Adder SVG và mô phỏng nhiều đầu ra trong adapter native | P43 | done | typecheck + HA 4/4 + FA 8/8 + Browser E2E 2/2 + React Doctor 100/100 |
| T-4401 | Thêm D Flip-Flop cạnh lên và trạng thái simulation-tick ngoài React render | P44 | done | typecheck + DFF edge-state test + Browser E2E 2/2 + React Doctor 100/100 |
| T-4501 | Thêm bài tập mẫu D Flip-Flop/Clock/Probe vào game mô phỏng mặc định | P45 | done | typecheck + Browser E2E 2/2 + React Doctor 100/100 |
| T-4601 | Thêm bài mẫu Half/Full Adder với LED/Probe vào game mô phỏng mặc định | P46 | done | typecheck + Browser E2E 2/2 + React Doctor 100/100 |
| T-4701 | Thêm hướng dẫn giảng dạy sáu thử thách mạch mặc định cho giáo viên | P47 | done | typecheck + Browser E2E 2/2 + React Doctor 100/100 |
| T-4801 | Thêm Browser E2E trực tiếp cho setup/guide sáu bài mạch mặc định | P48 | done | Browser E2E 3/3 |
| T-4901 | Thêm Browser E2E cho room mạch mặc định và thứ tự DFF/adder thực | P49 | done | Browser E2E 4/4 |
| T-5001 | Đồng bộ topology, nộp/chấm mạch mô phỏng và feed hoàn thành realtime | P50 | done | typecheck + Browser E2E 4/4 + backend E2E 86/86 + Socket 10/10 + regression 22/22 |
| T-5101 | Kiểm chứng hai học viên và chống cộng trùng khi nộp lại mạch đúng | P51 | done | Browser E2E 4/4; feed mỗi học viên 1 lần; KTTX mỗi học viên +0.5 |
| T-5201 | Khôi phục challenge, topology và trạng thái hoàn thành khi học viên vào muộn/kết nối lại | P52 | done | typecheck + Browser E2E 4/4 + React Doctor 100 + backend regression đầy đủ |
| T-5301 | Khôi phục console giáo viên, feed và bảng điểm mạch khi reload/kết nối lại | P53 | done | typecheck + Browser E2E 4/4 + React Doctor 100 + REST 86/86 + Socket 10/10 + regression 22/22 |
| T-5401 | Lưu và khôi phục phòng mạch đang chạy sau khi Node.js server khởi động lại | P54 | done | migration v19 + real restart integration + Browser 4/4 + REST 86/86 + Socket 10/10 + regression 22/22 |
| T-5501 | Điều khiển tạm dừng, tiếp tục, bỏ qua và làm lại challenge mạch có lưu trạng thái | P55 | done | migration v20 + paused restart + Browser 4/4 + React Doctor 100 + REST 86/86 + Socket 10/10 + regression 22/22 |
| T-5601 | Giám sát tiến độ và xem topology hiện tại từng học viên qua kênh riêng của host | P56 | done | private Socket + restart inspection/privacy + Browser 4/4 + React Doctor 100 + REST 86/86 + Socket 10/10 + regression 22/22 |
| T-5701 | Theo dõi hoạt động cuối và gửi gợi ý/yêu cầu kiểm tra lại riêng tư cho học viên mạch | P57 | done | migration v21 + selected-only hint/retry + restart privacy + Browser 4/4 + React Doctor 100 + REST 86/86 + Socket 10/10 + regression 22/22 |
| T-5801 | Lưu, giao lại và xác nhận hỗ trợ riêng mới nhất cho học viên mạch | P58 | done | migration v22 + offline queue/reconnect ACK + restart learner-first recovery + Browser 4/4 + React Doctor 100 + full regression |
| T-5901 | Hàng đợi ưu tiên và bộ lọc hỗ trợ học viên mạch cho lớp đông | P59 | done | derived triage + counts/filters/next learner + Browser 4/4 + React Doctor 100 + full regression |
| T-6001 | Lưu và hiển thị chẩn đoán lần nộp mạch hiện tại cho học viên/giáo viên | P60 | done | migration v23 + learner persistent feedback + host incorrect triage + Browser 4/4 + React Doctor 100 + full regression |
| T-6101 | Điều chỉnh nhịp độ challenge mạch theo mức sẵn sàng của lớp | P61 | done | readiness + durable capped +30s + evaluate-now + Browser 4/4 + React Doctor 100 + full regression |
| T-6201 | Tổng kết học tập mạch theo lớp và từng học viên khi kết thúc game | P62 | done | migration v24 + realtime/result debrief + Browser 4/4 + React Doctor 100 + full regression |

## Session log
### 2026-09-01 (Phase 62 — T-6201 completed)
- Migration v24 giữ tổng lượt nộp/chưa đạt xuyên challenge và restart; live edit, timer và host evaluate không làm tăng counter.
- Kênh host-only phát debrief lớp/học viên an toàn trước `game:finished`; transaction kết thúc ghi detail theo learner ID và cập nhật idempotent, không chứa topology/feedback.
- Host có thẻ tổng quan và bảng kết quả mạch; Browser đi đến màn hình cuối, restart test kiểm tra trực tiếp SQLite.
- Verify: typecheck/build, React Doctor 100/100, Browser 4/4, REST 86/86, Socket 10/10, security/data 22/22, restore và circuit restart/debrief đều pass.

### 2026-09-01 (Phase 62 — T-6201 started)
- Chốt debrief an toàn gồm tiến độ hoàn thành, tổng lượt nộp/chưa đạt và điểm; không chứa topology, reference circuit, feedback hay tin hỗ trợ.
- Cumulative counter chỉ tăng khi học viên chủ động nộp, không tăng do live edit, timer hoặc host evaluate; tồn tại xuyên challenge/restart.
- Doc-first gate hoàn tất; chuẩn bị migration v24, finish payload/result persistence, UI và Browser/process-restart coverage.

### 2026-09-01 (Phase 61 — T-6101 completed)
- Host thấy tỷ lệ hoàn thành online, số đã nộp/chưa đạt và thanh readiness mà không tải topology.
- `extend` cộng đúng 30 giây khi chạy hoặc pause, cap 10 phút, persist/reschedule/broadcast từ server; `evaluate` dùng evaluator hiện hữu rồi chuyển bài.
- Browser xác nhận host/learner đồng bộ thời gian và chấm–chuyển nhanh; restart xác nhận learner không thể giả mạo action, thời lượng mở rộng được phục hồi và KTTX không trùng.
- Verify: typecheck/build, React Doctor 100/100, Browser 4/4, REST 86/86, Socket 10/10, security/data 22/22, restore và circuit restart pacing đều pass.

### 2026-09-01 (Phase 61 — T-6101 started)
- Chốt hai action host-only: gia hạn đúng 30 giây có cap 10 phút và chấm/chuyển ngay qua evaluator hiện hữu.
- Readiness chỉ derive từ progress metadata; không bulk-load topology và không thêm migration.
- Doc-first gate hoàn tất; chuẩn bị realtime/UI cùng Browser/process-restart coverage.

### 2026-09-01 (Phase 60 — T-6001 completed)
- Migration v23 lưu số lần nộp, thời điểm, mã và phản hồi validation gần nhất theo challenge; chỉ `submitted=true` tạo attempt và checkpoint reset khi chuyển/làm lại challenge.
- Học viên có panel kết quả bền; host ưu tiên/lọc “Nộp chưa đạt”, thấy số lần và lý do an toàn trên row/inspection mà không nhận reference topology.
- Browser chứng minh sai → lọc/chẩn đoán → sửa đúng → nộp lặp không cộng KTTX; restart phục hồi chính xác checkpoint cho learner và host.
- Verify: typecheck/build, React Doctor 100/100, Browser 4/4, REST 86/86, Socket 10/10, security/data 22/22, restore và circuit restart đều pass.

### 2026-09-01 (Phase 60 — T-6001 started)
- Chốt checkpoint giới hạn theo challenge: số lần nộp, thời điểm, mã kết quả và phản hồi an toàn; không lưu lịch sử vô hạn hay lộ mạch mẫu.
- Bài nộp gần nhất chưa đạt sẽ trở thành tín hiệu triage riêng của host; học viên có panel phản hồi bền thay cho toast-only.
- Doc-first gate hoàn tất; chuẩn bị migration v23, recovery, Browser và restart coverage.

### 2026-09-01 (Phase 59 — T-5901 completed)
- Console giáo viên tự sắp học viên theo stuck online → queued offline → delivered chờ xác nhận → disconnected → trạng thái còn lại; trong cùng mức ưu tiên, học viên chờ lâu nhất đứng trước rồi tie-break theo tên.
- Bổ sung số lượng, bộ lọc Tất cả/Cần xử lý/Chờ xác nhận/Ngoại tuyến, trạng thái hỗ trợ trên từng hàng và nút chuyển nhanh đến học viên cần hỗ trợ tiếp theo.
- Không thêm schema hay Socket event; Browser E2E đạt 4/4, React Doctor 100/100, REST 86/86, Socket 10/10, security/data 22/22 và restart PASS.

### 2026-09-01 (Phase 59 — T-5901 started)
- Chốt thứ tự ưu tiên: stuck online → queued offline → delivered chờ xác nhận → disconnected → trạng thái còn lại; ưu tiên hoạt động cũ nhất rồi tie-break theo tên.
- Triage chỉ derive từ progress/P58 checkpoint, không thêm schema/event và không tải topology hàng loạt.
- Doc-first gate hoàn tất; chuẩn bị counts, filters, next-attention và Browser E2E.

### 2026-09-01 (Phase 58 — T-5801 completed)
- Migration v22 lưu checkpoint hỗ trợ mới nhất theo session/học viên; persist trước phát và thay thế có kiểm soát khi giáo viên gửi tin mới.
- Học viên offline nhận trạng thái queued, reconnect tự nhận đúng tin một lần trên connection, bấm “Đã hiểu” để ghi acknowledged; host reload phục hồi trạng thái này.
- Restart integration xác nhận learner-first reconnect/ACK trước host attach; Browser ba học viên xác nhận queue → delivery → ACK không rò peer và không đổi topology/KTTX.
- Verify: typecheck/build, React Doctor 100/100, Browser 4/4, REST 86/86, Socket 10/10, regression 22/22, Excel, staged restore và circuit assistance restart đều pass.

### 2026-09-01 (Phase 58 — T-5801 started)
- Chốt mô hình checkpoint mới nhất theo session/học viên, không mở rộng thành lịch sử hội thoại đầy đủ.
- Tin được persist trước khi gửi; offline chuyển sang queued, reconnect chuyển delivered, học viên bấm “Đã hiểu” để acknowledged.
- Doc-first gate hoàn tất; chuẩn bị migration v22, host recovery snapshot và E2E offline/restart.

### 2026-09-01 (Phase 57 — T-5701 completed)
- Migration v21 lưu epoch thao tác cuối độc lập với `updated_at`; progress host hiển thị tuổi hoạt động và chỉ đánh dấu “Cần hỗ trợ” cho học viên online đang làm sau 10 giây.
- Giáo viên gửi hint tối đa 300 ký tự hoặc yêu cầu kiểm tra lại trực tiếp tới đúng socket học viên được chọn; host nhận ACK giao/không giao và peer không nhận payload.
- Tin hỗ trợ không đổi topology, timer, completion, circuit score hay KTTX; learner không thể giả mạo event giáo viên và state phục hồi đúng sau restart.
- Verify: typecheck/build, React Doctor 100/100, Browser 4/4, REST 86/86, Socket 10/10, regression 22/22, Excel, staged restore và circuit restart assistance đều pass.

### 2026-09-01 (Phase 57 — T-5701 started)
- Chốt mốc “Cần hỗ trợ” sau 10 giây không thao tác đối với học viên đang làm; loại trừ chưa bắt đầu, hoàn thành và mất kết nối.
- Gợi ý/yêu cầu kiểm tra lại chỉ gửi trực tiếp tới socket học viên được chọn và không reset topology/điểm.
- Doc-first gate hoàn tất; chuẩn bị migration v21, UI hỗ trợ riêng và E2E privacy/restart.

### 2026-09-01 (Phase 56 — T-5601 completed)
- Host nhận progress gọn theo từng học viên và chỉ tải topology đầy đủ khi bấm xem; preview cập nhật live nhưng không tác động timer/challenge.
- Loại event topology khỏi room chung; subscription inspection gắn theo từng host socket và học viên không thể tự gọi xem mạch.
- Progress/inspection khôi phục qua host reload và restart process; trạng thái disconnect/reconnect cập nhật realtime.
- Verify: typecheck/build, React Doctor 100/100, Browser 4/4, REST 86/86, Socket 10/10, regression 22/22, Excel, staged restore và circuit restart monitoring đều pass.

### 2026-09-01 (Phase 55 — T-5501 completed)
- Migration v20 lưu pause/remaining; host có bốn control được xác thực và cả giáo viên/học viên đều nhận trạng thái pacing server-authoritative.
- Pause/resume không reset topology; skip không chấm; restart reset workspace hiện tại nhưng giữ completion, circuit score và KTTX.
- Restart hai process giữ pause qua deadline cũ rồi resume đúng thời lượng; ba học viên vẫn nộp mạch khi pause và không bị cộng điểm trùng.
- Verify: typecheck/build, React Doctor 100/100, Browser 4/4, REST 86/86, Socket 10/10, regression 22/22, Excel, staged restore và circuit paused-restart đều pass.

### 2026-08-31 (Phase 54 — T-5401 completed)
- Migration v19 thêm runtime theo phiên và state riêng từng học viên, tránh ghi lại JSON toàn lớp khi một người sửa mạch.
- Server boot tự khôi phục phòng mạch đang chạy và timer theo deadline tuyệt đối; học viên có thể reconnect bằng room code trước host.
- Hoàn thành challenge và cộng KTTX được ghi cùng transaction; test restart giữ đúng topology 4/3, feed, 100 điểm và KTTX 0,5 rồi chuyển challenge theo deadline cũ.
- Verify: Browser E2E 4/4, REST 86/86, Socket 10/10, regression 22/22, Excel, staged restore restart và circuit restart đều pass.

### 2026-08-31 (Phase 53 — T-5301 completed)
- `/games` tự mở lại phiên đang hoạt động sau reload và chỉ phát `game:host-attach` sau khi đã đăng ký đủ listener.
- Server trả snapshot công khai của challenge, feed hoàn thành dựng lại và bảng xếp hạng lấy đúng điểm circuit player; không lộ reference circuit.
- Browser E2E tách giáo viên/ba học viên thành bốn context xác thực độc lập, reload thật console giáo viên mà không ngắt socket học viên.
- Verify: Browser E2E 4/4, React Doctor 100/100, REST 86/86, Socket 10/10, regression 22/22, Excel và restore restart đều pass.

### 2026-08-31 (Phase 52 — T-5201 completed)
- Học viên vào sau khi bắt đầu được tạo state mô phỏng và nhận ngay challenge hiện tại.
- Topology được gắn `challengeId`, khôi phục đúng 4 linh kiện/3 dây khi reconnect và không rò mạch sang challenge kế tiếp.
- Client phục hồi trạng thái đã hoàn thành bằng banner ổn định, không phát sinh cộng điểm/KTTX lần hai.
- Browser E2E nâng lên ba học viên, gồm late join và reconnect; React Doctor 100/100; REST 86/86, Socket 10/10, regression 22/22 đều pass.

### 2026-08-31 (Phase 51 — T-5101 completed)
- Mở rộng room mạch trình duyệt thành hai học viên đã xác thực và ghi danh thật.
- Cả hai dựng topology LED hoàn chỉnh; học viên đầu nộp lặp để kiểm chứng idempotency theo challenge.
- Feed giáo viên chỉ ghi một dòng mỗi học viên và gradebook chỉ cộng đúng +0.5 KTTX/người.
- Verify: production Browser E2E 4/4, gồm chuỗi DFF/Half Adder/Full Adder.

### 2026-08-31 (Phase 50 — T-5001 completed)
- Đồng bộ thay đổi mạch mô phỏng và tách rõ live edit với thao tác nộp để chỉ chấm/cộng điểm khi học viên chủ động gửi.
- Chuẩn hoá bộ chấm topology cho cả endpoint `component::port` và payload tách `component`/`port`; giữ feed giáo viên qua các lần chuyển thử thách.
- Browser E2E dựng thật mạch VCC → Switch → LED → GND, xác nhận topology, phản hồi học viên/giáo viên và chuỗi DFF/Half Adder/Full Adder.
- Verify: typecheck, production Browser E2E 4/4, REST 86/86, Socket 10/10, security/data regression 22/22, Excel/restore pass; React Doctor 0 errors (4 advisory đã rà soát).

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

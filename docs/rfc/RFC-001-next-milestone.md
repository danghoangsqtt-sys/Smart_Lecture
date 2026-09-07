# RFC-001: Hướng phát triển tiếp theo sau P70

- **Ngày:** 2026-09-06
- **Trạng thái:** Proposed — chờ quyết định
- **Tác giả:** Phiên làm việc agent (theo yêu cầu người dùng, hạng mục 3/3)
- **Loại quyết định:** Decision gate theo `docs/PLAN.md` (khung gốc gọi đây là P16 — "Mở rộng có chọn lọc: chỉ chọn một hướng có bằng chứng nhu cầu")

## Vì sao cần RFC này

`.DHSYSTEM/ROADMAP.md` và `TRACKER.md` xác nhận **P1–P70 đã hoàn thành** (xem session 2026-09-06 trong TRACKER — không còn task nào `doing`/`in-progress`). SmartLecture ở trạng thái này đã là một LMS tương tác lớp học rất đầy đủ: quản lý lớp/học liệu/câu hỏi/thi, 9 loại game realtime (kể cả phòng lab mô phỏng mạch điện tử số đầy đủ với hệ thống theo dõi/hỗ trợ học viên riêng), sổ điểm, điểm danh, RAG chatbot, backup/restore, presentation canvas liên tục. `docs/PLAN.md` gốc (viết tại P12, 2026-08-28) tự đặt ra quy tắc: **không mở rộng scope tiếp mà không có RFC được duyệt**, và **chỉ chọn một hướng có bằng chứng nhu cầu thật** — không mở rộng lan man.

Đây chính là thời điểm đó. Tài liệu này liệt kê các hướng khả dĩ, đánh giá bằng chứng/rủi ro/chi phí, và đề xuất — nhưng **không tự triển khai bất cứ gì cho tới khi có quyết định của chủ dự án**, đúng tinh thần quy tắc mà chính dự án đặt ra.

## Ràng buộc không đổi (nhắc lại từ PROJECT-CONTEXT/SPEC)

- Local-first, offline-first cho luồng dạy chính; AI chỉ là tiện ích tăng cường, không được chặn tiết dạy.
- Không mở rộng thành LMS multi-tenant qua Internet; không có Electron; không giám sát chống gian lận tuyệt đối.
- Self-study không giới hạn đã bị loại khỏi phạm vi (quyết định D1–D8 tại brainstorm 2026-08-23) — **không đề xuất lại hướng này**.
- Component React ≤300 dòng, không props drilling sâu >2 tầng, mọi thay đổi phải giữ nguyên hợp đồng realtime/API đã có người dùng.

## Các hướng đang được cân nhắc

### A — Vấn đáp giọng nói chấm miệng (đã được chính dự án ghi nhận trước)

`ROADMAP.md` Phase 4 ghi rõ: *"Vấn đáp giọng nói chấm miệng — deferred, chỉ xem xét tại P16 sau RFC."* Đây là hướng duy nhất trong danh sách này **đã được đội dự án chủ động cân nhắc từ trước** thay vì do agent tự đề xuất.

- **Mô tả:** học viên trả lời câu hỏi bằng giọng nói (ghi âm trên trình duyệt), server dùng Gemini (audio input) để phiên âm + chấm/gợi ý điểm, giáo viên duyệt.
- **Bằng chứng nhu cầu:** chỉ có tín hiệu gián tiếp (đội dự án từng nghĩ tới) — **chưa có xác nhận từ giáo viên thật rằng đây là nhu cầu ưu tiên**.
- **Rủi ro:**
  - Phụ thuộc Gemini hoàn toàn (không có fallback offline cho nhận dạng giọng nói thật) — chấp nhận được nếu coi đây là tính năng "opt-in nâng cao" giống RAG chat, không phải luồng chính.
  - Ghi âm học viên là dữ liệu nhạy cảm hơn text — cần rà lại SYSTEM-RULES §4 (bảo mật) trước khi lưu trữ audio, có thể cần chính sách xoá tự động.
  - Giao diện ghi âm trên trình duyệt (nhiều thiết bị điện thoại HV khác nhau) có rủi ro tương thích chưa được kiểm chứng.
- **Chi phí ước tính:** trung bình–cao (tính năng mới hoàn toàn: ghi âm client, upload, pipeline audio→text→chấm, migration schema, UI mới cho GV duyệt).

### B — Củng cố chất lượng mã & khả dụng lớp học quy mô (đúng tinh thần P15 gốc)

Đây là hướng duy nhất có **bằng chứng cụ thể phát sinh ngay trong phiên làm việc này**, không phải suy đoán:

- `npx react-doctor` full-scan hiện tại: **68/100**, 15 issue — tập trung ở độ phức tạp cao (`CircuitCanvas.tsx`, `GamePlayPage.tsx`, `TeachingModePage.tsx`, `ClassDetailPage.tsx`, `EventModal.tsx`) và 2 vấn đề derived-state/pass-data-to-parent trong `CircuitCanvas.tsx`.
- Chưa từng có benchmark thật cho 40–60 kết nối game đồng thời trên LAN thật (mục tiêu thiết kế trong SPEC.md §1: "tối đa 60 thiết bị đồng thời trong một phòng game") — hiện chỉ được xác minh qua Browser E2E vài học viên giả lập, không phải tải thật.
- **Rủi ro nếu bỏ qua:** nợ kỹ thuật tích lũy thêm ở đúng những file lớn nhất/quan trọng nhất (circuit lab, game play) sẽ ngày càng khó refactor an toàn; sự cố ở quy mô lớp thật (40+ máy) có thể chỉ lộ ra khi đã dạy thật, tốn kém hơn nhiều để sửa sau đó.
- **Chi phí ước tính:** thấp–trung bình, chia nhỏ được theo từng file/rule (đúng khuyến nghị của chính react-doctor: "fix a representative sample first... don't mass-fix a broad pattern in one unreviewed pass").
- **Không phải tính năng mới** — không vi phạm "không mở rộng lan man", đây là củng cố nền đã có.

**Cập nhật 2026-09-07 — đã chạy benchmark LAN (`node scripts/lan-benchmark.mjs 20 40 60`):**

| Tier | Join wall-clock (tất cả HV) | Connect+join latency (p50/p95/max) | Question broadcast reach (p50/p95/max) | Thành công |
|---|---|---|---|---|
| 20 học viên | 24ms | 6/9/9ms | 4/4/4ms | 20/20 |
| 40 học viên | 33ms | 10/14/14ms | 3/3/3ms | 40/40 |
| 60 học viên | 60ms | 18/30/31ms | 4/4/4ms | 60/60 |

Server xử lý tốt ở cả 3 tier, không mất kết nối, độ trễ tăng gần tuyến tính theo số kết nối (không có dấu hiệu nghẽn cổ chai). **Lưu ý quan trọng:** benchmark này mô phỏng toàn bộ học viên từ một tiến trình Node trên `localhost` — đo đúng "trần" xử lý đồng thời của server (event loop + Socket.IO broadcast), **không đo được biến động WiFi/thiết bị thật trên LAN thật** (điều mà mục tiêu gốc P15 "Benchmark 20/40/60 kết nối game trên LAN" nhắm tới). Cần một buổi kiểm thử tại lớp học thật với thiết bị thật để xác nhận đầy đủ mục tiêu SPEC.md §1; phần server-side đã được xác nhận không phải là điểm nghẽn.

### C — Game/tương tác mới

Sản phẩm đã có 9 loại game (Quick Quiz, kéo co, đua toán, giơ tay, ô chữ, bingo, memory match, xếp chữ, quiz show) cộng phòng lab mạch điện tử. **Không có bằng chứng cụ thể nào cho thấy cần thêm loại game mới** — đề xuất thêm bây giờ sẽ chính là kiểu "mở rộng lan man" mà `docs/PLAN.md` cảnh báo. Không khuyến nghị trừ khi có yêu cầu cụ thể từ giáo viên sử dụng thật.

### D — Tích hợp hệ thống khác

Không có hệ thống đích cụ thể nào được nêu ở bất kỳ tài liệu nào của dự án. Ngoài phạm vi hiện tại theo SPEC.md §1 ("Không thuộc phạm vi hiện tại: LMS Internet nhiều tenant"). Không khuyến nghị.

### E — Giữ nguyên, không mở milestone mới

Một lựa chọn hợp lệ: sản phẩm đã rất đầy đủ cho quy mô 1–10 giáo viên/20–60 học viên như SPEC.md xác định; có thể **tạm dừng mở rộng scope, chỉ vá lỗi phát sinh từ sử dụng thực tế**, cho tới khi có phản hồi giáo viên cụ thể. Đây là lựa chọn "chi phí thấp nhất" và phù hợp nhất với tinh thần "cần bằng chứng nhu cầu" nếu hiện tại chưa có phản hồi nào.

## Đề xuất

Không có đủ bằng chứng nhu cầu thật (từ giáo viên đang dùng) cho A, C, hay D — đúng tiêu chí mà chính `docs/PLAN.md` đặt ra để KHÔNG triển khai chúng ngay. Trong hai lựa chọn còn lại (B và E), **B (củng cố chất lượng B) là lựa chọn có ROI rõ nhất** vì:

1. Bằng chứng đã có sẵn, cụ thể, đo được (react-doctor 68/100, chưa benchmark LAN) — không cần chờ thu thập thêm dữ liệu.
2. Rủi ro thấp, không đổi hợp đồng API/UI người dùng đã quen.
3. Nếu sau này quyết định làm A, nền tảng code sạch hơn (đặc biệt `CircuitCanvas.tsx`, nơi A cũng sẽ động vào nếu ghép giọng nói vào luồng thi) sẽ giảm rủi ro cho chính A.

**Đề xuất cụ thể nếu B được duyệt:** chia thành các batch nhỏ độc lập, mỗi batch một file/rule, verify đầy đủ (typecheck/build/E2E/Browser/react-doctor changed-scope) trước khi sang batch kế — đúng khuyến nghị chính thức của react-doctor, tránh "một lượt sửa lan man không review được".

**Nếu chủ dự án có phản hồi giáo viên xác nhận nhu cầu vấn đáp giọng nói (A)** thì nên ưu tiên A trước B, vì A tạo giá trị người dùng trực tiếp còn B là đầu tư nội bộ.

## Việc cần quyết định

Trả lời câu hỏi sau để agent/dev tiếp theo biết bắt đầu từ đâu:

1. Chọn hướng: **A**, **B**, **E**, hay kết hợp (ví dụ B trước rồi A sau)?
2. Nếu chọn A: có phản hồi/nhu cầu cụ thể nào từ giáo viên chưa, hay vẫn là giả thuyết?
3. Nếu chọn B: có muốn ưu tiên file nào trước trong 5 file react-doctor đã liệt kê, hay để agent tự chọn theo mức độ phức tạp giảm dần?

## Không phải phạm vi RFC này

- Không đề xuất self-study không giới hạn (đã loại khỏi phạm vi từ D1–D8).
- Không đề xuất multi-tenant/Internet-facing LMS.
- Không tự triển khai bất kỳ hướng nào ở trên cho tới khi mục "Việc cần quyết định" có câu trả lời.

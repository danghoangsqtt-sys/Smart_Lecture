# SmartLecture — Kế hoạch phát triển có kiểm soát

> Functional baseline: v0.8.0 / P11 hoàn thành · Development target: v0.9.0 · Chủ đích: biến nền tảng chức năng hiện có thành bản release nội bộ ổn định, sau đó mới mở rộng giá trị giảng dạy.

## Nguyên tắc thực thi

1. Làm theo thứ tự phase; không khởi động phase sau khi quality gate của phase trước còn đỏ.
2. Mỗi task phải có file contract: mục tiêu, paths tương đối, kế hoạch theo file, rủi ro, tiêu chí nghiệm thu và lệnh verify.
3. Chỉ chuyển `done` sau khi kiểm thử pass và git sạch, có upstream, không có commit chưa push.
4. Thay đổi schema/API phải cập nhật `ARCHITECTURE.md`, SPEC và migration/E2E cùng task.
5. Không dùng `npm audit fix --force` nếu chưa đánh giá breaking change và test import/export dữ liệu.

## Lộ trình

| Phase | Mục tiêu | Phụ thuộc | Exit gate |
| --- | --- | --- | --- |
| P12 — Release hardening | Đóng các rủi ro release: dependency, build Windows, version/docs, browser test. | P11 | Không còn high/critical chưa triage; build sạch và browser smoke pass. |
| P13 — Teaching Continuity Canvas | Annotation PDF/PPTX, laser/highlight, video/game dock liên tục trong Teaching Mode. | P12 | Canvas, dock và browser full-flow pass. |
| P14 — Báo cáo sau tiết | Xuất báo cáo theo lớp/môn/phiên từ telemetry đã xác thực. | P13 | Số liệu đối chiếu DB, phân quyền và export E2E pass. |
| P15 — Khả dụng lớp học | Tối ưu thao tác giáo viên trong tiết, resilience mạng LAN và accessibility thực tế. | P13 | Manual classroom scenario + browser E2E pass. |
| P16 — Mở rộng có chọn lọc | Chỉ chọn một hướng có bằng chứng nhu cầu: game mới, vấn đáp, hoặc integration. | P14/P15 | RFC được duyệt, không phá vỡ offline-first. |

P16 là decision gate, không phải cam kết triển khai đồng thời. Self-study vô hạn tiếp tục nằm ngoài phạm vi vì sản phẩm đã được định vị là tương tác trên lớp.

## P12 — Release hardening

### T-1201: Baseline và tính đúng đắn phiên bản

- Đồng bộ development target `0.9.0` giữa package, system-info, backup manifest, E2E và artefact DHSYSTEM.
- Sửa ROADMAP/PROJECT-META để phản ánh P1–P11 đã hoàn thành và phạm vi hiện tại.
- Tạo release checklist, kiểm tra health/PID và hướng dẫn build sạch trên Windows.
- Nghiệm thu: không còn version cũ `0.3.0`/P1 scaffold trong tài liệu vận hành; CI dùng cùng lệnh local.

### T-1202: Giảm thiểu rủi ro Excel và dependency

- Lập threat model cho tệp XLSX không tin cậy; xác định tất cả luồng parse/export client/server.
- So sánh phương án thay `xlsx`, nâng có kiểm soát, hoặc sandbox/giới hạn input với proof-of-concept.
- Chọn phương án bằng ADR trước khi sửa dependency; thêm regression cho file độc hại/không hợp lệ theo khả năng thư viện.
- Nghiệm thu: `npm audit` không còn high/critical mở, hoặc có exception có thời hạn, tác động và biện pháp giảm thiểu được duyệt.

### T-1203: Build, lifecycle và phục hồi Windows

- Tái hiện lỗi khóa `web/dist`, làm build idempotent khi app đang chạy hoặc quy định rõ stop/build/start bằng script an toàn.
- Chuẩn hóa PID/healthcheck; không để PID stale báo sai trạng thái.
- Kiểm tra backup/restore từ hướng dẫn người dùng, bao gồm media manifest.
- Nghiệm thu: 3 lần build liên tiếp và start/stop/restart pass trên Windows; không cần thao tác thủ công với `dist`.

### T-1204: Browser quality gate

- Thêm browser E2E cho login đổi mật khẩu, lớp/học liệu, thi autosave, tham gia game và bắt đầu/kết thúc phiên dạy.
- Đưa test vào CI; bổ sung smoke kiểm tra keyboard/focus/label cho màn hình có form quan trọng.
- Nghiệm thu: test chạy trên database cô lập, không phụ thuộc mạng Internet và không flaky trong ba lần liên tiếp.

## P13 — Teaching Continuity Canvas

- Xây PDF/PPTX presentation canvas có page navigation, fullscreen và annotation layer không làm đổi tệp nguồn.
- Cung cấp pen, highlighter, ellipse, underline, eraser, undo/redo và laser pointer tạm thời.
- Thay viewer/video/game rời rạc bằng dock kéo thả/thu nhỏ; video giữ playback và dùng native Picture-in-Picture khi browser hỗ trợ.
- Nghiệm thu: full teaching flow browser E2E; telemetry không trùng; fallback khi thiếu LibreOffice/PiP rõ ràng.

## P14 — Báo cáo sau tiết

- Chốt schema báo cáo và chỉ số: tiến độ giáo án, tham dự, hoạt động, game, điểm KTTX và ghi chú.
- Thêm export có thể truy vết về session ID; không tự suy diễn điểm/hiệu quả khi dữ liệu thiếu.
- Nghiệm thu: authorization lớp/môn, số liệu tổng hợp, định dạng Excel/PDF (nếu chọn) và E2E pass.

## P15 — Khả dụng lớp học

- Benchmark 20/40/60 kết nối game trên LAN, đo join/reconnect và giới hạn chấp nhận được.
- Rà soát UX giáo viên cho chuỗi: mở app → QR → dạy → game → điểm danh → tổng kết.
- Đóng các giant component ưu tiên theo thay đổi thực tế, không refactor lan man.
- Nghiệm thu: kịch bản lớp học thủ công có biên bản, không lỗi accessibility nghiêm trọng và performance không vượt budget.

## Cổng quyết định bắt buộc

| Sau phase | Quyết định | Tiêu chí |
| --- | --- | --- |
| P12 | Có phát hành nội bộ v0.8.x? | Tất cả release gates trong SPEC đạt. |
| P13 | Có phát hành Teaching Canvas v0.9.0? | Canvas/dock/browser quality gates đạt, không regression buổi dạy. |
| P14 | Có mở rộng báo cáo? | Giáo viên xác nhận báo cáo giúp hành động sau tiết. |
| P15 | Chọn P16 nào? | Nhu cầu người dùng, chi phí offline/LAN và rủi ro bảo mật được đánh giá bằng RFC. |

## Dashboard tiến độ

- Hoàn thành: P1–P11 (feature baseline).
- Đang lập kế hoạch: P12.
- Chưa bắt đầu: P13–P16.
- Blocker hiện biết: lỗ hổng high của `xlsx`; build mặc định có thể lỗi khi `web/dist` bị Windows khóa.

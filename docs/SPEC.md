# SmartLecture — Đặc tả hệ thống

> Functional baseline: **P11 / v0.8.0** · Development target: **v0.9.0** · Cập nhật: **2026-08-28** · Trạng thái: P12 release hardening đang thực thi.

## 1. Mục tiêu và phạm vi

SmartLecture là hệ thống tương tác lớp học chạy local-first trên máy Windows của giáo viên. Giáo viên vận hành một máy chủ Node.js; học viên và giáo viên truy cập bằng trình duyệt qua WiFi/LAN. Hệ thống phải vẫn phục vụ được luồng dạy học chính khi không có Internet; AI là tiện ích tăng cường, không được chặn tiết dạy.

Quy mô thiết kế: 1–10 giáo viên, 2–6 lớp/giáo viên, 20–60 học viên/lớp và tối đa 60 thiết bị đồng thời trong một phòng game.

Không thuộc phạm vi hiện tại: LMS Internet nhiều tenant, tự học không giới hạn, ứng dụng desktop Electron, giám sát chống gian lận tuyệt đối, và chấm vấn đáp giọng nói. Tunnel chỉ được mở opt-in cho bài tập về nhà và phải hiển thị cảnh báo an toàn.

## 2. Người dùng và phân quyền

| Vai trò | Quyền chính |
| --- | --- |
| Admin | Quản lý giáo viên, xem toàn hệ thống, cấu hình AI, backup/restore và dữ liệu vận hành. |
| Giáo viên | Quản lý lớp phụ trách, học liệu, câu hỏi, đề, game, điểm danh, sổ điểm, kế hoạch và phiên dạy. |
| Học viên | Xem học liệu của lớp, làm bài kiểm tra/bài tập, xem kết quả, tham gia game được phân lớp. |

Mọi API mutation phải xác thực JWT, kiểm tra quyền theo server và xác thực quan hệ sở hữu/lớp/môn. Client không là nguồn quyết định quyền, điểm game hoặc thời gian thi.

## 3. Yêu cầu chức năng

| ID | Nhóm | Yêu cầu nghiệm thu mức hệ thống |
| --- | --- | --- |
| FR-01 | Tài khoản & lớp | Admin tạo giáo viên; giáo viên tạo/import học viên, tạo lớp/môn, ghi danh, lưu trữ lớp theo năm học. |
| FR-02 | Học liệu | Giáo viên CRUD bài giảng, upload/nhập học liệu hợp lệ và học viên chỉ stream/xem nội dung thuộc lớp của mình. |
| FR-03 | Câu hỏi & AI | Ngân hàng câu hỏi hỗ trợ metadata môn/chương/bài/Bloom; nhập đề text; AI chỉ cho staff, có quota, retry và fallback. |
| FR-04 | Kiểm tra | Giáo viên tạo/phát hành đề; học viên làm bài có autosave/resume/timer server-side; MCQ tự chấm, tự luận chờ chấm và có hỗ trợ AI. |
| FR-05 | Tương tác realtime | Game chỉ cho học viên được ghi danh; host event được xác thực; server tính điểm, phát lobby/leaderboard/kết quả. |
| FR-06 | Điểm & điểm danh | Lưu KTTX, quá trình 1, kết thúc môn; điểm danh theo buổi/số tiết/lý do; xuất Excel theo biểu mẫu đang hỗ trợ. |
| FR-07 | Phiên dạy | Bắt đầu/tiếp tục/kết thúc phiên dạy; liên kết đúng lớp, môn, giáo án, học liệu, game, điểm danh và ghi chú. |
| FR-08 | Insights | Giáo viên xem tổng quan sau tiết theo lớp/môn, gồm tiến độ, học liệu/game đã dùng và phiên gần đây. |
| FR-09 | RAG | Giáo viên tải PDF/DOCX/PPTX/TXT; hệ thống parse, chunk, tìm kiếm và trả lời có nguồn; không có API key vẫn dùng keyword fallback. |
| FR-10 | Vận hành | App công bố URL LAN/mDNS, hỗ trợ backup/restore chỉ admin, autostart Windows và phát hiện Docling/LibreOffice tùy chọn. |
| FR-11 | Trình chiếu liên tục (planned v0.9.0) | Giáo viên trình chiếu PDF/PPTX đã chuyển đổi, chú thích cục bộ bằng pen/highlight/shape/laser và điều hành video/game dạng dock mà không làm gián đoạn phiên dạy. |

## 4. Kiến trúc và dữ liệu

- `web/`: React 19, Vite 7, TypeScript strict, Tailwind 4, Zustand và Socket.IO client. Route lazy-load; browser chỉ gọi API `/api` và Socket.IO.
- `server/`: Express 5, TypeScript strict, Socket.IO và các service AI/RAG/backup.
- `data/`: SQLite (WAL), media, secret JWT và backup; luôn gitignored.
- Triển khai production: backend phục vụ `web/dist`, vì vậy học viên chỉ dùng một URL LAN.

Miền dữ liệu chính: users, classes/enrollments/subjects, lectures/materials, questions/folders, exams/attempts/results, grades/attendance, game sessions/results, RAG documents/chunks, teaching plans/logs và application settings.

## 5. Yêu cầu phi chức năng

| ID | Yêu cầu | Tiêu chí đo được |
| --- | --- | --- |
| NFR-01 | Đúng đắn | `npm run typecheck`, build production và E2E cô lập phải pass. |
| NFR-02 | Bảo mật | Không lộ secret/API key; input route được Zod validate; dependency high/critical phải được triage trước release. |
| NFR-03 | Độ bền dữ liệu | Migration idempotent; backup có manifest; restore được kiểm chứng sau restart trên DB tạm. |
| NFR-04 | Khả dụng offline | Luồng lớp học cốt lõi không phụ thuộc Gemini, Docling, LibreOffice hoặc Internet. |
| NFR-05 | Khả năng vận hành | Build/restart Windows lặp lại được; health endpoint và quy trình phục hồi có hướng dẫn. |
| NFR-06 | UX & truy cập | Luồng giáo viên/học viên chính có browser E2E; thao tác bàn phím, nhãn form và modal được kiểm tra. |
| NFR-07 | Hiệu năng | Không tăng bundle entry vượt baseline 210 kB (trước gzip) nếu không có phê duyệt; thư viện nặng phải lazy-load. |
| NFR-08 | Tính liên tục trình chiếu | Đổi slide, thu nhỏ dock hoặc mở game không được remount video/game đang hoạt động hay tạo telemetry trùng. |

## 6. Quy tắc release

Một release chỉ đạt khi mọi điều kiện sau đều đúng:

1. Không còn lỗ hổng dependency mức critical/high chưa có quyết định giảm thiểu được ghi nhận.
2. `npm run typecheck`, build production trong môi trường sạch và `npm run test:e2e` đều pass.
3. Browser E2E cho login, lớp học, thi, game và phiên dạy pass trên ít nhất Chromium.
4. Version package, `/api/system/info`, backup manifest, README và artefact DHSYSTEM đồng nhất.
5. Hướng dẫn Windows có quy trình start, stop, build, backup, restore và xử lý lỗi phổ biến.

## 7. Truy vết hiện trạng

Baseline P11 đã xác minh: 86 REST checks, 10 Socket checks, 16 regression checks và restore/restart. Các khoảng trống trước release được theo dõi trong `docs/PLAN.md`, bắt đầu tại P12.

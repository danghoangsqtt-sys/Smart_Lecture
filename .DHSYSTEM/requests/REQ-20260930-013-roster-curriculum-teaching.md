# REQ-20260930-013 — Lớp biên chế, chương trình dùng chung và giảng dạy

## Nguồn và trạng thái

- Nguồn quyết định: `docs/brainstorm/session-2026-09-30.md`.
- Trạng thái: thiết kế triển khai đã lập; chưa phát hành. Các phase P83–P85 cũ dựa vào “lớp nguồn” được thay thế về mặt kế hoạch; migration v26 `teaching_log_classes` đã có được giữ nguyên để tái sử dụng, không xóa dữ liệu.
- Phạm vi: ứng dụng cục bộ trên máy một giảng viên, học viên truy cập LAN. Không triển khai đồng bộ hồ sơ giữa nhiều giảng viên/máy.
- UI: chưa có prototype; sử dụng cấu trúc màn hình hiện tại, ghi rõ giả định và kiểm thử UX trong phase cuối.

## Quy tắc nghiệp vụ khóa

1. Mỗi học viên có một mã sinh viên bắt buộc, duy nhất và đúng một **lớp biên chế hiện tại**. Tên hiển thị có thể trùng.
2. Tên đăng nhập duy nhất khi so sánh không phân biệt hoa/thường; tên đăng nhập học viên lưu chữ thường. Không tự gộp hồ sơ có lịch sử.
3. Giảng viên được xử lý tài khoản học viên do mình tạo; admin xử lý toàn bộ dữ liệu cục bộ. Tài khoản chưa có dữ liệu học tập mới có thể xóa hẳn; tài khoản đã có điểm danh/kết quả chỉ vô hiệu hóa và ẩn, giữ lịch sử/thu hồi phiên.
4. Tạo tài khoản chọn đúng một lớp. Excel trang Người dùng: một dòng = một học viên, một lớp; mã sinh viên đã tồn tại cùng lớp là idempotent, ở lớp khác là xung đột cần chuyển lớp có chủ đích, không ghi danh thứ hai.
5. Chuyển lớp giữ cùng tài khoản/mã sinh viên, thay lớp biên chế hiện tại; kết quả và điểm danh trước chuyển vẫn thuộc lớp cũ.
6. Một lớp học nhiều môn; một môn/bài/học liệu do giảng viên chuẩn bị có thể phục vụ nhiều lớp. Chỉ tiến độ theo lớp–môn, điểm danh/kết quả theo lớp là riêng; slide/video/câu hỏi không có bản riêng mỗi lớp.
7. Câu hỏi tạo/chọn từ bài được lưu trong ngân hàng chung và bài tham chiếu đến câu hỏi. Game chụp nội dung khi bắt đầu để lịch sử không đổi khi câu hỏi gốc sửa.
8. Một buổi dạy chọn một môn/bài và 1–4 lớp biên chế, một workspace/slide/video/game; danh sách học viên các lớp rời nhau, kết quả tách theo lớp.

## Mô hình đích (khái niệm)

```text
User(student, student_code, username) ── 1 current_home_class ──> Class
  └── ClassMembershipHistory (class, effective_from/to; giữ lịch sử chuyển lớp)
Class ──< ClassSubject >── Subject ──< Lesson ──< LessonMaterial
                                              └──< LessonQuestion >── QuestionBank
TeachingSession ──> Subject + Lesson ──< ParticipatingClass
  ├── shared presentation/video/game snapshot
  └── per-class attendance, score and reports
```

Không đổi `class_id` trên các bản ghi điểm danh/kết quả cũ khi chuyển lớp. `teaching_log_classes` v26 có thể làm quan hệ lớp tham gia; `teaching_logs.class_id` legacy chỉ là fallback, không còn là “lớp nguồn học liệu”. Khi chuyển nội dung cũ từ `subjects/lectures/teaching_plans` đang gắn lớp sang thư viện chung, tạo bảng mapping ID cũ→ID mới và giữ API legacy cho đến khi mọi màn hình/báo cáo dùng nguồn mới.

## Di trú dữ liệu — các cổng an toàn

### Gate 0: kiểm kê chỉ đọc (P86)

- Công cụ nhận **đường dẫn DB tường minh**, mở SQLite `readOnly`, không nhập runtime `connection.ts` (vì import có thể khởi tạo thư mục/restore/migration). Không mặc định trỏ vào DB ứng dụng đang chạy.
- Kiểm tra `PRAGMA integrity_check`/`foreign_key_check`, version migration và schema; thống kê học viên thiếu mã, mã trùng sau chuẩn hóa, username trùng không phân biệt hoa/thường, username học viên có chữ hoa, học viên 0 hoặc >1 lớp, ghi danh không phải học viên.
- Báo cáo tổng hợp mặc định; chi tiết định danh chỉ khi người vận hành yêu cầu JSON. Không sửa DB. Không xuất mật khẩu/hash/token.
- Gate không đạt thì chưa tạo unique index hay đổi quyền/ghi danh. Quyết định xung đột thực hiện trong giao diện/phiếu rà soát thủ công, không đoán người cần giữ.

**Kết quả kiểm kê chỉ đọc 2026-09-30 (không xuất định danh):** DB trong repo: 62 học viên/6 lớp/62 ghi danh, không có xung đột roster theo các kiểm tra hiện tại. DB của bản cài tại `%LOCALAPPDATA%\SmartLecture\data`: 3 học viên/1 lớp/2 ghi danh; cả 3 thiếu mã sinh viên và 1 người chưa có lớp. Bản cài vì thế **chưa đủ điều kiện** áp ràng buộc mới. Cần giảng viên cung cấp mã sinh viên thực và lớp biên chế của học viên còn thiếu, không tự tạo mã/đoán lớp. Kết quả này là ảnh chụp tại thời điểm kiểm kê, phải chạy lại sau khi sửa dữ liệu.

### Gate 1: bản sao/backup và đối soát

- Dùng cơ chế backup hiện có tạo bản sao nhất quán (bao gồm WAL và media manifest cần thiết) trước rehearsal; kiểm chứng restore trên thư mục dữ liệu cô lập, không chạy migration thử trên DB đang cài.
- Lưu manifest kiểm kê: tổng user/class/enrollment, điểm danh/kết quả, phiên game, bài giảng/học liệu, checksum bản sao. Mọi migration có kiểm thử idempotency, rollback/retry, `foreign_key_check` và đếm sentinel trước/sau.
- Trường hợp không rõ danh tính hoặc lớp biên chế: đánh dấu cần xử lý thủ công; ứng dụng cũ vẫn đọc được. Không tự xóa/gộp/đổi ID.

### Gate 2: ràng buộc theo từng bước (P87)

- Trước tiên sửa **mọi writer** (tạo thủ công, nhập Excel từ Người dùng/Lớp, enroll API) để từ chối tạo hai lớp hiện tại và chuẩn hóa username/mã sinh viên. Chuyển lớp là endpoint transaction riêng, không dùng `INSERT enrollment` như ghi danh thêm.
- Khi báo cáo Gate 0 sạch trên DB mẫu và DB thực được xác nhận: thêm index duy nhất cho `lower(trim(username))`, mã sinh viên chuẩn hóa của học viên và học viên trong bảng lớp biên chế hiện tại. Nếu DB cũ xung đột, migration không được xóa dữ liệu để “ép pass”; phát thông báo rõ và hoãn ràng buộc, không làm app mất khả năng khởi động.
- Tách lớp hiện tại khỏi lịch sử: `class_membership_history` ghi khoảng hiệu lực (không chồng nhau) và actor; giữ `class_id` trên các bản ghi kết quả cũ làm ảnh chụp lớp tại thời điểm học. Phải định nghĩa chính sách phiên đang mở trước khi cho chuyển lớp (đề xuất chặn chuyển tới khi kết thúc phiên).
- `DELETE` thật chỉ khi kiểm tra toàn bộ tham chiếu học tập và quyền sở hữu; còn lại lưu trữ/vô hiệu hóa, tăng `session_version` để thu hồi REST/Socket/cookie.

### Gate 3: học liệu và phiên dạy (P88–P90)

- Tạo thư viện môn/bài độc lập lớp và liên kết lớp–môn; chuyển bản ghi cũ bằng mapping không phá hủy. Các mục không thể ghép tự động (môn cùng tên nhưng học liệu khác) phải hiện là bản riêng chờ giảng viên chọn, không hợp nhất bằng tên.
- Áp nguồn học liệu mới cho một lớp trước, sau đó bật nhiều lớp; game/điểm danh/báo cáo kiểm thử cả trước và sau chuyển lớp.
- Chỉ bỏ fallback legacy sau khi rehearsal, đối soát và Browser/REST/Socket E2E đạt trên DB nâng cấp; bản cài/DB cũ có đường rollback qua backup.

## Kế hoạch phase và thứ tự thực hiện

| Phase | Mục tiêu | Điều kiện hoàn thành |
|---|---|---|
| P86 | Kiểm kê dữ liệu chỉ đọc và rehearsal protocol | Báo cáo xung đột, test fixture không đụng DB thật, tài liệu quyết định thủ công |
| P87 | Danh tính, một lớp biên chế, nhập Excel và chuyển lớp | Mọi writer thống nhất; xóa/lưu trữ đúng; dữ liệu cũ bảo toàn; ràng buộc chỉ sau gate sạch |
| P88 | Kho môn/bài/học liệu/câu hỏi dùng chung | Một môn→nhiều lớp, một lớp→nhiều môn, không nhân bản; mapping legacy và game snapshot |
| P89 | Giảng dạy trên nguồn chung và đa lớp | 1–4 lớp, một buổi/slide/video/game; điểm danh/kết quả riêng; không còn “lớp nguồn” |
| P90 | Giao diện, báo cáo, migration rehearsal và phát hành | Người dùng→Lớp→Chương trình→Giảng dạy xuyên suốt; E2E + rollback + release gates |

P86 được người dùng yêu cầu bắt đầu trước khi P78–P82 hoàn tất; **không phát hành v0.12.0** đến khi cả release gate v0.11.0 và P86–P90 đạt. P83–P85 cũ được lưu làm tham chiếu lịch sử, không tự động chạy tiếp theo hợp đồng cũ.

## Kiểm thử bắt buộc

- Tài khoản giống nhau chỉ khác hoa/thường; mã sinh viên trùng/thiếu; tên thật trùng hợp lệ; import lặp; tạo từ hai màn hình; quyền giảng viên `created_by`.
- Chuyển QK22→QK23 giữ học viên một lớp hiện tại; lịch sử điểm danh/điểm số vẫn ở QK22; chặn chuyển khi có phiên đang mở; restore/retry.
- Hai lớp cùng môn/bài nhưng một lớp học sau lớp kia; sửa câu hỏi gốc sau game không đổi phiên cũ; 2–4 lớp dạy chung không đếm trùng hoạt động.
- Kiểm thử trên DB cô lập nâng cấp từ phiên bản cũ, không trên DB ứng dụng đang chạy; typecheck, lint, build, focused REST/Socket/Browser E2E, backup/restore.

## Nguồn kỹ thuật kiểm chứng

- [Node `DatabaseSync` readOnly](https://nodejs.org/api/sqlite.html) — truy cập 2026-09-30.
- [SQLite unique index và NULL](https://sqlite.org/lang_createindex.html) — truy cập 2026-09-30.
- [SQLite ALTER TABLE và migration](https://sqlite.org/lang_altertable.html) — truy cập 2026-09-30.

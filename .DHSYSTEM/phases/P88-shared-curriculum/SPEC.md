# P88 — Kho chương trình dùng chung

## Goal

Môn → bài → học liệu/câu hỏi là nguồn chuẩn độc lập lớp; một môn có thể phục vụ nhiều lớp, một lớp có thể học nhiều môn. Tiến độ theo lớp–môn/bài. Không tự hợp nhất dữ liệu legacy chỉ vì cùng tên; mọi ID cũ và lịch sử giảng dạy còn nguyên.

## Dependencies and safety

- P87 hoàn tất trong source; bản cài v0.11.0 chưa nâng cấp. Không ghi vào DB/bộ cài đang dùng ở P88.
- P78–P82 và P90 vẫn là cổng phát hành. Tạo schema và mapping cộng thêm, không xóa/đổi ID `subjects`, `lectures`, `materials`, `teaching_plans`, `curriculum_items`, `lesson_plans`, `questions`, `teaching_logs`.
- Tệp media legacy vẫn có vòng đời xóa riêng; chỉ lập bản ghi nguồn `pending_copy` ở T-8801, chưa công bố như học liệu độc lập cho tới khi T-8802 sao chép/đối soát file. Link URL không cần sao chép. Không suy diễn bài học từ chuỗi tên câu hỏi.

## Tasks

1. T-8801 — schema cộng thêm, map ID legacy có thể xác định bằng FK rõ ràng, báo trường hợp mơ hồ; test upgrade/rollback/idempotency trên DB cô lập.
2. T-8802 — API và writer mới cho kho môn/bài/học liệu/câu hỏi; sao chép media an toàn, snapshot câu hỏi khi game bắt đầu, giữ API legacy trong giai đoạn chuyển tiếp.
3. T-8803 — UI Chương trình đào tạo soạn nguồn chung, liên kết lớp–môn, điều khiển Giảng dạy chỉ dùng nội dung đã chuẩn bị.
4. T-8804 — hồi quy curriculum/game/legacy mapping, báo cáo và Browser E2E một lớp/nhiều lớp.

## Exit criteria

- Schema không tạo bản học liệu riêng từng lớp; không tự gộp môn/bài cùng tên nhưng khác ID. Lớp–môn many-to-many, progress tách theo cặp lớp–môn.
- Dữ liệu legacy có mapping theo ID và báo các quan hệ không thể xác định; rehearsal trên bản sao, rollback/retry và FK/integrity đạt.
- API/UI/Socket dùng nguồn chuẩn mới sau T-8802–T-8804; bản cài chỉ nâng cấp ở release gate P90.

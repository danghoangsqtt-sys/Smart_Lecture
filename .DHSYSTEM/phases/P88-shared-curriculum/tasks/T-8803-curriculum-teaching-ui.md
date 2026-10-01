# T-8803 — Giao diện chương trình và giảng dạy từ nguồn dùng chung

## Objective

Trang Chương trình đào tạo là nơi soạn một nguồn môn→bài→học liệu/câu hỏi độc lập lớp và gắn môn vào nhiều lớp. Trang Giảng dạy chỉ chọn lớp–môn đã gắn, mở bài/học liệu/câu hỏi đã chuẩn bị để trình chiếu, xem video và khởi tạo game. Giữ route/API legacy cho lịch sử và luồng cũ trong giai đoạn chuyển tiếp; không thêm AI, không nâng cấp DB/bản cài đang dùng. Nhật ký buổi dạy nhiều lớp/điểm danh-kết quả tích hợp là P89, không giả lập bằng dữ liệu mới ở T-8803.

## Paths

- `web/src/types.ts`: kiểu domain nguồn chung, dùng tập trung.
- `web/src/lib/sharedCurriculum.ts`: wrapper đọc/ghi API nguồn chung và upload multipart, giữ xử lý lỗi thống nhất.
- `web/src/App.tsx`: đăng ký route `/curriculum` và workspace dạy nguồn chung.
- `web/src/pages/CurriculumPage.tsx`: danh mục môn, tạo môn, chọn môn và khu vực soạn.
- `web/src/features/curriculum/SubjectWorkspace.tsx`: thông tin môn, bài và phân công lớp.
- `web/src/features/curriculum/LessonWorkspace.tsx`: bài học, học liệu và câu hỏi theo ID.
- `web/src/features/curriculum/CurriculumMaterials.tsx`: link/file, copy legacy pending và trạng thái ready.
- `web/src/features/curriculum/CurriculumQuestions.tsx`: liên kết/gỡ câu hỏi ngân hàng.
- `web/src/pages/SharedTeachingHubPage.tsx`: dashboard chính chọn lớp/môn chung, kiểm kê nội dung sẵn sàng.
- `web/src/pages/TeachingHubPage.tsx`: giữ dashboard legacy dưới route riêng có nhãn chuyển tiếp.
- `web/src/pages/SharedTeachingPage.tsx`: workspace chỉ đọc học liệu đã chuẩn bị, trình chiếu/video, game từ câu hỏi của bài và tiến độ riêng theo lớp.
- `web/src/features/curriculum/SharedTeachingViewer.tsx`, `web/src/features/curriculum/SharedGamePanel.tsx`: viewer học liệu và game host tách khỏi route để giữ component ngắn.
- `web/src/pages/GamesPage.tsx`: nhận phiên game đã tạo từ workspace nguồn chung vào host console.
- `server/src/routes/sharedCurriculum.routes.ts`, `server/src/routes/games.routes.ts`, `scripts/shared-curriculum-api-test.mjs`: quyền đọc nội dung/câu hỏi môn đã phân công cho giảng viên lớp và tạo game từ câu hỏi đã liên kết bài trong lớp đó, dù họ không phải chủ biên soạn; test chỉnh sửa vẫn chỉ chủ môn/admin.
- `.DHSYSTEM/ARCHITECTURE.md`, `.DHSYSTEM/TRACKER.md`, `.DHSYSTEM/HANDOFF.json`, `.DHSYSTEM/ROADMAP.md`, `.DHSYSTEM/phases/P88-shared-curriculum/PHASE-STATE.md`, this task file, `CHANGELOG.md`.

## File-Level Plan

1. Client types/API: map đúng shape snake_case từ T-8802; tạo helper lấy môn/bài/material/question/progress, upload FormData với cookie cùng origin và lỗi có cấu trúc.
2. Curriculum: menu `/curriculum` có trang thật; tạo/chọn/sửa môn, gắn/gỡ lớp; thêm/sửa bài; gắn/gỡ câu hỏi từ ngân hàng; thêm link hoặc file, copy file legacy còn pending. Cảnh báo rõ chưa sẵn sàng và không stream pending.
3. Teaching: dashboard lớp chọn môn đã được gắn; chỉ bài đã chuẩn bị mới có nút vào workspace. Workspace dùng shared media stream, hiển thị PDF/video/link và tạo quick quiz từ ID câu hỏi đã gắn bài; tiến độ cập nhật riêng lớp. Lối mở điểm danh theo lớp được giữ; không ghi teaching log legacy bằng shared IDs.
   API đọc cho giảng viên lớp đã nhận môn, nhưng quyền ghi thư viện vẫn ở chủ môn/admin.
4. Giữ các route legacy đang được dùng bởi lớp cũ/lịch sử, không tự gộp môn trùng tên và không ghi ngược vào bảng cũ. UI dùng component ngắn, responsive và thông báo qua toast.
5. Verify typecheck, lint, build, focused/E2E, Browser smoke ở DB cô lập; sau thay đổi React chạy react-doctor theo SYSTEM-RULES. Chưa đánh dấu T-8804 hoàn tất.

## Best Practices

- React 19 hooks có cleanup async, type strict, không `any`; domain types tập trung. Không lưu token trong browser storage, fetch cookie same-origin.
- Không dùng trạng thái `ready` tự suy từ metadata; chỉ theo backend. Không gửi `subjectId` shared vào endpoint game/teaching-log legacy yêu cầu ID môn cũ.
- Chỉ dữ liệu được phép theo server; UI chặn thao tác khi thiếu nội dung nhưng server vẫn là nguồn phân quyền.
- Component UI dưới 300 dòng, tương thích màn nhỏ và keyboard; không `alert/confirm/prompt` mặc định.

## Verification

- `npm run typecheck`, `npm run lint`, `npm run build`, `npm run test:focused`, `npm run test:e2e`, Browser smoke cô lập, `npx react-doctor`, `git diff --check`.
- DB/media bản cài không thay đổi; commit/push và task tags đầy đủ.

## Status

- `done (source only)` — 2026-10-01. Đã nối route thư viện/workspace, phân quyền giảng viên lớp và Browser smoke; typecheck/lint/build, focused/full E2E, API 21/21 và Browser 10/10 đạt. Bản cài/DB đang dùng chưa nâng cấp; T-8804 hồi quy chuyên sâu còn chờ.

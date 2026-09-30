# T-8703 — Excel học viên tại trang Người dùng và giao diện một lớp biên chế

## Objective

Trang Người dùng cho phép tải mẫu Excel, xem trước kết quả nhập và xác nhận nhập học viên vào đúng một lớp biên chế đã chọn. Trang Lớp dùng lại cùng luồng xem trước/nhập. Mỗi dòng được phân loại tạo mới, đã có trong lớp, hoặc xung đột; không tạo tài khoản/lớp thứ hai, không tự đổi mã hay mật khẩu hiện có. Mật khẩu tạm chỉ hiển thị một lần sau khi nhập. Không chạm DB bản cài.

## Paths

- `server/src/services/studentRosterImport.ts`
- `server/src/routes/classes.routes.ts`
- `server/src/services/studentAccounts.ts`
- `web/src/components/StudentImportModal.tsx`
- `web/src/features/class-detail/StudentsTab.tsx`
- `web/src/pages/UsersPage.tsx`
- `web/src/types.ts`
- `scripts/roster-excel-test.mjs`
- `scripts/e2e-excel-regression.mjs`
- `tests/browser/login.spec.ts`
- `package.json`
- `.DHSYSTEM/ARCHITECTURE.md`
- `.DHSYSTEM/phases/P87-home-class-identity/PHASE-STATE.md`
- `.DHSYSTEM/TRACKER.md`
- `.DHSYSTEM/HANDOFF.json`
- `.DHSYSTEM/ROADMAP.md`
- `CHANGELOG.md`

## File-Level Plan

- `studentRosterImport.ts`: đọc CSV/XLSX giới hạn kích thước, nhận diện header, chuẩn hóa dòng; preview chỉ đọc DB, phân loại create/skip/conflict kèm số dòng và lý do; import dùng lại kết quả parse nhưng xác thực lại trong transaction ghi từng tài khoản ở T-8702. Không tin preview làm bằng chứng được phép ghi.
- `classes.routes.ts`: endpoint preview có phân quyền lớp; endpoint import dùng bộ phân loại chung, trả lỗi từng dòng; mẫu Excel sửa hướng dẫn bắt buộc mã và lớp, bỏ dòng ví dụ có thể bị nhập nhầm; cột Lớp nếu có dữ liệu khác lớp đã chọn phải từ chối dòng đó.
- `studentAccounts.ts`: chỉ thêm helper kiểm tra danh tính/quyền nếu cần; mọi ghi học viên vẫn qua `createStudentAccount`/`enrollExistingStudent`.
- `StudentImportModal.tsx`: modal tái sử dụng cho Users và Class; chọn đúng một lớp khi mở từ Users, tải mẫu theo lớp, chọn file, xem trước số tạo/bỏ qua/xung đột và chi tiết từng dòng rồi xác nhận; hiển thị/tải credentials một lần và lỗi import.
- `StudentsTab.tsx`: thay modal nhập riêng bằng modal chung, bỏ mô tả cũ cho phép mã trống/lớp không khớp; không đổi các nghiệp vụ khác.
- `UsersPage.tsx`: thêm nút nhập Excel và hiển thị lớp biên chế hiện tại trong danh sách học viên; form tạo đơn vẫn giữ; dùng modal chung.
- `types.ts`: kiểu API chia sẻ cho preview/credentials/lớp nếu cần, tránh định nghĩa lặp.
- `roster-excel-test.mjs`, `e2e-excel-regression.mjs`, `login.spec.ts`: kiểm tra preview không ghi DB, thiếu mã/lớp, trùng username/mã không phân biệt hoa-thường, lớp khác/quyền GV, nhập lặp idempotent, mật khẩu cũ không đổi, mẫu Excel đúng header, Users UI chọn lớp/xem trước/nhập.
- `package.json`: thêm regression vào focused gate.
- Tài liệu trạng thái: hợp đồng Excel, kết quả kiểm thử, ranh giới T-8704.

## Best Practices

- Zod/giới hạn upload ở route; SQL prepared; không trả hash, không lưu credentials trong browser storage; cache-control no-store cho preview/import.
- Preview chỉ đọc và có thể lỗi thời; confirm luôn tái kiểm tra, không tự chuyển lớp. Lớp được xác định bằng ID người dùng chọn, không đoán theo tên từ file.
- Giảng viên chỉ lớp của mình và học viên do mình tạo; admin có thể nhập vào mọi lớp. Không xuất tài khoản đã có hoặc mật khẩu cũ.
- Thay đổi giao diện theo component hiện có, tránh file >300 dòng, đảm bảo keyboard/label và thông báo lỗi rõ.

## Verification Commands

- `npm run test:roster-excel` → preview/import regression PASS.
- `npm run typecheck`, `npm run lint`, `npm run build`, `npm run test:focused`, `npm run test:e2e`, `npm run test:browser` → exit 0.
- `git diff --check`; git persistence gate clean/upstream/no unpushed commits.

## Acceptance Criteria

- Từ trang Người dùng, tải mẫu theo lớp, preview trước khi nhập và thấy kết quả từng dòng; không thể xác nhận nếu không có lớp/file hợp lệ.
- Thiếu mã, khác lớp, username/mã trùng hoặc lớp không thuộc giảng viên đều không tạo bản ghi xấu; nhập lại file hợp lệ không tạo trùng và không đặt lại mật khẩu.
- File mẫu không chứa dữ liệu ví dụ có thể vô tình nhập, ghi rõ mã/lớp bắt buộc và mật khẩu tạm ngẫu nhiên nếu bỏ trống.
- Trang Lớp giữ chức năng nhập nhưng dùng chung logic; credentials chỉ được hiển thị sau khi tạo thành công, một lần, no-store.
- Dữ liệu legacy không được tự sửa; DB bản cài/bộ cài không thay đổi trong task này.

## Status

- `done` — 2026-09-30; Excel contract 8/8, typecheck/lint/build, focused, full E2E, Browser 8/8, React Doctor 100/100. Mọi test dùng DB cô lập; DB bản cài không thay đổi.

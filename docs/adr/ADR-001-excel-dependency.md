# ADR-001: Thay SheetJS `xlsx` bằng ExcelJS

- **Ngày:** 2026-08-28
- **Trạng thái:** Accepted
- **Owner:** SmartLecture core team

## Bối cảnh

`npm audit --omit=dev --audit-level=high` phát hiện `xlsx@0.18.5` có hai advisory mức high (prototype pollution và ReDoS) và không có bản vá upstream. Thư viện này được dùng để đọc workbook giáo viên tải lên và tạo file Excel trong ba route server, một trang web và hai script fixture.

Workbook upload là dữ liệu không tin cậy. Giới hạn Multer 5 MB vẫn không loại bỏ rủi ro parser, vì vậy exception không phải phương án chấp nhận được cho bản phát hành P12.

## Quyết định

1. Xoá `xlsx` khỏi toàn bộ workspace và lockfile.
2. Dùng `exceljs@4.4.0`, vốn đã là dependency server để tạo template có định dạng, làm adapter XLSX thống nhất. ExcelJS công bố hỗ trợ XLSX/CSV và có browser bundle trong package manifest: https://github.com/exceljs/exceljs/blob/master/package.json
3. Tách việc đọc/ghi server vào `server/src/utils/spreadsheet.ts`; chuyển dữ liệu cell phức tạp thành scalar an toàn trước khi route xử lý.
4. Client chỉ tải ExcelJS khi người dùng thực hiện export, tránh tăng initial presentation bundle.

## Hệ quả và kiểm soát

- Chấp nhận phạm vi tương thích là `.xlsx` và `.csv`; đuôi `.xls` bị từ chối rõ ràng vì ExcelJS không phải parser định dạng Excel nhị phân cũ. Giao diện import hiện có sẽ hướng người dùng xuất lại `.xlsx`/`.csv`.
- Giữ giới hạn upload 5 MB đang có; parser error được quy đổi sang lỗi `BAD_INPUT` thân thiện, không trả stack trace.
- Kiểm thử gồm typecheck, build web/server, smoke flow tạo/import workbook và `npm audit` không còn high/critical.

## Các lựa chọn không chọn

- `npm audit fix --force`: audit đề nghị hạ cấp ExcelJS và không giải quyết một cách tương thích; không chạy.
- Giữ `xlsx` cùng exception: không đáp ứng mức rủi ro của dữ liệu giáo viên tải lên.

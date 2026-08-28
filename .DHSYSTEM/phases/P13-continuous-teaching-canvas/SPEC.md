# P13 — Teaching Continuity Canvas v0.9.0

## Mục tiêu

Biến Teaching Mode thành một mặt bàn giảng dạy liên tục: giáo viên chú thích trực tiếp lên PDF hoặc PowerPoint đã chuyển đổi, chuyển qua lại giữa slide, video và game mà không làm mất phiên dạy, và điều khiển các hoạt động phụ bằng dock kéo thả/thu nhỏ.

## Phạm vi chức năng

1. **Presentation Canvas** hiển thị PDF theo từng trang. PPTX sử dụng PDF sibling do LibreOffice tạo; khi chưa có PDF chuyển đổi, UI thông báo rõ và cho mở tệp gốc thay vì giả vờ hỗ trợ chú thích.
2. **Annotation layer** không sửa tệp nguồn: bút, bút highlight trong suốt, vòng tròn/ellipse, gạch chân/line, tẩy, hoàn tác/làm lại/xóa trang và laser pointer tạm thời.
3. **Video Dock** giữ nguyên một phần tử video khi thu nhỏ/chuyển nội dung; hỗ trợ kéo thả, thu nhỏ/mở lại và native Picture-in-Picture khi browser hỗ trợ. Fallback là mini-player trong app.
4. **Game Dock** dùng cùng shell kéo thả/thu nhỏ với video; game đã chuẩn bị luôn khóa ngữ cảnh lớp/môn và không làm presentation canvas unmount.
5. **Teaching toolbar** ưu tiên thao tác trong tiết: chọn nội dung, điều hướng trang, công cụ chú thích, video/game dock, fullscreen và trạng thái phiên dạy.

## Quy tắc dữ liệu và trải nghiệm

- V1 annotation là dữ liệu cục bộ theo browser-session/material/page; không đồng bộ cho học viên, không nhúng vào PDF/PPTX và không được coi là ghi chú chính thức sau tiết.
- Laser chỉ hiển thị khi đang bấm/di chuyển con trỏ, không được lưu vào annotation history.
- Chuyển chế độ không được dừng video hoặc reset game dock. Browser có thể throttle video khi cả tab không foreground; đây là giới hạn browser phải được mô tả, không hứa hẹn chạy nền toàn hệ điều hành.
- Người học tiếp tục tham gia game trên thiết bị của mình bằng cơ chế hiện hữu; dock là công cụ điều hành của giáo viên trên màn chiếu.

## Tiêu chí nghiệm thu phase

- PDF và PPTX có PDF chuyển đổi đều mở trong canvas, đổi trang được và annotation căn đúng trang/zoom.
- Giáo viên có thể vẽ, highlight, khoanh, gạch chân, dùng laser, undo/redo/clear mà không sửa media nguồn.
- Video đang phát tiếp tục phát khi được hạ xuống và mở lại; PiP hoặc fallback mini-player hoạt động.
- Game dock kéo thả/thu nhỏ/mở lại mà không thay đổi lớp/môn hoặc mất state đang chuẩn bị.
- Session telemetry vẫn chỉ ghi material/video/game thực khi được mở/chạy, không tạo bản ghi trùng do đổi dock.
- Typecheck, production build, E2E hiện có và browser E2E mới đều pass.

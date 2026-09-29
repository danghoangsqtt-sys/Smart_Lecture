# P85 — Workspace, báo cáo và nghiệm thu đa lớp

## Goal

Giảng viên thiết lập, dạy và tổng kết buổi 2–4 lớp trong một workspace; mỗi lớp vẫn có điểm danh/kết quả riêng.

## Scope

- Teaching Hub chọn 2–4 lớp, lớp nguồn, môn/bài và hiển thị tổng học viên duy nhất/preflight.
- Teaching Mode khôi phục phiên nhóm sau reload, một trình chiếu/video/game và điều khiển điểm danh theo lớp.
- Báo cáo tổng buổi và theo lớp từ một read model; export CSV/XLSX không đếm lặp hoạt động chung.
- Browser E2E, kiểm thử tải hội trường và nâng cấp DB/bản cài trên dữ liệu cô lập.

## Capacity gate

Hệ thống hiện có ghi giới hạn khoảng 60 kết nối/phòng. Kiểm thử mục tiêu giả định 4 lớp × 60 học viên = 240 kết nối đồng thời; đo trên máy mục tiêu để chốt ngưỡng/hiệu năng và điều chỉnh thiết kế nếu không đạt, không đơn thuần bỏ giới hạn.

## Tasks

- `T-8501-hub-multi-class-setup.md`
- `T-8502-shared-teaching-workspace.md`
- `T-8503-group-and-class-reports.md`
- `T-8504-regression-release-gate.md`

## Exit criteria

- Một vòng thật: chọn 2–4 lớp → cùng bài/học liệu → một game → điểm danh riêng → kết thúc → báo cáo từng lớp.
- Một lớp legacy tiếp tục dùng như hiện tại; dữ liệu cũ, quyền và backup không suy giảm.
- Typecheck, lint, build, React Doctor, REST/Socket/Browser E2E, restart và xuất file đạt.
- Chỉ sau khi hoàn tất release gate mới cập nhật package/bộ cài sang v0.12.0.

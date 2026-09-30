# P86 — Roster preflight: hoàn thành 2026-09-30

- Công cụ `scripts/roster-preflight.mjs` chỉ mở SQLite read-only với `--db` tường minh; báo cáo tổng hợp mặc định, JSON chi tiết theo yêu cầu.
- Test fixture 5/5, typecheck, lint, build đạt; so sánh SHA-256 chứng minh kiểm kê không sửa DB mẫu.
- DB repo: 62 học viên, 6 lớp, không thấy xung đột; DB bản cài: 3 học viên thiếu mã sinh viên, 1 chưa có lớp. Không có bản ghi nào bị sửa.
- P87 chỉ được thêm ràng buộc vào bản cài sau khi mã sinh viên thực và lớp biên chế thiếu được nhập/xác nhận, rồi chạy lại kiểm kê sạch. Không tự đoán mã/lớp hoặc gộp hồ sơ.
- Nguồn: `.DHSYSTEM/requests/REQ-20260930-013-roster-curriculum-teaching.md`; triển khai `99e8607`.

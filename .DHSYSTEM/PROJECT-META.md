# PROJECT-META — Smart_Lecture

| Thuộc tính | Giá trị |
|---|---|
| Tên repo | Smart_Lecture |
| Tên hiển thị | SmartLecture |
| Phiên bản | 0.9.0 (planned) |
| Ngày tạo | 2026-08-23 |
| Tác giả | DHsystem |
| Mô tả | LMS client-server chạy nội bộ máy giáo viên: bài giảng, ngân hàng câu hỏi AI, thi online, game realtime, sổ điểm & điểm danh. Học viên truy cập qua WiFi/LAN bằng browser |
| Phase hiện tại | P12 (Release hardening) — planned |
| Workflow state | P1–P11 completed → P12 planning complete |
| Brainstorm | docs/brainstorm/session-2026-08-23.md |

## Lệnh chạy
```bash
# Dev (2 terminal)
npm run dev -w server     # API :4000
npm run dev -w web        # Vite :5173 (proxy /api + /socket.io)

# Build production
npm run build             # web/dist + server/dist
npm start -w server       # phục vụ toàn bộ tại http://<ip-may-gv>:4000
```

## Tài khoản mặc định lần đầu boot
admin / admin123 (bắt buộc đổi sau đăng nhập đầu)

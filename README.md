# SmartLecture

LMS client-server chạy nội bộ trên máy giáo viên. Giáo viên khởi động phần mềm → học viên truy cập
qua WiFi/LAN bằng trình duyệt trên điện thoại/máy tính → đăng nhập tài khoản do giáo viên tạo.

## Công nghệ
- **Server:** Node.js 24 · Express 5 · node:sqlite (không cần biên dịch native) · Socket.IO · JWT
- **Web:** React 19 · Vite 7 · TypeScript strict · Tailwind CSS v4 · Zustand

## Chạy môi trường phát triển

```bash
npm install          # tại thư mục gốc (npm workspaces)
npm run dev          # đồng thời: API :4000 + Web :5173 (proxy sẵn)
```

Mở http://localhost:5173 — học viên trong mạng LAN dùng `http://<ip-máy-giáo-viên>:4000` khi build production.

## Build production

```bash
npm run build        # web/dist + server/dist
npm start -w server  # phục vụ toàn bộ ứng dụng tại http://<ip>:4000
```

## Tài khoản mặc định lần đầu chạy
`admin / admin123` — hệ thống yêu cầu đổi mật khẩu sau lần đăng nhập đầu.

## Dữ liệu
Toàn bộ dữ liệu nằm trong thư mục `data/` (gitignored): SQLite DB, media upload, secret key, backups.
Backup = sao chép nguyên thư mục này.

## Quản trị dự án
Artifact thiết kế & quy trình nằm tại `.DHSYSTEM/` — đọc `.DHSYSTEM/AI-GUIDE.md` trước khi code.

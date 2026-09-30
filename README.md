# SmartLecture

> **Hệ thống tương tác trên lớp** — chạy nội bộ trên máy giáo viên, học viên truy cập qua WiFi/LAN
> bằng trình duyệt điện thoại/laptop. Toàn bộ dữ liệu nằm trên máy GV, hoạt động offline hoàn toàn.

## Trải nghiệm một buổi dạy

```
1. GV mở máy → server tự chạy → chiếu QR cho lớp quét vào
2. Dạy bài giảng (PDF/video/PPTX trong thư viện) — hỗ trợ Phòng lab ảo minh họa mạch logic & DC
3. Kết thúc mỗi nội dung: bật game tương tác
   ⚡ Trắc nghiệm nhanh   🪢 Kéo co 2 đội   🏁 Đua toán   🧩 Ô chữ   ✋ Giơ tay trả lời
   → HV trả lời đúng được cộng thẳng điểm kiểm tra thường xuyên (GV tự đặt +0.25/+0.5/+1)
4. Kiểm tra online nhanh có giám thị + chấm tự luận bằng AI
5. Giao BTVN (có hạn nộp) — hôm sau bấm "Gọi ngẫu nhiên" ưu tiên chọn bạn chưa nộp lên bảng làm
6. Điểm danh buổi học (số tiết vắng + lý do) — sổ điểm 3 cột xuất Excel bất kỳ lúc nào
```

## Công nghệ

- **Server:** Node.js 24 · Express 5 · `node:sqlite` (zero native build) · Socket.IO · JWT + bcrypt · Gemini AI
  (resilience layer: queue/backoff/fallback/structured output/quota counter)
- **Web:** React 19 · Vite 7 · TypeScript strict · Tailwind v4 · Zustand · ExcelJS (tải khi xuất Excel)
- **RAG:** PDF/DOCX/PPTX/TXT → chunk heading-aware → Gemini embedding → cosine search;
  **không có API key vẫn chạy** ở chế độ từ khóa (offline-first)

> Baseline phát hành: **v0.10.2** (P1–P74 hoàn thành). Milestone **v0.11.0** đang triển khai từ P75 cho khôi phục chủ sở hữu, an toàn dữ liệu cài đặt, hardening và bộ icon mới.

## Chạy

```bash
npm install          # workspaces: server/ + web/
npm run dev          # API :4000 + Web :5173 (dev proxy sẵn)
# Production:
npm run build && npm start -w server    # học viên truy cập http://<ip-máy-GV>:4000
```

Mặc định server chạy trực tiếp trong LAN và bỏ qua `X-Forwarded-For`; launcher/bộ cài không cần `TRUST_PROXY`. Chỉ khi triển khai sau reverse proxy do bạn kiểm soát, đặt danh sách **IP/CIDR của chính proxy kết nối trực tiếp với ứng dụng**, ví dụ `TRUST_PROXY=127.0.0.1/32` hoặc `TRUST_PROXY=10.0.0.5,10.0.0.6`. Không dùng `true`, số hop (`1`) hoặc subnet bao phủ tất cả địa chỉ. Proxy phải ghi đè `X-Forwarded-For` do client gửi và chặn truy cập trực tiếp vào cổng backend ngoài proxy. Cấu hình sai làm server từ chối khởi động. Khi proxy thực sự phục vụ HTTPS, đặt thêm `SESSION_COOKIE_SECURE=true`; không bật cờ này cho truy cập HTTP LAN trực tiếp vì trình duyệt sẽ không gửi cookie Secure qua HTTP.

Nếu cần kiểm tra bản production sau khi khởi động trên Windows:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/healthcheck.ps1 -Port 4000
```

Trên Windows, build giữ lại asset cũ có hash để tránh lỗi khoá thư mục `web/dist` từ hệ điều hành; `index.html` luôn trỏ tới asset của lần build hiện tại.

Tài khoản mặc định lần đầu: `admin / admin123` (bắt buộc đổi).

### Dữ liệu demo

Để có ngay 20 câu hỏi cơ bản cùng một game Quick Quiz mẫu, chạy:

```bash
npm run seed:demo-quiz
```

Lệnh có thể chạy lại an toàn, không tạo dữ liệu trùng. Sau khi đăng nhập bằng tài khoản đã seed, mở **Trò chơi → Lưu sẵn** để chạy lại game mẫu; hoặc dùng mã phòng được in ra ở terminal.

## Tiện ích vận hành

### Bộ cài gửi cho người dùng Windows

Build bộ cài phát hành bằng:

```powershell
npm.cmd run build:installer
```

Artifact được tạo tại `release/SmartLecture-Setup-<version>.exe` cùng file checksum `.sha256`. Người dùng chỉ cần chạy file `.exe`; bộ cài chứa sẵn Node.js runtime, tạo shortcut Desktop/Start Menu và không yêu cầu source code hay npm trên máy đích.

Dữ liệu được lưu riêng tại `%LOCALAPPDATA%\SmartLecture\data`, không bị xóa khi nâng cấp hoặc gỡ ứng dụng. Bộ cài hiện chưa ký số nên Windows SmartScreen có thể hiển thị cảnh báo nhà phát hành không xác định; chỉ phát hành qua kênh tin cậy và đối chiếu SHA-256.

### Mở bằng một icon trên Desktop (Windows)

Sau mỗi lần cập nhật mã nguồn, chuẩn bị bản production và cài icon một lần:

```powershell
npm run build
npm run install:shortcut
```

Từ đó, giáo viên chỉ cần bấm đúp **SmartLecture** trên Desktop. Icon tự kiểm tra server, tự khởi động server nền nếu cần và mở `http://localhost:4000` trong trình duyệt mặc định. Launcher không tự build và không tự dừng tiến trình lạ đang chiếm cổng 4000; sau khi cập nhật, hãy chạy lại `npm run build` trước khi mở icon.

### Phát hành cho giảng viên không cần GitHub

Trên máy phát triển, tạo một file cài đặt độc lập bằng `npm.cmd run build:installer`. File kết quả là `release/SmartLecture-Setup-<version>.exe`; gửi riêng file này cho giảng viên qua USB hoặc dịch vụ chia sẻ tệp. Bộ cài chứa Node runtime và toàn bộ thành phần chạy ứng dụng, không yêu cầu Node.js, Git hay quyền truy cập repository ở máy giảng viên. Hướng dẫn dành cho giảng viên: [HUONG-DAN-CAI-DAT.md](docs/HUONG-DAN-CAI-DAT.md).

| Việc | Cách |
|---|---|
| Tự khởi động cùng Windows | `powershell -File scripts/install-autostart.ps1` (chạy `npm run build` trước) |
| Cài/gỡ icon Desktop SmartLecture | `npm run install:shortcut` / `npm run uninstall:shortcut` |
| Mở bằng terminal (tương đương bấm icon) | `npm run start:app` |
| Backup thủ công / xem bản sao lưu | Cài đặt → Hệ thống & sao lưu (tự động 02:00 hằng ngày, giữ 7 bản) |
| Cho HV làm BTVN từ nhà | Cài đặt → Mở tunnel (cần `cloudflared`) — **tắt ngay sau khi giao bài** |
| Truy cập kiểu `smart-lecture.local` | Tự động nếu máy có Bonjour |
| In đề A4 thể thức VN + trang đáp án | Danh sách đề thi → 🖨 In A4 |

## Cấu trúc

```
server/  Express + node:sqlite + Socket.IO + RAG/AI services (+ migrations đánh số)
web/     React SPA theo vai trò Admin/GV/Học viên
data/    runtime (gitignored): SQLite, media, secret.key, backups/
.DHSYSTEM/  artifact quản trị: ARCHITECTURE, ROADMAP, SYSTEM-RULES, TRACKER…
scripts/ E2E cô lập/idempotent · autostart · seed helper
```

## Kiểm thử

```powershell
npm run typecheck       # TypeScript strict cho server + web
npm run test:e2e        # DB tạm riêng: REST 82/82, Socket 10/10, restore–restart
npm run test:browser    # Chrome/Chromium headless, DB tạm riêng
```

CI GitHub Actions chạy typecheck, production build và E2E cô lập cho mọi push/PR.

## Trạng thái chất lượng

- Phase 7 ổn định nền tảng và Phase 8 kiến trúc UI đã được xác minh local.
- React Doctor full-scan: **100/100**, không còn issue trên 42 file frontend.
- Entry bundle production: khoảng **209.82 kB**; các màn hình lớn và ExcelJS chỉ tải khi người dạy xuất tệp.

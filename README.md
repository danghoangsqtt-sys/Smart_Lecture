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
- **Web:** React 19 · Vite 7 · TypeScript strict · Tailwind v4 · Zustand · SheetJS
- **RAG:** PDF/DOCX/PPTX/TXT → chunk heading-aware → Gemini embedding → cosine search;
  **không có API key vẫn chạy** ở chế độ từ khóa (offline-first)

## Chạy

```bash
npm install          # workspaces: server/ + web/
npm run dev          # API :4000 + Web :5173 (dev proxy sẵn)
# Production:
npm run build && npm start -w server    # học viên truy cập http://<ip-máy-GV>:4000
```

Tài khoản mặc định lần đầu: `admin / admin123` (bắt buộc đổi).

## Tiện ích vận hành

| Việc | Cách |
|---|---|
| Tự khởi động cùng Windows | `powershell -File scripts/install-autostart.ps1` |
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
scripts/ e2e-smoke.ps1 (71 checks) · autostart · seed helper
```

## Kiểm thử

```powershell
scripts/e2e-smoke.ps1   # E2E toàn luồng: auth, lớp, bài giảng, câu hỏi, thi,
                        # chấm, game, RAG, backup, archive… (chạy với server ở PORT=4100)
```

CI GitHub Actions: typecheck strict + production build cho mọi push/PR.

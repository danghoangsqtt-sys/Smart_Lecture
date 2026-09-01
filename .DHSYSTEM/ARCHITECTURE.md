# ARCHITECTURE — Smart_Lecture

## 1. Sơ đồ tổng thể

```
MÁY GIÁO VIÊN                                THIẾT BỊ HỌC VIÊN / GV KHÁC
┌────────────────────────────────────┐       ┌──────────────────┐
│  server/ (Node 24)                  │       │ Browser          │
│  ├── Express :4000                  │       │ http://<ip>:4000 │
│  │   ├── REST API /api/*            │◄─────►│ (điện thoại/     │
│  │   ├── Static web/dist            │WiFi   │  laptop/LAN)     │
│  │   ├── Media stream (Range)       │ LAN   └──────────────────┘
│  │   └── node:sqlite (WAL)          │
│  ├── Socket.IO /game,/live          │
│  ├── RAG worker (chunk + embed)     │
│  └── data/                          │
│      ├── smart-lecture.db           │
│      ├── media/ (video,pdf,pptx...) │
│      ├── secret.key                 │
│      └── backups/                   │
└────────────────────────────────────┘
```

- **Dev mode:** Vite dev server :5173 proxy `/api` + `/socket.io` → :4000
- **Prod mode:** server phục vụ `web/dist` tĩnh → học viên chỉ cần 1 URL duy nhất
- **Khởi động cùng Windows:** Task Scheduler chạy `npm start` trong thư mục server (roadmap P4)

## 2. Cấu trúc monorepo

```
Smart_Lecture/
├── server/            # Backend Node.js + TypeScript (tsx dev, tsc build)
│   └── src/
│       ├── index.ts           # bootstrap: express + socket.io + static
│       ├── config.ts          # port, đường dẫn data, jwt secret loader
│       ├── db/
│       │   ├── connection.ts  # node:sqlite DatabaseSync singleton + migrate
│       │   ├── schema.sql     # DDL toàn bộ bảng
│       │   └── seed.ts        # tạo admin mặc định lần đầu
│       ├── middleware/auth.ts # JWT verify + requireRole()
│       ├── routes/            # auth, users, classes, lectures, materials,
│       │                      # questions, exams, results, grades, attendance,
│       │                      # rag, games, settings, backup
│       ├── services/          # gemini.ts (resilience layer), rag.ts,
│       │                      # docparse.ts, examEngine.ts, excelExport.ts
│       └── realtime/          # gameRoom.ts (Socket.IO rooms)
├── web/               # Frontend React 19 + Vite + TS strict + Tailwind v4
│   └── src/
│       ├── pages/             # theo route role-based
│       ├── components/        # UI dùng chung
│       ├── stores/            # Zustand: auth, ui
│       ├── lib/api.ts         # fetch wrapper gắn JWT + refresh lỗi 401
│       └── realtime/socket.ts # Socket.IO client singleton
├── data/              # runtime (gitignore): db, media, secret, backups
└── .DHSYSTEM/         # artifact quản trị dự án
```

## 3. ERD cơ sở dữ liệu (SQLite)

```mermaid
erDiagram
    users ||--o{ classes : "teaches"
    users ||--o{ enrollments : "is student"
    classes ||--o{ enrollments : has
    classes ||--o{ lectures : contains
    lectures ||--o{ materials : contains
    users ||--o{ questions : creates
    folders ||--o{ questions : groups
    users ||--o{ exams : creates
    exams ||--o{ exam_results : has
    users ||--o{ exam_results : attempts
    classes ||--o{ attendance_sessions : has
    attendance_sessions ||--o{ attendance_records : has
    users ||--o{ attendance_records : marked
    classes ||--o{ grades : tracks
    users ||--o{ grades : receives
    game_sessions ||--o| game_circuit_runtime : resumes
    game_sessions ||--o{ game_circuit_player_states : persists
    users ||--o{ game_circuit_player_states : owns
    users ||--o{ rag_documents : owns
    rag_documents ||--o{ rag_chunks : chunked_into
    exams ||--o{ game_rounds : sources
```

### Schema chính (chi tiết DDL xem `server/src/db/schema.sql`)
- **users**(id TEXT pk, username UNIQUE, password_hash, role CHECK(admin|teacher|student), display_name, status active|locked, created_at)
- **classes**(id, name, subject, teacher_id FK→users, academic_year, settings_json) 
- **enrollments**(class_id, student_id, PK(class_id,student_id))
- **lectures**(id, class_id, chapter, title, sort_order, description)
- **materials**(id, lecture_id, type CHECK(pdf|docx|pptx|video|link|image), title, file_path NULL nếu link, link_url, size_bytes, page_count)
- **folders**(id, owner_id, name, module CHECK(question|exam))
- **questions**(id, owner_id, type CHECK(mcq|essay), content, options_json, correct_answer, explanation, bloom_level, category, folder_id INDEXED, image_path, is_public_bank, created_at) — *bài học bluebee: bloom/folder/category là cột riêng có index, KHÔNG nhét metadata JSON*
- **exams**(id, creator_id, title, duration_min, question_ids_json, config_json {start_at,end_at,password,shuffle_q,shuffle_o,max_attempts,purpose online_test|self_study,status draft|published,class_id})
- **exam_results**(id, exam_id, student_id, status CHECK(in_progress|disconnected|submitted), remaining_sec, saved_answers_json, score REAL, red_flags, answers_detail_json, ai_evaluation, updated_at, UNIQUE(exam_id,student_id))
- **attendance_sessions**(id, class_id, session_date, periods_total)
- **attendance_records**(session_id, student_id, status CHECK(present|absent|late), periods_absent, reason)
- **grades**(class_id, student_id, kttx REAL NULL, process_1 REAL NULL, final_exam REAL NULL, PRIMARY KEY(class_id,student_id))
- **game_sessions**(id, host_teacher_id, game_type, exam_id NULL, status lobby|running|finished, room_code, started_at)
- **game_results**(game_session_id, student_id, score, rank, detail_json)
- **game_circuit_runtime**(game_session_id PK/FK, challenge_index, challenge_ends_at epoch-ms, is_paused, remaining_ms, updated_at) — deadline tuyệt đối khi chạy; thời lượng còn lại là nguồn sự thật khi pause
- **game_circuit_player_states**(game_session_id, student_id, display_name, score, circuit_json, circuit_challenge_id, simulation_state, measurements_json, completed_challenges_json, last_activity_at epoch-ms, PK(game_session_id,student_id))
- **game_circuit_assistance**(game_session_id, student_id, message_id UNIQUE, kind hint|retry, message, teacher_name, sent_at, delivered_at NULL, acknowledged_at NULL, PK(game_session_id,student_id)) — checkpoint hỗ trợ mới nhất, không phải lịch sử hội thoại
- **rag_documents**(id, owner_id, filename, file_path, mime, status pending|parsing|ready|error, error_msg, page_count)
- **rag_chunks**(id, rag_doc_id, seq, heading_path, text, page, embedding BLOB float32[])

## 4. API sketch (REST, tiền tố /api)

| Nhóm | Endpoint chính | Role |
|---|---|---|
| Auth | POST /auth/login · GET /auth/me · POST /auth/change-password | all |
| Users | POST /users (admin→teacher, teacher→student) · POST /users/import-excel · PATCH /users/:id/status | admin, teacher |
| Classes | CRUD /classes · POST /classes/:id/enroll · GET /classes/mine | teacher, admin |
| Lectures | CRUD /classes/:cid/lectures → /lectures/:id/materials | teacher |
| Materials | POST /materials/upload (multipart) · GET /media/:materialId/stream (Range) | theo lớp |
| Questions | CRUD /questions (+filter type,bloom,folder,q) · POST /questions/bulk · import text | teacher |
| AI | POST /ai/generate-questions (Bloom matrix) · POST /ai/grade-essay · POST /ai/comment-student | teacher only |
| Exams | CRUD /exams · POST /exams/:id/publish · GET /exams/available (student) | phân vai |
| Taking | POST /exams/:id/attempts (tạo/resume attempt) · PUT /attempts/:id/answers · POST /attempts/:id/submit | student |
| Grades | GET /classes/:cid/gradebook · PUT /grades/:sid/:col | teacher |
| Attendance | POST /classes/:cid/sessions · PUT /sessions/:sid/records | teacher |
| RAG | POST /rag/documents (upload) · GET /rag/documents/:id/status · POST /rag/chat (GV) | teacher |
| System | GET /health · GET /system/info (LAN IP + QR payload) · POST /system/backup | admin |

Quy tắc: mọi mutation có zod validate; lỗi chuẩn `{error: {code, message}}`; phân quyền middleware `requireRole('teacher')`.

## 5. Realtime events (Socket.IO)

Namespace mặc định, phòng theo `game:{roomCode}` và `proctor:{examId}`:

| Event (client→server) | Payload | Mô tả |
|---|---|---|
| game:host-attach | {sessionId} | GV tạo phòng gắn/reconnect console; server kiểm tra đúng host trước khi đồng bộ |
| game:join | {roomCode} | HV vào phòng lobby (yêu cầu JWT) |
| game:start | {} | GV bấm bắt đầu |
| game:answer | {questionId, choice, msTaken} | HV trả lời, server tính điểm realtime |
| game:next | {} | GV chuyển câu tiếp |
| proctor:watch | {examId} | GV mở màn hình giám thị |
| circuit_simulate:circuit | {components, wires, submitted} | HV đồng bộ topology; server chỉ chấm/cộng điểm khi `submitted=true` |
| circuit_simulate:host-control | {action: pause\|resume\|skip\|restart} | Chỉ host điều khiển challenge; pause/resume giữ topology, skip không chấm, restart không thu hồi điểm đã ghi |
| circuit_simulate:inspect | {userId} | Chỉ host đã attach yêu cầu topology hiện tại của một học viên; server không trả reference circuit |
| circuit_simulate:teacher-message | {userId, kind: hint\|retry, message?} | Chỉ host gửi hỗ trợ riêng tới socket học viên được chọn; hint trim/tối đa 300 ký tự, retry không reset state |
| circuit_simulate:teacher-message-ack | {messageId} | Chỉ học viên đích đang xác thực xác nhận checkpoint mới nhất; sai message/user/session bị bỏ qua |
| proctor:flag | {examId, type} | Server phát khi HV tab-switch |

Server→client: `host:sync`, `lobby:update`, `leaderboard:update`, `question:show`, `game:finish`, `circuit_simulate:challenge`, `circuit_simulate:control_state`, `circuit_simulate:progress`, `circuit_simulate:progress_snapshot`, `circuit_simulate:inspection`, `circuit_simulate:inspection_update`, `circuit_simulate:teacher-message` (selected learner), `circuit_simulate:teacher-message-sent` (requesting host ACK), `circuit_simulate:teacher-message-status` (private host room), `circuit_simulate:teacher-message-acknowledged` (selected learner), `circuit_simulate:restored`, `circuit_simulate:challenge_passed`, `proctor:progress`, `proctor:redflag`.
`host:sync` trả trạng thái công khai của phòng. Với game mạch đang chạy, payload bổ sung challenge hiện tại (không có reference circuit), tối đa 8 dòng hoàn thành dựng từ state server và bảng xếp hạng lấy từ điểm circuit player.
Khi khởi động, server nạp các `circuit_simulate` đang `running`, dựng lại state từng học viên và đặt timer theo phần thời gian còn lại của `challenge_ends_at`; phòng đang pause không đặt timer và giữ nguyên `remaining_ms` kể cả khi deadline cũ đã trôi qua. Học viên reconnect trước giáo viên vẫn có thể lazy-load phòng bằng `roomCode`; completed challenge và cộng KTTX được ghi trong cùng transaction để chống cộng trùng khi process dừng đột ngột.
Topology học viên không được phát vào room chung `game:{roomCode}`. Host hợp lệ được join room riêng `game-host:{sessionId}` để nhận metadata tiến độ; topology đầy đủ chỉ trả trực tiếp cho socket đã gọi inspect và tiếp tục cập nhật theo subscription của socket đó.
`lastActivityAt` là epoch do server cập nhật chỉ khi học viên sửa mạch, gửi đo lường hoặc thao tác mô phỏng; các lần persist/attach/pause không làm mới mốc này. UI host tự suy ra “Cần hỗ trợ” sau 10 giây đối với trạng thái online/working. Hint/retry không broadcast vào room chung, không lưu lịch sử và không thay đổi topology, timer, completion, score hay KTTX.
Checkpoint hỗ trợ mới nhất được persist trước khi phát. Nếu không có socket học viên đích, status là `queued`; mỗi connection mới nhận lại checkpoint chưa acknowledge đúng một lần rồi status thành `delivered`. Học viên xác nhận bằng message id để thành `acknowledged`; `host:sync` khôi phục cả ba trạng thái sau reload/restart. Gửi tin mới thay checkpoint cũ thay vì tạo lịch sử không giới hạn.
Giới hạn thiết kế: ≤ 60 kết nối/phòng (đủ quy mô lớp).

## 6. Luồng RAG pipeline (services/rag.ts)

```
Upload PDF/DOCX/PPTX (multer → data/media/)
  → docparse: pdfjs-serverless (PDF) · mammoth (DOCX) · unzip+XML parse (PPTX)
  → chia khối theo heading (Title/Heading path), 500–1000 token, overlap ~15%
  → metadata: page, heading_path (học thiết kế Chunkr)
  → Gemini text-embedding-001 (batch 100 chunks/request, retry backoff 429)
  → Lưu rag_chunks.embedding BLOB float32
Chat: embed câu hỏi → cosine similarity top-K (in-memory, đủ nhanh ≤50k chunks)
  → inject context vào systemInstruction + trích dẫn [tên tài liệu, trang X]
Rate limit AI: bảng counters trong SQLite (feature, day, count) — quota guard toàn cục
```

## 7. Bảo mật

- JWT HS256, secret random 64 bytes sinh 1 lần lưu `data/secret.key` (0600)
- bcryptjs cost 10; khóa tài khoản sau 10 lần sai liên tiếp (unlock bởi admin/GV chủ lớp)
- CORS chặn theo cấu hình; helmet headers; rate-limit express-rate-limit 300 req/phút/IP
- Upload: whitelist mime + extension, giới hạn 500MB/video, quét phần mở rộng kép; filename lưu uuid, giữ tên gốc trong DB
- SQL: chỉ prepared statements; không bao giờ ghép chuỗi input vào query
- API key Gemini: nhập trong Settings của GV/admin, mã hóa AES-256-GCM bằng secret.key trước khi lưu DB — không bao giờ trả về client sau khi lưu

## 8. Bổ sung ổn định API (2026-08-27)

- Router đơn miền mount theo prefix: `/api/schedule`, `/api/media-audit`, `/api/ai`, `/api/rag`, `/api/system`, `/api/settings`.
- Subject CRUD thuộc `classes.routes.ts`; question CRUD/import/stats thuộc `questions.routes.ts`; backup thuộc `system.routes.ts`. Không mount router trùng.
- `ZodError` và JSON sai cú pháp được error middleware chuẩn hóa thành HTTP 400.
- `DATA_DIR` và `DB_PATH` có thể override bằng biến môi trường; CI/E2E bắt buộc dùng thư mục tạm.
- Restore ghi `restore-pending.db`; lần boot kế tiếp tạo bản DB trước-restore rồi thay DB trước khi mở kết nối SQLite.
- `game_sessions.class_id` là nguồn enrollment gate; mọi event điều khiển host so khớp `host_teacher_id` với JWT socket.

# T-8802 — API kho chương trình, media độc lập và snapshot game

## Objective

Mở API môn/bài dùng chung, liên kết lớp–môn và câu hỏi theo ID; phục vụ học liệu có bản sao riêng, bảo toàn nguồn cũ; đóng băng câu hỏi khi bắt đầu game. T-8803 mới chuyển UI sang API này. Không làm tính năng AI hoặc nâng cấp bản cài trong task này.

## Paths

- `server/src/routes/sharedCurriculum.routes.ts`, `server/src/index.ts`
- `server/src/routes/questions.routes.ts`
- `server/src/db/schema.sql`, `server/src/db/connection.ts`, `server/src/db/migrations/030-game-question-snapshot.ts`
- `server/src/realtime/roomStore.ts`, `server/src/realtime/gameControlHandlers.ts`
- `server/src/services/sharedCurriculumMedia.ts`
- `scripts/shared-curriculum-api-test.mjs`, `scripts/shared-curriculum-migration-test.mjs`, `package.json`
- `.DHSYSTEM/ARCHITECTURE.md`, `.DHSYSTEM/TRACKER.md`, `.DHSYSTEM/HANDOFF.json`
- `.DHSYSTEM/ROADMAP.md`
- `.DHSYSTEM/phases/P88-shared-curriculum/PHASE-STATE.md`, this task file, `CHANGELOG.md`

## File-Level Plan

1. Routes: list/create/update/delete unreferenced shared subjects and lessons; assign/unassign class subject, read/write per-class progress; link/unlink owned question IDs to lessons. Question deletion reports/avoids linked rows rather than returning SQLite 500. Zod at every write boundary, role and owner/class checks, prepared SQL and transactions. Legacy routes stay available.
2. Media: copy verified legacy files into a new UUID path without touching source, mark `ready` only after copy and size verification; publish only `ready` assets through authenticated stream. New upload uses same independent asset lifecycle and cleanup on DB failure.
3. Game: additive snapshot storage; on host start, persist ordered question payloads atomically with status transition, then restore from snapshot (legacy sessions fall back to bank). Editing/deleting bank questions must not change a started session.
4. Tests: isolated temp DB/media API and snapshot regressions including owner/teacher/student access, missing source files, duplicate association, retry and legacy compatibility.
5. Docs: API sketch, task evidence and remaining release gates. No installed DB/app changes.

## Best Practices

- Không tự gộp môn theo tên hay đoán liên kết câu hỏi từ chapter/lesson text.
- FK rõ, quyền sở hữu môn và lớp được kiểm tra tại server; students chỉ xem môn gắn lớp biên chế của họ.
- File shared không dùng chung đường dẫn với legacy; path luôn là basename UUID trong media dir. Không đưa asset `pending_copy` ra API stream.
- Migration cộng thêm, idempotent; transaction ngắn; test trên DB tạm. Giữ endpoint cũ tương thích.

## Verification

- `npm run typecheck`, `npm run lint`, `npm run build`, focused curriculum tests và `npm run test:e2e`.
- `git diff --check`; DB/bản cài đang dùng không thay đổi.

## Acceptance

- Môn/bài dùng chung chỉ có một bản nguồn dù gắn hai lớp; tiến độ theo lớp tách riêng và API kiểm tra quyền giáo viên, lớp, học viên. Câu hỏi chỉ gắn bài theo ID; xóa liên kết/dữ liệu có tham chiếu không làm hỏng FK hoặc trả 500.
- File legacy pending không stream được; sao chép UUID và kiểm SHA-256/chữ ký trước ready; xóa file cũ không ảnh hưởng bản chung. Upload mới có whitelist MIME/extension/chữ ký và dọn file khi ghi thất bại.
- Game ghi snapshot trong transaction khi chuyển lobby→running, khôi phục từ snapshot, còn game cũ fallback; thiếu câu hỏi không đổi trạng thái game.
- Chỉ test với DB/media cô lập; chưa áp migration v30 cho bản cài.

## Status

- `done` (source only) — 2026-10-01. API isolated 20/20; migration fixture 11/11; typecheck/lint/build/focused và full E2E đạt. DB/bản cài đang dùng không bị thay đổi. UI nguồn chung là T-8803, regression/Browser là T-8804.

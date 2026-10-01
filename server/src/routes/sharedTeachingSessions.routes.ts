import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import { db, tx } from '../db/connection.js';
import { requireAuth, requireRole, type AuthedRequest } from '../middleware/auth.js';
import { HttpError, h } from '../utils/errors.js';

const router = Router();
router.use('/shared/teaching-sessions', requireAuth, requireRole('teacher', 'admin'));

const id = z.string().trim().min(1).max(128);
const startSchema = z.object({
  subjectId: id,
  lessonId: id,
  classIds: z.array(id).min(1).max(4),
}).strict();

type User = NonNullable<AuthedRequest['user']>;
type SessionRow = {
  id: string;
  class_id: string;
  shared_subject_id: string | null;
  shared_lesson_id: string | null;
  started_at: string;
  ended_at: string | null;
};

function assertManageClass(classId: string, user: User): void {
  const cls = db.prepare('SELECT teacher_id FROM classes WHERE id = ?').get(classId) as { teacher_id: string } | undefined;
  if (!cls) throw new HttpError(404, 'NOT_FOUND', 'Không tìm thấy lớp học');
  if (user.role !== 'admin' && cls.teacher_id !== user.id) {
    throw new HttpError(403, 'FORBIDDEN', 'Không có quyền với một trong các lớp');
  }
}

function getClassIds(session: SessionRow): string[] {
  const rows = db.prepare('SELECT class_id FROM teaching_log_classes WHERE teaching_log_id = ? ORDER BY class_id')
    .all(session.id) as { class_id: string }[];
  return rows.length ? rows.map((row) => row.class_id) : [session.class_id];
}

function serialize(session: SessionRow) {
  return {
    id: session.id,
    subjectId: session.shared_subject_id,
    lessonId: session.shared_lesson_id,
    classIds: getClassIds(session),
    startedAt: session.started_at,
    endedAt: session.ended_at,
  };
}

function getSession(idValue: string): SessionRow {
  const row = db.prepare('SELECT * FROM teaching_logs WHERE id = ? AND shared_subject_id IS NOT NULL')
    .get(idValue) as SessionRow | undefined;
  if (!row) throw new HttpError(404, 'NOT_FOUND', 'Không tìm thấy phiên dạy');
  return row;
}

function assertManageSession(session: SessionRow, user: User): void {
  for (const classId of getClassIds(session)) assertManageClass(classId, user);
}

function activeForClass(classId: string): SessionRow[] {
  return db.prepare(`SELECT l.* FROM teaching_logs l
    WHERE l.ended_at IS NULL AND (l.class_id = ? OR EXISTS
      (SELECT 1 FROM teaching_log_classes lc WHERE lc.teaching_log_id = l.id AND lc.class_id = ?))
    ORDER BY l.started_at DESC, l.id DESC`).all(classId, classId) as SessionRow[];
}

router.post('/shared/teaching-sessions/start', h(async (req, res) => {
  const parsed = startSchema.safeParse(req.body);
  if (!parsed.success) throw new HttpError(400, 'BAD_INPUT', 'Dữ liệu phiên dạy không hợp lệ');
  const { subjectId, lessonId } = parsed.data;
  const classIds = [...parsed.data.classIds].sort();
  if (new Set(classIds).size !== classIds.length) throw new HttpError(400, 'BAD_INPUT', 'Lớp tham gia không được trùng');
  const user = (req as AuthedRequest).user!;
  let session!: SessionRow;
  let resumed = false;
  tx(() => {
    const lesson = db.prepare('SELECT subject_id FROM shared_lessons WHERE id = ?').get(lessonId) as { subject_id: string } | undefined;
    if (!lesson || lesson.subject_id !== subjectId) throw new HttpError(400, 'BAD_INPUT', 'Bài học không thuộc môn đã chọn');
    for (const classId of classIds) {
      assertManageClass(classId, user);
      if (!db.prepare('SELECT 1 FROM class_subject_assignments WHERE class_id = ? AND subject_id = ?').get(classId, subjectId)) {
        throw new HttpError(409, 'SUBJECT_NOT_ASSIGNED', 'Môn học chưa được gắn cho một trong các lớp');
      }
    }
    const active = classIds.flatMap(activeForClass);
    if (active.length) {
      const first = active[0]!;
      const participants = getClassIds(first);
      if (active.length !== classIds.length || active.some((row) => row.id !== first.id)
        || first.shared_subject_id !== subjectId || first.shared_lesson_id !== lessonId
        || participants.length !== classIds.length || participants.some((value, index) => value !== classIds[index])) {
        throw new HttpError(409, 'SESSION_CONFLICT', 'Một lớp đang có phiên dạy khác; hãy kết thúc phiên trước');
      }
      session = first;
      resumed = true;
      return;
    }
    const sessionId = randomUUID();
    db.prepare(`INSERT INTO teaching_logs (id, class_id, shared_subject_id, shared_lesson_id)
      VALUES (?, ?, ?, ?)`).run(sessionId, classIds[0]!, subjectId, lessonId);
    const insertClass = db.prepare('INSERT INTO teaching_log_classes (id, teaching_log_id, class_id) VALUES (?, ?, ?)');
    for (const classId of classIds) insertClass.run(randomUUID(), sessionId, classId);
    session = getSession(sessionId);
  });
  res.status(resumed ? 200 : 201).json({ resumed, session: serialize(session) });
}));

router.get('/shared/teaching-sessions/active', h(async (req, res) => {
  const parsed = id.safeParse(req.query.classId);
  if (!parsed.success) throw new HttpError(400, 'BAD_INPUT', 'Thiếu lớp cần tra cứu');
  const user = (req as AuthedRequest).user!;
  assertManageClass(parsed.data, user);
  const active = activeForClass(parsed.data)[0];
  if (active && active.shared_subject_id) assertManageSession(active, user);
  res.json({ session: active ? serialize(active) : null });
}));

router.get('/shared/teaching-sessions/:sessionId', h(async (req, res) => {
  const session = getSession(String(req.params.sessionId));
  assertManageSession(session, (req as AuthedRequest).user!);
  res.json({ session: serialize(session) });
}));

router.post('/shared/teaching-sessions/:sessionId/end', h(async (req, res) => {
  const session = getSession(String(req.params.sessionId));
  assertManageSession(session, (req as AuthedRequest).user!);
  if (!session.ended_at) db.prepare("UPDATE teaching_logs SET ended_at = datetime('now') WHERE id = ? AND ended_at IS NULL").run(session.id);
  res.json({ session: serialize(getSession(session.id)) });
}));

export default router;

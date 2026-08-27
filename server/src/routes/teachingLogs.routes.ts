import { Router } from 'express';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { db, tx } from '../db/connection.js';
import { requireAuth, requireRole, type AuthedRequest } from '../middleware/auth.js';
import { HttpError, h } from '../utils/errors.js';
import { canManageClass, canViewClass, getClassOrThrow } from '../utils/access.js';
import * as XLSX from 'xlsx';

const router = Router();
router.use(requireAuth);

interface TeachingLogRow {
  id: string;
  class_id: string;
  subject_id: string | null;
  curriculum_item_id: string | null;
  attendance_session_id: string | null;
  lesson_plan_id: string | null;
  started_at: string;
  ended_at: string | null;
  slides_shown: string;
  videos_played: string;
  games_run: string;
  attendance_taken: number;
  kttx_awarded: string;
  notes: string;
}

function getClassOrThrowLocal(id: string) {
  const row = db.prepare('SELECT * FROM classes WHERE id = ?').get(id) as { id: string; teacher_id: string; name: string } | undefined;
  if (!row) throw new HttpError(404, 'NOT_FOUND', 'Không tìm thấy lớp học');
  return row;
}

function canManageLog(user: NonNullable<AuthedRequest['user']>, classId: string): boolean {
  const cls = getClassOrThrowLocal(classId);
  return user.role === 'admin' || (user.role === 'teacher' && cls.teacher_id === user.id);
}

function canViewLog(user: NonNullable<AuthedRequest['user']>, classId: string): boolean {
  if (canManageLog(user, classId)) return true;
  if (user.role !== 'student') return false;
  const e = db.prepare('SELECT 1 FROM enrollments WHERE class_id = ? AND student_id = ?').get(classId, user.id);
  return !!e;
}

function assertLogReferencesBelongToClass(
  classId: string,
  refs: { subjectId?: string | null; curriculumItemId?: string | null; attendanceSessionId?: string | null; lessonPlanId?: string | null }
): void {
  if (refs.subjectId) {
    const subject = db.prepare('SELECT 1 FROM subjects WHERE id = ? AND class_id = ?').get(refs.subjectId, classId);
    if (!subject) throw new HttpError(400, 'BAD_INPUT', 'Môn học không thuộc lớp');
  }
  if (refs.curriculumItemId) {
    const item = db.prepare(
      `SELECT tp.subject_id FROM curriculum_items ci JOIN teaching_plans tp ON tp.id = ci.teaching_plan_id
       WHERE ci.id = ? AND tp.class_id = ?`
    ).get(refs.curriculumItemId, classId) as { subject_id: string | null } | undefined;
    if (!item || (refs.subjectId && item.subject_id !== refs.subjectId)) {
      throw new HttpError(400, 'BAD_INPUT', 'Mục chương trình không thuộc lớp hoặc môn học');
    }
  }
  if (refs.attendanceSessionId) {
    const attendance = db.prepare('SELECT 1 FROM attendance_sessions WHERE id = ? AND class_id = ?').get(refs.attendanceSessionId, classId);
    if (!attendance) throw new HttpError(400, 'BAD_INPUT', 'Buổi điểm danh không thuộc lớp');
  }
  if (refs.lessonPlanId) {
    const lessonPlan = db.prepare(
      `SELECT 1 FROM lesson_plans lp JOIN curriculum_items ci ON ci.id = lp.curriculum_item_id
       JOIN teaching_plans tp ON tp.id = ci.teaching_plan_id WHERE lp.id = ? AND tp.class_id = ?`
    ).get(refs.lessonPlanId, classId);
    if (!lessonPlan) throw new HttpError(400, 'BAD_INPUT', 'Kế hoạch tiết không thuộc lớp');
  }
}

function serializeLog(log: TeachingLogRow) {
  return {
    id: log.id,
    classId: log.class_id,
    subjectId: log.subject_id,
    curriculumItemId: log.curriculum_item_id,
    attendanceSessionId: log.attendance_session_id,
    lessonPlanId: log.lesson_plan_id,
    startedAt: log.started_at,
    endedAt: log.ended_at,
    slidesShown: JSON.parse(log.slides_shown || '[]'),
    videosPlayed: JSON.parse(log.videos_played || '[]'),
    gamesRun: JSON.parse(log.games_run || '[]'),
    attendanceTaken: log.attendance_taken === 1,
    kttxAwarded: JSON.parse(log.kttx_awarded || '[]'),
    notes: log.notes,
  };
}

function getLogOrThrow(id: string): TeachingLogRow {
  const log = db.prepare('SELECT * FROM teaching_logs WHERE id = ?').get(id) as TeachingLogRow | undefined;
  if (!log) throw new HttpError(404, 'NOT_FOUND', 'Không tìm thấy nhật ký');
  return log;
}

router.get(
  '/classes/:classId/teaching-logs/active',
  h(async (req, res) => {
    const cls = getClassOrThrowLocal(String(req.params.classId));
    const user = (req as AuthedRequest).user!;
    if (!canManageLog(user, cls.id)) throw new HttpError(403, 'FORBIDDEN', 'Không có quyền xem phiên dạy đang diễn ra');
    const log = db.prepare('SELECT * FROM teaching_logs WHERE class_id = ? AND ended_at IS NULL ORDER BY started_at DESC LIMIT 1').get(cls.id) as TeachingLogRow | undefined;
    res.json({ log: log ? serializeLog(log) : null });
  })
);

router.get(
  '/classes/:classId/teaching-logs',
  h(async (req, res) => {
    const cls = getClassOrThrowLocal(String(req.params.classId));
    const user = (req as AuthedRequest).user!;
    if (!canViewLog(user, cls.id)) throw new HttpError(403, 'FORBIDDEN', 'Không có quyền xem nhật ký');
    const subjectId = req.query.subjectId as string | undefined;
    let sql = 'SELECT * FROM teaching_logs WHERE class_id = ?';
    const params: (string | number)[] = [cls.id];
    if (subjectId) {
      sql += ' AND subject_id = ?';
      params.push(subjectId);
    }
    sql += ' ORDER BY started_at DESC LIMIT 200';
    const logs = db.prepare(sql).all(...params) as unknown as TeachingLogRow[];
    res.json({
      logs: logs.map(serializeLog),
    });
  })
);

router.get(
  '/teaching-logs/:logId',
  h(async (req, res) => {
    const log = getLogOrThrow(String(req.params.logId));
    const cls = getClassOrThrowLocal(log.class_id);
    if (!canViewLog((req as AuthedRequest).user!, cls.id)) throw new HttpError(403, 'FORBIDDEN', 'Không có quyền xem');
    res.json({ log: serializeLog(log) });
  })
);

const startLogSchema = z.object({
  classId: z.string(),
  subjectId: z.string().nullable().optional(),
  curriculumItemId: z.string().nullable().optional(),
  attendanceSessionId: z.string().nullable().optional(),
  lessonPlanId: z.string().nullable().optional(),
});

router.post(
  '/teaching-logs/start',
  requireRole('teacher', 'admin'),
  h(async (req, res) => {
    const user = (req as AuthedRequest).user!;
    const parsed = startLogSchema.safeParse(req.body);
    if (!parsed.success) throw new HttpError(400, 'BAD_INPUT', 'Dữ liệu không hợp lệ');
    const cls = getClassOrThrowLocal(parsed.data.classId);
    if (!canManageLog(user, cls.id)) throw new HttpError(403, 'FORBIDDEN', 'Không có quyền tạo nhật ký');
    assertLogReferencesBelongToClass(cls.id, parsed.data);
    const active = db.prepare('SELECT * FROM teaching_logs WHERE class_id = ? AND ended_at IS NULL ORDER BY started_at DESC LIMIT 1').get(cls.id) as TeachingLogRow | undefined;
    if (active) {
      res.json({ id: active.id, resumed: true, log: serializeLog(active) });
      return;
    }
    const id = randomUUID();
    db.prepare(
      `INSERT INTO teaching_logs (id, class_id, subject_id, curriculum_item_id, attendance_session_id, lesson_plan_id, started_at, slides_shown, videos_played, games_run, attendance_taken, kttx_awarded, notes)
       VALUES (?, ?, ?, ?, ?, ?, datetime('now'), '[]', '[]', '[]', 0, '[]', '')`
    ).run(
      id,
      cls.id,
      parsed.data.subjectId ?? null,
      parsed.data.curriculumItemId ?? null,
      parsed.data.attendanceSessionId ?? null,
      parsed.data.lessonPlanId ?? null
    );
    res.status(201).json({ id, resumed: false });
  })
);

const updateLogSchema = z.object({
  endedAt: z.string().nullable().optional(),
  attendanceSessionId: z.string().nullable().optional(),
  slidesShown: z.array(z.string()).optional(),
  videosPlayed: z.array(z.string()).optional(),
  gamesRun: z.array(z.string()).optional(),
  attendanceTaken: z.boolean().optional(),
  kttxAwarded: z.array(z.string()).optional(),
  notes: z.string().max(5000).optional(),
});

router.patch(
  '/teaching-logs/:logId',
  h(async (req, res) => {
    const log = getLogOrThrow(String(req.params.logId));
    const cls = getClassOrThrowLocal(log.class_id);
    const user = (req as AuthedRequest).user!;
    if (!canManageLog(user, cls.id)) throw new HttpError(403, 'FORBIDDEN', 'Không có quyền sửa');
    const parsed = updateLogSchema.partial().safeParse(req.body);
    if (!parsed.success) throw new HttpError(400, 'BAD_INPUT', 'Dữ liệu không hợp lệ');
    const attendanceSessionId = parsed.data.attendanceSessionId !== undefined ? parsed.data.attendanceSessionId : log.attendance_session_id;
    assertLogReferencesBelongToClass(log.class_id, { attendanceSessionId });
    const slides = parsed.data.slidesShown ?? JSON.parse(log.slides_shown || '[]');
    const videos = parsed.data.videosPlayed ?? JSON.parse(log.videos_played || '[]');
    const games = parsed.data.gamesRun ?? JSON.parse(log.games_run || '[]');
    const kttx = parsed.data.kttxAwarded ?? JSON.parse(log.kttx_awarded || '[]');
    db.prepare(
      `UPDATE teaching_logs SET ended_at = ?, attendance_session_id = ?, slides_shown = ?, videos_played = ?, games_run = ?, attendance_taken = ?, kttx_awarded = ?, notes = ? WHERE id = ?`
    ).run(
      parsed.data.endedAt ?? log.ended_at,
      attendanceSessionId,
      JSON.stringify(slides),
      JSON.stringify(videos),
      JSON.stringify(games),
      parsed.data.attendanceTaken !== undefined ? (parsed.data.attendanceTaken ? 1 : 0) : log.attendance_taken,
      JSON.stringify(kttx),
      parsed.data.notes ?? log.notes,
      log.id
    );
    res.json({ ok: true });
  })
);

const actionSchema = z.object({
  kind: z.enum(['slide', 'video', 'game']),
  id: z.string().min(1).max(200),
});

router.post(
  '/teaching-logs/:logId/actions',
  h(async (req, res) => {
    const log = getLogOrThrow(String(req.params.logId));
    if (log.ended_at) throw new HttpError(409, 'SESSION_ENDED', 'Phiên dạy đã kết thúc');
    if (!canManageLog((req as AuthedRequest).user!, log.class_id)) throw new HttpError(403, 'FORBIDDEN', 'Không có quyền ghi nhận hoạt động');
    const parsed = actionSchema.safeParse(req.body);
    if (!parsed.success) throw new HttpError(400, 'BAD_INPUT', 'Hoạt động không hợp lệ');
    const column = parsed.data.kind === 'slide' ? 'slides_shown' : parsed.data.kind === 'video' ? 'videos_played' : 'games_run';
    const current = JSON.parse(log[column] || '[]') as string[];
    const next = current.includes(parsed.data.id) ? current : [...current, parsed.data.id];
    db.prepare(`UPDATE teaching_logs SET ${column} = ? WHERE id = ?`).run(JSON.stringify(next), log.id);
    res.json({ ok: true, values: next });
  })
);

router.delete(
  '/teaching-logs/:logId',
  h(async (req, res) => {
    const log = db.prepare('SELECT * FROM teaching_logs WHERE id = ?').get(String(req.params.logId)) as TeachingLogRow | undefined;
    if (!log) throw new HttpError(404, 'NOT_FOUND', 'Không tìm thấy nhật ký');
    const cls = getClassOrThrowLocal(log.class_id);
    if (!canManageLog((req as AuthedRequest).user!, cls.id)) throw new HttpError(403, 'FORBIDDEN', 'Không có quyền xóa');
    db.prepare('DELETE FROM teaching_logs WHERE id = ?').run(log.id);
    res.json({ ok: true });
  })
);

router.get(
  '/classes/:classId/teaching-logs/export',
  h(async (req, res) => {
    const cls = getClassOrThrowLocal(String(req.params.classId));
    const user = (req as AuthedRequest).user!;
    if (!canManageLog(user, cls.id)) throw new HttpError(403, 'FORBIDDEN', 'Không có quyền xuất');
    const format = (req.query.format as string) || 'xlsx';
    const subjectId = req.query.subjectId as string | undefined;
    let sql = 'SELECT * FROM teaching_logs WHERE class_id = ?';
    const params: (string | number)[] = [cls.id];
    if (subjectId) {
      sql += ' AND subject_id = ?';
      params.push(subjectId);
    }
    sql += ' ORDER BY started_at DESC';
    const logs = db.prepare(sql).all(...params) as unknown as TeachingLogRow[];
    if (format === 'csv' || format === 'xlsx') {
      const wb = XLSX.utils.book_new();
      const rows = [
        ['STT', 'Ngày bắt đầu', 'Ngày kết thúc', 'Môn học', 'Mục chương trình', 'Buổi điểm danh', 'Kế hoạch tiết',
         'Slide đã trình chiếu', 'Video đã phát', 'Game đã chạy', 'Đã điểm danh', 'KTTX đã cộng', 'Ghi chú'],
        ...logs.map((l, i) => [
          i + 1,
          l.started_at,
          l.ended_at || '',
          l.subject_id || '',
          l.curriculum_item_id || '',
          l.attendance_session_id || '',
          l.lesson_plan_id || '',
          JSON.parse(l.slides_shown || '[]').join('; '),
          JSON.parse(l.videos_played || '[]').join('; '),
          JSON.parse(l.games_run || '[]').join('; '),
          l.attendance_taken ? 'Có' : 'Không',
          JSON.parse(l.kttx_awarded || '[]').join('; '),
          l.notes,
        ]),
      ];
      const ws = XLSX.utils.aoa_to_sheet(rows);
      XLSX.utils.book_append_sheet(wb, ws, 'Nhật ký giảng dạy');
      const buf = XLSX.write(wb, { type: 'buffer', bookType: format === 'csv' ? 'csv' : 'xlsx' });
      res.setHeader('Content-Type', format === 'csv' ? 'text/csv' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="nhat-ky-giang-day-${cls.name}-${Date.now()}.${format}"`);
      res.send(buf);
    } else {
      res.json({ logs });
    }
  })
);

export default router;

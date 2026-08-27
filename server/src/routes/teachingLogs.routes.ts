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
      logs: logs.map(l => ({
        id: l.id,
        classId: l.class_id,
        subjectId: l.subject_id,
        curriculumItemId: l.curriculum_item_id,
        attendanceSessionId: l.attendance_session_id,
        lessonPlanId: l.lesson_plan_id,
        startedAt: l.started_at,
        endedAt: l.ended_at,
        slidesShown: JSON.parse(l.slides_shown || '[]'),
        videosPlayed: JSON.parse(l.videos_played || '[]'),
        gamesRun: JSON.parse(l.games_run || '[]'),
        attendanceTaken: l.attendance_taken === 1,
        kttxAwarded: JSON.parse(l.kttx_awarded || '[]'),
        notes: l.notes,
      })),
    });
  })
);

router.get(
  '/teaching-logs/:logId',
  h(async (req, res) => {
    const log = db.prepare('SELECT * FROM teaching_logs WHERE id = ?').get(String(req.params.logId)) as TeachingLogRow | undefined;
    if (!log) throw new HttpError(404, 'NOT_FOUND', 'Không tìm thấy nhật ký');
    const cls = getClassOrThrowLocal(log.class_id);
    if (!canViewLog((req as AuthedRequest).user!, cls.id)) throw new HttpError(403, 'FORBIDDEN', 'Không có quyền xem');
    res.json({
      log: {
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
      },
    });
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
    res.status(201).json({ id });
  })
);

const updateLogSchema = z.object({
  endedAt: z.string().nullable().optional(),
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
    const log = db.prepare('SELECT * FROM teaching_logs WHERE id = ?').get(String(req.params.logId)) as TeachingLogRow | undefined;
    if (!log) throw new HttpError(404, 'NOT_FOUND', 'Không tìm thấy nhật ký');
    const cls = getClassOrThrowLocal(log.class_id);
    const user = (req as AuthedRequest).user!;
    if (!canManageLog(user, cls.id)) throw new HttpError(403, 'FORBIDDEN', 'Không có quyền sửa');
    const parsed = updateLogSchema.partial().safeParse(req.body);
    if (!parsed.success) throw new HttpError(400, 'BAD_INPUT', 'Dữ liệu không hợp lệ');
    const slides = parsed.data.slidesShown ?? JSON.parse(log.slides_shown || '[]');
    const videos = parsed.data.videosPlayed ?? JSON.parse(log.videos_played || '[]');
    const games = parsed.data.gamesRun ?? JSON.parse(log.games_run || '[]');
    const kttx = parsed.data.kttxAwarded ?? JSON.parse(log.kttx_awarded || '[]');
    db.prepare(
      `UPDATE teaching_logs SET ended_at = ?, slides_shown = ?, videos_played = ?, games_run = ?, attendance_taken = ?, kttx_awarded = ?, notes = ? WHERE id = ?`
    ).run(
      parsed.data.endedAt ?? log.ended_at,
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
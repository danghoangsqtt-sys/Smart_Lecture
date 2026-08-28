import { Router } from 'express';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { db, tx } from '../db/connection.js';
import { requireAuth, requireRole, type AuthedRequest } from '../middleware/auth.js';
import { HttpError, h } from '../utils/errors.js';
import { canManageClass, canViewClass, getClassOrThrow } from '../utils/access.js';
import { createCsvBuffer, createXlsxBuffer } from '../utils/spreadsheet.js';

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

interface TeachingGameRow {
  id: string;
  class_id: string | null;
  subject_id: string | null;
  game_type: string;
  config_json: string;
}

type TeachingLogDetailRow = TeachingLogRow & { curriculum_topic: string | null; subject_name: string | null };

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

function getTeachingGames(log: TeachingLogRow): Array<{ id: string; title: string; gameType: string }> {
  const ids = [...new Set(JSON.parse(log.games_run || '[]') as string[])];
  if (ids.length === 0) return [];
  const rows = db.prepare(
    `SELECT id, class_id, subject_id, game_type, config_json FROM game_sessions
     WHERE id IN (${ids.map(() => '?').join(', ')}) AND class_id = ?`
  ).all(...ids, log.class_id) as unknown as TeachingGameRow[];
  return rows
    .filter((game) => !log.subject_id || game.subject_id === log.subject_id)
    .map((game) => {
      const config = JSON.parse(game.config_json || '{}') as { title?: unknown };
      return { id: game.id, title: typeof config.title === 'string' && config.title.trim() ? config.title : game.game_type, gameType: game.game_type };
    });
}

function assertGameBelongsToLog(gameId: string, log: TeachingLogRow): void {
  const game = db.prepare('SELECT id, class_id, subject_id FROM game_sessions WHERE id = ?').get(gameId) as Pick<TeachingGameRow, 'id' | 'class_id' | 'subject_id'> | undefined;
  if (!game || game.class_id !== log.class_id || (log.subject_id && game.subject_id !== log.subject_id)) {
    throw new HttpError(400, 'BAD_INPUT', 'Game không thuộc lớp hoặc môn của phiên dạy');
  }
}

function buildPostLessonReport(cls: { id: string; name: string }, subjectId?: string) {
  let sql = `SELECT l.*, ci.topic AS curriculum_topic, s.name AS subject_name
    FROM teaching_logs l
    LEFT JOIN curriculum_items ci ON ci.id = l.curriculum_item_id
    LEFT JOIN subjects s ON s.id = l.subject_id
    WHERE l.class_id = ?`;
  const params: string[] = [cls.id];
  if (subjectId) { sql += ' AND l.subject_id = ?'; params.push(subjectId); }
  sql += ' ORDER BY l.started_at DESC LIMIT 200';
  const logs = db.prepare(sql).all(...params) as unknown as TeachingLogDetailRow[];
  const slideIds = new Set<string>();
  const videoIds = new Set<string>();
  const gameIds = new Set<string>();
  const kttxIds = new Set<string>();
  const attendanceIds = new Set<string>();
  let totalDurationMinutes = 0;
  let completedSessions = 0;
  let sessionsWithoutActivityTelemetry = 0;
  let sessionsWithoutAttendanceRecord = 0;
  let sessionsWithoutAttendanceLink = 0;
  for (const log of logs) {
    const slides = JSON.parse(log.slides_shown || '[]') as string[];
    const videos = JSON.parse(log.videos_played || '[]') as string[];
    const games = getTeachingGames(log);
    const kttx = JSON.parse(log.kttx_awarded || '[]') as string[];
    for (const id of slides) slideIds.add(id);
    for (const id of videos) videoIds.add(id);
    for (const game of games) gameIds.add(game.id);
    for (const id of kttx) kttxIds.add(id);
    if (log.attendance_session_id) attendanceIds.add(log.attendance_session_id);
    else sessionsWithoutAttendanceLink += 1;
    if (log.attendance_taken !== 1) sessionsWithoutAttendanceRecord += 1;
    if (slides.length + videos.length + games.length === 0) sessionsWithoutActivityTelemetry += 1;
    if (log.ended_at) {
      completedSessions += 1;
      totalDurationMinutes += Math.max(0, Math.round((new Date(log.ended_at).getTime() - new Date(log.started_at).getTime()) / 60_000));
    }
  }
  let progressSql = `SELECT COUNT(*) AS total, COALESCE(SUM(CASE WHEN ci.status = 'completed' THEN 1 ELSE 0 END), 0) AS completed
    FROM curriculum_items ci JOIN teaching_plans tp ON tp.id = ci.teaching_plan_id WHERE tp.class_id = ?`;
  const progressParams: string[] = [cls.id];
  if (subjectId) { progressSql += ' AND tp.subject_id = ?'; progressParams.push(subjectId); }
  const progress = db.prepare(progressSql).get(...progressParams) as { total: number; completed: number };
  const sessions = logs.map((log) => {
    const games = getTeachingGames(log);
    const slides = JSON.parse(log.slides_shown || '[]') as string[];
    const videos = JSON.parse(log.videos_played || '[]') as string[];
    return {
      id: log.id, subjectId: log.subject_id, subjectName: log.subject_name, curriculumTopic: log.curriculum_topic,
      startedAt: log.started_at, endedAt: log.ended_at, attendanceSessionId: log.attendance_session_id,
      attendanceTaken: log.attendance_taken === 1, slidesShown: slides, videosPlayed: videos, games,
      kttxAwarded: JSON.parse(log.kttx_awarded || '[]') as string[], notes: log.notes,
      activityCount: slides.length + videos.length + games.length,
    };
  });
  return {
    report: { generatedAt: new Date().toISOString(), classId: cls.id, className: cls.name, subjectId: subjectId ?? null },
    summary: {
      sessionCount: logs.length, activeSessionCount: logs.length - completedSessions, completedSessionCount: completedSessions,
      totalDurationMinutes, attendanceLinkedCount: attendanceIds.size, uniqueSlidesShown: slideIds.size,
      uniqueVideosPlayed: videoIds.size, uniqueGamesRun: gameIds.size, kttxRecordedCount: kttxIds.size,
      curriculumTotal: progress.total, curriculumCompleted: progress.completed,
      curriculumProgressPercent: progress.total ? Math.round(progress.completed / progress.total * 100) : 0,
    },
    dataQuality: {
      sessionsWithoutAttendanceRecord, sessionsWithoutAttendanceLink, sessionsWithoutActivityTelemetry,
      note: 'Các số liệu thiếu chỉ phản ánh nhật ký chưa được ghi nhận; không được suy diễn thành kết quả học tập hoặc chuyên cần.',
    },
    sessions,
  };
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
  '/classes/:classId/teaching-logs/summary',
  h(async (req, res) => {
    const cls = getClassOrThrowLocal(String(req.params.classId));
    const user = (req as AuthedRequest).user!;
    if (!canManageLog(user, cls.id)) throw new HttpError(403, 'FORBIDDEN', 'Không có quyền xem tổng quan giảng dạy');
    const subjectId = typeof req.query.subjectId === 'string' ? req.query.subjectId : undefined;
    if (subjectId) assertLogReferencesBelongToClass(cls.id, { subjectId });
    const report = buildPostLessonReport(cls, subjectId);
    res.json({ summary: report.summary, dataQuality: report.dataQuality, recent: report.sessions.slice(0, 6) });
  })
);

router.get(
  '/classes/:classId/teaching-logs/report',
  h(async (req, res) => {
    const cls = getClassOrThrowLocal(String(req.params.classId));
    const user = (req as AuthedRequest).user!;
    if (!canManageLog(user, cls.id)) throw new HttpError(403, 'FORBIDDEN', 'Không có quyền xem báo cáo sau tiết');
    const subjectId = typeof req.query.subjectId === 'string' ? req.query.subjectId : undefined;
    if (subjectId) assertLogReferencesBelongToClass(cls.id, { subjectId });
    res.json(buildPostLessonReport(cls, subjectId));
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
    if (parsed.data.kind === 'game') assertGameBelongsToLog(parsed.data.id, log);
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
    if (subjectId) assertLogReferencesBelongToClass(cls.id, { subjectId });
    let sql = `SELECT l.*, s.name AS subject_name, ci.topic AS curriculum_topic
      FROM teaching_logs l
      LEFT JOIN subjects s ON s.id = l.subject_id
      LEFT JOIN curriculum_items ci ON ci.id = l.curriculum_item_id
      WHERE l.class_id = ?`;
    const params: (string | number)[] = [cls.id];
    if (subjectId) {
      sql += ' AND l.subject_id = ?';
      params.push(subjectId);
    }
    sql += ' ORDER BY l.started_at DESC';
    const logs = db.prepare(sql).all(...params) as unknown as TeachingLogDetailRow[];
    if (format === 'csv' || format === 'xlsx') {
      const rows = [
        ['STT', 'Ngày bắt đầu', 'Ngày kết thúc', 'Môn học', 'Mục chương trình', 'Buổi điểm danh', 'Kế hoạch tiết',
         'Slide đã trình chiếu', 'Video đã phát', 'Game đã chạy', 'Đã điểm danh', 'KTTX đã cộng', 'Ghi chú'],
        ...logs.map((l, i) => [
          i + 1,
          l.started_at,
          l.ended_at || '',
          l.subject_name || '',
          l.curriculum_topic || '',
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
      const buf = format === 'csv' ? createCsvBuffer(rows) : await createXlsxBuffer('Nhật ký giảng dạy', rows);
      res.setHeader('Content-Type', format === 'csv' ? 'text/csv' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="nhat-ky-giang-day-${cls.name}-${Date.now()}.${format}"`);
      res.send(buf);
    } else {
      res.json({ logs });
    }
  })
);

export default router;

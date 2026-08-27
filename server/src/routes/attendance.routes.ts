import { Router } from 'express';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { db, tx } from '../db/connection.js';
import { requireAuth, requireRole, type AuthedRequest } from '../middleware/auth.js';
import { HttpError, h } from '../utils/errors.js';
import { canManageClass, canViewClass, getClassOrThrow } from '../utils/access.js';

const router = Router();
router.use(requireAuth);

interface SessionRow {
  id: string;
  class_id: string;
  session_date: string;
  periods_total: number;
  note: string;
  teaching_type: string;
  remark: string;
  teaching_plan_item_id: string | null;
}

router.get(
  '/classes/:classId/attendance/sessions',
  h(async (req, res) => {
    const cls = getClassOrThrow(String(req.params.classId));
    if (!canViewClass(cls, (req as AuthedRequest).user!)) throw new HttpError(403, 'FORBIDDEN', 'Không có quyền');
    const sessions = db
      .prepare(
        `SELECT s.*, COALESCE(SUM(CASE WHEN ar.status = 'absent' THEN 1 ELSE 0 END), 0) AS absent_count
         FROM attendance_sessions s
         LEFT JOIN attendance_records ar ON ar.session_id = s.id
         WHERE s.class_id = ?
         GROUP BY s.id
         ORDER BY s.session_date DESC`
      )
      .all(cls.id) as unknown as (SessionRow & { absent_count: number })[];
    res.json({
      sessions: sessions.map((s) => ({
        id: s.id,
        date: s.session_date,
        periodsTotal: s.periods_total,
        note: s.note,
        teachingType: s.teaching_type,
        remark: s.remark,
        teachingPlanItemId: s.teaching_plan_item_id,
        absentCount: s.absent_count,
      })),
    });
  })
);

const createSessionSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  periodsTotal: z.number().int().min(1).max(12).default(1),
  note: z.string().max(500).default(''),
  teachingType: z.string().max(60).default(''),
  teachingPlanItemId: z.string().nullable().optional(),
});

function isValidIsoDate(value: string): boolean {
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function assertTeachingPlanItemBelongsToClass(itemId: string | null | undefined, classId: string): void {
  if (!itemId) return;
  const item = db.prepare(
    `SELECT 1 FROM curriculum_items ci
     JOIN teaching_plans tp ON tp.id = ci.teaching_plan_id
     WHERE ci.id = ? AND tp.class_id = ?`
  ).get(itemId, classId);
  if (!item) throw new HttpError(400, 'BAD_INPUT', 'Mục chương trình không thuộc lớp của buổi học');
}

router.post(
  '/classes/:classId/attendance/sessions',
  requireRole('teacher', 'admin'),
  h(async (req, res) => {
    const cls = getClassOrThrow(String(req.params.classId));
    if (!canManageClass(cls, (req as AuthedRequest).user!)) throw new HttpError(403, 'FORBIDDEN', 'Không có quyền tạo buổi học');
    const parsed = createSessionSchema.safeParse(req.body);
    if (!parsed.success) throw new HttpError(400, 'BAD_INPUT', 'Ngày học không hợp lệ (YYYY-MM-DD)');
    if (!isValidIsoDate(parsed.data.date)) throw new HttpError(400, 'BAD_INPUT', 'Ngày học không hợp lệ (YYYY-MM-DD)');
    assertTeachingPlanItemBelongsToClass(parsed.data.teachingPlanItemId, cls.id);
    const exists = db.prepare('SELECT 1 FROM attendance_sessions WHERE class_id = ? AND session_date = ?').get(cls.id, parsed.data.date);
    if (exists) throw new HttpError(409, 'SESSION_EXISTS', 'Đã có buổi học của ngày này trong lớp');
    const id = randomUUID();
    db.prepare('INSERT INTO attendance_sessions (id, class_id, session_date, periods_total, note, teaching_type, teaching_plan_item_id) VALUES (?, ?, ?, ?, ?, ?, ?)').run(
      id,
      cls.id,
      parsed.data.date,
      parsed.data.periodsTotal,
      parsed.data.note,
      parsed.data.teachingType,
      parsed.data.teachingPlanItemId ?? null
    );
    res.status(201).json({ id });
  })
);

const updateSessionSchema = z.object({
  periodsTotal: z.number().int().min(1).max(12).optional(),
  note: z.string().max(500).optional(),
  teachingType: z.string().max(60).optional(),
  remark: z.string().max(1000).optional(),
  teachingPlanItemId: z.string().nullable().optional(),
});

router.patch(
  '/attendance/sessions/:sessionId',
  requireRole('teacher', 'admin'),
  h(async (req, res) => {
    const session = getSessionOrThrow(String(req.params.sessionId));
    const cls = getClassOrThrow(session.class_id);
    if (!canManageClass(cls, (req as AuthedRequest).user!)) throw new HttpError(403, 'FORBIDDEN', 'Không có quyền sửa buổi học này');
    const parsed = updateSessionSchema.safeParse(req.body);
    if (!parsed.success) throw new HttpError(400, 'BAD_INPUT', 'Dữ liệu không hợp lệ');
    const periodsTotal = parsed.data.periodsTotal ?? session.periods_total;
    const note = parsed.data.note ?? session.note;
    const teachingType = parsed.data.teachingType ?? session.teaching_type;
    const remark = parsed.data.remark ?? session.remark;
    const teachingPlanItemId = parsed.data.teachingPlanItemId !== undefined ? parsed.data.teachingPlanItemId : session.teaching_plan_item_id;
    assertTeachingPlanItemBelongsToClass(teachingPlanItemId, cls.id);
    db.prepare('UPDATE attendance_sessions SET periods_total = ?, note = ?, teaching_type = ?, remark = ?, teaching_plan_item_id = ? WHERE id = ?').run(
      periodsTotal,
      note,
      teachingType,
      remark,
      teachingPlanItemId,
      session.id
    );
    syncCurriculumProgress(session.teaching_plan_item_id);
    if (teachingPlanItemId !== session.teaching_plan_item_id) syncCurriculumProgress(teachingPlanItemId);
    res.json({ ok: true });
  })
);

router.get(
  '/attendance/sessions/:sessionId',
  h(async (req, res) => {
    const session = getSessionOrThrow(String(req.params.sessionId));
    const cls = getClassOrThrow(session.class_id);
    if (!canViewClass(cls, (req as AuthedRequest).user!)) throw new HttpError(403, 'FORBIDDEN', 'Không có quyền');
    const students = db
      .prepare(
        `SELECT u.id AS student_id, u.display_name FROM enrollments e JOIN users u ON u.id = e.student_id
         WHERE e.class_id = ? ORDER BY u.display_name`
      )
      .all(session.class_id) as { student_id: string; display_name: string }[];
    const records = db.prepare('SELECT * FROM attendance_records WHERE session_id = ?').all(session.id) as {
      student_id: string;
      status: string;
      periods_absent: number;
      reason: string;
    }[];
    const recordMap = new Map(records.map((r) => [r.student_id, r]));
    res.json({
      session: {
        id: session.id,
        date: session.session_date,
        periodsTotal: session.periods_total,
        note: session.note,
        teachingType: session.teaching_type,
        remark: session.remark,
        teachingPlanItemId: session.teaching_plan_item_id,
      },
      records: students.map((s) => {
        const r = recordMap.get(s.student_id);
        return {
          studentId: s.student_id,
          displayName: s.display_name,
          status: r?.status ?? null,
          periodsAbsent: r?.periods_absent ?? 0,
          reason: r?.reason ?? '',
        };
      }),
    });
  })
);

function getSessionOrThrow(id: string): SessionRow {
  const row = db.prepare('SELECT * FROM attendance_sessions WHERE id = ?').get(id) as SessionRow | undefined;
  if (!row) throw new HttpError(404, 'NOT_FOUND', 'Không tìm thấy buổi học');
  return row;
}

function syncCurriculumProgress(itemId: string | null): void {
  if (!itemId) return;
  const item = db.prepare('SELECT * FROM curriculum_items WHERE id = ?').get(itemId) as { planned_periods: number } | undefined;
  if (!item) return;
  const taught = db
    .prepare('SELECT COALESCE(SUM(periods_total), 0) AS total FROM attendance_sessions WHERE teaching_plan_item_id = ?')
    .get(itemId) as { total: number };
  const newCompleted = Math.min(item.planned_periods, taught.total);
  const newStatus = newCompleted >= item.planned_periods ? 'completed' : newCompleted > 0 ? 'in_progress' : 'pending';
  db.prepare('UPDATE curriculum_items SET completed_periods = ?, status = ?, updated_at = datetime(\'now\') WHERE id = ?').run(
    newCompleted,
    newStatus,
    itemId
  );
}

const recordsSchema = z.object({
  records: z
    .array(
      z.object({
        studentId: z.string(),
        status: z.enum(['present', 'absent']),
        periodsAbsent: z.number().int().min(0).max(12).default(0),
        reason: z.string().max(300).default(''),
      })
    )
    .min(1)
    .max(200),
});

router.put(
  '/attendance/sessions/:sessionId/records',
  requireRole('teacher', 'admin'),
  h(async (req, res) => {
    const session = getSessionOrThrow(String(req.params.sessionId));
    const cls = getClassOrThrow(session.class_id);
    if (!canManageClass(cls, (req as AuthedRequest).user!)) throw new HttpError(403, 'FORBIDDEN', 'Không có quyền điểm danh lớp này');
    const parsed = recordsSchema.safeParse(req.body);
    if (!parsed.success) throw new HttpError(400, 'BAD_INPUT', 'Dữ liệu điểm danh không hợp lệ');
    const enrolledStudentIds = new Set(
      (db.prepare('SELECT student_id FROM enrollments WHERE class_id = ?').all(session.class_id) as { student_id: string }[])
        .map((row) => row.student_id)
    );
    const seen = new Set<string>();
    for (const record of parsed.data.records) {
      if (!enrolledStudentIds.has(record.studentId)) {
        throw new HttpError(400, 'BAD_INPUT', 'Có học viên không thuộc lớp của buổi học');
      }
      if (seen.has(record.studentId)) throw new HttpError(400, 'BAD_INPUT', 'Danh sách điểm danh có học viên trùng lặp');
      seen.add(record.studentId);
      if (record.periodsAbsent > session.periods_total) {
        throw new HttpError(400, 'BAD_INPUT', 'Số tiết vắng không được vượt số tiết của buổi học');
      }
    }
    const upsert = db.prepare(
      `INSERT INTO attendance_records (session_id, student_id, status, periods_absent, reason) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(session_id, student_id) DO UPDATE SET status = excluded.status, periods_absent = excluded.periods_absent, reason = excluded.reason`
    );
    tx(() => {
      for (const r of parsed.data.records) {
        upsert.run(session.id, r.studentId, r.status, r.periodsAbsent, r.reason);
      }
      syncCurriculumProgress(session.teaching_plan_item_id);
    });
    res.json({ ok: true, saved: parsed.data.records.length });
  })
);

router.get(
  '/attendance/frequent-absences',
  requireRole('teacher', 'admin'),
  h(async (req, res) => {
    const authed = req as AuthedRequest;
    const minAbsent = Math.max(1, Number(req.query.minAbsent ?? 3));
    const rows = db
      .prepare(
        `SELECT ar.student_id AS studentId, u.display_name AS displayName, c.id AS classId, c.name AS className,
           SUM(CASE WHEN ar.status = 'absent' THEN 1 ELSE 0 END) AS absentCount,
           COALESCE(SUM(ar.periods_absent), 0) AS periodsAbsent
         FROM attendance_records ar
         JOIN attendance_sessions s ON s.id = ar.session_id
         JOIN classes c ON c.id = s.class_id
         JOIN users u ON u.id = ar.student_id
         WHERE (? = 'admin' OR c.teacher_id = ?) AND c.archived = 0
         GROUP BY ar.student_id, c.id
         HAVING absentCount >= ?
         ORDER BY absentCount DESC`
      )
      .all(authed.user!.role, authed.user!.id, minAbsent);
    res.json({ threshold: minAbsent, rows });
  })
);

export default router;

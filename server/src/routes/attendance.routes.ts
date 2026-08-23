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
}

router.get(
  '/classes/:classId/attendance/sessions',
  h(async (req, res) => {
    const cls = getClassOrThrow(String(req.params.classId));
    if (!canViewClass(cls, (req as AuthedRequest).user!)) throw new HttpError(403, 'FORBIDDEN', 'KhÃ´ng cÃ³ quyá»n');
    const sessions = db
      .prepare('SELECT * FROM attendance_sessions WHERE class_id = ? ORDER BY session_date DESC')
      .all(cls.id) as unknown as SessionRow[];
    res.json({
      sessions: sessions.map((s) => ({ id: s.id, date: s.session_date, periodsTotal: s.periods_total, note: s.note })),
    });
  })
);

const createSessionSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  periodsTotal: z.number().int().min(1).max(12).default(1),
  note: z.string().max(500).default(''),
});

router.post(
  '/classes/:classId/attendance/sessions',
  requireRole('teacher', 'admin'),
  h(async (req, res) => {
    const cls = getClassOrThrow(String(req.params.classId));
    if (!canManageClass(cls, (req as AuthedRequest).user!)) throw new HttpError(403, 'FORBIDDEN', 'KhÃ´ng cÃ³ quyá»n táº¡o buá»•i há»c');
    const parsed = createSessionSchema.safeParse(req.body);
    if (!parsed.success) throw new HttpError(400, 'BAD_INPUT', 'NgÃ y há»c khÃ´ng há»£p lá»‡ (YYYY-MM-DD)');
    const exists = db.prepare('SELECT 1 FROM attendance_sessions WHERE class_id = ? AND session_date = ?').get(cls.id, parsed.data.date);
    if (exists) throw new HttpError(409, 'SESSION_EXISTS', 'ÄÃ£ cÃ³ buá»•i há»c cá»§a ngÃ y nÃ y trong lá»›p');
    const id = randomUUID();
    db.prepare('INSERT INTO attendance_sessions (id, class_id, session_date, periods_total, note) VALUES (?, ?, ?, ?, ?)').run(
      id,
      cls.id,
      parsed.data.date,
      parsed.data.periodsTotal,
      parsed.data.note
    );
    res.status(201).json({ id });
  })
);

router.get(
  '/attendance/sessions/:sessionId',
  h(async (req, res) => {
    const session = getSessionOrThrow(String(req.params.sessionId));
    const cls = getClassOrThrow(session.class_id);
    if (!canViewClass(cls, (req as AuthedRequest).user!)) throw new HttpError(403, 'FORBIDDEN', 'KhÃ´ng cÃ³ quyá»n');
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
      session: { id: session.id, date: session.session_date, periodsTotal: session.periods_total, note: session.note },
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
  if (!row) throw new HttpError(404, 'NOT_FOUND', 'KhÃ´ng tÃ¬m tháº¥y buá»•i há»c');
  return row;
}

const recordsSchema = z.object({
  records: z
    .array(
      z.object({
        studentId: z.string(),
        status: z.enum(['present', 'absent', 'late']),
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
    if (!canManageClass(cls, (req as AuthedRequest).user!)) throw new HttpError(403, 'FORBIDDEN', 'KhÃ´ng cÃ³ quyá»n Ä‘iá»ƒm danh lá»›p nÃ y');
    const parsed = recordsSchema.safeParse(req.body);
    if (!parsed.success) throw new HttpError(400, 'BAD_INPUT', 'Dá»¯ liá»‡u Ä‘iá»ƒm danh khÃ´ng há»£p lá»‡');
    const upsert = db.prepare(
      `INSERT INTO attendance_records (session_id, student_id, status, periods_absent, reason) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(session_id, student_id) DO UPDATE SET status = excluded.status, periods_absent = excluded.periods_absent, reason = excluded.reason`
    );
    tx(() => {
      for (const r of parsed.data.records) {
        upsert.run(session.id, r.studentId, r.status, r.periodsAbsent, r.reason);
      }
    });
    res.json({ ok: true, saved: parsed.data.records.length });
  })
);

export default router;

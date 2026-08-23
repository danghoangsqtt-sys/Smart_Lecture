import { Router } from 'express';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { tx, db, toPublicUser } from '../db/connection.js';
import { requireAuth, requireRole, type AuthedRequest } from '../middleware/auth.js';
import { HttpError, h } from '../utils/errors.js';
import { canManageClass, canViewClass, getClassOrThrow, type ClassRow } from '../utils/access.js';

const router = Router();
router.use(requireAuth);

interface EnrollmentRow {
  student_id: string;
  username: string;
  display_name: string;
  status: string;
}

function classWithMeta(cls: ClassRow) {
  const counts = db
    .prepare(
      `SELECT
        (SELECT COUNT(*) FROM enrollments WHERE class_id = ?) AS students,
        (SELECT COUNT(*) FROM lectures WHERE class_id = ?) AS lectures`
    )
    .get(cls.id, cls.id) as { students: number; lectures: number };
  return {
    id: cls.id,
    name: cls.name,
    subject: cls.subject,
    teacherId: cls.teacher_id,
    academicYear: cls.academic_year,
    studentCount: counts.students,
    lectureCount: counts.lectures,
  };
}

router.get(
  '/classes/mine',
  h(async (req, res) => {
    const authed = req as AuthedRequest;
    const user = authed.user!;
    let rows: ClassRow[];
    if (user.role === 'admin') {
      rows = db.prepare('SELECT * FROM classes ORDER BY created_at DESC').all() as unknown as ClassRow[];
    } else if (user.role === 'teacher') {
      rows = db.prepare('SELECT * FROM classes WHERE teacher_id = ? ORDER BY created_at DESC').all(user.id) as unknown as ClassRow[];
    } else {
      rows = db
        .prepare('SELECT c.* FROM classes c JOIN enrollments e ON e.class_id = c.id WHERE e.student_id = ?')
        .all(user.id) as unknown as ClassRow[];
    }
    res.json({ classes: rows.map(classWithMeta) });
  })
);

const upsertSchema = z.object({
  name: z.string().min(1).max(120),
  subject: z.string().max(120).default(''),
  academicYear: z.string().max(20).default(''),
});

router.post(
  '/classes',
  requireRole('teacher', 'admin'),
  h(async (req, res) => {
    const authed = req as AuthedRequest;
    const parsed = upsertSchema.safeParse(req.body);
    if (!parsed.success || !authed.user) throw new HttpError(400, 'BAD_INPUT', 'ThÃ´ng tin lá»›p khÃ´ng há»£p lá»‡');
    const id = randomUUID();
    db.prepare('INSERT INTO classes (id, name, subject, teacher_id, academic_year) VALUES (?, ?, ?, ?, ?)').run(
      id,
      parsed.data.name,
      parsed.data.subject,
      authed.user.id,
      parsed.data.academicYear
    );
    res.status(201).json({ class: classWithMeta(getClassOrThrow(id)) });
  })
);

router.patch(
  '/classes/:id',
  h(async (req, res) => {
    const cls = getClassOrThrow(String(req.params.id));
    if (!canManageClass(cls, (req as AuthedRequest).user!)) throw new HttpError(403, 'FORBIDDEN', 'KhÃ´ng cÃ³ quyá»n sá»­a lá»›p nÃ y');
    const parsed = upsertSchema.partial().safeParse(req.body);
    if (!parsed.success) throw new HttpError(400, 'BAD_INPUT', 'Dá»¯ liá»‡u khÃ´ng há»£p lá»‡');
    const name = parsed.data.name ?? cls.name;
    const subject = parsed.data.subject ?? cls.subject;
    const year = parsed.data.academicYear ?? cls.academic_year;
    db.prepare('UPDATE classes SET name = ?, subject = ?, academic_year = ? WHERE id = ?').run(name, subject, year, cls.id);
    res.json({ class: classWithMeta(getClassOrThrow(cls.id)) });
  })
);

router.delete(
  '/classes/:id',
  h(async (req, res) => {
    const cls = getClassOrThrow(String(req.params.id));
    if (!canManageClass(cls, (req as AuthedRequest).user!)) throw new HttpError(403, 'FORBIDDEN', 'KhÃ´ng cÃ³ quyá»n xÃ³a lá»›p nÃ y');
    db.prepare('DELETE FROM classes WHERE id = ?').run(cls.id);
    res.json({ ok: true });
  })
);

router.get(
  '/classes/:id',
  h(async (req, res) => {
    const cls = getClassOrThrow(String(req.params.id));
    if (!canViewClass(cls, (req as AuthedRequest).user!)) throw new HttpError(403, 'FORBIDDEN', 'KhÃ´ng cÃ³ quyá»n xem lá»›p nÃ y');
    const students = db
      .prepare(
        `SELECT u.id, u.username, u.display_name, u.status FROM enrollments e
         JOIN users u ON u.id = e.student_id WHERE e.class_id = ? ORDER BY u.display_name`
      )
      .all(cls.id) as unknown as EnrollmentRow[];
    res.json({
      class: classWithMeta(cls),
      students: students.map((s) => ({ id: s.student_id, username: s.username, displayName: s.display_name, status: s.status })),
    });
  })
);

const enrollSchema = z.object({ studentIds: z.array(z.string()).min(1).max(200) });

router.post(
  '/classes/:id/enroll',
  requireRole('teacher', 'admin'),
  h(async (req, res) => {
    const cls = getClassOrThrow(String(req.params.id));
    if (!canManageClass(cls, (req as AuthedRequest).user!)) throw new HttpError(403, 'FORBIDDEN', 'KhÃ´ng cÃ³ quyá»n thÃªm há»c viÃªn vÃ o lá»›p nÃ y');
    const parsed = enrollSchema.safeParse(req.body);
    if (!parsed.success) throw new HttpError(400, 'BAD_INPUT', 'Danh sÃ¡ch há»c viÃªn khÃ´ng há»£p lá»‡');
    const stmt = db.prepare('INSERT OR IGNORE INTO enrollments (class_id, student_id) VALUES (?, ?)');
    let added = 0;
    tx(() => {
      for (const sid of parsed.data.studentIds) {
        const isStudent = db.prepare("SELECT 1 FROM users WHERE id = ? AND role = 'student'").get(sid);
        if (isStudent) {
          stmt.run(cls.id, sid);
          added++;
        }
      }
    });
    res.json({ added });
  })
);

router.delete(
  '/classes/:id/enroll/:studentId',
  requireRole('teacher', 'admin'),
  h(async (req, res) => {
    const cls = getClassOrThrow(String(req.params.id));
    if (!canManageClass(cls, (req as AuthedRequest).user!)) throw new HttpError(403, 'FORBIDDEN', 'KhÃ´ng cÃ³ quyá»n');
    db.prepare('DELETE FROM enrollments WHERE class_id = ? AND student_id = ?').run(cls.id, String(req.params.studentId));
    res.json({ ok: true });
  })
);

router.get(
  '/classes/:id/eligible-students',
  requireRole('teacher', 'admin'),
  h(async (req, res) => {
    const cls = getClassOrThrow(String(req.params.id));
    if (!canManageClass(cls, (req as AuthedRequest).user!)) throw new HttpError(403, 'FORBIDDEN', 'KhÃ´ng cÃ³ quyá»n');
    const rows = db
      .prepare(
        `SELECT id, username, display_name FROM users u WHERE role = 'student' AND status = 'active'
         AND (u.created_by = ? OR NOT EXISTS (SELECT 1))
         AND id NOT IN (SELECT student_id FROM enrollments WHERE class_id = ?)
         ORDER BY display_name LIMIT 300`
      )
      .all(cls.teacher_id, cls.id) as { id: string; username: string; display_name: string }[];
    void toPublicUser;
    res.json({
      students: rows.map((r) => ({ id: r.id, username: r.username, displayName: r.display_name })),
    });
  })
);

export default router;

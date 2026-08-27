import { Router } from 'express';
import { z } from 'zod';
import { db } from '../db/connection.js';
import { requireAuth, requireRole, type AuthedRequest } from '../middleware/auth.js';
import { HttpError, h } from '../utils/errors.js';
import { canManageClass, getClassOrThrow } from '../utils/access.js';

const router = Router();
router.use(requireAuth);
router.use(['/classes/:classId/gradebook', '/classes/:classId/grades', '/classes/:classId/group-grades'], requireRole('teacher', 'admin'));

interface GradeRow {
  class_id: string;
  student_id: string;
  kttx: number | null;
  process_1: number | null;
  final_exam: number | null;
  remark: string;
}

interface GroupGradeRow {
  class_id: string;
  group_id: string;
  kttx: number | null;
  process_1: number | null;
  final_exam: number | null;
  remark: string;
}

interface StudentBase {
  student_id: string;
  display_name: string;
}

interface GroupBase {
  group_id: string;
  group_name: string;
}

router.get(
  '/classes/:classId/gradebook',
  h(async (req, res) => {
    const cls = getClassOrThrow(String(req.params.classId));
    if (!canManageClass(cls, (req as AuthedRequest).user!)) throw new HttpError(403, 'FORBIDDEN', 'Không có quyền xem sổ điểm lớp này');
    const students = db
      .prepare(
        `SELECT u.id AS student_id, u.display_name FROM enrollments e JOIN users u ON u.id = e.student_id
         WHERE e.class_id = ? ORDER BY u.display_name`
      )
      .all(cls.id) as unknown as StudentBase[];
    const grades = db.prepare('SELECT * FROM grades WHERE class_id = ?').all(cls.id) as unknown as GradeRow[];
    const gradeMap = new Map(grades.map((g) => [g.student_id, g]));
    const attendanceSummary = db
      .prepare(
        `SELECT ar.student_id,
           SUM(CASE WHEN ar.status = 'present' THEN 1 ELSE 0 END) AS presentCount,
           SUM(CASE WHEN ar.status = 'absent' THEN 1 ELSE 0 END) AS absentCount,
           COALESCE(SUM(ar.periods_absent), 0) AS periodsAbsent
         FROM attendance_records ar
         JOIN attendance_sessions s ON s.id = ar.session_id
         WHERE s.class_id = ?
         GROUP BY ar.student_id`
      )
      .all(cls.id) as { student_id: string; presentCount: number; absentCount: number; periodsAbsent: number }[];
    const attMap = new Map(attendanceSummary.map((a) => [a.student_id, a]));
    const sessionTotal = (db.prepare('SELECT COUNT(*) AS c FROM attendance_sessions WHERE class_id = ?').get(cls.id) as { c: number }).c;

    res.json({
      classInfo: { id: cls.id, name: cls.name, subject: cls.subject, sessionTotal },
      rows: students.map((s) => {
        const g = gradeMap.get(s.student_id);
        const a = attMap.get(s.student_id);
        return {
          studentId: s.student_id,
          displayName: s.display_name,
          kttx: g?.kttx ?? null,
          process1: g?.process_1 ?? null,
          finalExam: g?.final_exam ?? null,
          remark: g?.remark ?? '',
          presentCount: a?.presentCount ?? 0,
          absentCount: a?.absentCount ?? 0,
          periodsAbsent: a?.periodsAbsent ?? 0,
        };
      }),
    });
  })
);

const gradeUpdateSchema = z.object({
  kttx: z.number().min(0).max(10).nullable().optional(),
  process1: z.number().min(0).max(10).nullable().optional(),
  finalExam: z.number().min(0).max(10).nullable().optional(),
  remark: z.string().max(2000).optional(),
});

router.put(
  '/classes/:classId/grades/:studentId',
  h(async (req, res) => {
    const cls = getClassOrThrow(String(req.params.classId));
    if (!canManageClass(cls, (req as AuthedRequest).user!)) throw new HttpError(403, 'FORBIDDEN', 'Không có quyền sửa sổ điểm lớp này');
    const parsed = gradeUpdateSchema.safeParse(req.body);
    if (!parsed.success) throw new HttpError(400, 'BAD_INPUT', 'Điểm phải trong thang 0-10');
    const existing = db
      .prepare('SELECT * FROM grades WHERE class_id = ? AND student_id = ?')
      .get(cls.id, String(req.params.studentId)) as GradeRow | undefined;
    const kttx = parsed.data.kttx !== undefined ? parsed.data.kttx : (existing?.kttx ?? null);
    const p1 = parsed.data.process1 !== undefined ? parsed.data.process1 : (existing?.process_1 ?? null);
    const fe = parsed.data.finalExam !== undefined ? parsed.data.finalExam : (existing?.final_exam ?? null);
    const remark = parsed.data.remark !== undefined ? parsed.data.remark : (existing?.remark ?? '');
    db.prepare(
      `INSERT INTO grades (class_id, student_id, kttx, process_1, final_exam, remark, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
       ON CONFLICT(class_id, student_id) DO UPDATE SET kttx = excluded.kttx, process_1 = excluded.process_1,
       final_exam = excluded.final_exam, remark = excluded.remark, updated_at = excluded.updated_at`
    ).run(cls.id, String(req.params.studentId), kttx, p1, fe, remark);
    res.json({ ok: true });
  })
);

router.get(
  '/classes/:classId/group-grades',
  h(async (req, res) => {
    const cls = getClassOrThrow(String(req.params.classId));
    if (!canManageClass(cls, (req as AuthedRequest).user!)) throw new HttpError(403, 'FORBIDDEN', 'Không có quyền xem sổ điểm nhóm');
    const groups = db
      .prepare('SELECT id AS group_id, name AS group_name FROM class_groups WHERE class_id = ? ORDER BY name')
      .all(cls.id) as unknown as GroupBase[];
    const grades = db.prepare('SELECT * FROM group_grades WHERE class_id = ?').all(cls.id) as unknown as GroupGradeRow[];
    const gradeMap = new Map(grades.map((g) => [g.group_id, g]));
    res.json({
      classInfo: { id: cls.id, name: cls.name, subject: cls.subject },
      rows: groups.map((g) => {
        const gr = gradeMap.get(g.group_id);
        return {
          groupId: g.group_id,
          groupName: g.group_name,
          kttx: gr?.kttx ?? null,
          process1: gr?.process_1 ?? null,
          finalExam: gr?.final_exam ?? null,
          remark: gr?.remark ?? '',
        };
      }),
    });
  })
);

const groupGradeUpdateSchema = z.object({
  kttx: z.number().min(0).max(10).nullable().optional(),
  process1: z.number().min(0).max(10).nullable().optional(),
  finalExam: z.number().min(0).max(10).nullable().optional(),
  remark: z.string().max(2000).optional(),
});

router.put(
  '/classes/:classId/group-grades/:groupId',
  h(async (req, res) => {
    const cls = getClassOrThrow(String(req.params.classId));
    if (!canManageClass(cls, (req as AuthedRequest).user!)) throw new HttpError(403, 'FORBIDDEN', 'Không có quyền sửa sổ điểm nhóm');
    const parsed = groupGradeUpdateSchema.safeParse(req.body);
    if (!parsed.success) throw new HttpError(400, 'BAD_INPUT', 'Điểm phải trong thang 0-10');
    const existing = db
      .prepare('SELECT * FROM group_grades WHERE class_id = ? AND group_id = ?')
      .get(cls.id, String(req.params.groupId)) as GroupGradeRow | undefined;
    const kttx = parsed.data.kttx !== undefined ? parsed.data.kttx : (existing?.kttx ?? null);
    const p1 = parsed.data.process1 !== undefined ? parsed.data.process1 : (existing?.process_1 ?? null);
    const fe = parsed.data.finalExam !== undefined ? parsed.data.finalExam : (existing?.final_exam ?? null);
    const remark = parsed.data.remark !== undefined ? parsed.data.remark : (existing?.remark ?? '');
    db.prepare(
      `INSERT INTO group_grades (class_id, group_id, kttx, process_1, final_exam, remark, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
       ON CONFLICT(class_id, group_id) DO UPDATE SET kttx = excluded.kttx, process_1 = excluded.process_1,
       final_exam = excluded.final_exam, remark = excluded.remark, updated_at = excluded.updated_at`
    ).run(cls.id, String(req.params.groupId), kttx, p1, fe, remark);
    res.json({ ok: true });
  })
);

export default router;

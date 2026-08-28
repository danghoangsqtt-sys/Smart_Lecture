import { Router } from 'express';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import multer from 'multer';
import ExcelJS from 'exceljs';
import { tx, db, queryAll, toPublicUser, findUserByUsername } from '../db/connection.js';
import { DROP_DIR } from '../config.js';
import { requireAuth, requireRole, type AuthedRequest } from '../middleware/auth.js';
import { HttpError, h } from '../utils/errors.js';
import { canManageClass, canViewClass, getClassOrThrow, type ClassRow } from '../utils/access.js';
import { insertUser } from './users.routes.js';
import { createXlsxBuffer, readFirstWorksheetRows } from '../utils/spreadsheet.js';

function ensureDropFolder(subjectId: string): void {
  const dir = path.join(DROP_DIR, subjectId);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

const upload = multer({
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ['.csv', '.xlsx'];
    const ext = file.originalname.toLowerCase().substring(file.originalname.lastIndexOf('.'));
    cb(null, allowed.includes(ext));
  },
});

const router = Router();
router.use(requireAuth);

interface EnrollmentRow {
  student_id: string;
  username: string;
  display_name: string;
  status: string;
}

interface EnrollmentProfileRow extends EnrollmentRow {
  student_code: string | null;
  dob: string | null;
  gender: string | null;
  hometown: string | null;
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
    archived: (cls as unknown as { archived?: number }).archived === 1,
    studentCount: counts.students,
    lectureCount: counts.lectures,
    totalPeriods: cls.total_periods,
  };
}

router.get(
  '/classes/mine',
  h(async (req, res) => {
    const includeArchived = req.query.includeArchived === '1';
    const yearFilter = typeof req.query.year === 'string' ? req.query.year : '';
    const authed = req as AuthedRequest;
    const user = authed.user!;
    let rows: ClassRow[];
    const filterRows = (list: ClassRow[]): ClassRow[] =>
      list
        .filter((r) => (includeArchived ? true : (r as unknown as { archived?: number }).archived !== 1))
        .filter((r) => (yearFilter ? r.academic_year === yearFilter : true));

    if (user.role === 'admin') {
      rows = filterRows(queryAll<ClassRow>('SELECT * FROM classes ORDER BY created_at DESC'));
    } else if (user.role === 'teacher') {
      rows = filterRows(queryAll<ClassRow>('SELECT * FROM classes WHERE teacher_id = ? ORDER BY created_at DESC', user.id));
    } else {
      rows = filterRows(
        queryAll<ClassRow>(
          'SELECT c.* FROM classes c JOIN enrollments e ON e.class_id = c.id WHERE e.student_id = ?',
          user.id
        )
      );
    }
    res.json({ classes: rows.map(classWithMeta) });
  })
);

router.patch(
  '/classes/:id/archive',
  h(async (req, res) => {
    const cls = getClassOrThrow(String(req.params.id));
    if (!canManageClass(cls, (req as AuthedRequest).user!)) throw new HttpError(403, 'FORBIDDEN', 'Không có quyền');
    const target = req.body?.archived ? 1 : 0;
    db.prepare('UPDATE classes SET archived = ?, archived_at = CASE WHEN ? = 1 THEN datetime(\'now\') ELSE NULL END WHERE id = ?').run(
      target,
      target,
      cls.id
    );
    res.json({ archived: target === 1 });
  })
);

const upsertSchema = z.object({
  name: z.string().min(1).max(120),
  subject: z.string().max(120).default(''),
  academicYear: z.string().max(20).default(''),
  totalPeriods: z.number().int().min(0).max(999).default(0),
});

router.post(
  '/classes',
  requireRole('teacher', 'admin'),
  h(async (req, res) => {
    const authed = req as AuthedRequest;
    const parsed = upsertSchema.safeParse(req.body);
    if (!parsed.success || !authed.user) throw new HttpError(400, 'BAD_INPUT', 'Thông tin lớp không hợp lệ');
    const id = randomUUID();
    const subjectId = randomUUID();
    tx(() => {
      db.prepare('INSERT INTO classes (id, name, subject, teacher_id, academic_year, total_periods) VALUES (?, ?, ?, ?, ?, ?)').run(
        id,
        parsed.data.name,
        parsed.data.subject,
        authed.user!.id,
        parsed.data.academicYear,
        parsed.data.totalPeriods
      );
      db.prepare('INSERT INTO subjects (id, class_id, name) VALUES (?, ?, ?)').run(subjectId, id, parsed.data.subject.trim() || 'Môn học chính');
    });
    ensureDropFolder(subjectId);
    res.status(201).json({ class: classWithMeta(getClassOrThrow(id)) });
  })
);

router.patch(
  '/classes/:id',
  h(async (req, res) => {
    const cls = getClassOrThrow(String(req.params.id));
    if (!canManageClass(cls, (req as AuthedRequest).user!)) throw new HttpError(403, 'FORBIDDEN', 'Không có quyền sửa lớp này');
    const parsed = upsertSchema.partial().safeParse(req.body);
    if (!parsed.success) throw new HttpError(400, 'BAD_INPUT', 'Dữ liệu không hợp lệ');
    const name = parsed.data.name ?? cls.name;
    const subject = parsed.data.subject ?? cls.subject;
    const year = parsed.data.academicYear ?? cls.academic_year;
    const totalPeriods = parsed.data.totalPeriods ?? cls.total_periods;
    db.prepare('UPDATE classes SET name = ?, subject = ?, academic_year = ?, total_periods = ? WHERE id = ?').run(
      name,
      subject,
      year,
      totalPeriods,
      cls.id
    );
    res.json({ class: classWithMeta(getClassOrThrow(cls.id)) });
  })
);

router.delete(
  '/classes/:id',
  h(async (req, res) => {
    const cls = getClassOrThrow(String(req.params.id));
    if (!canManageClass(cls, (req as AuthedRequest).user!)) throw new HttpError(403, 'FORBIDDEN', 'Không có quyền xóa lớp này');
    db.prepare('DELETE FROM classes WHERE id = ?').run(cls.id);
    res.json({ ok: true });
  })
);

router.get(
  '/classes/:id',
  h(async (req, res) => {
    const cls = getClassOrThrow(String(req.params.id));
    if (!canViewClass(cls, (req as AuthedRequest).user!)) throw new HttpError(403, 'FORBIDDEN', 'Không có quyền xem lớp này');
    const students = db
      .prepare(
        `SELECT u.id AS student_id, u.username, u.display_name, u.status, u.student_code, u.dob, u.gender, u.hometown FROM enrollments e
         JOIN users u ON u.id = e.student_id WHERE e.class_id = ? ORDER BY u.display_name`
      )
      .all(cls.id) as unknown as EnrollmentProfileRow[];
    res.json({
      class: classWithMeta(cls),
      students: students.map((s) => ({
        id: s.student_id,
        username: s.username,
        displayName: s.display_name,
        status: s.status,
        studentCode: s.student_code,
        dob: s.dob,
        gender: s.gender,
        hometown: s.hometown,
      })),
    });
  })
);

router.get(
  '/classes/:id/subjects',
  h(async (req, res) => {
    const cls = getClassOrThrow(String(req.params.id));
    if (!canViewClass(cls, (req as AuthedRequest).user!)) throw new HttpError(403, 'FORBIDDEN', 'Không có quyền');
    const subjects = db
      .prepare('SELECT id, name, sort_order FROM subjects WHERE class_id = ? ORDER BY sort_order, created_at')
      .all(cls.id) as { id: string; name: string; sort_order: number }[];
    res.json({ subjects: subjects.map((s) => ({ id: s.id, name: s.name, sortOrder: s.sort_order })) });
  })
);

const subjectUpsertSchema = z.object({
  name: z.string().min(1).max(120),
});

router.post(
  '/classes/:id/subjects',
  requireRole('teacher', 'admin'),
  h(async (req, res) => {
    const cls = getClassOrThrow(String(req.params.id));
    if (!canManageClass(cls, (req as AuthedRequest).user!)) throw new HttpError(403, 'FORBIDDEN', 'Không có quyền');
    const parsed = subjectUpsertSchema.safeParse(req.body);
    if (!parsed.success) throw new HttpError(400, 'BAD_INPUT', 'Tên môn học không hợp lệ');
    const maxOrder = db.prepare('SELECT COALESCE(MAX(sort_order), -1) AS m FROM subjects WHERE class_id = ?').get(cls.id) as { m: number };
    const id = randomUUID();
    db.prepare('INSERT INTO subjects (id, class_id, name, sort_order) VALUES (?, ?, ?, ?)').run(id, cls.id, parsed.data.name, maxOrder.m + 1);
    ensureDropFolder(id);
    res.status(201).json({ id });
  })
);

router.get(
  '/subjects/:id',
  h(async (req, res) => {
    const subject = db.prepare('SELECT * FROM subjects WHERE id = ?').get(String(req.params.id)) as { id: string; class_id: string; name: string; sort_order: number } | undefined;
    if (!subject) throw new HttpError(404, 'NOT_FOUND', 'Không tìm thấy môn học');
    const cls = getClassOrThrow(subject.class_id);
    if (!canViewClass(cls, (req as AuthedRequest).user!)) throw new HttpError(403, 'FORBIDDEN', 'Không có quyền xem môn học');
    res.json({ subject: { id: subject.id, classId: subject.class_id, name: subject.name, sortOrder: subject.sort_order } });
  })
);

router.patch(
  '/subjects/reorder',
  requireRole('teacher', 'admin'),
  h(async (req, res) => {
    const { classId, subjectIds } = z.object({ classId: z.string().min(1), subjectIds: z.array(z.string()).min(1) }).parse(req.body);
    const cls = getClassOrThrow(classId);
    if (!canManageClass(cls, (req as AuthedRequest).user!)) throw new HttpError(403, 'FORBIDDEN', 'Không có quyền sắp xếp');
    const existing = db.prepare('SELECT id FROM subjects WHERE class_id = ?').all(classId) as { id: string }[];
    const expected = new Set(existing.map((item) => item.id));
    if (subjectIds.length !== expected.size || subjectIds.some((id) => !expected.has(id))) {
      throw new HttpError(400, 'BAD_INPUT', 'Danh sách môn học không khớp với lớp');
    }
    tx(() => {
      subjectIds.forEach((id, index) => {
        db.prepare('UPDATE subjects SET sort_order = ? WHERE id = ? AND class_id = ?').run(index, id, classId);
      });
    });
    res.json({ ok: true });
  })
);

router.patch(
  '/subjects/:id',
  requireRole('teacher', 'admin'),
  h(async (req, res) => {
    const subject = db.prepare('SELECT * FROM subjects WHERE id = ?').get(String(req.params.id)) as { id: string; class_id: string; name: string } | undefined;
    if (!subject) throw new HttpError(404, 'NOT_FOUND', 'Không tìm thấy môn học');
    const cls = getClassOrThrow(subject.class_id);
    if (!canManageClass(cls, (req as AuthedRequest).user!)) throw new HttpError(403, 'FORBIDDEN', 'Không có quyền');
    const parsed = subjectUpsertSchema.partial().safeParse(req.body);
    if (!parsed.success) throw new HttpError(400, 'BAD_INPUT', 'Dữ liệu không hợp lệ');
    const name = parsed.data.name ?? subject.name;
    db.prepare('UPDATE subjects SET name = ? WHERE id = ?').run(name, subject.id);
    res.json({ ok: true });
  })
);

router.delete(
  '/subjects/:id',
  requireRole('teacher', 'admin'),
  h(async (req, res) => {
    const subject = db.prepare('SELECT * FROM subjects WHERE id = ?').get(String(req.params.id)) as { id: string; class_id: string; name: string } | undefined;
    if (!subject) throw new HttpError(404, 'NOT_FOUND', 'Không tìm thấy môn học');
    const cls = getClassOrThrow(subject.class_id);
    if (!canManageClass(cls, (req as AuthedRequest).user!)) throw new HttpError(403, 'FORBIDDEN', 'Không có quyền');
    const count = db.prepare('SELECT COUNT(*) AS c FROM subjects WHERE class_id = ?').get(cls.id) as { c: number };
    if (count.c <= 1) throw new HttpError(400, 'LAST_SUBJECT', 'Lớp phải có ít nhất một môn học');
    db.prepare('DELETE FROM subjects WHERE id = ?').run(subject.id);
    res.json({ ok: true });
  })
);

// Called once at startup so subjects created before the drop-folder feature existed
// (e.g. by migration v13's backfill) get their folder too — cheap, idempotent.
export function ensureAllDropFolders(): void {
  const subjects = db.prepare('SELECT id FROM subjects').all() as { id: string }[];
  for (const s of subjects) ensureDropFolder(s.id);
}

const settingsSchema = z.object({
  kttxWeight: z.number().min(0).max(1).default(0.2),
  process1Weight: z.number().min(0).max(1).default(0.3),
  finalExamWeight: z.number().min(0).max(1).default(0.5),
  defaultGamePoints: z.number().min(0).max(2).step(0.25).default(0.5),
  gamePointsCap: z.number().min(1).max(10).default(10),
  autoCreateGroups: z.boolean().default(false),
  groupCount: z.number().int().min(2).max(10).default(2),
});

function getSettings(cls: ClassRow) {
  try {
    return JSON.parse(cls.settings_json) as z.infer<typeof settingsSchema>;
  } catch {
    return settingsSchema.parse({});
  }
}

router.get(
  '/classes/:id/settings',
  h(async (req, res) => {
    const cls = getClassOrThrow(String(req.params.id));
    if (!canViewClass(cls, (req as AuthedRequest).user!)) throw new HttpError(403, 'FORBIDDEN', 'Không có quyền');
    res.json({ settings: getSettings(cls) });
  })
);

router.put(
  '/classes/:id/settings',
  requireRole('teacher', 'admin'),
  h(async (req, res) => {
    const cls = getClassOrThrow(String(req.params.id));
    if (!canManageClass(cls, (req as AuthedRequest).user!)) throw new HttpError(403, 'FORBIDDEN', 'Không có quyền');
    const parsed = settingsSchema.partial().safeParse(req.body);
    if (!parsed.success) throw new HttpError(400, 'BAD_INPUT', 'Cài đặt không hợp lệ');
    const current = getSettings(cls);
    const merged = { ...current, ...parsed.data };
    if (Math.abs(merged.kttxWeight + merged.process1Weight + merged.finalExamWeight - 1) > 0.001) {
      throw new HttpError(400, 'BAD_INPUT', 'Tổng trọng số KTTX + QLT1 + Cuối kỳ phải bằng 1 (100%)');
    }
    db.prepare('UPDATE classes SET settings_json = ? WHERE id = ?').run(JSON.stringify(merged), cls.id);
    res.json({ settings: merged });
  })
);

router.get(
  '/classes/:id/dashboard',
  h(async (req, res) => {
    const cls = getClassOrThrow(String(req.params.id));
    if (!canViewClass(cls, (req as AuthedRequest).user!)) throw new HttpError(403, 'FORBIDDEN', 'Không có quyền');

    const studentCount = db.prepare('SELECT COUNT(*) AS c FROM enrollments WHERE class_id = ?').get(cls.id) as { c: number };
    const lectureCount = db.prepare('SELECT COUNT(*) AS c FROM lectures WHERE class_id = ?').get(cls.id) as { c: number };
    const materialCount = db.prepare('SELECT COUNT(*) AS c FROM materials m JOIN lectures l ON l.id = m.lecture_id WHERE l.class_id = ?').get(cls.id) as { c: number };
    const examCount = db.prepare('SELECT COUNT(*) AS c FROM exams e WHERE e.config_json LIKE ?').get(`%"class_id":"${cls.id}"%`) as { c: number };
    const gameCount = db.prepare('SELECT COUNT(*) AS c FROM game_sessions gs WHERE gs.config_json LIKE ?').get(`%"classId":"${cls.id}"%`) as { c: number };

    const progressStats = db.prepare(
      `SELECT COUNT(*) AS total, SUM(CASE WHEN completed_at IS NOT NULL THEN 1 ELSE 0 END) AS completed FROM lectures WHERE class_id = ?`
    ).get(cls.id) as { total: number; completed: number | null };
    const progressPercent = progressStats.total > 0 ? Math.round(((progressStats.completed ?? 0) / progressStats.total) * 10000) / 100 : 0;

    const attendanceSessions = db.prepare('SELECT COUNT(*) AS c FROM attendance_sessions WHERE class_id = ?').get(cls.id) as { c: number };
    const attendanceStats = db.prepare(
      `SELECT
        SUM(CASE WHEN ar.status = 'present' THEN 1 ELSE 0 END) AS present,
        SUM(CASE WHEN ar.status = 'absent' THEN 1 ELSE 0 END) AS absent,
        COALESCE(SUM(ar.periods_absent), 0) AS periodsAbsent
      FROM attendance_records ar
      JOIN attendance_sessions s ON s.id = ar.session_id
      WHERE s.class_id = ?`
    ).get(cls.id) as { present: number; absent: number; periodsAbsent: number };

    const gradeStats = db.prepare(
      `SELECT
        AVG(kttx) AS avgKttx,
        AVG(process_1) AS avgProcess1,
        AVG(final_exam) AS avgFinal,
        COUNT(*) AS gradedCount
      FROM grades WHERE class_id = ?`
    ).get(cls.id) as { avgKttx: number | null; avgProcess1: number | null; avgFinal: number | null; gradedCount: number };

    const recentActivity = db.prepare(
      `SELECT 'lecture' AS type, l.title AS title, l.created_at AS date FROM lectures l WHERE l.class_id = ?
       UNION ALL
      SELECT 'exam' AS type, e.title AS title, e.created_at AS date FROM exams e WHERE e.config_json LIKE ?
       UNION ALL
      SELECT 'game' AS type, gs.game_type AS title, gs.created_at AS date FROM game_sessions gs WHERE gs.config_json LIKE ?
       UNION ALL
      SELECT 'attendance' AS type, 'Buổi học ' || s.session_date AS title, s.created_at AS date FROM attendance_sessions s WHERE s.class_id = ?
       ORDER BY date DESC LIMIT 10`
    ).all(cls.id, `%"class_id":"${cls.id}"%`, `%"classId":"${cls.id}"%`, cls.id) as { type: string; title: string; date: string }[];

    res.json({
      classInfo: { id: cls.id, name: cls.name, subject: cls.subject, academicYear: cls.academic_year },
      counts: {
        students: studentCount.c,
        lectures: lectureCount.c,
        materials: materialCount.c,
        exams: examCount.c,
        games: gameCount.c,
        attendanceSessions: attendanceSessions.c,
      },
      attendance: {
        sessions: attendanceSessions.c,
        present: attendanceStats.present ?? 0,
        absent: attendanceStats.absent ?? 0,
        periodsAbsent: attendanceStats.periodsAbsent ?? 0,
        attendanceRate: attendanceSessions.c > 0
          ? Math.round(((attendanceStats.present ?? 0) / (studentCount.c * attendanceSessions.c)) * 10000) / 100
          : 0,
      },
      grades: {
        avgKttx: gradeStats.avgKttx ?? 0,
        avgProcess1: gradeStats.avgProcess1 ?? 0,
        avgFinal: gradeStats.avgFinal ?? 0,
        gradedCount: gradeStats.gradedCount ?? 0,
        totalStudents: studentCount.c,
      },
      progress: {
        totalLessons: progressStats.total,
        completedLessons: progressStats.completed ?? 0,
        percent: progressPercent,
        totalPeriods: cls.total_periods,
        estimatedPeriodsDone: Math.round((cls.total_periods * progressPercent) / 100),
      },
      recentActivity,
    });
  })
);

router.get(
  '/classes/:id/export/xlsx',
  h(async (req, res) => {
    const cls = getClassOrThrow(String(req.params.id));
    if (!canViewClass(cls, (req as AuthedRequest).user!)) throw new HttpError(403, 'FORBIDDEN', 'Không có quyền');

    const students = db.prepare(
      `SELECT u.id AS student_id, u.username, u.display_name, u.status FROM enrollments e
       JOIN users u ON u.id = e.student_id WHERE e.class_id = ? ORDER BY u.display_name`
    ).all(cls.id) as unknown as EnrollmentRow[];

    const grades = db.prepare('SELECT * FROM grades WHERE class_id = ?').all(cls.id) as { student_id: string; kttx: number | null; process_1: number | null; final_exam: number | null; remark: string }[];
    const gradeMap = new Map(grades.map((g) => [g.student_id, g]));

    const attendance = db.prepare(
      `SELECT ar.student_id,
         SUM(CASE WHEN ar.status = 'present' THEN 1 ELSE 0 END) AS present,
         SUM(CASE WHEN ar.status = 'absent' THEN 1 ELSE 0 END) AS absent,
         COALESCE(SUM(ar.periods_absent), 0) AS periodsAbsent
       FROM attendance_records ar
       JOIN attendance_sessions s ON s.id = ar.session_id
       WHERE s.class_id = ?
       GROUP BY ar.student_id`
    ).all(cls.id) as { student_id: string; present: number; absent: number; periodsAbsent: number }[];
    const attMap = new Map(attendance.map((a) => [a.student_id, a]));

    const sheetData = [
      ['STT', 'Mã SV', 'Tài khoản', 'Họ tên', 'Trạng thái', 'KTTX', 'QLT1', 'Cuối kỳ', 'Ghi chú', 'Có mặt', 'Vắng', 'Tiết vắng'],
    ];
    students.forEach((s, i) => {
      const g = gradeMap.get(s.student_id);
      const a = attMap.get(s.student_id);
      sheetData.push([
        String(i + 1),
        s.student_id,
        s.username,
        s.display_name,
        s.status,
        g?.kttx != null ? String(g.kttx) : '',
        g?.process_1 != null ? String(g.process_1) : '',
        g?.final_exam != null ? String(g.final_exam) : '',
        g?.remark ?? '',
        String(a?.present ?? 0),
        String(a?.absent ?? 0),
        String(a?.periodsAbsent ?? 0),
      ]);
    });
    const buffer = await createXlsxBuffer('Danh sách lớp', sheetData);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${cls.name}-danh-sach-${Date.now()}.xlsx"`);
    res.send(buffer);
  })
);

function thinBorder(argb: string): Partial<ExcelJS.Borders> {
  const side = { style: 'thin' as const, color: { argb } };
  return { top: side, left: side, bottom: side, right: side };
}

router.get(
  '/classes/:id/import-template.xlsx',
  requireRole('teacher', 'admin'),
  h(async (req, res) => {
    const cls = getClassOrThrow(String(req.params.id));
    if (!canManageClass(cls, (req as AuthedRequest).user!)) throw new HttpError(403, 'FORBIDDEN', 'Không có quyền');

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Smart Lecture';
    workbook.created = new Date();
    const sheet = workbook.addWorksheet('Danh sách học viên', {
      views: [{ state: 'frozen', ySplit: 5, showGridLines: false }],
    });

    const COLS = [
      { header: 'STT', width: 6 },
      { header: 'Mã học viên', width: 14 },
      { header: 'Họ và tên', width: 24 },
      { header: 'Ngày tháng năm sinh', width: 18 },
      { header: 'Giới tính', width: 10 },
      { header: 'Lớp', width: 16 },
      { header: 'Quê quán', width: 20 },
      { header: 'Tài khoản user', width: 18 },
      { header: 'Mật khẩu mặc định', width: 18 },
    ];
    sheet.columns = COLS.map((c) => ({ width: c.width }));
    const lastCol = String.fromCharCode('A'.charCodeAt(0) + COLS.length - 1);

    const titleRow = sheet.getRow(1);
    sheet.mergeCells(`A1:${lastCol}1`);
    titleRow.getCell(1).value = 'SMART LECTURE — DANH SÁCH HỌC VIÊN';
    titleRow.getCell(1).font = { size: 14, bold: true, color: { argb: 'FFFFFFFF' } };
    titleRow.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };
    titleRow.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A8A' } };
    titleRow.height = 26;
    for (let c = 1; c <= COLS.length; c++) {
      titleRow.getCell(c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A8A' } };
    }

    const subtitleRow = sheet.getRow(2);
    sheet.mergeCells(`A2:${lastCol}2`);
    const parts = [cls.name, cls.subject, cls.academic_year].filter(Boolean);
    subtitleRow.getCell(1).value = `Lớp: ${parts.join(' • ')} — Xuất ngày ${new Date().toLocaleDateString('vi-VN')}`;
    subtitleRow.getCell(1).font = { italic: true, size: 10, color: { argb: 'FF64748B' } };
    subtitleRow.getCell(1).alignment = { horizontal: 'center' };

    const instrRow = sheet.getRow(3);
    sheet.mergeCells(`A3:${lastCol}3`);
    instrRow.getCell(1).value =
      'Hướng dẫn: Bắt buộc nhập "Tài khoản user" và "Họ và tên". Nếu để trống "Mật khẩu mặc định", hệ thống sẽ dùng chính "Tài khoản user" làm mật khẩu ban đầu. Cột "Lớp" nên khớp với tên lớp hiện tại. Xóa 2 dòng ví dụ (tô vàng) trước khi nhập dữ liệu thật, có thể xóa các dòng trống thừa hoặc thêm dòng nếu cần.';
    instrRow.getCell(1).font = { size: 9, color: { argb: 'FF64748B' } };
    instrRow.getCell(1).alignment = { horizontal: 'left', vertical: 'middle', wrapText: true };
    instrRow.height = 30;

    sheet.getRow(4).height = 6;

    const headerRow = sheet.getRow(5);
    COLS.forEach((c, idx) => {
      const cell = headerRow.getCell(idx + 1);
      cell.value = c.header;
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A8A' } };
      cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
      cell.border = thinBorder('FF1E3A8A');
    });
    headerRow.height = 30;

    const examples: (string | number)[][] = [
      ['VD1', 'HV2024001', 'Nguyễn Văn A', '15/03/2005', 'Nam', cls.name, 'Hà Nội', 'hv2024001', 'matkhau123'],
      ['VD2', 'HV2024002', 'Trần Thị B', '22/07/2005', 'Nữ', cls.name, 'Hải Phòng', 'hv2024002', ''],
    ];
    examples.forEach((ex, i) => {
      const row = sheet.getRow(6 + i);
      ex.forEach((val, idx) => {
        const cell = row.getCell(idx + 1);
        cell.value = val;
        cell.font = { italic: true, color: { argb: 'FF92400E' } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEF3C7' } };
        cell.border = thinBorder('FFFDE68A');
        cell.alignment = { vertical: 'middle' };
      });
    });

    const FILLER_ROWS = 45;
    const dataStart = 8;
    for (let i = 0; i < FILLER_ROWS; i++) {
      const row = sheet.getRow(dataStart + i);
      const banded = i % 2 === 1;
      for (let c = 1; c <= COLS.length; c++) {
        const cell = row.getCell(c);
        cell.border = thinBorder('FFE2E8F0');
        if (banded) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } };
        if (c === 4) cell.numFmt = '@';
      }
      sheet.getCell(`E${dataStart + i}`).dataValidation = {
        type: 'list',
        allowBlank: true,
        formulae: ['"Nam,Nữ,Khác"'],
      };
    }

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="mau-nhap-hoc-vien-${Date.now()}.xlsx"`);
    await workbook.xlsx.write(res);
    res.end();
  })
);

const enrollSchema = z.object({ studentIds: z.array(z.string()).min(1).max(200) });

router.post(
  '/classes/:id/enroll',
  requireRole('teacher', 'admin'),
  h(async (req, res) => {
    const cls = getClassOrThrow(String(req.params.id));
    if (!canManageClass(cls, (req as AuthedRequest).user!)) throw new HttpError(403, 'FORBIDDEN', 'Không có quyền thêm học viên vào lớp này');
    const parsed = enrollSchema.safeParse(req.body);
    if (!parsed.success) throw new HttpError(400, 'BAD_INPUT', 'Danh sách học viên không hợp lệ');
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
    if (!canManageClass(cls, (req as AuthedRequest).user!)) throw new HttpError(403, 'FORBIDDEN', 'Không có quyền');
    db.prepare('DELETE FROM enrollments WHERE class_id = ? AND student_id = ?').run(cls.id, String(req.params.studentId));
    res.json({ ok: true });
  })
);

router.get(
  '/classes/:id/eligible-students',
  requireRole('teacher', 'admin'),
  h(async (req, res) => {
    const cls = getClassOrThrow(String(req.params.id));
    if (!canManageClass(cls, (req as AuthedRequest).user!)) throw new HttpError(403, 'FORBIDDEN', 'Không có quyền');
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

function normalizeHeader(cell: unknown): string {
  return String(cell ?? '')
    .normalize('NFD')
    .replace(/\p{Mark}/gu, '')
    .replace(/đ/gi, 'd')
    .trim()
    .toLowerCase();
}

function computeHeaderIndices(headerRow: unknown[]) {
  const headers = headerRow.map(normalizeHeader);
  return {
    studentCodeIdx: headers.findIndex((h) => h.includes('ma hoc vien') || h.includes('mshv') || h.includes('msv') || h === 'ma hv'),
    displayNameIdx: headers.findIndex((h) => h.includes('ho va ten') || h.includes('ho ten') || h.includes('hoten') || h.includes('display')),
    dobIdx: headers.findIndex((h) => h.includes('ngay sinh') || h.includes('ngay thang nam sinh') || h.includes('dob')),
    genderIdx: headers.findIndex((h) => h.includes('gioi tinh') || h === 'gt'),
    classNameIdx: headers.findIndex((h) => h === 'lop' || h.includes('lop hoc')),
    hometownIdx: headers.findIndex((h) => h.includes('que quan') || h.includes('dia chi')),
    usernameIdx: headers.findIndex((h) => h.includes('tai khoan') || h.includes('username') || h === 'tk' || h.includes('account')),
    passwordIdx: headers.findIndex((h) => h.includes('mat khau') || h.includes('pass') || h === 'mk'),
  };
}

function parseDobCell(cell: unknown): string | undefined {
  if (cell instanceof Date) {
    if (Number.isNaN(cell.getTime())) return undefined;
    const y = cell.getFullYear();
    const m = String(cell.getMonth() + 1).padStart(2, '0');
    const d = String(cell.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  const text = String(cell ?? '').trim();
  if (!text) return undefined;
  let m = text.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})$/);
  if (m) return `${m[3]}-${String(m[2]).padStart(2, '0')}-${String(m[1]).padStart(2, '0')}`;
  m = text.match(/^(\d{4})[/\-.](\d{1,2})[/\-.](\d{1,2})$/);
  if (m) return `${m[1]}-${String(m[2]).padStart(2, '0')}-${String(m[3]).padStart(2, '0')}`;
  return undefined;
}

router.post(
  '/classes/:id/import-students',
  requireRole('teacher', 'admin'),
  upload.single('file'),
  h(async (req, res) => {
    const cls = getClassOrThrow(String(req.params.id));
    if (!canManageClass(cls, (req as AuthedRequest).user!)) throw new HttpError(403, 'FORBIDDEN', 'Không có quyền nhập học viên');
    if (!req.file) throw new HttpError(400, 'BAD_INPUT', 'Không có file được tải lên');

    let rows: unknown[][];
    try {
      rows = await readFirstWorksheetRows(req.file.buffer, req.file.originalname.toLowerCase().endsWith('.csv') ? 'csv' : 'xlsx');
    } catch {
      throw new HttpError(400, 'BAD_INPUT', 'Không thể đọc file; hãy dùng file .xlsx hoặc .csv hợp lệ');
    }

    if (rows.length < 2) throw new HttpError(400, 'BAD_INPUT', 'File phải có ít nhất 1 dòng tiêu đề và 1 dòng dữ liệu');

    let headerRowIdx = -1;
    let headerIdx: ReturnType<typeof computeHeaderIndices> | null = null;
    for (let r = 0; r < Math.min(10, rows.length); r++) {
      const candidate = computeHeaderIndices(rows[r] ?? []);
      if (candidate.usernameIdx !== -1 && candidate.displayNameIdx !== -1 && candidate.usernameIdx !== candidate.displayNameIdx) {
        headerRowIdx = r;
        headerIdx = candidate;
        break;
      }
    }
    if (headerRowIdx === -1 || !headerIdx) {
      throw new HttpError(400, 'BAD_INPUT', 'File phải có cột "Tài khoản user" và "Họ và tên"');
    }
    const { studentCodeIdx, displayNameIdx, dobIdx, genderIdx, classNameIdx, hometownIdx, usernameIdx, passwordIdx } = headerIdx;

    const dataRows = rows.slice(headerRowIdx + 1).filter((r) => r.some((c) => String(c).trim()));
    let created = 0;
    let enrolled = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (let i = 0; i < dataRows.length; i++) {
      const row = dataRows[i] as unknown[];
      const username = String(row[usernameIdx] ?? '').trim();
      const displayName = String(row[displayNameIdx] ?? '').trim();
      const password = passwordIdx >= 0 ? String(row[passwordIdx] ?? '').trim() : '';
      const studentCode = studentCodeIdx >= 0 ? String(row[studentCodeIdx] ?? '').trim() : '';
      const gender = genderIdx >= 0 ? String(row[genderIdx] ?? '').trim() : '';
      const hometown = hometownIdx >= 0 ? String(row[hometownIdx] ?? '').trim() : '';
      const className = classNameIdx >= 0 ? String(row[classNameIdx] ?? '').trim() : '';
      const dob = dobIdx >= 0 ? parseDobCell(row[dobIdx]) : undefined;

      if (!username || !displayName) {
        errors.push(`Dòng ${i + headerRowIdx + 2}: thiếu tài khoản hoặc họ tên`);
        skipped++;
        continue;
      }
      if (username.length > 50 || displayName.length > 100) {
        errors.push(`Dòng ${i + headerRowIdx + 2}: tài khoản/họ tên quá dài`);
        skipped++;
        continue;
      }
      if (dobIdx >= 0 && row[dobIdx] && String(row[dobIdx]).trim() && !dob) {
        errors.push(`Dòng ${i + headerRowIdx + 2}: không đọc được ngày sinh, đã bỏ qua trường này`);
      }
      if (className && className.toLowerCase() !== cls.name.trim().toLowerCase()) {
        errors.push(`Dòng ${i + headerRowIdx + 2}: cột Lớp ghi "${className}" khác tên lớp hiện tại "${cls.name}" — vẫn nhập vào lớp này`);
      }

      try {
        let studentId: string;
        const existing = findUserByUsername(username);
        if (existing) {
          if (existing.role !== 'student') {
            errors.push(`Dòng ${i + headerRowIdx + 2}: tài khoản ${username} đã tồn tại nhưng không phải học viên`);
            skipped++;
            continue;
          }
          studentId = existing.id;
          db.prepare(
            `UPDATE users SET student_code = COALESCE(?, student_code), dob = COALESCE(?, dob),
             gender = COALESCE(?, gender), hometown = COALESCE(?, hometown) WHERE id = ?`
          ).run(studentCode || null, dob ?? null, gender || null, hometown || null, studentId);
        } else {
          studentId = insertUser(
            {
              username,
              password: password || username,
              role: 'student',
              displayName,
              studentCode: studentCode || undefined,
              dob: dob ?? undefined,
              gender: gender || undefined,
              hometown: hometown || undefined,
            },
            (req as AuthedRequest).user!.id
          );
          created++;
        }

        const alreadyEnrolled = db.prepare('SELECT 1 FROM enrollments WHERE class_id = ? AND student_id = ?').get(cls.id, studentId);
        if (!alreadyEnrolled) {
          db.prepare('INSERT INTO enrollments (class_id, student_id) VALUES (?, ?)').run(cls.id, studentId);
          enrolled++;
        } else {
          skipped++;
        }
      } catch (e) {
        errors.push(`Dòng ${i + headerRowIdx + 2}: ${e instanceof Error ? e.message : 'Lỗi không xác định'}`);
        skipped++;
      }
    }

    res.json({ created, enrolled, skipped, errors });
  })
);

router.get(
  '/classes/:id/groups',
  h(async (req, res) => {
    const cls = getClassOrThrow(String(req.params.id));
    if (!canViewClass(cls, (req as AuthedRequest).user!)) throw new HttpError(403, 'FORBIDDEN', 'Không có quyền');
    const groups = db.prepare('SELECT * FROM class_groups WHERE class_id = ? ORDER BY name').all(cls.id) as { id: string; name: string; color: string }[];
    const members = db.prepare(
      `SELECT cgm.group_id, u.id AS student_id, u.display_name, u.username
       FROM class_group_members cgm
       JOIN users u ON u.id = cgm.student_id
       JOIN class_groups cg ON cg.id = cgm.group_id
       WHERE cg.class_id = ?`
    ).all(cls.id) as { group_id: string; student_id: string; display_name: string; username: string }[];
    const memberMap = new Map<string, { id: string; displayName: string; username: string }[]>();
    for (const m of members) {
      const arr = memberMap.get(m.group_id) ?? [];
      arr.push({ id: m.student_id, displayName: m.display_name, username: m.username });
      memberMap.set(m.group_id, arr);
    }
    res.json({
      groups: groups.map((g) => ({ id: g.id, name: g.name, color: g.color, members: memberMap.get(g.id) ?? [] })),
    });
  })
);

const groupUpsertSchema = z.object({
  name: z.string().min(1).max(50),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#3b82f6'),
});

router.post(
  '/classes/:id/groups',
  requireRole('teacher', 'admin'),
  h(async (req, res) => {
    const cls = getClassOrThrow(String(req.params.id));
    if (!canManageClass(cls, (req as AuthedRequest).user!)) throw new HttpError(403, 'FORBIDDEN', 'Không có quyền');
    const parsed = groupUpsertSchema.safeParse(req.body);
    if (!parsed.success) throw new HttpError(400, 'BAD_INPUT', 'Tên nhóm không hợp lệ');
    const id = randomUUID();
    db.prepare('INSERT INTO class_groups (id, class_id, name, color) VALUES (?, ?, ?, ?)').run(id, cls.id, parsed.data.name, parsed.data.color);
    res.status(201).json({ id, name: parsed.data.name, color: parsed.data.color, members: [] });
  })
);

router.patch(
  '/classes/:id/groups/:groupId',
  requireRole('teacher', 'admin'),
  h(async (req, res) => {
    const cls = getClassOrThrow(String(req.params.id));
    if (!canManageClass(cls, (req as AuthedRequest).user!)) throw new HttpError(403, 'FORBIDDEN', 'Không có quyền');
    const group = db.prepare('SELECT * FROM class_groups WHERE id = ? AND class_id = ?').get(String(req.params.groupId), cls.id) as { id: string; class_id: string; name: string; color: string } | undefined;
    if (!group) throw new HttpError(404, 'NOT_FOUND', 'Không tìm thấy nhóm');
    const parsed = groupUpsertSchema.partial().safeParse(req.body);
    if (!parsed.success) throw new HttpError(400, 'BAD_INPUT', 'Dữ liệu không hợp lệ');
    const name = parsed.data.name ?? group.name;
    const color = parsed.data.color ?? group.color;
    db.prepare('UPDATE class_groups SET name = ?, color = ? WHERE id = ?').run(name, color, group.id);
    res.json({ ok: true });
  })
);

router.delete(
  '/classes/:id/groups/:groupId',
  requireRole('teacher', 'admin'),
  h(async (req, res) => {
    const cls = getClassOrThrow(String(req.params.id));
    if (!canManageClass(cls, (req as AuthedRequest).user!)) throw new HttpError(403, 'FORBIDDEN', 'Không có quyền');
    const result = db.prepare('DELETE FROM class_groups WHERE id = ? AND class_id = ?').run(String(req.params.groupId), cls.id);
    if (result.changes === 0) throw new HttpError(404, 'NOT_FOUND', 'Không tìm thấy nhóm');
    res.json({ ok: true });
  })
);

const groupMembersSchema = z.object({
  studentIds: z.array(z.string()).min(1).max(100),
});

router.post(
  '/classes/:id/groups/:groupId/members',
  requireRole('teacher', 'admin'),
  h(async (req, res) => {
    const cls = getClassOrThrow(String(req.params.id));
    if (!canManageClass(cls, (req as AuthedRequest).user!)) throw new HttpError(403, 'FORBIDDEN', 'Không có quyền');
    const group = db.prepare('SELECT * FROM class_groups WHERE id = ? AND class_id = ?').get(String(req.params.groupId), cls.id) as { id: string; class_id: string; name: string; color: string } | undefined;
    if (!group) throw new HttpError(404, 'NOT_FOUND', 'Không tìm thấy nhóm');
    const parsed = groupMembersSchema.safeParse(req.body);
    if (!parsed.success) throw new HttpError(400, 'BAD_INPUT', 'Danh sách học viên không hợp lệ');
    let added = 0;
    tx(() => {
      for (const sid of parsed.data.studentIds) {
        const enrolled = db.prepare('SELECT 1 FROM enrollments WHERE class_id = ? AND student_id = ?').get(cls.id, sid);
        if (!enrolled) continue;
        const existing = db.prepare('SELECT 1 FROM class_group_members WHERE group_id = ? AND student_id = ?').get(group.id, sid);
        if (existing) continue;
        db.prepare('INSERT INTO class_group_members (group_id, student_id) VALUES (?, ?)').run(group.id, sid);
        added++;
      }
    });
    res.json({ added });
  })
);

router.delete(
  '/classes/:id/groups/:groupId/members/:studentId',
  requireRole('teacher', 'admin'),
  h(async (req, res) => {
    const cls = getClassOrThrow(String(req.params.id));
    if (!canManageClass(cls, (req as AuthedRequest).user!)) throw new HttpError(403, 'FORBIDDEN', 'Không có quyền');
    const group = db.prepare('SELECT * FROM class_groups WHERE id = ? AND class_id = ?').get(String(req.params.groupId), cls.id) as { id: string; class_id: string; name: string; color: string } | undefined;
    if (!group) throw new HttpError(404, 'NOT_FOUND', 'Không tìm thấy nhóm');
    db.prepare('DELETE FROM class_group_members WHERE group_id = ? AND student_id = ?').run(group.id, String(req.params.studentId));
    res.json({ ok: true });
  })
);

router.post(
  '/classes/:id/groups/auto-assign',
  requireRole('teacher', 'admin'),
  h(async (req, res) => {
    const cls = getClassOrThrow(String(req.params.id));
    if (!canManageClass(cls, (req as AuthedRequest).user!)) throw new HttpError(403, 'FORBIDDEN', 'Không có quyền');
    const groups = db.prepare('SELECT id FROM class_groups WHERE class_id = ? ORDER BY name').all(cls.id) as { id: string }[];
    if (groups.length === 0) throw new HttpError(400, 'BAD_INPUT', 'Chưa có nhóm nào. Hãy tạo nhóm trước.');
    const students = db.prepare(
      `SELECT u.id FROM enrollments e JOIN users u ON u.id = e.student_id WHERE e.class_id = ? AND u.role = 'student' ORDER BY u.display_name`
    ).all(cls.id) as { id: string }[];
    tx(() => {
      db.prepare('DELETE FROM class_group_members WHERE group_id IN (SELECT id FROM class_groups WHERE class_id = ?)').run(cls.id);
      for (let i = 0; i < students.length; i++) {
        const g = groups[i % groups.length]!;
        const s = students[i]!;
        db.prepare('INSERT INTO class_group_members (group_id, student_id) VALUES (?, ?)').run(g.id, s.id);
      }
    });
    res.json({ assigned: students.length });
  })
);

router.get(
  '/classes/:id/groups-template.xlsx',
  requireRole('teacher', 'admin'),
  h(async (req, res) => {
    const cls = getClassOrThrow(String(req.params.id));
    if (!canManageClass(cls, (req as AuthedRequest).user!)) throw new HttpError(403, 'FORBIDDEN', 'Không có quyền');

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Smart Lecture';
    workbook.created = new Date();
    const sheet = workbook.addWorksheet('Danh sách nhóm', {
      views: [{ state: 'frozen', ySplit: 5, showGridLines: false }],
    });

    const COLS = [
      { header: 'STT', width: 6 },
      { header: 'Tên nhóm', width: 20 },
      { header: 'Tài khoản user', width: 18 },
      { header: 'Họ và tên (đối chiếu)', width: 24 },
      { header: 'Mã học viên', width: 14 },
    ];
    sheet.columns = COLS.map((c) => ({ width: c.width }));
    const lastCol = String.fromCharCode('A'.charCodeAt(0) + COLS.length - 1);

    const titleRow = sheet.getRow(1);
    sheet.mergeCells(`A1:${lastCol}1`);
    titleRow.getCell(1).value = 'SMART LECTURE — DANH SÁCH NHÓM HỌC VIÊN';
    titleRow.getCell(1).font = { size: 14, bold: true, color: { argb: 'FFFFFFFF' } };
    titleRow.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };
    titleRow.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A8A' } };
    titleRow.height = 26;
    for (let c = 1; c <= COLS.length; c++) {
      titleRow.getCell(c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A8A' } };
    }

    const subtitleRow = sheet.getRow(2);
    sheet.mergeCells(`A2:${lastCol}2`);
    const parts = [cls.name, cls.subject, cls.academic_year].filter(Boolean);
    subtitleRow.getCell(1).value = `Lớp: ${parts.join(' • ')} — Xuất ngày ${new Date().toLocaleDateString('vi-VN')}`;
    subtitleRow.getCell(1).font = { italic: true, size: 10, color: { argb: 'FF64748B' } };
    subtitleRow.getCell(1).alignment = { horizontal: 'center' };

    const instrRow = sheet.getRow(3);
    sheet.mergeCells(`A3:${lastCol}3`);
    instrRow.getCell(1).value =
      'Hướng dẫn: Bắt buộc nhập "Tên nhóm" và "Tài khoản user" (phải là tài khoản học viên đã có trong lớp). Cột "Họ và tên"/"Mã học viên" chỉ để đối chiếu, không dùng để ghép dữ liệu. Nếu "Tên nhóm" chưa tồn tại, hệ thống sẽ tự tạo nhóm mới. Xóa 2 dòng ví dụ (tô vàng) trước khi nhập dữ liệu thật.';
    instrRow.getCell(1).font = { size: 9, color: { argb: 'FF64748B' } };
    instrRow.getCell(1).alignment = { horizontal: 'left', vertical: 'middle', wrapText: true };
    instrRow.height = 30;

    sheet.getRow(4).height = 6;

    const headerRow = sheet.getRow(5);
    COLS.forEach((c, idx) => {
      const cell = headerRow.getCell(idx + 1);
      cell.value = c.header;
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A8A' } };
      cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
      cell.border = thinBorder('FF1E3A8A');
    });
    headerRow.height = 30;

    const examples: (string | number)[][] = [
      ['VD1', 'Nhóm 1', 'hv2024001', 'Nguyễn Văn A', 'HV2024001'],
      ['VD2', 'Nhóm 1', 'hv2024002', 'Trần Thị B', 'HV2024002'],
    ];
    examples.forEach((ex, i) => {
      const row = sheet.getRow(6 + i);
      ex.forEach((val, idx) => {
        const cell = row.getCell(idx + 1);
        cell.value = val;
        cell.font = { italic: true, color: { argb: 'FF92400E' } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEF3C7' } };
        cell.border = thinBorder('FFFDE68A');
        cell.alignment = { vertical: 'middle' };
      });
    });

    const FILLER_ROWS = 45;
    const dataStart = 8;
    for (let i = 0; i < FILLER_ROWS; i++) {
      const row = sheet.getRow(dataStart + i);
      const banded = i % 2 === 1;
      for (let c = 1; c <= COLS.length; c++) {
        const cell = row.getCell(c);
        cell.border = thinBorder('FFE2E8F0');
        if (banded) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } };
      }
    }

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="mau-nhap-nhom-${Date.now()}.xlsx"`);
    await workbook.xlsx.write(res);
    res.end();
  })
);

function computeGroupHeaderIndices(headerRow: unknown[]) {
  const headers = headerRow.map(normalizeHeader);
  return {
    groupNameIdx: headers.findIndex((h) => h.includes('ten nhom') || h === 'nhom'),
    usernameIdx: headers.findIndex((h) => h.includes('tai khoan') || h.includes('username') || h === 'tk' || h.includes('account')),
  };
}

router.post(
  '/classes/:id/import-groups',
  requireRole('teacher', 'admin'),
  upload.single('file'),
  h(async (req, res) => {
    const cls = getClassOrThrow(String(req.params.id));
    if (!canManageClass(cls, (req as AuthedRequest).user!)) throw new HttpError(403, 'FORBIDDEN', 'Không có quyền nhập nhóm');
    if (!req.file) throw new HttpError(400, 'BAD_INPUT', 'Không có file được tải lên');

    let rows: unknown[][];
    try {
      rows = await readFirstWorksheetRows(req.file.buffer, req.file.originalname.toLowerCase().endsWith('.csv') ? 'csv' : 'xlsx');
    } catch {
      throw new HttpError(400, 'BAD_INPUT', 'Không thể đọc file; hãy dùng file .xlsx hoặc .csv hợp lệ');
    }
    if (rows.length < 2) throw new HttpError(400, 'BAD_INPUT', 'File phải có ít nhất 1 dòng tiêu đề và 1 dòng dữ liệu');

    let headerRowIdx = -1;
    let headerIdx: ReturnType<typeof computeGroupHeaderIndices> | null = null;
    for (let r = 0; r < Math.min(10, rows.length); r++) {
      const candidate = computeGroupHeaderIndices(rows[r] ?? []);
      if (candidate.groupNameIdx !== -1 && candidate.usernameIdx !== -1 && candidate.groupNameIdx !== candidate.usernameIdx) {
        headerRowIdx = r;
        headerIdx = candidate;
        break;
      }
    }
    if (headerRowIdx === -1 || !headerIdx) {
      throw new HttpError(400, 'BAD_INPUT', 'File phải có cột "Tên nhóm" và "Tài khoản user"');
    }
    const { groupNameIdx, usernameIdx } = headerIdx;
    const dataRows = rows.slice(headerRowIdx + 1).filter((r) => r.some((c) => String(c).trim()));

    const enrolled = db
      .prepare(`SELECT u.id, u.username FROM enrollments e JOIN users u ON u.id = e.student_id WHERE e.class_id = ?`)
      .all(cls.id) as { id: string; username: string }[];
    const byUsername = new Map(enrolled.map((s) => [s.username.toLowerCase(), s.id]));

    const existingGroups = db.prepare('SELECT id, name FROM class_groups WHERE class_id = ?').all(cls.id) as { id: string; name: string }[];
    const groupByName = new Map(existingGroups.map((g) => [g.name.trim().toLowerCase(), g.id]));
    const PALETTE = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4'];

    let groupsCreated = 0;
    let added = 0;
    let skipped = 0;
    const errors: string[] = [];

    tx(() => {
      for (let i = 0; i < dataRows.length; i++) {
        const row = dataRows[i] as unknown[];
        const lineNo = i + headerRowIdx + 2;
        const groupName = String(row[groupNameIdx] ?? '').trim();
        const username = String(row[usernameIdx] ?? '').trim();

        if (!groupName || !username) {
          errors.push(`Dòng ${lineNo}: thiếu tên nhóm hoặc tài khoản`);
          skipped++;
          continue;
        }
        const studentId = byUsername.get(username.toLowerCase());
        if (!studentId) {
          errors.push(`Dòng ${lineNo}: không tìm thấy học viên "${username}" trong lớp`);
          skipped++;
          continue;
        }
        let groupId = groupByName.get(groupName.toLowerCase());
        if (!groupId) {
          groupId = randomUUID();
          db.prepare('INSERT INTO class_groups (id, class_id, name, color) VALUES (?, ?, ?, ?)').run(
            groupId,
            cls.id,
            groupName,
            PALETTE[groupsCreated % PALETTE.length]!
          );
          groupByName.set(groupName.toLowerCase(), groupId);
          groupsCreated++;
        }
        const already = db.prepare('SELECT 1 FROM class_group_members WHERE group_id = ? AND student_id = ?').get(groupId, studentId);
        if (already) {
          skipped++;
          continue;
        }
        db.prepare('INSERT INTO class_group_members (group_id, student_id) VALUES (?, ?)').run(groupId, studentId);
        added++;
      }
    });

    res.json({ groupsCreated, added, skipped, errors });
  })
);

export default router;

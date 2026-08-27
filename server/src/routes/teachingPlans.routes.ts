import { Router } from 'express';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import multer from 'multer';
import * as XLSX from 'xlsx';
import { db, tx } from '../db/connection.js';
import { requireAuth, requireRole, type AuthedRequest } from '../middleware/auth.js';
import { HttpError, h } from '../utils/errors.js';
import { canManageClass, canViewClass, getClassOrThrow } from '../utils/access.js';

const router = Router();
router.use(requireAuth);

const upload = multer({
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ['.csv', '.xlsx', '.xls'];
    const ext = file.originalname.toLowerCase().substring(file.originalname.lastIndexOf('.'));
    cb(null, allowed.includes(ext));
  },
});

interface TeachingPlanRow {
  id: string;
  class_id: string;
  subject_id: string | null;
  name: string;
  description: string;
  total_periods: number;
}

interface CurriculumItemRow {
  id: string;
  teaching_plan_id: string;
  week: number | null;
  chapter: string;
  topic: string;
  planned_periods: number;
  sort_order: number;
  completed_periods: number;
  status: string;
  lecture_id: string | null;
}

function getPlanOrThrow(id: string): TeachingPlanRow {
  const row = db.prepare('SELECT * FROM teaching_plans WHERE id = ?').get(id) as TeachingPlanRow | undefined;
  if (!row) throw new HttpError(404, 'NOT_FOUND', 'Không tìm thấy chương trình đào tạo');
  return row;
}

function getItemOrThrow(id: string): CurriculumItemRow {
  const row = db.prepare('SELECT * FROM curriculum_items WHERE id = ?').get(id) as CurriculumItemRow | undefined;
  if (!row) throw new HttpError(404, 'NOT_FOUND', 'Không tìm thấy mục chương trình');
  return row;
}

function canManagePlan(plan: TeachingPlanRow, user: NonNullable<AuthedRequest['user']>): boolean {
  const cls = getClassOrThrow(plan.class_id);
  return user.role === 'admin' || (user.role === 'teacher' && cls.teacher_id === user.id);
}

function canViewPlan(plan: TeachingPlanRow, user: NonNullable<AuthedRequest['user']>): boolean {
  if (canManagePlan(plan, user)) return true;
  if (user.role !== 'student') return false;
  const e = db.prepare('SELECT 1 FROM enrollments WHERE class_id = ? AND student_id = ?').get(plan.class_id, user.id);
  return !!e;
}

router.get(
  '/classes/:classId/teaching-plans',
  h(async (req, res) => {
    const cls = getClassOrThrow(String(req.params.classId));
    if (!canViewClass(cls, (req as AuthedRequest).user!)) throw new HttpError(403, 'FORBIDDEN', 'Không có quyền xem lớp');
    const plans = db.prepare('SELECT * FROM teaching_plans WHERE class_id = ? ORDER BY created_at DESC').all(cls.id) as unknown as TeachingPlanRow[];
    for (const plan of plans) {
      const items = db.prepare('SELECT * FROM curriculum_items WHERE teaching_plan_id = ? ORDER BY sort_order').all(plan.id) as unknown as CurriculumItemRow[];
      (plan as any).items = items.map((it) => ({
        id: it.id,
        week: it.week,
        chapter: it.chapter,
        topic: it.topic,
        plannedPeriods: it.planned_periods,
        completedPeriods: it.completed_periods,
        status: it.status,
        sortOrder: it.sort_order,
        lectureId: it.lecture_id,
      }));
    }
    res.json({ plans: plans.map((p) => ({
      id: p.id,
      classId: p.class_id,
      subjectId: p.subject_id,
      name: p.name,
      description: p.description,
      totalPeriods: p.total_periods,
      items: (p as any).items,
    })) });
  })
);

router.get(
  '/classes/:classId/teaching-plans/:planId',
  h(async (req, res) => {
    const plan = getPlanOrThrow(String(req.params.planId));
    if (!canViewPlan(plan, (req as AuthedRequest).user!)) throw new HttpError(403, 'FORBIDDEN', 'Không có quyền xem');
    const items = db.prepare('SELECT * FROM curriculum_items WHERE teaching_plan_id = ? ORDER BY sort_order').all(plan.id) as unknown as CurriculumItemRow[];
    res.json({
      plan: {
        id: plan.id,
        classId: plan.class_id,
        subjectId: plan.subject_id,
        name: plan.name,
        description: plan.description,
        totalPeriods: plan.total_periods,
        items: items.map((it) => ({
          id: it.id,
          week: it.week,
          chapter: it.chapter,
          topic: it.topic,
          plannedPeriods: it.planned_periods,
          completedPeriods: it.completed_periods,
          status: it.status,
          sortOrder: it.sort_order,
          lectureId: it.lecture_id,
        })),
      },
    });
  })
);

const planSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(2000).default(''),
  subjectId: z.string(),
});

router.post(
  '/classes/:classId/teaching-plans',
  requireRole('teacher', 'admin'),
  h(async (req, res) => {
    const cls = getClassOrThrow(String(req.params.classId));
    if (!canManageClass(cls, (req as AuthedRequest).user!)) throw new HttpError(403, 'FORBIDDEN', 'Không có quyền tạo chương trình');
    const parsed = planSchema.safeParse(req.body);
    if (!parsed.success) throw new HttpError(400, 'BAD_INPUT', 'Dữ liệu không hợp lệ');
    const subject = db.prepare('SELECT id FROM subjects WHERE id = ? AND class_id = ?').get(parsed.data.subjectId, cls.id);
    if (!subject) throw new HttpError(400, 'BAD_INPUT', 'Môn học không hợp lệ');
    const id = randomUUID();
    db.prepare('INSERT INTO teaching_plans (id, class_id, subject_id, name, description) VALUES (?, ?, ?, ?, ?)').run(id, cls.id, parsed.data.subjectId, parsed.data.name, parsed.data.description);
    res.status(201).json({ id });
  })
);

router.patch(
  '/teaching-plans/:planId',
  h(async (req, res) => {
    const plan = getPlanOrThrow(String(req.params.planId));
    if (!canManagePlan(plan, (req as AuthedRequest).user!)) throw new HttpError(403, 'FORBIDDEN', 'Không có quyền sửa');
    const parsed = planSchema.partial().safeParse(req.body);
    if (!parsed.success) throw new HttpError(400, 'BAD_INPUT', 'Dữ liệu không hợp lệ');
    db.prepare('UPDATE teaching_plans SET name = ?, description = ?, updated_at = datetime(\'now\') WHERE id = ?').run(
      parsed.data.name ?? plan.name,
      parsed.data.description ?? plan.description,
      plan.id
    );
    res.json({ ok: true });
  })
);

router.delete(
  '/teaching-plans/:planId',
  h(async (req, res) => {
    const plan = getPlanOrThrow(String(req.params.planId));
    if (!canManagePlan(plan, (req as AuthedRequest).user!)) throw new HttpError(403, 'FORBIDDEN', 'Không có quyền xóa');
    db.prepare('DELETE FROM teaching_plans WHERE id = ?').run(plan.id);
    res.json({ ok: true });
  })
);

const itemSchema = z.object({
  week: z.number().int().min(1).max(52).nullable().optional(),
  chapter: z.string().max(120).default(''),
  topic: z.string().min(1).max(300),
  plannedPeriods: z.number().int().min(1).max(50).default(1),
  lectureId: z.string().nullable().optional(),
});

router.post(
  '/teaching-plans/:planId/items',
  h(async (req, res) => {
    const plan = getPlanOrThrow(String(req.params.planId));
    if (!canManagePlan(plan, (req as AuthedRequest).user!)) throw new HttpError(403, 'FORBIDDEN', 'Không có quyền thêm mục');
    const parsed = itemSchema.safeParse(req.body);
    if (!parsed.success) throw new HttpError(400, 'BAD_INPUT', 'Dữ liệu không hợp lệ');
    const maxOrder = db.prepare('SELECT COALESCE(MAX(sort_order), -1) AS m FROM curriculum_items WHERE teaching_plan_id = ?').get(plan.id) as { m: number };
    const id = randomUUID();
    db.prepare('INSERT INTO curriculum_items (id, teaching_plan_id, week, chapter, topic, planned_periods, sort_order, lecture_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(
      id, plan.id, parsed.data.week ?? null, parsed.data.chapter, parsed.data.topic, parsed.data.plannedPeriods, maxOrder.m + 1, parsed.data.lectureId ?? null
    );
    res.status(201).json({ id });
  })
);

router.patch(
  '/curriculum-items/:itemId',
  h(async (req, res) => {
    const item = getItemOrThrow(String(req.params.itemId));
    const plan = getPlanOrThrow(item.teaching_plan_id);
    if (!canManagePlan(plan, (req as AuthedRequest).user!)) throw new HttpError(403, 'FORBIDDEN', 'Không có quyền sửa');
    const parsed = itemSchema.partial().safeParse(req.body);
    if (!parsed.success) throw new HttpError(400, 'BAD_INPUT', 'Dữ liệu không hợp lệ');
    db.prepare('UPDATE curriculum_items SET week = ?, chapter = ?, topic = ?, planned_periods = ?, lecture_id = ?, updated_at = datetime(\'now\') WHERE id = ?').run(
      parsed.data.week ?? item.week,
      parsed.data.chapter ?? item.chapter,
      parsed.data.topic ?? item.topic,
      parsed.data.plannedPeriods ?? item.planned_periods,
      parsed.data.lectureId ?? item.lecture_id,
      item.id
    );
    res.json({ ok: true });
  })
);

router.delete(
  '/curriculum-items/:itemId',
  h(async (req, res) => {
    const item = getItemOrThrow(String(req.params.itemId));
    const plan = getPlanOrThrow(item.teaching_plan_id);
    if (!canManagePlan(plan, (req as AuthedRequest).user!)) throw new HttpError(403, 'FORBIDDEN', 'Không có quyền xóa');
    db.prepare('DELETE FROM curriculum_items WHERE id = ?').run(item.id);
    res.json({ ok: true });
  })
);

router.patch(
  '/curriculum-items/:itemId/reorder',
  h(async (req, res) => {
    const item = getItemOrThrow(String(req.params.itemId));
    const plan = getPlanOrThrow(item.teaching_plan_id);
    if (!canManagePlan(plan, (req as AuthedRequest).user!)) throw new HttpError(403, 'FORBIDDEN', 'Không có quyền sắp xếp');
    const { newIndex } = z.object({ newIndex: z.number().int().min(0) }).parse(req.body);
    const items = db.prepare('SELECT id FROM curriculum_items WHERE teaching_plan_id = ? ORDER BY sort_order').all(plan.id) as { id: string }[];
    const idx = items.findIndex((i) => i.id === item.id);
    if (idx === -1) throw new HttpError(400, 'BAD_INPUT', 'Mục không tồn tại');
    items.splice(idx, 1);
    items.splice(newIndex, 0, item);
    tx(() => {
      items.forEach((it, i) => {
        db.prepare('UPDATE curriculum_items SET sort_order = ? WHERE id = ?').run(i, it.id);
      });
    });
    res.json({ ok: true });
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

router.post(
  '/classes/:classId/teaching-plans/import-curriculum',
  requireRole('teacher', 'admin'),
  upload.single('file'),
  h(async (req, res) => {
    const cls = getClassOrThrow(String(req.params.classId));
    if (!canManageClass(cls, (req as AuthedRequest).user!)) throw new HttpError(403, 'FORBIDDEN', 'Không có quyền nhập chương trình');
    if (!req.file) throw new HttpError(400, 'BAD_INPUT', 'Không có file được tải lên');
    const subjectId = String(req.body?.subjectId ?? '');
    const subject = subjectId ? db.prepare('SELECT id FROM subjects WHERE id = ? AND class_id = ?').get(subjectId, cls.id) : undefined;
    if (!subject) throw new HttpError(400, 'BAD_INPUT', 'Môn học không hợp lệ');

    const workbook = XLSX.read(req.file.buffer, { type: 'buffer', cellDates: true });
    const sheetName = workbook.SheetNames[0];
    if (!sheetName) throw new HttpError(400, 'BAD_INPUT', 'File không có sheet nào');
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) throw new HttpError(400, 'BAD_INPUT', 'Sheet không hợp lệ');
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' }) as unknown[][];

    if (rows.length < 2) throw new HttpError(400, 'BAD_INPUT', 'File phải có ít nhất 1 dòng tiêu đề và 1 dòng dữ liệu');

    const headerRow = rows[0];
    if (!headerRow) throw new HttpError(400, 'BAD_INPUT', 'Không đọc được dòng tiêu đề');
    const headers = headerRow.map(normalizeHeader);

    const weekIdx = headers.findIndex((h) => h === 'tuan' || h === 'week' || h.includes('tuan'));
    const chapterIdx = headers.findIndex((h) => h.includes('chuong') || h.includes('phan') || h === 'chapter');
    const topicIdx = headers.findIndex((h) => h.includes('chude') || h.includes('noidung') || h.includes('topic') || h === 'ten' || h.includes('tieu de'));
    const periodsIdx = headers.findIndex((h) => h.includes('tiet') || h.includes('period') || h.includes('gio') || h === 'so tiet');

    if (topicIdx === -1) {
      throw new HttpError(400, 'BAD_INPUT', 'File phải có cột "Chủ đề/Nội dung" (topic)');
    }

    const planName = `Chương trình ${cls.name} - ${new Date().toLocaleDateString('vi-VN')}`;
    const planId = randomUUID();
    db.prepare('INSERT INTO teaching_plans (id, class_id, subject_id, name, description) VALUES (?, ?, ?, ?, ?)').run(planId, cls.id, subjectId, planName, 'Import từ Excel');

    const dataRows = rows.slice(1).filter((r) => r.some((c) => String(c).trim()));
    let created = 0;
    let sortOrder = 0;
    const errors: string[] = [];

    for (let i = 0; i < dataRows.length; i++) {
      const row = dataRows[i] as unknown[];
      const week = weekIdx >= 0 ? (row[weekIdx] ? Number(row[weekIdx]) : null) : null;
      const chapter = chapterIdx >= 0 ? String(row[chapterIdx] ?? '').trim() : '';
      const topic = String(row[topicIdx] ?? '').trim();
      const plannedPeriods = periodsIdx >= 0 && row[periodsIdx] ? Math.max(1, Number(row[periodsIdx])) : 1;

      if (!topic) {
        errors.push(`Dòng ${i + 2}: thiếu chủ đề`);
        continue;
      }

      try {
        db.prepare('INSERT INTO curriculum_items (id, teaching_plan_id, week, chapter, topic, planned_periods, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?)').run(
          randomUUID(), planId, week, chapter, topic, plannedPeriods, sortOrder
        );
        created++;
        sortOrder++;
      } catch (e) {
        errors.push(`Dòng ${i + 2}: ${e instanceof Error ? e.message : 'Lỗi'}`);
      }
    }

    const totalPeriods = db.prepare('SELECT COALESCE(SUM(planned_periods), 0) AS s FROM curriculum_items WHERE teaching_plan_id = ?').get(planId) as { s: number };
    db.prepare('UPDATE teaching_plans SET total_periods = ? WHERE id = ?').run(totalPeriods.s, planId);

    res.json({ planId, created, totalPeriods: totalPeriods.s, errors });
  })
);

router.get(
  '/classes/:classId/teaching-plans/template.xlsx',
  h(async (req, res) => {
    const headers = ['Tuần', 'Chương/Phần', 'Chủ đề/Nội dung', 'Số tiết dự kiến'];
    const sampleRows = [
      [1, 'Chương 1', 'Tổng quan môn học', 2],
      [1, 'Chương 1', 'Khái niệm cơ bản', 2],
      [2, 'Chương 2', 'Lý thuyết cốt lõi 1', 3],
      [2, 'Chương 2', 'Lý thuyết cốt lõi 2', 3],
      [3, 'Chương 3', 'Thực hành / Bài tập', 4],
    ];
    const workbook = XLSX.utils.book_new();
    const sheetData = [headers, ...sampleRows];
    const sheet = XLSX.utils.aoa_to_sheet(sheetData);
    sheet['!cols'] = [{ wch: 8 }, { wch: 18 }, { wch: 40 }, { wch: 18 }];
    XLSX.utils.book_append_sheet(workbook, sheet, 'Chương trình đào tạo');
    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="mau-chuong-trinh-dao-tao-${Date.now()}.xlsx"`);
    res.send(buffer);
  })
);

export default router;
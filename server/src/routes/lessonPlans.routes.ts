import { Router } from 'express';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { db, tx } from '../db/connection.js';
import { requireAuth, requireRole, type AuthedRequest } from '../middleware/auth.js';
import { HttpError, h } from '../utils/errors.js';
import { canManageClass, canViewClass, getClassOrThrow } from '../utils/access.js';

const router = Router();
router.use(requireAuth);

interface LessonPlanRow {
  id: string;
  curriculum_item_id: string;
  title: string;
  script: string;
  planned_duration: number;
  slide_material_id: string | null;
  video_material_id: string | null;
  game_session_id: string | null;
  question_set_id: string | null;
}

function getLessonPlanOrThrow(id: string): LessonPlanRow {
  const row = db.prepare('SELECT * FROM lesson_plans WHERE id = ?').get(id) as LessonPlanRow | undefined;
  if (!row) throw new HttpError(404, 'NOT_FOUND', 'Không tìm thấy kế hoạch tiết');
  return row;
}

function getCurriculumItemOrThrow(id: string) {
  const row = db.prepare('SELECT * FROM curriculum_items WHERE id = ?').get(id) as
    | { id: string; teaching_plan_id: string }
    | undefined;
  if (!row) throw new HttpError(404, 'NOT_FOUND', 'Không tìm thấy mục chương trình');
  return row;
}

function canManageLessonPlan(plan: LessonPlanRow, user: NonNullable<AuthedRequest['user']>): boolean {
  const item = getCurriculumItemOrThrow(plan.curriculum_item_id);
  const tp = db.prepare('SELECT * FROM teaching_plans WHERE id = ?').get(item.teaching_plan_id) as { class_id: string } | undefined;
  if (!tp) throw new HttpError(404, 'NOT_FOUND', 'Chương trình đào tạo không tồn tại');
  const cls = getClassOrThrow(tp.class_id);
  return user.role === 'admin' || (user.role === 'teacher' && cls.teacher_id === user.id);
}

function canViewLessonPlan(plan: LessonPlanRow, user: NonNullable<AuthedRequest['user']>): boolean {
  if (canManageLessonPlan(plan, user)) return true;
  if (user.role !== 'student') return false;
  const item = getCurriculumItemOrThrow(plan.curriculum_item_id);
  const tp = db.prepare('SELECT * FROM teaching_plans WHERE id = ?').get(item.teaching_plan_id) as { class_id: string } | undefined;
  if (!tp) return false;
  const e = db.prepare('SELECT 1 FROM enrollments WHERE class_id = ? AND student_id = ?').get(tp.class_id, user.id);
  return !!e;
}

router.get(
  '/curriculum-items/:itemId/lesson-plans',
  h(async (req, res) => {
    const item = getCurriculumItemOrThrow(String(req.params.itemId));
    const tp = db.prepare('SELECT * FROM teaching_plans WHERE id = ?').get(item.teaching_plan_id) as { class_id: string } | undefined;
    if (!tp) throw new HttpError(404, 'NOT_FOUND', 'Chương trình đào tạo không tồn tại');
    const cls = getClassOrThrow(tp.class_id);
    if (!canViewClass(cls, (req as AuthedRequest).user!)) throw new HttpError(403, 'FORBIDDEN', 'Không có quyền xem');
    const plans = db.prepare('SELECT * FROM lesson_plans WHERE curriculum_item_id = ? ORDER BY created_at').all(item.id) as unknown as LessonPlanRow[];
    res.json({
      lessonPlans: plans.map(p => ({
        id: p.id,
        curriculumItemId: p.curriculum_item_id,
        title: p.title,
        script: p.script,
        plannedDuration: p.planned_duration,
        slideMaterialId: p.slide_material_id,
        videoMaterialId: p.video_material_id,
        gameSessionId: p.game_session_id,
        questionSetId: p.question_set_id,
      })),
    });
  })
);

router.get(
  '/lesson-plans/:planId',
  h(async (req, res) => {
    const plan = getLessonPlanOrThrow(String(req.params.planId));
    if (!canViewLessonPlan(plan, (req as AuthedRequest).user!)) throw new HttpError(403, 'FORBIDDEN', 'Không có quyền xem');
    res.json({
      lessonPlan: {
        id: plan.id,
        curriculumItemId: plan.curriculum_item_id,
        title: plan.title,
        script: plan.script,
        plannedDuration: plan.planned_duration,
        slideMaterialId: plan.slide_material_id,
        videoMaterialId: plan.video_material_id,
        gameSessionId: plan.game_session_id,
        questionSetId: plan.question_set_id,
      },
    });
  })
);

const lessonPlanSchema = z.object({
  title: z.string().min(1).max(200),
  script: z.string().max(5000).default(''),
  plannedDuration: z.number().int().min(5).max(180).default(45),
  slideMaterialId: z.string().nullable().optional(),
  videoMaterialId: z.string().nullable().optional(),
  gameSessionId: z.string().nullable().optional(),
  questionSetId: z.string().nullable().optional(),
});

router.post(
  '/curriculum-items/:itemId/lesson-plans',
  h(async (req, res) => {
    const item = getCurriculumItemOrThrow(String(req.params.itemId));
    const tp = db.prepare('SELECT * FROM teaching_plans WHERE id = ?').get(item.teaching_plan_id) as { class_id: string } | undefined;
    if (!tp) throw new HttpError(404, 'NOT_FOUND', 'Chương trình đào tạo không tồn tại');
    const cls = getClassOrThrow(tp.class_id);
    if (!canManageClass(cls, (req as AuthedRequest).user!)) throw new HttpError(403, 'FORBIDDEN', 'Không có quyền tạo kế hoạch tiết');
    const parsed = lessonPlanSchema.safeParse(req.body);
    if (!parsed.success) throw new HttpError(400, 'BAD_INPUT', 'Dữ liệu không hợp lệ');
    const id = randomUUID();
    db.prepare(
      `INSERT INTO lesson_plans (id, curriculum_item_id, title, script, planned_duration, slide_material_id, video_material_id, game_session_id, question_set_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      id,
      item.id,
      parsed.data.title,
      parsed.data.script,
      parsed.data.plannedDuration,
      parsed.data.slideMaterialId ?? null,
      parsed.data.videoMaterialId ?? null,
      parsed.data.gameSessionId ?? null,
      parsed.data.questionSetId ?? null
    );
    res.status(201).json({ id });
  })
);

router.patch(
  '/lesson-plans/:planId',
  h(async (req, res) => {
    const plan = getLessonPlanOrThrow(String(req.params.planId));
    if (!canManageLessonPlan(plan, (req as AuthedRequest).user!)) throw new HttpError(403, 'FORBIDDEN', 'Không có quyền sửa');
    const parsed = lessonPlanSchema.partial().safeParse(req.body);
    if (!parsed.success) throw new HttpError(400, 'BAD_INPUT', 'Dữ liệu không hợp lệ');
    db.prepare(
      `UPDATE lesson_plans SET title = ?, script = ?, planned_duration = ?, slide_material_id = ?, video_material_id = ?, game_session_id = ?, question_set_id = ?, updated_at = datetime('now') WHERE id = ?`
    ).run(
      parsed.data.title ?? plan.title,
      parsed.data.script ?? plan.script,
      parsed.data.plannedDuration ?? plan.planned_duration,
      parsed.data.slideMaterialId ?? plan.slide_material_id,
      parsed.data.videoMaterialId ?? plan.video_material_id,
      parsed.data.gameSessionId ?? plan.game_session_id,
      parsed.data.questionSetId ?? plan.question_set_id,
      plan.id
    );
    res.json({ ok: true });
  })
);

router.delete(
  '/lesson-plans/:planId',
  h(async (req, res) => {
    const plan = getLessonPlanOrThrow(String(req.params.planId));
    if (!canManageLessonPlan(plan, (req as AuthedRequest).user!)) throw new HttpError(403, 'FORBIDDEN', 'Không có quyền xóa');
    db.prepare('DELETE FROM lesson_plans WHERE id = ?').run(plan.id);
    res.json({ ok: true });
  })
);

export default router;
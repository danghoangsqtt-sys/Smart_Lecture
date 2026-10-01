import { randomUUID } from 'node:crypto';
import { createReadStream, existsSync, statSync, unlinkSync } from 'node:fs';
import path from 'node:path';
import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { MEDIA_DIR } from '../config.js';
import { db, tx } from '../db/connection.js';
import { requireAuth, requireAuthFlexible, requireRole, type AuthedRequest } from '../middleware/auth.js';
import { copyLegacyMaterial, matchesMediaSignature, sharedMediaPath } from '../services/sharedCurriculumMedia.js';
import { canManageClass, canViewClass, getClassOrThrow } from '../utils/access.js';
import { HttpError, h } from '../utils/errors.js';
import { singleFileLimits } from '../utils/uploadLimits.js';

const router = Router();
const fileTypes: Record<string, { type: string; mime: string }> = {
  '.pdf': { type: 'pdf', mime: 'application/pdf' },
  '.docx': { type: 'docx', mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' },
  '.pptx': { type: 'pptx', mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' },
  '.mp4': { type: 'video', mime: 'video/mp4' },
  '.webm': { type: 'video', mime: 'video/webm' },
  '.png': { type: 'image', mime: 'image/png' },
  '.jpg': { type: 'image', mime: 'image/jpeg' },
  '.jpeg': { type: 'image', mime: 'image/jpeg' },
};
const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, done) => done(null, MEDIA_DIR),
    filename: (_req, file, done) => done(null, `${randomUUID()}${path.extname(file.originalname).toLowerCase()}`),
  }),
  limits: singleFileLimits(500 * 1024 * 1024, 1),
  fileFilter: (_req, file, done) => {
    const allowed = fileTypes[path.extname(file.originalname).toLowerCase()];
    if (!allowed || file.mimetype !== allowed.mime) {
      done(new HttpError(400, 'BAD_FORMAT', 'Định dạng tệp không hỗ trợ'));
      return;
    }
    done(null, true);
  },
});

type SharedMaterial = { id: string; lesson_id: string; type: string; title: string; file_path: string | null;
  link_url: string | null; original_name: string; mime_type: string; size_bytes: number; asset_status: string };

function materialOrThrow(id: string): SharedMaterial {
  const row = db.prepare('SELECT * FROM shared_lesson_materials WHERE id = ?').get(id) as SharedMaterial | undefined;
  if (!row) throw new HttpError(404, 'NOT_FOUND', 'Không tìm thấy học liệu');
  return row;
}

function safeWebLink(value: string | null): boolean {
  if (!value) return false;
  try { return ['http:', 'https:'].includes(new URL(value).protocol); } catch { return false; }
}

function publicMaterial(row: SharedMaterial): Omit<SharedMaterial, 'file_path'> {
  const { file_path: _filePath, ...rest } = row;
  if (row.type === 'link' && !safeWebLink(row.link_url)) {
    return { ...rest, link_url: null, asset_status: 'pending_copy' };
  }
  return rest;
}

// Embeds use the same-origin HttpOnly session cookie; pending assets are never served.
router.get('/shared/materials/:materialId/stream', requireAuthFlexible, h(async (req, res) => {
  const material = materialOrThrow(String(req.params.materialId));
  const lesson = lessonOrThrow(material.lesson_id);
  assertViewSubject(subjectOrThrow(lesson.subject_id), (req as AuthedRequest).user!);
  if (material.asset_status !== 'ready' || !material.file_path) {
    throw new HttpError(404, 'NOT_READY', 'Học liệu chưa sẵn sàng');
  }
  const fullPath = sharedMediaPath(material.file_path);
  if (!existsSync(fullPath)) throw new HttpError(404, 'NOT_FOUND', 'Tệp không còn trên đĩa');
  const size = statSync(fullPath).size;
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Accept-Ranges', 'bytes');
  res.setHeader('Content-Type', material.mime_type || 'application/octet-stream');
  const range = req.headers.range;
  if (range) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(range);
    if (!match || (!match[1] && !match[2])) {
      res.status(416).setHeader('Content-Range', `bytes */${size}`).end();
      return;
    }
    const suffix = !match[1] ? Number(match[2]) : null;
    const start = suffix === null ? Number(match[1]) : Math.max(0, size - suffix);
    const end = suffix === null && match[2] ? Math.min(Number(match[2]), size - 1) : size - 1;
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start > end || start >= size || suffix === 0) {
      res.status(416).setHeader('Content-Range', `bytes */${size}`).end();
      return;
    }
    res.status(206);
    res.setHeader('Content-Range', `bytes ${start}-${end}/${size}`);
    res.setHeader('Content-Length', String(end - start + 1));
    const stream = createReadStream(fullPath, { start, end });
    stream.on('error', () => { if (!res.headersSent) res.status(500).end(); else res.destroy(); });
    res.on('close', () => stream.destroy());
    stream.pipe(res);
    return;
  }
  res.setHeader('Content-Length', String(size));
  res.sendFile(fullPath, (error) => { if (error && !res.headersSent) res.status(500).end(); });
}));

router.use(requireAuth);

type User = NonNullable<AuthedRequest['user']>;
type Subject = { id: string; owner_id: string; name: string; description: string; created_at: string };
type Lesson = { id: string; subject_id: string; chapter: string; title: string; description: string; sort_order: number; created_at: string };

const subjectInput = z.object({ name: z.string().trim().min(1).max(160), description: z.string().trim().max(2000).default('') });
const subjectPatch = subjectInput.partial().refine((value) => Object.keys(value).length > 0);
const lessonInput = z.object({
  chapter: z.string().trim().max(120).default(''),
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(4000).default(''),
  sortOrder: z.number().int().min(0).max(100000).default(0),
});
const lessonPatch = lessonInput.partial().refine((value) => Object.keys(value).length > 0);
const idInput = z.object({ classId: z.string().trim().min(1).max(128) });
const questionInput = z.object({ questionId: z.string().trim().min(1).max(128), sortOrder: z.number().int().min(0).max(100000).default(0) });
const progressInput = z.object({
  plannedPeriods: z.number().int().min(1).max(1000),
  completedPeriods: z.number().int().min(0).max(1000),
  status: z.enum(['pending', 'in_progress', 'completed']),
}).refine((value) => value.completedPeriods <= value.plannedPeriods, { message: 'Số tiết đã dạy không được vượt kế hoạch' });
const linkInput = z.object({ title: z.string().trim().min(1).max(200), linkUrl: z.url().refine((url) => /^https?:\/\//i.test(url)) });

function subjectOrThrow(id: string): Subject {
  const row = db.prepare('SELECT * FROM shared_subjects WHERE id = ?').get(id) as Subject | undefined;
  if (!row) throw new HttpError(404, 'NOT_FOUND', 'Không tìm thấy môn học');
  return row;
}

function lessonOrThrow(id: string): Lesson {
  const row = db.prepare('SELECT * FROM shared_lessons WHERE id = ?').get(id) as Lesson | undefined;
  if (!row) throw new HttpError(404, 'NOT_FOUND', 'Không tìm thấy bài học');
  return row;
}

function canManageSubject(subject: Subject, user: User): boolean {
  return user.role === 'admin' || (user.role === 'teacher' && subject.owner_id === user.id);
}

function assertManageSubject(subject: Subject, user: User): void {
  if (!canManageSubject(subject, user)) throw new HttpError(403, 'FORBIDDEN', 'Không có quyền sửa môn học');
}

function assertViewSubject(subject: Subject, user: User): void {
  if (canManageSubject(subject, user)) return;
  if (user.role === 'teacher' && db.prepare(`SELECT 1 FROM class_subject_assignments a
    JOIN classes c ON c.id = a.class_id WHERE a.subject_id = ? AND c.teacher_id = ?`).get(subject.id, user.id)) return;
  if (user.role === 'student' && db.prepare(`SELECT 1 FROM class_subject_assignments a
    JOIN enrollments e ON e.class_id = a.class_id WHERE a.subject_id = ? AND e.student_id = ?`).get(subject.id, user.id)) return;
  throw new HttpError(403, 'FORBIDDEN', 'Không có quyền xem môn học');
}

function assertTeachSubject(subject: Subject, user: User): void {
  if (user.role === 'student') throw new HttpError(403, 'FORBIDDEN', 'Không có quyền xem câu hỏi');
  assertViewSubject(subject, user);
}

router.get('/shared/subjects', h(async (req, res) => {
  const user = (req as AuthedRequest).user!;
  const rows = user.role === 'admin'
    ? db.prepare('SELECT * FROM shared_subjects ORDER BY created_at DESC').all()
    : user.role === 'teacher'
      ? db.prepare('SELECT * FROM shared_subjects WHERE owner_id = ? ORDER BY created_at DESC').all(user.id)
      : db.prepare(`SELECT DISTINCT s.* FROM shared_subjects s JOIN class_subject_assignments a ON a.subject_id = s.id
        JOIN enrollments e ON e.class_id = a.class_id WHERE e.student_id = ? ORDER BY s.created_at DESC`).all(user.id);
  res.json({ subjects: rows });
}));

router.post('/shared/subjects', requireRole('teacher', 'admin'), h(async (req, res) => {
  const input = subjectInput.parse(req.body);
  const id = randomUUID();
  db.prepare('INSERT INTO shared_subjects (id, owner_id, name, description) VALUES (?, ?, ?, ?)')
    .run(id, (req as AuthedRequest).user!.id, input.name, input.description);
  res.status(201).json({ subject: subjectOrThrow(id) });
}));

router.patch('/shared/subjects/:subjectId', requireRole('teacher', 'admin'), h(async (req, res) => {
  const subject = subjectOrThrow(String(req.params.subjectId));
  assertManageSubject(subject, (req as AuthedRequest).user!);
  const input = subjectPatch.parse(req.body);
  db.prepare('UPDATE shared_subjects SET name = ?, description = ? WHERE id = ?')
    .run(input.name ?? subject.name, input.description ?? subject.description, subject.id);
  res.json({ subject: subjectOrThrow(subject.id) });
}));

router.delete('/shared/subjects/:subjectId', requireRole('teacher', 'admin'), h(async (req, res) => {
  const subject = subjectOrThrow(String(req.params.subjectId));
  assertManageSubject(subject, (req as AuthedRequest).user!);
  const referenced = db.prepare(`SELECT 1 WHERE
    EXISTS (SELECT 1 FROM shared_lessons WHERE subject_id = ?)
    OR EXISTS (SELECT 1 FROM class_subject_assignments WHERE subject_id = ?)
    OR EXISTS (SELECT 1 FROM shared_curriculum_legacy_map WHERE target_kind = 'subject' AND target_id = ?)`)
    .get(subject.id, subject.id, subject.id);
  if (referenced) throw new HttpError(409, 'SUBJECT_IN_USE', 'Môn học đã có bài, lớp hoặc dữ liệu cũ liên kết');
  db.prepare('DELETE FROM shared_subjects WHERE id = ?').run(subject.id);
  res.json({ ok: true });
}));

router.get('/shared/subjects/:subjectId/lessons', h(async (req, res) => {
  const subject = subjectOrThrow(String(req.params.subjectId));
  assertViewSubject(subject, (req as AuthedRequest).user!);
  const lessons = db.prepare('SELECT * FROM shared_lessons WHERE subject_id = ? ORDER BY sort_order, created_at, id').all(subject.id);
  res.json({ subject, lessons });
}));

router.post('/shared/subjects/:subjectId/lessons', requireRole('teacher', 'admin'), h(async (req, res) => {
  const subject = subjectOrThrow(String(req.params.subjectId));
  assertManageSubject(subject, (req as AuthedRequest).user!);
  const input = lessonInput.parse(req.body);
  const id = randomUUID();
  db.prepare(`INSERT INTO shared_lessons (id, subject_id, chapter, title, description, sort_order)
    VALUES (?, ?, ?, ?, ?, ?)`).run(id, subject.id, input.chapter, input.title, input.description, input.sortOrder);
  res.status(201).json({ lesson: lessonOrThrow(id) });
}));

router.patch('/shared/lessons/:lessonId', requireRole('teacher', 'admin'), h(async (req, res) => {
  const lesson = lessonOrThrow(String(req.params.lessonId));
  assertManageSubject(subjectOrThrow(lesson.subject_id), (req as AuthedRequest).user!);
  const input = lessonPatch.parse(req.body);
  db.prepare(`UPDATE shared_lessons SET chapter = ?, title = ?, description = ?, sort_order = ? WHERE id = ?`)
    .run(input.chapter ?? lesson.chapter, input.title ?? lesson.title, input.description ?? lesson.description,
      input.sortOrder ?? lesson.sort_order, lesson.id);
  res.json({ lesson: lessonOrThrow(lesson.id) });
}));

router.delete('/shared/lessons/:lessonId', requireRole('teacher', 'admin'), h(async (req, res) => {
  const lesson = lessonOrThrow(String(req.params.lessonId));
  assertManageSubject(subjectOrThrow(lesson.subject_id), (req as AuthedRequest).user!);
  const referenced = db.prepare(`SELECT 1 WHERE
    EXISTS (SELECT 1 FROM shared_lesson_materials WHERE lesson_id = ?)
    OR EXISTS (SELECT 1 FROM shared_lesson_questions WHERE lesson_id = ?)
    OR EXISTS (SELECT 1 FROM class_lesson_progress WHERE lesson_id = ?)
    OR EXISTS (SELECT 1 FROM shared_curriculum_legacy_map WHERE target_kind = 'lesson' AND target_id = ?)`)
    .get(lesson.id, lesson.id, lesson.id, lesson.id);
  if (referenced) throw new HttpError(409, 'LESSON_IN_USE', 'Bài học đã có học liệu, câu hỏi, tiến độ hoặc dữ liệu cũ liên kết');
  db.prepare('DELETE FROM shared_lessons WHERE id = ?').run(lesson.id);
  res.json({ ok: true });
}));

router.get('/shared/lessons/:lessonId/materials', h(async (req, res) => {
  const lesson = lessonOrThrow(String(req.params.lessonId));
  const user = (req as AuthedRequest).user!;
  const subject = subjectOrThrow(lesson.subject_id);
  assertViewSubject(subject, user);
  const rows = db.prepare(`SELECT * FROM shared_lesson_materials WHERE lesson_id = ?
    AND (? = 1 OR asset_status = 'ready') ORDER BY created_at, id`)
    .all(lesson.id, canManageSubject(subject, user) ? 1 : 0) as unknown as SharedMaterial[];
  res.json({ materials: rows.filter((row) => canManageSubject(subject, user) || row.type !== 'link' || safeWebLink(row.link_url))
    .map(publicMaterial) });
}));

router.post('/shared/lessons/:lessonId/materials/link', requireRole('teacher', 'admin'), h(async (req, res) => {
  const lesson = lessonOrThrow(String(req.params.lessonId));
  assertManageSubject(subjectOrThrow(lesson.subject_id), (req as AuthedRequest).user!);
  const input = linkInput.parse(req.body);
  const id = randomUUID();
  db.prepare(`INSERT INTO shared_lesson_materials (id, lesson_id, type, title, link_url, asset_status)
    VALUES (?, ?, 'link', ?, ?, 'ready')`).run(id, lesson.id, input.title, input.linkUrl);
  res.status(201).json({ material: publicMaterial(materialOrThrow(id)) });
}));

router.post('/shared/lessons/:lessonId/materials', requireRole('teacher', 'admin'),
  (req, _res, next) => {
    try {
      const lesson = lessonOrThrow(String(req.params.lessonId));
      assertManageSubject(subjectOrThrow(lesson.subject_id), (req as AuthedRequest).user!);
      next();
    } catch (error) { next(error); }
  },
  upload.single('file'),
  h(async (req, res) => {
    const file = req.file;
    if (!file) throw new HttpError(400, 'NO_FILE', 'Không nhận được tệp tải lên');
    const meta = fileTypes[path.extname(file.originalname).toLowerCase()];
    try {
      if (!meta) throw new HttpError(400, 'BAD_FORMAT', 'Định dạng tệp không hỗ trợ');
      if (file.size > (meta.type === 'video' ? 500 : 50) * 1024 * 1024) {
        throw new HttpError(413, 'TOO_LARGE', 'Tệp vượt quá giới hạn');
      }
      if (!matchesMediaSignature(file.path, path.extname(file.originalname))) {
        throw new HttpError(400, 'BAD_SIGNATURE', 'Nội dung tệp không khớp định dạng');
      }
      const title = z.string().trim().min(1).max(200).parse(req.body?.title || path.basename(file.originalname, path.extname(file.originalname)));
      const id = randomUUID();
      db.prepare(`INSERT INTO shared_lesson_materials
        (id, lesson_id, type, title, file_path, original_name, mime_type, size_bytes, asset_status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'ready')`)
        .run(id, String(req.params.lessonId), meta.type, title, file.filename, file.originalname, meta.mime, file.size);
      res.status(201).json({ material: publicMaterial(materialOrThrow(id)) });
    } catch (error) {
      if (existsSync(file.path)) unlinkSync(file.path);
      throw error;
    }
  })
);

router.post('/shared/materials/:materialId/copy-legacy', requireRole('teacher', 'admin'), h(async (req, res) => {
  const material = materialOrThrow(String(req.params.materialId));
  const lesson = lessonOrThrow(material.lesson_id);
  assertManageSubject(subjectOrThrow(lesson.subject_id), (req as AuthedRequest).user!);
  const copied = copyLegacyMaterial(material.id);
  res.json({ material: publicMaterial(materialOrThrow(copied.id)) });
}));

router.delete('/shared/materials/:materialId', requireRole('teacher', 'admin'), h(async (req, res) => {
  const material = materialOrThrow(String(req.params.materialId));
  const lesson = lessonOrThrow(material.lesson_id);
  assertManageSubject(subjectOrThrow(lesson.subject_id), (req as AuthedRequest).user!);
  const mapped = db.prepare("SELECT 1 FROM shared_curriculum_legacy_map WHERE target_kind = 'material' AND target_id = ?")
    .get(material.id);
  if (mapped) throw new HttpError(409, 'LEGACY_MATERIAL', 'Học liệu này thuộc dữ liệu cũ, không thể xóa tại kho dùng chung');
  db.prepare('DELETE FROM shared_lesson_materials WHERE id = ?').run(material.id);
  if (material.file_path) {
    const filename = sharedMediaPath(material.file_path);
    if (existsSync(filename)) unlinkSync(filename);
  }
  res.json({ ok: true });
}));

router.post('/shared/subjects/:subjectId/classes', requireRole('teacher', 'admin'), h(async (req, res) => {
  const subject = subjectOrThrow(String(req.params.subjectId));
  const user = (req as AuthedRequest).user!;
  assertManageSubject(subject, user);
  const { classId } = idInput.parse(req.body);
  const cls = getClassOrThrow(classId);
  if (!canManageClass(cls, user)) throw new HttpError(403, 'FORBIDDEN', 'Không có quyền với lớp học');
  const id = randomUUID();
  db.prepare('INSERT OR IGNORE INTO class_subject_assignments (id, class_id, subject_id) VALUES (?, ?, ?)')
    .run(id, classId, subject.id);
  const assignment = db.prepare('SELECT * FROM class_subject_assignments WHERE class_id = ? AND subject_id = ?')
    .get(classId, subject.id);
  res.json({ assignment });
}));

router.delete('/shared/subjects/:subjectId/classes/:classId', requireRole('teacher', 'admin'), h(async (req, res) => {
  const subject = subjectOrThrow(String(req.params.subjectId));
  const user = (req as AuthedRequest).user!;
  assertManageSubject(subject, user);
  const cls = getClassOrThrow(String(req.params.classId));
  if (!canManageClass(cls, user)) throw new HttpError(403, 'FORBIDDEN', 'Không có quyền với lớp học');
  const assignment = db.prepare('SELECT id FROM class_subject_assignments WHERE class_id = ? AND subject_id = ?')
    .get(cls.id, subject.id) as { id: string } | undefined;
  if (!assignment) throw new HttpError(404, 'NOT_FOUND', 'Lớp chưa liên kết môn học');
  const hasProgress = db.prepare('SELECT 1 FROM class_lesson_progress WHERE assignment_id = ?').get(assignment.id);
  if (hasProgress) throw new HttpError(409, 'HAS_PROGRESS', 'Môn học đã có tiến độ lớp, không thể gỡ liên kết');
  const legacyMap = db.prepare("SELECT 1 FROM shared_curriculum_legacy_map WHERE target_kind = 'assignment' AND target_id = ?")
    .get(assignment.id);
  if (legacyMap) throw new HttpError(409, 'LEGACY_ASSIGNMENT', 'Liên kết môn học này thuộc dữ liệu cũ, không thể gỡ');
  db.prepare('DELETE FROM class_subject_assignments WHERE id = ?').run(assignment.id);
  res.json({ ok: true });
}));

router.get('/shared/classes/:classId/subjects', h(async (req, res) => {
  const cls = getClassOrThrow(String(req.params.classId));
  if (!canViewClass(cls, (req as AuthedRequest).user!)) throw new HttpError(403, 'FORBIDDEN', 'Không có quyền xem lớp');
  const assignments = db.prepare(`SELECT a.id AS assignment_id, s.* FROM class_subject_assignments a
    JOIN shared_subjects s ON s.id = a.subject_id WHERE a.class_id = ? ORDER BY s.name, s.id`).all(cls.id);
  res.json({ assignments });
}));

router.get('/shared/classes/:classId/subjects/:subjectId/progress', h(async (req, res) => {
  const cls = getClassOrThrow(String(req.params.classId));
  if (!canViewClass(cls, (req as AuthedRequest).user!)) throw new HttpError(403, 'FORBIDDEN', 'Không có quyền xem lớp');
  const subject = subjectOrThrow(String(req.params.subjectId));
  const assignment = db.prepare('SELECT id FROM class_subject_assignments WHERE class_id = ? AND subject_id = ?')
    .get(cls.id, subject.id) as { id: string } | undefined;
  if (!assignment) throw new HttpError(404, 'NOT_FOUND', 'Lớp chưa liên kết môn học');
  const progress = db.prepare(`SELECT l.id AS lesson_id, l.title, l.chapter, l.sort_order,
    p.id AS progress_id, p.planned_periods, p.completed_periods, p.status
    FROM shared_lessons l LEFT JOIN class_lesson_progress p ON p.lesson_id = l.id AND p.assignment_id = ?
    WHERE l.subject_id = ? ORDER BY l.sort_order, l.created_at, l.id`).all(assignment.id, subject.id);
  res.json({ assignmentId: assignment.id, progress });
}));

router.put('/shared/classes/:classId/subjects/:subjectId/lessons/:lessonId/progress', requireRole('teacher', 'admin'), h(async (req, res) => {
  const user = (req as AuthedRequest).user!;
  const cls = getClassOrThrow(String(req.params.classId));
  if (!canManageClass(cls, user)) throw new HttpError(403, 'FORBIDDEN', 'Không có quyền với lớp học');
  const subject = subjectOrThrow(String(req.params.subjectId));
  const lesson = lessonOrThrow(String(req.params.lessonId));
  if (lesson.subject_id !== subject.id) throw new HttpError(400, 'BAD_INPUT', 'Bài học không thuộc môn học');
  const assignment = db.prepare('SELECT id FROM class_subject_assignments WHERE class_id = ? AND subject_id = ?')
    .get(cls.id, subject.id) as { id: string } | undefined;
  if (!assignment) throw new HttpError(404, 'NOT_FOUND', 'Lớp chưa liên kết môn học');
  const input = progressInput.parse(req.body);
  tx(() => {
    db.prepare(`INSERT INTO class_lesson_progress (id, assignment_id, lesson_id, planned_periods, completed_periods, status)
      VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(assignment_id, lesson_id) DO UPDATE SET
      planned_periods = excluded.planned_periods, completed_periods = excluded.completed_periods, status = excluded.status`)
      .run(randomUUID(), assignment.id, lesson.id, input.plannedPeriods, input.completedPeriods, input.status);
  });
  const progress = db.prepare('SELECT * FROM class_lesson_progress WHERE assignment_id = ? AND lesson_id = ?')
    .get(assignment.id, lesson.id);
  res.json({ progress });
}));

router.get('/shared/lessons/:lessonId/questions', requireRole('teacher', 'admin'), h(async (req, res) => {
  const lesson = lessonOrThrow(String(req.params.lessonId));
  assertTeachSubject(subjectOrThrow(lesson.subject_id), (req as AuthedRequest).user!);
  const questions = db.prepare(`SELECT l.id AS link_id, l.sort_order, q.* FROM shared_lesson_questions l
    JOIN questions q ON q.id = l.question_id WHERE l.lesson_id = ? ORDER BY l.sort_order, l.created_at`).all(lesson.id);
  res.json({ questions });
}));

router.post('/shared/lessons/:lessonId/questions', requireRole('teacher', 'admin'), h(async (req, res) => {
  const lesson = lessonOrThrow(String(req.params.lessonId));
  const user = (req as AuthedRequest).user!;
  assertManageSubject(subjectOrThrow(lesson.subject_id), user);
  const input = questionInput.parse(req.body);
  const question = user.role === 'admin'
    ? db.prepare('SELECT id FROM questions WHERE id = ?').get(input.questionId)
    : db.prepare('SELECT id FROM questions WHERE id = ? AND (owner_id = ? OR is_public_bank = 1)')
      .get(input.questionId, user.id);
  if (!question) throw new HttpError(404, 'NOT_FOUND', 'Không tìm thấy câu hỏi có thể sử dụng');
  db.prepare(`INSERT INTO shared_lesson_questions (id, lesson_id, question_id, sort_order)
    VALUES (?, ?, ?, ?) ON CONFLICT(lesson_id, question_id) DO UPDATE SET sort_order = excluded.sort_order`)
    .run(randomUUID(), lesson.id, input.questionId, input.sortOrder);
  res.json({ ok: true });
}));

router.delete('/shared/lessons/:lessonId/questions/:questionId', requireRole('teacher', 'admin'), h(async (req, res) => {
  const lesson = lessonOrThrow(String(req.params.lessonId));
  assertManageSubject(subjectOrThrow(lesson.subject_id), (req as AuthedRequest).user!);
  const result = db.prepare('DELETE FROM shared_lesson_questions WHERE lesson_id = ? AND question_id = ?')
    .run(lesson.id, String(req.params.questionId));
  if (result.changes === 0) throw new HttpError(404, 'NOT_FOUND', 'Câu hỏi chưa liên kết bài học');
  res.json({ ok: true });
}));

export default router;

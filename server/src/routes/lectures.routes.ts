import { Router } from 'express';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { unlinkSync, existsSync, statSync, copyFileSync } from 'node:fs';
import multer from 'multer';
import { db } from '../db/connection.js';
import { MEDIA_DIR } from '../config.js';
import { requireAuth, requireAuthFlexible, type AuthedRequest } from '../middleware/auth.js';
import { HttpError, h } from '../utils/errors.js';
import { canManageClass, canViewClass, getClassOrThrow } from '../utils/access.js';

const router = Router();

// Registered before the blanket requireAuth below so <iframe>/<video>/<a> embeds can
// authenticate via ?token= — they can't attach an Authorization header.
router.get(
  '/media/:materialId/stream',
  requireAuthFlexible,
  h(async (req, res) => {
    const material = db.prepare('SELECT * FROM materials WHERE id = ?').get(String(req.params.materialId)) as MaterialRow | undefined;
    if (!material?.file_path) throw new HttpError(404, 'NOT_FOUND', 'Không tìm thấy tệp');
    const lecture = getLectureOrThrow(material.lecture_id);
    assertLectureAccess(lecture, (req as AuthedRequest).user!, false);
    const fullPath = path.join(MEDIA_DIR, material.file_path);
    if (!existsSync(fullPath)) throw new HttpError(404, 'NOT_FOUND', 'Tệp không còn trên đĩa');
    const size = statSync(fullPath).size;
    const range = req.headers.range;
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Content-Type', material.mime_type || 'application/octet-stream');
    if (range) {
      const match = range.match(/bytes=(\d*)-(\d*)/);
      let start = match?.[1] ? parseInt(match[1], 10) : 0;
      let end = match?.[2] ? parseInt(match[2], 10) : size - 1;
      if (Number.isNaN(start) || start < 0) start = 0;
      if (Number.isNaN(end) || end >= size) end = size - 1;
      if (start > end) start = 0;
      res.status(206);
      res.setHeader('Content-Range', `bytes ${start}-${end}/${size}`);
      res.setHeader('Content-Length', String(end - start + 1));
      res.sendFile(fullPath, { start, end }, (err) => {
        if (err && !res.headersSent) res.status(500).end();
      });
      return;
    }
    res.setHeader('Content-Length', String(size));
    res.sendFile(fullPath, (err) => {
      if (err && !res.headersSent) res.status(500).end();
    });
  })
);

router.use(requireAuth);

export const ALLOWED_EXT: Record<string, { type: string; mime: string }> = {
  '.pdf': { type: 'pdf', mime: 'application/pdf' },
  '.docx': { type: 'docx', mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' },
  '.pptx': { type: 'pptx', mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' },
  '.mp4': { type: 'video', mime: 'video/mp4' },
  '.webm': { type: 'video', mime: 'video/webm' },
  '.png': { type: 'image', mime: 'image/png' },
  '.jpg': { type: 'image', mime: 'image/jpeg' },
  '.jpeg': { type: 'image', mime: 'image/jpeg' },
};

const MAX_SIZE: Record<string, number> = { video: 500 * 1024 * 1024, default: 50 * 1024 * 1024 };

function uuidFilename(originalname: string): string {
  return `${randomUUID()}${path.extname(originalname).toLowerCase()}`;
}

// Copies a file (e.g. from a subject's drop folder) into MEDIA_DIR under a fresh UUID
// name, matching the naming scheme multer's storage.filename below applies to uploads.
export function copyIntoMediaDir(absoluteSourcePath: string, originalname: string): string {
  const filename = uuidFilename(originalname);
  copyFileSync(absoluteSourcePath, path.join(MEDIA_DIR, filename));
  return filename;
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, MEDIA_DIR),
  filename: (_req, file, cb) => cb(null, uuidFilename(file.originalname)),
});

const upload = multer({
  storage,
  limits: { fileSize: MAX_SIZE.video },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (!ALLOWED_EXT[ext]) {
      cb(new Error(`Định dạng không hỗ trợ: ${ext}`));
      return;
    }
    cb(null, true);
  },
});

interface LectureRow {
  id: string;
  class_id: string;
  subject_id: string | null;
  chapter: string;
  title: string;
  description: string;
  sort_order: number;
  completed_at: string | null;
}

interface MaterialRow {
  id: string;
  lecture_id: string;
  type: string;
  title: string;
  file_path: string | null;
  link_url: string | null;
  original_name: string;
  mime_type: string;
  size_bytes: number;
  converted_from_id: string | null;
}

export function insertMaterial(params: {
  lectureId: string;
  type: string;
  title: string;
  filePath: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  convertedFromId?: string;
}): string {
  const id = randomUUID();
  db.prepare(
    `INSERT INTO materials (id, lecture_id, type, title, file_path, original_name, mime_type, size_bytes, converted_from_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    params.lectureId,
    params.type,
    params.title,
    params.filePath,
    params.originalName,
    params.mimeType,
    params.sizeBytes,
    params.convertedFromId ?? null
  );
  return id;
}

type PptxConversionResult =
  | { status: 'ready'; convertedMaterialId: string }
  | { status: 'unavailable' }
  | { status: 'failed' };

export async function maybeConvertPptx(lectureId: string, materialType: string, filename: string, originalName: string, materialId: string): Promise<PptxConversionResult | null> {
  if (materialType !== 'pptx') return null;
  const existing = db.prepare('SELECT id FROM materials WHERE converted_from_id = ?').get(materialId) as { id: string } | undefined;
  if (existing) return { status: 'ready', convertedMaterialId: existing.id };
  const { detectLibreOffice, isLibreOfficeAvailable } = await import('./system.routes.js');
  if (!isLibreOfficeAvailable() && !(await detectLibreOffice())) return { status: 'unavailable' };
  const { convertPptxToPdf } = await import('../services/officeConvert.js');
  const result = await convertPptxToPdf(path.join(MEDIA_DIR, filename));
  if (!result) return { status: 'failed' };
  const convertedAfterWait = db.prepare('SELECT id FROM materials WHERE converted_from_id = ?').get(materialId) as { id: string } | undefined;
  if (convertedAfterWait) return { status: 'ready', convertedMaterialId: convertedAfterWait.id };
  const base = path.basename(originalName, path.extname(originalName));
  const convertedMaterialId = insertMaterial({
    lectureId,
    type: 'pdf',
    title: `${base} (PDF)`,
    filePath: path.basename(result.pdfPath),
    originalName: `${base}.pdf`,
    mimeType: 'application/pdf',
    sizeBytes: result.sizeBytes,
    convertedFromId: materialId,
  });
  return { status: 'ready', convertedMaterialId };
}

function getLectureOrThrow(id: string): LectureRow {
  const row = db.prepare('SELECT * FROM lectures WHERE id = ?').get(id) as LectureRow | undefined;
  if (!row) throw new HttpError(404, 'NOT_FOUND', 'Không tìm thấy bài giảng');
  return row;
}

function assertLectureAccess(lecture: LectureRow, user: NonNullable<AuthedRequest['user']>, manage: boolean): void {
  const cls = getClassOrThrow(lecture.class_id);
  const ok = manage ? canManageClass(cls, user) : canViewClass(cls, user);
  if (!ok) throw new HttpError(403, 'FORBIDDEN', 'Không có quyền với bài giảng này');
}

router.get(
  '/classes/:classId/lectures',
  h(async (req, res) => {
    const cls = getClassOrThrow(String(req.params.classId));
    if (!canViewClass(cls, (req as AuthedRequest).user!)) throw new HttpError(403, 'FORBIDDEN', 'Không có quyền xem lớp');
    const lectures = db
      .prepare('SELECT * FROM lectures WHERE class_id = ? ORDER BY sort_order, created_at')
      .all(cls.id) as unknown as LectureRow[];
    const materials = db
      .prepare(
        `SELECT m.* FROM materials m JOIN lectures l ON l.id = m.lecture_id WHERE l.class_id = ?
         ORDER BY m.created_at`
      )
      .all(cls.id) as unknown as MaterialRow[];
    res.json({
      lectures: lectures.map((l) => ({
        ...l,
        classId: l.class_id,
        subjectId: l.subject_id,
        sortOrder: l.sort_order,
        completedAt: l.completed_at,
        materials: materials
          .filter((m) => m.lecture_id === l.id)
          .map((m) => ({
            id: m.id,
            type: m.type,
            title: m.title,
            linkUrl: m.link_url,
            originalName: m.original_name,
            mimeType: m.mime_type,
            sizeBytes: m.size_bytes,
            convertedFromId: m.converted_from_id,
          })),
      })),
    });
  })
);

const lectureSchema = z.object({
  chapter: z.string().max(120).default(''),
  title: z.string().min(1).max(200),
  description: z.string().max(2000).default(''),
  subjectId: z.string().optional(),
});

router.post(
  '/classes/:classId/lectures',
  h(async (req, res) => {
    const cls = getClassOrThrow(String(req.params.classId));
    if (!canManageClass(cls, (req as AuthedRequest).user!)) throw new HttpError(403, 'FORBIDDEN', 'Chỉ giáo viên chủ nhiệm lớp được thêm bài giảng');
    const parsed = lectureSchema.safeParse(req.body);
    if (!parsed.success) throw new HttpError(400, 'BAD_INPUT', 'Thông tin bài giảng không hợp lệ');
    let subjectId: string | null = null;
    if (parsed.data.subjectId) {
      const subject = db.prepare('SELECT id FROM subjects WHERE id = ? AND class_id = ?').get(parsed.data.subjectId, cls.id);
      if (!subject) throw new HttpError(400, 'BAD_INPUT', 'Môn học không hợp lệ');
      subjectId = parsed.data.subjectId;
    }
    const maxOrder = db.prepare('SELECT COALESCE(MAX(sort_order), -1) AS m FROM lectures WHERE class_id = ?').get(cls.id) as { m: number };
    const id = randomUUID();
    db.prepare('INSERT INTO lectures (id, class_id, subject_id, chapter, title, description, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?)').run(
      id,
      cls.id,
      subjectId,
      parsed.data.chapter,
      parsed.data.title,
      parsed.data.description,
      maxOrder.m + 1
    );
    res.status(201).json({ id });
  })
);

router.patch(
  '/lectures/:id',
  h(async (req, res) => {
    const lecture = getLectureOrThrow(String(req.params.id));
    assertLectureAccess(lecture, (req as AuthedRequest).user!, true);
    const parsed = lectureSchema.partial().safeParse(req.body);
    if (!parsed.success) throw new HttpError(400, 'BAD_INPUT', 'Dữ liệu không hợp lệ');
    let subjectId = lecture.subject_id;
    if (parsed.data.subjectId !== undefined) {
      if (parsed.data.subjectId) {
        const subject = db.prepare('SELECT id FROM subjects WHERE id = ? AND class_id = ?').get(parsed.data.subjectId, lecture.class_id);
        if (!subject) throw new HttpError(400, 'BAD_INPUT', 'Môn học không hợp lệ');
        subjectId = parsed.data.subjectId;
      } else {
        subjectId = null;
      }
    }
    db.prepare('UPDATE lectures SET chapter = ?, title = ?, description = ?, subject_id = ? WHERE id = ?').run(
      parsed.data.chapter ?? lecture.chapter,
      parsed.data.title ?? lecture.title,
      parsed.data.description ?? lecture.description,
      subjectId,
      lecture.id
    );
    res.json({ ok: true });
  })
);

router.delete(
  '/lectures/:id',
  h(async (req, res) => {
    const lecture = getLectureOrThrow(String(req.params.id));
    assertLectureAccess(lecture, (req as AuthedRequest).user!, true);
    db.prepare('DELETE FROM lectures WHERE id = ?').run(lecture.id);
    res.json({ ok: true });
  })
);

const progressSchema = z.object({ completed: z.boolean() });

router.patch(
  '/lectures/:id/progress',
  h(async (req, res) => {
    const lecture = getLectureOrThrow(String(req.params.id));
    assertLectureAccess(lecture, (req as AuthedRequest).user!, true);
    const parsed = progressSchema.safeParse(req.body);
    if (!parsed.success) throw new HttpError(400, 'BAD_INPUT', 'Dữ liệu không hợp lệ');
    db.prepare("UPDATE lectures SET completed_at = CASE WHEN ? = 1 THEN datetime('now') ELSE NULL END WHERE id = ?").run(
      parsed.data.completed ? 1 : 0,
      lecture.id
    );
    res.json({ completed: parsed.data.completed });
  })
);

const linkSchema = z.object({ title: z.string().min(1).max(200), linkUrl: z.string().url().max(1000) });

router.post(
  '/lectures/:id/materials/link',
  h(async (req, res) => {
    const lecture = getLectureOrThrow(String(req.params.id));
    assertLectureAccess(lecture, (req as AuthedRequest).user!, true);
    const parsed = linkSchema.safeParse(req.body);
    if (!parsed.success) throw new HttpError(400, 'BAD_INPUT', 'Link không hợp lệ');
    const id = randomUUID();
    db.prepare("INSERT INTO materials (id, lecture_id, type, title, link_url) VALUES (?, ?, 'link', ?, ?)").run(
      id,
      lecture.id,
      parsed.data.title,
      parsed.data.linkUrl
    );
    res.status(201).json({ id });
  })
);

router.post(
  '/lectures/:id/materials',
  upload.single('file'),
  h(async (req, res) => {
    const lecture = getLectureOrThrow(String(req.params.id));
    assertLectureAccess(lecture, (req as AuthedRequest).user!, true);
    const file = req.file;
    if (!file) throw new HttpError(400, 'NO_FILE', 'Không nhận được tệp tải lên');
    const ext = path.extname(file.originalname).toLowerCase();
    const meta = ALLOWED_EXT[ext];
    if (!meta) {
      unlinkSync(file.path);
      throw new HttpError(400, 'BAD_FORMAT', `Định dạng không hỗ trợ: ${ext}`);
    }
    const limit = MAX_SIZE[meta.type] ?? 50 * 1024 * 1024;
    if (file.size > limit) {
      unlinkSync(file.path);
      throw new HttpError(400, 'TOO_LARGE', `Tệp vượt quá giới hạn ${(limit / 1024 / 1024).toFixed(0)}MB`);
    }
    const title = (req.body?.title as string)?.trim() || path.basename(file.originalname, ext);
    const id = insertMaterial({
      lectureId: lecture.id,
      type: meta.type,
      title,
      filePath: file.filename,
      originalName: file.originalname,
      mimeType: meta.mime,
      sizeBytes: file.size,
    });
    res.status(201).json({ id, type: meta.type, title });
    void maybeConvertPptx(lecture.id, meta.type, file.filename, file.originalname, id);
  })
);

router.post(
  '/materials/:id/convert-pptx',
  h(async (req, res) => {
    const material = db.prepare('SELECT * FROM materials WHERE id = ?').get(String(req.params.id)) as MaterialRow | undefined;
    if (!material) throw new HttpError(404, 'NOT_FOUND', 'Không tìm thấy tài liệu');
    const lecture = getLectureOrThrow(material.lecture_id);
    assertLectureAccess(lecture, (req as AuthedRequest).user!, true);
    if (material.type !== 'pptx' || !material.file_path) throw new HttpError(400, 'BAD_INPUT', 'Chỉ có thể chuyển đổi tệp PowerPoint');
    const result = await maybeConvertPptx(lecture.id, material.type, material.file_path, material.original_name, material.id);
    if (result?.status === 'ready') {
      res.json({ status: result.status, convertedMaterialId: result.convertedMaterialId });
      return;
    }
    if (result?.status === 'unavailable') throw new HttpError(409, 'PPTX_CONVERSION_UNAVAILABLE', 'Cần cài LibreOffice để chuyển PowerPoint thành PDF cho chế độ trình chiếu');
    throw new HttpError(422, 'PPTX_CONVERSION_FAILED', 'Không thể chuyển đổi tệp PowerPoint này');
  })
);

router.delete(
  '/materials/:id',
  h(async (req, res) => {
    const material = db.prepare('SELECT * FROM materials WHERE id = ?').get(String(req.params.id)) as MaterialRow | undefined;
    if (!material) throw new HttpError(404, 'NOT_FOUND', 'Không tìm thấy tài liệu');
    const lecture = getLectureOrThrow(material.lecture_id);
    assertLectureAccess(lecture, (req as AuthedRequest).user!, true);
    const converted = db.prepare('SELECT * FROM materials WHERE converted_from_id = ?').get(material.id) as MaterialRow | undefined;
    if (converted?.file_path) {
      const convertedFull = path.join(MEDIA_DIR, converted.file_path);
      if (existsSync(convertedFull)) unlinkSync(convertedFull);
    }
    if (material.file_path) {
      const full = path.join(MEDIA_DIR, material.file_path);
      if (existsSync(full)) unlinkSync(full);
    }
    db.prepare('DELETE FROM materials WHERE id = ?').run(material.id);
    res.json({ ok: true });
  })
);

export default router;

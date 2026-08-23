import { Router } from 'express';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { unlinkSync, existsSync, statSync } from 'node:fs';
import multer from 'multer';
import { db } from '../db/connection.js';
import { MEDIA_DIR } from '../config.js';
import { requireAuth, type AuthedRequest } from '../middleware/auth.js';
import { HttpError, h } from '../utils/errors.js';
import { canManageClass, canViewClass, getClassOrThrow } from '../utils/access.js';

const router = Router();
router.use(requireAuth);

const ALLOWED_EXT: Record<string, { type: string; mime: string }> = {
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

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, MEDIA_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${randomUUID()}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: MAX_SIZE.video },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (!ALLOWED_EXT[ext]) {
      cb(new Error(`Äá»‹nh dáº¡ng khÃ´ng há»— trá»£: ${ext}`));
      return;
    }
    cb(null, true);
  },
});

interface LectureRow {
  id: string;
  class_id: string;
  chapter: string;
  title: string;
  description: string;
  sort_order: number;
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
}

function getLectureOrThrow(id: string): LectureRow {
  const row = db.prepare('SELECT * FROM lectures WHERE id = ?').get(id) as LectureRow | undefined;
  if (!row) throw new HttpError(404, 'NOT_FOUND', 'KhÃ´ng tÃ¬m tháº¥y bÃ i giáº£ng');
  return row;
}

function assertLectureAccess(lecture: LectureRow, user: NonNullable<AuthedRequest['user']>, manage: boolean): void {
  const cls = getClassOrThrow(lecture.class_id);
  const ok = manage ? canManageClass(cls, user) : canViewClass(cls, user);
  if (!ok) throw new HttpError(403, 'FORBIDDEN', 'KhÃ´ng cÃ³ quyá»n vá»›i bÃ i giáº£ng nÃ y');
}

router.get(
  '/classes/:classId/lectures',
  h(async (req, res) => {
    const cls = getClassOrThrow(String(req.params.classId));
    if (!canViewClass(cls, (req as AuthedRequest).user!)) throw new HttpError(403, 'FORBIDDEN', 'KhÃ´ng cÃ³ quyá»n xem lá»›p');
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
        sortOrder: l.sort_order,
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
          })),
      })),
    });
  })
);

const lectureSchema = z.object({
  chapter: z.string().max(120).default(''),
  title: z.string().min(1).max(200),
  description: z.string().max(2000).default(''),
});

router.post(
  '/classes/:classId/lectures',
  h(async (req, res) => {
    const cls = getClassOrThrow(String(req.params.classId));
    if (!canManageClass(cls, (req as AuthedRequest).user!)) throw new HttpError(403, 'FORBIDDEN', 'Chá»‰ giÃ¡o viÃªn chá»§ nhiá»‡m lá»›p Ä‘Æ°á»£c thÃªm bÃ i giáº£ng');
    const parsed = lectureSchema.safeParse(req.body);
    if (!parsed.success) throw new HttpError(400, 'BAD_INPUT', 'ThÃ´ng tin bÃ i giáº£ng khÃ´ng há»£p lá»‡');
    const maxOrder = db.prepare('SELECT COALESCE(MAX(sort_order), -1) AS m FROM lectures WHERE class_id = ?').get(cls.id) as { m: number };
    const id = randomUUID();
    db.prepare('INSERT INTO lectures (id, class_id, chapter, title, description, sort_order) VALUES (?, ?, ?, ?, ?, ?)').run(
      id,
      cls.id,
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
    if (!parsed.success) throw new HttpError(400, 'BAD_INPUT', 'Dá»¯ liá»‡u khÃ´ng há»£p lá»‡');
    db.prepare('UPDATE lectures SET chapter = ?, title = ?, description = ? WHERE id = ?').run(
      parsed.data.chapter ?? lecture.chapter,
      parsed.data.title ?? lecture.title,
      parsed.data.description ?? lecture.description,
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

const linkSchema = z.object({ title: z.string().min(1).max(200), linkUrl: z.string().url().max(1000) });

router.post(
  '/lectures/:id/materials/link',
  h(async (req, res) => {
    const lecture = getLectureOrThrow(String(req.params.id));
    assertLectureAccess(lecture, (req as AuthedRequest).user!, true);
    const parsed = linkSchema.safeParse(req.body);
    if (!parsed.success) throw new HttpError(400, 'BAD_INPUT', 'Link khÃ´ng há»£p lá»‡');
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
    if (!file) throw new HttpError(400, 'NO_FILE', 'KhÃ´ng nháº­n Ä‘Æ°á»£c tá»‡p táº£i lÃªn');
    const ext = path.extname(file.originalname).toLowerCase();
    const meta = ALLOWED_EXT[ext];
    if (!meta) {
      unlinkSync(file.path);
      throw new HttpError(400, 'BAD_FORMAT', `Äá»‹nh dáº¡ng khÃ´ng há»— trá»£: ${ext}`);
    }
    const limit = MAX_SIZE[meta.type] ?? 50 * 1024 * 1024;
    if (file.size > limit) {
      unlinkSync(file.path);
      throw new HttpError(400, 'TOO_LARGE', `Tá»‡p vÆ°á»£t quÃ¡ giá»›i háº¡n ${(limit / 1024 / 1024).toFixed(0)}MB`);
    }
    const title = (req.body?.title as string)?.trim() || path.basename(file.originalname, ext);
    const id = randomUUID();
    db.prepare(
      `INSERT INTO materials (id, lecture_id, type, title, file_path, original_name, mime_type, size_bytes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(id, lecture.id, meta.type, title, file.filename, file.originalname, meta.mime, file.size);
    res.status(201).json({ id, type: meta.type, title });
  })
);

router.delete(
  '/materials/:id',
  h(async (req, res) => {
    const material = db.prepare('SELECT * FROM materials WHERE id = ?').get(String(req.params.id)) as MaterialRow | undefined;
    if (!material) throw new HttpError(404, 'NOT_FOUND', 'KhÃ´ng tÃ¬m tháº¥y tÃ i liá»‡u');
    const lecture = getLectureOrThrow(material.lecture_id);
    assertLectureAccess(lecture, (req as AuthedRequest).user!, true);
    if (material.file_path) {
      const full = path.join(MEDIA_DIR, material.file_path);
      if (existsSync(full)) unlinkSync(full);
    }
    db.prepare('DELETE FROM materials WHERE id = ?').run(material.id);
    res.json({ ok: true });
  })
);

router.get(
  '/media/:materialId/stream',
  h(async (req, res) => {
    const material = db.prepare('SELECT * FROM materials WHERE id = ?').get(String(req.params.materialId)) as MaterialRow | undefined;
    if (!material?.file_path) throw new HttpError(404, 'NOT_FOUND', 'KhÃ´ng tÃ¬m tháº¥y tá»‡p');
    const lecture = getLectureOrThrow(material.lecture_id);
    assertLectureAccess(lecture, (req as AuthedRequest).user!, false);
    const fullPath = path.join(MEDIA_DIR, material.file_path);
    if (!existsSync(fullPath)) throw new HttpError(404, 'NOT_FOUND', 'Tá»‡p khÃ´ng cÃ²n trÃªn Ä‘Ä©a');
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

export default router;

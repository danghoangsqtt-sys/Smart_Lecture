import { Router } from 'express';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { readdirSync, realpathSync, statSync, unlinkSync } from 'node:fs';
import { db, tx } from '../db/connection.js';
import { DROP_DIR, MEDIA_DIR } from '../config.js';
import { requireAuth, requireRole, type AuthedRequest } from '../middleware/auth.js';
import { HttpError, h } from '../utils/errors.js';
import { canManageClass, getClassOrThrow } from '../utils/access.js';
import { ALLOWED_EXT, copyIntoMediaDir, insertMaterial, maybeConvertPptx } from './lectures.routes.js';

const router = Router();
router.use(requireAuth);

interface SubjectRow {
  id: string;
  class_id: string;
  name: string;
}

function getSubjectOrThrow(id: string): SubjectRow {
  const row = db.prepare('SELECT id, class_id, name FROM subjects WHERE id = ?').get(id) as SubjectRow | undefined;
  if (!row) throw new HttpError(404, 'NOT_FOUND', 'Không tìm thấy môn học');
  return row;
}

function assertSubjectManage(subject: SubjectRow, user: NonNullable<AuthedRequest['user']>): void {
  const cls = getClassOrThrow(subject.class_id);
  if (!canManageClass(cls, user)) throw new HttpError(403, 'FORBIDDEN', 'Không có quyền với môn học này');
}

router.get(
  '/subjects/:subjectId/pending-files',
  h(async (req, res) => {
    const subject = getSubjectOrThrow(String(req.params.subjectId));
    assertSubjectManage(subject, (req as AuthedRequest).user!);
    const dir = path.join(DROP_DIR, subject.id);
    const ingested = new Set(
      (db.prepare('SELECT filename FROM intake_ingested WHERE subject_id = ?').all(subject.id) as { filename: string }[]).map((r) => r.filename)
    );
    let entries: string[] = [];
    try {
      entries = readdirSync(dir);
    } catch {
      entries = [];
    }
    const pending: { filename: string; sizeBytes: number; type: string }[] = [];
    for (const name of entries) {
      if (ingested.has(name)) continue;
      const meta = ALLOWED_EXT[path.extname(name).toLowerCase()];
      if (!meta) continue;
      const stat = statSync(path.join(dir, name));
      pending.push({ filename: name, sizeBytes: stat.size, type: meta.type });
    }
    res.json({ dropPath: dir, files: pending });
  })
);

const ingestSchema = z.object({
  filenames: z.array(z.string().min(1)).min(1).max(50),
  mode: z.enum(['new-lecture-per-file', 'existing-lecture']),
  lectureId: z.string().optional(),
});

router.post(
  '/subjects/:subjectId/pending-files/ingest',
  requireRole('teacher', 'admin'),
  h(async (req, res) => {
    const subject = getSubjectOrThrow(String(req.params.subjectId));
    assertSubjectManage(subject, (req as AuthedRequest).user!);
    const parsed = ingestSchema.safeParse(req.body);
    if (!parsed.success) throw new HttpError(400, 'BAD_INPUT', 'Dữ liệu không hợp lệ');
    if (parsed.data.mode === 'existing-lecture') {
      if (!parsed.data.lectureId) throw new HttpError(400, 'BAD_INPUT', 'Thiếu bài giảng đích');
      const lecture = db.prepare('SELECT id FROM lectures WHERE id = ? AND class_id = ?').get(parsed.data.lectureId, subject.class_id);
      if (!lecture) throw new HttpError(400, 'BAD_INPUT', 'Bài giảng không hợp lệ');
    }

    const dir = path.join(DROP_DIR, subject.id);
    let pendingFilenames: Set<string>;
    let resolvedDropDir: string;
    try {
      pendingFilenames = new Set(readdirSync(dir));
      resolvedDropDir = realpathSync(dir);
    } catch {
      throw new HttpError(400, 'BAD_INPUT', 'Thư mục tài liệu chờ nhập không tồn tại');
    }
    const recordIngested = db.prepare('INSERT OR IGNORE INTO intake_ingested (subject_id, filename) VALUES (?, ?)');
    const maxOrder = db.prepare('SELECT COALESCE(MAX(sort_order), -1) AS m FROM lectures WHERE class_id = ?');
    const insertLecture = db.prepare('INSERT INTO lectures (id, class_id, subject_id, chapter, title, description, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?)');

    const created: { filename: string; lectureId: string; materialId: string }[] = [];
    const errors: { filename: string; error: string }[] = [];

    for (const filename of parsed.data.filenames) {
      try {
        if (path.basename(filename) !== filename || path.isAbsolute(filename) || !pendingFilenames.has(filename)) {
          throw new Error('Tệp không nằm trong thư mục chờ nhập của môn học');
        }
        const ext = path.extname(filename).toLowerCase();
        const meta = ALLOWED_EXT[ext];
        if (!meta) throw new Error(`Định dạng không hỗ trợ: ${ext}`);
        const sourcePath = path.join(dir, filename);
        const stat = statSync(sourcePath);
        const resolvedSource = realpathSync(sourcePath);
        const relativeSource = path.relative(resolvedDropDir, resolvedSource);
        if (relativeSource.startsWith('..') || path.isAbsolute(relativeSource) || !stat.isFile()) {
          throw new Error('Tệp không hợp lệ');
        }

        let lectureId = parsed.data.lectureId ?? '';
        const storedFilename = copyIntoMediaDir(sourcePath, filename);
        let materialId = '';
        try {
          tx(() => {
            if (parsed.data.mode === 'new-lecture-per-file') {
              lectureId = randomUUID();
              const order = (maxOrder.get(subject.class_id) as { m: number }).m + 1;
              insertLecture.run(lectureId, subject.class_id, subject.id, '', path.basename(filename, ext), '', order);
            }
            materialId = insertMaterial({
              lectureId,
              type: meta.type,
              title: path.basename(filename, ext),
              filePath: storedFilename,
              originalName: filename,
              mimeType: meta.mime,
              sizeBytes: stat.size,
            });
            recordIngested.run(subject.id, filename);
          });
        } catch (error) {
          try { unlinkSync(path.join(MEDIA_DIR, storedFilename)); } catch { /* best effort */ }
          throw error;
        }
        void maybeConvertPptx(lectureId, meta.type, storedFilename, filename, materialId);
        created.push({ filename, lectureId, materialId });
      } catch (err) {
        errors.push({ filename, error: err instanceof Error ? err.message : 'Lỗi không xác định' });
      }
    }

    res.json({ created, errors });
  })
);

export default router;

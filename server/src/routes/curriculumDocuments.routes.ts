import { Router } from 'express';
import multer from 'multer';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { existsSync, renameSync, unlinkSync } from 'node:fs';
import { db } from '../db/connection.js';
import { MEDIA_DIR } from '../config.js';
import { requireAuth, requireRole, type AuthedRequest } from '../middleware/auth.js';
import { h, HttpError } from '../utils/errors.js';
import { canManageClass, getClassOrThrow } from '../utils/access.js';
const router = Router(); router.use(requireAuth);
const upload = multer({ dest: MEDIA_DIR, limits: { fileSize: 30 * 1024 * 1024 } });
function access(classId: string, user: NonNullable<AuthedRequest['user']>) { const cls = getClassOrThrow(classId); if (!canManageClass(cls, user)) throw new HttpError(403, 'FORBIDDEN', 'Không có quyền'); return cls; }
router.get('/classes/:classId/curriculum-documents', h(async (req,res) => { const cls=access(String(req.params.classId),(req as AuthedRequest).user!); res.json({ documents: db.prepare('SELECT * FROM curriculum_documents WHERE class_id = ? ORDER BY created_at DESC').all(cls.id) }); }));
router.get('/curriculum-documents/:id/stream', h(async (req,res) => { const row=db.prepare('SELECT * FROM curriculum_documents WHERE id=?').get(String(req.params.id)) as {class_id:string;file_path:string;mime_type:string;title:string}|undefined; if(!row) throw new HttpError(404,'NOT_FOUND','Không tìm thấy'); access(row.class_id,(req as AuthedRequest).user!); const full=path.join(MEDIA_DIR,row.file_path); if(!existsSync(full)) throw new HttpError(404,'NOT_FOUND','Tệp không còn trên đĩa'); res.type(row.mime_type); res.sendFile(full); }));
router.post(
  '/classes/:classId/curriculum-documents',
  requireRole('teacher', 'admin'),
  upload.single('file'),
  h(async (req, res) => {
    const file = req.file;
    let movedPath: string | null = null;
    try {
      const cls = access(String(req.params.classId), (req as AuthedRequest).user!);
      const subjectId = String(req.body.subjectId || '');
      const ext = file ? path.extname(file.originalname).toLowerCase() : '';
      const validSubject = file && db.prepare('SELECT 1 FROM subjects WHERE id = ? AND class_id = ?').get(subjectId, cls.id);
      if (!file || !['.pdf', '.docx'].includes(ext) || !validSubject) {
        throw new HttpError(400, 'BAD_INPUT', 'Chọn môn học và tệp PDF/DOCX');
      }
      const stored = `${randomUUID()}${ext}`;
      movedPath = path.join(MEDIA_DIR, stored);
      renameSync(file.path, movedPath);
      const id = randomUUID();
      db.prepare('INSERT INTO curriculum_documents (id,class_id,subject_id,title,file_path,mime_type,size_bytes) VALUES (?,?,?,?,?,?,?)').run(
        id, cls.id, subjectId, String(req.body.title || path.basename(file.originalname, ext)), stored, file.mimetype, file.size
      );
      res.status(201).json({ id });
    } catch (error) {
      try { unlinkSync(movedPath ?? file?.path ?? ''); } catch { /* best effort */ }
      throw error;
    }
  })
);
router.delete('/curriculum-documents/:id', h(async (req,res) => { const row=db.prepare('SELECT * FROM curriculum_documents WHERE id=?').get(String(req.params.id)) as {class_id:string;file_path:string}|undefined; if(!row) throw new HttpError(404,'NOT_FOUND','Không tìm thấy'); access(row.class_id,(req as AuthedRequest).user!); try{unlinkSync(path.join(MEDIA_DIR,row.file_path));}catch{} db.prepare('DELETE FROM curriculum_documents WHERE id=?').run(String(req.params.id)); res.json({ok:true}); }));
export default router;

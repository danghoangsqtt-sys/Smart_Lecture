import { Router } from 'express';
import { z } from 'zod';
import { db } from '../db/connection.js';
import { requireAuth, requireRole, type AuthedRequest } from '../middleware/auth.js';
import { HttpError, h } from '../utils/errors.js';

const router = Router();
router.use(requireAuth);
router.use(requireRole('teacher', 'admin'));

interface MediaAuditRow {
  id: string;
  user_id: string;
  action: string;
  material_id: string | null;
  file_path: string | null;
  old_size: number | null;
  new_size: number | null;
  metadata: string;
  created_at: string;
}

router.get(
  '/',
  h(async (req, res) => {
    const user = (req as AuthedRequest).user!;
    const materialId = req.query.materialId as string | undefined;
    const action = req.query.action as string | undefined;
    const page = Math.max(1, Number(req.query.page ?? 1));
    const limit = Math.min(100, Math.max(1, Number(req.query.limit ?? 50)));
    const offset = (page - 1) * limit;

    let sql = `SELECT ma.*, u.display_name AS user_name FROM media_audit_log ma JOIN users u ON u.id = ma.user_id WHERE 1=1`;
    const params: (string | number)[] = [];

    if (user.role === 'teacher') {
      sql += ` AND ma.user_id = ?`;
      params.push(user.id);
    }
    if (materialId) {
      sql += ' AND ma.material_id = ?';
      params.push(materialId);
    }
    if (action) {
      sql += ' AND ma.action = ?';
      params.push(action);
    }
    sql += ' ORDER BY ma.created_at DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);

    const rows = db.prepare(sql).all(...params) as unknown as Array<MediaAuditRow & { user_name: string }>;
    const total = db.prepare(sql.replace('SELECT ma.*, u.display_name AS user_name', 'SELECT COUNT(*) AS c').replace(/ ORDER BY.*/, '')).get(...params.slice(0, -2)) as { c: number };

    res.json({
      logs: rows.map(r => ({
        id: r.id,
        userId: r.user_id,
        userName: r.user_name,
        action: r.action,
        materialId: r.material_id,
        filePath: r.file_path,
        oldSize: r.old_size,
        newSize: r.new_size,
        metadata: JSON.parse(r.metadata || '{}'),
        createdAt: r.created_at,
      })),
      pagination: { page, limit, total: total.c, totalPages: Math.ceil(total.c / limit) },
    });
  })
);

router.get(
  '/storage-summary',
  h(async (req, res) => {
    const user = (req as AuthedRequest).user!;
    let joins = '';
    let where = '';
    const params: (string | number)[] = [];
    if (user.role === 'teacher') {
      joins = ' JOIN lectures l ON l.id = m.lecture_id JOIN classes c ON c.id = l.class_id';
      where = ' WHERE c.teacher_id = ?';
      params.push(user.id);
    }
    const totalSize = db.prepare(`SELECT COALESCE(SUM(m.size_bytes), 0) AS total, COUNT(*) AS count FROM materials m${joins}${where}`).get(...params) as { total: number; count: number };
    const byType = db.prepare(`SELECT m.type, COUNT(*) AS count, COALESCE(SUM(m.size_bytes), 0) AS total FROM materials m${joins}${where} GROUP BY m.type`).all(...params) as { type: string; count: number; total: number }[];
    const recent = db.prepare(`SELECT ma.*, u.display_name AS user_name FROM media_audit_log ma JOIN users u ON u.id = ma.user_id${user.role === 'teacher' ? ' WHERE ma.user_id = ?' : ''} ORDER BY ma.created_at DESC LIMIT 10`).all(...params) as unknown as Array<MediaAuditRow & { user_name: string }>;

    res.json({
      totalFiles: totalSize.count,
      totalSizeBytes: totalSize.total,
      byType: byType.map(t => ({ type: t.type, count: t.count, sizeBytes: t.total })),
      recentActivity: recent.map(r => ({
        id: r.id,
        userName: r.user_name,
        action: r.action,
        materialId: r.material_id,
        filePath: r.file_path,
        oldSize: r.old_size,
        newSize: r.new_size,
        createdAt: r.created_at,
      })),
    });
  })
);

export default router;

import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { db, queryOne, toPublicUser } from '../db/connection.js';
import { requireAuth, requireRole, type AuthedRequest } from '../middleware/auth.js';
import { HttpError, h } from '../utils/errors.js';

const router = Router();
router.use(requireAuth);

const TEMP_PASSWORD = 'Hocvien@123';

function hashPassword(plain: string): string {
  return bcrypt.hashSync(plain, 10);
}

interface UserRowFull {
  id: string;
  username: string;
  display_name: string;
  role: string;
  status: string;
  created_by: string | null;
  failed_attempts: number;
}

router.get(
  '/users',
  requireRole('admin', 'teacher'),
  h(async (req, res) => {
    const authed = req as AuthedRequest;
    const role = req.query.role as string | undefined;
    const q = ((req.query.q as string) ?? '').trim();
    let sql = `SELECT id, username, display_name, role, status, created_by, failed_attempts FROM users WHERE 1=1`;
    const params: (string | number | null)[] = [];
    if (authed.user?.role === 'teacher') {
      sql += ` AND role = 'student' AND (created_by = ? OR id IN (SELECT student_id FROM enrollments e JOIN classes c ON c.id = e.class_id WHERE c.teacher_id = ?))`;
      params.push(authed.user.id, authed.user.id);
    } else if (role === 'teacher' || role === 'student' || role === 'admin') {
      sql += ' AND role = ?';
      params.push(role);
    }
    if (q) {
      sql += ' AND (username LIKE ? OR display_name LIKE ?)';
      params.push(`%${q}%`, `%${q}%`);
    }
    sql += ' ORDER BY created_at DESC LIMIT 500';
    const rows = db.prepare(sql).all(...params) as unknown as UserRowFull[];
    res.json({ users: rows.map((r) => ({ ...toPublicUser(r as never), failedAttempts: r.failed_attempts })) });
  })
);

const createUserBody = z.object({
  username: z.string().min(3).max(50).regex(/^[a-zA-Z0-9._-]+$/),
  password: z.string().min(6).max(200),
  role: z.enum(['teacher', 'student']),
  displayName: z.string().min(1).max(100),
});

export function insertUser(input: z.infer<typeof createUserBody>, creatorId: string): string {
  const exists = db.prepare('SELECT 1 FROM users WHERE username = ?').get(input.username);
  if (exists) throw new HttpError(409, 'USERNAME_EXISTS', `TÃªn Ä‘Äƒng nháº­p "${input.username}" Ä‘Ã£ tá»“n táº¡i`);
  const id = randomUUID();
  db.prepare(
    `INSERT INTO users (id, username, password_hash, role, display_name, must_change_password, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(id, input.username, hashPassword(input.password), input.role, input.displayName, input.role === 'student' ? 0 : 1, creatorId);
  return id;
}

router.post(
  '/users',
  requireRole('admin', 'teacher'),
  h(async (req, res) => {
    const authed = req as AuthedRequest;
    const parsed = createUserBody.safeParse(req.body);
    if (!parsed.success || !authed.user) {
      throw new HttpError(400, 'BAD_INPUT', parsed.success ? 'Lá»—i dá»¯ liá»‡u' : (parsed.error.issues[0]?.message ?? 'Dá»¯ liá»‡u khÃ´ng há»£p lá»‡'));
    }
    if (authed.user.role === 'teacher' && parsed.data.role === 'teacher') {
      throw new HttpError(403, 'FORBIDDEN', 'GiÃ¡o viÃªn chá»‰ Ä‘Æ°á»£c táº¡o tÃ i khoáº£n há»c viÃªn');
    }
    const id = insertUser(parsed.data, authed.user.id);
    const row = queryOne<UserRowFull>('SELECT * FROM users WHERE id = ?', id)!
    res.status(201).json({ user: toPublicUser(row as never) });
  })
);

const importSchema = z.object({
  rows: z
    .array(z.object({ username: z.string().trim(), displayName: z.string().trim() }))
    .min(1)
    .max(200),
});

router.post(
  '/users/import',
  requireRole('admin', 'teacher'),
  h(async (req, res) => {
    const authed = req as AuthedRequest;
    const parsed = importSchema.safeParse(req.body);
    if (!parsed.success || !authed.user) throw new HttpError(400, 'BAD_INPUT', 'Danh sÃ¡ch import khÃ´ng há»£p lá»‡');
    const created: string[] = [];
    const errors: { username: string; reason: string }[] = [];
    for (const row of parsed.data.rows.slice(0, 200)) {
      try {
        const username = row.username.replace(/\s+/g, '').toLowerCase();
        if (username.length < 3) throw new HttpError(400, 'BAD_INPUT', 'Username tá»‘i thiá»ƒu 3 kÃ½ tá»±');
        created.push(
          insertUser({ username, password: TEMP_PASSWORD, role: 'student', displayName: row.displayName }, authed.user.id)
        );
      } catch (err) {
        errors.push({ username: row.username, reason: err instanceof Error ? err.message : 'Lá»—i' });
      }
    }
    res.json({ createdCount: created.length, errors, tempPassword: TEMP_PASSWORD });
  })
);

router.patch(
  '/users/:id/status',
  requireRole('admin', 'teacher'),
  h(async (req, res) => {
    const authed = req as AuthedRequest;
    const target = db.prepare('SELECT * FROM users WHERE id = ?').get(String(req.params.id)) as UserRowFull | undefined;
    if (!target) throw new HttpError(404, 'NOT_FOUND', 'KhÃ´ng tÃ¬m tháº¥y ngÆ°á»i dÃ¹ng');
    if (authed.user?.role === 'teacher' && target.created_by !== authed.user.id && !isStudentOfTeacher(target.id, authed.user.id)) {
      throw new HttpError(403, 'FORBIDDEN', 'Chá»‰ Ä‘Æ°á»£c quáº£n lÃ½ há»c viÃªn cá»§a mÃ¬nh');
    }
    if (target.role === 'admin' && authed.user?.role !== 'admin') {
      throw new HttpError(403, 'FORBIDDEN', 'KhÃ´ng Ä‘á»§ quyá»n');
    }
    const status = target.status === 'locked' ? 'active' : 'locked';
    db.prepare('UPDATE users SET status = ?, failed_attempts = 0 WHERE id = ?').run(status, target.id);
    res.json({ status });
  })
);

const resetSchema = z.object({ newPassword: z.string().min(6).max(200) });

router.post(
  '/users/:id/reset-password',
  requireRole('admin', 'teacher'),
  h(async (req, res) => {
    const authed = req as AuthedRequest;
    const parsed = resetSchema.safeParse(req.body);
    if (!parsed.success) throw new HttpError(400, 'BAD_INPUT', 'Máº­t kháº©u tá»‘i thiá»ƒu 6 kÃ½ tá»±');
    const target = db.prepare('SELECT * FROM users WHERE id = ?').get(String(req.params.id)) as UserRowFull | undefined;
    if (!target) throw new HttpError(404, 'NOT_FOUND', 'KhÃ´ng tÃ¬m tháº¥y ngÆ°á»i dÃ¹ng');
    if (authed.user?.role === 'teacher' && target.created_by !== authed.user.id && !isStudentOfTeacher(target.id, authed.user.id)) {
      throw new HttpError(403, 'FORBIDDEN', 'Chá»‰ Ä‘Æ°á»£c quáº£n lÃ½ há»c viÃªn cá»§a mÃ¬nh');
    }
    db.prepare('UPDATE users SET password_hash = ?, failed_attempts = 0, must_change_password = 1 WHERE id = ?').run(
      hashPassword(parsed.data.newPassword),
      target.id
    );
    res.json({ ok: true });
  })
);

function isStudentOfTeacher(studentId: string, teacherId: string): boolean {
  return !!db
    .prepare('SELECT 1 FROM enrollments e JOIN classes c ON c.id = e.class_id WHERE e.student_id = ? AND c.teacher_id = ?')
    .get(studentId, teacherId);
}

export default router;

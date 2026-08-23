import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import jwt from 'jsonwebtoken';
import { randomUUID } from 'node:crypto';
import { JWT_EXPIRES_IN, JWT_SECRET } from '../config.js';
import { db, findUserByUsername, toPublicUser } from '../db/connection.js';
import { requireAuth, requireRole, type AuthedRequest } from '../middleware/auth.js';

const MAX_FAILED_ATTEMPTS = 10;

const router = Router();

const loginSchema = z.object({
  username: z.string().min(1).max(100),
  password: z.string().min(1).max(200),
});

router.post('/login', (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: { code: 'BAD_INPUT', message: 'Dữ liệu không hợp lệ' } });
    return;
  }
  const { username, password } = parsed.data;
  const row = findUserByUsername(username);
  if (!row) {
    res.status(401).json({ error: { code: 'BAD_CREDENTIALS', message: 'Sai tên đăng nhập hoặc mật khẩu' } });
    return;
  }
  if (row.status === 'locked') {
    res.status(403).json({ error: { code: 'LOCKED', message: 'Tài khoản đã bị khóa. Liên hệ quản trị viên.' } });
    return;
  }
  if (!bcrypt.compareSync(password, row.password_hash)) {
    const failed = row.failed_attempts + 1;
    const locked = failed >= MAX_FAILED_ATTEMPTS;
    db.prepare('UPDATE users SET failed_attempts = ?, status = ? WHERE id = ?').run(
      failed,
      locked ? 'locked' : 'active',
      row.id
    );
    res.status(401).json({
      error: {
        code: 'BAD_CREDENTIALS',
        message: locked ? 'Tài khoản bị khóa do nhập sai quá nhiều lần' : `Sai tên đăng nhập hoặc mật khẩu`,
      },
    });
    return;
  }
  db.prepare('UPDATE users SET failed_attempts = 0 WHERE id = ?').run(row.id);
  const token = jwt.sign({ sub: row.id }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
  res.json({ token, user: toPublicUser(row) });
});

router.get('/me', requireAuth, (req, res) => {
  res.json({ user: (req as AuthedRequest).user });
});

const changePasswordSchema = z.object({
  oldPassword: z.string().min(1),
  newPassword: z.string().min(6).max(200),
});

router.post('/change-password', requireAuth, (req, res) => {
  const authed = req as AuthedRequest;
  const parsed = changePasswordSchema.safeParse(req.body);
  if (!parsed.success || !authed.user) {
    res.status(400).json({ error: { code: 'BAD_INPUT', message: 'Mật khẩu mới tối thiểu 6 ký tự' } });
    return;
  }
  const row = findUserByUsername(authed.user.username);
  if (!row || !bcrypt.compareSync(parsed.data.oldPassword, row.password_hash)) {
    res.status(400).json({ error: { code: 'WRONG_OLD_PASSWORD', message: 'Mật khẩu hiện tại không đúng' } });
    return;
  }
  const hash = bcrypt.hashSync(parsed.data.newPassword, 10);
  db.prepare('UPDATE users SET password_hash = ?, must_change_password = 0 WHERE id = ?').run(hash, row.id);
  res.json({ ok: true });
});

const createUserSchema = z.object({
  username: z.string().min(3).max(50).regex(/^[a-zA-Z0-9._-]+$/, 'Chỉ cho phép chữ, số, dấu chấm, gạch'),
  password: z.string().min(6).max(200),
  role: z.enum(['teacher', 'student']),
  displayName: z.string().min(1).max(100),
});

router.post('/users', requireAuth, requireRole('admin', 'teacher'), (req, res) => {
  const authed = req as AuthedRequest;
  const parsed = createUserSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: { code: 'BAD_INPUT', message: parsed.error.issues[0]?.message ?? 'Dữ liệu không hợp lệ' } });
    return;
  }
  const { username, password, role, displayName } = parsed.data;
  if (authed.user?.role === 'teacher' && role === 'teacher') {
    res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Giáo viên chỉ được tạo tài khoản học viên' } });
    return;
  }
  if (findUserByUsername(username)) {
    res.status(409).json({ error: { code: 'USERNAME_EXISTS', message: 'Tên đăng nhập đã tồn tại' } });
    return;
  }
  const hash = bcrypt.hashSync(password, 10);
  const id = randomUUID();
  db.prepare(
    `INSERT INTO users (id, username, password_hash, role, display_name, must_change_password, created_by)
     VALUES (?, ?, ?, ?, ?, 1, ?)`
  ).run(id, username, hash, role, displayName, authed.user?.id ?? null);
  const created = findUserByUsername(username);
  res.status(201).json({ user: created ? toPublicUser(created) : null });
});

export default router;

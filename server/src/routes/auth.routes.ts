import { Router, type Request, type Response } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import jwt from 'jsonwebtoken';
import rateLimit from 'express-rate-limit';
import { randomUUID } from 'node:crypto';
import { JWT_EXPIRES_IN, JWT_SECRET } from '../config.js';
import { db, findUserByUsername, toPublicUser, type UserRow } from '../db/connection.js';
import { requireAuth, requireRole, type AuthedRequest } from '../middleware/auth.js';
import { clearSessionCookie, setSessionCookie } from '../auth/sessionCookie.js';
import { rejectCrossHostOriginWhenPresent } from '../middleware/csrf.js';
import { createStudentAccount } from '../services/studentAccounts.js';
import { h, HttpError } from '../utils/errors.js';

const MAX_FAILED_ATTEMPTS = 10;
const BAD_CREDENTIALS = { error: { code: 'BAD_CREDENTIALS', message: 'Sai tên đăng nhập hoặc mật khẩu' } } as const;

const router = Router();

function sendSession(req: Request, res: Response, row: UserRow): void {
  const token = jwt.sign({ sub: row.id, sv: row.session_version }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
  setSessionCookie(res, token);
  const response = req.headers.origin ? { user: toPublicUser(row) } : { token, user: toPublicUser(row) };
  res.json(response);
}

// Per-account lockout (MAX_FAILED_ATTEMPTS) only stops repeated guesses against
// ONE username. Nothing else stopped a single LAN device from cycling through
// many different usernames — e.g. the sequential student-import usernames this
// app itself generates (hv2024001, hv2024002, ...) — and permanently locking an
// entire class right before an exam. This limits failed attempts per source IP;
// successful logins never count against it, so normal classroom traffic (many
// students logging in correctly from many devices) is unaffected.
// The default limiter key is req.ip, which is socket-derived on direct LAN and
// proxy-derived only from explicitly trusted immediate proxy addresses.
const loginRateLimit = rateLimit({
  windowMs: 15 * 60_000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  message: { error: { code: 'RATE_LIMITED', message: 'Quá nhiều lần đăng nhập sai từ thiết bị này, thử lại sau ít phút' } },
});

const loginSchema = z.object({
  username: z.string().min(1).max(100),
  password: z.string().min(1).max(200),
});

router.post('/login', rejectCrossHostOriginWhenPresent, loginRateLimit, (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: { code: 'BAD_INPUT', message: 'Dữ liệu không hợp lệ' } });
    return;
  }
  const { username, password } = parsed.data;
  const row = findUserByUsername(username);
  if (!row) {
    res.status(401).json(BAD_CREDENTIALS);
    return;
  }
  if (row.status === 'locked') {
    res.status(401).json(BAD_CREDENTIALS);
    return;
  }
  if (!bcrypt.compareSync(password, row.password_hash)) {
    const failed = row.failed_attempts + 1;
    const locked = failed >= MAX_FAILED_ATTEMPTS;
    db.prepare(`UPDATE users
      SET failed_attempts = ?, status = ?,
          session_version = session_version + CASE WHEN status <> ? THEN 1 ELSE 0 END
      WHERE id = ?`).run(
      failed,
      locked ? 'locked' : 'active',
      locked ? 'locked' : 'active',
      row.id
    );
    res.status(401).json(BAD_CREDENTIALS);
    return;
  }
  db.prepare('UPDATE users SET failed_attempts = 0 WHERE id = ?').run(row.id);
  sendSession(req, res, row);
});

router.post('/logout', (req, res) => {
  clearSessionCookie(res);
  res.json({ ok: true });
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
  db.prepare(`UPDATE users
    SET password_hash = ?, must_change_password = 0, failed_attempts = 0, session_version = session_version + 1
    WHERE id = ?`).run(hash, row.id);
  const updated = findUserByUsername(row.username)!;
  sendSession(req, res, updated);
});

const createUserSchema = z.object({
  username: z.string().min(3).max(50).regex(/^[a-zA-Z0-9._-]+$/, 'Chỉ cho phép chữ, số, dấu chấm, gạch'),
  password: z.string().min(6).max(200),
  role: z.enum(['teacher', 'student']),
  displayName: z.string().min(1).max(100),
  studentCode: z.string().trim().optional(),
  classId: z.string().trim().optional(),
});

router.post('/users', requireAuth, requireRole('admin', 'teacher'), h(async (req, res) => {
  const authed = req as AuthedRequest;
  const parsed = createUserSchema.safeParse(req.body);
  if (!parsed.success || !authed.user) throw new HttpError(400, 'BAD_INPUT', parsed.success ? 'Dữ liệu không hợp lệ' : parsed.error.issues[0]?.message ?? 'Dữ liệu không hợp lệ');
  const { username, password, role, displayName, studentCode, classId } = parsed.data;
  if (authed.user?.role === 'teacher' && role === 'teacher') {
    throw new HttpError(403, 'FORBIDDEN', 'Giáo viên chỉ được tạo tài khoản học viên');
  }
  if (role === 'student') {
    const created = createStudentAccount({ username, password, displayName, studentCode: studentCode ?? '', classId: classId ?? '' }, authed.user);
    const row = db.prepare('SELECT * FROM users WHERE id = ?').get(created.id) as UserRow;
    res.status(201).json({ user: toPublicUser(row) });
    return;
  }
  if (db.prepare('SELECT 1 FROM users WHERE lower(trim(username)) = lower(trim(?))').get(username)) {
    throw new HttpError(409, 'USERNAME_EXISTS', 'Tên đăng nhập đã tồn tại');
  }
  const hash = bcrypt.hashSync(password, 10);
  const id = randomUUID();
  db.prepare(
    `INSERT INTO users (id, username, password_hash, role, display_name, must_change_password, created_by)
     VALUES (?, ?, ?, ?, ?, 1, ?)`
  ).run(id, username, hash, role, displayName, authed.user.id);
  const created = findUserByUsername(username);
  res.status(201).json({ user: created ? toPublicUser(created) : null });
}));

export default router;

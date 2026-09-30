import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { db, queryOne, toPublicUser } from '../db/connection.js';
import { requireAuth, requireRole, type AuthedRequest } from '../middleware/auth.js';
import { HttpError, h } from '../utils/errors.js';
import { generateTemporaryPassword, type OneTimeCredential } from '../auth/temporaryCredentials.js';
import { createStudentAccount } from '../services/studentAccounts.js';
import { previewStudentRemoval, removeStudent, transferStudent } from '../services/studentAccountLifecycle.js';
import { disconnectUserSockets } from '../realtime/gameRoom.js';

const router = Router();
router.use(requireAuth);

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
  student_code: string | null;
  dob: string | null;
  gender: string | null;
  hometown: string | null;
  home_class_id?: string | null;
  home_class_name?: string | null;
  home_class_count?: number;
  archived_at?: string | null;
}

router.get(
  '/users',
  requireRole('admin', 'teacher'),
  h(async (req, res) => {
    const authed = req as AuthedRequest;
    const role = req.query.role as string | undefined;
    const q = ((req.query.q as string) ?? '').trim();
    let sql = `SELECT id, username, display_name, role, status, created_by, failed_attempts, student_code, dob, gender, hometown, archived_at,
      (SELECT COUNT(*) FROM enrollments e WHERE e.student_id = users.id) AS home_class_count,
      (SELECT e.class_id FROM enrollments e WHERE e.student_id = users.id LIMIT 1) AS home_class_id,
      (SELECT c.name FROM enrollments e JOIN classes c ON c.id = e.class_id WHERE e.student_id = users.id LIMIT 1) AS home_class_name
      FROM users WHERE 1=1`;
    const params: (string | number | null)[] = [];
    if (req.query.includeArchived !== '1') sql += ' AND archived_at IS NULL';
    if (authed.user?.role === 'teacher') {
      sql += ` AND role = 'student' AND created_by = ?`;
      params.push(authed.user.id);
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
    res.json({ users: rows.map((r) => ({
      ...toPublicUser(r as never), failedAttempts: r.failed_attempts,
      archivedAt: r.archived_at ?? null,
      homeClassId: r.home_class_count === 1 ? r.home_class_id : null,
      homeClassName: (r.home_class_count ?? 0) > 1 ? 'Nhiều lớp (dữ liệu cũ)' : r.home_class_name ?? null,
    })) });
  })
);

const createUserBody = z.object({
  username: z.string().min(3).max(50).regex(/^[a-zA-Z0-9._-]+$/),
  password: z.string().min(6).max(200),
  role: z.enum(['teacher', 'student']),
  displayName: z.string().min(1).max(100),
  studentCode: z.string().trim().max(50).optional(),
  classId: z.string().trim().optional(),
  dob: z.string().trim().max(20).optional(),
  gender: z.string().trim().max(20).optional(),
  hometown: z.string().trim().max(200).optional(),
});

function insertTeacher(input: z.infer<typeof createUserBody>, creatorId: string): string {
  const username = input.username;
  const exists = db.prepare('SELECT 1 FROM users WHERE lower(trim(username)) = lower(trim(?))').get(username);
  if (exists) throw new HttpError(409, 'USERNAME_EXISTS', `Tên đăng nhập "${input.username}" đã tồn tại`);
  const id = randomUUID();
  db.prepare(
    `INSERT INTO users (id, username, password_hash, role, display_name, must_change_password, created_by, student_code, dob, gender, hometown)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    username,
    hashPassword(input.password),
    input.role,
    input.displayName,
    1,
    creatorId,
    null,
    input.dob ?? null,
    input.gender ?? null,
    input.hometown ?? null
  );
  return id;
}

router.post(
  '/users',
  requireRole('admin', 'teacher'),
  h(async (req, res) => {
    const authed = req as AuthedRequest;
    const parsed = createUserBody.safeParse(req.body);
    if (!parsed.success || !authed.user) {
      throw new HttpError(400, 'BAD_INPUT', parsed.success ? 'Lỗi dữ liệu' : (parsed.error.issues[0]?.message ?? 'Dữ liệu không hợp lệ'));
    }
    if (authed.user.role === 'teacher' && parsed.data.role === 'teacher') {
      throw new HttpError(403, 'FORBIDDEN', 'Giáo viên chỉ được tạo tài khoản học viên');
    }
    const id = parsed.data.role === 'student'
      ? createStudentAccount({ ...parsed.data, studentCode: parsed.data.studentCode ?? '', classId: parsed.data.classId ?? '' }, authed.user).id
      : insertTeacher(parsed.data, authed.user.id);
    const row = queryOne<UserRowFull>('SELECT * FROM users WHERE id = ?', id)!
    res.status(201).json({ user: toPublicUser(row as never) });
  })
);

const importUsersBody = z.object({
  rows: z.array(z.object({
    username: z.string().min(3).max(50).regex(/^[a-zA-Z0-9._-]+$/),
    displayName: z.string().min(1).max(100),
    password: z.string().min(6).max(200).optional(),
    studentCode: z.string().trim().max(50).optional(),
    classId: z.string().trim().optional(),
    dob: z.string().trim().max(20).optional(),
    gender: z.string().trim().max(20).optional(),
    hometown: z.string().trim().max(200).optional(),
  })).min(1).max(500),
});

router.post(
  '/users/import',
  requireRole('admin', 'teacher'),
  h(async (req, res) => {
    const authed = req as AuthedRequest;
    const parsed = importUsersBody.parse(req.body);
    const ids: string[] = [];
    const credentials: OneTimeCredential[] = [];
    const errors: { row: number; username: string; message: string }[] = [];
    parsed.rows.forEach((row, index) => {
      try {
        const temporaryPassword = row.password ?? generateTemporaryPassword();
        const created = createStudentAccount({ ...row, password: temporaryPassword, studentCode: row.studentCode ?? '', classId: row.classId ?? '' }, authed.user!);
        const id = created.id;
        ids.push(id);
        credentials.push({ id, username: created.username, temporaryPassword });
      } catch (error) {
        errors.push({ row: index + 1, username: row.username, message: error instanceof Error ? error.message : 'Không thể tạo học viên' });
      }
    });
    res.set('Cache-Control', 'private, no-store');
    res.status(ids.length > 0 ? 201 : 400).json({ createdCount: ids.length, ids, credentials, errors });
  })
);

const profileSchema = z.object({
  displayName: z.string().trim().min(1).max(100).optional(),
  studentCode: z.string().trim().min(1).max(50).optional(),
  dob: z.string().trim().max(20).optional(),
  gender: z.string().trim().max(20).optional(),
  hometown: z.string().trim().max(200).optional(),
});

router.patch(
  '/users/:id/profile',
  requireRole('admin', 'teacher'),
  h(async (req, res) => {
    const authed = req as AuthedRequest;
    const parsed = profileSchema.safeParse(req.body);
    if (!parsed.success) throw new HttpError(400, 'BAD_INPUT', parsed.error.issues[0]?.message ?? 'Dữ liệu không hợp lệ');
    const target = db.prepare('SELECT * FROM users WHERE id = ?').get(String(req.params.id)) as UserRowFull | undefined;
    if (!target) throw new HttpError(404, 'NOT_FOUND', 'Không tìm thấy người dùng');
    if (authed.user?.role === 'teacher' && (target.role !== 'student' || target.created_by !== authed.user.id)) {
      throw new HttpError(403, 'FORBIDDEN', 'Chỉ được quản lý học viên của mình');
    }
    if (target.archived_at) throw new HttpError(409, 'STUDENT_ARCHIVED', 'Tài khoản đã lưu trữ');
    const studentCode = parsed.data.studentCode?.trim();
    if (target.role === 'student' && studentCode && db.prepare("SELECT 1 FROM users WHERE id <> ? AND role = 'student' AND upper(trim(student_code)) = upper(trim(?))").get(target.id, studentCode)) {
      throw new HttpError(409, 'STUDENT_CODE_EXISTS', `Mã học viên "${studentCode}" đã tồn tại`);
    }
    db.prepare(
      `UPDATE users SET display_name = COALESCE(?, display_name), student_code = COALESCE(?, student_code),
       dob = COALESCE(?, dob), gender = COALESCE(?, gender), hometown = COALESCE(?, hometown) WHERE id = ?`
    ).run(
      parsed.data.displayName ?? null,
      parsed.data.studentCode ?? null,
      parsed.data.dob ?? null,
      parsed.data.gender ?? null,
      parsed.data.hometown ?? null,
      target.id
    );
    const row = queryOne<UserRowFull>('SELECT * FROM users WHERE id = ?', target.id)!;
    res.json({ user: toPublicUser(row as never) });
  })
);

router.patch(
  '/users/:id/status',
  requireRole('admin', 'teacher'),
  h(async (req, res) => {
    const authed = req as AuthedRequest;
    const target = db.prepare('SELECT * FROM users WHERE id = ?').get(String(req.params.id)) as UserRowFull | undefined;
    if (!target) throw new HttpError(404, 'NOT_FOUND', 'Không tìm thấy người dùng');
    if (authed.user?.role === 'teacher' && (target.role !== 'student' || target.created_by !== authed.user.id)) {
      throw new HttpError(403, 'FORBIDDEN', 'Chỉ được quản lý học viên của mình');
    }
    if (target.archived_at) throw new HttpError(409, 'STUDENT_ARCHIVED', 'Tài khoản đã lưu trữ');
    if (target.role === 'admin' && authed.user?.role !== 'admin') {
      throw new HttpError(403, 'FORBIDDEN', 'Không đủ quyền');
    }
    const status = target.status === 'locked' ? 'active' : 'locked';
    db.prepare('UPDATE users SET status = ?, failed_attempts = 0, session_version = session_version + 1 WHERE id = ?').run(status, target.id);
    if (status === 'locked') disconnectUserSockets(target.id);
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
    if (!parsed.success) throw new HttpError(400, 'BAD_INPUT', 'Mật khẩu tối thiểu 6 ký tự');
    const target = db.prepare('SELECT * FROM users WHERE id = ?').get(String(req.params.id)) as UserRowFull | undefined;
    if (!target) throw new HttpError(404, 'NOT_FOUND', 'Không tìm thấy người dùng');
    if (authed.user?.role === 'teacher' && (target.role !== 'student' || target.created_by !== authed.user.id)) {
      throw new HttpError(403, 'FORBIDDEN', 'Chỉ được quản lý học viên của mình');
    }
    if (target.archived_at) throw new HttpError(409, 'STUDENT_ARCHIVED', 'Tài khoản đã lưu trữ');
    db.prepare(`UPDATE users
      SET password_hash = ?, failed_attempts = 0, must_change_password = 1, session_version = session_version + 1
      WHERE id = ?`).run(
      hashPassword(parsed.data.newPassword),
      target.id
    );
    disconnectUserSockets(target.id);
    res.json({ ok: true });
  })
);

router.get('/users/:id/removal-preview', requireRole('admin', 'teacher'), h(async (req, res) => {
  res.set('Cache-Control', 'private, no-store');
  res.json(previewStudentRemoval((req as AuthedRequest).user!, String(req.params.id)));
}));

router.post('/users/:id/transfer', requireRole('admin', 'teacher'), h(async (req, res) => {
  const parsed = z.object({ classId: z.string().uuid() }).safeParse(req.body);
  if (!parsed.success) throw new HttpError(400, 'BAD_INPUT', 'Cần chọn lớp đích hợp lệ');
  const result = transferStudent((req as AuthedRequest).user!, String(req.params.id), parsed.data.classId);
  disconnectUserSockets(String(req.params.id));
  res.set('Cache-Control', 'private, no-store');
  res.json(result);
}));

router.delete('/users/:id', requireRole('admin', 'teacher'), h(async (req, res) => {
  const parsed = z.object({ expectedAction: z.enum(['delete', 'archive']) }).safeParse(req.body);
  if (!parsed.success) throw new HttpError(400, 'BAD_INPUT', 'Cần xem trước và xác nhận cách xử lý tài khoản');
  const result = removeStudent((req as AuthedRequest).user!, String(req.params.id), parsed.data.expectedAction);
  disconnectUserSockets(String(req.params.id));
  res.set('Cache-Control', 'private, no-store');
  res.json(result);
}));

export default router;

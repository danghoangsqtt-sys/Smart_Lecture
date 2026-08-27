import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { db, queryOne, toPublicUser } from '../db/connection.js';
import { requireAuth, requireRole, type AuthedRequest } from '../middleware/auth.js';
import { HttpError, h } from '../utils/errors.js';

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
}

router.get(
  '/users',
  requireRole('admin', 'teacher'),
  h(async (req, res) => {
    const authed = req as AuthedRequest;
    const role = req.query.role as string | undefined;
    const q = ((req.query.q as string) ?? '').trim();
    let sql = `SELECT id, username, display_name, role, status, created_by, failed_attempts, student_code, dob, gender, hometown FROM users WHERE 1=1`;
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
  studentCode: z.string().trim().max(50).optional(),
  dob: z.string().trim().max(20).optional(),
  gender: z.string().trim().max(20).optional(),
  hometown: z.string().trim().max(200).optional(),
});

export function insertUser(input: z.infer<typeof createUserBody>, creatorId: string): string {
  const exists = db.prepare('SELECT 1 FROM users WHERE username = ?').get(input.username);
  if (exists) throw new HttpError(409, 'USERNAME_EXISTS', `Tên đăng nhập "${input.username}" đã tồn tại`);
  const id = randomUUID();
  db.prepare(
    `INSERT INTO users (id, username, password_hash, role, display_name, must_change_password, created_by, student_code, dob, gender, hometown)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    input.username,
    hashPassword(input.password),
    input.role,
    input.displayName,
    input.role === 'student' ? 0 : 1,
    creatorId,
    input.studentCode ?? null,
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
    const id = insertUser(parsed.data, authed.user.id);
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
    const errors: { row: number; username: string; message: string }[] = [];
    parsed.rows.forEach((row, index) => {
      try {
        ids.push(insertUser({ ...row, password: row.password ?? 'Hocvien@123', role: 'student' }, authed.user!.id));
      } catch (error) {
        errors.push({ row: index + 1, username: row.username, message: error instanceof Error ? error.message : 'Không thể tạo học viên' });
      }
    });
    res.status(ids.length > 0 ? 201 : 400).json({ createdCount: ids.length, ids, errors });
  })
);

const profileSchema = z.object({
  displayName: z.string().trim().min(1).max(100).optional(),
  studentCode: z.string().trim().max(50).optional(),
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
    if (authed.user?.role === 'teacher' && target.created_by !== authed.user.id && !isStudentOfTeacher(target.id, authed.user.id)) {
      throw new HttpError(403, 'FORBIDDEN', 'Chỉ được quản lý học viên của mình');
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
    if (authed.user?.role === 'teacher' && target.created_by !== authed.user.id && !isStudentOfTeacher(target.id, authed.user.id)) {
      throw new HttpError(403, 'FORBIDDEN', 'Chỉ được quản lý học viên của mình');
    }
    if (target.role === 'admin' && authed.user?.role !== 'admin') {
      throw new HttpError(403, 'FORBIDDEN', 'Không đủ quyền');
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
    if (!parsed.success) throw new HttpError(400, 'BAD_INPUT', 'Mật khẩu tối thiểu 6 ký tự');
    const target = db.prepare('SELECT * FROM users WHERE id = ?').get(String(req.params.id)) as UserRowFull | undefined;
    if (!target) throw new HttpError(404, 'NOT_FOUND', 'Không tìm thấy người dùng');
    if (authed.user?.role === 'teacher' && target.created_by !== authed.user.id && !isStudentOfTeacher(target.id, authed.user.id)) {
      throw new HttpError(403, 'FORBIDDEN', 'Chỉ được quản lý học viên của mình');
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

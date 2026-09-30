import bcrypt from 'bcryptjs';
import { randomUUID } from 'node:crypto';
import { db, recordHomeClassStart } from '../db/connection.js';
import { HttpError } from '../utils/errors.js';

type Creator = { id: string; role: string };

type AccountInput = {
  username: string;
  password: string;
  displayName: string;
};

export type StudentAccountInput = AccountInput & {
  studentCode: string;
  classId: string;
  dob?: string;
  gender?: string;
  hometown?: string;
};

type ClassOwnerRow = { id: string; teacher_id: string; archived: number };
type StudentRow = { id: string; role: string; status: string; student_code: string | null; created_by: string | null };

function normalizedUsername(username: string): string {
  const value = username.trim().toLowerCase();
  if (!/^[a-z0-9._-]{3,50}$/.test(value)) throw new HttpError(400, 'BAD_INPUT', 'Tên đăng nhập học viên không hợp lệ');
  return value;
}

function normalizedCode(code: string): string {
  const value = code.trim();
  if (!value || value.length > 50) throw new HttpError(400, 'STUDENT_CODE_REQUIRED', 'Cần nhập mã học viên');
  return value;
}

function checkClass(classId: string, creator: Creator): ClassOwnerRow {
  const cls = db.prepare('SELECT id, teacher_id, archived FROM classes WHERE id = ?').get(classId) as ClassOwnerRow | undefined;
  if (!cls) throw new HttpError(404, 'CLASS_NOT_FOUND', 'Không tìm thấy lớp biên chế');
  if (creator.role !== 'admin' && (creator.role !== 'teacher' || cls.teacher_id !== creator.id)) {
    throw new HttpError(403, 'FORBIDDEN', 'Chỉ được tạo hoặc thêm học viên vào lớp của mình');
  }
  if (cls.archived === 1) throw new HttpError(409, 'CLASS_ARCHIVED', 'Không thể thêm học viên vào lớp đã lưu trữ');
  return cls;
}

function mapWriteError(error: unknown): never {
  if (error instanceof HttpError) throw error;
  const message = error instanceof Error ? error.message : '';
  if (/roster_username_duplicate|ux_users_username_ci|users\.username/.test(message)) {
    throw new HttpError(409, 'USERNAME_EXISTS', 'Tên đăng nhập đã tồn tại');
  }
  if (/roster_student_code_duplicate|ux_users_student_code_ci/.test(message)) {
    throw new HttpError(409, 'STUDENT_CODE_EXISTS', 'Mã học viên đã tồn tại');
  }
  if (/roster_student_already_in_class|ux_enrollments_one_class|ux_student_home_open/.test(message)) {
    throw new HttpError(409, 'STUDENT_ALREADY_IN_CLASS', 'Học viên đã thuộc lớp biên chế khác');
  }
  if (/SQLITE_BUSY|database is locked/.test(message)) {
    throw new HttpError(503, 'DATABASE_BUSY', 'Dữ liệu đang được cập nhật; vui lòng thử lại');
  }
  throw error;
}

function immediateTransaction<T>(work: () => T): T {
  try {
    db.exec('BEGIN IMMEDIATE');
  } catch (error) {
    mapWriteError(error);
  }
  try {
    const result = work();
    db.exec('COMMIT');
    return result;
  } catch (error) {
    if (db.isTransaction) db.exec('ROLLBACK');
    mapWriteError(error);
  }
}

export function createStudentAccount(input: StudentAccountInput, creator: Creator): { id: string; username: string } {
  const username = normalizedUsername(input.username);
  const studentCode = normalizedCode(input.studentCode);
  if (!input.classId?.trim()) throw new HttpError(400, 'CLASS_REQUIRED', 'Cần chọn lớp biên chế');
  if (!input.displayName.trim() || input.displayName.length > 100 || input.password.length < 6 || input.password.length > 200) {
    throw new HttpError(400, 'BAD_INPUT', 'Thông tin học viên không hợp lệ');
  }
  const passwordHash = bcrypt.hashSync(input.password, 10);
  return immediateTransaction(() => {
    checkClass(input.classId, creator);
    if (db.prepare('SELECT 1 FROM users WHERE lower(trim(username)) = ?').get(username)) {
      throw new HttpError(409, 'USERNAME_EXISTS', 'Tên đăng nhập đã tồn tại');
    }
    if (db.prepare("SELECT 1 FROM users WHERE role = 'student' AND upper(trim(student_code)) = upper(trim(?))").get(studentCode)) {
      throw new HttpError(409, 'STUDENT_CODE_EXISTS', 'Mã học viên đã tồn tại');
    }
    const id = randomUUID();
    db.prepare(`INSERT INTO users
      (id, username, password_hash, role, display_name, must_change_password, created_by, student_code, dob, gender, hometown)
      VALUES (?, ?, ?, 'student', ?, 1, ?, ?, ?, ?, ?)`)
      .run(id, username, passwordHash, input.displayName.trim(), creator.id, studentCode,
        input.dob?.trim() || null, input.gender?.trim() || null, input.hometown?.trim() || null);
    db.prepare('INSERT INTO enrollments (class_id, student_id) VALUES (?, ?)').run(input.classId, id);
    recordHomeClassStart(id, input.classId);
    return { id, username };
  });
}

function enrollOneInTransaction(studentId: string, classId: string, creator: Creator): boolean {
  const student = db.prepare('SELECT id, role, status, student_code, created_by FROM users WHERE id = ?').get(studentId) as StudentRow | undefined;
  if (!student || student.role !== 'student') throw new HttpError(404, 'STUDENT_NOT_FOUND', 'Không tìm thấy học viên');
  if (creator.role === 'teacher' && student.created_by !== creator.id) {
    throw new HttpError(403, 'FORBIDDEN', 'Chỉ được quản lý học viên do mình tạo');
  }
  if (student.status !== 'active') throw new HttpError(409, 'STUDENT_LOCKED', 'Tài khoản học viên đang bị khóa');
  if (!student.student_code?.trim()) throw new HttpError(409, 'STUDENT_CODE_REQUIRED', 'Học viên cần có mã trước khi ghi danh');
  const current = db.prepare('SELECT class_id FROM enrollments WHERE student_id = ?').all(studentId) as { class_id: string }[];
  if (current.some((row) => row.class_id !== classId)) throw new HttpError(409, 'STUDENT_ALREADY_IN_CLASS', 'Học viên đã thuộc lớp biên chế khác');
  if (current.length) return false;
  db.prepare('INSERT INTO enrollments (class_id, student_id) VALUES (?, ?)').run(classId, studentId);
  recordHomeClassStart(studentId, classId);
  return true;
}

export function enrollExistingStudents(studentIds: string[], classId: string, creator: Creator): number {
  if (!classId?.trim()) throw new HttpError(400, 'CLASS_REQUIRED', 'Cần chọn lớp biên chế');
  return immediateTransaction(() => {
    checkClass(classId, creator);
    let added = 0;
    for (const studentId of studentIds) if (enrollOneInTransaction(studentId, classId, creator)) added++;
    return added;
  });
}

export function enrollExistingStudent(studentId: string, classId: string, creator: Creator): boolean {
  return enrollExistingStudents([studentId], classId, creator) === 1;
}

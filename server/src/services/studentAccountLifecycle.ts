import { db, recordHomeClassStart } from '../db/connection.js';
import { HttpError } from '../utils/errors.js';

type Actor = { id: string; role: string };
type Student = { id: string; role: string; created_by: string | null; archived_at: string | null };
type ClassRow = { id: string; teacher_id: string; archived: number };
export type RemovalAction = 'delete' | 'archive';

function studentFor(actor: Actor, studentId: string): Student {
  const student = db.prepare('SELECT id, role, created_by, archived_at FROM users WHERE id = ?').get(studentId) as Student | undefined;
  if (!student || student.role !== 'student') throw new HttpError(404, 'STUDENT_NOT_FOUND', 'Không tìm thấy học viên');
  if (actor.role === 'teacher' && student.created_by !== actor.id) {
    throw new HttpError(403, 'FORBIDDEN', 'Chỉ được xử lý học viên do mình tạo');
  }
  return student;
}

function classFor(actor: Actor, classId: string, target: boolean): ClassRow {
  const cls = db.prepare('SELECT id, teacher_id, archived FROM classes WHERE id = ?').get(classId) as ClassRow | undefined;
  if (!cls) throw new HttpError(404, 'CLASS_NOT_FOUND', 'Không tìm thấy lớp');
  if (actor.role === 'teacher' && cls.teacher_id !== actor.id) throw new HttpError(403, 'FORBIDDEN', 'Chỉ được quản lý lớp của mình');
  if (target && cls.archived === 1) throw new HttpError(409, 'CLASS_ARCHIVED', 'Không thể chuyển đến lớp đã lưu trữ');
  return cls;
}

function transaction<T>(work: () => T): T {
  try {
    db.exec('BEGIN IMMEDIATE');
    const result = work();
    db.exec('COMMIT');
    return result;
  } catch (error) {
    if (db.isTransaction) db.exec('ROLLBACK');
    if (error instanceof Error && /SQLITE_BUSY|database is locked/.test(error.message)) {
      throw new HttpError(503, 'DATABASE_BUSY', 'Dữ liệu đang được cập nhật; vui lòng thử lại');
    }
    throw error;
  }
}

export function transferStudent(actor: Actor, studentId: string, targetClassId: string): { fromClassId: string; toClassId: string } {
  return transaction(() => {
    const student = studentFor(actor, studentId);
    if (student.archived_at) throw new HttpError(409, 'STUDENT_ARCHIVED', 'Tài khoản đã lưu trữ');
    const current = db.prepare('SELECT class_id FROM enrollments WHERE student_id = ?').all(studentId) as { class_id: string }[];
    if (current.length !== 1) throw new HttpError(409, 'ROSTER_CONFLICT', 'Học viên chưa có đúng một lớp; cần rà soát dữ liệu cũ');
    const fromClassId = current[0]!.class_id;
    classFor(actor, fromClassId, false);
    classFor(actor, targetClassId, true);
    if (fromClassId === targetClassId) throw new HttpError(409, 'SAME_CLASS', 'Học viên đã thuộc lớp này');
    const openHistory = db.prepare('SELECT class_id FROM student_home_class_history WHERE student_id = ? AND ended_at IS NULL').all(studentId) as { class_id: string }[];
    if (openHistory.length !== 1 || openHistory[0]!.class_id !== fromClassId) {
      throw new HttpError(409, 'ROSTER_CONFLICT', 'Lịch sử lớp chưa khớp; cần rà soát dữ liệu cũ');
    }
    db.prepare('DELETE FROM enrollments WHERE student_id = ? AND class_id = ?').run(studentId, fromClassId);
    db.prepare('INSERT INTO enrollments (class_id, student_id) VALUES (?, ?)').run(targetClassId, studentId);
    recordHomeClassStart(studentId, targetClassId);
    db.prepare('UPDATE users SET session_version = session_version + 1 WHERE id = ?').run(studentId);
    return { fromClassId, toClassId: targetClassId };
  });
}

function learningReferenceCount(studentId: string): number {
  // The schema has several ON DELETE CASCADE references to users. Inspect the
  // actual migrated schema so a future learning table cannot be silently lost.
  const tables = db.prepare("SELECT name FROM sqlite_schema WHERE type = 'table' AND name NOT LIKE 'sqlite_%'").all() as { name: string }[];
  let count = 0;
  for (const { name } of tables) {
    if (name === 'enrollments' || name === 'student_home_class_history') continue;
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) throw new HttpError(409, 'UNSAFE_SCHEMA', 'Cấu trúc dữ liệu cần rà soát trước khi xóa');
    const references = db.prepare(`PRAGMA foreign_key_list("${name}")`).all() as { table: string; from: string }[];
    for (const reference of references.filter((row) => row.table === 'users')) {
      if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(reference.from)) throw new HttpError(409, 'UNSAFE_SCHEMA', 'Cấu trúc dữ liệu cần rà soát trước khi xóa');
      const row = db.prepare(`SELECT COUNT(*) AS n FROM "${name}" WHERE "${reference.from}" = ?`).get(studentId) as { n: number };
      count += row.n;
    }
  }
  return count;
}

export function previewStudentRemoval(actor: Actor, studentId: string): { action: RemovalAction; referenceCount: number } {
  const student = studentFor(actor, studentId);
  if (student.archived_at) throw new HttpError(409, 'STUDENT_ARCHIVED', 'Tài khoản đã lưu trữ');
  const referenceCount = learningReferenceCount(studentId);
  return { action: referenceCount === 0 ? 'delete' : 'archive', referenceCount };
}

export function removeStudent(actor: Actor, studentId: string, expectedAction: RemovalAction): { action: RemovalAction } {
  return transaction(() => {
    const preview = previewStudentRemoval(actor, studentId);
    if (preview.action !== expectedAction) throw new HttpError(409, 'REMOVAL_CHANGED', 'Dữ liệu đã thay đổi; hãy xem lại trước khi xác nhận');
    if (expectedAction === 'delete') {
      db.prepare('DELETE FROM users WHERE id = ?').run(studentId);
    } else {
      db.prepare("UPDATE users SET status = 'locked', archived_at = datetime('now'), failed_attempts = 0, session_version = session_version + 1 WHERE id = ?")
        .run(studentId);
    }
    return { action: expectedAction };
  });
}

import { db } from '../db/connection.js';
import type { PublicUser } from '../db/connection.js';
import { HttpError } from './errors.js';

export interface ClassRow {
  id: string;
  name: string;
  subject: string;
  teacher_id: string;
  academic_year: string;
  settings_json: string;
  total_periods: number;
}

export function getClassOrThrow(id: string): ClassRow {
  const row = db.prepare('SELECT * FROM classes WHERE id = ?').get(id) as ClassRow | undefined;
  if (!row) throw new HttpError(404, 'NOT_FOUND', 'Không tìm thấy lớp học');
  return row;
}

export function canManageClass(cls: ClassRow, user: PublicUser): boolean {
  return user.role === 'admin' || (user.role === 'teacher' && cls.teacher_id === user.id);
}

export function canViewClass(cls: ClassRow, user: PublicUser): boolean {
  if (canManageClass(cls, user)) return true;
  if (user.role !== 'student') return false;
  const e = db
    .prepare('SELECT 1 FROM enrollments WHERE class_id = ? AND student_id = ?')
    .get(cls.id, user.id);
  return !!e;
}

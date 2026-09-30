import { db } from '../db/connection.js';
import { generateTemporaryPassword, type OneTimeCredential } from '../auth/temporaryCredentials.js';
import { readFirstWorksheetRows } from '../utils/spreadsheet.js';
import { HttpError } from '../utils/errors.js';
import { createStudentAccount, enrollExistingStudent } from './studentAccounts.js';

type Creator = { id: string; role: string };
type RosterClass = { id: string; name: string; teacher_id: string };
type RosterRow = {
  row: number;
  username: string;
  displayName: string;
  studentCode: string;
  className: string;
  password: string;
  dob?: string;
  invalidDob: boolean;
  gender: string;
  hometown: string;
};
export type RosterPreviewRow = {
  row: number;
  username: string;
  displayName: string;
  studentCode: string;
  action: 'create' | 'enroll' | 'skip' | 'conflict';
  message: string;
};
type ClassifiedRow = RosterPreviewRow & { studentId?: string };

function normalizeHeader(cell: unknown): string {
  return String(cell ?? '').normalize('NFD').replace(/\p{Mark}/gu, '').replace(/đ/giu, 'd').trim().toLowerCase();
}

function headerIndices(row: unknown[]) {
  const headers = row.map(normalizeHeader);
  return {
    code: headers.findIndex((value) => value.includes('ma hoc vien') || value.includes('mshv') || value.includes('msv') || value === 'ma hv'),
    name: headers.findIndex((value) => value.includes('ho va ten') || value.includes('ho ten') || value.includes('hoten') || value.includes('display')),
    dob: headers.findIndex((value) => value.includes('ngay sinh') || value.includes('ngay thang nam sinh') || value.includes('dob')),
    gender: headers.findIndex((value) => value.includes('gioi tinh') || value === 'gt'),
    className: headers.findIndex((value) => value === 'lop' || value.includes('lop hoc')),
    hometown: headers.findIndex((value) => value.includes('que quan') || value.includes('dia chi')),
    username: headers.findIndex((value) => value.includes('tai khoan') || value.includes('username') || value === 'tk' || value.includes('account')),
    password: headers.findIndex((value) => value.includes('mat khau') || value.includes('pass') || value === 'mk'),
  };
}

function parseDob(cell: unknown): string | undefined {
  if (cell instanceof Date) {
    if (Number.isNaN(cell.getTime())) return undefined;
    return `${cell.getFullYear()}-${String(cell.getMonth() + 1).padStart(2, '0')}-${String(cell.getDate()).padStart(2, '0')}`;
  }
  const value = String(cell ?? '').trim();
  if (!value) return undefined;
  let match = value.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})$/);
  if (match) return `${match[3]}-${match[2]!.padStart(2, '0')}-${match[1]!.padStart(2, '0')}`;
  match = value.match(/^(\d{4})[/\-.](\d{1,2})[/\-.](\d{1,2})$/);
  if (match) return `${match[1]}-${match[2]!.padStart(2, '0')}-${match[3]!.padStart(2, '0')}`;
  return undefined;
}

export async function parseStudentRoster(buffer: Buffer, filename: string): Promise<RosterRow[]> {
  let rows: unknown[][];
  try {
    rows = await readFirstWorksheetRows(buffer, filename.toLowerCase().endsWith('.csv') ? 'csv' : 'xlsx');
  } catch {
    throw new HttpError(400, 'BAD_INPUT', 'Không thể đọc file Excel/CSV hợp lệ');
  }
  let headerIndex = -1;
  let columns: ReturnType<typeof headerIndices> | undefined;
  for (let index = 0; index < Math.min(10, rows.length); index++) {
    const candidate = headerIndices(rows[index] ?? []);
    if (candidate.username >= 0 && candidate.name >= 0 && candidate.code >= 0 && new Set([candidate.username, candidate.name, candidate.code]).size === 3) {
      headerIndex = index;
      columns = candidate;
      break;
    }
  }
  if (!columns) throw new HttpError(400, 'BAD_INPUT', 'File phải có cột Mã học viên, Họ và tên và Tài khoản user');
  const data = rows.slice(headerIndex + 1).map((cells, index) => ({ cells, row: headerIndex + index + 2 }))
    .filter(({ cells }) => [columns.username, columns.name, columns.code].some((column) => String(cells[column] ?? '').trim()));
  if (data.length === 0 || data.length > 500) throw new HttpError(400, 'BAD_INPUT', 'File cần từ 1 đến 500 dòng học viên');
  const at = (cells: unknown[], column: number): string => column >= 0 ? String(cells[column] ?? '').trim() : '';
  return data.map(({ cells, row }) => {
    const dobValue = columns.dob >= 0 ? cells[columns.dob] : undefined;
    const dob = parseDob(dobValue);
    return {
      row,
      username: at(cells, columns.username),
      displayName: at(cells, columns.name),
      studentCode: at(cells, columns.code),
      className: at(cells, columns.className),
      password: at(cells, columns.password),
      dob,
      invalidDob: Boolean(String(dobValue ?? '').trim()) && !dob,
      gender: at(cells, columns.gender),
      hometown: at(cells, columns.hometown),
    };
  });
}

function classifyRow(row: RosterRow, cls: RosterClass, creator: Creator): ClassifiedRow {
  const base = { row: row.row, username: row.username.toLowerCase(), displayName: row.displayName, studentCode: row.studentCode };
  const conflict = (message: string): ClassifiedRow => ({ ...base, action: 'conflict', message });
  if (!/^[a-z0-9._-]{3,50}$/u.test(base.username)) return conflict('Tài khoản không hợp lệ (3–50 ký tự chữ/số/dấu . _ -)');
  if (!row.displayName || row.displayName.length > 100) return conflict('Họ và tên bắt buộc, tối đa 100 ký tự');
  if (!row.studentCode || row.studentCode.length > 50) return conflict('Mã học viên bắt buộc, tối đa 50 ký tự');
  if (row.password && (row.password.length < 6 || row.password.length > 200)) return conflict('Mật khẩu tạm phải dài 6–200 ký tự');
  if (row.invalidDob || row.gender.length > 20 || row.hometown.length > 200) return conflict('Thông tin hồ sơ không hợp lệ');
  if (row.className && row.className.toLocaleLowerCase('vi-VN') !== cls.name.trim().toLocaleLowerCase('vi-VN')) {
    return conflict(`Cột Lớp không khớp lớp đã chọn (${cls.name})`);
  }
  const matches = db.prepare('SELECT id, role, status, student_code, created_by FROM users WHERE lower(trim(username)) = ? LIMIT 2').all(base.username) as
    { id: string; role: string; status: string; student_code: string | null; created_by: string | null }[];
  if (matches.length > 1) return conflict('Tài khoản cũ bị trùng; cần xử lý dữ liệu trước');
  const existing = matches[0];
  if (existing) {
    if (existing.role !== 'student') return conflict('Tài khoản đã thuộc vai trò khác');
    if (existing.student_code?.trim().toUpperCase() !== row.studentCode.toUpperCase()) return conflict('Mã học viên không khớp tài khoản đã có');
    if (creator.role === 'teacher' && existing.created_by !== creator.id) return conflict('Giảng viên chỉ xử lý học viên do mình tạo');
    if (existing.status !== 'active') return conflict('Tài khoản học viên đang bị khóa');
    const memberships = db.prepare('SELECT class_id FROM enrollments WHERE student_id = ?').all(existing.id) as { class_id: string }[];
    if (memberships.some((item) => item.class_id !== cls.id)) return conflict('Học viên đã thuộc lớp biên chế khác');
    if (memberships.length) return { ...base, action: 'skip', message: 'Đã có trong lớp, giữ nguyên tài khoản và mật khẩu', studentId: existing.id };
    return { ...base, action: 'enroll', message: 'Tài khoản cũ chưa có lớp; sẽ ghi danh', studentId: existing.id };
  }
  const duplicateCode = db.prepare("SELECT 1 FROM users WHERE role = 'student' AND upper(trim(student_code)) = upper(trim(?)) LIMIT 1").get(row.studentCode);
  if (duplicateCode) return conflict('Mã học viên đã thuộc tài khoản khác');
  return { ...base, action: 'create', message: 'Sẽ tạo học viên và ghi danh' };
}

function classifyRows(rows: RosterRow[], cls: RosterClass, creator: Creator): ClassifiedRow[] {
  const seenUsernames = new Set<string>();
  const seenCodes = new Set<string>();
  return rows.map((row) => {
    const result = classifyRow(row, cls, creator);
    const usernameKey = row.username.toLowerCase();
    const codeKey = row.studentCode.toUpperCase();
    if (result.action === 'create' || result.action === 'enroll' || result.action === 'skip') {
      if (seenUsernames.has(usernameKey) || seenCodes.has(codeKey)) {
        return { ...result, action: 'conflict', message: 'Tài khoản hoặc mã học viên lặp trong file' };
      }
      seenUsernames.add(usernameKey);
      seenCodes.add(codeKey);
    }
    return result;
  });
}

export function assertRosterClass(cls: RosterClass, creator: Creator): void {
  if (creator.role !== 'admin' && (creator.role !== 'teacher' || cls.teacher_id !== creator.id)) {
    throw new HttpError(403, 'FORBIDDEN', 'Không có quyền nhập học viên cho lớp này');
  }
  const state = db.prepare('SELECT archived FROM classes WHERE id = ?').get(cls.id) as { archived: number } | undefined;
  if (!state || state.archived === 1) throw new HttpError(409, 'CLASS_ARCHIVED', 'Không thể nhập học viên vào lớp lưu trữ');
}

export function previewStudentRoster(rows: RosterRow[], cls: RosterClass, creator: Creator) {
  assertRosterClass(cls, creator);
  const preview = classifyRows(rows, cls, creator).map(({ studentId: _studentId, ...item }) => item);
  const summary = {
    create: preview.filter((item) => item.action === 'create').length,
    enroll: preview.filter((item) => item.action === 'enroll').length,
    skip: preview.filter((item) => item.action === 'skip').length,
    conflict: preview.filter((item) => item.action === 'conflict').length,
  };
  return { classId: cls.id, className: cls.name, summary, rows: preview };
}

export function importStudentRoster(rows: RosterRow[], cls: RosterClass, creator: Creator) {
  assertRosterClass(cls, creator);
  const classified = classifyRows(rows, cls, creator);
  let created = 0;
  let enrolled = 0;
  let skipped = 0;
  const errors: string[] = [];
  const credentials: OneTimeCredential[] = [];
  for (const [index, action] of classified.entries()) {
    const row = rows[index]!;
    if (action.action === 'conflict') {
      errors.push(`Dòng ${row.row}: ${action.message}`);
      skipped++;
      continue;
    }
    if (action.action === 'skip') { skipped++; continue; }
    try {
      if (action.action === 'enroll' && action.studentId) {
        if (enrollExistingStudent(action.studentId, cls.id, creator)) enrolled++;
        else skipped++;
      } else if (action.action === 'create') {
        const temporaryPassword = row.password || generateTemporaryPassword();
        const student = createStudentAccount({
          username: row.username, password: temporaryPassword, displayName: row.displayName,
          studentCode: row.studentCode, classId: cls.id, dob: row.dob, gender: row.gender, hometown: row.hometown,
        }, creator);
        credentials.push({ id: student.id, username: student.username, temporaryPassword });
        created++;
        enrolled++;
      }
    } catch (error) {
      errors.push(`Dòng ${row.row}: ${error instanceof Error ? error.message : 'Không thể nhập học viên'}`);
      skipped++;
    }
  }
  return { created, enrolled, skipped, credentials, errors };
}

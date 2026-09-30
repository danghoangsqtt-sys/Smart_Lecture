import { DatabaseSync } from 'node:sqlite';
import { realpathSync, statSync } from 'node:fs';

function groupedDuplicates(rows, keyOf) {
  const groups = new Map();
  for (const row of rows) {
    const key = keyOf(row);
    if (!key) continue;
    const ids = groups.get(key) ?? [];
    ids.push(row.id);
    groups.set(key, ids);
  }
  return [...groups.entries()]
    .filter(([, ids]) => ids.length > 1)
    .map(([key, userIds]) => ({ key, userIds }))
    .sort((a, b) => a.key.localeCompare(b.key));
}

const normalizedUsername = (value) => String(value ?? '').trim().toLowerCase();
const normalizedStudentCode = (value) => String(value ?? '').trim().toUpperCase();

/** Inspect one explicitly selected SQLite file without importing the app's mutable DB bootstrap. */
export function inspectRoster(dbPath) {
  if (typeof dbPath !== 'string' || !dbPath.trim()) {
    throw new Error('A database file path is required');
  }
  const resolvedPath = realpathSync(dbPath);
  if (!statSync(resolvedPath).isFile()) {
    throw new Error('Database path must be a file');
  }

  const db = new DatabaseSync(resolvedPath, { readOnly: true });
  try {
    db.exec('PRAGMA query_only = ON');
    const tables = new Set(db.prepare("SELECT name FROM sqlite_schema WHERE type = 'table'").all().map((row) => row.name));
    const requiredTables = ['users', 'classes', 'enrollments'];
    const missingTables = requiredTables.filter((table) => !tables.has(table));
    if (missingTables.length) {
      throw new Error(`Missing required tables: ${missingTables.join(', ')}`);
    }

    const userColumns = new Set(db.prepare('PRAGMA table_info(users)').all().map((row) => row.name));
    const missingColumns = ['id', 'username', 'role', 'student_code'].filter((column) => !userColumns.has(column));
    if (missingColumns.some((column) => column !== 'student_code')) {
      throw new Error(`Missing required users columns: ${missingColumns.join(', ')}`);
    }

    const users = db.prepare(`SELECT id, username, role, ${userColumns.has('student_code') ? 'student_code' : 'NULL AS student_code'} FROM users ORDER BY id`).all();
    const classes = new Set(db.prepare('SELECT id FROM classes').all().map((row) => row.id));
    const enrollments = db.prepare('SELECT class_id, student_id FROM enrollments ORDER BY student_id, class_id').all();
    const usersById = new Map(users.map((user) => [user.id, user]));
    const students = users.filter((user) => user.role === 'student');
    const enrollmentClasses = new Map();
    const invalidEnrollments = [];
    for (const enrollment of enrollments) {
      const user = usersById.get(enrollment.student_id);
      if (!user || user.role !== 'student' || !classes.has(enrollment.class_id)) {
        invalidEnrollments.push({ studentId: enrollment.student_id, classId: enrollment.class_id, reason: !user ? 'missing_user' : user.role !== 'student' ? 'not_student' : 'missing_class' });
        continue;
      }
      const classIds = enrollmentClasses.get(user.id) ?? new Set();
      classIds.add(enrollment.class_id);
      enrollmentClasses.set(user.id, classIds);
    }

    const issues = {
      missingColumns,
      duplicateUsernames: groupedDuplicates(users, (user) => normalizedUsername(user.username)),
      blankUsernames: users.filter((user) => !normalizedUsername(user.username)).map((user) => user.id),
      uppercaseStudentUsernames: students.filter((user) => /[A-Z]/.test(user.username)).map((user) => user.id),
      missingStudentCodes: students.filter((user) => !normalizedStudentCode(user.student_code)).map((user) => user.id),
      duplicateStudentCodes: groupedDuplicates(students, (user) => normalizedStudentCode(user.student_code)),
      unassignedStudents: students.filter((user) => !enrollmentClasses.has(user.id)).map((user) => user.id),
      multiClassStudents: students
        .filter((user) => (enrollmentClasses.get(user.id)?.size ?? 0) > 1)
        .map((user) => ({ studentId: user.id, classIds: [...enrollmentClasses.get(user.id)].sort() })),
      invalidEnrollments,
      foreignKeyViolations: db.prepare('PRAGMA foreign_key_check').all(),
      integrityErrors: db.prepare('PRAGMA integrity_check').all().map((row) => row.integrity_check).filter((result) => result !== 'ok'),
    };
    const issueCounts = Object.fromEntries(Object.entries(issues).map(([name, items]) => [name, items.length]));
    return {
      database: resolvedPath,
      schemaVersion: tables.has('schema_migrations')
        ? (db.prepare('SELECT COALESCE(MAX(version), 0) AS version FROM schema_migrations').get()?.version ?? 0)
        : null,
      summary: { users: users.length, students: students.length, classes: classes.size, enrollments: enrollments.length, issueCounts },
      readyForConstraint: Object.values(issueCounts).every((count) => count === 0),
      issues,
    };
  } finally {
    db.close();
  }
}

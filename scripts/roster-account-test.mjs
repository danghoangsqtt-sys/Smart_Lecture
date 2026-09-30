import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const dataDir = mkdtempSync(path.join(tmpdir(), 'smartlecture-roster-account-'));
process.env.DATA_DIR = dataDir;
process.env.DB_PATH = path.join(dataDir, 'roster.db');

let server;
let db;
let passed = 0;
function check(ok, label) {
  if (!ok) throw new Error(`FAIL ${label}`);
  passed++;
  console.log(`PASS ${label}`);
}

try {
  const [{ default: express }, connection, { seedAdmin }, { default: authRoutes }, { default: usersRoutes }, { default: classesRoutes }, { errorHandler }] = await Promise.all([
    import('express'),
    import('../server/dist/db/connection.js'),
    import('../server/dist/db/seed.js'),
    import('../server/dist/routes/auth.routes.js'),
    import('../server/dist/routes/users.routes.js'),
    import('../server/dist/routes/classes.routes.js'),
    import('../server/dist/utils/errors.js'),
  ]);
  db = connection.db;
  connection.migrate();
  seedAdmin();
  const app = express();
  app.use(express.json());
  app.use('/api/auth', authRoutes);
  app.use('/api', usersRoutes);
  app.use('/api', classesRoutes);
  app.use((error, req, res, next) => {
    if (error instanceof Error && error.message === 'test_history_failure') {
      res.status(500).json({ error: { code: 'EXPECTED_TEST_FAILURE' } });
      return;
    }
    next(error);
  });
  app.use(errorHandler);
  server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}/api`;
  async function api(method, endpoint, token, body) {
    const response = await fetch(`${base}${endpoint}`, {
      method,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: response.status, body: await response.json() };
  }
  const initial = await api('POST', '/auth/login', '', { username: 'admin', password: 'admin123' });
  const changed = await api('POST', '/auth/change-password', initial.body.token, { oldPassword: 'admin123', newPassword: 'Admin@123456' });
  const admin = changed.body.token;
  const firstClass = await api('POST', '/classes', admin, { name: 'Roster A', subject: 'Test', academicYear: '2026-2027' });
  const secondClass = await api('POST', '/classes', admin, { name: 'Roster B', subject: 'Test', academicYear: '2026-2027' });
  const classA = firstClass.body.class.id;
  const classB = secondClass.body.class.id;
  const payload = { username: 'Student.One', password: 'Student@123', role: 'student', displayName: 'Student One', studentCode: 'ROSTER-001', classId: classA };

  const missingCode = await api('POST', '/users', admin, { ...payload, studentCode: '' });
  const missingClass = await api('POST', '/users', admin, { ...payload, classId: '' });
  const legacyMissing = await api('POST', '/auth/users', admin, { username: 'legacy.one', password: 'Student@123', role: 'student', displayName: 'Legacy One' });
  check(missingCode.status === 400 && missingClass.status === 400 && legacyMissing.status === 400 && db.prepare("SELECT COUNT(*) AS n FROM users WHERE role = 'student'").get().n === 0, 'all creation endpoints reject missing code or home class');

  const created = await api('POST', '/users', admin, payload);
  const studentId = created.body.user?.id;
  const row = db.prepare('SELECT username, student_code FROM users WHERE id = ?').get(studentId);
  const membership = db.prepare('SELECT class_id FROM enrollments WHERE student_id = ?').all(studentId);
  const history = db.prepare('SELECT class_id FROM student_home_class_history WHERE student_id = ? AND ended_at IS NULL').all(studentId);
  check(created.status === 201 && row?.username === 'student.one' && row.student_code === 'ROSTER-001' && membership.length === 1 && membership[0].class_id === classA && history.length === 1 && history[0].class_id === classA, 'student, enrollment and history created together; username stored lowercase');

  const duplicateName = await api('POST', '/users', admin, { ...payload, username: 'STUDENT.ONE', studentCode: 'ROSTER-002' });
  const duplicateCode = await api('POST', '/auth/users', admin, { ...payload, username: 'student.two', studentCode: 'roster-001' });
  check(duplicateName.status === 409 && duplicateCode.status === 409 && db.prepare("SELECT COUNT(*) AS n FROM users WHERE role = 'student'").get().n === 1, 'username and code reject case-insensitive duplicates across endpoints');

  const teacherAccount = await api('POST', '/users', admin, { username: 'roster.teacher', password: 'Teacher@123', role: 'teacher', displayName: 'Roster Teacher' });
  const teacherLogin = await api('POST', '/auth/login', '', { username: 'roster.teacher', password: 'Teacher@123' });
  const teacherChanged = await api('POST', '/auth/change-password', teacherLogin.body.token, { oldPassword: 'Teacher@123', newPassword: 'Teacher@456' });
  const teacher = teacherChanged.body.token;
  const teacherClass = await api('POST', '/classes', teacher, { name: 'Teacher Class', subject: 'Test', academicYear: '2026-2027' });
  check(teacherAccount.status === 201 && teacherClass.status === 201, 'teacher creation remains available');
  const teacherDenied = await api('POST', '/users', teacher, { ...payload, username: 'teacher.denied', studentCode: 'ROSTER-003', classId: classB });
  const teacherCreated = await api('POST', '/users', teacher, { ...payload, username: 'Teacher.Student', studentCode: 'ROSTER-004', classId: teacherClass.body.class.id });
  check(teacherDenied.status === 403 && teacherCreated.status === 201 && teacherCreated.body.user.username === 'teacher.student', 'teacher can only create into owned class');

  const importResult = await api('POST', '/users/import', teacher, { rows: [
    { username: 'import.valid', displayName: 'Import Valid', studentCode: 'ROSTER-005', classId: teacherClass.body.class.id },
    { username: 'import.invalid', displayName: 'Import Invalid', studentCode: '', classId: teacherClass.body.class.id },
    { username: 'import.foreign', displayName: 'Import Foreign', studentCode: 'ROSTER-006', classId: classB },
  ] });
  check(importResult.status === 201 && importResult.body.createdCount === 1 && importResult.body.errors.length === 2 && !db.prepare("SELECT 1 FROM users WHERE username IN ('import.invalid', 'import.foreign')").get(), 'JSON import reports row errors without orphan accounts');

  const crossClass = await api('POST', `/classes/${classB}/enroll`, admin, { studentIds: [studentId] });
  const unlink = await api('DELETE', `/classes/${classA}/enroll/${studentId}`, admin);
  const deleteClass = await api('DELETE', `/classes/${classA}`, admin);
  check(crossClass.status === 409 && unlink.status === 409 && deleteClass.status === 409 && db.prepare('SELECT COUNT(*) AS n FROM enrollments WHERE student_id = ?').get(studentId).n === 1, 'class transfer and orphan-producing deletes are blocked');

  db.exec("CREATE TRIGGER roster_test_abort BEFORE INSERT ON student_home_class_history BEGIN SELECT RAISE(ABORT, 'test_history_failure'); END");
  const rollback = await api('POST', '/users', admin, { ...payload, username: 'rollback.student', studentCode: 'ROSTER-007' });
  db.exec('DROP TRIGGER roster_test_abort');
  check(rollback.status === 500 && !db.prepare("SELECT 1 FROM users WHERE username = 'rollback.student'").get() && !db.prepare("SELECT 1 FROM enrollments WHERE student_id IN (SELECT id FROM users WHERE username = 'rollback.student')").get(), 'history failure rolls back account and membership');

  console.log(`Roster account contract: ${passed}/${passed} passed`);
} finally {
  if (server) await new Promise((resolve) => server.close(resolve));
  if (db) db.close();
  const tempRoot = path.resolve(tmpdir());
  if (!path.resolve(dataDir).startsWith(`${tempRoot}${path.sep}`)) throw new Error('Unsafe temporary cleanup path');
  rmSync(dataDir, { recursive: true, force: true });
}

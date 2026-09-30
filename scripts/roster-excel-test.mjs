import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import ExcelJS from 'exceljs';

const dataDir = mkdtempSync(path.join(tmpdir(), 'smartlecture-roster-excel-'));
process.env.DATA_DIR = dataDir;
process.env.DB_PATH = path.join(dataDir, 'roster-excel.db');
let server;
let db;
let passed = 0;
function check(condition, label) {
  if (!condition) throw new Error(`FAIL ${label}`);
  passed++;
  console.log(`PASS ${label}`);
}

try {
  const [{ default: express }, connection, { seedAdmin }, { default: authRoutes }, { default: usersRoutes }, { default: classesRoutes }, { errorHandler }] = await Promise.all([
    import('express'), import('../server/dist/db/connection.js'), import('../server/dist/db/seed.js'),
    import('../server/dist/routes/auth.routes.js'), import('../server/dist/routes/users.routes.js'),
    import('../server/dist/routes/classes.routes.js'), import('../server/dist/utils/errors.js'),
  ]);
  db = connection.db;
  connection.migrate();
  seedAdmin();
  const app = express();
  app.use(express.json());
  app.use('/api/auth', authRoutes);
  app.use('/api', usersRoutes);
  app.use('/api', classesRoutes);
  app.use(errorHandler);
  server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}/api`;
  async function json(method, endpoint, token, body) {
    const response = await fetch(`${base}${endpoint}`, {
      method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { response, body: await response.json() };
  }
  async function fileRequest(endpoint, token, csv) {
    const form = new FormData();
    form.append('file', new Blob([csv], { type: 'text/csv' }), 'students.csv');
    const response = await fetch(`${base}${endpoint}`, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form });
    return { response, body: await response.json() };
  }
  const login = await json('POST', '/auth/login', '', { username: 'admin', password: 'admin123' });
  const changed = await json('POST', '/auth/change-password', login.body.token, { oldPassword: 'admin123', newPassword: 'Admin@123456' });
  const admin = changed.body.token;
  const teacherCreated = await json('POST', '/users', admin, { username: 'roster.excel.teacher', password: 'Teacher@123', role: 'teacher', displayName: 'Excel Teacher' });
  const firstTeacher = await json('POST', '/auth/login', '', { username: 'roster.excel.teacher', password: 'Teacher@123' });
  const changedTeacher = await json('POST', '/auth/change-password', firstTeacher.body.token, { oldPassword: 'Teacher@123', newPassword: 'Teacher@456' });
  const teacher = changedTeacher.body.token;
  const cls = await json('POST', '/classes', teacher, { name: 'Roster Excel A', subject: 'Test', academicYear: '2026-2027' });
  const other = await json('POST', '/classes', admin, { name: 'Other Admin Class', subject: 'Test', academicYear: '2026-2027' });
  const classId = cls.body.class.id;
  check(teacherCreated.response.status === 201 && cls.response.status === 201, 'isolated teacher and class ready');

  const templateResponse = await fetch(`${base}/classes/${classId}/import-template.xlsx`, { headers: { Authorization: `Bearer ${teacher}` } });
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(Buffer.from(await templateResponse.arrayBuffer()));
  const sheet = workbook.worksheets[0];
  check(templateResponse.ok && sheet.getCell('B5').value === 'Mã học viên' && sheet.getCell('F6').value === 'Roster Excel A' && !sheet.getCell('B6').value && String(sheet.getCell('A3').value).includes('ngẫu nhiên'), 'template requires code and class without sample student accounts');

  const csv = [
    'Mã học viên,Họ và tên,Tài khoản user,Lớp,Mật khẩu',
    'EXCEL-001,Valid Student,EXCEL.Student,Roster Excel A,',
    'EXCEL-002,Wrong Class,wrong.class,Other Admin Class,',
    ',Missing Code,missing.code,Roster Excel A,',
    'excel-001,Duplicate Code,duplicate.code,Roster Excel A,',
  ].join('\r\n');
  const before = db.prepare("SELECT COUNT(*) AS n FROM users WHERE role = 'student'").get().n;
  const preview = await fileRequest(`/classes/${classId}/import-students/preview`, teacher, csv);
  const after = db.prepare("SELECT COUNT(*) AS n FROM users WHERE role = 'student'").get().n;
  check(preview.response.status === 200 && preview.body.summary.create === 1 && preview.body.summary.conflict === 3 && before === after && preview.response.headers.get('cache-control')?.includes('no-store'), 'preview reports row conflicts without changing database');
  check(!JSON.stringify(preview.body).includes('temporaryPassword') && !JSON.stringify(preview.body).includes('password'), 'preview never reveals passwords');

  const imported = await fileRequest(`/classes/${classId}/import-students`, teacher, csv);
  const student = db.prepare("SELECT id, username, password_hash FROM users WHERE username = 'excel.student'").get();
  const memberships = db.prepare('SELECT class_id FROM enrollments WHERE student_id = ?').all(student.id);
  check(imported.response.status === 200 && imported.body.created === 1 && imported.body.enrolled === 1 && imported.body.errors.length === 3 && imported.body.credentials.length === 1 && student.username === 'excel.student' && memberships.length === 1 && memberships[0].class_id === classId, 'import writes only valid account with one home class');
  const initialHash = student.password_hash;
  const replay = await fileRequest(`/classes/${classId}/import-students`, teacher, csv);
  check(replay.body.created === 0 && replay.body.enrolled === 0 && replay.body.credentials.length === 0 && db.prepare('SELECT password_hash FROM users WHERE id = ?').get(student.id).password_hash === initialHash, 'replay is idempotent and preserves existing password');

  const foreign = await fileRequest(`/classes/${other.body.class.id}/import-students/preview`, teacher, csv);
  check(foreign.response.status === 403, 'teacher cannot preview a class they do not own');
  const users = await json('GET', '/users?role=student', teacher);
  check(users.body.users.some((user) => user.username === 'excel.student' && user.homeClassName === 'Roster Excel A'), 'Users API exposes home-class label');
  console.log(`Roster Excel regression: ${passed}/${passed} passed`);
} finally {
  if (server) await new Promise((resolve) => server.close(resolve));
  if (db) db.close();
  const root = path.resolve(tmpdir());
  if (!path.resolve(dataDir).startsWith(`${root}${path.sep}`)) throw new Error('Unsafe temporary cleanup path');
  rmSync(dataDir, { recursive: true, force: true });
}

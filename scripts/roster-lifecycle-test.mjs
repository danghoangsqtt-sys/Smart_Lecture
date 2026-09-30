import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createServer } from 'node:http';
import { io as clientIo } from 'socket.io-client';

const dataDir = mkdtempSync(path.join(tmpdir(), 'smartlecture-roster-lifecycle-'));
process.env.DATA_DIR = dataDir;
process.env.DB_PATH = path.join(dataDir, 'roster.db');

let server;
let gameIo;
let db;
let passed = 0;
function check(condition, label) {
  if (!condition) throw new Error(`FAIL ${label}`);
  passed++;
  console.log(`PASS ${label}`);
}

try {
  const [{ default: express }, connection, { seedAdmin }, { default: authRoutes }, { default: usersRoutes }, { default: classesRoutes }, { default: gradesRoutes }, { errorHandler }, game, { authenticateSocket }] = await Promise.all([
    import('express'),
    import('../server/dist/db/connection.js'),
    import('../server/dist/db/seed.js'),
    import('../server/dist/routes/auth.routes.js'),
    import('../server/dist/routes/users.routes.js'),
    import('../server/dist/routes/classes.routes.js'),
    import('../server/dist/routes/grades.routes.js'),
    import('../server/dist/utils/errors.js'),
    import('../server/dist/realtime/gameRoom.js'),
    import('../server/dist/realtime/socketAuth.js'),
  ]);
  db = connection.db;
  connection.migrate();
  seedAdmin();
  const app = express();
  app.use(express.json());
  app.use('/api/auth', authRoutes);
  app.use('/api', usersRoutes, classesRoutes, gradesRoutes);
  app.use((error, _req, res, next) => {
    if (error instanceof Error && error.message === 'test_transfer_failure') {
      res.status(500).json({ error: { code: 'EXPECTED_TRANSFER_ROLLBACK' } });
      return;
    }
    next(error);
  });
  app.use(errorHandler);
  server = createServer(app);
  gameIo = game.initGameEngine(server);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;

  async function api(method, endpoint, token, body) {
    const response = await fetch(`${base}/api${endpoint}`, {
      method,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: response.status, body: await response.json() };
  }
  async function login(username, password, nextPassword) {
    const initial = await api('POST', '/auth/login', '', { username, password });
    if (initial.status !== 200) throw new Error(`Cannot log in ${username}: ${initial.status}`);
    if (!nextPassword) return initial.body.token;
    const changed = await api('POST', '/auth/change-password', initial.body.token, { oldPassword: password, newPassword: nextPassword });
    if (changed.status !== 200) throw new Error(`Cannot change password ${username}: ${changed.status}`);
    return changed.body.token;
  }
  const admin = await login('admin', 'admin123', 'Admin@123456');
  const teacherCreated = await api('POST', '/users', admin, { username: 'lifecycle.teacher', password: 'Teacher@123', role: 'teacher', displayName: 'Teacher' });
  const outsiderCreated = await api('POST', '/users', admin, { username: 'other.teacher', password: 'Teacher@123', role: 'teacher', displayName: 'Other' });
  const teacher = await login('lifecycle.teacher', 'Teacher@123', 'Teacher@456');
  const outsider = await login('other.teacher', 'Teacher@123', 'Teacher@456');
  const teacherId = teacherCreated.body.user.id;
  check(teacherCreated.status === 201 && outsiderCreated.status === 201 && teacherId, 'teacher fixture created');

  async function createClass(name, token) {
    const result = await api('POST', '/classes', token, { name, subject: 'Test', academicYear: '2026' });
    if (result.status !== 201) throw new Error(`Cannot create class ${name}`);
    return result.body.class.id;
  }
  const classA = await createClass('Home A', teacher);
  const classB = await createClass('Home B', teacher);
  const foreignClass = await createClass('Foreign', outsider);
  const studentCreated = await api('POST', '/users', teacher, { username: 'life.student', password: 'Student@123', role: 'student', displayName: 'Life Student', studentCode: 'LIFE-001', classId: classA });
  const studentId = studentCreated.body.user.id;
  let studentToken = await login('life.student', 'Student@123', 'Student@456');
  check(studentCreated.status === 201 && !!studentToken, 'student starts in one class with a live token');

  const sessionId = 'life-attendance';
  db.prepare('INSERT INTO attendance_sessions (id, class_id, session_date) VALUES (?, ?, ?)').run(sessionId, classA, '2026-10-01');
  db.prepare('INSERT INTO attendance_records (session_id, student_id, status) VALUES (?, ?, ?)').run(sessionId, studentId, 'present');
  db.prepare('INSERT INTO grades (class_id, student_id, kttx) VALUES (?, ?, ?)').run(classA, studentId, 8);
  const deniedAccount = await api('POST', `/users/${studentId}/transfer`, outsider, { classId: foreignClass });
  const deniedClass = await api('POST', `/users/${studentId}/transfer`, teacher, { classId: foreignClass });
  check(deniedAccount.status === 403 && deniedClass.status === 403, 'other teacher cannot manage account; creator cannot target foreign class');

  db.exec("CREATE TRIGGER roster_transfer_test_abort BEFORE INSERT ON student_home_class_history BEGIN SELECT RAISE(ABORT, 'test_transfer_failure'); END");
  const rolledBack = await api('POST', `/users/${studentId}/transfer`, teacher, { classId: classB });
  db.exec('DROP TRIGGER roster_transfer_test_abort');
  check(rolledBack.status === 500 && db.prepare('SELECT class_id FROM enrollments WHERE student_id = ?').get(studentId)?.class_id === classA && db.prepare('SELECT class_id FROM student_home_class_history WHERE student_id = ? AND ended_at IS NULL').get(studentId)?.class_id === classA, 'failed history insert rolls back transfer without orphaning student');

  const liveSocket = clientIo(base, { auth: { token: studentToken }, transports: ['websocket'], reconnection: false });
  await new Promise((resolve, reject) => {
    liveSocket.once('connect', resolve);
    liveSocket.once('connect_error', reject);
  });
  const socketClosed = new Promise((resolve) => liveSocket.once('disconnect', resolve));
  const transfer = await api('POST', `/users/${studentId}/transfer`, teacher, { classId: classB });
  await socketClosed;
  const memberships = db.prepare('SELECT class_id FROM enrollments WHERE student_id = ?').all(studentId);
  const history = db.prepare('SELECT class_id, ended_at FROM student_home_class_history WHERE student_id = ? ORDER BY rowid').all(studentId);
  check(transfer.status === 200 && memberships.length === 1 && memberships[0].class_id === classB && history.length === 2 && history[0].ended_at !== null && history[1].ended_at === null && history[1].class_id === classB, 'transfer closes old history and opens exactly one new class');
  check(db.prepare('SELECT kttx FROM grades WHERE class_id = ? AND student_id = ?').get(classA, studentId)?.kttx === 8 && db.prepare('SELECT status FROM attendance_records WHERE session_id = ? AND student_id = ?').get(sessionId, studentId)?.status === 'present', 'historical grades and attendance remain on old class');
  check((await api('DELETE', `/classes/${classA}`, teacher)).status === 409, 'old class with historical learning data cannot be cascade-deleted after transfer');
  const gradebook = await api('GET', `/classes/${classA}/gradebook`, teacher);
  check(gradebook.status === 200 && gradebook.body.rows.some((row) => row.studentId === studentId && row.kttx === 8), 'old class gradebook still shows historical result after transfer');
  const oldToken = await api('GET', '/users', studentToken);
  check(oldToken.status === 401 && authenticateSocket({ handshake: { auth: { token: studentToken } } }) === null && !liveSocket.connected, 'transfer revokes HTTP, socket reconnect and live socket');
  studentToken = await login('life.student', 'Student@456');

  const assessed = await api('GET', `/users/${studentId}/removal-preview`, teacher);
  const wrongMode = await api('DELETE', `/users/${studentId}`, teacher, { expectedAction: 'delete' });
  check(assessed.status === 200 && assessed.body.action === 'archive' && wrongMode.status === 409, 'learning data forces archive and prevents stale delete confirmation');
  const archiveSocket = clientIo(base, { auth: { token: studentToken }, transports: ['websocket'], reconnection: false });
  await new Promise((resolve, reject) => {
    archiveSocket.once('connect', resolve);
    archiveSocket.once('connect_error', reject);
  });
  const archiveSocketClosed = new Promise((resolve) => archiveSocket.once('disconnect', resolve));
  const archived = await api('DELETE', `/users/${studentId}`, teacher, { expectedAction: 'archive' });
  await archiveSocketClosed;
  const archivedRow = db.prepare('SELECT archived_at, status, student_code FROM users WHERE id = ?').get(studentId);
  const archivedClass = await api('GET', `/classes/${classB}`, teacher);
  const hidden = await api('GET', '/users', teacher);
  const shown = await api('GET', '/users?includeArchived=1', teacher);
  const unlock = await api('PATCH', `/users/${studentId}/status`, teacher, {});
  check(archived.status === 200 && !!archivedRow.archived_at && archivedRow.status === 'locked' && archivedRow.student_code === 'LIFE-001' && !archivedClass.body.students.some((row) => row.id === studentId), 'archive keeps identity but removes from active roster');
  check(hidden.body.users.every((row) => row.id !== studentId) && shown.body.users.some((row) => row.id === studentId && row.archivedAt) && unlock.status === 409, 'archived account is hidden by default, visible on demand and cannot be unlocked');
  const archivedToken = await api('GET', '/users', studentToken);
  const archivedLogin = await api('POST', '/auth/login', '', { username: 'life.student', password: 'Student@456' });
  check(archivedToken.status === 401 && archivedLogin.status === 401 && authenticateSocket({ handshake: { auth: { token: studentToken } } }) === null && !archiveSocket.connected, 'archive revokes REST/Socket tokens, live socket and login');
  check(db.prepare('SELECT kttx FROM grades WHERE class_id = ? AND student_id = ?').get(classA, studentId)?.kttx === 8 && db.prepare('SELECT 1 FROM attendance_records WHERE student_id = ?').get(studentId), 'archive preserves historical learning data');

  const empty = await api('POST', '/users', teacher, { username: 'empty.student', password: 'Student@123', role: 'student', displayName: 'Empty', studentCode: 'LIFE-002', classId: classA });
  const emptyId = empty.body.user.id;
  const emptyToken = await login('empty.student', 'Student@123', 'Student@456');
  const deletePreview = await api('GET', `/users/${emptyId}/removal-preview`, teacher);
  const deleted = await api('DELETE', `/users/${emptyId}`, teacher, { expectedAction: 'delete' });
  check(deletePreview.body.action === 'delete' && deleted.status === 200 && !db.prepare('SELECT 1 FROM users WHERE id = ?').get(emptyId) && !db.prepare('SELECT 1 FROM enrollments WHERE student_id = ?').get(emptyId) && !db.prepare('SELECT 1 FROM student_home_class_history WHERE student_id = ?').get(emptyId), 'empty account and incidental roster rows can be truly deleted');
  check((await api('GET', '/users', emptyToken)).status === 401 && authenticateSocket({ handshake: { auth: { token: emptyToken } } }) === null, 'delete revokes existing sessions');
  check(db.prepare('PRAGMA foreign_key_check').all().length === 0 && connection.rosterConstraintStatus().ready, 'FK and roster constraints remain clean');
  console.log(`Roster lifecycle contract: ${passed}/${passed} passed`);
  liveSocket.close();
  archiveSocket.close();
  game.stopGameEngineTimers();
} finally {
  if (gameIo) await new Promise((resolve) => gameIo.close(resolve));
  if (server) await new Promise((resolve) => server.close(resolve));
  if (db) db.close();
  const tempRoot = path.resolve(tmpdir());
  if (!path.resolve(dataDir).startsWith(`${tempRoot}${path.sep}`)) throw new Error('Unsafe temporary cleanup path');
  rmSync(dataDir, { recursive: true, force: true });
}

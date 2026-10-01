import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const dataDir = mkdtempSync(path.join(tmpdir(), 'smartlecture-shared-teaching-'));
process.env.DATA_DIR = dataDir;
process.env.DB_PATH = path.join(dataDir, 'test.db');
let server;
let db;
let passed = 0;

function check(label, fn) {
  fn();
  passed++;
  console.log(`PASS ${label}`);
}

try {
  const [{ default: express }, { default: jwt }, connection, { JWT_SECRET },
    { default: sharedSessions }, { default: legacyLogs }, { default: sharedCurriculum },
    { default: classes }, { errorHandler }] = await Promise.all([
    import('express'), import('jsonwebtoken'), import('../server/dist/db/connection.js'),
    import('../server/dist/config.js'), import('../server/dist/routes/sharedTeachingSessions.routes.js'),
    import('../server/dist/routes/teachingLogs.routes.js'), import('../server/dist/routes/sharedCurriculum.routes.js'),
    import('../server/dist/routes/classes.routes.js'), import('../server/dist/utils/errors.js'),
  ]);
  db = connection.db;
  connection.migrate();
  check('v31 schema and legacy relation present', () => {
    assert.equal(db.prepare('SELECT MAX(version) AS v FROM schema_migrations').get().v, 31);
    assert.ok(db.prepare('PRAGMA table_info(teaching_logs)').all().some((column) => column.name === 'shared_lesson_id'));
    assert.equal(db.prepare('PRAGMA foreign_key_check').all().length, 0);
  });
  connection.migrate();
  check('migration is idempotent', () => {
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM schema_migrations WHERE version = 31').get().n, 1);
  });

  for (const [id, role] of [['teacher-a', 'teacher'], ['teacher-b', 'teacher'], ['admin-a', 'admin']]) {
    db.prepare('INSERT INTO users (id, username, password_hash, role, display_name) VALUES (?, ?, ?, ?, ?)')
      .run(id, id, 'unused', role, id);
  }
  for (const [id, teacher] of [['class-a', 'teacher-a'], ['class-b', 'teacher-a'], ['class-c', 'teacher-a'],
    ['class-d', 'teacher-a'], ['class-e', 'teacher-b']]) {
    db.prepare('INSERT INTO classes (id, name, teacher_id) VALUES (?, ?, ?)').run(id, id, teacher);
  }
  db.prepare('INSERT INTO shared_subjects (id, owner_id, name) VALUES (?, ?, ?)').run('subject-a', 'teacher-a', 'Môn chung');
  db.prepare('INSERT INTO shared_subjects (id, owner_id, name) VALUES (?, ?, ?)').run('subject-b', 'teacher-a', 'Môn khác');
  db.prepare('INSERT INTO shared_lessons (id, subject_id, title) VALUES (?, ?, ?)').run('lesson-a', 'subject-a', 'Bài chung');
  db.prepare('INSERT INTO shared_lessons (id, subject_id, title) VALUES (?, ?, ?)').run('lesson-b', 'subject-b', 'Bài khác');
  for (const classId of ['class-a', 'class-b', 'class-c', 'class-d']) {
    db.prepare('INSERT INTO class_subject_assignments (id, class_id, subject_id) VALUES (?, ?, ?)')
      .run(`assignment-${classId}`, classId, 'subject-a');
  }

  const token = (id) => jwt.sign({ sub: id, sv: 0 }, JWT_SECRET, { expiresIn: '1h' });
  const app = express();
  app.use(express.json());
  app.use('/api', sharedSessions);
  app.get('/api/unrelated-check', (_req, res) => res.json({ ok: true }));
  app.use('/api', legacyLogs);
  app.use('/api', sharedCurriculum);
  app.use('/api', classes);
  app.use(errorHandler);
  server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}/api`;
  async function api(method, endpoint, user, body) {
    const response = await fetch(`${base}${endpoint}`, {
      method,
      headers: { 'Content-Type': 'application/json', ...(user ? { Authorization: `Bearer ${token(user)}` } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: response.status, body: await response.json() };
  }
  const payload = (classIds, lessonId = 'lesson-a', subjectId = 'subject-a') => ({ classIds, lessonId, subjectId });
  const start = (body, user = 'teacher-a') => api('POST', '/shared/teaching-sessions/start', user, body);

  const bad = await Promise.all([
    start(payload([])), start(payload(['class-a', 'class-a'])),
    start(payload(['class-a', 'class-b', 'class-c', 'class-d', 'class-e'])),
    start(payload(['class-a'], 'lesson-b')),
    start(payload(['class-a', 'class-e'])),
    start(payload(['class-e'])),
    start(payload(['class-a', 'class-b']), 'teacher-b'),
  ]);
  check('cardinality, duplicate, mismatch, assignment and ownership rejected', () => {
    assert.deepEqual(bad.map((row) => row.status), [400, 400, 400, 400, 403, 403, 403]);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM teaching_logs').get().n, 0);
  });
  const adminAssignment = await api('POST', '/shared/subjects/subject-a/classes', 'admin-a', { classId: 'class-e' });
  const crossOwner = await start(payload(['class-a', 'class-e']));
  check('every participant class must be managed by teacher', () => {
    assert.equal(adminAssignment.status, 200);
    assert.equal(crossOwner.status, 403);
  });
  const otherTeacher = await start(payload(['class-e']), 'teacher-b');
  const adminMixed = await start(payload(['class-a', 'class-e']), 'admin-a');
  check('assigned teacher can teach another owner’s subject; admin cannot overlap an active class', () => {
    assert.equal(otherTeacher.status, 201);
    assert.equal(adminMixed.status, 409);
  });
  await api('POST', `/shared/teaching-sessions/${otherTeacher.body.session.id}/end`, 'teacher-b');
  const adminSession = await start(payload(['class-e', 'class-a']), 'admin-a');
  const partialTeacherEnd = await api('POST', `/shared/teaching-sessions/${adminSession.body.session.id}/end`, 'teacher-a');
  const adminEnd = await api('POST', `/shared/teaching-sessions/${adminSession.body.session.id}/end`, 'admin-a');
  check('admin may teach mixed-owner classes; one-class teacher cannot end the group', () => {
    assert.equal(adminSession.status, 201);
    assert.equal(partialTeacherEnd.status, 403);
    assert.equal(adminEnd.status, 200);
  });
  const unrelated = await api('GET', '/unrelated-check');
  check('route-scoped authorization leaves unrelated APIs reachable', () => assert.equal(unrelated.status, 200));

  const created = await start(payload(['class-b', 'class-a']));
  const sessionId = created.body.session?.id;
  check('two classes create one shared log and frozen relations', () => {
    assert.equal(created.status, 201);
    assert.deepEqual(created.body.session.classIds, ['class-a', 'class-b']);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM teaching_logs WHERE ended_at IS NULL').get().n, 1);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM teaching_log_classes WHERE teaching_log_id = ?').get(sessionId).n, 2);
    const row = db.prepare('SELECT subject_id, shared_subject_id, shared_lesson_id FROM teaching_logs WHERE id = ?').get(sessionId);
    assert.equal(row.subject_id, null);
    assert.equal(row.shared_subject_id, 'subject-a');
    assert.equal(row.shared_lesson_id, 'lesson-a');
  });
  const resumed = await start(payload(['class-a', 'class-b']));
  const conflictSubset = await start(payload(['class-a']));
  const conflictOverlap = await start(payload(['class-b', 'class-c']));
  const activeB = await api('GET', '/shared/teaching-sessions/active?classId=class-b', 'teacher-a');
  check('exact retry resumes; overlapping and subset requests conflict', () => {
    assert.equal(resumed.status, 200);
    assert.equal(resumed.body.resumed, true);
    assert.equal(resumed.body.session.id, sessionId);
    assert.equal(conflictSubset.status, 409);
    assert.equal(conflictOverlap.status, 409);
    assert.equal(activeB.body.session.id, sessionId);
  });
  const legacyConflict = await api('POST', '/teaching-logs/start', 'teacher-a', { classId: 'class-b' });
  const legacyPatch = await api('PATCH', `/teaching-logs/${sessionId}`, 'teacher-a', { notes: 'không được' });
  const foreignPatch = await api('PATCH', `/teaching-logs/${sessionId}`, 'teacher-b', { notes: 'không được' });
  const legacyDelete = await api('DELETE', `/teaching-logs/${sessionId}`, 'teacher-a');
  const deniedRead = await api('GET', `/shared/teaching-sessions/${sessionId}`, 'teacher-b');
  check('legacy API cannot take over shared session and foreign teacher cannot read', () => {
    assert.deepEqual([legacyConflict.status, legacyPatch.status, foreignPatch.status, legacyDelete.status, deniedRead.status], [409, 409, 403, 409, 403]);
  });
  const unassign = await api('DELETE', '/shared/subjects/subject-a/classes/class-b', 'teacher-a');
  const deleteLesson = await api('DELETE', '/shared/lessons/lesson-a', 'teacher-a');
  const deleteClass = await api('DELETE', '/classes/class-b', 'teacher-a');
  check('session history protects lesson, assignment and participant class', () => {
    assert.deepEqual([unassign.status, deleteLesson.status, deleteClass.status], [409, 409, 409]);
  });
  const ended = await api('POST', `/shared/teaching-sessions/${sessionId}/end`, 'teacher-a');
  const endedAgain = await api('POST', `/shared/teaching-sessions/${sessionId}/end`, 'teacher-a');
  const noActive = await api('GET', '/shared/teaching-sessions/active?classId=class-b', 'teacher-a');
  check('end is idempotent and clears active lookup for all classes', () => {
    assert.equal(ended.status, 200);
    assert.equal(endedAgain.body.session.endedAt, ended.body.session.endedAt);
    assert.equal(noActive.body.session, null);
  });
  const four = await start(payload(['class-d', 'class-b', 'class-a', 'class-c']));
  check('four classes reuse one curriculum item and one log', () => {
    assert.equal(four.status, 201);
    assert.equal(four.body.session.classIds.length, 4);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM teaching_logs WHERE ended_at IS NULL').get().n, 1);
    assert.equal(db.prepare('PRAGMA foreign_key_check').all().length, 0);
  });
  await api('POST', `/shared/teaching-sessions/${four.body.session.id}/end`, 'teacher-a');
  const one = await start(payload(['class-c']));
  const legacy = await api('POST', '/teaching-logs/start', 'teacher-a', { classId: 'class-a' });
  check('one-class shared and legacy teaching coexist after group ends', () => {
    assert.equal(one.status, 201);
    assert.equal(one.body.session.classIds.length, 1);
    assert.equal(legacy.status, 201);
    assert.equal(db.prepare('PRAGMA foreign_key_check').all().length, 0);
  });
  console.log(`Shared teaching lifecycle: ${passed}/${passed} checks passed`);
} finally {
  if (server) await new Promise((resolve) => server.close(resolve));
  if (db) db.close();
  rmSync(dataDir, { recursive: true, force: true });
}

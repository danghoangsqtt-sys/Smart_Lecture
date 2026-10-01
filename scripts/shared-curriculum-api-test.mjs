import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

const dataDir = mkdtempSync(path.join(tmpdir(), 'smartlecture-shared-api-'));
process.env.DATA_DIR = dataDir;
process.env.DB_PATH = path.join(dataDir, 'test.db');
let server;
let db;
let passed = 0;
function check(ok, label) {
  if (!ok) throw new Error(`FAIL ${label}`);
  passed++;
  console.log(`PASS ${label}`);
}

try {
  const [{ default: express }, { default: jwt }, connection, { JWT_SECRET, MEDIA_DIR }, { default: sharedRoutes },
    { default: lecturesRoutes }, { default: questionsRoutes }, { errorHandler }, { startGameWithSnapshot }, { createRoomStore }] = await Promise.all([
    import('express'), import('jsonwebtoken'), import('../server/dist/db/connection.js'),
    import('../server/dist/config.js'), import('../server/dist/routes/sharedCurriculum.routes.js'),
    import('../server/dist/routes/lectures.routes.js'), import('../server/dist/routes/questions.routes.js'),
    import('../server/dist/utils/errors.js'),
    import('../server/dist/services/gameQuestionSnapshot.js'), import('../server/dist/realtime/roomStore.js'),
  ]);
  db = connection.db;
  connection.migrate();
  const users = [
    ['admin-a', 'admin', 'admin'], ['teacher-a', 'teacher.a', 'teacher'],
    ['teacher-b', 'teacher.b', 'teacher'], ['student-a', 'student.a', 'student'],
  ];
  for (const [id, username, role] of users) {
    db.prepare('INSERT INTO users (id, username, password_hash, role, display_name, student_code) VALUES (?, ?, ?, ?, ?, ?)')
      .run(id, username, 'unused', role, username, role === 'student' ? 'ST-001' : null);
  }
  const classes = [['class-a', 'teacher-a'], ['class-b', 'teacher-a'], ['class-c', 'teacher-b']];
  for (const [id, teacher] of classes) db.prepare('INSERT INTO classes (id, name, teacher_id) VALUES (?, ?, ?)').run(id, id, teacher);
  db.prepare('INSERT INTO enrollments (class_id, student_id) VALUES (?, ?)').run('class-a', 'student-a');
  const token = (id) => jwt.sign({ sub: id, sv: 0 }, JWT_SECRET, { expiresIn: '1h' });
  const auth = Object.fromEntries(users.map(([id]) => [id, token(id)]));

  const app = express();
  app.use(express.json());
  app.use('/api', lecturesRoutes);
  app.use('/api', sharedRoutes);
  app.use('/api', questionsRoutes);
  app.use(errorHandler);
  server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}/api`;
  async function api(method, endpoint, user, body) {
    const response = await fetch(`${base}${endpoint}`, {
      method,
      headers: { 'Content-Type': 'application/json', ...(user ? { Authorization: `Bearer ${auth[user]}` } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: response.status, body: await response.json() };
  }

  const created = await api('POST', '/shared/subjects', 'teacher-a', { name: 'Mạch điện', description: 'Chung nhiều lớp' });
  const subjectId = created.body.subject?.id;
  check(created.status === 201 && subjectId && created.body.subject.owner_id === 'teacher-a', 'teacher creates class-independent subject');
  const deniedEdit = await api('PATCH', `/shared/subjects/${subjectId}`, 'teacher-b', { name: 'Sai quyền' });
  const deniedRead = await api('GET', `/shared/subjects/${subjectId}/lessons`, 'student-a');
  check(deniedEdit.status === 403 && deniedRead.status === 403, 'other teacher and unassigned student cannot access subject');

  const lesson = await api('POST', `/shared/subjects/${subjectId}/lessons`, 'teacher-a', { title: 'Bài 1', sortOrder: 1 });
  const lessonId = lesson.body.lesson?.id;
  check(lesson.status === 201 && lessonId, 'teacher creates canonical lesson');
  const assignA = await api('POST', `/shared/subjects/${subjectId}/classes`, 'teacher-a', { classId: 'class-a' });
  const assignB = await api('POST', `/shared/subjects/${subjectId}/classes`, 'teacher-a', { classId: 'class-b' });
  const duplicate = await api('POST', `/shared/subjects/${subjectId}/classes`, 'teacher-a', { classId: 'class-a' });
  const crossTeacher = await api('POST', `/shared/subjects/${subjectId}/classes`, 'teacher-a', { classId: 'class-c' });
  check(assignA.status === 200 && assignB.status === 200 && duplicate.body.assignment.id === assignA.body.assignment.id
    && crossTeacher.status === 403 && db.prepare('SELECT COUNT(*) AS n FROM shared_lessons WHERE subject_id = ?').get(subjectId).n === 1,
  'one canonical lesson serves two classes without duplicate assignment or cross-teacher access');
  const studentLessons = await api('GET', `/shared/subjects/${subjectId}/lessons`, 'student-a');
  check(studentLessons.status === 200 && studentLessons.body.lessons.length === 1, 'enrolled student sees assigned subject lessons');

  const progressA = await api('PUT', `/shared/classes/class-a/subjects/${subjectId}/lessons/${lessonId}/progress`, 'teacher-a',
    { plannedPeriods: 4, completedPeriods: 2, status: 'in_progress' });
  const progressB = await api('PUT', `/shared/classes/class-b/subjects/${subjectId}/lessons/${lessonId}/progress`, 'teacher-a',
    { plannedPeriods: 4, completedPeriods: 0, status: 'pending' });
  const unassign = await api('DELETE', `/shared/subjects/${subjectId}/classes/class-a`, 'teacher-a');
  check(progressA.status === 200 && progressB.status === 200 && progressA.body.progress.id !== progressB.body.progress.id
    && unassign.status === 409, 'class progress is separate and historical assignment cannot be removed');
  const deleteUsedSubject = await api('DELETE', `/shared/subjects/${subjectId}`, 'teacher-a');
  const deleteUsedLesson = await api('DELETE', `/shared/lessons/${lessonId}`, 'teacher-a');
  const emptySubject = await api('POST', '/shared/subjects', 'teacher-a', { name: 'Môn tạo nhầm' });
  const deleteEmptySubject = await api('DELETE', `/shared/subjects/${emptySubject.body.subject.id}`, 'teacher-a');
  check(deleteUsedSubject.status === 409 && deleteUsedLesson.status === 409 && deleteEmptySubject.status === 200,
    'used curriculum is protected while empty mistaken subject can be removed');

  db.prepare("INSERT INTO questions (id, owner_id, type, content, options_json, correct_answer) VALUES (?, ?, 'mcq', ?, ?, ?)")
    .run('question-a', 'teacher-a', 'Câu 1', JSON.stringify(['A. Đúng', 'B. Sai']), 'A');
  db.prepare("INSERT INTO questions (id, owner_id, type, content, options_json, correct_answer) VALUES (?, ?, 'mcq', ?, ?, ?)")
    .run('question-b', 'teacher-b', 'Không thuộc quyền', JSON.stringify(['A', 'B']), 'A');
  const linked = await api('POST', `/shared/lessons/${lessonId}/questions`, 'teacher-a', { questionId: 'question-a', sortOrder: 2 });
  const linkedAgain = await api('POST', `/shared/lessons/${lessonId}/questions`, 'teacher-a', { questionId: 'question-a', sortOrder: 3 });
  const foreignQuestion = await api('POST', `/shared/lessons/${lessonId}/questions`, 'teacher-a', { questionId: 'question-b' });
  const studentQuestion = await api('GET', `/shared/lessons/${lessonId}/questions`, 'student-a');
  check(linked.status === 200 && linkedAgain.status === 200 && foreignQuestion.status === 404 && studentQuestion.status === 403
    && db.prepare('SELECT COUNT(*) AS n FROM shared_lesson_questions WHERE lesson_id = ?').get(lessonId).n === 1,
  'question links are idempotent, permission-checked and hide answers from students');
  const deleteLinkedQuestion = await api('DELETE', '/questions/question-a', 'teacher-a');
  const bulkDeleteLinked = await api('POST', '/questions/bulk-delete', 'teacher-a', { ids: ['question-a'] });
  check(deleteLinkedQuestion.status === 409 && bulkDeleteLinked.status === 200 && bulkDeleteLinked.body.deleted === 0,
    'legacy question delete endpoints preserve linked curriculum instead of failing with SQLite error');

  const link = await api('POST', `/shared/lessons/${lessonId}/materials/link`, 'teacher-a',
    { title: 'Video tham khảo', linkUrl: 'https://example.test/video' });
  check(link.status === 201 && link.body.material.asset_status === 'ready' && !('file_path' in link.body.material),
    'link material is ready without leaking disk path');
  const unsafeLinkId = randomUUID();
  db.prepare("INSERT INTO shared_lesson_materials (id, lesson_id, type, title, link_url, asset_status) VALUES (?, ?, 'link', ?, ?, 'ready')")
    .run(unsafeLinkId, lessonId, 'Bad legacy link', 'javascript:alert(1)');
  const studentMaterials = await api('GET', `/shared/lessons/${lessonId}/materials`, 'student-a');
  const teacherMaterials = await api('GET', `/shared/lessons/${lessonId}/materials`, 'teacher-a');
  check(studentMaterials.status === 200 && !studentMaterials.body.materials.some((item) => item.id === unsafeLinkId)
    && teacherMaterials.body.materials.find((item) => item.id === unsafeLinkId)?.link_url === null,
  'unsafe legacy link is not exposed to students or rendered as active URL');
  const uploadBody = new FormData();
  uploadBody.set('title', 'Sơ đồ PDF');
  uploadBody.set('file', new Blob([Buffer.from('%PDF-test-content')], { type: 'application/pdf' }), 'so-do.pdf');
  const uploadResponse = await fetch(`${base}/shared/lessons/${lessonId}/materials`,
    { method: 'POST', headers: { Authorization: `Bearer ${auth['teacher-a']}` }, body: uploadBody });
  const uploaded = await uploadResponse.json();
  const uploadId = uploaded.material?.id;
  const uploadRow = db.prepare('SELECT file_path, asset_status FROM shared_lesson_materials WHERE id = ?').get(uploadId);
  const deniedUpload = await fetch(`${base}/shared/lessons/${lessonId}/materials`,
    { method: 'POST', headers: { Authorization: `Bearer ${auth['teacher-b']}` }, body: uploadBody });
  check(uploadResponse.status === 201 && uploadRow.asset_status === 'ready' && existsSync(path.join(MEDIA_DIR, uploadRow.file_path))
    && deniedUpload.status === 403 && !('file_path' in uploaded.material),
  'new file upload is independent, permission-checked and hides disk path');
  const spoofedBody = new FormData();
  spoofedBody.set('file', new Blob([Buffer.from('not a PDF')], { type: 'application/pdf' }), 'spoofed.pdf');
  const spoofed = await fetch(`${base}/shared/lessons/${lessonId}/materials`,
    { method: 'POST', headers: { Authorization: `Bearer ${auth['teacher-a']}` }, body: spoofedBody });
  check(spoofed.status === 400 && !db.prepare("SELECT 1 FROM shared_lesson_materials WHERE original_name = 'spoofed.pdf'").get(),
    'new upload rejects spoofed PDF content');
  const uploadedDeleted = await api('DELETE', `/shared/materials/${uploadId}`, 'teacher-a');
  check(uploadedDeleted.status === 200 && !existsSync(path.join(MEDIA_DIR, uploadRow.file_path)),
    'deleting a new shared material cleans up only its own file');
  db.prepare('INSERT INTO subjects (id, class_id, name) VALUES (?, ?, ?)').run('legacy-subject', 'class-a', 'Cũ');
  db.prepare('INSERT INTO lectures (id, class_id, subject_id, title) VALUES (?, ?, ?, ?)')
    .run('legacy-lecture', 'class-a', 'legacy-subject', 'Bài cũ');
  const sourceFile = 'legacy-slide.pdf';
  writeFileSync(path.join(MEDIA_DIR, sourceFile), Buffer.from('%PDF-isolated legacy slide'));
  db.prepare("INSERT INTO materials (id, lecture_id, type, title, file_path, size_bytes, mime_type) VALUES (?, ?, 'pdf', ?, ?, ?, ?)")
    .run('legacy-material', 'legacy-lecture', 'Slide cũ', sourceFile, 26, 'application/pdf');
  const pendingId = randomUUID();
  db.prepare("INSERT INTO shared_lesson_materials (id, lesson_id, type, title, asset_status) VALUES (?, ?, 'pdf', ?, 'pending_copy')")
    .run(pendingId, lessonId, 'Slide cũ');
  db.prepare("INSERT INTO shared_curriculum_legacy_map (id, source_kind, source_id, target_kind, target_id) VALUES (?, 'material', ?, 'material', ?)")
    .run(randomUUID(), 'legacy-material', pendingId);
  const pendingStream = await fetch(`${base}/shared/materials/${pendingId}/stream`, { headers: { Authorization: `Bearer ${auth['student-a']}` } });
  const copied = await api('POST', `/shared/materials/${pendingId}/copy-legacy`, 'teacher-a');
  const copiedAgain = await api('POST', `/shared/materials/${pendingId}/copy-legacy`, 'teacher-a');
  const copiedRow = db.prepare('SELECT file_path, asset_status FROM shared_lesson_materials WHERE id = ?').get(pendingId);
  check(pendingStream.status === 404 && copied.status === 200 && copiedAgain.status === 200
    && copiedRow.asset_status === 'ready' && copiedRow.file_path !== sourceFile
    && readFileSync(path.join(MEDIA_DIR, copiedRow.file_path)).equals(readFileSync(path.join(MEDIA_DIR, sourceFile))),
  'pending legacy file is hidden until independent verified copy, retry is idempotent');
  const legacyDelete = await api('DELETE', '/materials/legacy-material', 'teacher-a');
  const sharedStream = await fetch(`${base}/shared/materials/${pendingId}/stream`,
    { headers: { Authorization: `Bearer ${auth['student-a']}`, Range: 'bytes=5-12' } });
  const streamed = await sharedStream.text();
  const sharedBytes = readFileSync(path.join(MEDIA_DIR, copiedRow.file_path)).length;
  check(legacyDelete.status === 200 && sharedStream.status === 206 && streamed === 'isolated' && sharedBytes === 26,
  'deleting legacy material does not remove shared copy; authenticated range stream works');
  const missingId = randomUUID();
  db.prepare("INSERT INTO materials (id, lecture_id, type, title, file_path) VALUES (?, ?, 'pdf', ?, ?)")
    .run('legacy-missing', 'legacy-lecture', 'Missing', 'missing.pdf');
  db.prepare("INSERT INTO shared_lesson_materials (id, lesson_id, type, title, asset_status) VALUES (?, ?, 'pdf', ?, 'pending_copy')")
    .run(missingId, lessonId, 'Missing');
  db.prepare("INSERT INTO shared_curriculum_legacy_map (id, source_kind, source_id, target_kind, target_id) VALUES (?, 'material', ?, 'material', ?)")
    .run(randomUUID(), 'legacy-missing', missingId);
  const missingCopy = await api('POST', `/shared/materials/${missingId}/copy-legacy`, 'teacher-a');
  check(missingCopy.status === 409 && db.prepare('SELECT asset_status, file_path FROM shared_lesson_materials WHERE id = ?').get(missingId).file_path === null,
    'missing source keeps shared asset pending and inaccessible');

  const gameId = randomUUID();
  db.prepare(`INSERT INTO game_sessions (id, host_teacher_id, class_id, game_type, room_code, question_ids_json)
    VALUES (?, ?, ?, 'quick_quiz', ?, ?)`).run(gameId, 'teacher-a', 'class-a', 'SC8802', JSON.stringify(['question-a']));
  const snapshot = startGameWithSnapshot(gameId);
  db.prepare("UPDATE questions SET content = 'Đã sửa sau khi bắt đầu' WHERE id = 'question-a'").run();
  const roomStore = createRoomStore({ rooms: new Map(), initCircuitSimulate: () => {}, restoreCircuitSimulateRoom: () => false });
  const restored = roomStore.loadRoomFromDb(gameId);
  check(snapshot[0].content === 'Câu 1' && restored.questions[0].content === 'Câu 1'
    && db.prepare('SELECT questions_snapshot_json FROM game_sessions WHERE id = ?').get(gameId).questions_snapshot_json,
  'game start stores immutable ordered question payload and restart restores snapshot');
  const brokenGameId = randomUUID();
  db.prepare(`INSERT INTO game_sessions (id, host_teacher_id, class_id, game_type, room_code, question_ids_json)
    VALUES (?, ?, ?, 'quick_quiz', ?, ?)`).run(brokenGameId, 'teacher-a', 'class-a', 'SC8803', JSON.stringify(['deleted-question']));
  let rejectedMissing = false;
  try { startGameWithSnapshot(brokenGameId); } catch { rejectedMissing = true; }
  const brokenGame = db.prepare('SELECT status, questions_snapshot_json FROM game_sessions WHERE id = ?').get(brokenGameId);
  check(rejectedMissing && brokenGame.status === 'lobby' && brokenGame.questions_snapshot_json === null,
    'missing bank question aborts start without partial status change');
  check(db.prepare('PRAGMA foreign_key_check').all().length === 0, 'isolated database foreign keys remain valid');
  console.log(`Shared curriculum API: ${passed}/${passed} passed`);
} finally {
  if (server) await new Promise((resolve) => server.close(resolve));
  if (db) db.close();
  const root = path.resolve(tmpdir());
  if (!path.resolve(dataDir).startsWith(`${root}${path.sep}`)) throw new Error('Unsafe temporary cleanup path');
  rmSync(dataDir, { recursive: true, force: true });
}

import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';

const dataDir = mkdtempSync(path.join(tmpdir(), 'smartlecture-shared-curriculum-'));
const dbPath = path.join(dataDir, 'fixture.db');
process.env.DATA_DIR = dataDir;
process.env.DB_PATH = dbPath;
let db;
let passed = 0;
function check(condition, label) {
  if (!condition) throw new Error(`FAIL ${label}`);
  passed++;
  console.log(`PASS ${label}`);
}

try {
  const bootstrap = new DatabaseSync(dbPath);
  bootstrap.exec('PRAGMA foreign_keys = ON');
  bootstrap.exec(readFileSync(fileURLToPath(new URL('../server/src/db/schema.sql', import.meta.url)), 'utf8'));
  bootstrap.exec(`
    ALTER TABLE users ADD COLUMN student_code TEXT;
    CREATE TABLE subjects (id TEXT PRIMARY KEY, class_id TEXT NOT NULL REFERENCES classes(id), name TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT (datetime('now')));
    ALTER TABLE lectures ADD COLUMN subject_id TEXT REFERENCES subjects(id);
    CREATE TABLE teaching_plans (id TEXT PRIMARY KEY, class_id TEXT NOT NULL REFERENCES classes(id),
      subject_id TEXT REFERENCES subjects(id), name TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT (datetime('now')));
    CREATE TABLE curriculum_items (id TEXT PRIMARY KEY, teaching_plan_id TEXT NOT NULL REFERENCES teaching_plans(id),
      lecture_id TEXT REFERENCES lectures(id), topic TEXT NOT NULL, planned_periods INTEGER NOT NULL DEFAULT 1,
      completed_periods INTEGER NOT NULL DEFAULT 0, status TEXT NOT NULL DEFAULT 'pending',
      created_at TEXT NOT NULL DEFAULT (datetime('now')));
    CREATE TABLE lesson_plans (id TEXT PRIMARY KEY, curriculum_item_id TEXT NOT NULL REFERENCES curriculum_items(id),
      title TEXT NOT NULL, script TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL DEFAULT (datetime('now')));
    INSERT INTO schema_migrations (version) VALUES (28);
  `);
  bootstrap.prepare("INSERT INTO users (id, username, password_hash, role, display_name) VALUES ('teacher', 'teacher', 'unused', 'teacher', 'Teacher')").run();
  const addClass = bootstrap.prepare('INSERT INTO classes (id, name, teacher_id) VALUES (?, ?, ?)');
  addClass.run('class-a', 'Class A', 'teacher');
  addClass.run('class-b', 'Class B', 'teacher');
  const addSubject = bootstrap.prepare('INSERT INTO subjects (id, class_id, name) VALUES (?, ?, ?)');
  addSubject.run('subject-a', 'class-a', 'Cùng tên');
  addSubject.run('subject-b', 'class-b', 'Cùng tên');
  const addLecture = bootstrap.prepare('INSERT INTO lectures (id, class_id, subject_id, title) VALUES (?, ?, ?, ?)');
  addLecture.run('lecture-a', 'class-a', 'subject-a', 'Bài 1');
  addLecture.run('lecture-b', 'class-b', 'subject-b', 'Bài 1');
  addLecture.run('lecture-orphan', 'class-a', null, 'Chưa xác định môn');
  addLecture.run('lecture-cross', 'class-b', 'subject-a', 'Sai lớp');
  const addMaterial = bootstrap.prepare('INSERT INTO materials (id, lecture_id, type, title, file_path, link_url) VALUES (?, ?, ?, ?, ?, ?)');
  addMaterial.run('material-file', 'lecture-a', 'pptx', 'Slide cũ', 'legacy-slide.pptx', null);
  addMaterial.run('material-link', 'lecture-a', 'link', 'Liên kết', null, 'https://example.test/video');
  addMaterial.run('material-orphan', 'lecture-orphan', 'video', 'Video chưa map', 'legacy-video.mp4', null);
  const addPlan = bootstrap.prepare('INSERT INTO teaching_plans (id, class_id, subject_id, name) VALUES (?, ?, ?, ?)');
  addPlan.run('plan-a', 'class-a', 'subject-a', 'Kế hoạch A');
  addPlan.run('plan-b', 'class-b', 'subject-b', 'Kế hoạch B');
  addPlan.run('plan-orphan', 'class-a', null, 'Chưa xác định môn');
  const addItem = bootstrap.prepare('INSERT INTO curriculum_items (id, teaching_plan_id, lecture_id, topic, planned_periods, completed_periods, status) VALUES (?, ?, ?, ?, ?, ?, ?)');
  addItem.run('item-a', 'plan-a', 'lecture-a', 'Bài A', 3, 2, 'in_progress');
  addItem.run('item-b', 'plan-b', 'lecture-b', 'Bài B', 2, 0, 'pending');
  addItem.run('item-duplicate', 'plan-a', 'lecture-a', 'Bài A lần 2', 1, 0, 'pending');
  addItem.run('item-no-lecture', 'plan-a', null, 'Chưa gắn bài', 1, 0, 'pending');
  addItem.run('item-cross', 'plan-b', 'lecture-a', 'Sai môn', 1, 0, 'pending');
  bootstrap.prepare("INSERT INTO lesson_plans (id, curriculum_item_id, title, script) VALUES ('lesson-plan-a', 'item-a', 'Kịch bản A', 'Nội dung cũ')").run();
  bootstrap.prepare("INSERT INTO lesson_plans (id, curriculum_item_id, title) VALUES ('lesson-plan-orphan', 'item-no-lecture', 'Chưa map')").run();
  bootstrap.prepare("INSERT INTO questions (id, owner_id, type, content) VALUES ('question-a', 'teacher', 'mcq', 'Câu hỏi ngân hàng')").run();

  const legacyTables = ['subjects', 'lectures', 'materials', 'teaching_plans', 'curriculum_items', 'lesson_plans', 'questions'];
  const legacyCounts = Object.fromEntries(legacyTables.map((table) => [table, bootstrap.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n]));
  bootstrap.exec(`CREATE TRIGGER test_shared_map_failure BEFORE INSERT ON shared_curriculum_legacy_map
    WHEN NEW.source_kind = 'lecture' AND NEW.source_id = 'lecture-a'
    BEGIN SELECT RAISE(ABORT, 'expected_shared_map_failure'); END`);
  bootstrap.close();

  const connection = await import('../server/dist/db/connection.js');
  db = connection.db;
  let failedAsExpected = false;
  try { connection.migrate(); } catch (error) { failedAsExpected = error instanceof Error && error.message.includes('expected_shared_map_failure'); }
  const versionAfterFailure = db.prepare('SELECT MAX(version) AS v FROM schema_migrations').get().v;
  check(failedAsExpected && versionAfterFailure === 28
    && db.prepare('SELECT COUNT(*) AS n FROM shared_subjects').get().n === 0
    && db.prepare('SELECT COUNT(*) AS n FROM shared_curriculum_legacy_map').get().n === 0,
  'migration failure rolls back all copied rows and leaves version at v28');
  db.exec('DROP TRIGGER test_shared_map_failure');
  connection.migrate();
  check(db.prepare('SELECT MAX(version) AS v FROM schema_migrations').get().v === 30, 'retry applies v29 and v30');

  const subjectMaps = db.prepare("SELECT source_id, target_id FROM shared_curriculum_legacy_map WHERE source_kind = 'subject' ORDER BY source_id").all();
  check(subjectMaps.length === 2 && subjectMaps[0].target_id !== subjectMaps[1].target_id
    && db.prepare("SELECT COUNT(*) AS n FROM shared_subjects WHERE name = 'Cùng tên'").get().n === 2,
  'same-name legacy subjects remain distinct shared subjects');
  check(db.prepare('SELECT COUNT(*) AS n FROM class_subject_assignments').get().n === 2
    && db.prepare('SELECT COUNT(*) AS n FROM shared_lessons').get().n === 2,
  'class–subject assignments and explicit lectures map without per-class lesson copies');
  db.prepare('INSERT INTO class_subject_assignments (id, class_id, subject_id) VALUES (?, ?, ?)')
    .run(randomUUID(), 'class-b', subjectMaps[0].target_id);
  check(db.prepare('SELECT COUNT(*) AS n FROM class_subject_assignments WHERE subject_id = ?').get(subjectMaps[0].target_id).n === 2
    && db.prepare('SELECT COUNT(*) AS n FROM class_subject_assignments WHERE class_id = ?').get('class-b').n === 2
    && db.prepare('SELECT COUNT(*) AS n FROM shared_lessons').get().n === 2,
  'one shared subject can serve two classes while a class studies two subjects without copying lessons');

  const fileMaterial = db.prepare(`SELECT sm.file_path, sm.asset_status FROM shared_lesson_materials sm
    JOIN shared_curriculum_legacy_map m ON m.target_id = sm.id WHERE m.source_kind = 'material' AND m.source_id = 'material-file'`).get();
  const linkMaterial = db.prepare(`SELECT sm.link_url, sm.asset_status FROM shared_lesson_materials sm
    JOIN shared_curriculum_legacy_map m ON m.target_id = sm.id WHERE m.source_kind = 'material' AND m.source_id = 'material-link'`).get();
  check(fileMaterial?.file_path === null && fileMaterial.asset_status === 'pending_copy'
    && linkMaterial?.asset_status === 'ready' && linkMaterial.link_url === 'https://example.test/video',
  'legacy file awaits verified copy while URL link is immediately usable');

  const progress = db.prepare(`SELECT p.planned_periods, p.completed_periods, p.status FROM class_lesson_progress p
    JOIN shared_curriculum_legacy_map m ON m.target_id = p.id WHERE m.source_kind = 'curriculum_item' AND m.source_id = 'item-a'`).get();
  check(progress?.planned_periods === 3 && progress.completed_periods === 2 && progress.status === 'in_progress'
    && db.prepare("SELECT COUNT(*) AS n FROM shared_curriculum_legacy_map WHERE source_kind = 'lesson_plan'").get().n === 1,
  'explicit plan/item/lesson-plan mapping preserves per-class progress');
  const issues = db.prepare('SELECT source_kind, source_id, reason FROM shared_curriculum_mapping_issues ORDER BY source_kind, source_id').all();
  check(issues.some((row) => row.source_id === 'lecture-orphan' && row.reason === 'MISSING_SUBJECT')
    && issues.some((row) => row.source_id === 'lecture-cross' && row.reason === 'CROSS_CLASS_SUBJECT')
    && issues.some((row) => row.source_id === 'item-no-lecture' && row.reason === 'MISSING_LECTURE')
    && issues.some((row) => row.source_id === 'item-cross' && row.reason === 'LECTURE_SUBJECT_MISMATCH')
    && issues.some((row) => row.source_id === 'item-duplicate' && row.reason === 'DUPLICATE_LESSON_PROGRESS')
    && issues.some((row) => row.source_id === 'lesson-plan-orphan' && row.reason === 'UNMAPPED_ITEM'),
  'ambiguous/mismatched legacy references are reported, never guessed');
  check(db.prepare('SELECT COUNT(*) AS n FROM shared_lesson_questions').get().n === 0
    && db.prepare('SELECT COUNT(*) AS n FROM questions').get().n === 1,
  'question bank remains intact without text-based lesson matching');

  const beforeReplay = ['shared_subjects', 'class_subject_assignments', 'shared_lessons', 'shared_lesson_materials', 'class_lesson_progress', 'shared_curriculum_legacy_map', 'shared_curriculum_mapping_issues']
    .map((table) => db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n);
  const { migrateSharedCurriculum } = await import('../server/dist/db/migrations/029-shared-curriculum.js');
  migrateSharedCurriculum(db);
  connection.migrate();
  const afterReplay = ['shared_subjects', 'class_subject_assignments', 'shared_lessons', 'shared_lesson_materials', 'class_lesson_progress', 'shared_curriculum_legacy_map', 'shared_curriculum_mapping_issues']
    .map((table) => db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n);
  check(JSON.stringify(beforeReplay) === JSON.stringify(afterReplay), 'replay is idempotent and does not duplicate mappings');
  check(legacyTables.every((table) => db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n === legacyCounts[table])
    && db.prepare('PRAGMA foreign_key_check').all().length === 0
    && db.prepare('PRAGMA integrity_check').get().integrity_check === 'ok',
  'legacy row counts, foreign keys and integrity remain unchanged');
  console.log(`Shared curriculum migration: ${passed}/${passed} passed`);
} finally {
  if (db) db.close();
  const tempRoot = path.resolve(tmpdir());
  if (!path.resolve(dataDir).startsWith(`${tempRoot}${path.sep}`)) throw new Error('Unsafe temporary cleanup path');
  rmSync(dataDir, { recursive: true, force: true });
}

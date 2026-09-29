import assert from 'node:assert/strict';
import { copyFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';

const dataDir = mkdtempSync(path.join(tmpdir(), 'smartlecture-multiclass-schema-'));
const dbPath = path.join(dataDir, 'smart-lecture.db');
const backupPath = path.join(dataDir, 'before-v26.db');
process.env.DATA_DIR = dataDir;
process.env.DB_PATH = dbPath;

let db;
let migrate;
let backup;
let passed = 0;

function check(name, verify) {
  verify();
  passed += 1;
  console.log(`PASS  ${name}`);
}

function count(table) {
  const allowed = new Set(['teaching_logs', 'attendance_sessions', 'game_sessions', 'game_results', 'teaching_log_classes']);
  if (!allowed.has(table)) throw new Error('Unexpected test table');
  return db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get().count;
}

try {
  ({ db, migrate } = await import('../server/dist/db/connection.js'));
  migrate();

  db.prepare('INSERT INTO users (id, username, password_hash, role, display_name) VALUES (?, ?, ?, ?, ?)')
    .run('teacher', 'schema-teacher', 'unused', 'teacher', 'Teacher');
  db.prepare('INSERT INTO users (id, username, password_hash, role, display_name) VALUES (?, ?, ?, ?, ?)')
    .run('student', 'schema-student', 'unused', 'student', 'Student');
  const insertClass = db.prepare('INSERT INTO classes (id, name, teacher_id) VALUES (?, ?, ?)');
  insertClass.run('class-a', 'Class A', 'teacher');
  insertClass.run('class-b', 'Class B', 'teacher');
  db.prepare('INSERT INTO teaching_logs (id, class_id) VALUES (?, ?)').run('legacy-log', 'class-a');
  db.prepare('INSERT INTO attendance_sessions (id, class_id, session_date) VALUES (?, ?, ?)')
    .run('legacy-attendance', 'class-a', '2026-09-29');
  db.prepare('INSERT INTO game_sessions (id, host_teacher_id, class_id, game_type, room_code) VALUES (?, ?, ?, ?, ?)')
    .run('legacy-game', 'teacher', 'class-a', 'quiz', 'LEGACY26');
  db.prepare('INSERT INTO game_results (game_session_id, student_id, score) VALUES (?, ?, ?)')
    .run('legacy-game', 'student', 7);

  // The current schema creates v26 on a clean boot. Remove only the new table and
  // marker in this disposable database to reproduce a v25 installation.
  db.exec('DROP TABLE teaching_log_classes');
  db.prepare('DELETE FROM schema_migrations WHERE version = ?').run(26);
  db.exec('PRAGMA wal_checkpoint(TRUNCATE)');
  copyFileSync(dbPath, backupPath);

  migrate();
  check('v25 fixture upgrades to v26 without changing legacy rows', () => {
    assert.equal(db.prepare('SELECT MAX(version) AS version FROM schema_migrations').get().version, 26);
    assert.deepEqual([count('teaching_logs'), count('attendance_sessions'), count('game_sessions'), count('game_results')], [1, 1, 1, 1]);
    assert.equal(db.prepare('SELECT class_id FROM teaching_logs WHERE id = ?').get('legacy-log').class_id, 'class-a');
    assert.equal(count('teaching_log_classes'), 0);
  });

  const insertMember = db.prepare('INSERT INTO teaching_log_classes (id, teaching_log_id, class_id) VALUES (?, ?, ?)');
  insertMember.run(randomUUID(), 'legacy-log', 'class-a');
  insertMember.run(randomUUID(), 'legacy-log', 'class-b');
  check('relation accepts two distinct participant classes and has lookup index', () => {
    assert.equal(count('teaching_log_classes'), 2);
    const indexes = db.prepare('PRAGMA index_list(teaching_log_classes)').all();
    assert.ok(indexes.some((index) => index.name === 'idx_teaching_log_classes_class'));
  });
  check('relation enforces unique membership and foreign keys', () => {
    assert.throws(() => insertMember.run(randomUUID(), 'legacy-log', 'class-a'), /UNIQUE constraint failed/);
    assert.throws(() => insertMember.run(randomUUID(), 'legacy-log', 'missing-class'), /FOREIGN KEY constraint failed/);
    assert.throws(() => insertMember.run(randomUUID(), 'missing-log', 'class-a'), /FOREIGN KEY constraint failed/);
    assert.equal(count('teaching_log_classes'), 2);
  });

  migrate();
  check('a second boot is idempotent', () => {
    assert.equal(count('teaching_log_classes'), 2);
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM schema_migrations WHERE version = ?').get(26).count, 1);
  });

  backup = new DatabaseSync(backupPath);
  check('pre-upgrade backup remains readable and unchanged', () => {
    assert.equal(backup.prepare('SELECT MAX(version) AS version FROM schema_migrations').get().version, 25);
    assert.equal(backup.prepare('SELECT COUNT(*) AS count FROM teaching_logs').get().count, 1);
    assert.equal(backup.prepare('SELECT COUNT(*) AS count FROM game_results').get().count, 1);
    assert.equal(backup.prepare("SELECT COUNT(*) AS count FROM sqlite_master WHERE type = 'table' AND name = 'teaching_log_classes'").get().count, 0);
  });
  backup.close();
  backup = undefined;

  db.exec('DROP TABLE teaching_log_classes');
  db.prepare('DELETE FROM schema_migrations WHERE version = ?').run(26);
  db.exec('CREATE TABLE teaching_log_classes (id TEXT PRIMARY KEY)');
  check('failed migration rolls back its marker and permits a clean retry', () => {
    assert.throws(() => migrate(), /no such column: class_id/);
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM schema_migrations WHERE version = ?').get(26).count, 0);
    db.exec('DROP TABLE teaching_log_classes');
    migrate();
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM schema_migrations WHERE version = ?').get(26).count, 1);
    assert.deepEqual([count('teaching_logs'), count('attendance_sessions'), count('game_sessions'), count('game_results')], [1, 1, 1, 1]);
  });

  console.log(`Multi-class schema: ${passed}/${passed} passed`);
} finally {
  backup?.close();
  db?.close();
  rmSync(dataDir, { recursive: true, force: true });
}

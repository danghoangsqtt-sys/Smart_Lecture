import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { DatabaseSync, backup } from 'node:sqlite';
import { mkdtempSync, readFileSync, realpathSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';

const root = resolve(import.meta.dirname, '..');
const connectionUrl = pathToFileURL(join(root, 'server/dist/db/connection.js')).href;
const schemaSql = readFileSync(join(root, 'server/src/db/schema.sql'), 'utf8');

function fixture(mode) {
  const dir = mkdtempSync(join(tmpdir(), 'smartlecture-roster-migration-'));
  const path = join(dir, 'roster.db');
  const db = new DatabaseSync(path);
  try {
    db.exec(schemaSql);
    db.exec('ALTER TABLE users ADD COLUMN student_code TEXT');
    db.prepare('INSERT INTO schema_migrations (version) VALUES (26)').run();
    const user = db.prepare('INSERT INTO users (id, username, password_hash, role, display_name, student_code) VALUES (?, ?, ?, ?, ?, ?)');
    user.run('admin', 'admin', 'hash', 'admin', 'Admin', null);
    user.run('s1', 'student1', 'hash', 'student', 'Student 1', 'SV001');
    user.run('s2', mode === 'duplicate' ? 'STUDENT1' : 'student2', 'hash', 'student', 'Student 2', mode === 'duplicate' ? 'sv001' : 'SV002');
    db.prepare('INSERT INTO classes (id, name, teacher_id) VALUES (?, ?, ?)').run('c1', 'Class 1', 'admin');
    db.prepare('INSERT INTO classes (id, name, teacher_id) VALUES (?, ?, ?)').run('c2', 'Class 2', 'admin');
    db.prepare('INSERT INTO enrollments (class_id, student_id) VALUES (?, ?)').run('c1', 's1');
    db.prepare('INSERT INTO enrollments (class_id, student_id) VALUES (?, ?)').run('c1', 's2');
    if (mode === 'duplicate') db.prepare('INSERT INTO enrollments (class_id, student_id) VALUES (?, ?)').run('c2', 's2');
    if (mode === 'missing') {
      db.prepare('UPDATE users SET student_code = NULL WHERE id = ?').run('s2');
      db.prepare('DELETE FROM enrollments WHERE student_id = ?').run('s2');
    }
  } finally { db.close(); }
  return { dir, path, cleanup() {
    if (!resolve(dir).startsWith(`${resolve(tmpdir())}${sep}`)) throw new Error('Unsafe fixture cleanup path');
    rmSync(dir, { recursive: true, force: true });
  } };
}

function migrateFixture(fx) {
  const code = `import { migrate, db, rosterConstraintStatus } from ${JSON.stringify(connectionUrl)}; migrate(); console.log('ROSTER_STATUS=' + JSON.stringify(rosterConstraintStatus())); db.close();`;
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', code], {
    cwd: root,
    env: { ...process.env, DATA_DIR: fx.dir, DB_PATH: fx.path, MDNS_ENABLED: '0', SMARTLECTURE_TEST_MODE: '1' },
    encoding: 'utf8', timeout: 15000,
  });
  if (result.status !== 0) throw new Error(`Migration failed: ${result.stdout}\n${result.stderr}`);
  const statusLine = result.stdout.split(/\r?\n/).find((line) => line.startsWith('ROSTER_STATUS='));
  assert.ok(statusLine, `Missing status: ${result.stdout}`);
  return JSON.parse(statusLine.slice('ROSTER_STATUS='.length));
}

function inspect(path) {
  const db = new DatabaseSync(path, { readOnly: true });
  try {
    return {
      version: db.prepare('SELECT MAX(version) AS v FROM schema_migrations').get().v,
      users: db.prepare('SELECT id, username, student_code FROM users ORDER BY id').all(),
      enrollments: db.prepare('SELECT class_id, student_id FROM enrollments ORDER BY student_id, class_id').all(),
      history: db.prepare('SELECT student_id, class_id, ended_at FROM student_home_class_history ORDER BY student_id, class_id').all(),
      fk: db.prepare('PRAGMA foreign_key_check').all(),
      integrity: db.prepare('PRAGMA integrity_check').get().integrity_check,
    };
  } finally { db.close(); }
}

function checkClean() {
  const fx = fixture('clean');
  try {
    const before = inspect(fx.path);
    const status = migrateFixture(fx);
    assert.equal(status.enforced, true);
    assert.ok(Object.values(status.issues).every((value) => value === 0));
    const after = inspect(fx.path);
    assert.deepEqual(after.users, before.users);
    assert.deepEqual(after.enrollments, before.enrollments);
    assert.equal(after.history.length, 2);
    assert.equal(after.version, 27);
    assert.equal(after.integrity, 'ok');
    assert.deepEqual(after.fk, []);
    const db = new DatabaseSync(fx.path);
    try {
      assert.throws(() => db.prepare("INSERT INTO users (id, username, password_hash, role, display_name) VALUES ('s3', 'STUDENT1', 'hash', 'student', 'Other')").run(), /roster_username_duplicate|UNIQUE/);
      assert.throws(() => db.prepare("INSERT INTO users (id, username, password_hash, role, display_name, student_code) VALUES ('s3', 'student3', 'hash', 'student', 'Other', 'sv001')").run(), /roster_student_code_duplicate|UNIQUE/);
      assert.throws(() => db.prepare("INSERT INTO enrollments (class_id, student_id) VALUES ('c2', 's1')").run(), /roster_student_already_in_class|UNIQUE/);
      db.prepare("DELETE FROM enrollments WHERE class_id = 'c1' AND student_id = 's1'").run();
      assert.ok(db.prepare("SELECT ended_at FROM student_home_class_history WHERE student_id = 's1'").get().ended_at);
    } finally { db.close(); }
    const afterRemoval = migrateFixture(fx);
    assert.equal(afterRemoval.enforced, true, 'installed indexes remain enforced');
    assert.equal(afterRemoval.ready, false, 'a deliberately unassigned student must be reported on retry');
  } finally { fx.cleanup(); }
}

function checkConflicted() {
  const fx = fixture('duplicate');
  try {
    const before = inspect(fx.path);
    const pending = migrateFixture(fx);
    assert.equal(pending.enforced, false);
    assert.equal(pending.issues.duplicateUsernames, 1);
    assert.equal(pending.issues.duplicateStudentCodes, 1);
    assert.equal(pending.issues.multiClassStudents, 1);
    const after = inspect(fx.path);
    assert.deepEqual(after.users, before.users);
    assert.deepEqual(after.enrollments, before.enrollments);
    assert.equal(after.history.length, 1);
    assert.equal(after.version, 27);
    const db = new DatabaseSync(fx.path);
    try {
      assert.throws(() => db.prepare("INSERT INTO enrollments (class_id, student_id) VALUES ('c2', 's1')").run(), /roster_student_already_in_class/);
      db.prepare("UPDATE users SET username = 'student2', student_code = 'SV002' WHERE id = 's2'").run();
      db.prepare("DELETE FROM enrollments WHERE class_id = 'c2' AND student_id = 's2'").run();
    } finally { db.close(); }
    const ready = migrateFixture(fx);
    assert.equal(ready.enforced, true);
    assert.equal(inspect(fx.path).history.length, 2);
    assert.equal(migrateFixture(fx).enforced, true);
    assert.equal(inspect(fx.path).history.length, 2, 'retry must not duplicate history');
  } finally { fx.cleanup(); }
}

function checkMissing() {
  const fx = fixture('missing');
  try {
    const pending = migrateFixture(fx);
    assert.equal(pending.enforced, false);
    assert.equal(pending.issues.missingStudentCodes, 1);
    assert.equal(pending.issues.unassignedStudents, 1);
    assert.equal(inspect(fx.path).history.length, 1);
    const db = new DatabaseSync(fx.path);
    try {
      db.prepare("UPDATE users SET student_code = 'SV002' WHERE id = 's2'").run();
      db.prepare("INSERT INTO enrollments (class_id, student_id) VALUES ('c2', 's2')").run();
    } finally { db.close(); }
    assert.equal(migrateFixture(fx).enforced, true);
    assert.equal(inspect(fx.path).history.length, 2);
  } finally { fx.cleanup(); }
}

function checkRollbackRetry() {
  const fx = fixture('clean');
  try {
    const db = new DatabaseSync(fx.path);
    db.exec("CREATE TRIGGER fixture_history_failure BEFORE INSERT ON student_home_class_history BEGIN SELECT RAISE(ABORT, 'fixture_history_failure'); END;");
    db.close();
    assert.throws(() => migrateFixture(fx), /fixture_history_failure/);
    const failed = inspect(fx.path);
    assert.equal(failed.history.length, 0, 'failed backfill must roll back atomically');
    assert.equal(failed.integrity, 'ok');
    const repair = new DatabaseSync(fx.path);
    repair.exec('DROP TRIGGER fixture_history_failure');
    repair.close();
    assert.equal(migrateFixture(fx).enforced, true);
    assert.equal(inspect(fx.path).history.length, 2);
  } finally { fx.cleanup(); }
}

checkClean();
console.log('PASS clean v26 upgrade, constraints and history');
checkConflicted();
console.log('PASS conflicted v26 startup, remediation and idempotent retry');
checkMissing();
console.log('PASS missing-code/unassigned gate and retry');
checkRollbackRetry();
console.log('PASS failed backfill rollback and retry');

if (process.argv.includes('--source-db')) {
  const sourcePath = process.argv[process.argv.indexOf('--source-db') + 1];
  if (!sourcePath || process.argv.length !== 4) throw new Error('Usage: node scripts/roster-migration-test.mjs [--source-db <existing-db>]');
  const real = realpathSync(sourcePath);
  if (!statSync(real).isFile()) throw new Error('Source database must be a file');
  const dir = mkdtempSync(join(tmpdir(), 'smartlecture-roster-rehearsal-'));
  const path = join(dir, 'rehearsal.db');
  const source = new DatabaseSync(real, { readOnly: true });
  try {
    source.exec('PRAGMA query_only = ON');
    await backup(source, path);
  } finally { source.close(); }
  try {
    const counts = (database) => {
      const db = new DatabaseSync(database, { readOnly: true });
      try {
        return Object.fromEntries(['users', 'classes', 'enrollments', 'grades', 'attendance_records'].map((table) =>
          [table, db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n]));
      } finally { db.close(); }
    };
    const before = counts(real);
    const status = migrateFixture({ dir, path });
    const after = counts(path);
    assert.deepEqual(after, before, 'upgrade must not change existing rows');
    const migrated = inspect(path);
    assert.equal(migrated.version, 27);
    assert.equal(migrated.integrity, 'ok');
    assert.deepEqual(migrated.fk, []);
    console.log(`PASS real-data backup rehearsal: ${JSON.stringify({ source: real, before, status })}`);
  } finally {
    if (!resolve(dir).startsWith(`${resolve(tmpdir())}${sep}`)) throw new Error('Unsafe rehearsal cleanup path');
    rmSync(dir, { recursive: true, force: true });
  }
}

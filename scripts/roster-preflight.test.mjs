import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import { inspectRoster } from './lib/rosterPreflight.mjs';

const cliPath = fileURLToPath(new URL('./roster-preflight.mjs', import.meta.url));

function fixture(t, populate, { legacyUserSchema = false } = {}) {
  const dir = mkdtempSync(path.join(tmpdir(), 'smartlecture-roster-'));
  t.after(() => {
    const resolved = realpathSync(dir);
    const tempRoot = realpathSync(tmpdir());
    assert.ok(resolved.startsWith(`${tempRoot}${path.sep}`), 'test cleanup must stay inside the system temp directory');
    rmSync(resolved, { recursive: true, force: true });
  });
  const dbPath = path.join(dir, 'fixture.db');
  const db = new DatabaseSync(dbPath);
  db.exec(`
    CREATE TABLE users (id TEXT PRIMARY KEY, username TEXT NOT NULL UNIQUE, role TEXT NOT NULL${legacyUserSchema ? '' : ', student_code TEXT'});
    CREATE TABLE classes (id TEXT PRIMARY KEY);
    CREATE TABLE enrollments (class_id TEXT REFERENCES classes(id), student_id TEXT REFERENCES users(id), PRIMARY KEY (class_id, student_id));
    INSERT INTO classes VALUES ('QK22'), ('QK23');
  `);
  populate(db);
  db.close();
  return dbPath;
}

const sha256 = (filename) => createHash('sha256').update(readFileSync(filename)).digest('hex');

test('clean roster is ready and read-only scan leaves database bytes unchanged', (t) => {
  const dbPath = fixture(t, (db) => db.exec("INSERT INTO users VALUES ('s1', 'student1', 'student', 'SV001'); INSERT INTO enrollments VALUES ('QK22', 's1')"));
  const before = sha256(dbPath);
  const report = inspectRoster(dbPath);
  assert.equal(report.readyForConstraint, true);
  assert.equal(report.summary.students, 1);
  assert.equal(sha256(dbPath), before);
  const cli = spawnSync(process.execPath, [cliPath, '--db', dbPath], { encoding: 'utf8' });
  assert.equal(cli.status, 0);
  assert.ok(!cli.stdout.includes('SV001'));
  assert.equal(sha256(dbPath), before);
});

test('reports duplicate identity and invalid one-class membership without mutation', (t) => {
  const dbPath = fixture(t, (db) => db.exec(`
    INSERT INTO users VALUES ('s1', 'Student', 'student', 'SV001');
    INSERT INTO users VALUES ('s2', 'student', 'student', 'sv001');
    INSERT INTO users VALUES ('s3', 'UPPER', 'student', NULL);
    INSERT INTO users VALUES ('t1', 'teacher1', 'teacher', NULL);
    INSERT INTO enrollments VALUES ('QK22', 's1'), ('QK23', 's1'), ('QK22', 's2'), ('QK22', 't1');
  `));
  const before = sha256(dbPath);
  const report = inspectRoster(dbPath);
  assert.equal(report.readyForConstraint, false);
  assert.deepEqual(report.issues.duplicateUsernames[0].userIds, ['s1', 's2']);
  assert.deepEqual(report.issues.duplicateStudentCodes[0].userIds, ['s1', 's2']);
  assert.deepEqual(report.issues.multiClassStudents[0].classIds, ['QK22', 'QK23']);
  assert.deepEqual(report.issues.missingStudentCodes, ['s3']);
  assert.deepEqual(report.issues.unassignedStudents, ['s3']);
  assert.deepEqual(report.issues.invalidEnrollments[0].reason, 'not_student');
  assert.equal(sha256(dbPath), before);
  const cli = spawnSync(process.execPath, [cliPath, '--db', dbPath, '--json'], { encoding: 'utf8' });
  assert.equal(cli.status, 1);
  assert.equal(JSON.parse(cli.stdout).summary.issueCounts.multiClassStudents, 1);
});

test('missing DB and directory path fail without creating a file', (t) => {
  const dbPath = fixture(t, () => {});
  const missing = path.join(path.dirname(dbPath), 'missing.db');
  assert.throws(() => inspectRoster(missing));
  const cli = spawnSync(process.execPath, [cliPath, '--db', missing], { encoding: 'utf8' });
  assert.equal(cli.status, 2);
  assert.throws(() => inspectRoster(path.dirname(dbPath)), /must be a file/);
});

test('legacy schema without student_code is reported as blocked, not migrated', (t) => {
  const dbPath = fixture(t, (db) => db.exec("INSERT INTO users VALUES ('s1', 'student1', 'student'); INSERT INTO enrollments VALUES ('QK22', 's1')"), { legacyUserSchema: true });
  const before = sha256(dbPath);
  const report = inspectRoster(dbPath);
  assert.equal(report.readyForConstraint, false);
  assert.deepEqual(report.issues.missingColumns, ['student_code']);
  assert.equal(sha256(dbPath), before);
});

test('foreign-key violations are reported without attempting repair', (t) => {
  const dbPath = fixture(t, (db) => {
    db.exec("INSERT INTO users VALUES ('s1', 'student1', 'student', 'SV001'); INSERT INTO enrollments VALUES ('QK22', 's1')");
    db.exec('PRAGMA foreign_keys = OFF');
    db.exec("INSERT INTO enrollments VALUES ('UNKNOWN', 's1')");
  });
  const before = sha256(dbPath);
  const report = inspectRoster(dbPath);
  assert.equal(report.readyForConstraint, false);
  assert.equal(report.issues.foreignKeyViolations.length, 1);
  assert.equal(report.issues.invalidEnrollments[0].reason, 'missing_class');
  assert.equal(sha256(dbPath), before);
});

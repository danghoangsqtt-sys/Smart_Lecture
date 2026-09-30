import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { previewTestStudents, removeTestStudents } from './cleanup-test-students.mjs';

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'smartlecture-test-students-'));
  const path = join(root, 'fixture.db');
  const db = new DatabaseSync(path);
  db.exec(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE users (id TEXT PRIMARY KEY, username TEXT NOT NULL, display_name TEXT NOT NULL, role TEXT NOT NULL, student_code TEXT);
    CREATE TABLE classes (id TEXT PRIMARY KEY);
    CREATE TABLE enrollments (class_id TEXT NOT NULL REFERENCES classes(id), student_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE);
    CREATE TABLE grades (id TEXT PRIMARY KEY, student_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE);
    INSERT INTO users VALUES ('admin', 'admin', 'Admin', 'admin', NULL);
    INSERT INTO users VALUES ('s1', 's1', 'Test 1', 'student', NULL);
    INSERT INTO users VALUES ('s2', 's2', 'Test 2', 'student', '');
    INSERT INTO users VALUES ('s3', 's3', 'Test 3', 'student', '   ');
    INSERT INTO users VALUES ('keep', 'keep', 'Keep', 'student', 'HV001');
    INSERT INTO classes VALUES ('c1');
    INSERT INTO enrollments VALUES ('c1', 's1'), ('c1', 's2'), ('c1', 'keep');
  `);
  db.close();
  return { root, path, cleanup() {
    if (!resolve(root).startsWith(`${resolve(tmpdir())}${sep}`)) throw new Error('Unsafe fixture cleanup path');
    rmSync(root, { recursive: true, force: true });
  } };
}

test('dry run selects only students without codes and does not mutate', () => {
  const fx = fixture();
  try {
    const report = previewTestStudents(fx.path);
    assert.equal(report.targetCount, 3);
    assert.deepEqual(report.targets.map((row) => row.id), ['s1', 's2', 's3']);
    assert.equal(report.blockedByRelatedData, false);
    assert.equal(report.before.users, 5);
    assert.equal(previewTestStudents(fx.path).before.enrollments, 3);
  } finally { fx.cleanup(); }
});

test('mismatched count or ID fingerprint prevents deletion', async () => {
  const fx = fixture();
  try {
    const report = previewTestStudents(fx.path);
    await assert.rejects(removeTestStudents(fx.path, 2, report.targetIdSha256), /differs from preview/);
    await assert.rejects(removeTestStudents(fx.path, 3, '0'.repeat(64)), /differs from preview/);
    assert.equal(previewTestStudents(fx.path).before.users, 5);
  } finally { fx.cleanup(); }
});

test('grade history blocks cascading deletion', async () => {
  const fx = fixture();
  try {
    const db = new DatabaseSync(fx.path);
    db.exec("INSERT INTO grades VALUES ('g1', 's1')");
    db.close();
    const report = previewTestStudents(fx.path);
    assert.equal(report.blockedByRelatedData, true);
    await assert.rejects(removeTestStudents(fx.path, 3, report.targetIdSha256), /Related data/);
    assert.equal(previewTestStudents(fx.path).before.users, 5);
  } finally { fx.cleanup(); }
});

test('verified backup precedes deletion; only targets and their enrollments are removed', async () => {
  const fx = fixture();
  try {
    const report = previewTestStudents(fx.path);
    const result = await removeTestStudents(fx.path, 3, report.targetIdSha256);
    assert.deepEqual(result.deletedIds, ['s1', 's2', 's3']);
    assert.equal(result.before.users, 5);
    assert.equal(result.after.users, 2);
    assert.equal(result.after.enrollments, 1);
    assert.equal(result.after.classes, 1);
    const backup = new DatabaseSync(result.backupPath, { readOnly: true });
    assert.equal(backup.prepare('SELECT COUNT(*) AS n FROM users').get().n, 5);
    assert.equal(backup.prepare('PRAGMA integrity_check').get().integrity_check, 'ok');
    backup.close();
    const db = new DatabaseSync(fx.path, { readOnly: true });
    assert.deepEqual(db.prepare('SELECT id FROM users ORDER BY id').all().map((row) => row.id), ['admin', 'keep']);
    assert.equal(db.prepare('PRAGMA foreign_key_check').all().length, 0);
    db.close();
  } finally { fx.cleanup(); }
});

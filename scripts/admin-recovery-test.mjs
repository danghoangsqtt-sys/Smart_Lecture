import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { DatabaseSync } = require('node:sqlite');
const bcrypt = require('bcryptjs');
const root = path.resolve(import.meta.dirname, '..');
const cli = path.join(root, 'server', 'dist', 'cli', 'recoverAdmin.js');
const sandbox = mkdtempSync(path.join(tmpdir(), 'smartlecture-admin-recovery-'));
let passed = 0;

function makeData(name, admins) {
  const data = path.join(sandbox, name);
  mkdirSync(data, { recursive: true });
  const db = new DatabaseSync(path.join(data, 'smart-lecture.db'));
  db.exec(`CREATE TABLE users (
    id TEXT PRIMARY KEY, username TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL,
    role TEXT NOT NULL, display_name TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'active',
    failed_attempts INTEGER NOT NULL DEFAULT 0, must_change_password INTEGER NOT NULL DEFAULT 0
  )`);
  const insert = db.prepare('INSERT INTO users VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
  admins.forEach((username, index) => insert.run(`id-${index}`, username, bcrypt.hashSync('old-password', 4), 'admin', username, 'locked', 9, 0));
  db.close();
  writeFileSync(path.join(data, 'secret.key'), Buffer.alloc(64, 7));
  return data;
}

function run(data, ...args) {
  return spawnSync(process.execPath, [cli, '--data-dir', data, ...args], { cwd: root, encoding: 'utf8' });
}

function check(condition, label, detail = '') {
  if (!condition) throw new Error(`${label}\n${detail}`);
  passed += 1;
  console.log(`PASS  ${label}`);
}

try {
  const sole = makeData('sole', ['admin']);
  const oldSecret = readFileSync(path.join(sole, 'secret.key'));
  const success = run(sole, '--confirm', 'admin');
  const password = success.stdout.match(/TEMPORARY_PASSWORD: (.+)/)?.[1]?.trim();
  const db = new DatabaseSync(path.join(sole, 'smart-lecture.db'), { readOnly: true });
  const row = db.prepare('SELECT * FROM users WHERE username = ?').get('admin');
  db.close();
  check(success.status === 0 && password && bcrypt.compareSync(password, row.password_hash), 'resets the sole admin to a random temporary password', success.stderr);
  check(row.status === 'active' && row.failed_attempts === 0 && row.must_change_password === 1, 'unlocks admin and forces first password change');
  check(!oldSecret.equals(readFileSync(path.join(sole, 'secret.key'))), 'rotates JWT secret to revoke existing sessions');
  const backup = success.stdout.match(/BACKUP_DIR: (.+)/)?.[1]?.trim();
  check(backup && readFileSync(path.join(backup, 'smart-lecture.db')).length > 0, 'creates a recoverable database backup before mutation');

  const multiple = makeData('multiple', ['admin-a', 'admin-b']);
  const ambiguous = run(multiple, '--confirm', 'admin-a');
  check(ambiguous.status !== 0 && ambiguous.stderr.includes('Multiple administrators'), 'requires an explicit username when multiple admins exist');

  const active = makeData('active', ['admin']);
  writeFileSync(path.join(active, 'smart-lecture.db-wal'), 'active');
  const refused = run(active, '--confirm', 'admin');
  check(refused.status !== 0 && refused.stderr.includes('Close SmartLecture'), 'refuses recovery while SQLite sidecars indicate an active or unclean database');

  console.log(`Admin recovery: ${passed}/6 passed`);
} finally {
  rmSync(sandbox, { recursive: true, force: true });
}

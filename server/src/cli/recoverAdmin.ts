import { randomBytes } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import bcrypt from 'bcryptjs';

function argument(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function fail(message: string): never {
  console.error(`RECOVERY_ERROR: ${message}`);
  process.exit(1);
}

const dataArg = argument('--data-dir');
if (!dataArg) fail('Use --data-dir with the exact SmartLecture data directory.');
const dataDir = path.resolve(dataArg);
const dbPath = path.join(dataDir, 'smart-lecture.db');
if (!existsSync(dbPath)) fail(`Database not found: ${dbPath}`);
if (existsSync(`${dbPath}-wal`) || existsSync(`${dbPath}-shm`)) {
  fail('Database sidecar files are present. Close SmartLecture completely before recovery; do not delete active WAL/SHM files.');
}

type AdminRow = { id: string; username: string; display_name: string; status: string; failed_attempts: number };
const inspection = new DatabaseSync(dbPath, { readOnly: true });
let admins: AdminRow[];
try {
  admins = inspection.prepare(
    `SELECT id, username, display_name, status, failed_attempts
       FROM users WHERE role = 'admin' ORDER BY username`
  ).all() as unknown as AdminRow[];
} finally {
  inspection.close();
}
if (admins.length === 0) fail('No administrator account exists in this database.');

const requestedUsername = argument('--username');
if (!requestedUsername && admins.length > 1) {
  fail(`Multiple administrators exist (${admins.map((admin) => admin.username).join(', ')}). Re-run with --username.`);
}
const username = requestedUsername ?? admins[0]!.username;
const admin = admins.find((candidate) => candidate.username === username);
if (!admin) fail(`Administrator not found: ${username}`);
if (argument('--confirm') !== username) {
  fail(`Confirmation mismatch. Re-run with --confirm ${username} after verifying the data directory and account.`);
}

const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const backupDir = path.join(dataDir, 'backups', `owner-recovery-${stamp}`);
mkdirSync(backupDir, { recursive: true });
copyFileSync(dbPath, path.join(backupDir, 'smart-lecture.db'));
const secretPath = path.join(dataDir, 'secret.key');
if (existsSync(secretPath)) copyFileSync(secretPath, path.join(backupDir, 'secret.key'));

const temporaryPassword = `Sl!${randomBytes(18).toString('base64url')}`;
const passwordHash = bcrypt.hashSync(temporaryPassword, 10);
const db = new DatabaseSync(dbPath);
try {
  db.exec('BEGIN IMMEDIATE');
  const userColumns = db.prepare('PRAGMA table_info(users)').all() as { name: string }[];
  if (!userColumns.some((column) => column.name === 'session_version')) {
    db.exec('ALTER TABLE users ADD COLUMN session_version INTEGER NOT NULL DEFAULT 0 CHECK (session_version >= 0)');
  }
  const result = db.prepare(
    `UPDATE users
        SET password_hash = ?, status = 'active', failed_attempts = 0, must_change_password = 1,
            session_version = session_version + 1
      WHERE id = ? AND role = 'admin'`
  ).run(passwordHash, admin.id);
  if (result.changes !== 1) throw new Error('Administrator row changed during recovery.');
  db.exec('COMMIT');
} catch (error) {
  try { db.exec('ROLLBACK'); } catch { /* transaction did not begin */ }
  throw error;
} finally {
  db.close();
}

const secretTempPath = `${secretPath}.recovery-${process.pid}`;
writeFileSync(secretTempPath, randomBytes(64), { mode: 0o600 });
renameSync(secretTempPath, secretPath);

console.log(`RECOVERY_OK: ${username}`);
console.log(`DATA_DIR: ${dataDir}`);
console.log(`BACKUP_DIR: ${backupDir}`);
console.log(`TEMPORARY_PASSWORD: ${temporaryPassword}`);
console.log('The temporary password must be changed immediately after login. Existing tokens are invalid because secret.key was rotated.');

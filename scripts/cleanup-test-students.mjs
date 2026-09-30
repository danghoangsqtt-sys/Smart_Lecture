import { DatabaseSync, backup } from 'node:sqlite';
import { createHash, randomUUID } from 'node:crypto';
import { createReadStream, existsSync, mkdirSync, realpathSync, statSync } from 'node:fs';
import { dirname, join, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';

const quote = (value) => `"${value.replaceAll('"', '""')}"`;
const fingerprint = (ids) => createHash('sha256').update(JSON.stringify([...ids].sort())).digest('hex');

function targetRows(db) {
  return db.prepare("SELECT id, username, display_name, student_code FROM users WHERE role = 'student' AND (student_code IS NULL OR trim(student_code) = '') ORDER BY id").all();
}

function references(db, userId) {
  const tables = db.prepare("SELECT name FROM sqlite_schema WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all();
  const found = [];
  for (const { name } of tables) {
    const fks = db.prepare(`PRAGMA foreign_key_list(${quote(name)})`).all().filter((fk) => fk.table === 'users');
    for (const fk of fks) {
      const count = db.prepare(`SELECT COUNT(*) AS n FROM ${quote(name)} WHERE ${quote(fk.from)} = ?`).get(userId).n;
      if (count) found.push({ table: name, column: fk.from, count });
    }
  }
  return found;
}

function inspect(db) {
  const targets = targetRows(db).map((row) => ({
    id: row.id,
    username: row.username,
    displayName: row.display_name,
    references: references(db, row.id),
  }));
  return {
    targetCount: targets.length,
    targetIdSha256: fingerprint(targets.map((row) => row.id)),
    targets,
    blockedByRelatedData: targets.some((row) => row.references.some((ref) => ref.table !== 'enrollments')),
    before: {
      users: db.prepare('SELECT COUNT(*) AS n FROM users').get().n,
      enrollments: db.prepare('SELECT COUNT(*) AS n FROM enrollments').get().n,
      classes: db.prepare('SELECT COUNT(*) AS n FROM classes').get().n,
    },
  };
}

function openExisting(path, readOnly) {
  const real = realpathSync(path);
  if (!statSync(real).isFile()) throw new Error('Database path must be an existing file');
  return { path: real, db: new DatabaseSync(real, { readOnly, timeout: 5000 }) };
}

export function previewTestStudents(path) {
  const { path: database, db } = openExisting(path, true);
  try {
    db.exec('PRAGMA query_only = ON');
    return { database, ...inspect(db) };
  } finally {
    db.close();
  }
}

export async function removeTestStudents(path, expectedCount, expectedIdSha256) {
  if (!Number.isSafeInteger(expectedCount) || expectedCount <= 0 || !/^[a-f0-9]{64}$/.test(expectedIdSha256 ?? '')) {
    throw new Error('Apply requires a positive expected count and 64-character ID SHA-256 from preview');
  }
  const { path: database, db: source } = openExisting(path, true);
  let snapshot;
  try {
    source.exec('PRAGMA query_only = ON');
    snapshot = inspect(source);
    if (snapshot.targetCount !== expectedCount || snapshot.targetIdSha256 !== expectedIdSha256) {
      throw new Error('Target set differs from preview; run dry-run again');
    }
    if (snapshot.blockedByRelatedData) throw new Error('Related data beyond enrollments exists; refusing cascade deletion');

    const dataDir = dirname(database);
    const backupDir = resolve(dataDir, 'backups');
    if (!backupDir.startsWith(`${resolve(dataDir)}${sep}`)) throw new Error('Backup path escapes database directory');
    mkdirSync(backupDir, { recursive: true });
    if (realpathSync(backupDir) !== backupDir) throw new Error('Backup directory resolves outside the expected data directory');
    const backupPath = join(backupDir, `pre-test-student-delete-${new Date().toISOString().replaceAll(':', '-')}-${randomUUID()}.db`);
    if (existsSync(backupPath)) throw new Error('Refusing to overwrite existing backup');
    await backup(source, backupPath);
    const saved = new DatabaseSync(backupPath, { readOnly: true });
    try {
      if (saved.prepare('PRAGMA integrity_check').get().integrity_check !== 'ok' ||
          saved.prepare('PRAGMA foreign_key_check').all().length ||
          inspect(saved).targetIdSha256 !== expectedIdSha256) {
        throw new Error('Backup verification failed; original database was not changed');
      }
    } finally {
      saved.close();
    }
    const backupHash = createHash('sha256');
    for await (const chunk of createReadStream(backupPath)) backupHash.update(chunk);
    const backupSha256 = backupHash.digest('hex');
    const { db } = openExisting(database, false);
    try {
      db.exec('PRAGMA foreign_keys = ON');
      db.exec('BEGIN IMMEDIATE');
      try {
        const locked = inspect(db);
        if (locked.targetCount !== expectedCount || locked.targetIdSha256 !== expectedIdSha256 || locked.blockedByRelatedData) {
          throw new Error('Target or related data changed after backup; no deletion performed');
        }
        const deletion = db.prepare('DELETE FROM users WHERE id = ? AND role = ?');
        for (const target of locked.targets) {
          if (deletion.run(target.id, 'student').changes !== 1) throw new Error(`Could not delete expected student ${target.id}`);
        }
        if (db.prepare('PRAGMA foreign_key_check').all().length) throw new Error('Foreign key check failed; rolling back');
        const after = inspect(db);
        if (after.before.users !== locked.before.users - expectedCount ||
            after.before.classes !== locked.before.classes || after.targetCount !== 0) {
          throw new Error('Post-delete counts differ; rolling back');
        }
        db.exec('COMMIT');
        return { database, backupPath, backupSha256, deletedIds: locked.targets.map((row) => row.id), before: locked.before, after: after.before };
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }
    } finally {
      db.close();
    }
  } finally {
    source.close();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const args = process.argv.slice(2);
  const value = (key) => args[args.indexOf(key) + 1];
  const keys = new Set(['--db', '--apply', '--expected-count', '--expected-id-sha']);
  try {
    if (args.some((arg) => arg.startsWith('--') && !keys.has(arg)) || !args.includes('--db') || !value('--db')) {
      throw new Error('Usage: node scripts/cleanup-test-students.mjs --db <existing-db> [--apply --expected-count N --expected-id-sha SHA256]');
    }
    const applying = args.includes('--apply');
    if (applying && (!args.includes('--expected-count') || !args.includes('--expected-id-sha'))) throw new Error('Apply requires expected count and ID SHA');
    if (!applying && (args.includes('--expected-count') || args.includes('--expected-id-sha'))) throw new Error('Expected count and hash are only valid with --apply');
    const result = applying
      ? await removeTestStudents(value('--db'), Number(value('--expected-count')), value('--expected-id-sha'))
      : previewTestStudents(value('--db'));
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

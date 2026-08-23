import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { DB_PATH } from '../config.js';

export const db = new DatabaseSync(DB_PATH);

db.exec('PRAGMA foreign_keys = ON;');
db.exec('PRAGMA journal_mode = WAL;');

export function migrate(): void {
  const schemaSql = readFileSync(fileURLToPath(new URL('./schema.sql', import.meta.url)), 'utf-8');
  db.exec(schemaSql);
  db.prepare('INSERT OR IGNORE INTO schema_migrations (version) VALUES (?)').run(1);

  const current = (db.prepare('SELECT COALESCE(MAX(version), 0) AS v FROM schema_migrations').get() as { v: number }).v;
  for (const migration of MIGRATIONS) {
    if (migration.version <= current) continue;
    tx(() => {
      migration.up();
      db.prepare('INSERT INTO schema_migrations (version) VALUES (?)').run(migration.version);
    });
    console.log(`[db] applied migration v${migration.version}`);
  }
}

const MIGRATIONS: { version: number; up: () => void }[] = [
  {
    version: 2,
    up: () => {
      db.exec(`
        CREATE TABLE questions_new (
          id TEXT PRIMARY KEY,
          owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          type TEXT NOT NULL CHECK (type IN ('mcq', 'essay', 'fill')),
          content TEXT NOT NULL,
          options_json TEXT NOT NULL DEFAULT '[]',
          correct_answer TEXT NOT NULL DEFAULT '',
          explanation TEXT NOT NULL DEFAULT '',
          bloom_level TEXT NOT NULL DEFAULT '',
          category TEXT NOT NULL DEFAULT '',
          folder_id TEXT REFERENCES folders(id) ON DELETE SET NULL,
          image_path TEXT,
          is_public_bank INTEGER NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
        INSERT INTO questions_new SELECT * FROM questions;
        DROP TABLE questions;
        ALTER TABLE questions_new RENAME TO questions;
        CREATE INDEX IF NOT EXISTS idx_questions_owner ON questions(owner_id, type);
        CREATE INDEX IF NOT EXISTS idx_questions_bloom ON questions(bloom_level);
        CREATE INDEX IF NOT EXISTS idx_questions_folder ON questions(folder_id);
      `);
    },
  },
  {
    version: 3,
    up: () => {
      db.exec(`
        ALTER TABLE classes ADD COLUMN archived INTEGER NOT NULL DEFAULT 0;
        ALTER TABLE classes ADD COLUMN archived_at TEXT;
      `);
    },
  },
];

type SqlParam = string | number | bigint | null;

export function queryAll<T>(sql: string, ...params: SqlParam[]): T[] {
  return db.prepare(sql).all(...params) as unknown as T[];
}

export function queryOne<T>(sql: string, ...params: SqlParam[]): T | undefined {
  return db.prepare(sql).get(...params) as unknown as T | undefined;
}

export function tx(fn: () => void): void {
  db.exec('BEGIN');
  try {
    fn();
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

export function run(sql: string, ...params: SqlParam[]): void {
  db.prepare(sql).run(...params);
}

type UserRow = {
  id: string;
  username: string;
  password_hash: string;
  role: string;
  display_name: string;
  status: string;
  failed_attempts: number;
  must_change_password: number;
};

export function findUserByUsername(username: string): UserRow | undefined {
  return db.prepare('SELECT * FROM users WHERE username = ?').get(username) as UserRow | undefined;
}

export function getUserById(id: string): UserRow | undefined {
  return db.prepare('SELECT * FROM users WHERE id = ?').get(id) as UserRow | undefined;
}

export type PublicUser = {
  id: string;
  username: string;
  role: string;
  displayName: string;
  status: string;
  mustChangePassword: boolean;
};

export function toPublicUser(row: UserRow): PublicUser {
  return {
    id: row.id,
    username: row.username,
    role: row.role,
    displayName: row.display_name,
    status: row.status,
    mustChangePassword: row.must_change_password === 1,
  };
}

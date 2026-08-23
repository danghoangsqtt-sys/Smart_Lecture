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
}

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

import bcrypt from 'bcryptjs';
import { randomUUID } from 'node:crypto';
import { db } from './connection.js';

export function seedAdmin(): void {
  const row = db.prepare('SELECT COUNT(*) AS n FROM users').get() as { n: number };
  if (row.n > 0) return;
  const hash = bcrypt.hashSync('admin123', 10);
  db.prepare(
    `INSERT INTO users (id, username, password_hash, role, display_name, must_change_password)
     VALUES (?, ?, ?, 'admin', 'Quản trị viên', 1)`
  ).run(randomUUID(), 'admin', hash);
}

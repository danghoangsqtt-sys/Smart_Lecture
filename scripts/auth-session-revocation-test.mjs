import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { DatabaseSync } = require('node:sqlite');
const jwt = require('jsonwebtoken');

const dataDir = mkdtempSync(path.join(tmpdir(), 'smartlecture-session-version-'));
const dbPath = path.join(dataDir, 'smart-lecture.db');
const bootstrap = new DatabaseSync(dbPath);
bootstrap.exec(`
  CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL DEFAULT (datetime('now')));
  INSERT INTO schema_migrations (version) VALUES (24);
  CREATE TABLE users (
    id TEXT PRIMARY KEY, username TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL,
    role TEXT NOT NULL, display_name TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'active',
    failed_attempts INTEGER NOT NULL DEFAULT 0, must_change_password INTEGER NOT NULL DEFAULT 0,
    created_by TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')),
    student_code TEXT, dob TEXT, gender TEXT, hometown TEXT
  );
  INSERT INTO users (id, username, password_hash, role, display_name) VALUES ('admin-id', 'admin', 'unused', 'admin', 'Admin');
`);
bootstrap.close();

process.env.DATA_DIR = dataDir;
process.env.DB_PATH = dbPath;

function responseRecorder() {
  return {
    statusCode: 200,
    body: undefined,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
}

function check(condition, label, detail = '') {
  if (!condition) throw new Error(`${label}\n${detail}`);
  console.log(`PASS  ${label}`);
}

try {
  const [{ db, getUserById, migrate }, { JWT_SECRET }, { requireAuth }, { authenticateSocket }] = await Promise.all([
    import('../server/dist/db/connection.js'),
    import('../server/dist/config.js'),
    import('../server/dist/middleware/auth.js'),
    import('../server/dist/realtime/socketAuth.js'),
  ]);
  migrate();
  const columns = db.prepare('PRAGMA table_info(users)').all();
  check(columns.some((column) => column.name === 'session_version'), 'upgrades a pre-v25 users table');

  const user = getUserById('admin-id');
  const current = jwt.sign({ sub: user.id, sv: user.session_version }, JWT_SECRET, { expiresIn: '5m' });
  const legacy = jwt.sign({ sub: user.id }, JWT_SECRET, { expiresIn: '5m' });

  const currentRes = responseRecorder();
  let currentNext = false;
  requireAuth({ headers: { authorization: `Bearer ${current}` }, baseUrl: '/api/auth', path: '/me' }, currentRes, () => { currentNext = true; });
  check(currentNext && currentRes.statusCode === 200, 'accepts the current REST session version');

  const legacyRes = responseRecorder();
  requireAuth({ headers: { authorization: `Bearer ${legacy}` }, baseUrl: '/api/auth', path: '/me' }, legacyRes, () => {});
  check(legacyRes.statusCode === 401, 'rejects legacy REST tokens without a version claim');

  check(authenticateSocket({ handshake: { auth: { token: current } } })?.userId === user.id, 'accepts the current Socket.IO session version');
  db.prepare('UPDATE users SET session_version = session_version + 1 WHERE id = ?').run(user.id);

  const staleRes = responseRecorder();
  requireAuth({ headers: { authorization: `Bearer ${current}` }, baseUrl: '/api/auth', path: '/me' }, staleRes, () => {});
  check(staleRes.statusCode === 401, 'rejects a stale REST token after version rotation');
  check(authenticateSocket({ handshake: { auth: { token: current } } }) === null, 'rejects a stale Socket.IO reconnect');

  const updated = getUserById(user.id);
  const renewed = jwt.sign({ sub: updated.id, sv: updated.session_version }, JWT_SECRET, { expiresIn: '5m' });
  check(authenticateSocket({ handshake: { auth: { token: renewed } } })?.userId === user.id, 'accepts a newly versioned Socket.IO token');
  console.log('Session revocation: 7/7 passed');
  db.close();
} finally {
  rmSync(dataDir, { recursive: true, force: true });
}

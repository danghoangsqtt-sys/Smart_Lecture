/**
 * Upgrade-path regression test.
 *
 * Every other E2E script boots the server against a brand-new temp database,
 * so schema.sql's `CREATE TABLE IF NOT EXISTS` always creates tables with every
 * column already baked in. That hid a real bug (found 2026-09-07): schema.sql
 * had accumulated a standalone `CREATE INDEX ... ON game_sessions(class_id, ...)`
 * even though `class_id` is only added to game_sessions via migration v18's
 * guarded `ALTER TABLE`. Any real installation whose game_sessions table
 * predates v18 crashed on startup the moment schema.sql ran that index
 * creation, before migration v18 ever got a chance to add the column.
 *
 * This test recreates that exact shape: a game_sessions table without
 * class_id, as a genuinely old install would have, then boots the real
 * compiled server against it and asserts it comes up healthy instead of
 * crashing during migrate().
 */
import { createRequire } from 'node:module';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

const require = createRequire(import.meta.url);
const { DatabaseSync } = require('node:sqlite');

const root = path.resolve(import.meta.dirname, '..');
const dataDir = mkdtempSync(path.join(tmpdir(), 'smart-lecture-upgrade-'));
const dbPath = path.join(dataDir, 'upgrade.db');
const port = 4600;
const base = `http://127.0.0.1:${port}`;

const db = new DatabaseSync(dbPath);
db.exec(`
  CREATE TABLE game_sessions (
    id TEXT PRIMARY KEY,
    host_teacher_id TEXT NOT NULL,
    game_type TEXT NOT NULL,
    room_code TEXT NOT NULL UNIQUE,
    exam_id TEXT,
    question_ids_json TEXT NOT NULL DEFAULT '[]',
    config_json TEXT NOT NULL DEFAULT '{}',
    status TEXT NOT NULL DEFAULT 'lobby',
    current_question_index INTEGER NOT NULL DEFAULT -1,
    started_at TEXT,
    finished_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);
db.close();

const env = { ...process.env, PORT: String(port), DATA_DIR: dataDir, DB_PATH: dbPath };

function startServer() {
  const child = spawn(process.execPath, ['server/dist/index.js'], { cwd: root, env, stdio: ['ignore', 'pipe', 'pipe'] });
  let output = '';
  child.stdout.on('data', (chunk) => { output += chunk; });
  child.stderr.on('data', (chunk) => { output += chunk; });
  return { child, getOutput: () => output };
}

async function waitForServer(child) {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) return false;
    try {
      if ((await fetch(`${base}/api/health`)).ok) return true;
    } catch { /* still starting */ }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  return false;
}

console.log('=== UPGRADE PATH TEST (pre-v18 game_sessions shape) ===');
const { child, getOutput } = startServer();
const healthy = await waitForServer(child);

if (healthy) {
  console.log('  PASS  server boots against a pre-v18 game_sessions table without crashing');
  child.kill();
  await new Promise((resolve) => { child.once('exit', resolve); setTimeout(resolve, 5_000); });
} else {
  console.error('  FAIL  server did not become healthy against a pre-v18 database');
  console.error(getOutput());
}

rmSync(dataDir, { recursive: true, force: true });
process.exit(healthy ? 0 : 1);

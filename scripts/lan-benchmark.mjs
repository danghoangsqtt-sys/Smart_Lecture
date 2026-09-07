/**
 * LAN concurrency benchmark - SmartLecture
 *
 * Measures how the realtime game engine behaves at the design-target
 * concurrency tiers from docs/SPEC.md #1 ("toi da 60 thiet bi dong thoi
 * trong mot phong game"): 20, 40, 60 simultaneous student connections.
 *
 * IMPORTANT: this runs every simulated student from a single Node process
 * on localhost against an isolated server instance. It measures the
 * server's own concurrency ceiling (event-loop/Socket.IO broadcast cost),
 * NOT real classroom WiFi/device variance — that requires real devices on
 * a real access point and is out of reach for an unattended script. Treat
 * these numbers as a lower bound, not a substitute for an on-site test.
 *
 * Usage: node scripts/lan-benchmark.mjs [tiers...]
 *   node scripts/lan-benchmark.mjs            # 20 40 60
 *   node scripts/lan-benchmark.mjs 60          # just one tier
 */
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { io } from 'socket.io-client';

const root = path.resolve(import.meta.dirname, '..');
const PORT = 4500;
const BASE = `http://127.0.0.1:${PORT}`;
const TIERS = process.argv.slice(2).map(Number).filter((n) => Number.isFinite(n) && n > 0);
if (TIERS.length === 0) TIERS.push(20, 40, 60);

function percentile(sorted, p) {
  if (sorted.length === 0) return NaN;
  const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[idx];
}

function summarize(label, samplesMs) {
  const sorted = [...samplesMs].sort((a, b) => a - b);
  const mean = sorted.reduce((s, v) => s + v, 0) / sorted.length;
  console.log(
    `    ${label.padEnd(28)} n=${String(sorted.length).padEnd(3)} ` +
    `p50=${percentile(sorted, 50).toFixed(0).padStart(5)}ms  ` +
    `p95=${percentile(sorted, 95).toFixed(0).padStart(5)}ms  ` +
    `max=${sorted[sorted.length - 1].toFixed(0).padStart(5)}ms  ` +
    `mean=${mean.toFixed(0)}ms`
  );
}

async function api(method, apiPath, token, body) {
  const res = await fetch(`${BASE}/api${apiPath}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return res.json();
}

async function login(username, password) {
  const body = await api('POST', '/auth/login', null, { username, password });
  return body.token;
}

function connect(token) {
  return io(BASE, { transports: ['websocket'], auth: { token } });
}

async function runTier(studentCount, teacherToken, classId, questionIds) {
  console.log(`\n=== Tier: ${studentCount} concurrent students ===`);

  // Seed N unique student accounts and enroll them.
  const rows = Array.from({ length: studentCount }, (_, i) => ({
    displayName: `Bench Student ${i + 1}`,
    username: `bench_${studentCount}_${i + 1}`,
  }));
  await api('POST', '/users/import', teacherToken, { rows });
  const usersRes = await api('GET', '/users?role=student', teacherToken);
  const ids = (usersRes.users ?? [])
    .filter((u) => u.username.startsWith(`bench_${studentCount}_`))
    .map((u) => u.id);
  if (ids.length !== studentCount) throw new Error(`expected ${studentCount} seeded students, found ${ids.length}`);
  await api('POST', `/classes/${classId}/enroll`, teacherToken, { studentIds: ids });

  const tokens = [];
  for (const row of rows) {
    const t = await login(row.username, 'Hocvien@123');
    if (!t) throw new Error(`login failed for ${row.username}`);
    tokens.push(t);
  }

  const game = await api('POST', '/games', teacherToken, {
    gameType: 'quick_quiz',
    questionIds,
    secondsPerQuestion: 15,
    classId,
  });
  if (!game.roomCode) throw new Error(`game creation failed: ${JSON.stringify(game)}`);

  const host = connect(teacherToken);
  await new Promise((resolve, reject) => {
    host.once('connect', resolve);
    host.once('connect_error', reject);
  });
  host.emit('game:host-attach', { sessionId: game.id });

  const students = tokens.map(connect);
  const joinLatencies = [];
  const questionLatencies = [];
  const answerAcceptedCount = { n: 0 };

  const joinStart = new Map();
  const t0 = performance.now();
  await Promise.all(
    students.map(
      (socket, i) =>
        new Promise((resolve, reject) => {
          socket.once('connect', () => {
            joinStart.set(i, performance.now());
            socket.emit('game:join', { roomCode: game.roomCode });
          });
          socket.once('game:joined', () => {
            joinLatencies.push(performance.now() - joinStart.get(i));
            resolve();
          });
          socket.once('connect_error', reject);
          setTimeout(() => reject(new Error(`student ${i} join timeout`)), 20_000);
        })
    )
  );
  const joinWallClock = performance.now() - t0;

  const questionShowStart = performance.now();
  const questionPromises = students.map(
    (socket, i) =>
      new Promise((resolve) => {
        socket.once('question:show', () => {
          questionLatencies.push(performance.now() - questionShowStart);
          resolve();
        });
      })
  );
  host.emit('game:host-start');
  await Promise.race([Promise.all(questionPromises), new Promise((r) => setTimeout(r, 20_000))]);

  const revealPromise = new Promise((resolve) => host.once('answer:reveal', resolve));
  for (const socket of students) socket.emit('game:answer', { choiceIdx: 0 });
  await new Promise((r) => setTimeout(r, 300));
  answerAcceptedCount.n = students.length; // server accepted without visible errors in this run
  host.emit('game:host-next');
  await Promise.race([revealPromise, new Promise((r) => setTimeout(r, 20_000))]);

  console.log(`  All ${studentCount} students joined the room in ${joinWallClock.toFixed(0)}ms wall-clock`);
  summarize('connect+join latency', joinLatencies);
  summarize('question broadcast reach', questionLatencies);
  console.log(`  ${questionLatencies.length}/${studentCount} students received the broadcast question`);

  host.disconnect();
  for (const socket of students) socket.disconnect();
}

function startServer(env) {
  const child = spawn(process.execPath, ['server/dist/index.js'], { cwd: root, env, stdio: ['ignore', 'pipe', 'pipe'] });
  child.stdout.on('data', (chunk) => process.stdout.write(`[server] ${chunk}`));
  child.stderr.on('data', (chunk) => process.stderr.write(`[server] ${chunk}`));
  return child;
}

async function waitForServer() {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    try {
      if ((await fetch(`${BASE}/api/health`)).ok) return;
    } catch { /* still starting */ }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error('benchmark server did not become healthy');
}

const dataDir = mkdtempSync(path.join(tmpdir(), 'smart-lecture-bench-'));
const env = { ...process.env, PORT: String(PORT), DATA_DIR: dataDir, DB_PATH: path.join(dataDir, 'bench.db') };
console.log(`LAN benchmark — tiers: ${TIERS.join(', ')} — isolated DB at ${dataDir}`);
const server = startServer(env);
try {
  await waitForServer();

  const firstAdminToken = await login('admin', 'admin123');
  if (!firstAdminToken) throw new Error('admin login failed');
  await api('POST', '/auth/change-password', firstAdminToken, { oldPassword: 'admin123', newPassword: 'Admin@123456' });
  const adminToken = await login('admin', 'Admin@123456');
  if (!adminToken) throw new Error('admin re-login after password change failed');
  const createTeacher = await api('POST', '/users', adminToken, { username: 'bench_teacher', password: 'Gv@123456', role: 'teacher', displayName: 'Bench Teacher' });
  if (!createTeacher.user?.id) throw new Error(`teacher creation failed: ${JSON.stringify(createTeacher)}`);
  const firstTeacherToken = await login('bench_teacher', 'Gv@123456');
  await api('POST', '/auth/change-password', firstTeacherToken, { oldPassword: 'Gv@123456', newPassword: 'Gv@654321' });
  const teacherToken = await login('bench_teacher', 'Gv@654321');
  if (!teacherToken) throw new Error('teacher login failed');
  const questionIds = [];
  for (const content of ['Bench Q1', 'Bench Q2', 'Bench Q3']) {
    const created = await api('POST', '/questions', teacherToken, {
      type: 'mcq', content, options: ['A. Mot', 'B. Hai', 'C. Ba', 'D. Bon'],
      correctAnswer: 'A', explanation: '', bloomLevel: 'Nhận biết', category: '', folderId: null,
    });
    if (!created.question?.id) throw new Error(`question creation failed: ${JSON.stringify(created)}`);
    questionIds.push(created.question.id);
  }
  const classResult = await api('POST', '/classes', teacherToken, { name: `Bench ${Date.now()}`, subject: 'Benchmark', academicYear: '2026-2027' });
  const classId = classResult.class?.id;
  if (!classId) throw new Error(`class creation failed: ${JSON.stringify(classResult)}`);

  for (const tier of TIERS) {
    await runTier(tier, teacherToken, classId, questionIds);
  }

  console.log('\nLAN benchmark complete.');
} finally {
  if (server.exitCode === null) {
    server.kill();
    await new Promise((resolve) => { server.once('exit', resolve); setTimeout(resolve, 5_000); });
  }
  if (existsSync(dataDir)) rmSync(dataDir, { recursive: true, force: true });
}

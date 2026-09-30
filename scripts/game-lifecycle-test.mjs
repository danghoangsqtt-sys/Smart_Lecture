/**
 * Game lifecycle smoke test across every game type.
 *
 * scripts/socket-test.mjs and scripts/circuit-restart-test.mjs exercise
 * quick_quiz and circuit_simulate in real depth, but the other 9 game types
 * (tug_of_war, math_race, hand_raise, crossword, bingo, memory_match,
 * word_scramble, quiz_show, circuit_draw) had zero automated coverage beyond
 * "does POST /games accept this config" — nothing ever attached a host,
 * joined a learner, started the room, and confirmed the game-specific init
 * event actually fires. This script closes that gap without trying to
 * replicate the deep per-game regression suites: attach -> join -> start ->
 * confirm the right event arrives, for all 11 types in one pass.
 *
 * Usage: BASE=http://127.0.0.1:PORT node scripts/game-lifecycle-test.mjs
 */
import { io } from 'socket.io-client';

const base = process.env.BASE ?? 'http://127.0.0.1:4100';
let pass = 0, fail = 0;

async function api(method, path, token, body) {
  const res = await fetch(`${base}/api${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return res.json().catch(() => null);
}
async function login(username, password) {
  const r = await api('POST', '/auth/login', null, { username, password });
  return r?.token ?? '';
}
function connect(token) {
  return io(base, { transports: ['websocket'], auth: { token } });
}

console.log('=== GAME LIFECYCLE TEST (all game types) ===');

const adminToken = await login('admin', 'Admin@123456');
await api('POST', '/users', adminToken, { username: 'lifecycle_teacher', password: 'Gv@123456', role: 'teacher', displayName: 'Lifecycle Teacher' }).catch(() => {});
const firstTeacherToken = await login('lifecycle_teacher', 'Gv@123456');
await api('POST', '/auth/change-password', firstTeacherToken, { oldPassword: 'Gv@123456', newPassword: 'Gv@654321' });
const teacher = await login('lifecycle_teacher', 'Gv@654321');
const cls = await api('POST', '/classes', teacher, { name: `Lifecycle ${Date.now()}`, subject: 'Lifecycle', academicYear: '2026-2027' });
const classId = cls.class.id;
await api('POST', '/users', teacher, { username: 'lifecycle_student', password: 'Hocvien@123', role: 'student', displayName: 'Lifecycle Student', studentCode: 'LIFECYCLE-STUDENT', classId }).catch(() => {});
const firstStudentToken = await login('lifecycle_student', 'Hocvien@123');
await api('POST', '/auth/change-password', firstStudentToken, { oldPassword: 'Hocvien@123', newPassword: 'Hocvien@456' });
const student = await login('lifecycle_student', 'Hocvien@456');

const studentsRes = await api('GET', '/users?role=student', teacher);
const studentId = (studentsRes.users ?? []).find((u) => u.username === 'lifecycle_student')?.id;
await api('POST', `/classes/${classId}/enroll`, teacher, { studentIds: [studentId] });

const qIds = [];
for (let i = 0; i < 4; i++) {
  const q = await api('POST', '/questions', teacher, {
    type: 'mcq', content: `Lifecycle question ${i}`, options: ['A. 1', 'B. 2', 'C. 3', 'D. 4'],
    correctAnswer: 'A', bloomLevel: 'Nhận biết', category: '',
  });
  if (q?.question?.id) qIds.push(q.question.id);
}

const specs = [
  { type: 'quick_quiz', extra: { questionIds: qIds, secondsPerQuestion: 20 }, initEvent: 'question:show' },
  { type: 'tug_of_war', extra: { questionIds: qIds, secondsPerQuestion: 20 }, initEvent: 'question:show' },
  { type: 'math_race', extra: { durationSec: 90, difficulty: 1 }, initEvent: 'race:start' },
  { type: 'hand_raise', extra: { questionIds: qIds, secondsPerQuestion: 20 }, initEvent: 'question:show' },
  { type: 'crossword', extra: { puzzle: { keyword: 'OR', rows: [{ clue: 'Đơn vị đo điện trở', word: 'OHM' }, { clue: 'Hồ quang điện', word: 'ARC' }] } }, initEvent: 'cw:state' },
  { type: 'bingo', extra: {}, initEvent: 'bingo:init' },
  { type: 'memory_match', extra: {}, initEvent: 'memory:init' },
  { type: 'word_scramble', extra: { questionIds: qIds }, initEvent: 'word_scramble:update' },
  { type: 'quiz_show', extra: { questionIds: qIds }, initEvent: 'quiz_show:question' },
  { type: 'circuit_draw', extra: {}, initEvent: 'circuit_draw:init' },
  { type: 'circuit_simulate', extra: {}, initEvent: 'circuit_simulate:challenge' },
];

for (const spec of specs) {
  const game = await api('POST', '/games', teacher, { gameType: spec.type, classId, ...spec.extra });
  if (!game?.roomCode) {
    console.log(`  FAIL  ${spec.type.padEnd(16)} game creation failed: ${JSON.stringify(game)}`);
    fail++;
    continue;
  }

  const learner = connect(student);
  let host = null;
  const result = await new Promise((resolve) => {
    let hostSynced = false, joined = false, started = false;
    const finish = (ok, reason) => resolve({ ok, reason });
    const timeout = setTimeout(() => finish(false, `timeout (hostSync=${hostSynced} joined=${joined})`), 6000);

    learner.on('connect', () => learner.emit('game:join', { roomCode: game.roomCode }));
    learner.on('game:joined', () => {
      joined = true;
      host = connect(teacher);
      host.on('connect', () => host.emit('game:host-attach', { sessionId: game.id }));
      host.on('host:sync', () => {
        hostSynced = true;
        started = true;
        host.emit('game:host-start');
      });
      host.on('game:error', (d) => { clearTimeout(timeout); finish(false, `host error: ${d.message}`); });
    });
    learner.on('game:error', (d) => { clearTimeout(timeout); finish(false, `learner error: ${d.message}`); });
    learner.on(spec.initEvent, () => {
      if (!started) return;
      clearTimeout(timeout);
      finish(hostSynced && joined, 'ok');
    });
  });

  host?.disconnect();
  learner.disconnect();

  if (result.ok) { console.log(`  PASS  ${spec.type.padEnd(16)} room ${game.roomCode}`); pass++; }
  else { console.log(`  FAIL  ${spec.type.padEnd(16)} room ${game.roomCode} — ${result.reason}`); fail++; }
}

console.log(`\nGame lifecycle test: ${pass}/${specs.length} passed`);
process.exit(fail > 0 ? 1 : 0);

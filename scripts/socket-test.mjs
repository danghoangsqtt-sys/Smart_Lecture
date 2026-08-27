import { io } from 'socket.io-client';

const BASE = process.env.BASE ?? 'http://localhost:4100';
const results = [];
function check(name, cond) {
  results.push(cond);
  console.log(`  ${cond ? 'PASS' : 'FAIL'}  ${name}`);
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function login(username, password) {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  const body = await res.json();
  return body.token;
}

async function api(method, path, token, body) {
  const res = await fetch(`${BASE}/api${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return res.json();
}

console.log('=== SOCKET REALTIME TEST ===');

// --- self-seed qua REST ---
const adminToken = await login('admin', 'Admin@123456');
if (!adminToken) {
  console.error('FATAL: không đăng nhập được admin');
  process.exit(1);
}
await api('POST', '/users', adminToken, {
  username: 'teacher.hoa', password: 'Gv@123456', role: 'teacher', displayName: 'Co Hoa',
}).catch(() => undefined);
const teacherToken = await login('teacher.hoa', 'Gv@654321');
await api('POST', '/users/import', teacherToken, {
  rows: [
    { displayName: 'Nguyen Van Anh', username: 'anh' },
    { displayName: 'Tran Thi Binh', username: 'binh' },
  ],
}).catch(() => undefined);

const mkQ = async (content) =>
  (
    await api('POST', '/questions', teacherToken, {
      type: 'mcq',
      content,
      options: ['A. Mot', 'B. Hai', 'C. Ba', 'D. Bon'],
      correctAnswer: 'A',
      explanation: '',
      bloomLevel: 'Nhận biết',
      category: '',
      folderId: null,
    })
  ).question.id;

const qIds = [];
for (const content of ['So 1 + 1 = ?', 'So 2 x 3 = ?']) {
  qIds.push(await mkQ(content));
}

const anToken = await login('anh', 'Anh@123456');
const binhToken = await login('binh', 'Hocvien@123');
const dungToken = await login('dung', 'Hocvien@123');
await api('POST', '/auth/change-password', binhToken, { oldPassword: 'Hocvien@123', newPassword: 'Binh@123456' });
await api('POST', '/auth/change-password', dungToken, { oldPassword: 'Hocvien@123', newPassword: 'Dung@123456' });
const classResult = await api('POST', '/classes', teacherToken, {
  name: `Socket Test ${Date.now()}`,
  subject: 'Kiểm thử realtime',
  academicYear: '2026-2027',
});
const classId = classResult.class?.id;
const students = await api('GET', '/users?role=student', teacherToken);
const socketStudentIds = (students.users ?? [])
  .filter((user) => user.username === 'anh' || user.username === 'binh')
  .map((user) => user.id);
await api('POST', `/classes/${classId}/enroll`, teacherToken, { studentIds: socketStudentIds });
check('tokens and enrollment ready', !!teacherToken && !!anToken && !!binhToken && qIds.length === 2 && socketStudentIds.length === 2);
const game = await api('POST', '/games', teacherToken, {
  gameType: 'quick_quiz',
  questionIds: qIds,
  secondsPerQuestion: 8,
  classId,
});
check('game created', !!game.roomCode);

function connect(token) {
  return io(BASE.replace('http://localhost', 'http://localhost'), {
    transports: ['websocket'],
    auth: { token },
  });
}

const host = connect(teacherToken);
const sA = connect(anToken);
const sB = connect(binhToken);
const outsider = connect(dungToken);
const nonHost = connect(adminToken);

let lobbyCount = 0;
let questionShownA = null;
let reveal = null;
let finishedPodium = null;
let outsiderError = null;
let nonHostError = null;

host.on('lobby:update', (d) => (lobbyCount = d.count));
host.on('answer:reveal', (d) => (reveal = d));

sA.on('question:show', (d) => (questionShownA = d));
sB.on('game:finished', () => undefined);
outsider.on('game:error', (data) => (outsiderError = data));
nonHost.on('game:error', (data) => (nonHostError = data));

nonHost.emit('game:host-attach', { sessionId: game.id });
outsider.emit('game:join', { roomCode: game.roomCode });
await sleep(400);
check('non-host cannot attach as host', !!nonHostError);
check('unenrolled student cannot join', !!outsiderError);

await new Promise((resolve) => {
  let done = false;
  const finish = () => {
    if (!done) {
      done = true;
      resolve();
    }
  };
  sB.on('game:finished', (d) => {
    finishedPodium = d.podium;
    finish();
  });
  setTimeout(finish, 4000);

  host.emit('game:host-attach', { sessionId: game.id });
  setTimeout(() => {
    sA.emit('game:join', { roomCode: game.roomCode });
    sB.emit('game:join', { roomCode: game.roomCode });
  }, 300);
  setTimeout(() => host.emit('game:host-start'), 900);
  setTimeout(() => {
    sA.emit('game:answer', { choiceIdx: 0 });
    sB.emit('game:answer', { choiceIdx: 1 });
  }, 1600);
  setTimeout(() => host.emit('game:host-next'), 2500);
});

check(`lobby saw ${lobbyCount} players`, lobbyCount === 2);
check('student A received question', questionShownA !== null && questionShownA.total === 2);
check('host received answer reveal', reveal !== null && typeof reveal.correctCount === 'number');

// second question
let q2Shown = false;
sA.on('question:show', (d) => {
  if (d.index === 1) q2Shown = true;
});
await sleep(400);
host.emit('game:host-next');
await sleep(1200);
check('second question broadcast', q2Shown);

await sleep(400);
host.emit('game:host-next');
await sleep(1200);
check('second question broadcast', q2Shown);

// GV chấm xong câu cuối → reveal → next ⇒ kết thúc
let finishedWait = new Promise((resolve) => {
  sB.on('game:finished', (d) => resolve(d.podium));
});
host.emit('game:host-next'); // hết giờ / hiện đáp án Q2
await sleep(700);
host.emit('game:host-next'); // sang bước tiếp theo ⇒ finish
finishedPodium = await Promise.race([finishedWait, sleep(3000).then(() => null)]);
check(`game finished with podium (${finishedPodium ? finishedPodium.length : 0})`, Array.isArray(finishedPodium) && finishedPodium.length >= 2);

host.disconnect();
sA.disconnect();
sB.disconnect();
outsider.disconnect();
nonHost.disconnect();

const pass = results.filter(Boolean).length;
console.log(`\nSOCKET TEST: ${pass}/${results.length} passed`);
setTimeout(() => process.exit(pass === results.length ? 0 : 1), 300);

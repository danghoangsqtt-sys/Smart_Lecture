import { readFileSync, writeFileSync } from 'node:fs';
import { io } from 'socket.io-client';

const BASE = process.env.BASE ?? 'http://127.0.0.1:4100';
const STATE_PATH = process.env.CIRCUIT_RESTART_STATE_PATH;
const mode = process.argv[2];

if (!STATE_PATH || (mode !== 'prepare' && mode !== 'verify')) {
  console.error('usage: CIRCUIT_RESTART_STATE_PATH=<path> node scripts/circuit-restart-test.mjs <prepare|verify>');
  process.exit(2);
}

function check(name, condition) {
  console.log(`  ${condition ? 'PASS' : 'FAIL'}  ${name}`);
  if (!condition) throw new Error(`Circuit restart assertion failed: ${name}`);
}

async function request(method, path, token, body) {
  const response = await fetch(`${BASE}/api${path}`, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await response.json().catch(() => ({}));
  return { ok: response.ok, status: response.status, data };
}

async function login(username, password) {
  const result = await request('POST', '/auth/login', '', { username, password });
  if (!result.ok || typeof result.data.token !== 'string') {
    throw new Error(`Cannot login ${username}: HTTP ${result.status}`);
  }
  return result.data.token;
}

function connect(token) {
  return io(BASE, { transports: ['websocket'], auth: { token }, reconnection: false });
}

function waitFor(socket, event, predicate = () => true, timeoutMs = 8_000) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      socket.off(event, handler);
      reject(new Error(`Timed out waiting for ${event}`));
    }, timeoutMs);
    const handler = (payload) => {
      if (!predicate(payload)) return;
      clearTimeout(timeout);
      socket.off(event, handler);
      resolve(payload);
    };
    socket.on(event, handler);
  });
}

function waitForConnect(socket) {
  if (socket.connected) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Socket connect timeout')), 8_000);
    socket.once('connect', () => {
      clearTimeout(timeout);
      resolve();
    });
    socket.once('connect_error', (error) => {
      clearTimeout(timeout);
      reject(error);
    });
  });
}

function completedLedCircuit() {
  return {
    components: [
      { id: 'restart-vcc', type: 'vcc', x: 100, y: 100, rotation: 0, properties: {} },
      { id: 'restart-switch', type: 'switch', x: 240, y: 100, rotation: 0, properties: {} },
      { id: 'restart-led', type: 'led', x: 380, y: 100, rotation: 0, properties: {} },
      { id: 'restart-gnd', type: 'gnd', x: 380, y: 240, rotation: 0, properties: {} },
    ],
    wires: [
      { id: 'restart-wire-1', from: 'restart-vcc', to: 'restart-switch', fromPort: 'out', toPort: 'in' },
      { id: 'restart-wire-2', from: 'restart-switch', to: 'restart-led', fromPort: 'out', toPort: 'anode' },
      { id: 'restart-wire-3', from: 'restart-led', to: 'restart-gnd', fromPort: 'cathode', toPort: 'out' },
    ],
    submitted: true,
  };
}

async function readKttx(classId, studentId, teacherToken) {
  const gradebook = await request('GET', `/classes/${classId}/gradebook`, teacherToken);
  if (!gradebook.ok) throw new Error(`Cannot read gradebook: HTTP ${gradebook.status}`);
  return gradebook.data.rows?.find((row) => row.studentId === studentId)?.kttx ?? null;
}

async function prepare() {
  console.log('=== CIRCUIT RESTART TEST: PREPARE ===');
  const suffix = `${Date.now()}`;
  const teacherUsername = `restart.teacher.${suffix}`;
  const studentUsername = `restart.student.${suffix}`;
  const teacherInitialPassword = 'Teacher@123';
  const teacherPassword = 'Teacher@1234';
  const studentInitialPassword = 'Student@123';
  const studentPassword = 'Student@1234';
  const adminToken = await login('admin', 'Admin@123456');

  const teacherCreated = await request('POST', '/users', adminToken, {
    username: teacherUsername,
    password: teacherInitialPassword,
    role: 'teacher',
    displayName: 'Restart Teacher',
  });
  check('restart teacher created', teacherCreated.status === 201);
  let teacherToken = await login(teacherUsername, teacherInitialPassword);
  const teacherChanged = await request('POST', '/auth/change-password', teacherToken, {
    oldPassword: teacherInitialPassword,
    newPassword: teacherPassword,
  });
  check('restart teacher password activated', teacherChanged.ok);
  teacherToken = await login(teacherUsername, teacherPassword);

  const studentCreated = await request('POST', '/users', adminToken, {
    username: studentUsername,
    password: studentInitialPassword,
    role: 'student',
    displayName: 'Restart Student',
  });
  check('restart student created', studentCreated.status === 201);
  const studentId = studentCreated.data.user?.id;
  let studentToken = await login(studentUsername, studentInitialPassword);
  const studentChanged = await request('POST', '/auth/change-password', studentToken, {
    oldPassword: studentInitialPassword,
    newPassword: studentPassword,
  });
  check('restart student password activated', studentChanged.ok);
  studentToken = await login(studentUsername, studentPassword);

  const classCreated = await request('POST', '/classes', teacherToken, {
    name: `Circuit Restart ${suffix}`,
    subject: 'Mạch logic',
    academicYear: '2026-2027',
  });
  const classId = classCreated.data.class?.id;
  check('restart class created', classCreated.status === 201 && typeof classId === 'string');
  const enrolled = await request('POST', `/classes/${classId}/enroll`, teacherToken, { studentIds: [studentId] });
  check('restart learner enrolled', enrolled.ok);

  const gameCreated = await request('POST', '/games', teacherToken, {
    gameType: 'circuit_simulate',
    title: 'Circuit restart persistence',
    secondsPerQuestion: 14,
    pointsPerCorrect: 0.5,
    classId,
  });
  const sessionId = gameCreated.data.id;
  const roomCode = gameCreated.data.roomCode;
  check('restart circuit room created', gameCreated.status === 201 && typeof sessionId === 'string' && typeof roomCode === 'string');

  const host = connect(teacherToken);
  const learner = connect(studentToken);
  try {
    await Promise.all([waitForConnect(host), waitForConnect(learner)]);
    const hostSyncPromise = waitFor(host, 'host:sync');
    host.emit('game:host-attach', { sessionId });
    await hostSyncPromise;

    const joinedPromise = waitFor(learner, 'game:joined');
    learner.emit('game:join', { roomCode });
    await joinedPromise;

    const challengePromise = waitFor(learner, 'circuit_simulate:challenge', (payload) => payload?.index === 0);
    host.emit('game:host-start');
    const challenge = await challengePromise;
    check('first challenge has absolute deadline', Number.isFinite(challenge.endsAt) && challenge.endsAt > Date.now());

    const passedPromise = waitFor(learner, 'circuit_simulate:challenge_passed');
    learner.emit('circuit_simulate:circuit', completedLedCircuit());
    const passed = await passedPromise;
    check('correct circuit completed before restart', passed?.challengeId === 'digital_1' && passed?.points === 100);
    check('KTTX awarded once before restart', (await readKttx(classId, studentId, teacherToken)) === 0.5);

    writeFileSync(STATE_PATH, JSON.stringify({
      teacherToken,
      studentToken,
      studentId,
      classId,
      sessionId,
      roomCode,
      originalEndsAt: challenge.endsAt,
    }, null, 2));
    console.log('Circuit restart prepare PASS');
  } finally {
    host.disconnect();
    learner.disconnect();
  }
}

async function verify() {
  console.log('=== CIRCUIT RESTART TEST: VERIFY ===');
  const state = JSON.parse(readFileSync(STATE_PATH, 'utf8'));
  const learner = connect(state.studentToken);
  const host = connect(state.teacherToken);
  try {
    await waitForConnect(learner);
    const restoredChallengePromise = waitFor(learner, 'circuit_simulate:challenge', (payload) => payload?.index === 0);
    const restoredStatePromise = waitFor(learner, 'circuit_simulate:restored');
    const nextChallengePromise = waitFor(
      learner,
      'circuit_simulate:challenge',
      (payload) => payload?.index === 1,
      Math.max(5_000, state.originalEndsAt - Date.now() + 5_000),
    );
    learner.emit('game:join', { roomCode: state.roomCode });
    const [challenge, restored] = await Promise.all([restoredChallengePromise, restoredStatePromise]);
    check('learner reconnects before host after restart', challenge?.index === 0);
    check('absolute challenge deadline preserved', challenge?.endsAt === state.originalEndsAt);
    check('exact topology restored after restart', restored?.circuit?.components?.length === 4 && restored?.circuit?.wires?.length === 3);
    check('completed state restored after restart', restored?.completed === true);

    await waitForConnect(host);
    const hostSyncPromise = waitFor(host, 'host:sync');
    host.emit('game:host-attach', { sessionId: state.sessionId });
    const hostSync = await hostSyncPromise;
    check('host challenge deadline restored', hostSync?.circuitSimulate?.challenge?.endsAt === state.originalEndsAt);
    check('host completion feed restored', hostSync?.circuitSimulate?.passes?.length === 1 && hostSync.circuitSimulate.passes[0]?.name === 'Restart Student');
    check('host circuit leaderboard restored', hostSync?.leaderboard?.length === 1 && hostSync.leaderboard[0]?.score === 100);
    check('KTTX unchanged immediately after restart', (await readKttx(state.classId, state.studentId, state.teacherToken)) === 0.5);

    const nextChallenge = await nextChallengePromise;
    check('timer resumes and advances from original deadline', nextChallenge?.index === 1 && nextChallenge?.endsAt > state.originalEndsAt);
    check('timer evaluation does not duplicate KTTX', (await readKttx(state.classId, state.studentId, state.teacherToken)) === 0.5);
    console.log('Circuit restart verify PASS');
  } finally {
    learner.disconnect();
    host.disconnect();
  }
}

await (mode === 'prepare' ? prepare() : verify());

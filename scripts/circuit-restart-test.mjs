import { readFileSync, writeFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
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

function expectNoEvent(socket, event, action, waitMs = 500) {
  return new Promise((resolve, reject) => {
    const handler = () => {
      clearTimeout(timeout);
      socket.off(event, handler);
      reject(new Error(`Unexpected ${event}`));
    };
    const timeout = setTimeout(() => {
      socket.off(event, handler);
      resolve();
    }, waitMs);
    socket.on(event, handler);
    action();
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

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
  const outsiderUsername = `restart.outsider.${suffix}`;
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
  const teacherId = teacherCreated.data.user?.id;
  check('restart teacher created', teacherCreated.status === 201 && typeof teacherId === 'string');
  let teacherToken = await login(teacherUsername, teacherInitialPassword);
  const teacherChanged = await request('POST', '/auth/change-password', teacherToken, {
    oldPassword: teacherInitialPassword,
    newPassword: teacherPassword,
  });
  check('restart teacher password activated', teacherChanged.ok);
  teacherToken = await login(teacherUsername, teacherPassword);

  const outsiderCreated = await request('POST', '/users', adminToken, {
    username: outsiderUsername,
    password: teacherInitialPassword,
    role: 'teacher',
    displayName: 'Restart Outsider',
  });
  check('unrelated restart teacher created', outsiderCreated.status === 201);
  let outsiderToken = await login(outsiderUsername, teacherInitialPassword);
  const outsiderChanged = await request('POST', '/auth/change-password', outsiderToken, {
    oldPassword: teacherInitialPassword,
    newPassword: teacherPassword,
  });
  check('unrelated restart teacher password activated', outsiderChanged.ok);
  outsiderToken = await login(outsiderUsername, teacherPassword);

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

    const incorrectValidationPromise = waitFor(
      learner,
      'circuit_simulate:validation',
      (payload) => payload?.correct === false,
    );
    learner.emit('circuit_simulate:circuit', { components: [], wires: [], submitted: true });
    const incorrectValidation = await incorrectValidationPromise;
    check(
      'incorrect explicit submission starts cumulative diagnostics',
      incorrectValidation?.attempts === 1 && incorrectValidation?.code === 'wire_count',
    );

    const validationPromise = waitFor(
      learner,
      'circuit_simulate:validation',
      (payload) => payload?.correct === true,
    );
    const passedPromise = waitFor(learner, 'circuit_simulate:challenge_passed');
    learner.emit('circuit_simulate:circuit', completedLedCircuit());
    const [validation, passed] = await Promise.all([validationPromise, passedPromise]);
    check(
      'correct submission records a bounded validation checkpoint',
      validation?.code === 'correct'
        && validation?.attempts === 2
        && Number.isFinite(validation?.submittedAt),
    );
    check('correct circuit completed before restart', passed?.challengeId === 'digital_1' && passed?.points === 100);
    check('KTTX awarded once before restart', (await readKttx(classId, studentId, teacherToken)) === 0.5);

    const pausedPromise = waitFor(
      host,
      'circuit_simulate:control_state',
      (payload) => payload?.paused === true && payload?.index === 0,
    );
    host.emit('circuit_simulate:host-control', { action: 'pause' });
    const paused = await pausedPromise;
    check(
      'teacher pause stores a positive remaining duration',
      Number.isFinite(paused?.remainingMs) && paused.remainingMs > 0 && paused.remainingMs <= 14_000,
    );
    await expectNoEvent(
      host,
      'circuit_simulate:control_state',
      () => learner.emit('circuit_simulate:host-control', { action: 'extend' }),
    );
    check('learner cannot extend circuit challenge time', true);
    const extendedPromise = waitFor(
      host,
      'circuit_simulate:control_state',
      (payload) => payload?.paused === true && payload?.remainingMs === paused.remainingMs + 30_000,
    );
    host.emit('circuit_simulate:host-control', { action: 'extend' });
    const extended = await extendedPromise;
    check('host paused extension adds exactly 30 seconds', extended?.remainingMs === paused.remainingMs + 30_000);
    const inspectionPromise = waitFor(
      host,
      'circuit_simulate:inspection',
      (payload) => payload?.userId === studentId,
    );
    host.emit('circuit_simulate:inspect', { userId: studentId });
    const inspection = await inspectionPromise;
    check('learner activity timestamp captured before restart', Number.isFinite(inspection?.lastActivityAt) && inspection.lastActivityAt > 0);
    check(
      'host sees current submission diagnostics before restart',
      inspection?.submissionAttempts === 2
        && inspection?.totalSubmissionAttempts === 2
        && inspection?.incorrectSubmissionAttempts === 1
        && inspection?.lastValidationCode === 'correct'
        && inspection?.lastValidationFeedback === validation.feedback
        && inspection?.lastSubmissionAt === validation.submittedAt,
    );

    learner.disconnect();
    await delay(150);
    const queuedMessage = 'Hỗ trợ đang chờ qua lần khởi động lại.';
    const queuedAckPromise = waitFor(
      host,
      'circuit_simulate:teacher-message-sent',
      (payload) => payload?.userId === studentId && payload?.kind === 'hint',
    );
    host.emit('circuit_simulate:teacher-message', {
      userId: studentId,
      kind: 'hint',
      message: queuedMessage,
    });
    const queuedAck = await queuedAckPromise;
    check(
      'offline assistance is durably queued before restart',
      queuedAck?.delivered === false
        && queuedAck?.status === 'queued'
        && typeof queuedAck?.messageId === 'string',
    );

    writeFileSync(STATE_PATH, JSON.stringify({
      teacherToken,
      teacherId,
      outsiderToken,
      studentToken,
      studentId,
      classId,
      sessionId,
      roomCode,
      originalEndsAt: challenge.endsAt,
      pausedRemainingMs: extended.remainingMs,
      lastActivityAt: inspection.lastActivityAt,
      submissionAttempts: inspection.submissionAttempts,
      totalSubmissionAttempts: inspection.totalSubmissionAttempts,
      incorrectSubmissionAttempts: inspection.incorrectSubmissionAttempts,
      lastSubmissionAt: inspection.lastSubmissionAt,
      lastValidationCode: inspection.lastValidationCode,
      lastValidationFeedback: inspection.lastValidationFeedback,
      queuedMessage,
      queuedMessageId: queuedAck.messageId,
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
    const queuedMessagePromise = waitFor(
      learner,
      'circuit_simulate:teacher-message',
      (payload) => payload?.messageId === state.queuedMessageId,
    );
    learner.emit('game:join', { roomCode: state.roomCode });
    const [challenge, restored, queuedMessage] = await Promise.all([
      restoredChallengePromise,
      restoredStatePromise,
      queuedMessagePromise,
    ]);
    check('learner reconnects before host after restart', challenge?.index === 0);
    check('absolute challenge deadline preserved', challenge?.endsAt === state.originalEndsAt);
    check('paused challenge restored for learner', challenge?.paused === true && challenge?.remainingMs === state.pausedRemainingMs);
    check('exact topology restored after restart', restored?.circuit?.components?.length === 4 && restored?.circuit?.wires?.length === 3);
    check('completed state restored after restart', restored?.completed === true);
    check(
      'learner validation checkpoint restored after restart',
      restored?.validation?.correct === true
        && restored?.validation?.attempts === state.submissionAttempts
        && restored?.validation?.submittedAt === state.lastSubmissionAt
        && restored?.validation?.feedback === state.lastValidationFeedback,
    );
    check(
      'learner-first reconnect receives exact queued assistance after restart',
      queuedMessage?.message === state.queuedMessage && queuedMessage?.messageId === state.queuedMessageId,
    );
    await expectNoEvent(
      learner,
      'circuit_simulate:teacher-message',
      () => learner.emit('game:join', { roomCode: state.roomCode }),
    );
    check('pending assistance is emitted once on the same socket connection', true);

    await expectNoEvent(
      learner,
      'circuit_simulate:teacher-message-acknowledged',
      () => learner.emit('circuit_simulate:teacher-message-ack', {
        messageId: '00000000-0000-4000-8000-000000000000',
      }),
    );
    const acknowledgedPromise = waitFor(
      learner,
      'circuit_simulate:teacher-message-acknowledged',
      (payload) => payload?.messageId === state.queuedMessageId,
    );
    learner.emit('circuit_simulate:teacher-message-ack', { messageId: state.queuedMessageId });
    await acknowledgedPromise;
    check('learner explicitly acknowledges only the current durable message', true);

    await expectNoEvent(
      learner,
      'circuit_simulate:inspection',
      () => learner.emit('circuit_simulate:inspect', { userId: state.studentId }),
    );
    check('learner cannot inspect circuit topology', true);

    await delay(Math.max(0, state.originalEndsAt - Date.now() + 600));

    await waitForConnect(host);
    const hostSyncPromise = waitFor(host, 'host:sync');
    host.emit('game:host-attach', { sessionId: state.sessionId });
    const hostSync = await hostSyncPromise;
    check('host challenge deadline restored', hostSync?.circuitSimulate?.challenge?.endsAt === state.originalEndsAt);
    check(
      'host remains paused after the old deadline and process restart',
      hostSync?.circuitSimulate?.challenge?.paused === true
        && hostSync?.circuitSimulate?.challenge?.remainingMs === state.pausedRemainingMs,
    );
    check('host completion feed restored', hostSync?.circuitSimulate?.passes?.length === 1 && hostSync.circuitSimulate.passes[0]?.name === 'Restart Student');
    check('host circuit leaderboard restored', hostSync?.leaderboard?.length === 1 && hostSync.leaderboard[0]?.score === 100);
    check(
      'host snapshot restores learner-first acknowledgement',
      hostSync?.circuitSimulate?.assistance?.length === 1
        && hostSync.circuitSimulate.assistance[0]?.messageId === state.queuedMessageId
        && hostSync.circuitSimulate.assistance[0]?.status === 'acknowledged',
    );
    const progress = hostSync?.circuitSimulate?.progress?.[0];
    check(
      'host learner progress restored after restart',
      hostSync?.circuitSimulate?.progress?.length === 1
        && progress?.userId === state.studentId
        && progress?.status === 'completed'
        && progress?.componentCount === 4
        && progress?.wireCount === 3
        && progress?.score === 100
        && progress?.lastActivityAt === state.lastActivityAt
        && progress?.submissionAttempts === state.submissionAttempts
        && progress?.totalSubmissionAttempts === state.totalSubmissionAttempts
        && progress?.incorrectSubmissionAttempts === state.incorrectSubmissionAttempts
        && progress?.lastSubmissionAt === state.lastSubmissionAt
        && progress?.lastValidationCode === state.lastValidationCode
        && progress?.lastValidationFeedback === state.lastValidationFeedback,
    );
    const inspectionPromise = waitFor(
      host,
      'circuit_simulate:inspection',
      (payload) => payload?.userId === state.studentId,
    );
    host.emit('circuit_simulate:inspect', { userId: state.studentId });
    const inspection = await inspectionPromise;
    check(
      'authorized host inspects exact restored topology on demand',
      inspection?.circuit?.components?.length === 4 && inspection?.circuit?.wires?.length === 3,
    );
    check('inspection restores exact learner activity timestamp', inspection?.lastActivityAt === state.lastActivityAt);
    check(
      'inspection restores exact submission diagnostics',
      inspection?.submissionAttempts === state.submissionAttempts
        && inspection?.totalSubmissionAttempts === state.totalSubmissionAttempts
        && inspection?.incorrectSubmissionAttempts === state.incorrectSubmissionAttempts
        && inspection?.lastSubmissionAt === state.lastSubmissionAt
        && inspection?.lastValidationCode === state.lastValidationCode
        && inspection?.lastValidationFeedback === state.lastValidationFeedback,
    );

    await expectNoEvent(
      learner,
      'circuit_simulate:teacher-message',
      () => learner.emit('circuit_simulate:teacher-message', {
        userId: state.studentId,
        kind: 'hint',
        message: 'Tin nhắn giả mạo từ học viên',
      }),
    );
    check('learner cannot impersonate teacher assistance', true);

    const privateHintPromise = waitFor(
      learner,
      'circuit_simulate:teacher-message',
      (payload) => payload?.kind === 'hint',
    );
    const hintAckPromise = waitFor(
      host,
      'circuit_simulate:teacher-message-sent',
      (payload) => payload?.userId === state.studentId && payload?.kind === 'hint',
    );
    host.emit('circuit_simulate:teacher-message', {
      userId: state.studentId,
      kind: 'hint',
      message: '  Kiểm tra lại chiều dây OUT sang IN.  ',
    });
    const [privateHint, hintAck] = await Promise.all([privateHintPromise, hintAckPromise]);
    check('host hint is trimmed and delivered privately', privateHint?.message === 'Kiểm tra lại chiều dây OUT sang IN.' && hintAck?.delivered === true);

    const retryPromise = waitFor(
      learner,
      'circuit_simulate:teacher-message',
      (payload) => payload?.kind === 'retry',
    );
    const retryAckPromise = waitFor(
      host,
      'circuit_simulate:teacher-message-sent',
      (payload) => payload?.userId === state.studentId && payload?.kind === 'retry',
    );
    host.emit('circuit_simulate:teacher-message', { userId: state.studentId, kind: 'retry' });
    const [retry, retryAck] = await Promise.all([retryPromise, retryAckPromise]);
    check('host retry instruction uses safe default', retry?.message === 'Giáo viên đề nghị bạn kiểm tra lại mạch và nộp lại khi sẵn sàng.');
    check('host retry delivery is acknowledged', retryAck?.delivered === true);

    const unchangedInspectionPromise = waitFor(
      host,
      'circuit_simulate:inspection',
      (payload) => payload?.userId === state.studentId,
    );
    host.emit('circuit_simulate:inspect', { userId: state.studentId });
    const unchangedInspection = await unchangedInspectionPromise;
    check(
      'private assistance preserves topology and activity timestamp',
      unchangedInspection?.circuit?.components?.length === 4
        && unchangedInspection?.circuit?.wires?.length === 3
        && unchangedInspection?.lastActivityAt === state.lastActivityAt,
    );
    check('KTTX unchanged immediately after restart', (await readKttx(state.classId, state.studentId, state.teacherToken)) === 0.5);

    const resumedPromise = waitFor(
      learner,
      'circuit_simulate:control_state',
      (payload) => payload?.paused === false && payload?.index === 0,
    );
    host.emit('circuit_simulate:host-control', { action: 'resume' });
    const resumed = await resumedPromise;
    const resumedDuration = resumed?.endsAt - Date.now();
    check(
      'resume schedules the persisted remaining duration',
      Number.isFinite(resumedDuration)
        && resumedDuration > 0
        && Math.abs(resumedDuration - state.pausedRemainingMs) <= 2_000,
    );
    await expectNoEvent(
      host,
      'circuit_simulate:challenge',
      () => learner.emit('circuit_simulate:host-control', { action: 'evaluate' }),
    );
    check('learner cannot evaluate and advance circuit challenge', true);
    const nextChallengePromise = waitFor(
      learner,
      'circuit_simulate:challenge',
      (payload) => payload?.index === 1,
    );
    host.emit('circuit_simulate:host-control', { action: 'evaluate' });
    const nextChallenge = await nextChallengePromise;
    check('host immediate evaluation advances to the next challenge', nextChallenge?.index === 1 && nextChallenge?.endsAt > Date.now());
    check('immediate evaluation does not duplicate KTTX', (await readKttx(state.classId, state.studentId, state.teacherToken)) === 0.5);
    for (let index = 2; index <= 5; index += 1) {
      const challengePromise = waitFor(
        learner,
        'circuit_simulate:challenge',
        (payload) => payload?.index === index,
      );
      host.emit('circuit_simulate:host-control', { action: 'evaluate' });
      await challengePromise;
    }
    const finishedPromise = waitFor(
      host,
      'circuit_simulate:learning_debrief',
      (payload) => payload?.summary?.learnerCount === 1,
    );
    const learnerPrivacyPromise = expectNoEvent(
      learner,
      'circuit_simulate:learning_debrief',
      () => host.emit('circuit_simulate:host-control', { action: 'evaluate' }),
    );
    const debrief = await finishedPromise;
    await learnerPrivacyPromise;
    check('learner does not receive host-only circuit debrief', true);
    check(
      'finish payload contains authoritative cumulative circuit debrief',
      debrief?.summary?.totalCompletions === 1
        && debrief?.summary?.totalPossible === 6
        && debrief?.summary?.completionRate === 17
        && debrief?.summary?.totalSubmissionAttempts === state.totalSubmissionAttempts
        && debrief?.summary?.incorrectSubmissionAttempts === state.incorrectSubmissionAttempts
        && debrief?.learners?.[0]?.userId === state.studentId,
    );
    const database = new DatabaseSync(process.env.DB_PATH);
    const corruptSessionId = `corrupt-debrief-${Date.now()}`;
    try {
      const result = database.prepare(
        'SELECT detail_json FROM game_results WHERE game_session_id = ? AND student_id = ?',
      ).get(state.sessionId, state.studentId);
      const detail = JSON.parse(result?.detail_json ?? '{}');
      check(
        'safe per-learner debrief persisted in game result detail',
        detail.type === 'circuit_learning_debrief'
          && detail.version === 1
          && detail.completedCount === 1
          && detail.totalChallenges === 6
          && detail.totalSubmissionAttempts === state.totalSubmissionAttempts
          && detail.incorrectSubmissionAttempts === state.incorrectSubmissionAttempts
          && !Object.hasOwn(detail, 'circuit')
          && !Object.hasOwn(detail, 'feedback'),
      );
      database.prepare(
        `INSERT INTO game_sessions (
           id, host_teacher_id, class_id, game_type, room_code, config_json, status, finished_at
         ) VALUES (?, ?, ?, 'circuit_simulate', ?, ?, 'finished', datetime('now', '+1 second'))`,
      ).run(
        corruptSessionId,
        state.teacherId,
        state.classId,
        `corrupt-${Date.now()}`,
        JSON.stringify({ title: 'Corrupt circuit debrief', secondsPerQuestion: 14 }),
      );
      database.prepare(
        `INSERT INTO game_results (game_session_id, student_id, score, rank, detail_json)
         VALUES (?, ?, 0, 1, ?)`,
      ).run(corruptSessionId, state.studentId, '{"type":"circuit_learning_debrief","version":1,"completedCount":99}');
    } finally {
      database.close();
    }
    const recovered = await request('GET', `/games/${state.sessionId}/circuit-debrief`, state.teacherToken);
    check(
      'host retrieves durable debrief through authorized REST recovery',
      recovered.ok
        && recovered.data?.debrief?.summary?.learnerCount === 1
        && recovered.data?.debrief?.learners?.[0]?.userId === state.studentId,
    );
    const deniedStudent = await request('GET', `/games/${state.sessionId}/circuit-debrief`, state.studentToken);
    check('student cannot retrieve circuit debrief', deniedStudent.status === 403);
    const deniedOutsider = await request('GET', `/games/${state.sessionId}/circuit-debrief`, state.outsiderToken);
    check('unrelated teacher cannot retrieve circuit debrief', deniedOutsider.status === 403);
    const corrupt = await request('GET', `/games/${corruptSessionId}/circuit-debrief`, state.teacherToken);
    check('malformed stored detail returns unavailable without raw JSON', corrupt.status === 404 && corrupt.data?.error?.code === 'DEBRIEF_NOT_AVAILABLE');
    const recent = await request(
      'GET',
      `/games/mine/recent-circuit-debriefs?classId=${encodeURIComponent(state.classId)}&limit=5`,
      state.teacherToken,
    );
    check(
      'recent feed omits malformed detail and returns the valid persisted session',
      recent.ok
        && recent.data?.reports?.some((report) => report.session?.id === state.sessionId)
        && !recent.data?.reports?.some((report) => report.session?.id === corruptSessionId),
    );
    const outsiderRecent = await request(
      'GET',
      `/games/mine/recent-circuit-debriefs?classId=${encodeURIComponent(state.classId)}`,
      state.outsiderToken,
    );
    check('unrelated teacher cannot bypass class filter scope', outsiderRecent.status === 403);
    console.log('Circuit restart verify PASS');
  } finally {
    learner.disconnect();
    host.disconnect();
  }
}

await (mode === 'prepare' ? prepare() : verify());

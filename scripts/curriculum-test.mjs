import { randomUUID } from 'node:crypto';

const BASE = process.env.BASE ?? 'http://localhost:4000';
const results = [];
function check(name, cond) {
  results.push(cond);
  console.log(`  ${cond ? 'PASS' : 'FAIL'}  ${name}`);
}
function info(msg) {
  console.log(`  ....  ${msg}`);
}

async function login(username, password) {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  const body = await res.json();
  return body.token;
}

// Returns { status, data } instead of throwing on non-2xx — most checks here are
// specifically about which status/error-code a route returns, not just the happy path.
async function api(method, path, token, body) {
  const res = await fetch(`${BASE}/api${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

console.log('=== CURRICULUM / ATTENDANCE / STREAM AUTH API TEST ===');

const adminToken = await login('admin', 'admin123');
if (!adminToken) {
  console.error('FATAL: khong dang nhap duoc admin (admin/admin123) - kiem tra server dang chay tren', BASE);
  process.exit(1);
}

let classId = null;
try {
  // --- setup: disposable test class ---
  const clsRes = await api('POST', '/classes', adminToken, {
    name: `[API-TEST] ${randomUUID().slice(0, 8)}`,
    subject: 'Test',
    academicYear: '2026',
    totalPeriods: 10,
  });
  check('class created', clsRes.status === 201 && !!clsRes.data.class?.id);
  classId = clsRes.data.class?.id ?? null;

  let studentId = null;
  if (classId) {
    const eligible = await api('GET', `/classes/${classId}/eligible-students`, adminToken);
    studentId = eligible.data.students?.[0]?.id ?? null;
    if (!studentId) {
      info('khong co hoc vien nao trong he thong de enroll - bo qua cac check phu thuoc diem danh');
    } else {
      const enroll = await api('POST', `/classes/${classId}/enroll`, adminToken, { studentIds: [studentId] });
      check('student enrolled', enroll.status === 200 && enroll.data.added === 1);
    }
  }

  // --- curriculum: teaching plan + item ---
  let planId = null;
  let itemId = null;
  if (classId) {
    // POST /classes auto-creates one subject from the submitted `subject` field (Feature 2) -
    // teaching-plans now require a subjectId, so fetch that auto-created subject to use.
    const subjectsRes = await api('GET', `/classes/${classId}/subjects`, adminToken);
    const defaultSubjectId = subjectsRes.data.subjects?.[0]?.id ?? null;
    check('class auto-created one default subject', !!defaultSubjectId);

    const plan = await api('POST', `/classes/${classId}/teaching-plans`, adminToken, { name: 'Test Plan', description: '', subjectId: defaultSubjectId });
    check('teaching plan created', plan.status === 201 && !!plan.data.id);
    planId = plan.data.id ?? null;

    if (planId) {
      const item = await api('POST', `/teaching-plans/${planId}/items`, adminToken, { topic: 'Test Topic', plannedPeriods: 4 });
      check('curriculum item created', item.status === 201 && !!item.data.id);
      itemId = item.data.id ?? null;
    }
  }

  // --- attendance-shortcut button (TeachingModeTab "Diem danh buoi nay") + progress-sync idempotency ---
  if (classId && planId && itemId && studentId) {
    const today = new Date().toISOString().slice(0, 10);
    const session = await api('POST', `/classes/${classId}/attendance/sessions`, adminToken, {
      date: today,
      periodsTotal: 2,
      teachingPlanItemId: itemId,
    });
    check('attendance session created via teachingPlanItemId (attendance-shortcut button backend)', session.status === 201 && !!session.data.id);
    const sessionId = session.data.id ?? null;

    if (sessionId) {
      const recordsBody = { records: [{ studentId, status: 'present', periodsAbsent: 0, reason: '' }] };

      const save1 = await api('PUT', `/attendance/sessions/${sessionId}/records`, adminToken, recordsBody);
      check('attendance records saved (1st save)', save1.status === 200 && save1.data.ok === true);

      const afterSave1 = await api('GET', `/classes/${classId}/teaching-plans/${planId}`, adminToken);
      const itemAfter1 = afterSave1.data.plan?.items?.find((i) => i.id === itemId);
      check('progress synced after 1st save: 2/4 periods, in_progress', itemAfter1?.completedPeriods === 2 && itemAfter1?.status === 'in_progress');

      // Re-save the identical records (e.g. teacher reopens and re-submits the same session) -
      // this is exactly the scenario the idempotency fix targets: completedPeriods must not
      // double-count on a re-save that didn't change anything.
      const save2 = await api('PUT', `/attendance/sessions/${sessionId}/records`, adminToken, recordsBody);
      check('attendance records saved (2nd save, identical payload)', save2.status === 200 && save2.data.ok === true);

      const afterSave2 = await api('GET', `/classes/${classId}/teaching-plans/${planId}`, adminToken);
      const itemAfter2 = afterSave2.data.plan?.items?.find((i) => i.id === itemId);
      check('progress-sync idempotent: still 2/4 after re-save, not double-counted to 4', itemAfter2?.completedPeriods === 2);
    }
  } else if (classId) {
    info('bo qua check attendance + progress-sync (thieu plan/item/student de dung setup)');
  }

  // --- game-launch button (TeachingModeTab "Tao phong Game") ---
  if (classId) {
    const game = await api('POST', '/games', adminToken, { gameType: 'math_race', title: '[API-TEST]', classId });
    check('game created with classId (game-launch button backend)', game.status === 201 && !!game.data.roomCode);
    if (game.status === 201) info(`game_sessions row roomCode=${game.data.roomCode} khong co endpoint xoa - se con lai sau khi test xong`);
  }

  info('2/4 nut (Quan ly tai lieu bai giang, Lien ket bai giang ngay) la dieu huong/DOM thuan client - khong co API tuong ung de test');

  // --- media stream auth (requireAuthFlexible) ---
  const noToken = await api('GET', '/media/does-not-exist/stream', null);
  check('stream: no token -> 401 NO_TOKEN', noToken.status === 401 && noToken.data.error?.code === 'NO_TOKEN');

  const badQueryToken = await fetch(`${BASE}/api/media/does-not-exist/stream?token=garbage`).then((r) => r.json().then((data) => ({ status: r.status, data })));
  check('stream: bad ?token= -> 401 BAD_TOKEN', badQueryToken.status === 401 && badQueryToken.data.error?.code === 'BAD_TOKEN');

  const validQueryToken = await fetch(`${BASE}/api/media/does-not-exist/stream?token=${encodeURIComponent(adminToken)}`).then((r) =>
    r.json().then((data) => ({ status: r.status, data }))
  );
  check('stream: valid ?token= passes auth -> 404 NOT_FOUND (not 401)', validQueryToken.status === 404 && validQueryToken.data.error?.code === 'NOT_FOUND');

  const validBearer = await api('GET', '/media/does-not-exist/stream', adminToken);
  check('stream: valid Bearer header still works -> 404 NOT_FOUND', validBearer.status === 404 && validBearer.data.error?.code === 'NOT_FOUND');
} finally {
  if (classId) {
    const del = await api('DELETE', `/classes/${classId}`, adminToken);
    info(`cleanup: deleted test class (cascades plan/items/sessions/records/enrollment) - ${del.status === 200 ? 'ok' : 'FAILED status ' + del.status}`);
  }
}

const pass = results.filter(Boolean).length;
console.log(`\nCURRICULUM TEST: ${pass}/${results.length} passed`);
process.exit(pass === results.length ? 0 : 1);

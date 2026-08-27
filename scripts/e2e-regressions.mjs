const base = process.env.BASE ?? 'http://127.0.0.1:4100';
let passed = 0;
let failed = 0;

function check(name, condition) {
  if (condition) {
    passed += 1;
    console.log(`  PASS  ${name}`);
  } else {
    failed += 1;
    console.error(`  FAIL  ${name}`);
  }
}

async function request(method, pathname, token, body) {
  const response = await fetch(`${base}/api${pathname}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let data = null;
  try { data = await response.json(); } catch { /* response without JSON */ }
  return { status: response.status, data };
}

async function login(username, password) {
  const result = await request('POST', '/auth/login', null, { username, password });
  return result.data?.token ?? '';
}

console.log('=== SECURITY AND DATA REGRESSION TEST ===');

const teacherToken = await login('teacher.hoa', 'Gv@654321');
const studentToken = await login('anh', 'Anh@123456');
const classes = await request('GET', '/classes/mine?includeArchived=1', teacherToken);
const classId = classes.data?.classes?.[0]?.id;
check('teacher and student test accounts ready', Boolean(teacherToken && studentToken && classId));

if (classId) {
  const subjects = await request('GET', `/classes/${classId}/subjects`, teacherToken);
  const subjectId = subjects.data?.subjects?.[0]?.id;
  const detail = await request('GET', `/classes/${classId}`, teacherToken);
  const studentId = detail.data?.students?.[0]?.id;

  const deniedPrepared = await request('POST', '/prepared-games', studentToken, {
    gameType: 'math_race', title: 'Không được phép', config: {}, questionIds: [], classId: null, subjectId: null,
  });
  check('student cannot create prepared game', deniedPrepared.status === 403);

  const lecture = await request('POST', `/classes/${classId}/lectures`, teacherToken, { chapter: 'Regression', title: 'Lecture link', description: '' });
  const plan = await request('POST', `/classes/${classId}/teaching-plans`, teacherToken, { name: 'Regression plan', description: '', subjectId });
  const item = await request('POST', `/teaching-plans/${plan.data?.id}/items`, teacherToken, {
    week: 1, chapter: 'Regression', topic: 'PATCH semantics', plannedPeriods: 2, lectureId: lecture.data?.id,
  });
  const complete = await request('PATCH', `/curriculum-items/${item.data?.id}`, teacherToken, { status: 'completed' });
  const unlink = await request('PATCH', `/curriculum-items/${item.data?.id}`, teacherToken, { lectureId: null });
  const readPlan = await request('GET', `/classes/${classId}/teaching-plans/${plan.data?.id}`, teacherToken);
  const savedItem = readPlan.data?.plan?.items?.find((entry) => entry.id === item.data?.id);
  check('curriculum status persists and completed periods sync', complete.status === 200 && savedItem?.status === 'completed' && savedItem?.completedPeriods === 2);
  check('curriculum lecture can be unlinked', unlink.status === 200 && savedItem?.lectureId === null);

  const invalidAttendanceDate = await request('POST', `/classes/${classId}/attendance/sessions`, teacherToken, {
    date: '2026-99-99', periodsTotal: 1,
  });
  check('invalid attendance date rejected', invalidAttendanceDate.status === 400);

  const attendance = await request('POST', `/classes/${classId}/attendance/sessions`, teacherToken, {
    date: '2026-08-28', periodsTotal: 1, teachingPlanItemId: item.data?.id,
  });
  const excessiveAbsent = await request('PUT', `/attendance/sessions/${attendance.data?.id}/records`, teacherToken, {
    records: [{ studentId, status: 'absent', periodsAbsent: 2, reason: '' }],
  });
  check('attendance cannot exceed session periods', excessiveAbsent.status === 400);

  const invalidRecurring = await request('POST', '/schedule/events/recurring', teacherToken, {
    title: 'Bad date', startDate: '2026-02-30', endDate: '2026-02-31', daysOfWeek: [1], startTime: '99:99', endTime: '99:99',
  });
  check('invalid recurring date and time rejected', invalidRecurring.status === 400);
  const validRecurring = await request('POST', '/schedule/events/recurring', teacherToken, {
    title: 'Valid recurrence', startDate: '2026-08-31', endDate: '2026-08-31', daysOfWeek: [1], startTime: '08:00', endTime: '09:00',
  });
  check('valid recurring date and time accepted', validRecurring.status === 201 && validRecurring.data?.createdCount === 1);

  const traversal = await request('POST', `/subjects/${subjectId}/pending-files/ingest`, teacherToken, {
    filenames: ['../../package.json'], mode: 'new-lecture-per-file',
  });
  check('material intake rejects path traversal', traversal.status === 200 && traversal.data?.created?.length === 0 && traversal.data?.errors?.length === 1);
}

console.log(`Regression result: ${passed} passed, ${failed} failed`);
if (failed) process.exit(1);

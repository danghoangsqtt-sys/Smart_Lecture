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

async function api(method, path, token, body) {
  const res = await fetch(`${BASE}/api${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

console.log('=== SUBJECTS + MATERIAL INTAKE API TEST ===');

const adminToken = await login('admin', 'admin123');
if (!adminToken) {
  console.error('FATAL: khong dang nhap duoc admin (admin/admin123) - kiem tra server dang chay tren', BASE);
  process.exit(1);
}

let classId = null;
try {
  // --- setup: disposable test class (auto-creates one default subject) ---
  const clsRes = await api('POST', '/classes', adminToken, {
    name: `[API-TEST-SUBJ] ${randomUUID().slice(0, 8)}`,
    subject: 'Toan',
    academicYear: '2026',
    totalPeriods: 10,
  });
  check('class created', clsRes.status === 201 && !!clsRes.data.class?.id);
  classId = clsRes.data.class?.id ?? null;
  if (!classId) throw new Error('khong tao duoc lop test');

  const listAfterCreate = await api('GET', `/classes/${classId}/subjects`, adminToken);
  check('class auto-created exactly one default subject', listAfterCreate.data.subjects?.length === 1);
  const defaultSubjectId = listAfterCreate.data.subjects?.[0]?.id ?? null;

  // --- subject CRUD ---
  const created = await api('POST', `/classes/${classId}/subjects`, adminToken, { name: 'Vat ly' });
  check('subject created', created.status === 201 && !!created.data.id);
  const subjectId = created.data.id ?? null;

  const listAfterAdd = await api('GET', `/classes/${classId}/subjects`, adminToken);
  check('subject list now has 2 subjects', listAfterAdd.data.subjects?.length === 2);

  if (subjectId) {
    const renamed = await api('PATCH', `/subjects/${subjectId}`, adminToken, { name: 'Vat ly dai cuong' });
    check('subject renamed', renamed.status === 200 && renamed.data.ok === true);

    const listAfterRename = await api('GET', `/classes/${classId}/subjects`, adminToken);
    check('renamed subject reflects new name', listAfterRename.data.subjects?.find((s) => s.id === subjectId)?.name === 'Vat ly dai cuong');
  }

  // --- teaching plan scoped to the new subject ---
  let planId = null;
  if (subjectId) {
    const plan = await api('POST', `/classes/${classId}/teaching-plans`, adminToken, { name: 'CT Vat ly', description: '', subjectId });
    check('teaching plan created under new subject', plan.status === 201 && !!plan.data.id);
    planId = plan.data.id ?? null;

    const badPlan = await api('POST', `/classes/${classId}/teaching-plans`, adminToken, { name: 'CT invalid', description: '', subjectId: 'not-a-real-id' });
    check('teaching plan with bogus subjectId rejected -> 400', badPlan.status === 400);
  }

  if (planId) {
    const planDetail = await api('GET', `/classes/${classId}/teaching-plans/${planId}`, adminToken);
    check('plan detail carries subjectId', planDetail.data.plan?.subjectId === subjectId);
  }

  // --- lecture scoped to the new subject ---
  let lectureId = null;
  if (subjectId) {
    const lecture = await api('POST', `/classes/${classId}/lectures`, adminToken, { title: 'Bai 1', chapter: '', description: '', subjectId });
    check('lecture created under new subject', lecture.status === 201 && !!lecture.data.id);
    lectureId = lecture.data.id ?? null;

    const lectures = await api('GET', `/classes/${classId}/lectures`, adminToken);
    const found = lectures.data.lectures?.find((l) => l.id === lectureId);
    check('lecture list shows correct subjectId', found?.subjectId === subjectId);
  }

  // --- delete-last-subject guard ---
  if (subjectId && defaultSubjectId) {
    const delDefault = await api('DELETE', `/subjects/${defaultSubjectId}`, adminToken);
    check('deleting one of two subjects succeeds', delDefault.status === 200 && delDefault.data.ok === true);

    const delLast = await api('DELETE', `/subjects/${subjectId}`, adminToken);
    check('deleting the last remaining subject rejected -> 400 LAST_SUBJECT', delLast.status === 400 && delLast.data.error?.code === 'LAST_SUBJECT');
  }

  // --- material intake: pending-files scan (drop folder starts empty, no filesystem setup here) ---
  const finalSubjectId = subjectId ?? defaultSubjectId;
  if (finalSubjectId) {
    const pending = await api('GET', `/subjects/${finalSubjectId}/pending-files`, adminToken);
    if (pending.status === 404) {
      info('GET /subjects/:id/pending-files -> 404: server dang chay code cu, chua nap materialIntake.routes.ts (can restart server de test day du)');
    } else {
      check('pending-files scan returns empty array (no files dropped in this test)', pending.status === 200 && Array.isArray(pending.data.files) && pending.data.files.length === 0);
      check('pending-files response includes dropPath', typeof pending.data.dropPath === 'string' && pending.data.dropPath.length > 0);

      const ingestNoFiles = await api('POST', `/subjects/${finalSubjectId}/pending-files/ingest`, adminToken, { filenames: [], mode: 'new-lecture-per-file' });
      check('ingest with empty filenames rejected -> 400', ingestNoFiles.status === 400);

      info('bo qua ingest tep that - can copy tep vao thu muc drop truoc, xem huong dan trong banner GIANG DAY');
    }
  }
} finally {
  if (classId) {
    const del = await api('DELETE', `/classes/${classId}`, adminToken);
    info(`cleanup: deleted test class (cascades subjects/plans/lectures) - ${del.status === 200 ? 'ok' : 'FAILED status ' + del.status}`);
  }
}

const pass = results.filter(Boolean).length;
console.log(`\nSUBJECTS TEST: ${pass}/${results.length} passed`);
process.exit(pass === results.length ? 0 : 1);

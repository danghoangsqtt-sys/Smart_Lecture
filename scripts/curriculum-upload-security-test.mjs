import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const dataDir = mkdtempSync(path.join(tmpdir(), 'smart-lecture-upload-test-'));
const port = 4800;
const base = `http://127.0.0.1:${port}`;
const env = {
  ...process.env,
  PORT: String(port), DATA_DIR: dataDir, DB_PATH: path.join(dataDir, 'upload.db'),
  MDNS_ENABLED: '0', SMARTLECTURE_TEST_MODE: '1',
};

const child = spawn(process.execPath, ['server/dist/index.js'], {
  cwd: root, env, stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
});
let output = '';
let ready = false;
child.stdout.on('data', (chunk) => {
  output = `${output}${chunk}`.slice(-10_000);
  if (output.includes(`[SmartLecture] Server dang chay tai port ${port}`)) ready = true;
});
child.stderr.on('data', (chunk) => { output = `${output}${chunk}`.slice(-10_000); });

async function waitForServer() {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null || child.signalCode !== null) throw new Error(`server exited early: ${output}`);
    if (ready) {
      try { if ((await fetch(`${base}/api/health`)).ok) return; } catch { /* starting */ }
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`server readiness timed out: ${output}`);
}

async function request(method, pathname, token, body) {
  const response = await fetch(`${base}/api${pathname}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: response.status, data: await response.json() };
}

async function upload(classId, subjectId, token, name, content, mime) {
  const form = new FormData();
  form.append('subjectId', subjectId);
  form.append('file', new Blob([content], { type: mime }), name);
  const response = await fetch(`${base}/api/classes/${classId}/curriculum-documents`, {
    method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form,
  });
  return { status: response.status, data: await response.json() };
}

function check(label, condition) {
  if (!condition) throw new Error(label);
  console.log(`PASS  ${label}`);
}

async function stopServer() {
  if (child.exitCode !== null || child.signalCode !== null) return;
  const code = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => { child.kill(); reject(new Error('upload test server shutdown timed out')); }, 10_000);
    child.once('exit', (exitCode) => { clearTimeout(timeout); resolve(exitCode); });
    if (child.connected) child.send('smartlecture:test-shutdown');
  });
  if (code !== 0) throw new Error(`upload test server exited with code ${code}: ${output}`);
}

try {
  console.log('=== curriculum upload security test ===');
  await waitForServer();
  const adminLogin = await request('POST', '/auth/login', '', { username: 'admin', password: 'admin123' });
  const changedAdmin = await request('POST', '/auth/change-password', adminLogin.data.token, {
    oldPassword: 'admin123', newPassword: 'Admin@123456',
  });
  const adminToken = changedAdmin.data.token;
  check('admin session rotates after first password change', changedAdmin.status === 200 && !!adminToken);

  const createdTeacher = await request('POST', '/users', adminToken, {
    username: 'upload.teacher', password: 'Upload@123456', role: 'teacher', displayName: 'Upload Teacher',
  });
  check('teacher created', createdTeacher.status === 201);
  const teacherLogin = await request('POST', '/auth/login', '', { username: 'upload.teacher', password: 'Upload@123456' });
  const changedTeacher = await request('POST', '/auth/change-password', teacherLogin.data.token, {
    oldPassword: 'Upload@123456', newPassword: 'Upload@654321',
  });
  const teacherToken = changedTeacher.data.token;
  check('teacher session rotates after first password change', changedTeacher.status === 200 && !!teacherToken);

  const createdStudent = await request('POST', '/users', teacherToken, {
    username: 'upload.student', password: 'Student@123456', role: 'student', displayName: 'Upload Student',
  });
  check('student created', createdStudent.status === 201);
  const studentLogin = await request('POST', '/auth/login', '', { username: 'upload.student', password: 'Student@123456' });
  const changedStudent = await request('POST', '/auth/change-password', studentLogin.data.token, {
    oldPassword: 'Student@123456', newPassword: 'Student@654321',
  });
  const studentToken = changedStudent.data.token;
  check('student session rotates after first password change', changedStudent.status === 200 && !!studentToken);

  const createdClass = await request('POST', '/classes', teacherToken, {
    name: 'Upload Security', subject: 'Security', academicYear: '2026-2027',
  });
  const classId = createdClass.data.class?.id;
  const subjects = await request('GET', `/classes/${classId}/subjects`, teacherToken);
  const subjectId = subjects.data.subjects?.[0]?.id;
  check('class and subject ready', createdClass.status === 201 && !!classId && !!subjectId);

  const spoofed = await upload(classId, subjectId, teacherToken, 'spoofed.pdf', 'not a pdf', 'application/pdf');
  check('spoofed PDF signature rejected', spoofed.status === 400);
  const valid = await upload(classId, subjectId, teacherToken, 'valid.pdf', '%PDF-1.4 fixture', 'text/html');
  const listed = await request('GET', `/classes/${classId}/curriculum-documents`, teacherToken);
  const row = listed.data.documents?.find((item) => item.id === valid.data.id);
  check('server persists canonical PDF MIME', valid.status === 201 && row?.mime_type === 'application/pdf');
  const denied = await upload(classId, subjectId, studentToken, 'learner.pdf', '%PDF-1.4 fixture', 'application/pdf');
  check('student upload denied', denied.status === 403);
  console.log('Curriculum upload security PASS');
} catch (error) {
  console.error(`Curriculum upload security FAIL: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
} finally {
  try { await stopServer(); }
  catch (error) {
    console.error(error);
    process.exitCode = 1;
  }
  if (child.exitCode !== null || child.signalCode !== null) rmSync(dataDir, { recursive: true, force: true });
  else console.error(`upload test server remains alive; data preserved at ${dataDir}`);
}

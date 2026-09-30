import { spawn } from 'node:child_process';
import { createServer, request as httpRequest } from 'node:http';
import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const dataDir = mkdtempSync(path.join(tmpdir(), 'smart-lecture-multipart-'));
const mediaDir = path.join(dataDir, 'media');
const port = await new Promise((resolve, reject) => {
  const probe = createServer();
  probe.once('error', reject);
  probe.listen(0, '127.0.0.1', () => {
    const address = probe.address();
    if (!address || typeof address === 'string') return reject(new Error('No test port'));
    probe.close(() => resolve(address.port));
  });
});
const base = `http://127.0.0.1:${port}/api`;
const child = spawn(process.execPath, ['server/dist/index.js'], {
  cwd: root,
  env: {
    ...process.env,
    PORT: String(port), DATA_DIR: dataDir, DB_PATH: path.join(dataDir, 'upload.db'),
    MDNS_ENABLED: '0', SMARTLECTURE_TEST_MODE: '1',
  },
  stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
});
let output = '';
child.stdout.on('data', (chunk) => { output += chunk; });
child.stderr.on('data', (chunk) => { output += chunk; });

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function until(predicate, label, timeout = 10_000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    if (child.exitCode !== null) throw new Error(`Server exited during ${label}: ${output}`);
    if (await predicate()) return;
    await delay(50);
  }
  throw new Error(`Timed out: ${label}. ${output}`);
}
function check(label, condition) {
  if (!condition) throw new Error(label);
  console.log(`PASS  ${label}`);
}
async function json(method, endpoint, token, body) {
  const response = await fetch(`${base}${endpoint}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: response.status, data: await response.json() };
}
async function multipart(endpoint, token, fields, filename = 'ok.pdf', content = '%PDF-1.4 fixture') {
  const form = new FormData();
  for (const [name, value] of fields) form.append(name, value);
  form.append('file', new Blob([content], { type: 'application/pdf' }), filename);
  const response = await fetch(`${base}${endpoint}`, {
    method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form,
  });
  return { status: response.status, data: await response.json() };
}
async function stopServer() {
  if (child.exitCode !== null || child.signalCode !== null) return;
  const code = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => { child.kill(); reject(new Error('Server shutdown timed out')); }, 10_000);
    child.once('exit', (exitCode) => { clearTimeout(timeout); resolve(exitCode); });
    if (child.connected) child.send('smartlecture:test-shutdown');
  });
  if (code !== 0) throw new Error(`Server exited with ${code}: ${output}`);
}

try {
  await until(async () => {
    try { return (await fetch(`${base}/health`)).ok; } catch { return false; }
  }, 'server startup');
  const login = await json('POST', '/auth/login', '', { username: 'admin', password: 'admin123' });
  const rotated = await json('POST', '/auth/change-password', login.data.token, {
    oldPassword: 'admin123', newPassword: 'Admin@123456',
  });
  const token = rotated.data.token;
  check('isolated administrator ready', rotated.status === 200 && !!token);

  const created = await json('POST', '/classes', token, {
    name: 'Multipart Security', subject: 'Security', academicYear: '2026-2027',
  });
  const classId = created.data.class?.id;
  const subjects = await json('GET', `/classes/${classId}/subjects`, token);
  const subjectId = subjects.data.subjects?.[0]?.id;
  check('class and subject ready', created.status === 201 && !!classId && !!subjectId);
  const endpoint = `/classes/${classId}/curriculum-documents`;
  const validFields = [['subjectId', subjectId], ['title', 'Valid title']];
  const valid = await multipart(endpoint, token, validFields);
  check('legitimate disk upload remains accepted', valid.status === 201 && !!valid.data.id);
  const removed = await json('DELETE', `/curriculum-documents/${valid.data.id}`, token);
  check('legitimate upload can be removed', removed.status === 200);

  for (const [label, fields] of [
    ['long field name', [[`unsafe${'x'.repeat(80)}`, 'secret-name'], ...validFields]],
    ['oversized array index', [['a[4294967294]', 'secret-index'], ...validFields]],
    ['nested field name', [['a[b][c]', 'secret-nested'], ...validFields]],
    ['excessive field count', [...validFields, ['extra', 'secret-extra']]],
  ]) {
    const result = await multipart(endpoint, token, fields);
    check(`${label} rejected without reflection`, result.status === 400 &&
      result.data.error?.code === 'INVALID_UPLOAD' &&
      !JSON.stringify(result.data).includes('secret-'));
  }

  const extraParts = new FormData();
  for (const [name, value] of validFields) extraParts.append(name, value);
  extraParts.append('file', new Blob(['%PDF-1.4 fixture']), 'one.pdf');
  extraParts.append('file', new Blob(['%PDF-1.4 fixture']), 'two.pdf');
  const partsResponse = await fetch(`${base}${endpoint}`, {
    method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: extraParts,
  });
  const partsBody = await partsResponse.json();
  check('excessive multipart parts rejected', partsResponse.status === 400 && partsBody.error?.code === 'INVALID_UPLOAD');

  const oversized = await multipart(`/classes/${classId}/import-students`, token, [], 'large.csv', Buffer.alloc(5 * 1024 * 1024 + 1));
  check('oversized file rejected as 413', oversized.status === 413 && oversized.data.error?.code === 'UPLOAD_TOO_LARGE');

  const before = readdirSync(mediaDir).sort();
  const boundary = 'smartlecture-abort-boundary';
  const abortRequest = httpRequest({
    hostname: '127.0.0.1', port, path: `/api${endpoint}`, method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': `multipart/form-data; boundary=${boundary}`,
      'Content-Length': String(1024 * 1024),
    },
  });
  abortRequest.on('error', () => {}); // expected ECONNRESET after deliberate client abort
  abortRequest.on('response', (response) => response.resume());
  abortRequest.write(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="aborted.pdf"\r\nContent-Type: application/pdf\r\n\r\n`);
  abortRequest.write(Buffer.alloc(128 * 1024, 0x61));
  await until(() => readdirSync(mediaDir).length > before.length, 'aborted upload reaches disk');
  abortRequest.destroy();
  await until(() => JSON.stringify(readdirSync(mediaDir).sort()) === JSON.stringify(before), 'aborted disk upload cleanup');
  check('aborted disk upload leaves no orphan', true);

  const health = await json('GET', '/health', '', undefined);
  check('process survives crafted and aborted uploads', health.status === 200 && health.data.ok === true);
  console.log('Multipart security PASS');
} catch (error) {
  console.error(`Multipart security FAIL: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
} finally {
  try { await stopServer(); }
  catch (error) { console.error(error); process.exitCode = 1; }
  if (child.exitCode !== null || child.signalCode !== null) rmSync(dataDir, { recursive: true, force: true });
  else console.error(`Server remains alive; test data preserved at ${dataDir}`);
}

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import bcrypt from 'bcryptjs';

const dataDir = mkdtempSync(path.join(tmpdir(), 'smartlecture-credentials-'));
process.env.DATA_DIR = dataDir;
process.env.DB_PATH = path.join(dataDir, 'credentials.db');

let server;
let passed = 0;
function check(condition, label, detail = '') {
  if (!condition) throw new Error(`${label}\n${detail}`);
  passed += 1;
  console.log(`PASS  ${label}`);
}

try {
  const [{ default: express }, { migrate, seedAdmin, db }, { default: authRoutes }, { default: usersRoutes }, { default: classesRoutes }, { authenticateSocket }] = await Promise.all([
    import('express'),
    import('../server/dist/db/connection.js').then(async (connection) => ({ ...connection, seedAdmin: (await import('../server/dist/db/seed.js')).seedAdmin })),
    import('../server/dist/routes/auth.routes.js'),
    import('../server/dist/routes/users.routes.js'),
    import('../server/dist/routes/classes.routes.js'),
    import('../server/dist/realtime/socketAuth.js'),
  ]);
  migrate();
  seedAdmin();

  const app = express();
  app.use(express.json());
  app.use('/api/auth', authRoutes);
  app.use('/api', usersRoutes);
  app.use('/api', classesRoutes);
  server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}/api`;

  async function json(method, pathname, token, body) {
    const response = await fetch(`${base}${pathname}`, {
      method,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { response, body: await response.json() };
  }
  async function login(username, password) {
    return json('POST', '/auth/login', '', { username, password });
  }

  const initialAdmin = await login('admin', 'admin123');
  const changedAdmin = await json('POST', '/auth/change-password', initialAdmin.body.token, { oldPassword: 'admin123', newPassword: 'Admin@123456' });
  const adminToken = changedAdmin.body.token;
  const createdClass = await json('POST', '/classes', adminToken, { name: 'Credential Class', subject: 'Security', academicYear: '2026-2027' });
  const classId = createdClass.body.class.id;

  const manual = await json('POST', '/users', adminToken, { username: 'manual.student', password: 'Manual@123', role: 'student', displayName: 'Manual Student', studentCode: 'CRED-MANUAL', classId });
  check(manual.response.status === 201 && manual.body.user.mustChangePassword === true, 'manual staff-created credential forces first password change');

  const imported = await json('POST', '/users/import', adminToken, { rows: [
    { username: 'json.blank', displayName: 'JSON Blank', studentCode: 'CRED-BLANK', classId },
    { username: 'json.explicit', displayName: 'JSON Explicit', password: 'Json@12345', studentCode: 'CRED-EXPLICIT', classId },
  ] });
  const blankCredential = imported.body.credentials.find((item) => item.username === 'json.blank');
  const explicitCredential = imported.body.credentials.find((item) => item.username === 'json.explicit');
  check(imported.response.status === 201 && imported.body.credentials.length === 2 && imported.response.headers.get('cache-control')?.includes('no-store'), 'JSON import returns new credentials once with no-store caching');
  check(blankCredential.temporaryPassword !== 'Hocvien@123' && blankCredential.temporaryPassword !== 'json.blank' && blankCredential.temporaryPassword.length >= 20, 'blank JSON password becomes a strong per-account random secret');
  check(explicitCredential.temporaryPassword === 'Json@12345', 'explicit JSON password remains a temporary handoff secret');

  const blankRow = db.prepare('SELECT password_hash, must_change_password FROM users WHERE username = ?').get('json.blank');
  const explicitRow = db.prepare('SELECT password_hash, must_change_password FROM users WHERE username = ?').get('json.explicit');
  check(blankRow.must_change_password === 1 && explicitRow.must_change_password === 1 && bcrypt.compareSync(blankCredential.temporaryPassword, blankRow.password_hash), 'JSON imports persist only hashes and require first change');

  const originalHash = blankRow.password_hash;
  const duplicate = await json('POST', '/users/import', adminToken, { rows: [{ username: 'json.blank', displayName: 'Existing', password: 'Replace@123', studentCode: 'CRED-BLANK', classId }] });
  const duplicateHash = db.prepare('SELECT password_hash FROM users WHERE username = ?').get('json.blank').password_hash;
  check(duplicate.response.status === 400 && duplicate.body.credentials.length === 0 && duplicateHash === originalHash, 'duplicate JSON import returns no credential and never replaces an existing password');

  const csv = [
    'Mã học viên,Tài khoản user,Họ và tên,Mật khẩu mặc định',
    'CRED-CSV-BLANK,csv.blank,CSV Blank,',
    'CRED-CSV-EXPLICIT,csv.explicit,CSV Explicit,Csv@12345',
    'CRED-BLANK,json.blank,Existing Student,Replace@456',
  ].join('\r\n');
  const form = new FormData();
  form.append('file', new Blob([csv], { type: 'text/csv' }), 'students.csv');
  const spreadsheetResponse = await fetch(`${base}/classes/${createdClass.body.class.id}/import-students`, {
    method: 'POST', headers: { Authorization: `Bearer ${adminToken}` }, body: form,
  });
  const spreadsheet = await spreadsheetResponse.json();
  const csvBlank = spreadsheet.credentials.find((item) => item.username === 'csv.blank');
  check(spreadsheetResponse.ok && spreadsheet.created === 2 && spreadsheet.credentials.length === 2 && spreadsheetResponse.headers.get('cache-control')?.includes('no-store'), 'CSV import returns credentials only for accounts created by this request');
  check(csvBlank.temporaryPassword !== 'csv.blank' && csvBlank.temporaryPassword !== blankCredential.temporaryPassword && spreadsheet.credentials.find((item) => item.username === 'csv.explicit')?.temporaryPassword === 'Csv@12345', 'CSV blank and explicit passwords follow the secure temporary policy');
  check(db.prepare('SELECT password_hash FROM users WHERE username = ?').get('json.blank').password_hash === originalHash, 'spreadsheet enrollment of an existing user preserves its password');

  const forcedLogin = await login('json.blank', blankCredential.temporaryPassword);
  const blockedMe = await json('GET', '/auth/me', forcedLogin.body.token);
  check(blockedMe.response.status === 403 && authenticateSocket({ handshake: { auth: { token: forcedLogin.body.token } }, request: { headers: {} } }) === null, 'temporary credential cannot access protected REST or Socket.IO');
  const changed = await json('POST', '/auth/change-password', forcedLogin.body.token, { oldPassword: blankCredential.temporaryPassword, newPassword: 'Owner@123456' });
  const currentMe = await json('GET', '/auth/me', changed.body.token);
  check(changed.response.ok && currentMe.response.ok && currentMe.body.user.mustChangePassword === false, 'first password replacement activates a renewed session');

  console.log(`Temporary credentials: ${passed}/11 passed`);
  db.close();
} finally {
  if (server) await new Promise((resolve) => server.close(resolve));
  rmSync(dataDir, { recursive: true, force: true });
}

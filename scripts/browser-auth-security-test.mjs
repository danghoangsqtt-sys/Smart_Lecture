import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const dataDir = mkdtempSync(path.join(tmpdir(), 'smartlecture-browser-auth-'));
process.env.DATA_DIR = dataDir;
process.env.DB_PATH = path.join(dataDir, 'smart-lecture.db');
process.env.SESSION_COOKIE_SECURE = 'false';

let server;
let passed = 0;
function check(condition, label, detail = '') {
  if (!condition) throw new Error(`${label}\n${detail}`);
  passed += 1;
  console.log(`PASS  ${label}`);
}

function cookiePair(response) {
  return response.headers.get('set-cookie')?.split(';', 1)[0] ?? '';
}

try {
  const [{ default: express }, { securityHeaders }, { migrate, db }, { seedAdmin }, { default: authRoutes }, { requireSameHostCookieOrigin }, { authenticateSocket }] = await Promise.all([
    import('express'),
    import('../server/dist/middleware/securityHeaders.js'),
    import('../server/dist/db/connection.js'),
    import('../server/dist/db/seed.js'),
    import('../server/dist/routes/auth.routes.js'),
    import('../server/dist/middleware/csrf.js'),
    import('../server/dist/realtime/socketAuth.js'),
  ]);
  migrate();
  seedAdmin();

  const app = express();
  app.use(securityHeaders);
  app.use(express.json());
  app.use('/api', requireSameHostCookieOrigin);
  app.get('/health', (_req, res) => res.json({ ok: true }));
  app.use('/api/auth', authRoutes);
  server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  const port = server.address().port;
  const base = `http://127.0.0.1:${port}`;
  const origin = base;

  const login = await fetch(`${base}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: origin },
    body: JSON.stringify({ username: 'admin', password: 'admin123' }),
  });
  const loginBody = await login.json();
  const initialCookie = cookiePair(login);
  const setCookie = login.headers.get('set-cookie') ?? '';
  check(login.ok && !('token' in loginBody) && initialCookie.startsWith('smartlecture_session='), 'browser login returns only public user data and an HttpOnly cookie');
  check(/HttpOnly/i.test(setCookie) && /SameSite=Strict/i.test(setCookie) && /Path=\//i.test(setCookie), 'session cookie has HttpOnly, SameSite=Strict and root path attributes');

  const crossOrigin = await fetch(`${base}/api/auth/change-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: initialCookie, Origin: 'http://evil.example' },
    body: JSON.stringify({ oldPassword: 'admin123', newPassword: 'Admin@123456' }),
  });
  check(crossOrigin.status === 403 && (await crossOrigin.json()).error?.code === 'CSRF_ORIGIN', 'cookie mutation rejects a cross-host Origin');

  const changed = await fetch(`${base}/api/auth/change-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: initialCookie, Origin: origin },
    body: JSON.stringify({ oldPassword: 'admin123', newPassword: 'Admin@123456' }),
  });
  const changedBody = await changed.json();
  const renewedCookie = cookiePair(changed);
  check(changed.ok && !('token' in changedBody) && renewedCookie, 'password change renews the cookie without exposing a bearer token');

  const stale = await fetch(`${base}/api/auth/me`, { headers: { Cookie: initialCookie } });
  const current = await fetch(`${base}/api/auth/me`, { headers: { Cookie: renewedCookie } });
  check(stale.status === 401 && current.ok, 'stale cookie is revoked while the renewed cookie remains valid');
  check(authenticateSocket({ handshake: { auth: {} }, request: { headers: { cookie: renewedCookie } } })?.userId, 'Socket.IO authenticates from the HttpOnly cookie');

  const apiLogin = await fetch(`${base}/api/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'Admin@123456' }),
  });
  const apiToken = (await apiLogin.json()).token;
  const apiRelogin = await fetch(`${base}/api/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookiePair(apiLogin) },
    body: JSON.stringify({ username: 'admin', password: 'Admin@123456' }),
  });
  const queryToken = await fetch(`${base}/api/auth/me?token=${encodeURIComponent(apiToken)}`);
  check(typeof apiToken === 'string' && apiRelogin.ok && queryToken.status === 401, 'non-browser API retains explicit Bearer/relogin mode but query-string tokens are rejected');

  const logout = await fetch(`${base}/api/auth/logout`, { method: 'POST', headers: { Cookie: renewedCookie, Origin: origin } });
  check(logout.ok && /Expires=Thu, 01 Jan 1970|Max-Age=0/i.test(logout.headers.get('set-cookie') ?? ''), 'logout clears the session cookie');

  const health = await fetch(`${base}/health`);
  const csp = health.headers.get('content-security-policy') ?? '';
  check(
    csp.includes("default-src 'self'") && !csp.includes('https:') && !csp.includes('upgrade-insecure-requests'),
    'Helmet CSP allows only enumerated local/data/blob/socket sources and preserves direct HTTP LAN access',
  );

  console.log(`Browser auth security: ${passed}/9 passed`);
  db.close();
} finally {
  if (server) await new Promise((resolve) => server.close(resolve));
  rmSync(dataDir, { recursive: true, force: true });
}

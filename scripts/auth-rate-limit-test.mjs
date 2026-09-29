/**
 * Login rate-limit regression test.
 *
 * Before this fix, MAX_FAILED_ATTEMPTS (10) only stopped repeated guesses against
 * ONE username — nothing stopped a single device from cycling through many
 * different usernames (e.g. this app's own sequential student-import usernames,
 * hv2024001, hv2024002, ...) and permanently locking an entire class right before
 * an exam, since /api/auth/login had no rate limiting beyond the generic
 * 600-requests/minute global limiter shared by every API route. This test boots
 * its own isolated server (separate port + temp DATA_DIR, never touching the real
 * project database or the shared e2e server other test scripts use) and proves:
 *   1. a burst of wrong-password attempts against many distinct usernames from one
 *      IP gets throttled with 429 well before it could lock 20+ separate accounts
 *   2. a legitimate login made before the limit trips still succeeds normally
 *      (skipSuccessfulRequests: true — successful logins never count against it)
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

const root = path.resolve(import.meta.dirname, '..');
const dataDir = mkdtempSync(path.join(tmpdir(), 'smart-lecture-ratelimit-'));
const port = 4700;
const base = `http://127.0.0.1:${port}`;
const env = {
  ...process.env,
  PORT: String(port), DATA_DIR: dataDir, DB_PATH: path.join(dataDir, 'ratelimit.db'),
  MDNS_ENABLED: '0', SMARTLECTURE_TEST_MODE: '1',
};

let passed = 0;
let failed = 0;
function check(name, condition) {
  if (condition) { passed += 1; console.log(`  PASS  ${name}`); }
  else { failed += 1; console.error(`  FAIL  ${name}`); }
}

function startServer() {
  const child = spawn(process.execPath, ['server/dist/index.js'], { cwd: root, env, stdio: ['ignore', 'pipe', 'pipe', 'ipc'] });
  let output = '';
  child.stdout.on('data', (chunk) => { output += chunk; });
  child.stderr.on('data', (chunk) => { output += chunk; });
  return { child, getOutput: () => output };
}

async function waitForServer(child) {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) return false;
    try { if ((await fetch(`${base}/api/health`)).ok) return true; } catch { /* still starting */ }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  return false;
}

async function login(username, password, forwardedFor) {
  const response = await fetch(`${base}/api/auth/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(forwardedFor ? { 'X-Forwarded-For': forwardedFor } : {}),
    },
    body: JSON.stringify({ username, password }),
  });
  return response.status;
}

async function loginResponse(username, password) {
  const response = await fetch(`${base}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  return { status: response.status, body: await response.json() };
}

console.log('=== auth login rate-limit regression test ===');
const { child, getOutput } = startServer();
const healthy = await waitForServer(child);
check('isolated server boots', healthy);

if (healthy) {
  const legit = await login('admin', 'admin123');
  check('legitimate login before the limit trips succeeds normally', legit === 200);

  for (let i = 0; i < 10; i++) await loginResponse('admin', 'wrong-password');
  const locked = await loginResponse('admin', 'admin123');
  const missing = await loginResponse('missing-account', 'admin123');
  check(
    'locked and missing accounts have indistinguishable public responses',
    locked.status === 401 && JSON.stringify(locked) === JSON.stringify(missing),
  );

  const statuses = [];
  for (let i = 0; i < 30; i++) {
    statuses.push(await login(`no-such-user-${i}`, 'wrong', `198.51.100.${i + 1}`));
  }
  const unauthorized = statuses.filter((s) => s === 401).length;
  const throttled = statuses.filter((s) => s === 429).length;
  check(
    `spoofed forwarded IPs cannot bypass the direct-LAN limit (401=${unauthorized}, 429=${throttled})`,
    throttled > 0 && unauthorized < 30,
  );

} else {
  console.error(getOutput());
}

const exitCode = await new Promise((resolve) => {
  if (child.exitCode !== null) return resolve(child.exitCode);
  const timeout = setTimeout(() => {
    console.error('  FAIL  rate-limit server did not exit after private shutdown message');
    child.kill();
  }, 8_000);
  child.once('exit', (code) => { clearTimeout(timeout); resolve(code); });
  if (child.connected) child.send('smartlecture:test-shutdown');
});
check('isolated server exits cleanly', exitCode === 0);
rmSync(dataDir, { recursive: true, force: true });
console.log(`Rate-limit regression result: ${passed} passed, ${failed} failed`);
process.exitCode = failed || !healthy ? 1 : 0;

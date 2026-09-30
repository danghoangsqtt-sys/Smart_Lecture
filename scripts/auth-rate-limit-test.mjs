/**
 * Network identity regression for direct LAN and explicitly trusted proxies.
 * Every server uses its own port and data directory; the installed app is untouched.
 */
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
let passed = 0;
let failed = 0;

function check(name, condition) {
  if (condition) { passed += 1; console.log(`  PASS  ${name}`); }
  else { failed += 1; console.error(`  FAIL  ${name}`); }
}

async function unusedPort() {
  return await new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const address = probe.address();
      if (!address || typeof address === 'string') return reject(new Error('No test port'));
      probe.close(() => resolve(address.port));
    });
  });
}

async function fixture(trustProxy) {
  const port = await unusedPort();
  const dataDir = mkdtempSync(path.join(tmpdir(), 'smart-lecture-ratelimit-'));
  const child = spawn(process.execPath, ['server/dist/index.js'], {
    cwd: root,
    env: {
      ...process.env,
      PORT: String(port), DATA_DIR: dataDir, DB_PATH: path.join(dataDir, 'ratelimit.db'),
      MDNS_ENABLED: '0', SMARTLECTURE_TEST_MODE: '1', TRUST_PROXY: trustProxy,
    },
    stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
  });
  let output = '';
  child.stdout.on('data', (chunk) => { output += chunk; });
  child.stderr.on('data', (chunk) => { output += chunk; });
  return { child, dataDir, base: `http://127.0.0.1:${port}`, getOutput: () => output };
}

async function waitForServer(server) {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    if (server.child.exitCode !== null) throw new Error(`Server exited: ${server.getOutput()}`);
    try { if ((await fetch(`${server.base}/api/health`)).ok) return; } catch { /* starting */ }
    await delay(100);
  }
  throw new Error(`Server startup timed out: ${server.getOutput()}`);
}

async function stopServer(server) {
  const { child } = server;
  if (child.exitCode === null && child.signalCode === null) {
    const code = await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => { child.kill(); reject(new Error('Rate-limit server shutdown timed out')); }, 10_000);
      child.once('exit', (exitCode) => { clearTimeout(timeout); resolve(exitCode); });
      if (child.connected) child.send('smartlecture:test-shutdown');
    });
    if (code !== 0) throw new Error(`Server exit ${code}: ${server.getOutput()}`);
  }
  if (child.exitCode !== null || child.signalCode !== null) rmSync(server.dataDir, { recursive: true, force: true });
}

async function withServer(trustProxy, action) {
  const server = await fixture(trustProxy);
  try {
    await waitForServer(server);
    await action(server.base);
  } finally {
    await stopServer(server);
  }
}

async function login(base, username, password, headers = {}) {
  const response = await fetch(`${base}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify({ username, password }),
  });
  return { status: response.status, body: await response.json() };
}

async function health(base, headers = {}) {
  const response = await fetch(`${base}/api/health`, { headers });
  await response.arrayBuffer();
  return response.status;
}

console.log('=== auth/global rate-limit and proxy-boundary regression test ===');
try {
  await withServer('', async (base) => {
    const legit = await login(base, 'admin', 'admin123');
    check('direct-LAN legitimate login succeeds', legit.status === 200);
    for (let i = 0; i < 10; i++) await login(base, 'admin', 'wrong-password');
    const locked = await login(base, 'admin', 'admin123');
    const missing = await login(base, 'missing-account', 'admin123');
    check('locked and missing accounts have indistinguishable public responses',
      locked.status === 401 && JSON.stringify(locked) === JSON.stringify(missing));

    const loginStatuses = [];
    for (let i = 0; i < 30; i++) {
      loginStatuses.push((await login(base, `no-such-user-${i}`, 'wrong', {
        'X-Forwarded-For': `198.51.100.${i + 1}`,
        Forwarded: `for=203.0.113.${i + 1}`,
      })).status);
    }
    check('direct-LAN login limiter ignores rotating forwarded identities',
      loginStatuses.includes(429) && loginStatuses.includes(401));

    const globalStatuses = [];
    for (let i = 0; i < 610; i++) {
      globalStatuses.push(await health(base, { 'X-Forwarded-For': `198.51.100.${i % 200 + 1}` }));
    }
    check('direct-LAN global limiter ignores rotating forwarded identities',
      globalStatuses.includes(429) && globalStatuses.includes(200));
  });

  await withServer('192.0.2.5/32', async (base) => {
    const statuses = [];
    for (let i = 0; i < 23; i++) {
      statuses.push((await login(base, `untrusted-${i}`, 'wrong', {
        'X-Forwarded-For': `198.51.100.${i + 1}`,
      })).status);
    }
    check('configured CIDR cannot trust a socket peer outside that CIDR',
      statuses.includes(429) && statuses.includes(401));
  });

  await withServer('127.0.0.1/32,10.0.0.5/32', async (base) => {
    const sharedClient = '198.51.100.70';
    const statuses = [];
    for (let i = 0; i < 23; i++) {
      statuses.push((await login(base, `trusted-${i}`, 'wrong', {
        'X-Forwarded-For': `203.0.113.${i + 1}, ${sharedClient}`,
      })).status);
    }
    check('trusted proxy uses nearest untrusted client, not spoofed leftmost hop',
      statuses.includes(429) && statuses.includes(401));
    const otherClient = await login(base, 'separate-client', 'wrong', {
      'X-Forwarded-For': '203.0.113.220, 198.51.100.71',
    });
    check('trusted proxy retains an independent client IP bucket', otherClient.status === 401);

    const globalStatuses = [];
    for (let i = 0; i < 610; i++) {
      globalStatuses.push(await health(base, {
        'X-Forwarded-For': `203.0.113.${i % 200 + 1}, ${sharedClient}`,
      }));
    }
    const otherHealth = await health(base, { 'X-Forwarded-For': '198.51.100.71' });
    check('trusted proxy global limit is per nearest untrusted client',
      globalStatuses.includes(429) && otherHealth === 200);
  });

  for (const invalid of ['true', '1', 'loopback', '0.0.0.0/0', '127.0.0.1/99']) {
    const server = await fixture(invalid);
    try {
      const exitCode = server.child.exitCode ?? await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => { server.child.kill(); reject(new Error('Invalid config did not fail startup')); }, 10_000);
        server.child.once('exit', (code) => { clearTimeout(timeout); resolve(code); });
      });
      check(`unsafe TRUST_PROXY=${invalid} fails startup`, exitCode !== 0 &&
        server.getOutput().includes('TRUST_PROXY must be'));
    } finally {
      if (server.child.exitCode !== null || server.child.signalCode !== null) {
        rmSync(server.dataDir, { recursive: true, force: true });
      }
    }
  }
} catch (error) {
  failed += 1;
  console.error(`  FAIL  ${error instanceof Error ? error.message : String(error)}`);
}
console.log(`Rate-limit regression result: ${passed} passed, ${failed} failed`);
process.exitCode = failed ? 1 : 0;

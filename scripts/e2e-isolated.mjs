import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

const root = path.resolve(import.meta.dirname, '..');
const dataDir = mkdtempSync(path.join(tmpdir(), 'smart-lecture-e2e-'));
const base = 'http://127.0.0.1:4100';
const env = {
  ...process.env,
  PORT: '4100',
  DATA_DIR: dataDir,
  DB_PATH: path.join(dataDir, 'e2e.db'),
};

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: root, env, stdio: 'inherit', shell: false });
    child.on('error', reject);
    child.on('exit', (code) => code === 0 ? resolve() : reject(new Error(`${command} exited with code ${code}`)));
  });
}

async function waitForServer() {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${base}/api/health`);
      if (response.ok) return;
    } catch {
      // Server is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error('E2E server did not become healthy within 30 seconds');
}

function powerShellCommand() {
  return process.platform === 'win32' ? 'powershell.exe' : 'pwsh';
}

function startServer() {
  const child = spawn(process.execPath, ['server/dist/index.js'], {
    cwd: root,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: false,
  });
  child.stdout.on('data', (chunk) => process.stdout.write(`[e2e-server] ${chunk}`));
  child.stderr.on('data', (chunk) => process.stderr.write(`[e2e-server] ${chunk}`));
  return child;
}

async function stopServer(child) {
  if (!child || child.exitCode !== null) return;
  child.kill();
  await new Promise((resolve) => {
    child.once('exit', resolve);
    setTimeout(resolve, 5_000);
  });
}

let server = startServer();

try {
  await waitForServer();
  await run(powerShellCommand(), ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', 'scripts/e2e-smoke.ps1']);
  await run(process.execPath, ['scripts/socket-test.mjs']);
  await run(process.execPath, ['scripts/e2e-regressions.mjs']);
  await stopServer(server);
  server = startServer();
  await waitForServer();
  if (existsSync(path.join(dataDir, 'restore-pending.db'))) {
    throw new Error('Staged restore was not applied after restart');
  }
  const loginResponse = await fetch(`${base}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'Admin@123456' }),
  });
  if (!loginResponse.ok) throw new Error('Restored database did not accept the admin login');
  console.log('Restore restart check PASS');
  console.log(`E2E isolated PASS (${dataDir})`);
} finally {
  await stopServer(server);
  rmSync(dataDir, { recursive: true, force: true });
}

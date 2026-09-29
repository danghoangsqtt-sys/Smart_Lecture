import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const dataDir = mkdtempSync(path.join(tmpdir(), 'smart-lecture-browser-'));
const port = 4300;
const env = {
  ...process.env,
  PORT: String(port), DATA_DIR: dataDir, DB_PATH: path.join(dataDir, 'browser.db'),
  PLAYWRIGHT_BASE_URL: `http://127.0.0.1:${port}`,
  PLAYWRIGHT_OUTPUT_DIR: path.join(dataDir, 'playwright-results'),
  MDNS_ENABLED: '0', SMARTLECTURE_TEST_MODE: '1',
};
if (process.platform === 'win32') env.PLAYWRIGHT_CHROMIUM_EXECUTABLE = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: root, env, stdio: 'inherit' });
    let timedOut = false;
    const timeout = setTimeout(() => { timedOut = true; child.kill(); }, 300_000);
    child.once('error', (error) => { clearTimeout(timeout); reject(error); });
    child.once('exit', (code) => {
      clearTimeout(timeout);
      if (timedOut) reject(new Error(`Browser E2E exceeded 300 seconds`));
      else if (code !== 0) reject(new Error(`${command} exited with ${code}`));
      else resolve();
    });
  });
}
async function waitForServer(server) {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (server.child.exitCode !== null || server.child.signalCode !== null) throw new Error(`Browser E2E server exited early: ${server.output}`);
    if (server.ready) {
      try { if ((await fetch(`${env.PLAYWRIGHT_BASE_URL}/api/health`)).ok) return; } catch { /* wait */ }
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Browser E2E server did not become healthy: ${server.output}`);
}

function startServer() {
  const server = { child: null, output: '', ready: false };
  const child = spawn(process.execPath, ['server/dist/index.js'], { cwd: root, env, stdio: ['ignore', 'pipe', 'pipe', 'ipc'] });
  server.child = child;
  child.stdout.on('data', (chunk) => {
    server.output = `${server.output}${chunk}`.slice(-10_000);
    if (server.output.includes(`[SmartLecture] Server dang chay tai port ${port}`)) server.ready = true;
    process.stdout.write(chunk);
  });
  child.stderr.on('data', (chunk) => {
    server.output = `${server.output}${chunk}`.slice(-10_000);
    process.stderr.write(chunk);
  });
  return server;
}

async function stopServer(server) {
  const { child } = server;
  if (child.exitCode !== null || child.signalCode !== null) return;
  const exitCode = await new Promise((resolve, reject) => {
    let forced = false;
    const timeout = setTimeout(() => { forced = true; child.kill(); }, 10_000);
    const killDeadline = setTimeout(() => reject(new Error('Browser E2E server did not exit after shutdown and kill')), 15_000);
    child.once('exit', (code) => {
      clearTimeout(timeout);
      clearTimeout(killDeadline);
      if (forced) reject(new Error('Browser E2E server required force-kill'));
      else resolve(code);
    });
    if (child.connected) child.send('smartlecture:test-shutdown');
  });
  if (exitCode !== 0) throw new Error(`Browser E2E server exited with ${exitCode}: ${server.output}`);
}

const server = startServer();
let passed = false;
try {
  await waitForServer(server);
  await run(process.execPath, ['node_modules/@playwright/test/cli.js', 'test']);
  passed = true;
} finally {
  try { await stopServer(server); }
  finally {
    if (passed && (server.child.exitCode !== null || server.child.signalCode !== null) && existsSync(dataDir)) {
      try { rmSync(dataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); }
      catch { console.warn(`Browser E2E evidence retained: ${dataDir}`); }
    } else {
      console.error(`Browser E2E evidence retained: ${dataDir}`);
    }
  }
}

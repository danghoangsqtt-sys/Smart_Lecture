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
  CIRCUIT_RESTART_STATE_PATH: path.join(dataDir, 'circuit-restart-state.json'),
  MDNS_ENABLED: '0',
  SMARTLECTURE_TEST_MODE: '1',
};
let activeStageChild = null;

function runStage(name, command, args, timeoutMs = 180_000) {
  console.log(`=== E2E stage: ${name} ===`);
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: root, env, stdio: 'inherit', shell: false });
    activeStageChild = child;
    let settled = false;
    let timedOut = false;
    let killDeadline;
    const finish = (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      clearTimeout(killDeadline);
      if (error) reject(error);
      else resolve();
    };
    const timeout = setTimeout(() => {
      timedOut = true;
      child.kill();
      killDeadline = setTimeout(() => finish(new Error(`E2E stage ${name} exceeded ${timeoutMs} ms and did not exit after kill`)), 5_000);
    }, timeoutMs);
    child.on('error', (error) => {
      activeStageChild = null;
      finish(new Error(`E2E stage ${name} failed to start: ${error.message}`));
    });
    child.on('exit', (code) => {
      activeStageChild = null;
      finish(timedOut ? new Error(`E2E stage ${name} exceeded ${timeoutMs} ms`) : code === 0 ? null : new Error(`E2E stage ${name} exited with code ${code}`));
    });
  });
}

async function waitForServer(server) {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (server.child.exitCode !== null || server.child.signalCode !== null || server.spawnError) {
      throw new Error(`E2E server exited before readiness: ${server.spawnError?.message ?? server.output}`);
    }
    if (!server.ready) {
      await new Promise((resolve) => setTimeout(resolve, 100));
      continue;
    }
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
  const server = { child: null, ready: false, output: '', spawnError: null };
  const child = spawn(process.execPath, ['server/dist/index.js'], {
    cwd: root,
    env,
    stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
    shell: false,
  });
  server.child = child;
  child.stdout.on('data', (chunk) => {
    server.output = `${server.output}${chunk}`.slice(-12_000);
    if (server.output.includes(`[SmartLecture] Server dang chay tai port ${env.PORT}`)) server.ready = true;
    process.stdout.write(`[e2e-server] ${chunk}`);
  });
  child.stderr.on('data', (chunk) => {
    server.output = `${server.output}${chunk}`.slice(-12_000);
    process.stderr.write(`[e2e-server] ${chunk}`);
  });
  child.on('error', (error) => { server.spawnError = error; });
  return server;
}

async function stopServer(server) {
  if (!server) return;
  const { child } = server;
  if (child.exitCode !== null || child.signalCode !== null) return;
  const exitCode = await new Promise((resolve, reject) => {
    let forced = false;
    const timeout = setTimeout(() => {
      forced = true;
      child.kill();
    }, 10_000);
    const killDeadline = setTimeout(() => reject(new Error('E2E server did not exit after private shutdown and kill')), 15_000);
    child.once('exit', (code) => {
      clearTimeout(timeout);
      clearTimeout(killDeadline);
      if (forced) reject(new Error('E2E server required force-kill after private shutdown'));
      else resolve(code);
    });
    if (child.connected) child.send('smartlecture:test-shutdown');
  });
  if (exitCode !== 0) throw new Error(`E2E server exited with code ${exitCode}: ${server.output}`);
}

let server = startServer();

try {
  await waitForServer(server);
  await runStage('upgrade-path', process.execPath, ['scripts/upgrade-path-test.mjs']);
  await runStage('mdns-resilience', process.execPath, ['scripts/mdns-resilience-test.mjs']);
  await runStage('spreadsheet-formula', process.execPath, ['scripts/spreadsheet-formula-injection-test.mjs']);
  await runStage('auth-rate-limit', process.execPath, ['scripts/auth-rate-limit-test.mjs']);
  await runStage('PowerShell smoke', powerShellCommand(), ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', 'scripts/e2e-smoke.ps1']);
  await runStage('excel-regression', process.execPath, ['scripts/e2e-excel-regression.mjs']);
  await runStage('socket', process.execPath, ['scripts/socket-test.mjs']);
  await runStage('game-lifecycle', process.execPath, ['scripts/game-lifecycle-test.mjs']);
  await runStage('API regressions', process.execPath, ['scripts/e2e-regressions.mjs']);
  await stopServer(server);
  server = startServer();
  await waitForServer(server);
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
  await runStage('circuit-restart prepare', process.execPath, ['scripts/circuit-restart-test.mjs', 'prepare']);
  await stopServer(server);
  server = startServer();
  await waitForServer(server);
  await runStage('circuit-restart verify', process.execPath, ['scripts/circuit-restart-test.mjs', 'verify']);
  console.log(`E2E isolated PASS (${dataDir})`);
} finally {
  try { await stopServer(server); }
  finally {
    if ((!activeStageChild || activeStageChild.exitCode !== null || activeStageChild.signalCode !== null)
        && (server.child.exitCode !== null || server.child.signalCode !== null)) {
      rmSync(dataDir, { recursive: true, force: true });
    } else {
      activeStageChild?.kill();
      console.error(`An E2E child remains alive; isolated data preserved at ${dataDir}`);
    }
  }
}

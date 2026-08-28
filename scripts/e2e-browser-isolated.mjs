import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const dataDir = mkdtempSync(path.join(tmpdir(), 'smart-lecture-browser-'));
const port = 4300;
const env = { ...process.env, PORT: String(port), DATA_DIR: dataDir, DB_PATH: path.join(dataDir, 'browser.db'), PLAYWRIGHT_BASE_URL: `http://127.0.0.1:${port}` };
if (process.platform === 'win32') env.PLAYWRIGHT_CHROMIUM_EXECUTABLE = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: root, env, stdio: 'inherit' });
    child.once('error', reject);
    child.once('exit', (code) => code === 0 ? resolve() : reject(new Error(`${command} exited with ${code}`)));
  });
}
async function waitForServer() {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    try { if ((await fetch(`${env.PLAYWRIGHT_BASE_URL}/api/health`)).ok) return; } catch { /* wait */ }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error('Browser E2E server did not become healthy');
}

const server = spawn(process.execPath, ['server/dist/index.js'], { cwd: root, env, stdio: 'inherit' });
try {
  await waitForServer();
  await run(process.execPath, ['node_modules/@playwright/test/cli.js', 'test']);
} finally {
  if (server.exitCode === null) {
    server.kill();
    await new Promise((resolve) => { server.once('exit', resolve); setTimeout(resolve, 5_000); });
  }
  if (existsSync(dataDir)) {
    try { rmSync(dataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); }
    catch { console.warn(`Browser E2E evidence retained: ${dataDir}`); }
  }
}

import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import JSZip from 'jszip';

const root = path.resolve(import.meta.dirname, '..');
const dataDir = mkdtempSync(path.join(tmpdir(), 'smart-lecture-backup-'));
const env = { ...process.env, DATA_DIR: dataDir, DB_PATH: path.join(dataDir, 'test.db'), PORT: '4400' };
Object.assign(process.env, env);

function check(name, condition) {
  if (!condition) throw new Error(`FAIL ${name}`);
  console.log(`PASS ${name}`);
}

async function waitForServer(child) {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`restore server exited ${child.exitCode}`);
    try { if ((await fetch('http://127.0.0.1:4400/api/health')).ok) return; } catch { /* wait */ }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error('restore server did not become healthy');
}

try {
  const { migrate, db } = await import('../server/dist/db/connection.js');
  const { createBackup, stageRestore } = await import('../server/dist/services/backup.js');
  migrate();
  const mediaDir = path.join(dataDir, 'media');
  const mediaName = 'restore-fixture.pdf';
  const original = Buffer.from('%PDF-1.4 restored media fixture');
  writeFileSync(path.join(mediaDir, mediaName), original);
  const first = await createBackup('manual');
  const second = await createBackup('manual');
  check('backups created consecutively have unique names', first !== second);
  writeFileSync(path.join(mediaDir, mediaName), Buffer.from('corrupted current media'));
  await stageRestore(first);
  check('database staged', existsSync(path.join(dataDir, 'restore-pending.db')));
  check('media staged', existsSync(path.join(dataDir, 'restore-pending-media', mediaName)));

  const malformed = new JSZip();
  malformed.file('smart-lecture.db', readFileSync(path.join(dataDir, 'restore-pending.db')));
  malformed.file('manifest.json', JSON.stringify({ media: [{ file: '../escape.pdf', size: 1, inZip: true }] }));
  malformed.file('media/escape.pdf', Buffer.from('x'));
  writeFileSync(path.join(dataDir, 'backups', 'backup-malformed.zip'), await malformed.generateAsync({ type: 'nodebuffer' }));
  await stageRestore('backup-malformed.zip').then(
    () => { throw new Error('unsafe manifest unexpectedly accepted'); },
    () => console.log('PASS unsafe manifest path rejected'),
  );

  await stageRestore(first);
  db.close();
  const server = spawn(process.execPath, ['server/dist/index.js'], { cwd: root, env, stdio: 'ignore' });
  try {
    await waitForServer(server);
    check('media restored with database at boot', readFileSync(path.join(mediaDir, mediaName)).equals(original));
    check('pending media directory consumed', !existsSync(path.join(dataDir, 'restore-pending-media')));
  } finally {
    server.kill();
    await new Promise((resolve) => { server.once('exit', resolve); setTimeout(resolve, 3000); });
  }
} finally {
  rmSync(dataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
}

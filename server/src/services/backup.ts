import JSZip from 'jszip';
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { BACKUP_DIR, DATA_DIR, MEDIA_DIR, RESTORE_PENDING_MEDIA_DIR, RESTORE_PENDING_PATH } from '../config.js';
import { db } from '../db/connection.js';
import { APP_VERSION } from '../version.js';

const KEEP_BACKUPS = 7;
const BACKUP_HOUR = Number(process.env.BACKUP_HOUR ?? 2);
const MAX_INLINE_MEDIA_MB = 20;

function timestamp(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}-${String(d.getMilliseconds()).padStart(3, '0')}`;
}

export async function createBackup(reason = 'auto'): Promise<string> {
  if (!existsSync(BACKUP_DIR)) mkdirSync(BACKUP_DIR, { recursive: true });

  const snapshotPath = path.join(DATA_DIR, `snapshot-${Date.now()}.db`);
  db.exec(`VACUUM INTO '${snapshotPath.replace(/'/g, "''")}'`);

  try {
    const zip = new JSZip();
    zip.file('smart-lecture.db', readFileSync(snapshotPath));

    const mediaManifest: { file: string; size: number; mtime: string; inZip: boolean }[] = [];
    if (existsSync(MEDIA_DIR)) {
      for (const name of readdirSync(MEDIA_DIR)) {
        const full = path.join(MEDIA_DIR, name);
        const st = statSync(full);
        if (!st.isFile()) continue;
        const inZip = st.size <= MAX_INLINE_MEDIA_MB * 1024 * 1024;
        mediaManifest.push({ file: name, size: st.size, mtime: st.mtime.toISOString(), inZip });
        if (inZip) zip.folder('media')?.file(name, readFileSync(full));
      }
    }

    zip.file(
      'manifest.json',
      JSON.stringify(
        {
          createdAt: new Date().toISOString(),
          reason,
          appVersion: APP_VERSION,
          note: `Media >${MAX_INLINE_MEDIA_MB}MB chỉ ghi trong manifest — khôi phục bằng cách chép từ data/media/ hiện tại.`,
          mediaCount: mediaManifest.length,
          media: mediaManifest,
        },
        null,
        2
      )
    );

    const content = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
    const outName = `backup-${timestamp()}-${reason}.zip`;
    writeFileSync(path.join(BACKUP_DIR, outName), content, { flag: 'wx' });
    pruneOldBackups();
    return outName;
  } finally {
    try {
      unlinkSync(snapshotPath);
    } catch {
      /* ignore */
    }
  }
}

function pruneOldBackups(): void {
  for (const f of listBackups().slice(KEEP_BACKUPS)) {
    try {
      unlinkSync(path.join(BACKUP_DIR, f.name));
    } catch {
      /* ignore */
    }
  }
}

export function listBackups(): { name: string; size: number; createdAt: string }[] {
  if (!existsSync(BACKUP_DIR)) return [];
  return readdirSync(BACKUP_DIR)
    .filter((f) => f.startsWith('backup-') && f.endsWith('.zip'))
    .map((name) => {
      const st = statSync(path.join(BACKUP_DIR, name));
      return { name, size: st.size, createdAt: st.mtime.toISOString() };
    })
    .sort((a, b) => b.name.localeCompare(a.name));
}

function resolveBackup(name: string): string {
  if (!/^backup-[A-Za-z0-9_.-]+\.zip$/.test(name) || path.basename(name) !== name) {
    throw new Error('Tên bản sao lưu không hợp lệ');
  }
  const item = listBackups().find((backup) => backup.name === name);
  if (!item) throw new Error('Không tìm thấy bản sao lưu');
  return path.join(BACKUP_DIR, item.name);
}

export function deleteBackup(name: string): void {
  unlinkSync(resolveBackup(name));
}

export async function stageRestore(name: string): Promise<void> {
  const zip = await JSZip.loadAsync(readFileSync(resolveBackup(name)));
  const dbEntry = zip.file('smart-lecture.db');
  if (!dbEntry) throw new Error('Bản sao lưu không chứa smart-lecture.db');
  const content = await dbEntry.async('nodebuffer');
  if (content.subarray(0, 16).toString('utf8') !== 'SQLite format 3\u0000') {
    throw new Error('Cơ sở dữ liệu trong bản sao lưu không hợp lệ');
  }
  const manifestEntry = zip.file('manifest.json');
  if (!manifestEntry) throw new Error('Backup is missing manifest.json');
  const manifest = JSON.parse(await manifestEntry.async('string')) as {
    media?: Array<{ file?: unknown; size?: unknown; inZip?: unknown }>;
  };
  if (!Array.isArray(manifest.media)) throw new Error('Backup media manifest is invalid');

  const stagedMediaTemporary = `${RESTORE_PENDING_MEDIA_DIR}.tmp`;
  rmSync(stagedMediaTemporary, { recursive: true, force: true });
  mkdirSync(stagedMediaTemporary, { recursive: true });
  try {
    for (const item of manifest.media) {
      if (item.inZip !== true) continue;
      if (typeof item.file !== 'string' || path.basename(item.file) !== item.file || !/^[A-Za-z0-9._-]+$/.test(item.file)) {
        throw new Error('Backup manifest contains an unsafe media path');
      }
      if (!Number.isSafeInteger(item.size) || Number(item.size) < 0) throw new Error('Backup manifest contains an invalid media size');
      const entry = zip.file(`media/${item.file}`);
      if (!entry) throw new Error(`Backup is missing media: ${item.file}`);
      const mediaContent = await entry.async('nodebuffer');
      if (mediaContent.length !== item.size) throw new Error(`Backup media size mismatch: ${item.file}`);
      writeFileSync(path.join(stagedMediaTemporary, item.file), mediaContent, { flag: 'wx' });
    }

    const databaseTemporary = `${RESTORE_PENDING_PATH}.tmp`;
    writeFileSync(databaseTemporary, content, { flag: 'w' });
    rmSync(RESTORE_PENDING_MEDIA_DIR, { recursive: true, force: true });
    renameSync(stagedMediaTemporary, RESTORE_PENDING_MEDIA_DIR);
    renameSync(databaseTemporary, RESTORE_PENDING_PATH);
  } catch (error) {
    rmSync(stagedMediaTemporary, { recursive: true, force: true });
    throw error;
  }
}

let lastBackupDay = '';

export function startBackupScheduler(): () => void {
  const timer = setInterval(() => {
    const now = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    if (now.getHours() === BACKUP_HOUR && lastBackupDay !== today) {
      createBackup('daily')
        .then((name) => {
          lastBackupDay = today;
          console.log(`[backup] created ${name}`);
        })
        .catch((err) => console.error('[backup] failed:', err));
    }
  }, 60_000);
  return () => clearInterval(timer);
}

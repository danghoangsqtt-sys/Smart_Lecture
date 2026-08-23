import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const DATA_DIR = path.resolve(__dirname, '../../data');
export const MEDIA_DIR = path.join(DATA_DIR, 'media');
export const BACKUP_DIR = path.join(DATA_DIR, 'backups');
export const DB_PATH = path.join(DATA_DIR, 'smart-lecture.db');
export const WEB_DIST_DIR = path.resolve(__dirname, '../../web/dist');

export const PORT = Number(process.env.PORT ?? 4000);

export const NETWORK_INTERFACES: { name: string; address: string }[] = (() => {
  const result: { name: string; address: string }[] = [];
  for (const [name, infos] of Object.entries(os.networkInterfaces())) {
    for (const info of infos ?? []) {
      if (info.family === 'IPv4' && !info.internal) {
        result.push({ name, address: info.address });
      }
    }
  }
  return result;
})();

for (const dir of [DATA_DIR, MEDIA_DIR, BACKUP_DIR]) {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

function loadSecretKey(): Buffer {
  const secretPath = path.join(DATA_DIR, 'secret.key');
  if (existsSync(secretPath)) {
    return readFileSync(secretPath);
  }
  const secret = randomBytes(64);
  writeFileSync(secretPath, secret, { mode: 0o600 });
  return secret;
}

export const JWT_SECRET = loadSecretKey();
export const JWT_EXPIRES_IN = '12h';

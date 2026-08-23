import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { db } from '../db/connection.js';
import { JWT_SECRET } from '../config.js';

const KEY = createHash('sha256').update(JWT_SECRET).digest();

function encrypt(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', KEY, iv);
  const encrypted = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), encrypted].map((b) => b.toString('base64')).join('.');
}

function decrypt(payload: string): string | null {
  try {
    const [ivB64, tagB64, dataB64] = payload.split('.');
    if (!ivB64 || !tagB64 || !dataB64) return null;
    const decipher = createDecipheriv('aes-256-gcm', KEY, Buffer.from(ivB64, 'base64'));
    decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
    return Buffer.concat([
      decipher.update(Buffer.from(dataB64, 'base64')),
      decipher.final(),
    ]).toString('utf8');
  } catch {
    return null;
  }
}

export function getSetting(key: string): string | null {
  const row = db.prepare('SELECT value_encrypted FROM app_settings WHERE key = ?').get(key) as
    | { value_encrypted: string | null }
    | undefined;
  if (!row?.value_encrypted) return null;
  return decrypt(row.value_encrypted);
}

export function setSetting(key: string, value: string): void {
  db.prepare(
    `INSERT INTO app_settings (key, value_encrypted, updated_at) VALUES (?, ?, datetime('now'))
     ON CONFLICT(key) DO UPDATE SET value_encrypted = excluded.value_encrypted, updated_at = excluded.updated_at`
  ).run(key, encrypt(value));
}

export function deleteSetting(key: string): void {
  db.prepare('DELETE FROM app_settings WHERE key = ?').run(key);
}

export function getGeminiApiKey(): string | null {
  return getSetting('gemini_api_key');
}

import { randomBytes } from 'node:crypto';

export interface OneTimeCredential {
  id: string;
  username: string;
  temporaryPassword: string;
}

/**
 * Request-local bootstrap secret. Callers must hash immediately and may return
 * it only in the create/import response that caused its creation.
 */
export function generateTemporaryPassword(): string {
  return `Sl!${randomBytes(18).toString('base64url')}`;
}

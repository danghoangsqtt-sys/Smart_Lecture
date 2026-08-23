import { execFile } from 'node:child_process';
import os from 'node:os';
import { Router } from 'express';
import { NETWORK_INTERFACES, PORT } from '../config.js';
import { requireAuth, requireRole, type AuthedRequest } from '../middleware/auth.js';
import { HttpError, h } from '../utils/errors.js';
import { createBackup, listBackups } from '../services/backup.js';

const router = Router();
router.use(requireAuth);

let mdnsAdvertised = false;
export let mdnsHostname = 'smart-lecture.local';

export function advertiseMdns(): void {
  try {
    import('bonjour-service')
      .then(({ Bonjour }) => {
        const bonjour = new Bonjour();
        bonjour.publish({ name: 'SmartLecture', type: 'http', host: mdnsHostname, port: PORT, txt: { app: 'smart-lecture' } });
        mdnsAdvertised = true;
        console.log(`[mdns] advertised http://${mdnsHostname}:${PORT}`);
      })
      .catch(() => {
        console.log('[mdns] bonjour-service not available — hostname mDNS bị bỏ qua');
      });
  } catch {
    console.log('[mdns] không quảng cáo được mDNS');
  }
}

let doclingAvailable: boolean | null = null;

export function isDoclingAvailable(): boolean {
  return doclingAvailable === true;
}

export function detectDocling(): Promise<boolean> {
  return new Promise((resolve) => {
    execFile('docling', ['--version'], { timeout: 8000 }, (err) => {
      doclingAvailable = !err;
      resolve(doclingAvailable);
    });
  });
}

router.get(
  '/system/info',
  h(async (req, res) => {
    const authed = req as AuthedRequest;
    if (authed.user?.role === 'student') throw new HttpError(403, 'FORBIDDEN', 'Chỉ giáo viên/quản trị xem thông tin hệ thống');
    if (doclingAvailable === null) await detectDocling();
    res.json({
      appVersion: '0.3.0',
      port: PORT,
      lanUrls: NETWORK_INTERFACES.map((i) => `http://${i.address}:${PORT}`),
      mdnsUrl: mdnsAdvertised ? `http://${mdnsHostname}:${PORT}` : null,
      hostname: os.hostname(),
      platform: `${os.type()} ${os.release()}`,
      doclingAvailable: doclingAvailable ?? false,
      backups: listBackups(),
      uptimeSec: Math.round(process.uptime()),
    });
  })
);

router.post(
  '/system/backup',
  requireRole('teacher', 'admin'),
  h(async (_req, res) => {
    const name = await createBackup('manual');
    res.json({ ok: true, name });
  })
);

router.get(
  '/system/backups',
  requireRole('teacher', 'admin'),
  h(async (_req, res) => {
    res.json({ backups: listBackups() });
  })
);

export default router;

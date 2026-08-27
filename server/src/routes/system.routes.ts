import { execFile } from 'node:child_process';
import os from 'node:os';
import { Router } from 'express';
import { NETWORK_INTERFACES, PORT } from '../config.js';
import { requireAuth, requireRole, type AuthedRequest } from '../middleware/auth.js';
import { HttpError, h } from '../utils/errors.js';
import { createBackup, deleteBackup, listBackups, stageRestore } from '../services/backup.js';
import { detectCloudflared, getTunnelUrl, isTunnelRunning, startTunnel, stopTunnel } from '../services/tunnel.js';

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

let libreOfficeAvailable: boolean | null = null;

export function isLibreOfficeAvailable(): boolean {
  return libreOfficeAvailable === true;
}

export function detectLibreOffice(): Promise<boolean> {
  return new Promise((resolve) => {
    execFile('soffice', ['--version'], { timeout: 8000 }, (err) => {
      libreOfficeAvailable = !err;
      resolve(libreOfficeAvailable);
    });
  });
}

router.get(
  '/info',
  h(async (req, res) => {
    const authed = req as AuthedRequest;
    if (authed.user?.role === 'student') throw new HttpError(403, 'FORBIDDEN', 'Chỉ giáo viên/quản trị xem thông tin hệ thống');
    if (doclingAvailable === null) await detectDocling();
    if (libreOfficeAvailable === null) await detectLibreOffice();
    res.json({
      appVersion: '0.3.0',
      port: PORT,
      lanUrls: NETWORK_INTERFACES.map((i) => `http://${i.address}:${PORT}`),
      mdnsUrl: mdnsAdvertised ? `http://${mdnsHostname}:${PORT}` : null,
      tunnelUrl: getTunnelUrl(),
      cloudflaredAvailable: await detectCloudflared(),
      hostname: os.hostname(),
      platform: `${os.type()} ${os.release()}`,
      doclingAvailable: doclingAvailable ?? false,
      libreOfficeAvailable: libreOfficeAvailable ?? false,
      backups: listBackups(),
      uptimeSec: Math.round(process.uptime()),
    });
  })
);

router.post(
  '/backup',
  requireRole('teacher', 'admin'),
  h(async (_req, res) => {
    const name = await createBackup('manual');
    res.json({ ok: true, name });
  })
);

router.get(
  '/backups',
  requireRole('teacher', 'admin'),
  h(async (_req, res) => {
    res.json({ backups: listBackups() });
  })
);

router.delete(
  '/backups/:name',
  requireRole('admin'),
  h(async (req, res) => {
    try {
      deleteBackup(String(req.params.name));
    } catch (error) {
      throw new HttpError(404, 'BACKUP_NOT_FOUND', error instanceof Error ? error.message : 'Không tìm thấy bản sao lưu');
    }
    res.json({ ok: true });
  })
);

router.post(
  '/restore/:name',
  requireRole('admin'),
  h(async (req, res) => {
    try {
      await stageRestore(String(req.params.name));
    } catch (error) {
      throw new HttpError(400, 'RESTORE_INVALID', error instanceof Error ? error.message : 'Không thể chuẩn bị khôi phục');
    }
    res.json({ ok: true, restartRequired: true, message: 'Đã chuẩn bị khôi phục. Khởi động lại máy chủ để áp dụng.' });
  })
);

router.post(
  '/tunnel',
  requireRole('teacher', 'admin'),
  h(async (req, res) => {
    const enable = req.body?.enable === true;
    if (!enable) {
      stopTunnel();
      res.json({ enabled: false });
      return;
    }
    const result = await startTunnel(PORT);
    if (!result.ok) throw new HttpError(400, 'TUNNEL_FAILED', result.error ?? 'Không mở được tunnel');
    res.json({ enabled: true, url: result.url });
  })
);

export default router;

import { execFile } from 'node:child_process';
import os from 'node:os';
import type { EventEmitter } from 'node:events';
import { Router } from 'express';
import { MDNS_ENABLED, NETWORK_INTERFACES, PORT } from '../config.js';
import { requireAuth, requireRole, type AuthedRequest } from '../middleware/auth.js';
import { HttpError, h } from '../utils/errors.js';
import { createBackup, deleteBackup, listBackups, stageRestore } from '../services/backup.js';
import { detectCloudflared, getTunnelUrl, startTunnel, stopTunnel } from '../services/tunnel.js';
import { APP_VERSION } from '../version.js';

const router = Router();
router.use(requireAuth);

let mdnsAdvertised = false;
export const mdnsHostname = 'smart-lecture.local';

// bonjour-service exposes no public API for the underlying multicast-dns socket's
// 'error' event (EACCES/EADDRINUSE on the shared UDP 5353 port — e.g. another
// SmartLecture instance already advertising on this LAN). With zero listeners
// Node rethrows that as an uncaught exception and kills the whole server
// (verified against node_modules/multicast-dns/index.js). `server`/`mdns` are
// private only in the .d.ts, not at runtime, so reach through that shape to
// attach a handler and keep this from ever crashing. Exported standalone so the
// crash-prevention itself can be regression-tested against a real Bonjour
// instance without booting the whole server.
type MdnsService = EventEmitter & { stop: (callback: () => void) => void; published?: boolean };
type MdnsClient = {
  server: { mdns: EventEmitter };
  publish: (options: { name: string; type: string; host: string; port: number; txt: { app: string } }) => MdnsService;
  destroy: (callback: () => void) => void;
};

export type MdnsController = { stop: () => Promise<void> };

export function attachMdnsSafetyNet(bonjour: unknown, onError?: (err: Error) => void): void {
  const mdnsSocket = (bonjour as { server: { mdns: EventEmitter } }).server.mdns;
  mdnsSocket.on('error', (err: Error) => {
    console.log(`[mdns] lỗi mạng, bỏ qua quảng cáo hostname: ${err.message}`);
    onError?.(err);
  });
}

export function advertiseMdns(
  createBonjour: () => Promise<MdnsClient> = async () => {
    const { Bonjour } = await import('bonjour-service');
    return new Bonjour() as unknown as MdnsClient;
  },
  confirmationTimeoutMs = 5000
): MdnsController {
  mdnsAdvertised = false;
  if (!MDNS_ENABLED) return { stop: async () => { mdnsAdvertised = false; } };

  let stopped = false;
  let bonjour: MdnsClient | undefined;
  let service: MdnsService | undefined;
  let upTimeout: ReturnType<typeof setTimeout> | undefined;
  let stopPromise: Promise<void> | undefined;

  const started = (async () => {
    try {
      const instance = await createBonjour();
      bonjour = instance;
      attachMdnsSafetyNet(instance, () => { void stop(); });
      if (stopped) return;
      service = instance.publish({ name: 'SmartLecture', type: 'http', host: mdnsHostname, port: PORT, txt: { app: 'smart-lecture' } });
      const onUp = () => {
        if (stopped) return;
        if (upTimeout) clearTimeout(upTimeout);
        mdnsAdvertised = true;
        console.log(`[mdns] advertised http://${mdnsHostname}:${PORT}`);
      };
      service.on('up', onUp);
      if (service.published) onUp();
      else {
        upTimeout = setTimeout(() => {
          if (stopped || mdnsAdvertised) return;
          console.log('[mdns] không xác nhận được quảng cáo hostname (có thể trùng tên trên LAN) — dùng IP LAN');
          void stop();
        }, confirmationTimeoutMs);
        upTimeout.unref();
      }
    } catch (error) {
      console.log(`[mdns] không quảng cáo được mDNS: ${error instanceof Error ? error.message : String(error)}`);
      void stop();
    }
  })();

  function stop(): Promise<void> {
    if (stopPromise) return stopPromise;
    stopped = true;
    mdnsAdvertised = false;
    if (upTimeout) clearTimeout(upTimeout);
    stopPromise = (async () => {
      await started;
      if (!bonjour) return;
      if (service) {
        await new Promise<void>((resolve) => {
          const timeout = setTimeout(resolve, 1000);
          try {
            service?.stop(() => { clearTimeout(timeout); resolve(); });
          } catch {
            clearTimeout(timeout);
            resolve();
          }
        });
      }
      await new Promise<void>((resolve) => {
        const timeout = setTimeout(resolve, 1000);
        try {
          bonjour?.destroy(() => { clearTimeout(timeout); resolve(); });
        } catch {
          clearTimeout(timeout);
          resolve();
        }
      });
    })();
    return stopPromise;
  }

  return { stop };
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
let libreOfficeDetection: Promise<boolean> | null = null;

export function isLibreOfficeAvailable(): boolean {
  return libreOfficeAvailable === true;
}

export function getLibreOfficeAvailability(): boolean | null {
  return libreOfficeAvailable;
}

export function detectLibreOffice(): Promise<boolean> {
  if (libreOfficeAvailable !== null) return Promise.resolve(libreOfficeAvailable);
  if (libreOfficeDetection) return libreOfficeDetection;
  libreOfficeDetection = new Promise((resolve) => {
    execFile('soffice', ['--version'], { timeout: 8000 }, (err) => {
      libreOfficeAvailable = !err;
      resolve(libreOfficeAvailable);
    });
  });
  void libreOfficeDetection.finally(() => { libreOfficeDetection = null; });
  return libreOfficeDetection;
}

router.get(
  '/info',
  h(async (req, res) => {
    const authed = req as AuthedRequest;
    if (authed.user?.role === 'student') throw new HttpError(403, 'FORBIDDEN', 'Chỉ giáo viên/quản trị xem thông tin hệ thống');
    if (doclingAvailable === null) await detectDocling();
    if (libreOfficeAvailable === null) await detectLibreOffice();
    res.json({
      appVersion: APP_VERSION,
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

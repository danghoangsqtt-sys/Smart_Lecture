import { spawn, type ChildProcess } from 'node:child_process';
import { execFile } from 'node:child_process';

let tunnelProcess: ChildProcess | null = null;
let tunnelUrl: string | null = null;
let cloudflaredAvailable: boolean | null = null;

export function isTunnelRunning(): boolean {
  return tunnelProcess !== null && tunnelUrl !== null;
}

export function getTunnelUrl(): string | null {
  return tunnelUrl;
}

export function detectCloudflared(): Promise<boolean> {
  if (cloudflaredAvailable !== null) return Promise.resolve(cloudflaredAvailable);
  return new Promise((resolve) => {
    execFile('cloudflared', ['--version'], { timeout: 8000 }, (err) => {
      cloudflaredAvailable = !err;
      resolve(cloudflaredAvailable);
    });
  });
}

export async function startTunnel(port: number): Promise<{ ok: boolean; url?: string; error?: string }> {
  if (tunnelProcess) return { ok: true, url: tunnelUrl ?? undefined };
  const available = await detectCloudflared();
  if (!available) {
    return {
      ok: false,
      error:
        'Chưa cài cloudflared. Tải tại https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/ và đảm bảo lệnh cloudflared nằm trong PATH.',
    };
  }

  return new Promise((resolve) => {
    const child = spawn('cloudflared', ['tunnel', '--url', `http://localhost:${port}`, '--no-autoupdate'], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let settled = false;
    const onData = (buf: Buffer): void => {
      const text = buf.toString();
      const match = text.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/i);
      if (match?.[0] && !settled) {
        settled = true;
        tunnelUrl = match[0];
        resolve({ ok: true, url: tunnelUrl! });
      }
    };
    child.stdout?.on('data', onData);
    child.stderr?.on('data', onData);
    child.on('exit', () => {
      tunnelProcess = null;
      tunnelUrl = null;
      if (!settled) {
        settled = true;
        resolve({ ok: false, error: 'cloudflared đã thoát bất ngờ' });
      }
    });
    setTimeout(() => {
      if (!settled) {
        settled = true;
        child.kill();
        resolve({ ok: false, error: 'Hết thời gian chờ kết nối tunnel (30s)' });
      }
    }, 30_000);
    tunnelProcess = child;
  });
}

export function stopTunnel(): void {
  tunnelProcess?.kill();
  tunnelProcess = null;
  tunnelUrl = null;
}

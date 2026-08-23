import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { useAuthStore } from '../stores/authStore';
import { Button, Card, Label, PageHeader } from '../components/ui';
import toast from '../stores/toastStore';

export default function SettingsPage() {
  const user = useAuthStore((s) => s.user);
  const isStaff = user?.role === 'admin' || user?.role === 'teacher';
  const [hasKey, setHasKey] = useState<boolean | null>(null);
  const [keyInput, setKeyInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [sys, setSys] = useState<SystemInfo | null>(null);
  const [backing, setBacking] = useState(false);

  useEffect(() => {
    if (!isStaff) return;
    void api<{ hasKey: boolean }>('/settings/gemini-key').then((r) => setHasKey(r.hasKey)).catch(() => setHasKey(false));
    void api<{ quota: { feature: string; used: number; limit: number }[] }>('/ai/quota')
      .then((r) => setQuota(r.quota))
      .catch(() => undefined);
    void api<SystemInfo>('/system/info').then(setSys).catch(() => undefined);
  }, [isStaff]);

  async function backupNow() {
    setBacking(true);
    try {
      const res = await api<{ name: string }>('/system/backup', { method: 'POST' });
      toast.success(`Đã tạo ${res.name}`);
      const s = await api<SystemInfo>('/system/info');
      setSys(s);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Lỗi');
    } finally {
      setBacking(false);
    }
  }

  interface SystemInfo {
    appVersion: string;
    hostname: string;
    platform: string;
    lanUrls: string[];
    mdnsUrl: string | null;
    doclingAvailable: boolean;
    uptimeSec: number;
    backups: { name: string; size: number; createdAt: string }[];
  }

  const [quota, setQuota] = useState<{ feature: string; used: number; limit: number }[]>([]);

  async function saveKey() {
    setBusy(true);
    try {
      await api('/settings/gemini-key', { method: 'PUT', body: JSON.stringify({ apiKey: keyInput }) });
      setHasKey(true);
      setKeyInput('');
      toast.success('Đã lưu API key (mã hóa AES-256 trên máy)');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Lỗi');
    } finally {
      setBusy(false);
    }
  }

  async function removeKey() {
    try {
      await api('/settings/gemini-key', { method: 'DELETE' });
      setHasKey(false);
      toast.info('Đã xóa API key');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Lỗi');
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <PageHeader title="Cài đặt" subtitle="Cấu hình AI và thông tin hệ thống" />

      {isStaff && (
        <Card className="p-5">
          <h3 className="mb-1 font-medium text-slate-200">Gemini API key (AI sinh câu hỏi, chấm bài)</h3>
          <p className="mb-3 text-xs text-slate-500">
            Lấy miễn phí tại aistudio.google.com → Get API key. Key được mã hóa AES-256-GCM và không bao giờ trả về trình duyệt.
          </p>
          {hasKey === null ? null : hasKey ? (
            <div className="flex items-center gap-3">
              <span className="rounded-lg bg-emerald-950 px-3 py-2 text-sm text-emerald-400 ring-1 ring-emerald-800">✓ Đã cấu hình</span>
              <Button variant="danger" onClick={() => void removeKey()}>Xóa key</Button>
            </div>
          ) : (
            <div className="flex gap-2">
              <input
                value={keyInput}
                onChange={(e) => setKeyInput(e.target.value)}
                placeholder="Dán API key…"
                type="password"
                className="flex-1 rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm"
              />
              <Button onClick={() => void saveKey()} disabled={busy || keyInput.length < 20}>Lưu</Button>
            </div>
          )}
          {quota.length > 0 && (
            <div className="mt-4">
              <Label>Ngạch AI hôm nay</Label>
              <ul className="space-y-1.5">
                {quota.map((q) => (
                  <li key={q.feature} className="text-xs">
                    <div className="mb-0.5 flex justify-between text-slate-400">
                      <span>{q.feature.replace('ai-', '')}</span>
                      <span>{q.used}/{q.limit}</span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-slate-800">
                      <div className={`h-full rounded-full ${q.used / q.limit > 0.8 ? 'bg-red-500' : 'bg-indigo-500'}`} style={{ width: `${Math.min(100, (q.used / q.limit) * 100)}%` }} />
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Card>
      )}

      <Card className="p-5">
        <h3 className="mb-2 font-medium text-slate-200">Hệ thống & sao lưu</h3>
        {sys === null ? (
          <p className="text-sm text-slate-500">Đang tải thông tin hệ thống…</p>
        ) : (
          <div className="space-y-3 text-sm">
            <ul className="space-y-1 text-slate-400">
              <li>• Phiên bản: <b className="text-slate-300">{sys.appVersion}</b> · máy: {sys.hostname} ({sys.platform})</li>
              <li>• Đã chạy: {Math.floor(sys.uptimeSec / 3600)}h {Math.floor((sys.uptimeSec % 3600) / 60)}m</li>
              <li>
                • Truy cập LAN:
                {sys.lanUrls.map((u) => (
                  <code key={u} className="ml-2 rounded bg-slate-800 px-1.5 py-0.5 text-indigo-300">{u}</code>
                ))}
                {sys.mdnsUrl && (
                  <>
                    {' '}· mDNS: <code className="rounded bg-slate-800 px-1.5 py-0.5 text-emerald-400">{sys.mdnsUrl}</code>
                  </>
                )}
              </li>
              <li>• Docling (PDF scan): {sys.doclingAvailable ? '✓ có sẵn — sẽ tự dùng cho PDF không có text' : 'chưa cài (tùy chọn)'}</li>
            </ul>

            <div>
              <div className="mb-2 flex items-center justify-between">
                <span className="font-medium text-slate-300">Bản sao lưu ({sys.backups.length}/7)</span>
                <Button onClick={() => void backupNow()} disabled={backing}>Tạo bản sao lưu ngay</Button>
              </div>
              {sys.backups.length === 0 ? (
                <p className="text-xs text-slate-500">Chưa có bản nào. Tự động chạy lúc {String(2).padStart(2, '0')}:00 hằng ngày, giữ 7 bản gần nhất.</p>
              ) : (
                <ul className="space-y-1 text-xs text-slate-400">
                  {sys.backups.map((b) => (
                    <li key={b.name} className="flex justify-between rounded-lg bg-slate-950/50 px-3 py-2 ring-1 ring-slate-800">
                      <span className="font-mono">{b.name}</span>
                      <span>{(b.size / 1024 / 1024).toFixed(2)} MB</span>
                    </li>
                  ))}
                </ul>
              )}
              <p className="mt-2 text-xs text-slate-600">Khôi phục: giải nén file zip → thay thế data/smart-lecture.db rồi khởi động lại server.</p>
            </div>
          </div>
        )}
      </Card>

      <Card className="p-5">
        <h3 className="mb-2 font-medium text-slate-200">Về SmartLecture</h3>
        <ul className="space-y-1 text-sm text-slate-400">
          <li>• Chạy nội bộ trên máy giáo viên — dữ liệu lưu SQLite tại thư mục data/</li>
          <li>• Học viên truy cập qua WiFi/LAN bằng trình duyệt, không cần cài đặt</li>
          <li>• Backup: sao chép nguyên thư mục data/ là đủ</li>
        </ul>
      </Card>
    </div>
  );
}

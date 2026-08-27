import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { useAuthStore } from '../stores/authStore';
import { Badge, Button, Card, Input, Label, PageHeader, Select } from '../components/ui';
import toast from '../stores/toastStore';

type AiProvider = 'cloud' | 'local' | 'auto';

interface SystemInfo {
  appVersion: string;
  hostname: string;
  platform: string;
  lanUrls: string[];
  mdnsUrl: string | null;
  tunnelUrl: string | null;
  cloudflaredAvailable: boolean;
  doclingAvailable: boolean;
  uptimeSec: number;
  backups: { name: string; size: number; createdAt: string }[];
}

interface AiQuota {
  feature: string;
  used: number;
  limit: number;
}

interface OllamaStatus {
  reachable: boolean;
  models: string[];
  error?: string;
}

export default function SettingsPage() {
  const user = useAuthStore((s) => s.user);
  const isStaff = user?.role === 'admin' || user?.role === 'teacher';
  const [hasKey, setHasKey] = useState<boolean | null>(null);
  const [keyInput, setKeyInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [sys, setSys] = useState<SystemInfo | null>(null);
  const [backing, setBacking] = useState(false);
  const [provider, setProvider] = useState<AiProvider>('cloud');
  const [ollamaBaseUrl, setOllamaBaseUrl] = useState('http://localhost:11434');
  const [ollamaModel, setOllamaModel] = useState('qwen2.5:7b-instruct-q4_K_M');
  const [providerBusy, setProviderBusy] = useState(false);
  const [checking, setChecking] = useState(false);
  const [ollamaStatus, setOllamaStatus] = useState<OllamaStatus | null>(null);

  useEffect(() => {
    if (!isStaff) return;
    void api<{ hasKey: boolean }>('/settings/gemini-key').then((r) => setHasKey(r.hasKey)).catch(() => setHasKey(false));
    void api<{ quota: { feature: string; used: number; limit: number }[] }>('/ai/quota')
      .then((r) => setQuota(r.quota))
      .catch(() => undefined);
    void api<SystemInfo>('/system/info').then(setSys).catch(() => undefined);
    void api<{ provider: AiProvider; ollamaBaseUrl: string; ollamaModel: string }>('/settings/ai-provider')
      .then((r) => { setProvider(r.provider); setOllamaBaseUrl(r.ollamaBaseUrl); setOllamaModel(r.ollamaModel); })
      .catch(() => undefined);
  }, [isStaff]);

  async function saveProvider() {
    setProviderBusy(true);
    try {
      await api('/settings/ai-provider', { method: 'PUT', body: JSON.stringify({ provider, ollamaBaseUrl, ollamaModel }) });
      toast.success('Đã lưu cấu hình AI');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Lỗi lưu cấu hình');
    } finally {
      setProviderBusy(false);
    }
  }

  async function checkOllama() {
    setChecking(true);
    setOllamaStatus(null);
    try {
      const res = await api<{ reachable: boolean; models: string[]; error?: string }>('/settings/ollama-status');
      setOllamaStatus(res);
    } catch (e) {
      setOllamaStatus({ reachable: false, models: [], error: e instanceof Error ? e.message : 'Lỗi' });
    } finally {
      setChecking(false);
    }
  }

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

  async function toggleTunnel(enable: boolean) {
    setTunnelBusy(true);
    try {
      const res = await api<{ enabled: boolean; url?: string }>('/system/tunnel', {
        method: 'POST',
        body: JSON.stringify({ enable }),
      });
      if (enable && res.url) toast.success(`Tunnel mở: ${res.url}`);
      else if (!enable) toast.info('Đã đóng tunnel');
      const s = await api<SystemInfo>('/system/info');
      setSys(s);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Lỗi tunnel');
    } finally {
      setTunnelBusy(false);
    }
  }

  const [tunnelBusy, setTunnelBusy] = useState(false);

  const [quota, setQuota] = useState<AiQuota[]>([]);

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
        <GeminiKeyCard
          hasKey={hasKey}
          keyInput={keyInput}
          busy={busy}
          quota={quota}
          onKeyInputChange={setKeyInput}
          onSave={() => void saveKey()}
          onRemove={() => void removeKey()}
        />
      )}
      {isStaff && (
        <AiProviderCard
          provider={provider}
          baseUrl={ollamaBaseUrl}
          model={ollamaModel}
          busy={providerBusy}
          checking={checking}
          status={ollamaStatus}
          onProviderChange={setProvider}
          onBaseUrlChange={setOllamaBaseUrl}
          onModelChange={setOllamaModel}
          onCheck={() => void checkOllama()}
          onSave={() => void saveProvider()}
        />
      )}
      {isStaff && (
        <SystemBackupCard
          system={sys}
          backing={backing}
          tunnelBusy={tunnelBusy}
          onBackup={() => void backupNow()}
          onToggleTunnel={(enable) => void toggleTunnel(enable)}
        />
      )}
      <AboutSmartLectureCard />
    </div>
  );
}

function GeminiKeyCard({
  hasKey,
  keyInput,
  busy,
  quota,
  onKeyInputChange,
  onSave,
  onRemove,
}: {
  hasKey: boolean | null;
  keyInput: string;
  busy: boolean;
  quota: AiQuota[];
  onKeyInputChange: (value: string) => void;
  onSave: () => void;
  onRemove: () => void;
}) {
  return (
    <Card className="p-5">
      <h3 className="mb-1 font-bold text-slate-800">Gemini API key (AI sinh câu hỏi, chấm bài)</h3>
      <p className="mb-3 text-xs text-slate-500">
        Lấy miễn phí tại aistudio.google.com → Get API key. Key được mã hóa AES-256-GCM và không bao giờ trả về trình duyệt.
      </p>
      {hasKey === null ? null : hasKey ? (
        <div className="flex items-center gap-3">
          <Badge tone="green"><i className="fas fa-check" /> Đã cấu hình</Badge>
          <Button variant="danger" onClick={onRemove}>Xóa key</Button>
        </div>
      ) : (
        <div className="flex gap-2">
          <Input
            value={keyInput}
            onChange={(event) => onKeyInputChange(event.target.value)}
            placeholder="Dán API key…"
            type="password"
            className="flex-1"
          />
          <Button onClick={onSave} disabled={busy || keyInput.length < 20}>Lưu</Button>
        </div>
      )}
      {quota.length > 0 && (
        <div className="mt-4">
          <Label>Ngạch AI hôm nay</Label>
          <ul className="space-y-1.5">
            {quota.map((item) => {
              const ratio = item.limit > 0 ? item.used / item.limit : 0;
              return (
                <li key={item.feature} className="text-xs">
                  <div className="mb-0.5 flex justify-between text-slate-500">
                    <span>{item.feature.replace('ai-', '')}</span>
                    <span>{item.used}/{item.limit}</span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-slate-200">
                    <div className={`h-full rounded-full ${ratio > 0.8 ? 'bg-red-600' : 'bg-blue-900'}`} style={{ width: `${Math.min(100, ratio * 100)}%` }} />
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </Card>
  );
}

function AiProviderCard({
  provider,
  baseUrl,
  model,
  busy,
  checking,
  status,
  onProviderChange,
  onBaseUrlChange,
  onModelChange,
  onCheck,
  onSave,
}: {
  provider: AiProvider;
  baseUrl: string;
  model: string;
  busy: boolean;
  checking: boolean;
  status: OllamaStatus | null;
  onProviderChange: (provider: AiProvider) => void;
  onBaseUrlChange: (value: string) => void;
  onModelChange: (value: string) => void;
  onCheck: () => void;
  onSave: () => void;
}) {
  return (
    <Card className="p-5">
      <h3 className="mb-1 font-bold text-slate-800">Nhà cung cấp AI</h3>
      <p className="mb-3 text-xs text-slate-500">Chọn AI đám mây (Gemini) hoặc cục bộ trên máy này (Ollama), có thể hoạt động hoàn toàn ngoại tuyến.</p>
      <div className="space-y-3">
        <div>
          <Label>Chế độ</Label>
          <Select value={provider} onChange={(event) => onProviderChange(event.target.value as AiProvider)}>
            <option value="cloud">Đám mây (Gemini)</option>
            <option value="local">Cục bộ (Ollama, ngoại tuyến)</option>
            <option value="auto">Tự động (ưu tiên cục bộ, dự phòng đám mây)</option>
          </Select>
        </div>
        {provider !== 'cloud' && (
          <>
            <div><Label>Địa chỉ Ollama</Label><Input value={baseUrl} onChange={(event) => onBaseUrlChange(event.target.value)} placeholder="http://localhost:11434" /></div>
            <div>
              <Label>Model</Label>
              <Input value={model} onChange={(event) => onModelChange(event.target.value)} placeholder="qwen2.5:7b-instruct-q4_K_M" />
              <p className="mt-1 text-xs text-slate-400">
                Gợi ý: <code className="rounded-sm border border-slate-200 bg-slate-100 px-1 text-slate-700">ollama pull qwen2.5:7b-instruct-q4_K_M</code> cho GPU khoảng 4GB.
              </p>
            </div>
            <div className="flex items-center gap-3">
              <Button variant="secondary" onClick={onCheck} disabled={checking}>{checking ? 'Đang kiểm tra…' : 'Kiểm tra kết nối'}</Button>
              {status && (status.reachable
                ? <Badge tone="green"><i className="fas fa-check" /> Kết nối OK — {status.models.length} model</Badge>
                : <Badge tone="red"><i className="fas fa-xmark" /> {status.error ?? 'Không kết nối được'}</Badge>
              )}
            </div>
            <p className="text-xs text-slate-400">Ollama cần đang chạy bằng <code className="rounded-sm border border-slate-200 bg-slate-100 px-1 text-slate-700">ollama serve</code> trước khi kiểm tra.</p>
          </>
        )}
        <Button onClick={onSave} disabled={busy}>Lưu cấu hình AI</Button>
      </div>
    </Card>
  );
}

function SystemBackupCard({
  system,
  backing,
  tunnelBusy,
  onBackup,
  onToggleTunnel,
}: {
  system: SystemInfo | null;
  backing: boolean;
  tunnelBusy: boolean;
  onBackup: () => void;
  onToggleTunnel: (enable: boolean) => void;
}) {
  return (
    <Card className="p-5">
      <h3 className="mb-2 font-bold text-slate-800">Hệ thống & sao lưu</h3>
      {system === null ? (
        <p className="text-sm text-slate-500">Đang tải thông tin hệ thống…</p>
      ) : (
        <div className="space-y-3 text-sm">
          <ul className="space-y-1 text-slate-500">
            <li>• Phiên bản: <b className="text-slate-700">{system.appVersion}</b> · máy: {system.hostname} ({system.platform})</li>
            <li>• Đã chạy: {Math.floor(system.uptimeSec / 3600)}h {Math.floor((system.uptimeSec % 3600) / 60)}m</li>
            <li>
              • Truy cập LAN:
              {system.lanUrls.map((url) => <code key={url} className="ml-2 rounded-sm border border-slate-200 bg-slate-100 px-1.5 py-0.5 text-blue-900">{url}</code>)}
              {system.mdnsUrl && <> · mDNS: <code className="rounded-sm border border-slate-200 bg-slate-100 px-1.5 py-0.5 text-emerald-700">{system.mdnsUrl}</code></>}
            </li>
            <li>• Docling (PDF scan): {system.doclingAvailable ? <span className="text-emerald-700"><i className="fas fa-check" /> có sẵn</span> : 'chưa cài (tùy chọn)'}</li>
          </ul>
          <TunnelSettings system={system} busy={tunnelBusy} onToggle={onToggleTunnel} />
          <BackupList system={system} backing={backing} onBackup={onBackup} />
        </div>
      )}
    </Card>
  );
}

function TunnelSettings({ system, busy, onToggle }: { system: SystemInfo; busy: boolean; onToggle: (enable: boolean) => void }) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <span className="font-medium text-slate-700">Truy cập từ nhà (cho BTVN)</span>
        {system.tunnelUrl
          ? <Button variant="danger" onClick={() => onToggle(false)} disabled={busy}>Đóng tunnel</Button>
          : <Button variant="secondary" onClick={() => onToggle(true)} disabled={busy}>{busy ? 'Đang mở…' : 'Mở tunnel công khai'}</Button>
        }
      </div>
      {system.tunnelUrl ? (
        <code className="block rounded-sm border border-emerald-200 bg-emerald-50 px-3 py-2 text-emerald-700">{system.tunnelUrl}</code>
      ) : (
        <p className="text-xs text-slate-500">
          {system.cloudflaredAvailable
            ? 'Mở kênh công khai tạm thời để học viên làm BTVN từ Internet. Tắt ngay sau khi giao bài.'
            : 'Cần cài cloudflared và thêm vào PATH trước khi mở tunnel.'}
        </p>
      )}
    </div>
  );
}

function BackupList({ system, backing, onBackup }: { system: SystemInfo; backing: boolean; onBackup: () => void }) {
  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <span className="font-medium text-slate-700">Bản sao lưu ({system.backups.length}/7)</span>
        <Button onClick={onBackup} disabled={backing}>Tạo bản sao lưu ngay</Button>
      </div>
      {system.backups.length === 0 ? (
        <p className="text-xs text-slate-500">Chưa có bản nào. Tự động chạy lúc 02:00 hằng ngày, giữ 7 bản gần nhất.</p>
      ) : (
        <ul className="space-y-1 text-xs text-slate-500">
          {system.backups.map((backup) => (
            <li key={backup.name} className="flex justify-between rounded-sm border border-slate-200 bg-slate-50 px-3 py-2">
              <span className="font-mono">{backup.name}</span>
              <span>{(backup.size / 1024 / 1024).toFixed(2)} MB</span>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-2 text-xs text-slate-400">Khôi phục bản sao lưu chỉ dành cho quản trị viên trong màn quản trị hệ thống.</p>
    </div>
  );
}

function AboutSmartLectureCard() {
  return (
    <Card className="p-5">
      <h3 className="mb-2 font-bold text-slate-800">Về SmartLecture</h3>
      <ul className="space-y-1 text-sm text-slate-500">
        <li>• Chạy nội bộ trên máy giáo viên — dữ liệu lưu SQLite trong thư mục data/</li>
        <li>• Học viên truy cập qua WiFi/LAN bằng trình duyệt, không cần cài đặt</li>
        <li>• Backup tự động hằng ngày và có thể tạo thủ công bởi giáo viên hoặc quản trị viên</li>
      </ul>
    </Card>
  );
}

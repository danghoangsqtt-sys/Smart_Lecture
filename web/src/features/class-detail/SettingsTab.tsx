import { useCallback, useEffect, useState } from 'react';
import { Button, Card, Input, Label, Modal } from '../../components/ui';
import { api } from '../../lib/api';
import toast from '../../stores/toastStore';
import type { ClassMeta, ClassSettings } from './types';

export function SettingsTab({ classId, cls, canManage, onSaved }: { classId: string; cls: ClassMeta; canManage: boolean; onSaved: () => Promise<void> }) {
  const [settings, setSettings] = useState<ClassSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [periodsOpen, setPeriodsOpen] = useState(false);
  const [periodsValue, setPeriodsValue] = useState(cls.totalPeriods);
  const [savingPeriods, setSavingPeriods] = useState(false);

  const loadSettings = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api<{ settings: ClassSettings }>(`/classes/${classId}/settings`);
      setSettings(res.settings);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Lỗi');
    } finally {
      setLoading(false);
    }
  }, [classId]);

  useEffect(() => { void loadSettings(); }, [loadSettings]);
  useEffect(() => { setPeriodsValue(cls.totalPeriods); }, [cls.totalPeriods]);

  async function saveSettings(next: ClassSettings) {
    try {
      await api(`/classes/${classId}/settings`, { method: 'PUT', body: JSON.stringify(next) });
      toast.success('Đã lưu cài đặt');
      setSettings(next);
      setSettingsOpen(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Lỗi');
    }
  }

  async function saveTotalPeriods() {
    setSavingPeriods(true);
    try {
      await api(`/classes/${classId}`, { method: 'PATCH', body: JSON.stringify({ totalPeriods: periodsValue }) });
      toast.success('Đã lưu tổng số tiết');
      setPeriodsOpen(false);
      await onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Lỗi');
    } finally {
      setSavingPeriods(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h4 className="font-semibold text-slate-700">Cài đặt chấm điểm & Game</h4>
        {canManage && settings && <Button variant="secondary" className="!py-1.5" onClick={() => setSettingsOpen(true)}>Sửa</Button>}
      </div>
      {loading || !settings ? (
        <p className="text-sm text-slate-500">Đang tải...</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Card className="p-4">
            <h5 className="mb-2 text-sm font-semibold text-slate-600">Trọng số điểm</h5>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between"><span>KTTX</span><span className="font-bold text-blue-900">{Math.round(settings.kttxWeight * 100)}%</span></div>
              <div className="flex justify-between"><span>Quá trình 1</span><span className="font-bold text-blue-900">{Math.round(settings.process1Weight * 100)}%</span></div>
              <div className="flex justify-between"><span>Cuối kỳ</span><span className="font-bold text-blue-900">{Math.round(settings.finalExamWeight * 100)}%</span></div>
            </div>
          </Card>
          <Card className="p-4">
            <h5 className="mb-2 text-sm font-semibold text-slate-600">Cài đặt Game</h5>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between"><span>Điểm mặc định / câu đúng</span><span className="font-bold">{settings.defaultGamePoints}</span></div>
              <div className="flex justify-between"><span>Giới hạn KTTX từ game</span><span className="font-bold">{settings.gamePointsCap}</span></div>
            </div>
          </Card>
          <Card className="p-4">
            <h5 className="mb-2 text-sm font-semibold text-slate-600">Nhóm tự động</h5>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between"><span>Tự tạo nhóm</span><span className="font-bold">{settings.autoCreateGroups ? 'Bật' : 'Tắt'}</span></div>
              <div className="flex justify-between"><span>Số nhóm mặc định</span><span className="font-bold">{settings.groupCount}</span></div>
            </div>
          </Card>
          <Card className="p-4">
            <div className="mb-2 flex items-center justify-between">
              <h5 className="text-sm font-semibold text-slate-600">Tổng số tiết</h5>
              {canManage && <button onClick={() => setPeriodsOpen(true)} className="text-xs font-semibold text-blue-700 hover:text-blue-900">Sửa</button>}
            </div>
            <p className="text-2xl font-bold text-blue-900">{cls.totalPeriods}</p>
            <p className="text-xs text-slate-400">Dùng để ước tính số tiết đã dạy ở tab Tiến độ</p>
          </Card>
        </div>
      )}
      {settingsOpen && settings && <SettingsModal onClose={() => setSettingsOpen(false)} settings={settings} onSave={saveSettings} />}
      {periodsOpen && (
        <Modal open onClose={() => setPeriodsOpen(false)} title="Tổng số tiết">
          <div className="space-y-3">
            <div><Label>Tổng số tiết của môn học</Label><Input type="number" min={0} max={999} value={periodsValue} onChange={(e) => setPeriodsValue(Number(e.target.value))} /></div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="ghost" onClick={() => setPeriodsOpen(false)} disabled={savingPeriods}>Hủy</Button>
              <Button onClick={() => void saveTotalPeriods()} disabled={savingPeriods}>Lưu</Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

function SettingsModal({ onClose, settings, onSave }: { onClose: () => void; settings: ClassSettings; onSave: (s: ClassSettings) => void }) {
  const [localSettings, setLocalSettings] = useState<ClassSettings>(settings);
  const totalWeight = Math.round((localSettings.kttxWeight + localSettings.process1Weight + localSettings.finalExamWeight) * 100);

  function update<K extends keyof ClassSettings>(key: K, value: ClassSettings[K]) {
    setLocalSettings((prev) => ({ ...prev, [key]: value }));
  }

  return (
    <Modal open onClose={onClose} title="Cài đặt lớp học" wide>
      <div className="space-y-4">
        <div className="border-b pb-4">
          <h5 className="mb-3 font-semibold text-slate-700">Trọng số điểm (tổng = 100%)</h5>
          <div className="grid gap-3 sm:grid-cols-3">
            <div><Label>KTTX (%)</Label><Input type="number" min={0} max={100} value={Math.round(localSettings.kttxWeight * 100)} onChange={(e) => update('kttxWeight', Number(e.target.value) / 100)} /></div>
            <div><Label>Quá trình 1 (%)</Label><Input type="number" min={0} max={100} value={Math.round(localSettings.process1Weight * 100)} onChange={(e) => update('process1Weight', Number(e.target.value) / 100)} /></div>
            <div><Label>Cuối kỳ (%)</Label><Input type="number" min={0} max={100} value={Math.round(localSettings.finalExamWeight * 100)} onChange={(e) => update('finalExamWeight', Number(e.target.value) / 100)} /></div>
          </div>
          <p className={`mt-2 text-xs ${totalWeight !== 100 ? 'text-red-600' : 'text-amber-600'}`}>Tổng hiện tại: {totalWeight}%</p>
        </div>
        <div className="border-b pb-4">
          <h5 className="mb-3 font-semibold text-slate-700">Cài đặt Game</h5>
          <div className="grid gap-3 sm:grid-cols-2">
            <div><Label>Điểm mặc định / câu đúng (0.25 - 2)</Label><Input type="number" step={0.25} min={0.25} max={2} value={localSettings.defaultGamePoints} onChange={(e) => update('defaultGamePoints', Number(e.target.value))} /></div>
            <div><Label>Giới hạn KTTX từ game (1 - 10)</Label><Input type="number" min={1} max={10} value={localSettings.gamePointsCap} onChange={(e) => update('gamePointsCap', Number(e.target.value))} /></div>
          </div>
        </div>
        <div>
          <h5 className="mb-3 font-semibold text-slate-700">Nhóm tự động</h5>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex items-center gap-2">
              <input aria-label="Tự động tạo nhóm khi bắt đầu game kéo co" type="checkbox" checked={localSettings.autoCreateGroups} onChange={(e) => update('autoCreateGroups', e.target.checked)} className="rounded border-slate-300 text-blue-900" />
              <Label>Tự động tạo nhóm khi bắt đầu game kéo co</Label>
            </div>
            <div><Label>Số nhóm mặc định (2 - 10)</Label><Input type="number" min={2} max={10} value={localSettings.groupCount} onChange={(e) => update('groupCount', Number(e.target.value))} /></div>
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={onClose}>Hủy</Button>
          <Button onClick={() => onSave(localSettings)} disabled={totalWeight !== 100}>Lưu cài đặt</Button>
        </div>
      </div>
    </Modal>
  );
}
